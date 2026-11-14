import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_ANSWER_MAX_LENGTH,
  checkShortAnswer,
} from "../../src/domain/shortAnswer.ts";

describe("shortAnswer - checkShortAnswer", () => {
  it("exports SHORT_ANSWER_MAX_LENGTH equal to 4", () => {
    assert.equal(SHORT_ANSWER_MAX_LENGTH, 4);
  });

  it("accepts valid short answers within 4 code points", () => {
    assert.deepEqual(checkShortAnswer("1,5"), []);
    assert.deepEqual(checkShortAnswer("-0,5"), []);
    assert.deepEqual(checkShortAnswer("1,50"), []);
    assert.deepEqual(checkShortAnswer("0"), []);
    assert.deepEqual(checkShortAnswer("1234"), []);
    assert.deepEqual(checkShortAnswer("-123"), []);
    assert.deepEqual(checkShortAnswer("1,23"), []);
    assert.deepEqual(checkShortAnswer(",5"), []);
    assert.deepEqual(checkShortAnswer("01"), []);
    assert.deepEqual(checkShortAnswer("-0"), []);
    assert.deepEqual(checkShortAnswer("--1"), []);
  });

  it("flags empty string as empty issue", () => {
    assert.deepEqual(checkShortAnswer(""), ["empty"]);
  });

  it("flags strings exceeding 4 code points as too_long", () => {
    assert.deepEqual(checkShortAnswer("12345"), ["too_long"]);
    assert.deepEqual(checkShortAnswer("-12,5"), ["too_long"]);
    assert.deepEqual(checkShortAnswer("12345678"), ["too_long"]);
  });

  it("flags invalid characters as bad_char", () => {
    // Period instead of comma
    assert.deepEqual(checkShortAnswer("1.5"), ["bad_char"]);

    // ASCII spaces
    assert.deepEqual(checkShortAnswer(" 1,5"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("1,5 "), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("1 5"), ["bad_char"]);

    // Non-breaking space (NBSP U+00A0)
    assert.deepEqual(checkShortAnswer("1\u00A05"), ["bad_char"]);

    // Unicode minus sign (U+2212)
    assert.deepEqual(checkShortAnswer("\u22120,5"), ["bad_char"]);

    // Fullwidth digits
    assert.deepEqual(checkShortAnswer("\uFF11\uFF12"), ["bad_char"]);

    // Emoji
    assert.deepEqual(checkShortAnswer("12😀"), ["bad_char"]);

    // Plus sign
    assert.deepEqual(checkShortAnswer("+1"), ["bad_char"]);

    // Letters
    assert.deepEqual(checkShortAnswer("abc"), ["bad_char"]);

    // Control characters
    assert.deepEqual(checkShortAnswer("\n"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("\t"), ["bad_char"]);
  });

  it("flags both too_long and bad_char when both violations occur", () => {
    assert.deepEqual(checkShortAnswer("12345a"), ["too_long", "bad_char"]);
    assert.deepEqual(checkShortAnswer("1234😀"), ["too_long", "bad_char"]);
  });

  it("handles non-string values safely without crashing", () => {
    assert.deepEqual(checkShortAnswer(null as unknown as string), ["bad_char"]);
    assert.deepEqual(checkShortAnswer(undefined as unknown as string), ["bad_char"]);
    assert.deepEqual(checkShortAnswer(1234 as unknown as string), ["bad_char"]);
  });

  it("counts astral Unicode characters as 1 code point for length check", () => {
    // 3 ASCII chars + 1 astral char (emoji) = 4 code points -> valid length, but bad_char
    assert.deepEqual(checkShortAnswer("123😀"), ["bad_char"]);
    // 4 ASCII chars + 1 astral char = 5 code points -> too_long and bad_char
    assert.deepEqual(checkShortAnswer("1234😀"), ["too_long", "bad_char"]);
  });

  it("strictly rejects Unicode dash/minus, comma variants, zero-width chars, and Vietnamese diacritics", () => {
    // Dash and minus variations outside ASCII 0x2D
    const dashVariants = ["\u2010", "\u2012", "\u2013", "\u2014", "\u2015", "\uFE63", "\uFF0D"];
    for (const dash of dashVariants) {
      assert.deepEqual(checkShortAnswer(`${dash}1`), ["bad_char"], `Should reject dash variant ${dash.codePointAt(0)?.toString(16)}`);
    }

    // Comma variations outside ASCII 0x2C
    const commaVariants = ["\u060C", "\u3001", "\uFE50", "\uFF0C"];
    for (const comma of commaVariants) {
      assert.deepEqual(checkShortAnswer(`1${comma}5`), ["bad_char"], `Should reject comma variant ${comma.codePointAt(0)?.toString(16)}`);
    }

    // Zero-width spaces and control characters
    const zeroWidth = ["\u200B", "\u200C", "\u200D", "\uFEFF"];
    for (const zw of zeroWidth) {
      assert.deepEqual(checkShortAnswer(`1${zw}2`), ["bad_char"], `Should reject zero-width character ${zw.codePointAt(0)?.toString(16)}`);
    }

    // Vietnamese diacritics and letters
    assert.deepEqual(checkShortAnswer("1,5đ"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("1,5à"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("ê"), ["bad_char"]);
  });
});
