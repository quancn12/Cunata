import { rational, ZERO, ONE, add, sub, mul, div, compare } from "./rational.js";
export const POINT_I = rational(1, 4);
export const PART2_POINTS = Object.freeze([
    ZERO,
    rational(1, 10),
    rational(1, 4),
    rational(1, 2),
    ONE,
]);
export function computeExamMax(c) {
    if (c === null ||
        typeof c !== "object" ||
        typeof c.n1 !== "number" ||
        !Number.isSafeInteger(c.n1) ||
        c.n1 < 0 ||
        typeof c.n2 !== "number" ||
        !Number.isSafeInteger(c.n2) ||
        c.n2 < 0 ||
        typeof c.n3 !== "number" ||
        !Number.isSafeInteger(c.n3) ||
        c.n3 < 0 ||
        c.n1 + c.n2 + c.n3 === 0) {
        throw new RangeError("Section counts must be safe integers >= 0, and total question count must be > 0");
    }
    const maxI = mul(rational(c.n1), POINT_I);
    const maxII = rational(c.n2);
    let pointIII;
    let maxIII;
    if (c.n3 === 0) {
        pointIII = ZERO;
        maxIII = ZERO;
    }
    else {
        const base = add(maxI, maxII);
        const ten = rational(10);
        if (compare(base, ten) < 0) {
            pointIII = div(sub(ten, base), rational(c.n3));
        }
        else {
            pointIII = POINT_I;
        }
        maxIII = mul(rational(c.n3), pointIII);
    }
    const maxTotal = add(add(maxI, maxII), maxIII);
    return Object.freeze({
        maxI,
        maxII,
        pointIII,
        maxIII,
        maxTotal,
    });
}
