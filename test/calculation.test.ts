import { strict as assert } from "node:assert";
import { calculateSplit, CalculationResult } from "../src/services/calculation";
import { items, participants, extras } from "../src/db/schema";
import { InferSelectModel } from "drizzle-orm";

console.log("Running Calculation Tests...");

// Mocks
type Item = InferSelectModel<typeof items>;
type Participant = InferSelectModel<typeof participants>;
type Extra = InferSelectModel<typeof extras>;

// Helper to make test data cleaner
const mkPart = (id: string, sortOrder: number = 0): Participant => ({ id, name: id, splitId: "s1", sortOrder });
const mkItem = (id: string, amount: number): Item => ({ id, name: "Item", amountCents: amount, splitId: "s1" });

// Test 1: Simple split equal
{
    const ps = [mkPart("p1"), mkPart("p2")];
    const is = [mkItem("i1", 1000)];
    const shares = [
        { itemId: "i1", participantId: "p1" },
        { itemId: "i1", participantId: "p2" },
    ];

    const result = calculateSplit(ps, is, shares, []);

    assert.equal(result.itemsTotalCents, 1000);
    assert.equal(result.participantTotals["p1"], 500);
    assert.equal(result.participantTotals["p2"], 500);
    console.log("Test 1 Passed: Simple Equal Split");
}

// Test 2: Remainder handling (Equal Item)
{
    const ps = [mkPart("p1", 0), mkPart("p2", 1), mkPart("p3", 2)];
    const is = [mkItem("i1", 1000)];
    // 1000 / 3 = 333 r 1
    const shares = [
        { itemId: "i1", participantId: "p1" },
        { itemId: "i1", participantId: "p2" },
        { itemId: "i1", participantId: "p3" },
    ];

    const result = calculateSplit(ps, is, shares, []);

    // Sorted by sortOrder: p1, p2, p3. Remainder goes to p1.
    assert.equal(result.participantTotals["p1"], 334);
    assert.equal(result.participantTotals["p2"], 333);
    assert.equal(result.participantTotals["p3"], 333);
    assert.equal(result.grandTotalCents, 1000);
    console.log("Test 2 Passed: Remainder Handling");
}

// Test 2b: Balanced remainder across multiple items (avoid bias)
{
    const ps = [mkPart("p1", 0), mkPart("p2", 1), mkPart("p3", 2)];
    // Three items, each 1000 / 3 = 333 r 1. The extra cent should rotate so totals equalize.
    const is = [mkItem("i1", 1000), mkItem("i2", 1000), mkItem("i3", 1000)];
    const shares = [
        { itemId: "i1", participantId: "p1" },
        { itemId: "i1", participantId: "p2" },
        { itemId: "i1", participantId: "p3" },
        { itemId: "i2", participantId: "p1" },
        { itemId: "i2", participantId: "p2" },
        { itemId: "i2", participantId: "p3" },
        { itemId: "i3", participantId: "p1" },
        { itemId: "i3", participantId: "p2" },
        { itemId: "i3", participantId: "p3" },
    ];

    const result = calculateSplit(ps, is, shares, []);

    assert.equal(result.participantTotals["p1"], 1000);
    assert.equal(result.participantTotals["p2"], 1000);
    assert.equal(result.participantTotals["p3"], 1000);
    assert.equal(result.grandTotalCents, 3000);
    console.log("Test 2b Passed: Balanced Remainder Across Items");
}

// Test 3: Service Fee (10%)
{
    const ps = [mkPart("p1")];
    const is = [mkItem("i1", 5000)];
    const shares = [{ itemId: "i1", participantId: "p1" }];

    const es: Extra[] = [{
        id: "e1",
        splitId: "s1",
        type: "SERVICE_PERCENT",
        valuePercentBp: 1000,
        allocationMode: "PROPORTIONAL",
        valueCents: null
    }];

    const result = calculateSplit(ps, is, shares, es);
    assert.equal(result.extrasTotalCents, 500);
    assert.equal(result.participantTotals["p1"], 5500);
    assert.equal(result.grandTotalCents, 5500);
    console.log("Test 3 Passed: Service Fee");
}

// Test 4: Orphaned Item Error
{
    const ps = [mkPart("p1")];
    const is = [mkItem("i1", 100)];
    const shares: any[] = []; // No consumers

    try {
        calculateSplit(ps, is, shares, []);
        assert.fail("Should have threw error");
    } catch (e: any) {
        assert.match(e.message, /has no valid consumers/);
    }
    console.log("Test 4 Passed: Orphaned Item Error");
}

// Test 5: Proportional Fixed Extra (Uneven Consumption)
{
    const ps = [mkPart("p1"), mkPart("p2")]; // p1: 700, p2: 300
    const is = [
        mkItem("i1", 700),
        mkItem("i2", 300)
    ];
    const shares = [
        { itemId: "i1", participantId: "p1" },
        { itemId: "i2", participantId: "p2" }
    ];

    // Extra = 100. Proportional.
    // p1 share = 100 * (700/1000) = 70.
    // p2 share = 100 * (300/1000) = 30.
    const es: Extra[] = [{
        id: "e1", splitId: "s1", type: "FIXED", valueCents: 100, allocationMode: "PROPORTIONAL", valuePercentBp: null
    }];

    const result = calculateSplit(ps, is, shares, es);

    assert.equal(result.participantTotals["p1"], 700 + 70);
    assert.equal(result.participantTotals["p2"], 300 + 30);
    console.log("Test 5 Passed: Proportional Fixed Extra (Uneven)");
}

// Test 6: Proportional Extra with Remainder (100 over 3 equal consumers)
{
    const ps = [mkPart("pA", 10), mkPart("pB", 20), mkPart("pC", 30)];
    // Each consumes 100. Total 300.
    const is = [mkItem("i1", 100), mkItem("i2", 100), mkItem("i3", 100)];
    const shares = [
        { itemId: "i1", participantId: "pA" },
        { itemId: "i2", participantId: "pB" },
        { itemId: "i3", participantId: "pC" }
    ];

    // Extra = 100.
    // Share per person = 100 * (100/300) = 33.333...
    // Base = 33.
    // Remainder = 100 - 99 = 1.
    // All have same fractional part (0.333).
    // Tie-breaker: sortOrder. pA(10) < pB(20) < pC(30).
    // pA gets +1.

    const es: Extra[] = [{
        id: "e1", splitId: "s1", type: "FIXED", valueCents: 100, allocationMode: "PROPORTIONAL", valuePercentBp: null
    }];

    const result = calculateSplit(ps, is, shares, es);

    assert.equal(result.participantTotals["pA"], 100 + 34);
    assert.equal(result.participantTotals["pB"], 100 + 33);
    assert.equal(result.participantTotals["pC"], 100 + 33);
    console.log("Test 6 Passed: Proportional Extra Remainder (Equal Consumption)");
}

// Test 7: Multiple Extras (Equal + Proportional) - Proportional uses Item Only Base
{
    const ps = [mkPart("p1"), mkPart("p2")];
    // p1 consumes 1000. p2 consumes 0.
    const is = [mkItem("i1", 1000)];
    const shares = [{ itemId: "i1", participantId: "p1" }];

    // Extra 1: EQUAL 200. -> p1: 100, p2: 100.
    // Current Totals: p1: 1100, p2: 100.
    // Extra 2: PROPORTIONAL 100.
    // Base is Item Consumption (p1: 1000, p2: 0).
    // So p1 should pay 100% of extra 2.
    // p2 should pay 0% of extra 2.

    // If we used current total (1100 vs 100), p2 would pay ~8 cents.
    // We expect p2 to pay 0.

    const es: Extra[] = [
        { id: "e1", splitId: "s1", type: "FIXED", valueCents: 200, allocationMode: "EQUAL", valuePercentBp: null },
        { id: "e2", splitId: "s1", type: "FIXED", valueCents: 100, allocationMode: "PROPORTIONAL", valuePercentBp: null }
    ];

    const result = calculateSplit(ps, is, shares, es);

    assert.equal(result.participantTotals["p1"], 1000 + 100 + 100); // Item + Equal + Prop
    assert.equal(result.participantTotals["p2"], 0 + 100 + 0); // No Item + Equal + No Prop

    console.log("Test 7 Passed: Multiple Extras Base Isolation");
}

// Test 8: Deterministic Sort Order (Tie-breaker)
{
    // pX (order 2), pY (order 1).
    // Both consume same amount. Remainder should go to pY (lower order).
    const ps = [mkPart("pX", 2), mkPart("pY", 1)];
    const is = [mkItem("i1", 200)]; // 100 each
    const shares = [
        { itemId: "i1", participantId: "pX" },
        { itemId: "i1", participantId: "pY" }
    ];

    // Extra 1 cent proportional.
    // 0.5 each. Tie.
    // pY has sortOrder 1, pX has 2.
    // pY should get it.

    const es: Extra[] = [{
        id: "e1", splitId: "s1", type: "FIXED", valueCents: 1, allocationMode: "PROPORTIONAL", valuePercentBp: null
    }];

    const result = calculateSplit(ps, is, shares, es);

    assert.equal(result.participantTotals["pY"], 100 + 1);
    assert.equal(result.participantTotals["pX"], 100 + 0);
    console.log("Test 8 Passed: Deterministic Sort Order");
}

console.log("All tests passed!");
