export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y > 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function simplify(r: Rational): Rational {
  if (r.den === 0n) return r;
  const g = gcd(r.num, r.den);
  const num = r.num / g;
  const den = r.den / g;
  return den < 0n ? { num: -num, den: -den } : { num, den };
}

export function parseRational(s: unknown): Rational | null {
  if (typeof s !== 'string') return null;
  const str = s.trim();
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 1) {
    if (!/^-?\d+$/.test(parts[0]!)) return null;
    try {
      return { num: BigInt(parts[0]!), den: 1n };
    } catch {
      return null;
    }
  }
  if (parts.length === 2) {
    if (!/^-?\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) return null;
    try {
      const num = BigInt(parts[0]!);
      const den = BigInt(parts[1]!);
      if (den <= 0n) return null;
      return simplify({ num, den });
    } catch {
      return null;
    }
  }
  return null;
}

export function ratCmp(a: Rational, b: Rational): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function ratAdd(a: Rational, b: Rational): Rational {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return simplify({ num, den });
}

export function toCanonicalStr(r: Rational): string {
  const s = simplify(r);
  return s.den === 1n ? s.num.toString() : `${s.num}/${s.den}`;
}
