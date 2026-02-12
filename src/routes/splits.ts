import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { splits, participants, items, itemShares, extras, splitCosts, payments } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { calculateSplit, ItemShareInput } from "../services/calculation.js";
import { WalletService } from "../services/wallet.js";

const app = new Hono<{ Variables: { clerkUserId: string } }>();

app.use("*", authMiddleware);

// -----------------------------------------------------------------------------
// GET /splits (List)
// -----------------------------------------------------------------------------
app.get("/", async (c) => {
    const userId = c.get("clerkUserId");
    const userSplits = await db.query.splits.findMany({
        where: eq(splits.ownerClerkUserId, userId),
        orderBy: (splits, { desc }) => [desc(splits.createdAt)],
        with: {
            participants: true,
            items: true
        }
    });
    return c.json(userSplits);
});

// -----------------------------------------------------------------------------
// GET /splits/:id
// -----------------------------------------------------------------------------
app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");

    const split = await db.query.splits.findFirst({
        where: eq(splits.id, id),
        with: {
            participants: { orderBy: (p, { asc }) => [asc(p.sortOrder)] },
            items: true,
            extras: true,
            splitCosts: true
        },
    });

    if (!split) return c.json({ error: "Split not found" }, 404);
    if (split.ownerClerkUserId !== userId) {
        return c.json({ error: "Unauthorized" }, 403);
    }

    // Fetch consumers
    const itemIds = split.items.map(i => i.id);
    let allShares: any[] = [];
    if (itemIds.length > 0) {
        allShares = await db.select().from(itemShares).where(inArray(itemShares.itemId, itemIds));
    }

    return c.json({ ...split, shares: allShares });
});

// -----------------------------------------------------------------------------
// PATCH /splits/:id
// -----------------------------------------------------------------------------
app.patch("/:id", zValidator("json", z.object({
    name: z.string().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    placeProvider: z.string().nullable().optional(),
    placeId: z.string().nullable().optional(),
    placeName: z.string().nullable().optional(),
    placeDisplayName: z.string().nullable().optional(),
})), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const {
        name,
        latitude,
        longitude,
        placeProvider,
        placeId,
        placeName,
        placeDisplayName,
    } = c.req.valid("json");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split) return c.json({ error: "Not found" }, 404);
    if (split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);

    const updates: Partial<typeof splits.$inferInsert> = {
        updatedAt: Math.floor(Date.now() / 1000),
    };

    if (name !== undefined) updates.name = name;
    if (latitude !== undefined) updates.latitude = latitude;
    if (longitude !== undefined) updates.longitude = longitude;
    if (placeProvider !== undefined) updates.placeProvider = placeProvider;
    if (placeId !== undefined) updates.placeId = placeId;
    if (placeName !== undefined) updates.placeName = placeName;
    if (placeDisplayName !== undefined) updates.placeDisplayName = placeDisplayName;

    // Only persist if there is at least one real field besides updatedAt
    if (
        updates.name !== undefined ||
        updates.latitude !== undefined ||
        updates.longitude !== undefined ||
        updates.placeProvider !== undefined ||
        updates.placeId !== undefined ||
        updates.placeName !== undefined ||
        updates.placeDisplayName !== undefined
    ) {
        await db.update(splits)
            .set(updates)
            .where(eq(splits.id, id));
    }

    return c.json({ success: true });
});

// -----------------------------------------------------------------------------
// DELETE /splits/:id
// -----------------------------------------------------------------------------
app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split) return c.json({ error: "Not found" }, 404);
    if (split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);

    await db.transaction(async (tx) => {
        // Delete shares/items (manual cleanup — do not rely on FK cascade being enabled)
        const existingItems = await tx.select({ id: items.id }).from(items).where(eq(items.splitId, id));
        const itemIds = existingItems.map(i => i.id);

        if (itemIds.length > 0) {
            await tx.delete(itemShares).where(inArray(itemShares.itemId, itemIds));
        }

        await tx.delete(items).where(eq(items.splitId, id));
        await tx.delete(participants).where(eq(participants.splitId, id));
        await tx.delete(extras).where(eq(extras.splitId, id));
        await tx.delete(splitCosts).where(eq(splitCosts.splitId, id));

        // Payments has FK to splits without onDelete:cascade; detach to allow deleting split.
        await tx.update(payments)
            .set({ splitId: null, updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(payments.splitId, id));

        await tx.delete(splits).where(eq(splits.id, id));
    });

    return c.body(null, 204);
});

// -----------------------------------------------------------------------------
// POST /splits
// -----------------------------------------------------------------------------
app.post("/", zValidator("json", z.object({
    name: z.string().optional(),
    peopleCount: z.number().min(2).max(20).default(2)
})), async (c) => {
    const userId = c.get("clerkUserId");
    const { name, peopleCount } = c.req.valid("json");

    const splitId = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await db.transaction(async (tx) => {
        await tx.insert(splits).values({
            id: splitId,
            ownerClerkUserId: userId,
            name: name || `Rateio ${new Date().toLocaleDateString()}`,
            createdAt: now,
            updatedAt: now,
        });

        if (peopleCount > 0) {
            const batchParticipants = [];
            for (let i = 0; i < peopleCount; i++) {
                batchParticipants.push({
                    id: randomUUID(),
                    splitId: splitId,
                    name: `Pessoa ${i + 1}`,
                    sortOrder: i
                });
            }
            await tx.insert(participants).values(batchParticipants);
        }
    });

    return c.json({ id: splitId }, 201);
});

// -----------------------------------------------------------------------------
// PUT /splits/:id/participants
// -----------------------------------------------------------------------------
const updateParticipantsSchema = z.object({
    participants: z.array(z.object({
        id: z.string().uuid().optional(),
        name: z.string(),
    }))
});

app.put("/:id/participants", zValidator("json", updateParticipantsSchema), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const { participants: newParts } = c.req.valid("json");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split) return c.json({ error: "Not found" }, 404);
    if (split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);
    if (split.status === "PAID") return c.json({ error: "Split is locked" }, 400);

    await db.transaction(async (tx) => {
        const currentParams = await tx.select().from(participants).where(eq(participants.splitId, id));
        const currentIds = new Set(currentParams.map(p => p.id));
        const incomingIds = new Set();

        for (let i = 0; i < newParts.length; i++) {
            const p = newParts[i];
            // Preserve client-provided IDs for NEW participants to keep shares consistent
            // (web generates UUIDs optimistically).
            const incomingId = p.id?.trim();
            const pId = incomingId ? incomingId : randomUUID();
            incomingIds.add(pId);

            if (incomingId && currentIds.has(incomingId)) {
                await tx.update(participants)
                    .set({ name: p.name, sortOrder: i })
                    .where(eq(participants.id, pId));
            } else {
                await tx.insert(participants).values({
                    id: pId,
                    splitId: id,
                    name: p.name,
                    sortOrder: i
                });
            }
        }

        for (const curr of currentParams) {
            if (!incomingIds.has(curr.id)) {
                await tx.delete(participants).where(eq(participants.id, curr.id));
            }
        }
    });

    return c.json({ success: true });
});

// -----------------------------------------------------------------------------
// PUT /splits/:id/items
// -----------------------------------------------------------------------------
const updateItemsSchema = z.object({
    items: z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        amountCents: z.number(),
        consumerIds: z.array(z.string())
    }))
});

app.put("/:id/items", zValidator("json", updateItemsSchema), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const { items: newItems } = c.req.valid("json");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split || split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);
    if (split.status === "PAID") return c.json({ error: "Locked" }, 400);

    // Validate that consumerIds reference existing participants of this split.
    // Otherwise we might fail later with FK errors (or worse: appear to "not save").
    const splitParticipants = await db
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.splitId, id));
    const participantIdSet = new Set(splitParticipants.map(p => p.id));

    const invalidConsumerIds = new Set<string>();
    for (const item of newItems) {
        for (const cid of item.consumerIds) {
            if (!participantIdSet.has(cid)) invalidConsumerIds.add(cid);
        }
    }
    if (invalidConsumerIds.size > 0) {
        return c.json(
            {
                error: "Invalid consumerIds",
                invalidConsumerIds: Array.from(invalidConsumerIds),
            },
            400
        );
    }

    try {
        await db.transaction(async (tx) => {
            const existingItems = await tx.select({ id: items.id }).from(items).where(eq(items.splitId, id));
            const existingItemIds = existingItems.map(i => i.id);

            if (existingItemIds.length > 0) {
                await tx.delete(itemShares).where(inArray(itemShares.itemId, existingItemIds));
                await tx.delete(items).where(eq(items.splitId, id));
            }
            // Optimization: Batch Insert

            if (newItems.length === 0) return;

            const batchItems = [];
            const batchShares = [];

            for (const item of newItems) {
                const itemId = item.id || randomUUID();
                batchItems.push({
                    id: itemId,
                    splitId: id,
                    name: item.name,
                    amountCents: item.amountCents
                });

                for (const cid of item.consumerIds) {
                    batchShares.push({
                        itemId: itemId,
                        participantId: cid
                    });
                }
            }

            if (batchItems.length > 0) {
                await tx.insert(items).values(batchItems);
            }

            if (batchShares.length > 0) {
                await tx.insert(itemShares).values(batchShares);
            }
        });
    } catch (e: any) {
        // In case something slips past validation (race conditions), return a debuggable 400
        const code = e?.code || e?.cause?.code;
        if (code === "SQLITE_CONSTRAINT") {
            console.error("[PUT /splits/:id/items] SQLite constraint failed", {
                splitId: id,
                itemsCount: newItems.length,
                sharesCount: newItems.reduce((acc, it) => acc + (it.consumerIds?.length || 0), 0),
                requestId: c.res.headers.get("x-request-id"),
            });
            return c.json(
                {
                    error: "Foreign key constraint failed",
                    hint: "Possível corrida: participantes ainda não persistidos ao salvar consumerIds.",
                },
                400
            );
        }
        console.error("[PUT /splits/:id/items] Unexpected error", e);
        throw e;
    }

    return c.json({ success: true });
});

// -----------------------------------------------------------------------------
// PUT /splits/:id/extras
// -----------------------------------------------------------------------------
const updateExtrasSchema = z.object({
    extras: z.array(z.object({
        type: z.enum(["SERVICE_PERCENT", "FIXED"]),
        valueCents: z.number().optional(),
        valuePercentBp: z.number().optional(),
        allocationMode: z.enum(["PROPORTIONAL", "EQUAL"])
    }))
});

app.put("/:id/extras", zValidator("json", updateExtrasSchema), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const { extras: newExtras } = c.req.valid("json");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split || split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);
    if (split.status === "PAID") return c.json({ error: "Locked" }, 400);

    await db.transaction(async (tx) => {
        await tx.delete(extras).where(eq(extras.splitId, id));

        if (newExtras.length === 0) return;

        const batchExtras = newExtras.map(extra => ({
            id: randomUUID(),
            splitId: id,
            type: extra.type,
            valueCents: extra.valueCents,
            valuePercentBp: extra.valuePercentBp,
            allocationMode: extra.allocationMode
        }));

        await tx.insert(extras).values(batchExtras);
    });

    return c.json({ success: true });
});

// -----------------------------------------------------------------------------
// POST /splits/:id/ai-parse (Stub)
// -----------------------------------------------------------------------------
app.post("/:id/ai-parse", zValidator("json", z.object({
    text: z.string()
})), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const { text } = c.req.valid("json");

    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split || split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);
    if (split.status === "PAID") return c.json({ error: "Locked" }, 400);

    const len = text.length;
    let cost = 0;

    const t1Max = parseInt(process.env.AI_TEXT_TIER_1_MAX_CHARS || "1000");
    const t1Cost = parseInt(process.env.AI_TEXT_TIER_1_CENTS || "50");
    const t2Max = parseInt(process.env.AI_TEXT_TIER_2_MAX_CHARS || "5000");
    const t2Cost = parseInt(process.env.AI_TEXT_TIER_2_CENTS || "100");

    if (len <= t1Max) cost = t1Cost;
    else if (len <= t2Max) cost = t2Cost;
    else cost = parseInt(process.env.AI_TEXT_TIER_3_CENTS || "200");

    const mockItems = text.split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => ({
            name: line.trim(),
            amountCents: 1000
        }));

    return c.json({
        costCents: cost,
        parsedItems: mockItems
    });
});

// -----------------------------------------------------------------------------
// POST /splits/:id/compute-review
// -----------------------------------------------------------------------------
app.post("/:id/compute-review", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");

    const split = await db.query.splits.findFirst({
        where: eq(splits.id, id),
        with: {
            participants: true,
            items: true,
            extras: true
        }
    });

    if (!split || split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);

    const itemIds = split.items.map(i => i.id);
    let allShares: any[] = [];
    if (itemIds.length > 0) {
        allShares = await db.select().from(itemShares).where(inArray(itemShares.itemId, itemIds));
    }

    // Convert to strict input type
    const shareInputs: ItemShareInput[] = allShares.map(s => ({ itemId: s.itemId, participantId: s.participantId }));

    const baseFeeCents = parseInt(process.env.BASE_FEE_CENTS || "0");
    const aiCents = 0;

    const result = calculateSplit(
        split.participants,
        split.items,
        shareInputs,
        split.extras,
        baseFeeCents,
        aiCents
    );

    await db.insert(splitCosts).values({
        splitId: id,
        baseFeeCents: result.baseFeeCents,
        aiCents: result.aiCents,
        totalCents: result.finalTotalToPayCents
    }).onConflictDoUpdate({
        target: splitCosts.splitId,
        set: {
            baseFeeCents: result.baseFeeCents,
            aiCents: result.aiCents,
            totalCents: result.finalTotalToPayCents
        }
    });

    const walletBalance = await WalletService.getBalance(userId);

    return c.json({
        calculation: result,
        wallet: {
            balanceCents: walletBalance,
            remainingToPay: Math.max(0, result.finalTotalToPayCents - walletBalance)
        }
    });
});

export default app;
