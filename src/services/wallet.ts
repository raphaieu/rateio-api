import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { wallets, walletLedger } from "../db/schema.js";

// Since I don't have utils yet, I'll use crypto.randomUUID if node >= 19 or import
import { randomUUID } from "node:crypto";

export class WalletService {
    /**
     * Get current balance for a user.
     * If wallet doesn't exist, returns 0 (and optionally creates it?).
     * Spec says "wallets balance in cents".
     */
    static async getBalance(userId: string): Promise<number> {
        const res = await db.query.wallets.findFirst({
            where: eq(wallets.ownerClerkUserId, userId),
        });
        return res?.balanceCents ?? 0;
    }

    /**
     * Adds a ledger entry and updates balance.
     * Transactional.
     */
    static async addEntry(
        userId: string,
        type: "TOPUP" | "CHARGE",
        amountCents: number,
        refType: "PAYMENT" | "SPLIT_FEE",
        refId: string
    ) {
        if (amountCents <= 0) throw new Error("Amount must be positive");

        return await db.transaction(async (tx) => {
            // 1. Ensure wallet exists
            let wallet = await tx.query.wallets.findFirst({
                where: eq(wallets.ownerClerkUserId, userId),
            });

            if (!wallet) {
                // Create wallet if it doesn't exist
                await tx.insert(wallets).values({
                    ownerClerkUserId: userId,
                    balanceCents: 0,
                });
                wallet = { ownerClerkUserId: userId, balanceCents: 0 };
            }

            // 2. Calculate new balance
            const newBalance =
                type === "TOPUP"
                    ? wallet.balanceCents + amountCents
                    : wallet.balanceCents - amountCents;

            if (newBalance < 0) {
                throw new Error("Insufficient funds");
            }

            // 3. Update wallet
            await tx
                .update(wallets)
                .set({ balanceCents: newBalance })
                .where(eq(wallets.ownerClerkUserId, userId));

            // 4. Create ledger entry
            await tx.insert(walletLedger).values({
                id: randomUUID(),
                ownerClerkUserId: userId,
                type,
                amountCents,
                refType,
                refId,
            });

            return newBalance;
        });
    }
}
