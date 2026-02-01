import { InferSelectModel } from "drizzle-orm";
import { items, participants, extras } from "../db/schema.js";

type Item = InferSelectModel<typeof items>;
type Participant = InferSelectModel<typeof participants>;
type Extra = InferSelectModel<typeof extras>;

export type ItemShareInput = {
    itemId: string;
    participantId: string;
};

export type CalculationResult = {
    participantTotals: Record<string, number>; // participantId -> cents
    grandTotalCents: number;
    itemsTotalCents: number;
    extrasTotalCents: number;
    baseFeeCents: number;
    aiCents: number;
    finalTotalToPayCents: number; // Includes platform fees
};

/**
 * Distributes an integer amount among N consumers.
 * Returns an array of length N where the sum equals amount.
 * The remainder is distributed 1 cent to the first R consumers.
 */
function distributeCents(amount: number, count: number): number[] {
    if (count === 0) return [];
    const base = Math.floor(amount / count);
    const remainder = amount % count;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        result.push(i < remainder ? base + 1 : base);
    }
    return result;
}

export function calculateSplit(
    participantsList: Participant[],
    itemsList: Item[],
    shares: ItemShareInput[],
    extrasList: Extra[],
    baseFeeCents: number = 0,
    aiCents: number = 0
): CalculationResult {
    const participantTotals: Record<string, number> = {};
    // Track item-only costs separately for proportional base
    const itemsOnlyTotals: Record<string, number> = {};

    const participantMap = new Map<string, Participant>();

    participantsList.forEach((p) => {
        participantTotals[p.id] = 0;
        itemsOnlyTotals[p.id] = 0;
        participantMap.set(p.id, p);
    });

    // Helper to sort participants deterministically
    // Order: sortOrder ASC, then id ASC (lexicographical)
    const sortParticipants = (pIds: string[]) => {
        return pIds.sort((a, b) => {
            const pA = participantMap.get(a)!;
            const pB = participantMap.get(b)!;
            if (pA.sortOrder !== pB.sortOrder) {
                return pA.sortOrder - pB.sortOrder;
            }
            return pA.id.localeCompare(pB.id);
        });
    };

    // 1. Calculate Item Costs
    let itemsTotalCents = 0;

    for (const item of itemsList) {
        itemsTotalCents += item.amountCents;

        const consumers = shares
            .filter((s) => s.itemId === item.id)
            .map((s) => s.participantId);

        // Filter out invalid consumers (deleted participants)
        const validConsumers = consumers.filter((cid) => participantMap.has(cid));

        if (validConsumers.length === 0) {
            throw new Error(`Item "${item.name}" has no valid consumers`);
        }

        // Sort consumers for deterministic attribution of remainder
        sortParticipants(validConsumers);

        const distributed = distributeCents(item.amountCents, validConsumers.length);
        validConsumers.forEach((pid, idx) => {
            const share = distributed[idx];
            participantTotals[pid] += share;
            itemsOnlyTotals[pid] += share;
        });
    }

    // 2. Calculate Extras
    let extrasTotalCents = 0;

    // Total consumed by all to use as denominator for proportional extras
    // Must use sum of itemsOnlyTotals, which should equal itemsTotalCents (checked later)
    const totalItemsConsumedCents = itemsTotalCents;

    for (const extra of extrasList) {
        let extraAmount = 0;

        if (extra.type === "FIXED") {
            extraAmount = extra.valueCents || 0;
        } else if (extra.type === "SERVICE_PERCENT") {
            const rate = extra.valuePercentBp || 0;
            // rate is basis points. 10% = 1000 bp.
            // floor(amount * rate / 10000)
            extraAmount = Math.floor((itemsTotalCents * rate) / 10000);
        }

        extrasTotalCents += extraAmount;

        if (extraAmount > 0) {
            if (extra.allocationMode === "EQUAL") {
                const count = participantsList.length;
                if (count > 0) {
                    // Sort participants for determinism
                    const pIds = participantsList.map(p => p.id);
                    sortParticipants(pIds);

                    const parts = distributeCents(extraAmount, count);
                    pIds.forEach((pid, idx) => {
                        participantTotals[pid] += parts[idx];
                    });
                }
            } else if (extra.allocationMode === "PROPORTIONAL") {
                if (totalItemsConsumedCents > 0) {
                    // Largest Remainder Method
                    // 1. Calculate raw share for each participant
                    // 2. Give floor(share) to each
                    // 3. Calculate remainders
                    // 4. Sort by remainder desc
                    // 5. Distribute 1 cent to top N where N = total_extra - assigned

                    const distributionCandidates: {
                        pid: string,
                        baseShare: number,
                        fraction: number,
                        participant: Participant
                    }[] = [];

                    let assignedTotal = 0;

                    participantsList.forEach(p => {
                        const consumption = itemsOnlyTotals[p.id];
                        // Share = Extra * (Consumption / Total)
                        // Keeping precision? 
                        // We can use Number (double) for intermediate calculation
                        // share = (extraAmount * consumption) / totalItemsConsumedCents
                        const rawShare = (extraAmount * consumption) / totalItemsConsumedCents;
                        const baseShare = Math.floor(rawShare);
                        const fraction = rawShare - baseShare;

                        assignedTotal += baseShare;

                        distributionCandidates.push({
                            pid: p.id,
                            baseShare,
                            fraction,
                            participant: p
                        });
                    });

                    // Distribute base shares
                    distributionCandidates.forEach(c => {
                        participantTotals[c.pid] += c.baseShare;
                    });

                    let remainderToDistribute = extraAmount - assignedTotal;

                    if (remainderToDistribute > 0) {
                        // Sort candidates by fraction DESC
                        // Tie-breaker: sortOrder ASC, id ASC
                        distributionCandidates.sort((a, b) => {
                            // Higher fraction first
                            if (Math.abs(b.fraction - a.fraction) > 1e-9) { // float epsilon safety
                                return b.fraction - a.fraction;
                            }
                            // Tie-breaker
                            if (a.participant.sortOrder !== b.participant.sortOrder) {
                                return a.participant.sortOrder - b.participant.sortOrder;
                            }
                            return a.participant.id.localeCompare(b.participant.id);
                        });

                        // Distribute 1 cent to first N
                        for (let i = 0; i < remainderToDistribute; i++) {
                            participantTotals[distributionCandidates[i].pid] += 1;
                        }
                    }
                }
            }
        }
    }

    // Final Sum Checks
    const sumParticipants = Object.values(participantTotals).reduce((a, b) => a + b, 0);
    const checkTotal = itemsTotalCents + extrasTotalCents;

    if (sumParticipants !== checkTotal) {
        throw new Error(`Invariant failed: Sum of participants (${sumParticipants}) !== Total (${checkTotal})`);
    }

    return {
        participantTotals,
        itemsTotalCents,
        extrasTotalCents,
        grandTotalCents: checkTotal,
        baseFeeCents,
        aiCents,
        finalTotalToPayCents: checkTotal // Bill total only
    };
}
