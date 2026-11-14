export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

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

function toSafeBigInt(val: bigint | number, name: string): bigint {
  if (typeof val === "bigint") {
    return val;
  }
  if (typeof val === "number") {
    if (!Number.isSafeInteger(val)) {
      throw new RangeError(`${name} must be a safe integer number, got ${val}`);
    }
    return BigInt(val);
  }
  throw new TypeError(`${name} must be a bigint or number, got ${typeof val}`);
}

export function rational(num: bigint | number, den: bigint | number = 1n): Rational {
  let n = toSafeBigInt(num, "num");
  let d = toSafeBigInt(den, "den");

  if (d === 0n) {
    throw new RangeError("Denominator cannot be zero");
  }

  if (n === 0n) {
    return ZERO;
  }

  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const g = gcdBigInt(n, d);
  n = n / g;
  d = d / g;

  if (n === 0n) {
    return ZERO;
  }
  if (n === 1n && d === 1n) {
    return ONE;
  }

  return Object.freeze({ num: n, den: d });
}

export const ZERO: Rational = Object.freeze({ num: 0n, den: 1n });
export const ONE: Rational = Object.freeze({ num: 1n, den: 1n });

export function add(a: Rational, b: Rational): Rational {
  if (a.num === 0n) return b;
  if (b.num === 0n) return a;
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return rational(num, den);
}

export function sub(a: Rational, b: Rational): Rational {
  if (b.num === 0n) return a;
  if (a.num === 0n) return rational(-b.num, b.den);
  const num = a.num * b.den - b.num * a.den;
  const den = a.den * b.den;
  return rational(num, den);
}

export function mul(a: Rational, b: Rational): Rational {
  if (a.num === 0n || b.num === 0n) return ZERO;
  if (a.num === 1n && a.den === 1n) return b;
  if (b.num === 1n && b.den === 1n) return a;
  const num = a.num * b.num;
  const den = a.den * b.den;
  return rational(num, den);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) {
    throw new RangeError("Division by zero");
  }
  if (a.num === 0n) return ZERO;
  const num = a.num * b.den;
  const den = a.den * b.num;
  return rational(num, den);
}

export function sum(xs: readonly Rational[]): Rational {
  if (xs.length === 0) return ZERO;
  let acc = ZERO;
  for (const x of xs) {
    acc = add(acc, x);
  }
  return acc;
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const diff = a.num * b.den - b.num * a.den;
  if (diff < 0n) return -1;
  if (diff > 0n) return 1;
  return 0;
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den;
}

export function toFractionString(r: Rational): string {
  const c =
    r.den > 0n &&
    (r.num === 0n ? r.den === 1n : gcdBigInt(r.num < 0n ? -r.num : r.num, r.den) === 1n)
      ? r
      : rational(r.num, r.den);

  if (c.den === 1n) {
    return c.num.toString();
  }
  return `${c.num}/${c.den}`;
}

export const MAX_FRACTION_STRING_LENGTH = 200;
export const MAX_FRACTION_DIGITS = 100;

const INT_REGEX = /^(0|-?[1-9]\d*)$/;
const FRAC_REGEX = /^(-?[1-9]\d*)\/([1-9]\d*)$/;

export function parseFractionString(s: string): Rational {
  if (typeof s !== "string") {
    throw new SyntaxError("Invalid fraction string: input must be a string");
  }

  if (s.length > MAX_FRACTION_STRING_LENGTH) {
    throw new SyntaxError(`Invalid fraction string: length ${s.length} exceeds maximum allowed (${MAX_FRACTION_STRING_LENGTH})`);
  }

  if (INT_REGEX.test(s)) {
    return rational(BigInt(s), 1n);
  }

  const match = FRAC_REGEX.exec(s);
  if (match !== null) {
    const numStr = match[1];
    const denStr = match[2];
    if (numStr === undefined || denStr === undefined) {
      throw new SyntaxError(`Invalid fraction string syntax: "${s}"`);
    }
    const num = BigInt(numStr);
    const den = BigInt(denStr);

    if (den === 1n) {
      throw new SyntaxError(`Invalid fraction string: integer representations must not have "/1" ("${s}")`);
    }

    const r = rational(num, den);
    if (r.num !== num || r.den !== den) {
      throw new SyntaxError(`Invalid fraction string: fraction is not in canonical reduced form ("${s}")`);
    }

    return r;
  }

  throw new SyntaxError(`Invalid fraction string syntax: "${s}"`);
}

export function toDecimalString(
  r: Rational,
  fractionDigits: number,
  mode: "half-up"
): string {
  if (
    typeof fractionDigits !== "number" ||
    !Number.isSafeInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > MAX_FRACTION_DIGITS
  ) {
    throw new RangeError(
      `fractionDigits must be a non-negative safe integer <= ${MAX_FRACTION_DIGITS}`
    );
  }

  if (mode !== "half-up") {
    throw new RangeError(`Unsupported rounding mode: ${mode}`);
  }

  if (
    r === null ||
    typeof r !== "object" ||
    typeof r.num !== "bigint" ||
    typeof r.den !== "bigint" ||
    r.den === 0n
  ) {
    throw new TypeError("r must be a valid Rational object");
  }

  const c = rational(r.num, r.den);
  const isNegative = c.num < 0n;
  const absNum = isNegative ? -c.num : c.num;
  const den = c.den;

  const factor = 10n ** BigInt(fractionDigits);
  const scaled = absNum * factor;
  let q = scaled / den;
  const rem = scaled % den;

  if (2n * rem >= den) {
    q += 1n;
  }

  if (q === 0n) {
    return fractionDigits === 0 ? "0" : `0.${"0".repeat(fractionDigits)}`;
  }

  let s = q.toString();
  let formatted: string;

  if (fractionDigits === 0) {
    formatted = s;
  } else {
    if (s.length <= fractionDigits) {
      s = s.padStart(fractionDigits + 1, "0");
    }
    const intPart = s.slice(0, s.length - fractionDigits);
    const fracPart = s.slice(s.length - fractionDigits);
    formatted = `${intPart}.${fracPart}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}
