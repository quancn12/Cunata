# M1 — Scoring engine + models + unit tests: hợp đồng kỹ thuật (v1.0, 2026-11-14)

Người giao: Claude (Phó phòng). Nguồn nghiệp vụ: **Shared Product Contract v2.0, mục 2, 3, 5, 7** — tài liệu đó thắng
mọi thứ ở đây nếu mâu thuẫn; thấy mâu thuẫn thì báo `NEED_DECISION`, không tự sửa. Tiêu chí kiểm định: Codex
`docs/research/codex/READINESS.md` mục 6 (B1-AC01…08, B1-T01…T17, bảng golden).

Phạm vi M1: **chỉ chế độ đề tùy chỉnh** (`ruleSetId = "custom-v1"`). Không UI, không lưu trữ, không mạng, không mẫu chuẩn THPT.

## 1. Stack của M1 (không cài gì)

- TypeScript, chỉ cú pháp "xóa được" (không `enum`, không `namespace`, không parameter properties, không decorator).
  Chạy trực tiếp bằng Node >= 24 (type stripping gốc). ESM, import có đuôi `.ts`. Import chỉ-kiểu phải viết `import type`.
- Test: `node:test` + `node:assert/strict`. Lệnh: `node --test` tại `D:\Cunata` (đã thử trên máy này, Node v24.14.0).
- Số học điểm: phân số chính xác bằng `bigint`. **Cấm** `number` cho điểm, cấm `parseFloat`/`Number()` trên đáp án.
- **Không `npm install`, không thêm dependency.** `tsc` chưa được cài → typecheck ghi `NOT_RUN` trong bàn giao.
- Cấm `Math.random`, `Date.now`, I/O, biến toàn cục có trạng thái trong `src/domain`. Mọi hàm thuần, không sửa input.

## 2. Cách làm việc chung

- Một working tree `D:\Cunata`, mỗi worker **chỉ tạo/sửa đúng `scope_files` của mình**. Không sửa file của worker khác,
  không sửa `package.json`, `tsconfig.json`, `docs/`, `ops/`. Worker **không commit**; Claude commit theo từng đợt.
- File của worker khác có thể chưa tồn tại lúc bạn chạy (làm song song). Kiểu dữ liệu lấy đúng theo mục 3 và dùng
  `import type` (bị xóa lúc chạy nên test của bạn vẫn chạy được). Không tự tạo bản sao file của người khác.
- Chạy test của chính mình: `node --test <file test của bạn>` và ghi lệnh, exit code, số test pass/fail thật.
- Bàn giao (câu trả lời cuối, không thêm lời dẫn):
  ```
  RESULT: <task_id> / <READY_FOR_REVIEW|BLOCKED|NEED_DECISION>
  changed_files: <danh sách>
  tests: <lệnh> | exit=<n> | pass=<n> fail=<n>
  typecheck: NOT_RUN (tsc chưa cài)
  assumptions: <NONE | giả thiết đã tự đặt>
  known_issues: <NONE | ...>
  ```

## 3. Kiểu dữ liệu — `src/domain/model.ts` (chỉ chứa kiểu, không có giá trị runtime)

```ts
export type Id = string; // ổn định, không rỗng

export interface ChoiceOption { readonly optionId: Id }
export interface QuestionI {
  readonly kind: "I"; readonly questionVersionId: Id;
  readonly options: readonly ChoiceOption[];        // đúng 4, optionId không trùng
  readonly correctOptionId: Id;                     // phải thuộc options
}
export interface StatementII { readonly statementId: Id; readonly answer: boolean }
export interface QuestionII {
  readonly kind: "II"; readonly questionVersionId: Id;
  readonly statements: readonly StatementII[];      // đúng 4, statementId không trùng
}
export interface QuestionIII {
  readonly kind: "III"; readonly questionVersionId: Id;
  readonly answerKey: string;                       // 1..4 ký tự, chỉ gồm 0-9, '-', ','
}
export type Question = QuestionI | QuestionII | QuestionIII;

export interface ExamVersion {
  readonly examId: Id; readonly examVersionId: Id;
  readonly ruleSetId: "custom-v1";
  readonly inputPolicyId: "sa-charset-v1";
  readonly questions: readonly Question[];          // thứ tự gốc; phần suy ra từ kind
}

export interface ResponseI { readonly kind: "I"; readonly questionVersionId: Id; readonly selectedOptionId: Id | null }
export interface StatementAnswer { readonly statementId: Id; readonly value: boolean | null }
export interface ResponseII { readonly kind: "II"; readonly questionVersionId: Id; readonly answers: readonly StatementAnswer[] }
export interface ResponseIII { readonly kind: "III"; readonly questionVersionId: Id; readonly raw: string | null }
export type Response = ResponseI | ResponseII | ResponseIII;

export interface AttemptResponses {
  readonly attemptId: Id; readonly examVersionId: Id;
  readonly responses: readonly Response[];          // câu không có response = chưa làm
}

export interface ValidationIssue { readonly code: string; readonly path: string; readonly message: string }
```

Ghi chú bắt buộc: đáp án chuẩn gắn với **ID** (`correctOptionId`, `statementId`), không bao giờ với chữ A/B/C/D hay vị trí.

## 4. Module, chữ ký và quy tắc

### 4.1 `src/domain/rational.ts`
```ts
export interface Rational { readonly num: bigint; readonly den: bigint } // chuẩn tắc: den > 0, gcd = 1, số 0 là 0/1
export function rational(num: bigint | number, den?: bigint | number): Rational; // number phải là safe integer; den = 0 → RangeError
export const ZERO: Rational; export const ONE: Rational;
export function add(a: Rational, b: Rational): Rational;
export function sub(a: Rational, b: Rational): Rational;
export function mul(a: Rational, b: Rational): Rational;
export function div(a: Rational, b: Rational): Rational;          // chia cho 0 → RangeError
export function sum(xs: readonly Rational[]): Rational;           // mảng rỗng → ZERO
export function compare(a: Rational, b: Rational): -1 | 0 | 1;
export function equals(a: Rational, b: Rational): boolean;
export function toFractionString(r: Rational): string;            // "10/3", "5", "-1/2"
export function parseFractionString(s: string): Rational;         // nghịch đảo chặt của hàm trên; sai dạng → SyntaxError
export function toDecimalString(r: Rational, fractionDigits: number, mode: "half-up"): string; // CHỈ để hiển thị, dấu "."
```
`toDecimalString` chỉ phục vụ hiển thị; chính sách làm tròn chính thức **chưa được Trưởng phòng chốt** — không dùng nó trong chấm điểm.

### 4.2 `src/domain/shortAnswer.ts`
```ts
export const SHORT_ANSWER_MAX_LENGTH = 4;
export type ShortAnswerIssue = "empty" | "too_long" | "bad_char";
export function checkShortAnswer(raw: string): readonly ShortAnswerIssue[]; // [] = hợp lệ theo sa-charset-v1
```
Độ dài đếm theo code point. Ký tự cho phép: `0`–`9`, `-` (U+002D), `,` (U+002C). **Không trim, không chuẩn hóa Unicode, không cắt.**
Cú pháp chi tiết hơn (`--1`, `,5`, `01`, `-0`…) **chưa được chốt** → không tự cấm, không tự hợp thức hóa; chỉ kiểm tập ký tự và độ dài.

### 4.3 `src/domain/validate.ts`
```ts
export const MAX_QUESTIONS_PER_EXAM = 1000; // giới hạn tạm, chờ duyệt
export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
export function validateExamVersion(input: unknown): Validated<ExamVersion>;
export function validateAttemptResponses(exam: ExamVersion, input: unknown): Validated<AttemptResponses>;
```
Mã lỗi đề: `TYPE_MISMATCH`, `EXAM_EMPTY`, `LIMIT_EXCEEDED`, `ID_EMPTY`, `ID_DUPLICATE` (questionVersionId trong đề; optionId/statementId
trong một câu), `QUESTION_KIND_UNKNOWN`, `RULESET_UNKNOWN`, `INPUT_POLICY_UNKNOWN`, `I_OPTION_COUNT`, `I_KEY_NOT_IN_OPTIONS`,
`II_STATEMENT_COUNT`, `II_ANSWER_NOT_BOOLEAN`, `III_KEY_INVALID`.
Mã lỗi bài làm: `TYPE_MISMATCH`, `ATTEMPT_EXAM_MISMATCH`, `RESPONSE_DUPLICATE`, `RESPONSE_UNKNOWN_QUESTION`, `RESPONSE_KIND_MISMATCH`.
Đề thiếu/sai đáp án chuẩn là **lỗi dữ liệu đề**, không bao giờ biến thành 0 điểm của học sinh. Không ép kiểu ngầm
(`"true"` không phải `true`, `1` không phải `"1"`). Input là `unknown`: không tin, không dùng `in` trên prototype, không crash.

### 4.4 `src/domain/judge.ts` (so khớp thuần, không tính điểm)
```ts
export type JudgeI = "correct" | "wrong" | "unanswered" | "invalid";       // invalid: selectedOptionId không thuộc options của câu
export function judgeI(q: QuestionI, r: ResponseI | undefined): JudgeI;

export type StatementState = "correct" | "wrong" | "unanswered" | "invalid"; // invalid: một statementId xuất hiện >1 lần trong response
export interface JudgeIIResult {
  readonly correctCount: 0 | 1 | 2 | 3 | 4;
  readonly perStatement: readonly { readonly statementId: Id; readonly state: StatementState }[]; // theo thứ tự statements của câu
  readonly unknownStatementIds: readonly Id[];                               // id lạ trong response: bỏ qua, không cộng điểm
}
export function judgeII(q: QuestionII, r: ResponseII | undefined): JudgeIIResult;

export type JudgeIII = "correct" | "wrong" | "unanswered";
export function judgeIII(q: QuestionIII, r: ResponseIII | undefined): JudgeIII; // raw null hoặc "" = unanswered; đúng khi raw === answerKey
```
Phần II: ý `null`/thiếu = `unanswered`, **không bao giờ coi là `false`** (kể cả khi đáp án chuẩn là `false`). `correctCount` chỉ đếm
ý có `value === answer`. Phần III: so `===` từng ký tự; `1,5` ≠ `1,50` ≠ `1.5`; không parse số, không trim.

### 4.5 `src/domain/shuffle.ts`
```ts
export interface ShuffleSettings { readonly shuffleQuestions: boolean; readonly shuffleOptions: boolean }
export interface PresentationOrder {
  readonly seed: string;
  readonly questionOrder: readonly Id[];                                       // hoán vị của mọi questionVersionId
  readonly optionOrder: readonly { readonly questionVersionId: Id; readonly optionIds: readonly Id[] }[]; // mọi câu phần I
}
export function createPresentationOrder(exam: ExamVersion, settings: ShuffleSettings, seed: string): PresentationOrder;
export function validatePresentationOrder(exam: ExamVersion, order: PresentationOrder): readonly ValidationIssue[]; // [] = hợp lệ
```
Xác định hoàn toàn theo `(exam, settings, seed)`; hai cờ độc lập nhau. Các câu giữ nhóm theo phần I → II → III, chỉ trộn trong
từng phần (giả thiết của Claude, ghi rõ trong bàn giao). Mỗi câu phần I có hoán vị lựa chọn **riêng** (seed con theo
questionVersionId), không dùng chung một hoán vị. Không trộn 4 ý của phần II. PRNG tự viết, ghi rõ thuật toán; không phải mật mã.
Tắt cờ nào thì thứ tự phần đó giữ nguyên thứ tự gốc.

### 4.6 `src/domain/examMax.ts`
```ts
export interface SectionCounts { readonly n1: number; readonly n2: number; readonly n3: number }
export interface ExamMax { readonly maxI: Rational; readonly maxII: Rational; readonly pointIII: Rational;
                           readonly maxIII: Rational; readonly maxTotal: Rational }
export const POINT_I: Rational;                     // 1/4
export const PART2_POINTS: readonly Rational[];     // theo số ý đúng k = 0..4: 0, 1/10, 1/4, 1/2, 1
export function computeExamMax(c: SectionCounts): ExamMax; // số đếm không phải safe integer >= 0, hoặc cả ba bằng 0 → RangeError
```
`MAX_I = n1/4`; `MAX_II = n2`; `n3 = 0` → `pointIII = 0`, `maxIII = 0`; `n3 > 0` và `MAX_I + MAX_II < 10` →
`pointIII = (10 − MAX_I − MAX_II)/n3`; `n3 > 0` và `MAX_I + MAX_II >= 10` → `pointIII = 1/4`. `maxTotal` là tổng ba phần.
**Không quy về thang 10.** Ví dụ bắt buộc: (20,10,0)→15; (20,10,4)→16; (20,0,0)→5; (12,4,6)→10 với 1/2 mỗi câu III;
(0,0,3)→pointIII 10/3, max 10; (39,0,3)→pointIII 1/12; (40,0,3)→43/4; (41,0,3)→11.

### 4.7 `src/domain/scoreAttempt.ts` và `src/domain/index.ts`
```ts
export const ENGINE_VERSION = "m1-1.0.0";
export type QuestionStatus = "full" | "partial" | "wrong" | "unanswered" | "invalid";
export interface QuestionResult {
  readonly questionVersionId: Id; readonly kind: "I" | "II" | "III";
  readonly status: QuestionStatus; readonly points: Rational; readonly maxPoints: Rational;
  readonly correctCount?: number;                       // chỉ phần II
  readonly inputIssues?: readonly ShortAnswerIssue[];   // chỉ phần III khi raw không hợp lệ
}
export interface SectionResult { readonly questionCount: number; readonly score: Rational; readonly max: Rational }
export interface ScoreResult {
  readonly attemptId: Id; readonly examVersionId: Id;
  readonly ruleSetId: "custom-v1"; readonly inputPolicyId: "sa-charset-v1"; readonly engineVersion: string;
  readonly sections: { readonly I: SectionResult; readonly II: SectionResult; readonly III: SectionResult };
  readonly total: Rational; readonly maxTotal: Rational;
  readonly questions: readonly QuestionResult[];        // theo thứ tự gốc của đề
}
export class ScoringInputError extends Error { readonly issues: readonly ValidationIssue[] }
export function scoreAttempt(exam: unknown, attempt: unknown): ScoreResult; // tự validate; sai → ném ScoringInputError
```
Điểm: I đúng = 1/4. II theo `PART2_POINTS[correctCount]`. III đúng = `pointIII`. Trạng thái: I/III `correct`→`full`; II `k=4`→`full`,
`k=1..3`→`partial`, `k=0` và có ít nhất một ý đã trả lời→`wrong`, không ý nào trả lời→`unanswered`. Phần III: raw khác rỗng mà
`checkShortAnswer` có lỗi → `invalid`, 0 điểm (không cắt, không sửa). `total` = tổng điểm ba phần; tổng điểm các câu = điểm phần.
Thứ tự `responses` và thứ tự `answers` trong response không ảnh hưởng kết quả. `index.ts` re-export toàn bộ API công khai ở mục 4.

### 4.8 `src/domain/serialize.ts`
```ts
export function scoreResultToDTO(r: ScoreResult): unknown;       // JSON thuần; mọi Rational thành chuỗi toFractionString
export function scoreResultFromDTO(dto: unknown): ScoreResult;   // chặt; sai dạng → SyntaxError; không dùng JSON Number cho điểm
```
`scoreResultFromDTO(JSON.parse(JSON.stringify(scoreResultToDTO(r))))` phải bằng `r` về giá trị.

## 5. Phân công

| task_id | Engine | scope_files | Đợt |
|---|---|---|---|
| M1-A1 | Anti | `src/domain/rational.ts`, `test/domain/rational.test.ts` | 1 |
| M1-A2 | Anti | `src/domain/model.ts`, `src/domain/shortAnswer.ts`, `src/domain/validate.ts`, `test/domain/shortAnswer.test.ts`, `test/domain/validate.test.ts` | 1 |
| M1-A3 | Anti | `src/domain/judge.ts`, `test/domain/judge.test.ts` | 1 |
| M1-A4 | Anti | `src/domain/shuffle.ts`, `test/domain/shuffle.test.ts` | 1 |
| M1-C1 | Codex | `test/oracle/**` — oracle độc lập bằng Python `fractions` + fixtures JSON (mục 6) | 1 |
| M1-B1 | Anti | `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/index.ts`, `test/domain/examMax.test.ts`, `test/domain/scoreAttempt.test.ts` | 2 |
| M1-B2 | Anti | `src/domain/serialize.ts`, `test/domain/serialize.test.ts` | 2 |
| M1-B3 | Anti | `test/acceptance/**` — test hộp đen qua `src/domain/index.ts`: bảng golden, bất biến hoán vị, `0 <= score <= max`, đúng hết = max, không sửa input, chạy fixtures của M1-C1 | 2 |
| M1-C2 | Codex | Kiểm định độc lập toàn bộ M1 theo B1-AC/B1-T, trả verdict | 3 |

Yêu cầu test tối thiểu cho từng task: phủ mọi nhánh và mọi mã lỗi của module mình; M1-A3 phải vét cạn 16 đáp án × 81 vector trả lời
của phần II so với bảng tra; M1-B3 dùng PRNG có seed cố định (không cài fast-check) và ghi seed khi fail.

## 6. Fixtures của oracle (M1-C1) — `test/oracle/fixtures/*.json`

Mỗi file: `{ "schema": "m1-fixture-v1", "cases": [ { "id": string, "exam": ExamVersion, "attempt": AttemptResponses,
"expected": { "sections": { "I": {"score": "n/d", "max": "n/d"}, "II": {...}, "III": {...} }, "total": "n/d", "maxTotal": "n/d" } } ] }`.
`exam`/`attempt` đúng kiểu ở mục 3. Expected do oracle Python tính **độc lập** từ Shared Product Contract mục 2, không gọi code trong `src/`.
Phân số ở dạng `toFractionString` (tối giản, mẫu dương, số nguyên viết không có `/1`).

## 7. Việc còn chờ Trưởng phòng quyết (không chặn M1, không được tự chốt)

1. Cú pháp chi tiết của đáp án trả lời ngắn ngoài tập ký tự và độ dài.
2. Chính sách làm tròn khi hiển thị.
3. Mẫu chuẩn THPT theo môn/năm (ngoài phạm vi M1).
4. Cài `typescript` để typecheck (hiện `NOT_RUN`).
5. Giới hạn số câu mỗi đề (tạm 1000) và việc các câu giữ nhóm theo phần khi trộn.
