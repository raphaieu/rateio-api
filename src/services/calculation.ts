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
    /**
     * Valores "sem arredondamento" (antes da distribuição dos centavos),
     * formatados em BRL com casas decimais extras (string).
     *
     * Ex.: "R$ 10,333333…" (truncado, sem arredondar; "…" indica dízima/continuação).
     */
    participantTotalsRaw?: Record<string, string>;
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

type Fraction = { num: bigint; den: bigint };

function gcdBigInt(a: bigint, b: bigint): bigint {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
        const t = x % y;
        x = y;
        y = t;
    }
    return x;
}

function normalizeFraction(f: Fraction): Fraction {
    if (f.den === 0n) throw new Error("Invalid fraction: denominator 0");
    if (f.num === 0n) return { num: 0n, den: 1n };
    const sign = f.den < 0n ? -1n : 1n;
    const num = f.num * sign;
    const den = f.den * sign;
    const g = gcdBigInt(num, den);
    return { num: num / g, den: den / g };
}

function addFractions(a: Fraction, b: Fraction): Fraction {
    // a/b + c/d = (ad + bc) / bd
    const num = a.num * b.den + b.num * a.den;
    const den = a.den * b.den;
    return normalizeFraction({ num, den });
}

function fractionFromInt(n: number): Fraction {
    return { num: BigInt(n), den: 1n };
}

function formatBRLFromFraction(num: bigint, den: bigint, extraDecimals: number): string {
    // num/den is in "reais" (not cents) and can have repeating decimals.
    const n = num < 0n ? -num : num;
    const d = den < 0n ? -den : den;
    const integerPart = n / d;
    let remainder = n % d;

    const intStr = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    let fracDigits = "";
    for (let i = 0; i < extraDecimals; i++) {
        remainder *= 10n;
        const digit = remainder / d;
        remainder = remainder % d;
        fracDigits += digit.toString();
    }
    const hasMore = remainder !== 0n;
    // pt-BR: decimal separator is ","
    return `R$ ${intStr},${fracDigits}${hasMore ? "…" : ""}`;
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

    // Raw totals (fractional cents)
    const participantTotalsRawCents: Record<string, Fraction> = {};
    const itemsOnlyTotalsRawCents: Record<string, Fraction> = {};

    participantsList.forEach((p) => {
        participantTotals[p.id] = 0;
        itemsOnlyTotals[p.id] = 0;
        participantMap.set(p.id, p);
        participantTotalsRawCents[p.id] = { num: 0n, den: 1n };
        itemsOnlyTotalsRawCents[p.id] = { num: 0n, den: 1n };
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

        // Sort consumers for determinism
        sortParticipants(validConsumers);

        // Balanced remainder distribution:
        // - Everyone gets the base share
        // - The remainder cents go to the consumers with the lowest running total so far
        // This avoids a bias where the "first" participant always gets the extra cent across many items.
        const count = validConsumers.length;
        const base = Math.floor(item.amountCents / count);
        const remainder = item.amountCents % count;

        const totalsSnapshot = new Map<string, number>();
        validConsumers.forEach((pid) => totalsSnapshot.set(pid, itemsOnlyTotals[pid] ?? 0));

        const remainderRecipients = remainder > 0
            ? [...validConsumers].sort((a, b) => {
                const ta = totalsSnapshot.get(a) ?? 0;
                const tb = totalsSnapshot.get(b) ?? 0;
                if (ta !== tb) return ta - tb; // lower total first
                const pA = participantMap.get(a)!;
                const pB = participantMap.get(b)!;
                if (pA.sortOrder !== pB.sortOrder) return pA.sortOrder - pB.sortOrder;
                return pA.id.localeCompare(pB.id);
            }).slice(0, remainder)
            : [];

        const remainderSet = new Set(remainderRecipients);
        const rawShare: Fraction = normalizeFraction({
            num: BigInt(item.amountCents),
            den: BigInt(validConsumers.length),
        });

        validConsumers.forEach((pid) => {
            const share = base + (remainderSet.has(pid) ? 1 : 0);
            participantTotals[pid] += share;
            itemsOnlyTotals[pid] += share;

            participantTotalsRawCents[pid] = addFractions(participantTotalsRawCents[pid], rawShare);
            itemsOnlyTotalsRawCents[pid] = addFractions(itemsOnlyTotalsRawCents[pid], rawShare);
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

                    // Raw equal split: extraAmount/count cents each
                    const rawPart: Fraction = normalizeFraction({
                        num: BigInt(extraAmount),
                        den: BigInt(count),
                    });
                    pIds.forEach((pid) => {
                        participantTotalsRawCents[pid] = addFractions(participantTotalsRawCents[pid], rawPart);
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

    // Raw proportional extras (exact, based on raw items consumption)
    // We do this in a second pass to keep existing "largest remainder" logic intact above.
    if (extrasList.length > 0 && totalItemsConsumedCents > 0) {
        const totalItemsConsumed = BigInt(totalItemsConsumedCents);
        for (const extra of extrasList) {
            let extraAmount = 0;
            if (extra.type === "FIXED") extraAmount = extra.valueCents || 0;
            else if (extra.type === "SERVICE_PERCENT") {
                const rate = extra.valuePercentBp || 0;
                extraAmount = Math.floor((itemsTotalCents * rate) / 10000);
            }

            if (extraAmount <= 0) continue;

            if (extra.allocationMode === "PROPORTIONAL") {
                const extraAmt = BigInt(extraAmount);
                for (const p of participantsList) {
                    const consumption = itemsOnlyTotalsRawCents[p.id]; // cents fraction
                    // shareCents = extraAmount * consumptionCents / totalItemsConsumedCents
                    // (extraAmt * (c.num/c.den)) / totalItemsConsumed
                    const share: Fraction = normalizeFraction({
                        num: extraAmt * consumption.num,
                        den: consumption.den * totalItemsConsumed,
                    });
                    participantTotalsRawCents[p.id] = addFractions(participantTotalsRawCents[p.id], share);
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

    const platformFeesCents = baseFeeCents + aiCents;

    // Format raw totals in BRL (reais) with digits beyond cents, without rounding.
    // participantTotalsRawCents is in cents, so convert to reais by dividing by 100.
    const participantTotalsRaw: Record<string, string> = {};
    const RAW_DECIMALS = 6; // 6 casas após a vírgula (mais que centavos)
    for (const p of participantsList) {
        const f = participantTotalsRawCents[p.id];
        // reais = (cents) / 100 => num / (den*100)
        participantTotalsRaw[p.id] = formatBRLFromFraction(f.num, f.den * 100n, RAW_DECIMALS);
    }

    return {
        participantTotals,
        participantTotalsRaw,
        itemsTotalCents,
        extrasTotalCents,
        grandTotalCents: checkTotal,
        baseFeeCents,
        aiCents,
        finalTotalToPayCents: platformFeesCents
    };
}
