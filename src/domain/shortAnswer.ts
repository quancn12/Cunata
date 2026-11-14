export const SHORT_ANSWER_MAX_LENGTH = 4;

export type ShortAnswerIssue = "empty" | "too_long" | "bad_char";

export function checkShortAnswer(raw: string): readonly ShortAnswerIssue[] {
  if (typeof raw !== "string") {
    return ["bad_char"];
  }

  const codePoints = Array.from(raw);
  if (codePoints.length === 0) {
    return ["empty"];
  }

  const issues: ShortAnswerIssue[] = [];

  if (codePoints.length > SHORT_ANSWER_MAX_LENGTH) {
    issues.push("too_long");
  }

  let hasBadChar = false;
  for (const ch of codePoints) {
    const code = ch.codePointAt(0);
    const isAllowed = code !== undefined && (
      (code >= 0x30 && code <= 0x39) || // 0-9
      code === 0x2D ||                   // - (U+002D)
      code === 0x2C                      // , (U+002C)
    );
    if (!isAllowed) {
      hasBadChar = true;
      break;
    }
  }

  if (hasBadChar) {
    issues.push("bad_char");
  }

  return issues;
}
