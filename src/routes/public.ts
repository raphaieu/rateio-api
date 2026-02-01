import { Hono } from "hono";
import { db } from "../db/index.js";
import { splits, participants, items, itemShares, extras } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { calculateSplit, ItemShareInput } from "../services/calculation.js";

const app = new Hono();

app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");

    const split = await db.query.splits.findFirst({
        where: eq(splits.publicSlug, slug),
        with: {
            participants: true,
            items: true,
            extras: true,
            splitCosts: true
        }
    });

    if (!split) return c.json({ error: "Not found" }, 404);
    if (split.status !== "PAID") return c.json({ error: "Not available yet" }, 404); // Hide non-paid splits

    // Re-calculate or fetch stored result?
    // "Public read-only endpoint GET /public/:slug returns participants + final amounts only if split is PAID"
    // We already stored final totals in `split_costs`, but that's just aggregate.
    // We need per-participant breakdown.
    // Since calculation is deterministic and state is frozen (PAID), we can recalc on the fly.

    // Fetch shares similar to splits.ts
    const shareInputs: ItemShareInput[] = [];
    const shareRows = await db.select().from(itemShares).execute(); // optimize later
    // Filter in memory for MVP simplicity
    const splitItemIds = new Set(split.items.map(i => i.id));
    shareRows.forEach(s => {
        if (splitItemIds.has(s.itemId)) {
            shareInputs.push(s);
        }
    });

    const result = calculateSplit(
        split.participants,
        split.items,
        shareInputs,
        split.extras,
        split.splitCosts?.baseFeeCents || 0,
        split.splitCosts?.aiCents || 0
    );

    return c.json({
        splitName: split.name,
        date: split.createdAt,
        totals: result.participantTotals,
        grandTotal: result.grandTotalCents,
        proof: {
            // Optional: visual breakdown
            items: split.items,
            extras: split.extras
        }
    });
});

export default app;
