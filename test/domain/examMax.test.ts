import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeExamMax,
  POINT_I,
  PART2_POINTS,
  type SectionCounts,
} from "../../src/domain/examMax.ts";
import { rational, toFractionString, equals, add } from "../../src/domain/rational.ts";

describe("computeExamMax - Golden anchors and formula invariants", () => {
  const GOLDEN: readonly [
    counts: [n1: number, n2: number, n3: number],
    maxI: string,
    maxII: string,
    pointIII: string,
    maxIII: string,
    maxTotal: string,
  ][] = [
    [[20, 0, 0], "5", "0", "0", "0", "5"],
    [[0, 4, 0], "0", "4", "0", "0", "4"],
    [[20, 10, 0], "5", "10", "0", "0", "15"],
    [[20, 10, 4], "5", "10", "1/4", "1", "16"],
    [[12, 4, 6], "3", "4", "1/2", "3", "10"],
    [[0, 0, 3], "0", "0", "10/3", "10", "10"],
    [[0, 0, 7], "0", "0", "10/7", "10", "10"],
    [[39, 0, 3], "39/4", "0", "1/12", "1/4", "10"],
    [[40, 0, 3], "10", "0", "1/4", "3/4", "43/4"],
    [[41, 0, 3], "41/4", "0", "1/4", "3/4", "11"],
  ];

  for (const [[n1, n2, n3], maxI, maxII, pointIII, maxIII, maxTotal] of GOLDEN) {
    it(`golden case (${n1}, ${n2}, ${n3}) -> maxTotal=${maxTotal}`, () => {
      const res = computeExamMax({ n1, n2, n3 });
      assert.equal(toFractionString(res.maxI), maxI);
      assert.equal(toFractionString(res.maxII), maxII);
      assert.equal(toFractionString(res.pointIII), pointIII);
      assert.equal(toFractionString(res.maxIII), maxIII);
      assert.equal(toFractionString(res.maxTotal), maxTotal);
      assert.ok(equals(res.maxTotal, add(add(res.maxI, res.maxII), res.maxIII)));
    });
  }

  it("exports frozen POINT_I and PART2_POINTS constants", () => {
    assert.ok(equals(POINT_I, rational(1, 4)));
    assert.equal(PART2_POINTS.length, 5);
    assert.ok(equals(PART2_POINTS[0]!, rational(0)));
    assert.ok(equals(PART2_POINTS[1]!, rational(1, 10)));
    assert.ok(equals(PART2_POINTS[2]!, rational(1, 4)));
    assert.ok(equals(PART2_POINTS[3]!, rational(1, 2)));
    assert.ok(equals(PART2_POINTS[4]!, rational(1)));
    assert.ok(Object.isFrozen(PART2_POINTS));
  });

  it("freezes result object", () => {
    const res = computeExamMax({ n1: 10, n2: 5, n3: 2 });
    assert.ok(Object.isFrozen(res));
  });

  it("throws RangeError on all zero counts", () => {
    assert.throws(() => computeExamMax({ n1: 0, n2: 0, n3: 0 }), RangeError);
  });

  it("throws RangeError on negative counts", () => {
    assert.throws(() => computeExamMax({ n1: -1, n2: 0, n3: 0 }), RangeError);
    assert.throws(() => computeExamMax({ n1: 0, n2: -1, n3: 0 }), RangeError);
    assert.throws(() => computeExamMax({ n1: 0, n2: 0, n3: -1 }), RangeError);
  });

  it("throws RangeError on non-safe-integer counts", () => {
    assert.throws(() => computeExamMax({ n1: 1.5, n2: 0, n3: 0 }), RangeError);
    assert.throws(() => computeExamMax({ n1: NaN, n2: 0, n3: 0 }), RangeError);
    assert.throws(() => computeExamMax({ n1: Infinity, n2: 0, n3: 0 }), RangeError);
    assert.throws(() => computeExamMax({ n1: 0, n2: 2.7, n3: 0 }), RangeError);
  });

  it("throws RangeError on non-number or non-object counts", () => {
    assert.throws(() => computeExamMax(null as unknown as SectionCounts), RangeError);
    assert.throws(() => computeExamMax(undefined as unknown as SectionCounts), RangeError);
    assert.throws(() => computeExamMax({ n1: "1" as unknown as number, n2: 0, n3: 0 }), RangeError);
  });

  it("evaluates BASE threshold transitions (BASE < 10, BASE == 10, BASE > 10) accurately", () => {
    // BASE < 10: (39, 0, 1) -> base = 39/4 = 9.75 -> pointIII = 1/4, maxTotal = 10
    const under1 = computeExamMax({ n1: 39, n2: 0, n3: 1 });
    assert.equal(toFractionString(under1.pointIII), "1/4");
    assert.equal(toFractionString(under1.maxTotal), "10");

    // BASE < 10: (0, 9, 2) -> base = 9 -> pointIII = (10 - 9)/2 = 1/2, maxTotal = 10
    const under2 = computeExamMax({ n1: 0, n2: 9, n3: 2 });
    assert.equal(toFractionString(under2.pointIII), "1/2");
    assert.equal(toFractionString(under2.maxTotal), "10");

    // BASE == 10: (40, 0, 1) -> base = 10 -> pointIII = 1/4, maxTotal = 41/4
    const exact1 = computeExamMax({ n1: 40, n2: 0, n3: 1 });
    assert.equal(toFractionString(exact1.pointIII), "1/4");
    assert.equal(toFractionString(exact1.maxTotal), "41/4");

    // BASE == 10: (0, 10, 1) -> base = 10 -> pointIII = 1/4, maxTotal = 41/4
    const exact2 = computeExamMax({ n1: 0, n2: 10, n3: 1 });
    assert.equal(toFractionString(exact2.pointIII), "1/4");
    assert.equal(toFractionString(exact2.maxTotal), "41/4");

    // BASE == 10: (20, 5, 4) -> base = 10 -> pointIII = 1/4, maxTotal = 11
    const exact3 = computeExamMax({ n1: 20, n2: 5, n3: 4 });
    assert.equal(toFractionString(exact3.pointIII), "1/4");
    assert.equal(toFractionString(exact3.maxTotal), "11");

    // BASE > 10: (41, 0, 1) -> base = 41/4 -> pointIII = 1/4, maxTotal = 21/2
    const over1 = computeExamMax({ n1: 41, n2: 0, n3: 1 });
    assert.equal(toFractionString(over1.pointIII), "1/4");
    assert.equal(toFractionString(over1.maxTotal), "21/2");

    // Large volume: (1000, 1000, 1000) -> maxI = 250, maxII = 1000, maxIII = 250, maxTotal = 1500
    const large = computeExamMax({ n1: 1000, n2: 1000, n3: 1000 });
    assert.equal(toFractionString(large.maxI), "250");
    assert.equal(toFractionString(large.maxII), "1000");
    assert.equal(toFractionString(large.pointIII), "1/4");
    assert.equal(toFractionString(large.maxIII), "250");
    assert.equal(toFractionString(large.maxTotal), "1500");
  });
});
