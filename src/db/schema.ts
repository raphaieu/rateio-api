import { sqliteTable, text, integer, index, real } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";

// -----------------------------------------------------------------------------
// Splits
// -----------------------------------------------------------------------------
export const splits = sqliteTable(
    "splits",
    {
        id: text("id").primaryKey(), // Using CUID or UUID at application level
        ownerClerkUserId: text("owner_clerk_user_id").notNull(),
        name: text("name"),
        status: text("status", { enum: ["DRAFT", "PAID"] })
            .notNull()
            .default("DRAFT"),
        receiptImageUrl: text("receipt_image_url"),
        latitude: real("latitude"),
        longitude: real("longitude"),
        placeProvider: text("place_provider"),
        placeId: text("place_id"),
        placeName: text("place_name"),
        placeDisplayName: text("place_display_name"),
        publicSlug: text("public_slug").unique(),
        createdAt: integer("created_at")
            .notNull()
            .default(sql`(unixepoch())`), // Storing as unix timestamp (seconds usually, ensuring consistency)
        updatedAt: integer("updated_at")
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => ({
        ownerIdx: index("splits_owner_idx").on(table.ownerClerkUserId),
        publicSlugIdx: index("splits_public_slug_idx").on(table.publicSlug),
    })
);

// -----------------------------------------------------------------------------
// Participants
// -----------------------------------------------------------------------------
export const participants = sqliteTable(
    "participants",
    {
        id: text("id").primaryKey(),
        splitId: text("split_id")
            .notNull()
            .references(() => splits.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        sortOrder: integer("sort_order").notNull().default(0),
    },
    (table) => ({
        splitIdx: index("participants_split_idx").on(table.splitId),
    })
);

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------
export const items = sqliteTable(
    "items",
    {
        id: text("id").primaryKey(),
        splitId: text("split_id")
            .notNull()
            .references(() => splits.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        amountCents: integer("amount_cents").notNull(), // Total cost of the item in cents
    },
    (table) => ({
        splitIdx: index("items_split_idx").on(table.splitId),
    })
);

// -----------------------------------------------------------------------------
// Item Shares (Many-to-Many between Items and Participants)
// -----------------------------------------------------------------------------
export const itemShares = sqliteTable(
    "item_shares",
    {
        itemId: text("item_id")
            .notNull()
            .references(() => items.id, { onDelete: "cascade" }),
        participantId: text("participant_id")
            .notNull()
            .references(() => participants.id, { onDelete: "cascade" }),
    },
    (table) => ({
        pk: index("item_shares_pk").on(table.itemId, table.participantId), // Composite index
    })
);

// -----------------------------------------------------------------------------
// Extras (Service fee, Couvert, etc.)
// -----------------------------------------------------------------------------
export const extras = sqliteTable(
    "extras",
    {
        id: text("id").primaryKey(),
        splitId: text("split_id")
            .notNull()
            .references(() => splits.id, { onDelete: "cascade" }),
        type: text("type", { enum: ["SERVICE_PERCENT", "FIXED"] }).notNull(),
        valueCents: integer("value_cents"), // Used if FIXED
        valuePercentBp: integer("value_percent_bp"), // Used if SERVICE_PERCENT (basis points: 1% = 100)
        allocationMode: text("allocation_mode", {
            enum: ["PROPORTIONAL", "EQUAL"],
        }).notNull(),
    },
    (table) => ({
        splitIdx: index("extras_split_idx").on(table.splitId),
    })
);

// -----------------------------------------------------------------------------
// Split Costs (Snapshot of costs)
// -----------------------------------------------------------------------------
export const splitCosts = sqliteTable("split_costs", {
    splitId: text("split_id")
        .primaryKey()
        .references(() => splits.id, { onDelete: "cascade" }),
    baseFeeCents: integer("base_fee_cents").notNull(),
    aiCents: integer("ai_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    createdAt: integer("created_at")
        .notNull()
        .default(sql`(unixepoch())`),
});

// -----------------------------------------------------------------------------
// Wallets
// -----------------------------------------------------------------------------
export const wallets = sqliteTable("wallets", {
    ownerClerkUserId: text("owner_clerk_user_id").primaryKey(),
    balanceCents: integer("balance_cents").notNull().default(0),
});

// -----------------------------------------------------------------------------
// Wallet Ledger
// -----------------------------------------------------------------------------
export const walletLedger = sqliteTable(
    "wallet_ledger",
    {
        id: text("id").primaryKey(),
        ownerClerkUserId: text("owner_clerk_user_id")
            .notNull()
            .references(() => wallets.ownerClerkUserId),
        type: text("type", { enum: ["TOPUP", "CHARGE"] }).notNull(),
        amountCents: integer("amount_cents").notNull(), // Positive value
        refType: text("ref_type", { enum: ["PAYMENT", "SPLIT_FEE"] }).notNull(),
        refId: text("ref_id").notNull(), // ID of payment or split
        createdAt: integer("created_at")
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => ({
        ownerIdx: index("wallet_ledger_owner_idx").on(table.ownerClerkUserId),
    })
);

// -----------------------------------------------------------------------------
// Payments
// -----------------------------------------------------------------------------
export const payments = sqliteTable(
    "payments",
    {
        id: text("id").primaryKey(),
        ownerClerkUserId: text("owner_clerk_user_id").notNull(),
        splitId: text("split_id").references(() => splits.id),
        status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
            .notNull()
            .default("PENDING"),
        amountCentsTotal: integer("amount_cents_total").notNull(), // Actual charged amount via PIX
        amountCentsSplitCost: integer("amount_cents_split_cost").notNull(), // Part covering the split cost
        amountCentsTopup: integer("amount_cents_topup").notNull().default(0), // Extra topup
        providerPaymentId: text("provider_payment_id"), // MP ID
        qrCode: text("qr_code"),
        qrCopyPaste: text("qr_copy_paste"),
        createdAt: integer("created_at")
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer("updated_at")
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => ({
        providerIdx: index("payments_provider_idx").on(table.providerPaymentId),
        splitIdx: index("payments_split_idx").on(table.splitId),
    })
);

// -----------------------------------------------------------------------------
// Relations
// -----------------------------------------------------------------------------

export const splitsRelations = relations(splits, ({ one, many }) => ({
    splitCosts: one(splitCosts),
    participants: many(participants),
    items: many(items),
    extras: many(extras),
    payments: many(payments),
}));

export const splitCostsRelations = relations(splitCosts, ({ one }) => ({
    split: one(splits, {
        fields: [splitCosts.splitId],
        references: [splits.id],
    }),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
    split: one(splits, {
        fields: [participants.splitId],
        references: [splits.id],
    }),
}));

export const itemsRelations = relations(items, ({ one }) => ({
    split: one(splits, {
        fields: [items.splitId],
        references: [splits.id],
    }),
}));

export const extrasRelations = relations(extras, ({ one }) => ({
    split: one(splits, {
        fields: [extras.splitId],
        references: [splits.id],
    }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
    split: one(splits, {
        fields: [payments.splitId],
        references: [splits.id],
    }),
}));
