import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rational,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  sum,
  compare,
  equals,
  toFractionString,
  parseFractionString,
  toDecimalString,
  MAX_FRACTION_STRING_LENGTH,
  MAX_FRACTION_DIGITS,
  type Rational,
} from "../../src/domain/rational.ts";

describe("Rational - Chuẩn tắc hóa (Canonicalization)", () => {
  it("chuẩn tắc hóa dấu: mẫu âm chuyển dấu lên tử", () => {
    const r1 = rational(4, -6);
    assert.equal(r1.num, -2n);
    assert.equal(r1.den, 3n);

    const r2 = rational(-4, -6);
    assert.equal(r2.num, 2n);
    assert.equal(r2.den, 3n);

    const r3 = rational(-5, 1);
    assert.equal(r3.num, -5n);
    assert.equal(r3.den, 1n);
  });

  it("chuẩn tắc hóa gcd: tối giản phân số", () => {
    const r = rational(100, 25);
    assert.equal(r.num, 4n);
    assert.equal(r.den, 1n);

    const r2 = rational(42, 56);
    assert.equal(r2.num, 3n);
    assert.equal(r2.den, 4n);
  });

  it("chuẩn tắc hóa số 0: luôn là 0/1", () => {
    const z1 = rational(0);
    assert.equal(z1.num, 0n);
    assert.equal(z1.den, 1n);

    const z2 = rational(0, 100);
    assert.equal(z2.num, 0n);
    assert.equal(z2.den, 1n);

    const z3 = rational(0, -99);
    assert.equal(z3.num, 0n);
    assert.equal(z3.den, 1n);

    const z4 = rational(0n, 5n);
    assert.equal(z4.num, 0n);
    assert.equal(z4.den, 1n);
  });

  it("hằng số ZERO và ONE", () => {
    assert.equal(ZERO.num, 0n);
    assert.equal(ZERO.den, 1n);
    assert.equal(ONE.num, 1n);
    assert.equal(ONE.den, 1n);

    assert(Object.isFrozen(ZERO));
    assert(Object.isFrozen(ONE));
  });

  it("đối tượng Rational bị đóng băng (frozen / immutable)", () => {
    const r = rational(3, 4);
    assert(Object.isFrozen(r));
  });
});

describe("Rational - Kiểm tra kiểu và tính hợp lệ của số", () => {
  it("chấp nhận number là safe integer", () => {
    const r1 = rational(0);
    assert.equal(r1.num, 0n);
    assert.equal(r1.den, 1n);

    const r2 = rational(Number.MAX_SAFE_INTEGER);
    assert.equal(r2.num, BigInt(Number.MAX_SAFE_INTEGER));

    const r3 = rational(Number.MIN_SAFE_INTEGER);
    assert.equal(r3.num, BigInt(Number.MIN_SAFE_INTEGER));
  });

  it("ném RangeError khi number không phải safe integer ở tử số", () => {
    assert.throws(() => rational(1.5), RangeError);
    assert.throws(() => rational(-0.1), RangeError);
    assert.throws(() => rational(NaN), RangeError);
    assert.throws(() => rational(Infinity), RangeError);
    assert.throws(() => rational(-Infinity), RangeError);
    assert.throws(() => rational(Number.MAX_SAFE_INTEGER + 1), RangeError);
    assert.throws(() => rational(Number.MIN_SAFE_INTEGER - 1), RangeError);
  });

  it("ném RangeError khi number không phải safe integer ở mẫu số", () => {
    assert.throws(() => rational(1, 1.5), RangeError);
    assert.throws(() => rational(1, NaN), RangeError);
    assert.throws(() => rational(1, Infinity), RangeError);
    assert.throws(() => rational(1, -Infinity), RangeError);
    assert.throws(() => rational(1, Number.MAX_SAFE_INTEGER + 1), RangeError);
  });

  it("ném TypeError khi tham số không phải bigint hoặc number", () => {
    assert.throws(() => rational("1" as unknown as number), TypeError);
    assert.throws(() => rational(null as unknown as number), TypeError);
    assert.throws(() => rational(1, "2" as unknown as number), TypeError);
    assert.throws(() => rational(1, {} as unknown as number), TypeError);
  });

  it("chia cho 0 ném RangeError", () => {
    assert.throws(() => rational(1, 0), RangeError);
    assert.throws(() => rational(0, 0), RangeError);
    assert.throws(() => rational(1n, 0n), RangeError);
    assert.throws(() => rational(-5n, 0n), RangeError);
  });
});

describe("Rational - Các phép toán số học", () => {
  it("add: 10/3 cộng 3 lần bằng 10", () => {
    const a = rational(10, 3);
    const sum3 = add(add(a, a), a);
    assert.equal(sum3.num, 10n);
    assert.equal(sum3.den, 1n);
    assert(equals(sum3, rational(10)));
  });

  it("add: 10 lần 1/10 bằng 1", () => {
    const tenth = rational(1, 10);
    let s = ZERO;
    for (let i = 0; i < 10; i++) {
      s = add(s, tenth);
    }
    assert.equal(s.num, 1n);
    assert.equal(s.den, 1n);
    assert(equals(s, ONE));
  });

  it("add: các trường hợp cộng số âm và zero", () => {
    const r1 = rational(1, 3);
    const r2 = rational(-1, 3);
    assert(equals(add(r1, r2), ZERO));
    assert(equals(add(r1, ZERO), r1));
    assert(equals(add(ZERO, r1), r1));
  });

  it("sub: phép trừ", () => {
    const a = rational(5, 2);
    const b = rational(1, 2);
    assert(equals(sub(a, b), rational(2)));
    assert(equals(sub(b, a), rational(-2)));
    assert(equals(sub(a, a), ZERO));
    assert(equals(sub(a, ZERO), a));
    assert(equals(sub(ZERO, a), rational(-5, 2)));
  });

  it("mul: phép nhân", () => {
    const a = rational(2, 3);
    const b = rational(3, 4);
    assert(equals(mul(a, b), rational(1, 2)));
    assert(equals(mul(a, rational(-3, 4)), rational(-1, 2)));
    assert(equals(mul(a, ZERO), ZERO));
    assert(equals(mul(ZERO, a), ZERO));
    assert(equals(mul(a, ONE), a));
  });

  it("div: phép chia và chia cho 0", () => {
    const a = rational(2, 3);
    const b = rational(4, 5);
    assert(equals(div(a, b), rational(5, 6)));
    assert(equals(div(a, rational(-4, 5)), rational(-5, 6)));
    assert(equals(div(ZERO, a), ZERO));

    assert.throws(() => div(a, ZERO), RangeError);
    assert.throws(() => div(a, rational(0)), RangeError);
  });

  it("sum: tính tổng mảng phân số", () => {
    assert(equals(sum([]), ZERO));

    const single = rational(7, 3);
    assert(equals(sum([single]), single));

    const threeTenths = [rational(10, 3), rational(10, 3), rational(10, 3)];
    assert(equals(sum(threeTenths), rational(10)));

    const tenTenths = Array(10).fill(rational(1, 10));
    assert(equals(sum(tenTenths), ONE));
  });
});

describe("Rational - So sánh và bằng nhau (compare / equals)", () => {
  it("compare: so sánh các phân số", () => {
    assert.equal(compare(rational(1, 3), rational(1, 2)), -1);
    assert.equal(compare(rational(1, 2), rational(1, 3)), 1);
    assert.equal(compare(rational(2, 4), rational(1, 2)), 0);

    // Số âm
    assert.equal(compare(rational(-1, 2), rational(-1, 3)), -1);
    assert.equal(compare(rational(-1, 3), rational(-1, 2)), 1);
    assert.equal(compare(rational(-2, 4), rational(1, -2)), 0);
  });

  it("equals: so sánh đẳng thức", () => {
    assert.equal(equals(rational(2, 4), rational(1, 2)), true);
    assert.equal(equals(rational(0, 1), rational(0, 10)), true);
    assert.equal(equals(rational(-1, 2), rational(1, -2)), true);
    assert.equal(equals(rational(1, 2), rational(1, 3)), false);
    assert.equal(equals(rational(5), rational(5, 1)), true);
  });
});

describe("Rational - Chuỗi phân số hai chiều (toFractionString ↔ parseFractionString)", () => {
  it("toFractionString: định dạng chuẩn tắc", () => {
    assert.equal(toFractionString(ZERO), "0");
    assert.equal(toFractionString(rational(5)), "5");
    assert.equal(toFractionString(rational(-5)), "-5");
    assert.equal(toFractionString(rational(10, 3)), "10/3");
    assert.equal(toFractionString(rational(-1, 2)), "-1/2");
    assert.equal(toFractionString(rational(6, 2)), "3");
  });

  it("parseFractionString: đọc chuỗi hợp lệ", () => {
    assert(equals(parseFractionString("0"), ZERO));
    assert(equals(parseFractionString("5"), rational(5)));
    assert(equals(parseFractionString("-5"), rational(-5)));
    assert(equals(parseFractionString("10/3"), rational(10, 3)));
    assert(equals(parseFractionString("-1/2"), rational(-1, 2)));
    assert(equals(parseFractionString("12345678901234567890"), rational(12345678901234567890n)));
  });

  it("hai chiều: toFractionString(parseFractionString(s)) === s", () => {
    const validCases = [
      "0",
      "1",
      "-1",
      "42",
      "-42",
      "1/2",
      "-1/2",
      "10/3",
      "-10/3",
      "355/113",
      "-355/113",
      "999999999999999999/2",
    ];

    for (const s of validCases) {
      assert.equal(toFractionString(parseFractionString(s)), s);
    }
  });

  it("hai chiều: parseFractionString(toFractionString(r)) bằng r", () => {
    const rationals: Rational[] = [
      ZERO,
      ONE,
      rational(-1),
      rational(10, 3),
      rational(-10, 3),
      rational(1, 4),
      rational(-7, 11),
      rational(100),
    ];

    for (const r of rationals) {
      assert(equals(parseFractionString(toFractionString(r)), r));
    }
  });

  it("parseFractionString: ném SyntaxError với các chuỗi sai dạng", () => {
    const badStrings = [
      "",
      "   ",
      " 1/2",
      "1/2 ",
      "1 / 2",
      "+5",
      "+1/2",
      "-0",
      "-0/1",
      "01",
      "-01",
      "0/1",
      "0/5",
      "5/1",
      "-5/1",
      "2/4",
      "4/6",
      "1/-2",
      "1/0",
      "1.5",
      "1,5",
      "abc",
      "1/2/3",
      "1/-0",
      "NaN",
      "Infinity",
    ];

    for (const bad of badStrings) {
      assert.throws(
        () => parseFractionString(bad),
        SyntaxError,
        `Expected SyntaxError for: "${bad}"`
      );
    }

    assert.throws(() => parseFractionString(null as unknown as string), SyntaxError);
    assert.throws(() => parseFractionString(123 as unknown as string), SyntaxError);
    assert.throws(() => parseFractionString("1".repeat(201)), SyntaxError);
  });
});

describe("Rational - toDecimalString với half-up", () => {
  it("chuyển đổi thập phân cơ bản", () => {
    assert.equal(toDecimalString(rational(1, 2), 1, "half-up"), "0.5");
    assert.equal(toDecimalString(rational(1, 2), 2, "half-up"), "0.50");
    assert.equal(toDecimalString(rational(1, 4), 2, "half-up"), "0.25");
    assert.equal(toDecimalString(rational(1, 4), 3, "half-up"), "0.250");
  });

  it("phân số tuần hoàn", () => {
    assert.equal(toDecimalString(rational(10, 3), 2, "half-up"), "3.33");
    assert.equal(toDecimalString(rational(10, 3), 4, "half-up"), "3.3333");
    assert.equal(toDecimalString(rational(2, 3), 2, "half-up"), "0.67");
    assert.equal(toDecimalString(rational(1, 7), 3, "half-up"), "0.143");
    assert.equal(toDecimalString(rational(2, 7), 3, "half-up"), "0.286");
  });

  it("điểm giữa (midpoint tie-breaking) dương", () => {
    assert.equal(toDecimalString(rational(201, 200), 2, "half-up"), "1.01");
    assert.equal(toDecimalString(rational(199, 200), 2, "half-up"), "1.00");
    assert.equal(toDecimalString(rational(1, 2), 0, "half-up"), "1");
    assert.equal(toDecimalString(rational(5, 2), 0, "half-up"), "3");
    assert.equal(toDecimalString(rational(7, 2), 0, "half-up"), "4");
    assert.equal(toDecimalString(rational(1, 8), 2, "half-up"), "0.13");
    assert.equal(toDecimalString(rational(3, 8), 2, "half-up"), "0.38");
  });

  it("số âm và điểm giữa âm (half away from zero theo GDPT)", () => {
    assert.equal(toDecimalString(rational(-1, 2), 0, "half-up"), "-1");
    assert.equal(toDecimalString(rational(-5, 2), 0, "half-up"), "-3");
    assert.equal(toDecimalString(rational(-1, 4), 1, "half-up"), "-0.3");
    assert.equal(toDecimalString(rational(-1, 8), 2, "half-up"), "-0.13");
    assert.equal(toDecimalString(rational(-10, 3), 2, "half-up"), "-3.33");
    assert.equal(toDecimalString(rational(-2, 3), 2, "half-up"), "-0.67");
    assert.equal(toDecimalString(rational(-201, 200), 2, "half-up"), "-1.01");
    assert.equal(toDecimalString(rational(-199, 200), 2, "half-up"), "-1.00");
  });

  it("số âm làm tròn về 0 không có dấu trừ (-0)", () => {
    assert.equal(toDecimalString(rational(-1, 1000), 1, "half-up"), "0.0");
    assert.equal(toDecimalString(rational(-1, 3), 0, "half-up"), "0");
    assert.equal(toDecimalString(rational(-1, 100), 0, "half-up"), "0");
  });

  it("số 0 với các số chữ số thập phân khác nhau", () => {
    assert.equal(toDecimalString(ZERO, 0, "half-up"), "0");
    assert.equal(toDecimalString(ZERO, 1, "half-up"), "0.0");
    assert.equal(toDecimalString(ZERO, 2, "half-up"), "0.00");
    assert.equal(toDecimalString(ZERO, 5, "half-up"), "0.00000");
  });

  it("bắt lỗi tham số toDecimalString", () => {
    assert.throws(() => toDecimalString(rational(1, 2), -1, "half-up"), RangeError);
    assert.throws(() => toDecimalString(rational(1, 2), 101, "half-up"), RangeError);
    assert.throws(() => toDecimalString(rational(1, 2), 1.5, "half-up"), RangeError);
    assert.throws(() => toDecimalString(rational(1, 2), NaN, "half-up"), RangeError);
    assert.throws(() => toDecimalString(rational(1, 2), 2, "floor" as unknown as "half-up"), RangeError);
    assert.throws(() => toDecimalString(null as unknown as Rational, 2, "half-up"), TypeError);
  });
});

describe("Rational - Số rất lớn (BigInt 50+ digits)", () => {
  it("tính toán chính xác tuyệt đối với số rất lớn", () => {
    const huge1 = 10n ** 50n;
    const huge2 = 10n ** 50n * 3n;

    const r1 = rational(huge1, huge2);
    assert.equal(r1.num, 1n);
    assert.equal(r1.den, 3n);

    const a = rational(10n ** 40n + 1n, 2n);
    const b = rational(10n ** 40n - 1n, 2n);
    const s = add(a, b);
    assert.equal(s.num, 10n ** 40n);
    assert.equal(s.den, 1n);

    const diff = sub(a, b);
    assert.equal(diff.num, 1n);
    assert.equal(diff.den, 1n);

    const str = toFractionString(a);
    const parsed = parseFractionString(str);
    assert(equals(parsed, a));

    // Decimal string cho số lớn
    const dec = toDecimalString(a, 1, "half-up");
    assert.equal(dec, `${(10n ** 40n + 1n) / 2n}.5`);
  });
});

describe("Rational - Explicit Constants & Boundary Limits", () => {
  it("exports exact canonical constants MAX_FRACTION_STRING_LENGTH and MAX_FRACTION_DIGITS", () => {
    assert.equal(MAX_FRACTION_STRING_LENGTH, 200);
    assert.equal(MAX_FRACTION_DIGITS, 100);
    assert(Number.isSafeInteger(MAX_FRACTION_STRING_LENGTH));
    assert(Number.isSafeInteger(MAX_FRACTION_DIGITS));
  });

  it("parseFractionString strictly enforces MAX_FRACTION_STRING_LENGTH threshold", () => {
    // 200 digits is accepted (length 200)
    const validStr = "1" + "0".repeat(MAX_FRACTION_STRING_LENGTH - 1);
    assert.equal(validStr.length, MAX_FRACTION_STRING_LENGTH);
    const parsed = parseFractionString(validStr);
    assert.equal(parsed.den, 1n);

    // 201 digits is rejected (length 201)
    const invalidStr = "1" + "0".repeat(MAX_FRACTION_STRING_LENGTH);
    assert.equal(invalidStr.length, MAX_FRACTION_STRING_LENGTH + 1);
    assert.throws(() => parseFractionString(invalidStr), SyntaxError);
  });

  it("toDecimalString strictly enforces MAX_FRACTION_DIGITS boundary", () => {
    // Exactly MAX_FRACTION_DIGITS (100) digits
    const dec100 = toDecimalString(rational(1, 3), MAX_FRACTION_DIGITS, "half-up");
    assert.equal(dec100, "0." + "3".repeat(MAX_FRACTION_DIGITS));
    assert.equal(dec100.length, MAX_FRACTION_DIGITS + 2); // "0." + 100 chars

    // MAX_FRACTION_DIGITS + 1 (101) throws RangeError
    assert.throws(
      () => toDecimalString(rational(1, 3), MAX_FRACTION_DIGITS + 1, "half-up"),
      RangeError
    );
  });
});
