# WEB — Hợp đồng kỹ thuật M2–M6, v1.0 (2026-11-14)

## 1. Nguồn, phạm vi và baseline

Shared Product Contract v2.0 thắng mọi tài liệu; kế thừa toàn bộ M1-scoring-contract.md. Đây là thiết kế và backlog để review, KHÔNG chứng nhận M2–M6 hoàn thành hoặc phê duyệt các policy còn mở. Task WEB-PLAN chỉ viết file này và ops/web/tasks.json; không code sản phẩm, install, commit hay deploy. base_commit trong manifest là HEAD theo yêu cầu; snapshot đọc thực tế: `038a7a9a420c2eea1afba7a3f724c8cc00d7580b`. Điều phối phải chụp SHA/diff mới trước mỗi wave, giữ các thay đổi có sẵn của người khác.

Đã đối chiếu src/domain/*, index.html, scripts/build.js, package.json, hai tsconfig, README, test/domain, acceptance, e2e và oracle; review bắt buộc LOOP-28-codex.md. Code hiện tại đã tiến xa hơn LC28: inline shuffle, snapshot, lịch sử, builder/bank và collector tồn tại. Không được giao worker viết lại toàn bộ tính năng từ mô tả LC28. Trích xuất hành vi có test, sửa sai có regression, bổ sung phần thiếu.

Baseline chạy thật trong WEB-PLAN: `node --test --test-reporter=tap "test/**/*.test.ts"` exit 1: 394 tests, 59 suites, 393 pass, 1 fail, 0 skip. Test fail: `LC35-F03 regression: attempt A exhausting retry budget does not starve attempt B of its retry budget`, tại test/e2e/demoFlow.test.ts:4141, assertion `Retry callback 1 must exist` tại :4180. Không xóa/skip/làm yếu test để xanh. Cả `npx --no-install tsc -p tsconfig.json` và `npx --no-install tsc -p tsconfig.web.json` exit 0. `node scripts/build.js` exit 0 nhưng hiện chỉ kiểm asset/schema/syntax Apps Script, KHÔNG emit dist. `python -B test/oracle/oracle.py --check` exit 0, 11 pass, 0 fail; 1.632 fixtures, 5.849 maxima configs, 9 negative controls. Test tên e2e hiện là Node VM với DOM/storage/fetch stubs, không phải browser thật. Browser/IME/AT/CORS live trong phiên lập kế hoạch: NOT_RUN.

## 2. Quy tắc worker, ownership và gate

- ops/web/tasks.json là phân công duy nhất. Engine anti cho mọi code; WEB-REVIEW là codex, review_only=true. Không sửa src/domain; mọi chấm, validation điểm, rational, shuffle phải import qua `src/domain/index.ts`, không deep import và không giữ bản scorer inline thứ hai sau cutover.
- Mỗi wave 6–10 task, scope không giao nhau (kể cả glob cha/con). File wave trước là read-only trừ khi scope wave sau nhận lại. Chỉ đúng một task mỗi wave được sở hữu bất kỳ file nào trong index.html/scripts/build.js/README.md; gọi là glue. Task khác không sửa cả ba file này. Chỉ glue sửa tsconfig dùng chung. Không sửa package/lock/dependency. Test worker ở test/<vùng>/**/*.test.ts, node:test + assert/strict; ghi lệnh/exit/pass/fail/skip, typecheck cả hai config. NOT_RUN phải có lý do, không dùng mock thay bằng chứng live.
- Wave barrier: không bắt đầu wave sau trước khi API wave trước tồn tại, tests/typecheck/build gate xanh hoặc điều phối ghi blocker. Trong wave chỉ type-import API đã có từ wave trước; không tự tạo stub production hay bản sao file worker khác. Glue có thể làm chuẩn bị song song nhưng tích hợp sau khi các module cùng wave hoàn tất. Scope mismatch → bàn giao blocker, không lấn vùng.
- W1 sửa baseline đỏ và LC28-F01 trước; gate cuối W1 bắt buộc full suite xanh. W1–W2 giữ index.html legacy chạy được trực tiếp, không thay entrypoint bằng module chưa kiểm. W3 là wave cutover có compatibility harness; root demo vẫn mở được; module build chạy qua HTTP. W4 hardening. W5 nghiệm thu sau sửa, không deploy.
- Wave 5: WEB-FINAL-DOCS là glue duy nhất (README + wrapper scripts/build.js). WEB-FINAL-INTEGRATE sửa src/app và scripts/web-build.ts, KHÔNG sửa ba file glue. Chuẩn bị docs/review có thể song song; trình tự chốt trong wave: các fix → integrate → docs/wrapper → WEB-REVIEW đọc snapshot ổn định. Review bị invalidated nếu source đổi sau SHA/hash đã kiểm; không review trước rồi coi code đến sau đã được duyệt.
- Handoff từng task theo M1 §2; cập nhật typecheck theo compiler thực tế 7.0.2, không chép NOT_RUN cũ. Mỗi wave có evidence + changelog + rollback dưới docs/web/wave-N.md do glue sở hữu. Không tuyên bố DONE nếu còn blocker/critical, test fail hoặc owner chưa nghiệm thu milestone.

## 3. Thư mục và hướng phụ thuộc

| Vùng | Trách nhiệm và entrypoint |
| --- | --- |
| src/domain (giữ nguyên) | Scoring M1, API index.ts, bigint Rational |
| src/schema | types.ts, exam.ts: DTO/JSON, metadata/rich content, validate/normalize tương thích |
| src/storage | index.ts: IndexedDB, localStorage migration, transactions, backup/delete |
| src/student | index.ts, view.ts: controller attempt, timer, palette/input/history |
| src/report | index.ts, view.ts, download.ts: projection theo policy, HTML/print |
| src/ui | index.ts: DOM an toàn, component focus/dialog/status, CSS vùng riêng |
| src/teacher | index.ts, view.ts: draft soạn đề, preview/publish immutable |
| src/bank | index.ts, view.ts: taxonomy/query/version reuse |
| src/collect | index.ts, export.ts: outbox, transport, JSON/CSV, receipt |
| src/import/zip | index.ts: ZIP reader gốc + giới hạn |
| src/import/docx | index.ts: XML DOCX → IR |
| src/import/pdf | index.ts: PDF preview/manual fallback có giới hạn |
| src/import/preview | index.ts: hiệu đính IR/confirm, không tự publish |
| src/app | main.ts, shell.html, legacy.ts: composition root/routes/adapters |
| src/offline | service-worker.ts: cache shell/assets đề đã chọn, version/update |
| scripts/web-build.ts | build không dependency; scripts/build.js là wrapper do glue |
| apps-script/sample | mẫu riêng; code cũ apps-script/Code.js không phải dịch vụ đã deploy |

schema chỉ phụ thuộc type/API domain; UI chỉ render dữ liệu đã chiếu; student phụ thuộc schema + domain + StoragePort; teacher/bank phụ thuộc schema + StoragePort + domain; importer chỉ sinh IR, preview gọi teacher qua callback; collect nhận immutable final, không điều khiển timer; app nối ports. Không circular import, không module dùng global studentState/currentExam. Native API bọc qua ports để unit-test thời gian/storage/transport. Không dependency runtime, CDN, framework, OCR/LLM trả phí hoặc npm install. Mọi TS dùng erasable syntax, import `.ts`, `import type`, Node >=24.

## 4. Hợp đồng dữ liệu đề và JSON

Kiểu dưới đây do src/schema/types.ts sở hữu; import các kiểu M1 từ ../domain/index.ts. Các trường readonly và deep-clone/freeze tại publish/start, không chỉ readonly compile-time.

```ts
import type { ExamVersion, QuestionI, QuestionII, QuestionIII, ChoiceOption, StatementII, Response, AttemptResponses,
  PresentationOrder, ScoreResult, Validated, ValidationIssue } from '../domain/index.ts';
export type Section = 'I'|'II'|'III';
export type ReleasePolicy = 'immediate'|'after_deadline';
export interface Taxonomy {
  readonly subject: string; readonly grade: 10|11|12;
  readonly topic: string; readonly lesson: string;
  readonly difficulty: 'Nhận biết'|'Thông hiểu'|'Vận dụng';
}
export type Block =
  | { readonly type:'text'; readonly text:string }
  | { readonly type:'math'; readonly source:string; readonly format:'latex'|'omml'; readonly verified:boolean }
  | { readonly type:'image'; readonly assetId:string; readonly alt:string }
  | { readonly type:'table'; readonly rows:readonly (readonly Cell[])[] };
export interface Cell { readonly blocks:readonly Block[]; readonly rowSpan:number; readonly colSpan:number }
export interface Provenance { readonly sourceId:string; readonly location:string;
  readonly confidence:number|null; readonly flags:readonly string[] }
export interface Asset { readonly assetId:string; readonly mime:string; readonly data:string; readonly alt:string }
export interface WebOption extends ChoiceOption { readonly label?:string; readonly text:string }
export interface WebStatement extends StatementII {
  readonly label?:string; readonly text:string; readonly explanation?:string;
}
export interface QuestionContent extends Partial<Taxonomy> {
  readonly questionId?:string; readonly title?:string; readonly content?:string;
  readonly image?:string; readonly explanation?:string; readonly blocks?:readonly Block[];
  readonly provenance?:Provenance;
}
export type WebQuestion =
  | (Omit<QuestionI,'options'> & QuestionContent & { readonly options:readonly WebOption[] })
  | (Omit<QuestionII,'statements'> & QuestionContent & { readonly statements:readonly WebStatement[] })
  | (QuestionIII & QuestionContent);
export interface ExamSettings {
  readonly durationMinutes:number; readonly maxAttempts:number|null;
  readonly releasePolicy:ReleasePolicy;
  readonly shuffleQuestions:boolean; readonly shuffleOptions:boolean;
}
export interface WebExam extends Omit<ExamVersion,'questions'> {
  readonly schemaVersion:'web-exam-v1'; readonly title:string;
  readonly subject:string; readonly grade:10|11|12;
  readonly settings:ExamSettings; readonly questions:readonly WebQuestion[];
  readonly assets:readonly Asset[];
}
export interface AttemptKey { readonly examId:string; readonly examVersionId:string; readonly attemptId:string }
export interface AttemptRecord extends AttemptKey {
  readonly schemaVersion:'web-attempt-v1'; readonly revision:number;
  readonly candidateName:string; readonly examSnapshot:WebExam;
  readonly presentationOrder:PresentationOrder; readonly responses:AttemptResponses;
  readonly startedAt:number; readonly deadline:number;
  readonly phase:'draft'|'final'; readonly submittedAt:number|null;
  readonly scoreDTO:unknown|null;
}
export type SaveState = 'local_saved'|'queued'|'sending'|'server_confirmed'|'failed';
export interface Receipt extends AttemptKey { readonly submissionId:string;
  readonly payloadHash:string; readonly receivedAt:string; readonly status:'recorded'|'already_recorded' }
export interface OutboxRecord extends AttemptKey {
  readonly state:SaveState; readonly finalRevision:number; readonly payloadHash:string;
  readonly endpointId:string|null; readonly retryCount:number; readonly nextRetryAt:number|null;
  readonly generation:number; readonly receipt:Receipt|null; readonly lastError:string|null;
}
export interface WebError { readonly code:string; readonly path:string; readonly message:string; readonly recoverable:boolean }
export type Result<T> = {readonly ok:true;readonly value:T}|{readonly ok:false;readonly error:WebError};
export interface ImportJob { readonly jobId:string; readonly sourceId:string;
  readonly format:'docx'|'pdf'; readonly state:'reading'|'preview'|'confirmed'|'failed';
  readonly blocks:readonly Block[]; readonly drafts:readonly ImportDraft[];
  readonly flags:readonly string[] }
export interface ImportDraft { readonly draftId:string; readonly question:Partial<WebQuestion>;
  readonly provenance:Provenance; readonly confirmed:boolean }
```

`WebQuestion` I/II giữ `text`, `label`, explanation trên options/statements như sample hiện tại. Không làm mất text nested khi projection domain hoặc export roundtrip. `Response` III chỉ string|null, không input type=number, không trim/normalize/cắt/Number/parseFloat. Validation nhập liệu chỉ charset/4 code point của M1, grammar chưa duyệt không thêm regex hẹp.

API schema: `parseExam(input:unknown):Validated<WebExam>`; `toDomainExam(exam:WebExam):ExamVersion`; `exportExam(exam:WebExam):string`; `validateImportDraft(draft:ImportDraft):readonly ValidationIssue[]`. Kiểm metadata riêng rồi gọi validateExamVersion qua barrel. Giữ đúng ID đáp án; không suy từ label A/B/C/D. Đề không có đáp án → lỗi dữ liệu/chờ hiệu đính, không chấm thành 0.

### 4.1 Tương thích sample và legacy

JSON canonical xuất ra có schemaVersion web-exam-v1, ruleSetId custom-v1, inputPolicyId sa-charset-v1, questions giống domain cộng metadata; score luôn chuỗi phân số chuẩn qua scoreResultToDTO/FromDTO. Không JSON.stringify bigint trực tiếp. Metadata không phải quyền truy cập.

`public/sample-exam.json` thiếu schemaVersion/settings/assets vẫn phải nạp được, bảo toàn examId/examVersionId, content Markdown, image, options text/label và statements explanation. Legacy durationMinutes/shuffleSettings/releasePolicy/maxAttempts ở top-level được chuyển vào settings. Thứ tự ưu tiên: canonical settings > legacy top-level > embedded demo defaults có nhãn kế thừa; nếu hai giá trị explicit mâu thuẫn, báo EXAM_SETTINGS_CONFLICT, không âm thầm chọn. Defaults legacy: durationMinutes có sẵn hoặc 50 của demo; shuffle false, maxAttempts null, release immediate. Đây là adapter kế thừa cho fixture luyện tập, không policy mới cho đề publish. Builder phải yêu cầu settings explicit. collectorUrl từ file đề là dữ liệu không tin cậy; không tự gửi tới URL nhập vào; chỉ endpoint owner-approved ngoài đề.

Asset nội bộ giữ relative public/... của sample; export portable đóng gói data/asset map, whitelist MIME PNG/JPEG/WebP và SVG nội bộ đã kiểm; SVG nhập từ người dùng chỉ giữ nguồn inert/cảnh báo, không inject DOM. Chặn javascript:, external relationships/fetch tự động, file path traversal. Text/LaTeX hiển thị escaped; không hứa renderer LaTeX hoàn chỉnh khi không có thư viện, giữ source có nhãn cho ký pháp chưa hỗ trợ.

### 4.2 Fixtures môn học

W1 schema tạo public/exams/{toan-full,ly-part-I,hoa-repeating}.json, nhãn **đề tùy chỉnh minh họa**, không giả mẫu thi chuẩn Bộ. Toán đầy đủ I/II/III (có thể kế thừa sample); Lý 20 câu chỉ I → max 5; Hóa 3 câu chỉ III → mỗi câu 10/3, tổng 10. Đáp án và lời giải được kiểm tay theo nội dung; thêm golden max 15/16 và 10/7 bằng fixtures test, không cần bịa đề chuẩn. Test dùng API domain, điểm expected độc lập, metadata Unicode và export/import giữ ID/text. Mẫu chuẩn chỉ triển khai sau quyết định D05.

## 5. Chữ ký giữa module, sự kiện và lifecycle

Các entrypoint export đúng các chữ ký dưới đây, các kiểu dùng từ schema/types.ts và domain barrel. Helper riêng được phép trong vùng. Callback trả unsubscribe; mọi promise reject phải được app bắt và hiển thị lỗi trung thực.

```ts
// storage/index.ts
export interface StoragePort {
  load(key:AttemptKey):Promise<Result<AttemptRecord|null>>;
  create(record:AttemptRecord):Promise<Result<AttemptRecord>>;
  saveDraft(record:AttemptRecord, expectedRevision:number):Promise<Result<AttemptRecord>>;
  finalize(record:AttemptRecord, expectedRevision:number):Promise<Result<AttemptRecord>>;
  listAttempts(examId:string, examVersionId:string):Promise<Result<readonly AttemptRecord[]>>;
  getObject(store:'bank'|'exams'|'imports', id:string):Promise<Result<unknown|null>>;
  putObject(store:'bank'|'exams'|'imports', id:string, value:unknown, expectedRevision:number|null):Promise<Result<number>>;
  deleteObject(store:'bank'|'exams'|'imports', id:string, expectedRevision:number):Promise<Result<void>>;
  getOutbox(key:AttemptKey):Promise<Result<OutboxRecord|null>>;
  updateOutbox(value:OutboxRecord, expectedGeneration:number|null):Promise<Result<OutboxRecord>>;
  exportBackup():Promise<Result<Blob>>;
  importBackup(input:unknown):Promise<Result<void>>;
  clearAll(confirmed:boolean):Promise<Result<void>>;
}
export function openStorage():Promise<Result<StoragePort>>;
// student/index.ts: injected clock/id generators; không global DOM
export interface StudentController {
  getSnapshot():AttemptRecord;
  answer(response:Response):Promise<Result<AttemptRecord>>;
  rename(raw:string):Promise<Result<AttemptRecord>>;
  submit(reason:'manual'|'deadline'):Promise<Result<AttemptRecord>>;
  subscribe(listener:(event:WebEvent)=>void):()=>void;
  dispose():void;
}
export function startAttempt(exam:WebExam, candidateName:string,
  deps:{storage:StoragePort;now:()=>number;id:()=>string}):Promise<Result<StudentController>>;
export function resumeAttempt(key:AttemptKey,
  deps:{storage:StoragePort;now:()=>number;id:()=>string}):Promise<Result<StudentController>>;
// report/index.ts
export interface ReportQuestion {
  readonly questionVersionId:string; readonly kind:Section;
  readonly title:string; readonly blocks:readonly Block[]; readonly response:Response|null;
  readonly status:'full'|'partial'|'wrong'|'unanswered'|'invalid';
  readonly points:string; readonly maxPoints:string;
}
export interface ReleasedReportQuestion extends ReportQuestion {
  readonly answer: string | readonly {readonly statementId:string;readonly answer:boolean}[];
  readonly explanation:readonly Block[];
}
export interface ReportBase { readonly attempt:AttemptKey; readonly candidateName:string;
  readonly startedAt:number; readonly submittedAt:number; readonly scoreDTO:unknown;
  readonly assets:readonly Asset[] }
export type ReportModel = ReportBase & (
  | {readonly released:false; readonly questions:readonly ReportQuestion[]}
  | {readonly released:true; readonly questions:readonly ReleasedReportQuestion[]});
export function buildReport(final:AttemptRecord, now:number):Result<ReportModel>;
export function renderReportHtml(model:ReportModel):string;
export function downloadReport(model:ReportModel):Blob;
// teacher/index.ts
export interface ExamDraft { readonly draftId:string; readonly revision:number; readonly exam:WebExam }
export function createDraft(exam:WebExam, draftId:string):ExamDraft;
export function editDraft(draft:ExamDraft, patch:unknown):Result<ExamDraft>;
export function publishDraft(draft:ExamDraft, newVersionId:string, storage:StoragePort):Promise<Result<WebExam>>;
// bank/index.ts
export interface BankEntry { readonly questionId:string; readonly questionVersionId:string;
  readonly revision:number; readonly taxonomy:Taxonomy; readonly question:WebQuestion }
export function queryBank(entries:readonly BankEntry[], filter:Partial<Taxonomy> & {text?:string;kind?:Section}):readonly BankEntry[];
export function saveBankEntry(entry:BankEntry, expectedRevision:number|null, storage:StoragePort):Promise<Result<BankEntry>>;
export function addToDraft(draft:ExamDraft, entry:BankEntry, id:()=>string):Result<ExamDraft>;
// collect/index.ts, export.ts: transport nhận endpoint đã duyệt do app inject
export interface CollectorPort { send(final:AttemptRecord, signal:AbortSignal):Promise<unknown> }
export function enqueue(final:AttemptRecord, storage:StoragePort, endpointId:string|null):Promise<Result<OutboxRecord>>;
export function drainOutbox(key:AttemptKey, deps:{storage:StoragePort;transport:CollectorPort;now:()=>number}):Promise<Result<OutboxRecord>>;
export function validateReceipt(input:unknown, expected:OutboxRecord):Result<Receipt>;
export function exportResults(finals:readonly AttemptRecord[], format:'json'|'csv'):Blob;
// import/zip/index.ts
export interface ZipLimits { readonly maxInputBytes:number; readonly maxEntries:number;
  readonly maxExpandedBytes:number; readonly maxEntryBytes:number }
export interface ZipEntry { readonly name:string; readonly bytes:Uint8Array }
export function readZip(bytes:Uint8Array, limits:ZipLimits, signal:AbortSignal):Promise<Result<readonly ZipEntry[]>>;
// import/docx/index.ts, import/pdf/index.ts
export function importDocx(file:File, signal:AbortSignal):Promise<Result<ImportJob>>;
export function importPdf(file:File, signal:AbortSignal):Promise<Result<ImportJob>>;
// import/preview/index.ts
export function editImport(job:ImportJob, draftId:string, patch:unknown):Result<ImportJob>;
export function confirmImport(job:ImportJob, exam:ExamDraft):Result<ExamDraft>;
// ui/index.ts + views (student/report/teacher/bank/preview) cùng convention
export function mount(root:HTMLElement, model:unknown, actions:Readonly<Record<string,(value:unknown)=>void>>):()=>void;
// app/main.ts
export function bootstrap(root:HTMLElement):Promise<()=>void>;
```

ReportModel là projection mới, không spread WebQuestion có keys vào model chưa release; answer phần I là optionId, III là raw key, II là array theo statementId. Nội dung/response/status và điểm phân số hiện cả khi chưa release; không thêm field key/explanation vào nhánh released:false. `unknown` ở biên DTO/view không được cast để bỏ validation; test xác nhận chưa release không chứa key/explanation trong DOM/HTML/Blob/print/history. buildReport gọi scoreAttempt(snapshot, responses), so scoreDTO lưu với kết quả recompute; mismatch → SCORE_MISMATCH/quarantine. Không tin stored/client score là authoritative. Mỗi port/type nằm tại vùng ghi trong comment, các vùng khác type-import entrypoint đó; schema không sao chép StoragePort/StudentController/ReportModel/ExamDraft để tránh hai nguồn kiểu.

Sự kiện do schema/types.ts sở hữu:
```ts
export type WebEvent =
 | {readonly type:'attempt_changed';readonly record:AttemptRecord}
 | {readonly type:'attempt_finalized';readonly record:AttemptRecord}
 | {readonly type:'sync_changed';readonly key:AttemptKey;readonly outbox:OutboxRecord}
 | {readonly type:'storage_conflict';readonly key:AttemptKey;readonly revision:number}
 | {readonly type:'error';readonly error:WebError};
```
Không dùng sự kiện làm nguồn sự thật: nhận event phải đọc lại transaction record; BroadcastChannel chỉ phát key/revision/phase, không nickname/answer key. UI unsubscribe/dispose khi chuyển route. async collector callback phải pin tuple AttemptKey + payloadHash + generation, không lấy attempt đang mở để cập nhật.

## 6. Lưu trữ, timer, offline và hai tab

Thiết kế đề xuất D03: IndexedDB `cunata-web`, version 1, stores attempts (key [examId,examVersionId,attemptId]), outbox (cùng key), bank (questionVersionId), exams ([examId,examVersionId]), imports (jobId), meta/quarantine. bank/exams/imports dùng revision envelope. Một readwrite transaction attempts+outbox thực hiện finalize và tạo local_saved record; existing final luôn thắng, không ghi đè score/responses/name/order. saveDraft đọc revision và phase trong cùng transaction, stale revision → STORAGE_CONFLICT. updateOutbox CAS generation chỉ cập nhật sync metadata riêng, không sửa immutable final. LocalStorage chỉ prefs và đọc dữ liệu legacy, không coi read→write là atomic. Nếu D03 chưa duyệt: có thể code/test adapter nhưng không bật migration/cutover mặc định.

Migration đọc các key thực tế `cunata:active_attempt:*`, `cunata:attempt:*`, `cunata:final:*`, `cunata:history:*`, `cunata:snapshot:*`, `cunata:active_exam_snapshot`, `cunata:question_bank`, `cunata_exam_attempt_v1` và STORAGE_KEY legacy trong index. Xác minh prefix/encoding bằng helper thật trước viết mapper. Không đoán delimiter khi ID có `:`. Map responses record cũ → domain arrays giữ own special IDs bằng Map/Object.hasOwn; không ép II thiếu/null thành false. Chuẩn hóa legacy score từ recompute, không lấy number cũ làm rational. Main/final/legacy cùng quy tắc validation; dữ liệu hỏng đưa quarantine, giải thích và cho export raw, không im lặng bỏ mất bài. Migration copy/validate/commit/mark; retry idempotent, không xóa nguồn trước khi xác nhận backup/khôi phục. Không đổi snapshot attempt cũ bằng sample mới. Unknown future schema → STORAGE_VERSION_UNSUPPORTED, giữ nguyên nguồn.

Timer epoch ms: deadline = startedAt + duration, remaining = max(0, ceil((deadline-now)/1000)); interval chỉ render. visibilitychange/pageshow/resume luôn kiểm deadline, autosubmit exactly-once qua transaction. Không reset deadline nếu clock lùi; báo CLOCK_CHANGED, vẫn không thể chống sửa giờ client tuyệt đối. Restore hydrate nickname/state trước mọi autosubmit (LC28-F01), manual submit flush input đã commit composition. Hai tab khác attempt độc lập; cùng attempt stale write bị reject, adopt final đầy đủ metadata. BroadcastChannel/storage event là notification, không khóa. Private/quota/IDB unavailable → báo lỗi lưu, cho tải khẩn cấp, không giả local_saved hoặc silently fallback mất bảo đảm.

Cold-start offline: src/offline/service-worker.ts cache versioned shell, JS/CSS và sample/asset cùng origin; đề người dùng/snapshot dùng IDB, không cache dữ liệu collector hoặc report của người khác. Chỉ hiện “sẵn sàng offline” sau precache verified; lần đầu chưa online thì không hứa mở được. Không activate SW mới giữa bài; báo cập nhật sau khi nộp. HTTP localhost/HTTPS, path-relative hỗ trợ GitHub Pages subpath. file:// demo legacy vẫn mở trực tiếp, SW/IDB/module capability có giới hạn phải ghi rõ. Xóa dữ liệu gồm IDB/local keys/cache có xác nhận, export backup trước xóa; nickname không xác thực, không chứa dữ liệu thật trong fixtures.

## 7. M4 — thu kết quả và giới hạn trust

Mặc định chỉ local practice/export JSON/CSV. collector disabled khi chưa có D04; không lấy endpoint tùy ý từ đề/localStorage. Các trạng thái là sync state riêng với phase draft/final: local_saved chỉ sau durable transaction; queued chỉ khi đã ghi outbox sẵn gửi; sending khi request thật đã bắt đầu; server_confirmed chỉ sau readable validated receipt khớp tuple/hash; failed sau lỗi/quá budget, giữ final/export/retry có kiểm soát. Lỗi lưu local phải có trạng thái UI “chưa lưu/lỗi lưu” ngoài SaveState, không nhầm failed network với mất local.

Budget kỹ thuật đề xuất: tối đa 5 lần gửi gồm lần đầu, backoff 1/2/4/8 giây, timeout 10 giây, nextRetryAt/retryCount durable theo từng tuple; reload/online/chuyển đề không reset budget. Không retry 4xx/receipt sai; network/timeout/5xx có giới hạn. CAS generation chặn response cũ, server_confirmed terminal; mất response sau server write phải retry cùng idempotency key và body, không thêm bản ghi. Server phải atomic dedupe tuple + hash; cùng tuple khác hash → conflict, không overwrite. Export payload `schemaVersion:web-result-v1`, exam/attempt IDs, engine/rules/input policy, started/submitted, raw responses, scoreDTO chuỗi rational; hạn chế PII. Nếu cần trusted grading server dùng key/exam version tin cậy và recompute, không tin key/điểm client.

CSV quote mọi ô, double quote nội bộ, CRLF; chống formula injection cho mọi trường untrusted (nickname, ID, raw III, nội dung): phát hiện prefix = + - @, whitespace/control và dạng fullwidth tương đương; thêm apostrophe, vẫn giữ raw nguyên trong JSON. `-0,5` không bị tính thành công thức; test mở/đọc bằng parser độc lập, có chú thích CSV safe encoding khác raw. JSON không dùng CSV sanitization làm thay đổi đáp án.

Apps Script mẫu ở apps-script/sample/{Code.js,appsscript.json,README.md}: ghi nhãn **“chưa triển khai, chưa kiểm CORS thật”**, không credentials/token/URL ghi lâu dài. Đọc code cũ để giữ regression injection/dedupe nhưng không coi VM mock là xác nhận Google thật. Không fetch no-cors rồi báo success; opaque response không receipt. Nghiệm thu live chỉ sau owner duyệt dịch vụ/quyền: browser origin thật → CORS/redirect/preflight khi có → write → receipt → owner readback Sheets/Drive → retry dedupe; NOT_RUN nếu chưa có quyền, không tuyên bố đã gửi Drive. Static web không có admin auth, không secret URL; teacher/bank là công cụ soạn cục bộ. Key bundled/client-side chỉ phù hợp luyện tập; ẩn DOM theo release là UX, không bảo mật key. Bài kiểm tra cần giấu key hoặc tin điểm phải gated trusted service, không giả cung cấp bằng static-only.

## 8. M5 — DOCX/PDF, IR, preview/hiệu đính

Pipeline bắt buộc đọc → parse → IR → preview/sửa → xác nhận → lưu/xuất; không tự thêm bank/publish khi đọc xong. IR Block/ImportDraft có provenance location (DOCX part/paragraph/table, PDF page/manual region), confidence null nếu không đo, flags rõ. Thiếu key giữ draft chưa hoàn tất, không đoán. Nguồn lỗi hoặc không hỗ trợ giữ file/source inert có đường tải về.

DOCX: ZIP central directory với stored/deflate, DecompressionStream('deflate-raw') + feature detect. Kiểm CRC/size, duplicate names, offsets, overlap, zip slip, encrypted/ZIP64 unsupported; reject trước cấp phát quá lớn, tính tổng bytes thực khi stream decompress để chống zip bomb. XML DOMParser với parsererror, chặn DOCTYPE/entities, không external resolution. Đọc word/document.xml, relationships, styles/numbering nếu có; giữ paragraphs/runs/table rowSpan-colSpan/media nội bộ, alt text và OMML nguồn. Không execute macro, embed HTML, fetch external rel; font/ảnh không hỗ trợ có flag, không xóa âm thầm. OMML→LaTeX chỉ subset có tests đối chiếu; còn lại giữ nguồn và cảnh báo. Câu/phần/option/key nhận dạng heuristic có provenance, bắt buộc người sửa xác nhận.

PDF không có API trình duyệt gốc để trích xuất text/layout tổng quát; DecompressionStream không thay PDF parser. Phạm vi được phép: kiểm signature/size, preview bằng native viewer khi có + tải/mở file, người dùng copy text hoặc nhập thủ công vào IR, đánh dấu `PDF_MANUAL_REVIEW_REQUIRED`. Không hứa tự trích text-layer, multi-column, ảnh, công thức hoặc OCR scan; scan → `PDF_OCR_UNAVAILABLE`, cho nhập/chèn ảnh thủ công có nguồn. Unsupported encrypted/corrupt/không viewer: cảnh báo, không gọi hoàn tất. D06 quyết định có nâng stack sau hay chấp nhận MVP manual. Chưa có quyết định thì không quảng cáo “nhập PDF tự động”. Không tạo PDF parser sơ sài rồi silently sai layout.

Resource caps kỹ thuật đề xuất D07: input 10 MiB; ZIP 2.000 entries; expanded 50 MiB; entry 10 MiB; parse 15 giây, hủy bằng AbortSignal, preview phân trang/lazy, reject đúng boundary. Không áp cap mới lên legacy âm thầm; owner quyết trước bật. Corpus tests: Unicode/Telex, nhiều cột, numbering, bảng gộp, ảnh, OMML unsupported, thiếu keys, malformed XML/ZIP, external relationship, zip bomb, PDF text/scan/encrypted; fixtures synthetic không dữ liệu cá nhân/copyright ngoài quyền.

## 9. Màn hình và acceptance

| Màn hình | Gate chấp nhận |
| --- | --- |
| Chọn/nhập đề + nickname | 3 đề mẫu; JSON invalid không mất attempt; tên không xác thực có nhãn; maxAttempts chỉ advisory local, không claim chống lách; đổi đề không đổi snapshot cũ |
| Làm bài | I bốn lựa chọn ID, II bốn ý true/false/null, III raw string; palette trạng thái; trộn 2 cờ độc lập; reload giữ ID/order/input/timer; IME composition/paste không cắt hoặc nhảy cursor |
| Trạng thái lưu/mạng | Phân biệt offline/local/error/queue/sending/receipt; quota không badge success; reload lạnh offline đã cache; hai tab thật không stale overwrite |
| Xác nhận nộp | Focus dialog/return focus, cảnh báo chưa làm, double click/deadline chỉ một final, LC28 restore tên đúng, lỗi scoring không chốt final sai |
| Báo cáo/lịch sử | Tổng và I/II/III đạt/tối đa, có 12/15, 11/16, 5 max, 10/3 exact; thời gian/ID/name, partial II không full; key/explanation theo release; immutable history |
| HTML download/print | Blob UTF-8 self-contained, images embedded, không external tracking/key ẩn; mở khi mất mạng; window.print có CSS và không claim tự ghi PDF; chờ release thì tải lại bản mới, không nhúng key hẹn giờ vào bản cũ |
| Soạn đề | Bật/tắt phần, max lấy computeExamMax; draft chưa hợp lệ được sửa nhưng không publish; edit/reorder/duplicate remap ID+key; publish version mới, snapshot cũ bất biến |
| Bank | 5 tầng taxonomy, search/filter đồng thời, immutable versions, reuse không sửa nguồn; import/export/backup/delete có xác nhận; duplicate source cảnh báo |
| Thu kết quả | JSON/CSV offline usable; queued/sending/failed thật; isolation attempt A/B, late receipt/reload/timeout/idempotency; live Google gated, không giả quyền |
| Nhập/preview | DOCX IR giữ text/bảng/ảnh/OMML hoặc flag; PDF giới hạn §8; edit/key mapping/confirm từng draft; cancel/fail không ghi một nửa vào bank |

M6 xuyên màn hình: tiếng Việt, 320/390/768/1280 CSS px, zoom 200%, keyboard-only, focus visible/không trap ngoài modal, labels/fieldset/legend, status aria-live không đọc timer từng giây, contrast WCAG AA (4.5:1 text/3:1 UI lớn), touch target mục tiêu 44px. Telex/VNI thật cần người/công cụ nhập OS, dispatch composition event chỉ test mô phỏng. Math/table/image không overflow che đáp án. Reduced-motion, không cảnh báo alert chặn timer dài. Ghi screenshot/trace/log thật, thiếu browser/axe/Lighthouse thì NOT_RUN, không cài tool tự ý.

Performance mục tiêu kỹ thuật để đo, không claim đã đạt: 1000 câu (cap M1 chưa duyệt) không render toàn DOM ngay; input→paint p95 <100ms trên môi trường ghi rõ; initial compressed shell <500 KiB không tính đề/media; lần hiển thị đầu <2 giây trên local HTTP đã ghi máy/trình duyệt; import caps §8. Benchmark trước/sau, heap/long tasks nếu API hỗ trợ; không giả kết quả từ unit tests.

## 10. Build, local run, parity và rollback

Đích một lệnh `node scripts/build.js` → validate + typecheck + emit module ES2022 sang dist/ + copy shell/styles/public + SW, exit khác 0 khi asset thiếu/type/error. scripts/web-build.ts dùng child_process gọi `npx --no-install tsc` hiện có với config emit riêng tsconfig.build.json (noEmit false, rewriteRelativeImportExtensions true, allowImportingTsExtensions phù hợp), không bundler/dependency mới. Config build chỉ src runtime, không test/node scripts; imports `.ts` thành `.js`; module graph kiểm không còn bare import/server paths. Hai tsconfig kiểm tra hiện tại vẫn sạch. Glue W1 chuẩn bị config; W2 chuẩn bị build trong khi legacy còn chạy; W3 mới cutover.

dist/index.html module entry src/app/main.js theo outDir/rootDir thực tế, assets relative, hoạt động dưới subpath `/Cunata/`. Root index giữ demo legacy suốt W1–W2. W3 có src/app/legacy.ts bridge tới module cho HTTP và fallback artifact cho mở root file trực tiếp; cách tạo fallback dùng cùng source compiler/output, không duy trì scorer viết tay thứ hai. Fallback có thể dùng TypeScript compiler API đã cài ở build-time để chuyển static module graph sang IIFE với bảng exports (AST, không regex xóa imports), reject cycle/dynamic import chưa hỗ trợ; không đưa TypeScript runtime vào browser bundle. Test source/module/fallback differential cùng fixtures. Nếu chưa chứng minh file:// fallback thì không thay root legacy; ghi cutover BLOCKED, không nhận mất khả năng mở demo. Không gọi scripts/update-index.js cũ (có thể tái sinh implementation lỗi).

Xem build: `python -m http.server 8000 --directory dist`, mở http://localhost:8000/; test thêm subpath bằng server repo mở /dist/ và mô phỏng /Cunata/. Không `npx serve` có thể tải package. Offline cần localhost/HTTPS và đã cache lần đầu. HTML report là file portable, PDF dùng window.print, không dependency.

Parity gate trước đổi root: chạy legacy và module trên cùng 1.632 fixtures oracle, so total/max/từng phần/status/raw/order; legacy sai theo contract thì regression ghi rõ corrected behavior, không giữ bug để parity. VM e2e cũ phải xanh qua bridge/harness dùng chung domain, giữ các assertions hành vi, không xóa test. Browser thật làm→refresh→offline→deadline/manual→nộp→báo cáo→download/in, hai tab, Unicode name; compare semantic JSON + screenshots theo viewport, không chỉ DOM contains. Các test acceptance/oracle/domain phải xanh mỗi wave. Không ghi count cố định là bảo đảm.

Rollback: mỗi docs/web/wave-N.md ghi SHA/hash trước/sau, API changed, checks và giới hạn. Build tạo staging rồi promote dist khi checks qua, không để build fail phá demo. Bản legacy có hash làm mốc, không ghi đè source bằng helper cũ. Migration giữ nguồn/backup; rollback UI không downgrade DB destructive; schema mới unsupported phải báo và cho export, owner duyệt recovery. Điều phối mới commit theo đợt, worker không commit. Không có deploy trong backlog này.

## 11. Mã lỗi và xử lý

Giữ nguyên codes domain/ValidationIssue, không đổi sang lỗi điểm 0. Web Result error gồm code/path/message/recoverable, message tiếng Việt escaped, không secret/raw PII trong console. Tối thiểu:

| Nhóm | Codes và hành động |
| --- | --- |
| Schema | EXAM_SETTINGS_CONFLICT, EXAM_SCHEMA_UNSUPPORTED, ASSET_UNSAFE, PAYLOAD_LIMIT; từ chối import, giữ bài cũ |
| Storage | STORAGE_UNAVAILABLE, STORAGE_QUOTA, STORAGE_CONFLICT, STORAGE_CORRUPT, STORAGE_VERSION_UNSUPPORTED; không success giả, export/quarantine |
| Attempt | ATTEMPT_FINALIZED, ATTEMPT_LIMIT_LOCAL, CLOCK_CHANGED, SCORE_MISMATCH; adopt final/không reset deadline, cảnh báo trust |
| Collector | COLLECTOR_DISABLED, COLLECTOR_TIMEOUT, COLLECTOR_NETWORK, COLLECTOR_HTTP, RECEIPT_INVALID, PAYLOAD_CONFLICT, RETRY_EXHAUSTED; giữ final, không server_confirmed |
| Import | ZIP_INVALID, ZIP_UNSUPPORTED, ZIP_LIMIT, XML_INVALID, DOCX_UNSUPPORTED, IMPORT_CANCELLED, IMPORT_KEY_MISSING, IMPORT_UNCONFIRMED, PDF_MANUAL_REVIEW_REQUIRED, PDF_OCR_UNAVAILABLE; preview/cảnh báo, không tự publish |
| Download | REPORT_POLICY_LOCKED, REPORT_ASSET_MISSING, DOWNLOAD_FAILED; không embed key trước release, cho retry |

## 12. Cần Trưởng phòng chốt

Không thấy bằng chứng phê duyệt thay thế các quyết định mở LC28. Chưa chốt không ngăn viết plan, sửa bug hoặc test ports; chặn bật tính năng/policy và nghiệm thu tương ứng. Status bàn giao WEB-PLAN: NEED_DECISION theo yêu cầu task; đủ hai file để review, không tự biến lựa chọn kỹ thuật đề xuất thành quyết định nghiệp vụ.

| ID | 2–3 phương án và gate |
| --- | --- |
| D01 Grammar III | A giữ charset/4 ký tự sa-charset-v1 tạm; B grammar hẹp bằng inputPolicyId mới; C policy riêng theo preset đã duyệt. Chặn validator nghiệp vụ mới, không đổi scoring hiện có. |
| D02 Điểm hiển thị | A chỉ phân số exact; B số thập phân với digits/mode do owner chọn, vẫn rational; C exact kèm decimal xấp xỉ có nhãn. Chặn chốt format báo cáo, API nhận policy không tự đặt rounding chính thức. |
| D03 Storage/report | A localStorage demo + HTML, giới hạn race nêu rõ, chưa nghiệm thu hai tab; B IndexedDB transactional + localStorage migration + HTML/print đề xuất §6; C B + PDF engine sau đánh giá riêng. Chặn bật migration/cutover và nghiệm thu M2; không tự phê duyệt chỉ vì API native được phép. |
| D04 Collector/quyền | A local/export, chưa thu Google; B owner-controlled Apps Script pilot, kiểm CORS/receipt/readback thật; C trung gian serverless được duyệt để grading/release đáng tin. Chặn gửi mạng, production M4; không URL token dài hạn trong bundle. |
| D05 Preset chuẩn | A chỉ custom-v1; B chọn môn/năm/văn bản chính thức để verify trước khi thêm ruleSet. Chặn nhãn “chuẩn THPT”, không chặn ba đề minh họa. |
| D06 PDF | A chấp nhận native preview + manual IR, không OCR/auto extraction; B duyệt thư viện/parser riêng sau đánh giá; C hoãn PDF tự động sang milestone sau. Chặn claim importer đầy đủ và nghiệm thu phần tự động của M5. |
| D07 Limits/grouping | A duyệt M1 1000 câu, nhóm I→II→III khi trộn, caps §8; B đổi limits/grouping có version/migration/regression. Chặn áp giới hạn mới như policy đã duyệt. |
| D08 Release/assessment | A luyện tập keys client, immediate; B luyện tập after_deadline chỉ UX, chấp nhận hạn chế clock/key; C kiểm tra giấu key/trusted grading cần dịch vụ duyệt D04. Chặn quảng cáo bảo mật bài kiểm tra chỉ bằng web tĩnh. |

## 13. Lịch thực thi và evidence cuối

Manifest gồm 5 wave: 10 / 10 / 8 / 8 / 6 task (42 tổng). W1 APIs/ports/ZIP/sửa regression; W2 views/DOCX/PDF/build; W3 ghép module và offline; W4 hardening/browser/security/performance; W5 sửa cuối/tích hợp/docs/review ổn định. Không phải mọi mục cần owner quyết đều có thể hoàn tất trong 5 wave nếu chưa nhận quyết định; task phụ thuộc phải bàn giao NEED_DECISION/NOT_IMPLEMENTED đúng nghĩa, không demo giả.

WEB-REVIEW kiểm diff source + working tree và dependency/permission changes, không chỉ HEAD (worker không commit); ghi SHA/hash và test evidence, findings severity/file:line/repro/fix/regression, coverage gaps, verdict. Final release không được APPROVED nếu còn blocker/critical hoặc suite đỏ; policy chưa chốt ghi NEEDS_OWNER_DECISION. Owner acceptance theo M2–M6 độc lập với kế hoạch READY_FOR_REVIEW. Evidence baseline ở §1 chỉ xác minh code có sẵn, không test một implementation tương lai.

## 14. Quyết định Trưởng phòng đã chốt (16/11/2026) — ưu tiên hơn mục 12

Nguồn đầy đủ: `docs/decisions/BANG-QUYET-DINH.md`. Kiểm định tự động: `test/claude-check/web.test.mjs` (các ca D02, D08).

- **D01 = A.** Phần III: chữ số 0–9, dấu phẩy, dấu trừ, tối đa 4 ký tự (`sa-charset-v1`). Ký tự khác không được nhận im lặng.
- **D02.** Mọi điểm hiển thị (từng phần, tổng, từng câu, trên trang và trong file báo cáo): số không nguyên luôn đúng 2 chữ số thập phân với dấu phẩy (`0,50`, `4,75`, `10,50`); số nguyên hiện số nguyên (`10`). Làm tròn nửa lên từ giá trị phân số chính xác (14/3 → `4,67`). Không đổi cách tính điểm.
- **D05 = A.** Chỉ `custom-v1`; chưa có nhãn "chuẩn THPT".
- **D07 = A.** Tối đa 1000 câu/đề; trộn trong từng phần, giữ thứ tự I → II → III.
- **D08.** Sau khi nộp, báo cáo hiện lời giải chi tiết của MỌI câu (kể cả câu sai và câu bỏ trống), trên trang và trong file tải về. `releasePolicy: after_deadline` xử lý như `immediate`; bỏ tùy chọn này khỏi màn soạn đề. Luôn có mục tải kết quả về máy khi kết quả chưa được máy chủ xác nhận.
- **ND-01 = A.** Màn soạn đề đang có câu sửa dở (chưa lưu hoặc không hợp lệ): chặn "Nạp vào phòng thi" và xuất JSON, báo rõ phải lưu hoặc hủy.
- **Chưa chốt:** D03, D04, D06 — giữ hành vi hiện tại, không bật tính năng mới thuộc ba mục này.
- **D03 = B (chốt đợt 2).** Bài đang làm lưu bằng IndexedDB trên máy học sinh; mở lại cùng máy/cùng trình duyệt phải vào đúng bài đang làm dở, đồng hồ tính theo hạn nộp.
- **D04 = Google Sheet + Apps Script (chốt đợt 2, chi phí 0).** Chưa bật gửi mạng cho tới khi Trưởng phòng triển khai endpoint; giữ xuất file và nút tải kết quả.
- **D06 (chốt đợt 2).** DOCX là đường nhập chính; PDF chỉ xem và nhập tay, không thêm thư viện.

## 15. Danh sách đề và chọn đề (Trưởng phòng chốt 16/11/2026)

Trưởng phòng chốt: bộ đề Vật lí 12 hàng tuần đưa lên web công khai; học sinh chọn đề trong danh sách. Kiểm định: `test/claude-check/web.test.mjs` (hai ca "chọn đề").

- **Dữ liệu:** `public/exams/index.json` = `{ "version": 1, "exams": [ { id, title, subject, grade, durationMinutes, questionCount, group, url } ] }`, do `ops/exams/manifest.py` sinh (KHÔNG sửa tay, KHÔNG gắn cứng danh sách trong mã). `url` là đường dẫn tương đối so với trang (ví dụ `public/exams/ly12/de10.json`). Bản build phải chép nguyên thư mục `public/` vào `dist/public/`.
- **Giao diện (cả `index.html` gốc lẫn `dist/`):** nút `#btnOpenExamList` ("Chọn đề") luôn thấy ở màn làm bài và màn báo cáo. Bấm mở hộp thoại `#examListModal` (`role="dialog"`, `aria-modal="true"`, Esc đóng, tiêu điểm vào trong hộp thoại). Trong đó các đề gom theo `group`; mỗi đề là một `button.exam-list-item` có `data-exam-url="<url>"`, hiện tiêu đề, số câu, thời gian.
- **Hành vi:** bấm một đề → tải JSON theo `url` (tương đối, chạy được dưới `/Cunata/`) → nạp vào phòng thi đúng như khi nạp file qua `#examFileInput` (cùng kiểm tra hợp lệ, cùng cách xử lý bài đang làm dở: hỏi xác nhận trước khi bỏ bài dở) → đóng hộp thoại. Đề đã có bài làm dở trên máy thì mở lại đúng bài dở đó.
- **Liên kết thẳng:** `?exam=<examId>` trên địa chỉ trang → khởi động xong nạp luôn đề có `id` đó.
- **Lỗi:** không tải được danh sách hoặc đề (mất mạng lần đầu, file hỏng) → báo rõ trong hộp thoại, không treo, không làm mất bài đang làm.
- **Offline (dist):** đề đã mở một lần phải mở lại được khi mất mạng.

## 16. Màn vào thi: nhập tên và chọn đề trước (Trưởng phòng chốt 16/11/2026)

Trưởng phòng: "học sinh vào web phát là đang hiện 1 đề rồi, đáng lẽ phải cho điền tên và chọn đề trước". Kiểm định: các ca "màn vào thi" trong `test/claude-check/web.test.mjs`; DOM trong `test/claude-check/README.md`.

- **Không còn tự nạp đề mẫu khi mở trang.** Mở trang mà máy KHÔNG có bài đang làm dở → hiện màn vào thi `#startScreen`; `#examWrapper` và `#reportWrapper` ẩn, không hiện câu hỏi nào.
- **Màn vào thi gồm:** ô tên `input#startName` (bắt buộc; bỏ khoảng trắng đầu cuối; rỗng thì không tính), danh sách đề lấy từ `public/exams/index.json` gom theo `group`, mỗi đề là `button.exam-list-item[data-exam-url]` (đề đang chọn có `aria-pressed="true"`), nút `#btnStartExam` chỉ bấm được khi có tên VÀ đã chọn đề. Bấm → nạp đề, bắt đầu lượt làm với `#candidateName` = tên đã nhập, đóng màn vào thi.
- **Tên nhớ cho lần sau:** tên đã dùng được điền sẵn vào `#startName` ở lần mở sau (lưu cục bộ).
- **`?exam=<examId>`:** vẫn hiện màn vào thi, đề đó được chọn sẵn; nhập tên rồi bắt đầu. Nếu đúng đề đó đang có bài dở thì vào thẳng bài dở.
- **Có bài đang làm dở (chưa nộp) → vào thẳng bài dở** như quyết định D03 (tải lại trang không bị đẩy ra màn vào thi). Nút "Chọn đề" `#btnOpenExamList` ở màn làm bài và màn báo cáo vẫn mở danh sách để đổi đề (mục 15).
- **Mất mạng lần đầu / không tải được danh sách:** màn vào thi báo rõ lỗi và có nút thử lại; không treo.
- Màn vào thi không tràn ngang ở bề rộng 360 px; dùng được bằng bàn phím (Tab tới ô tên, danh sách, nút bắt đầu; Enter để bắt đầu).

## 17. Google Sheet + Apps Script: kho đề của giáo viên và thu kết quả (Trưởng phòng chốt 16/11/2026)

Trưởng phòng chọn Google Sheet + Apps Script (chi phí 0) cho cả thu kết quả (D04) lẫn việc thầy cô sửa và xuất bản đề. Một Apps Script duy nhất: `apps-script/Code.js`.
Kiểm định: `test/claude-check/appsscript.test.mjs` (chạy Code.js thật trên Google giả lập) và `test/claude-check/teacher.test.mjs` (trình duyệt thật + máy chủ giả lập đúng hành vi Apps Script).

### 17.1 Cấu hình
- `public/config.json` = `{ "appsScriptUrl": "" }`. Chuỗi rỗng = chưa triển khai: web chạy như hiện tại (đề tĩnh, kết quả chỉ lưu máy + tải file), nút giáo viên báo "chưa cấu hình", KHÔNG gửi request mạng nào tới Apps Script.
- URL Apps Script không phải bí mật. Mật khẩu giáo viên KHÔNG bao giờ nằm trong mã web hay repo: Trưởng phòng đặt trong Script Properties `TEACHER_PASSWORD` của Apps Script.
- Không có cơ chế ghi đè URL qua địa chỉ trang (`?api=` …) — chống lừa học sinh gửi bài sang máy chủ lạ.

### 17.2 Giao tiếp (đúng cách Apps Script web app hoạt động)
- Đọc: `GET <url>?action=listExams` và `GET <url>?action=getExam&id=<examId>`. Ghi: `POST <url>` với `Content-Type: text/plain;charset=utf-8`, thân là JSON (tránh CORS preflight). Client phải theo redirect 302 (Apps Script trả về qua `script.googleusercontent.com`).
- Mọi phản hồi là JSON có `success: true|false`; lỗi có `error` (mã) và `message` (tiếng Việt). Mật khẩu chỉ đi trong thân POST, không bao giờ trong URL, không bao giờ được trả lại trong phản hồi.
- Hành động POST (`action`):
  - không có `action` hoặc `"submitResult"`: nộp kết quả — giữ nguyên hợp đồng hiện có của Code.js (idempotent theo `attempt_id`, chống formula injection, `PAYLOAD_CONFLICT`).
  - `"teacherLogin"` `{password}` → `{success:true}` hoặc `UNAUTHORIZED`; chưa đặt `TEACHER_PASSWORD` → `TEACHER_PASSWORD_NOT_SET`.
  - `"publishExam"` `{password, exam}` → kiểm tra mật khẩu, kiểm tra đề hợp lệ tối thiểu (lược đồ `web-exam-v1`: examId, title, questions; mỗi câu I có 4 phương án và `correctOptionId` thuộc phương án; mỗi câu II có 4 ý `answer` boolean; mỗi câu III có `answerKey` 1–4 ký tự `0-9,-`) → sai trả `INVALID_EXAM` kèm danh sách lỗi; đúng thì lưu (cùng `examId` thì thay bản cũ, tăng `revision`) → `{success:true, examId, revision}`.
  - `"unpublishExam"` `{password, examId}` → gỡ khỏi danh sách.
- `listExams` → `{success:true, exams:[{id,title,subject,grade,durationMinutes,questionCount,group,revision,updatedAt}]}` chỉ gồm đề đang xuất bản. `getExam` → `{success:true, exam}` (đúng nguyên văn đề đã xuất bản) hoặc `NOT_FOUND`.

### 17.3 Lưu trong Google Sheet
- Kết quả ghi vào trang tính tên **`KetQua`**; đề ghi vào trang tính **`DeThi`** (tự tạo nếu chưa có). Không dùng `getActiveSheet()` để chọn nơi ghi.
- Một ô Google Sheets chứa tối đa 50 000 ký tự: JSON đề phải được chia khúc (≤ 40 000 ký tự/ô) và ghép lại nguyên vẹn; đề nặng (có hình nhúng) vẫn xuất bản và đọc lại đúng từng byte.
- Ô nào có thể bị Sheets hiểu là công thức (bắt đầu bằng `= + - @`) phải được lưu sao cho đọc lại đúng nguyên văn.
- Ghi có `LockService` như phần kết quả.

### 17.4 Phía web
- **Danh sách đề** (màn vào thi, mục 16, và hộp thoại chọn đề, mục 15) = đề tĩnh trong `public/exams/index.json` ∪ đề giáo viên xuất bản (`listExams`). Trùng `examId` thì bản giáo viên xuất bản thắng. Đề xuất bản giữ `group` của nó; không có thì vào nhóm "Đề giáo viên xuất bản". Không gọi được Apps Script → vẫn hiện đề tĩnh, kèm dòng báo "chưa tải được đề của giáo viên".
- **Trang giáo viên:** nút `#btnTeacher` ("Giáo viên") ở màn vào thi; mở thẳng bằng `?teacher`. Đăng nhập trong `#teacherLogin` (ô `input#teacherPassword[type=password]`, nút `#btnTeacherLogin`; sai mật khẩu hiện lỗi trong `#teacherLoginError`). Mật khẩu chỉ giữ trong bộ nhớ phiên (sessionStorage), không lưu localStorage.
- **Bảng giáo viên `#teacherPanel`:** liệt kê mọi đề (tĩnh + đã xuất bản) dạng `.teacher-exam-row[data-exam-id]`, mỗi dòng có nút `.btn-teacher-edit` (mở trình soạn đề với đề đó) và với đề đã xuất bản thêm `.btn-teacher-unpublish`; có nút `#btnTeacherNewExam` (soạn đề mới).
- **Trình soạn đề** có nút `#btnPublishExam` ("Xuất bản lên web") khi đang ở chế độ giáo viên: gửi `publishExam`, báo thành công/lỗi rõ ràng (lỗi `INVALID_EXAM` hiện danh sách lỗi), không mất bản đang soạn khi lỗi. Áp dụng ND-01: đang sửa dở chưa lưu thì chặn xuất bản.
- **Nộp kết quả:** sau khi nộp, gửi `submitResult` với payload hiện có (`buildWebResultPayload`) — trạng thái trung thực: `#syncText` hiện "Đang gửi…", rồi "Đã gửi" khi nhận `success:true`, hoặc "Chưa gửi được — sẽ thử lại" khi lỗi; tự thử lại theo outbox; nút tải kết quả luôn có (D08). Chưa cấu hình thì vẫn "Đã lưu cục bộ".
- **DOM bắt buộc thêm (kiểm định dựa vào):** mọi mục đề trong danh sách (màn vào thi và hộp thoại chọn đề) có `data-exam-id="<examId>"`; đề tĩnh có thêm `data-exam-url`, đề giáo viên xuất bản có `data-exam-source="teacher"`. Nút `#btnTeacher` nằm trong `#startScreen`. Chưa cấu hình: `#teacherLogin` hiện chữ "chưa cấu hình". Kết quả xuất bản hiện trong `#teacherPublishStatus` ("Đã xuất bản" khi thành công, nội dung lỗi khi thất bại).

### 17.5 Mã Apps Script phải dán được vào trình soạn của Google
Trình soạn Apps Script kiểm cú pháp bằng bộ phân tích riêng và báo `ParseError: Unexpected token ILLEGAL` với BigInt literal (`0n`) — Trưởng phòng đã gặp lỗi này ngày 16/11/2026. `apps-script/Code.js` chỉ dùng cú pháp ES2019: viết `BigInt(0)` thay cho `0n`; không dùng `??`, `?.`. Dùng `BigInt(...)` như hàm vẫn được (runtime V8).
- **Bổ sung 17.1 (16/11/2026):** Trưởng phòng đã triển khai Apps Script. URL thật nằm ở `ops/prod_config.json` và CHỈ được ghi vào `public/config.json` của bản công khai lúc đẩy GitHub (`ops/publish.py`). `public/config.json` trong repo luôn để rỗng: mọi test, worker và kiểm định chạy cục bộ không bao giờ gọi Google Sheet thật (không ghi kết quả thử vào bảng của Trưởng phòng). Test cần Apps Script dùng máy chủ giả lập (`test/claude-check/gas-server.mjs`).

## 18. Tính năng mới chỉ làm trên bản build `dist/` (Trưởng phòng chốt 16/11/2026)

- Màn vào thi (mục 16), trang giáo viên và gửi kết quả qua Apps Script (mục 17) **chỉ làm trên bản build** (`src/**` → `dist/`). `index.html` gốc không thêm tính năng; chỉ được sửa nếu làm hỏng các ca kiểm định hiện có của nó.
- Khi bản build qua toàn bộ kiểm định và Codex duyệt: chuyển GitHub Pages sang `dist/` (quyết định V01), rồi bỏ `index.html` một file.

### 18.1 Ranh giới module để làm song song (bắt buộc dùng đúng các chữ ký này)

```ts
// src/collect/appsScript.ts — vùng collect
export interface AppConfig { appsScriptUrl: string }               // '' = chưa cấu hình
export async function loadAppConfig(fetchImpl?: typeof fetch): Promise<AppConfig>;   // đọc 'public/config.json' tương đối; lỗi/thiếu → { appsScriptUrl: '' }
export interface PublishedExamMeta { id: string; title: string; subject: string; grade: number | null; durationMinutes: number | null;
  questionCount: number; group: string; revision: number; updatedAt: string }
export type AsResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string; details?: unknown };
export interface AppsScriptClient {
  readonly configured: boolean;                                    // false khi url rỗng: MỌI hàm trả ngay { ok:false, code:'NOT_CONFIGURED' }, không gọi mạng
  listExams(): Promise<AsResult<PublishedExamMeta[]>>;
  getExam(id: string): Promise<AsResult<unknown>>;                  // JSON đề thô; nơi gọi tự kiểm bằng parseExam
  teacherLogin(password: string): Promise<AsResult<true>>;
  publishExam(password: string, exam: unknown): Promise<AsResult<{ examId: string; revision: number }>>;
  unpublishExam(password: string, examId: string): Promise<AsResult<true>>;
}
export function createAppsScriptClient(url: string, fetchImpl?: typeof fetch): AppsScriptClient;   // GET đọc; POST text/plain; theo redirect; timeout 15 s
export function createAppsScriptCollectorPort(url: string, fetchImpl?: typeof fetch): CollectorPort; // nộp kết quả, dùng với outbox hiện có

// src/teacher/portal.ts — vùng teacher
export interface TeacherPortalDeps {
  client: AppsScriptClient;
  listAllExams(): Promise<Array<{ id: string; title: string; source: 'static' | 'teacher'; load(): Promise<unknown> }>>;
  openBuilder(exam: unknown | null, opts: { onPublish(exam: unknown): Promise<AsResult<{ examId: string; revision: number }>> }): void;
}
export function mountTeacherPortal(root: HTMLElement, deps: TeacherPortalDeps): { open(): void; close(): void };
// dựng #teacherLogin (#teacherPassword, #btnTeacherLogin, #teacherLoginError, chữ "chưa cấu hình" khi !client.configured)
// và #teacherPanel (.teacher-exam-row[data-exam-id], .btn-teacher-edit, .btn-teacher-unpublish, #btnTeacherNewExam); mật khẩu chỉ giữ trong sessionStorage.

// src/app/** — vùng app (khung): màn vào thi #startScreen, gộp danh sách đề (tĩnh ∪ listExams, trùng id thì bản giáo viên thắng),
// nút #btnTeacher + mở thẳng ?teacher gọi mountTeacherPortal(...).open(), openBuilder(...) dùng trình soạn hiện có và thêm nút #btnPublishExam
// + vùng #teacherPublishStatus, nối outbox với createAppsScriptCollectorPort và hiện trạng thái trong #syncText ("Đang gửi…", "Đã gửi",
// "Chưa gửi được — sẽ thử lại", "Đã lưu cục bộ" khi chưa cấu hình).
```

### 17.6 Cấu hình và danh sách đề không được kẹt bản cũ (lỗi thật 16/11/2026)
Trưởng phòng đổi sang link Apps Script mới, nhưng trình duyệt đã mở trang trước đó vẫn đọc `public/config.json` cũ từ cache của service worker, nên đăng nhập giáo viên nhận lỗi của bản Apps Script cũ ("Thiếu trường attempt_id bắt buộc"). Bắt buộc: `public/config.json` và `public/exams/index.json` đi **mạng trước** (`cache: 'no-store'` khi fetch, service worker dùng network-first), chỉ lấy bản cache khi mất mạng. Kiểm định: ca "[offline][app] cấu hình và danh sách đề luôn lấy bản mới nhất" trong `test/claude-check/teacher.test.mjs`.

## 19. Làm lại giao diện theo vai + lớp học + tài khoản (Trưởng phòng chốt 16/11/2026)

Thay cho phần giao diện của mục 15–17 (giữ nguyên hành vi chấm, lưu, gửi). Chỉ làm trên bản build `dist/` (mục 18). Quy chuẩn hình ảnh: `docs/design/DESIGN.md` (BẮT BUỘC).
Quyết định: (1) học sinh vào lớp bằng **mã lớp** + tự gõ tên; (2) **Admin tạo từng tài khoản giáo viên**, mỗi giáo viên chỉ thấy lớp/đề/kết quả của mình; (3) đề giao cho lớp có **giờ mở và hạn nộp**.

### 19.1 Trang và DOM bắt buộc (kiểm định dựa vào)
- **Chọn vai** (mở `index.html` không hash, chưa có bài dở): `#roleChooser` gồm `#btnRoleStudent`, `#btnRoleTeacher`. Không còn tự hiện đề. Vai đã chọn được nhớ; lần sau vào thẳng khu của vai đó, có nút đổi vai trên TopBar.
- **Học sinh** `#/hoc-sinh` → khối `#startScreen` (giữ id cũ):
  - Chưa có tên: cổng `#studentNameGate` với `input#startName` + `#btnNameContinue` (khóa tới khi có tên thật). Có tên rồi: TopBar hiện tên + `#btnChangeName`.
  - Vào lớp: `input#classCodeInput` + `#btnJoinClass`; sai mã → lỗi ngay dưới ô (`#classCodeError`). Lớp đã vào liệt kê trong `#myClasses` (mỗi lớp `.class-section[data-class-code]` có các thẻ đề được giao).
  - Đề luyện tập công khai: lưới `#practiceExams`.
  - Mỗi đề là **ExamCard** `.exam-card.exam-list-item[data-exam-id]` (đề tĩnh có thêm `data-exam-url`, đề được giao có `data-assignment-id`), chứa `.exam-status` (StatusBadge). Bấm thẻ → hộp thoại/tấm trượt `#examPreview` (tiêu đề, mô tả, số câu, thời gian, giờ mở/hạn nộp nếu có, trạng thái) với nút `#btnStartExam` ("Bắt đầu làm bài" / "Làm tiếp" / "Xem kết quả"; đề chưa mở hoặc hết hạn thì khóa và nói lý do).
  - `?exam=<examId>` → vào khu học sinh, mở sẵn `#examPreview` của đề đó (vẫn qua cổng tên nếu chưa có tên). Có bài dở → vào thẳng bài dở (D03).
- **Làm bài**: giữ các id hiện có (`#examWrapper`, `#examPane`, `.question-card`, `#btnSubmit`, `#submitModal`, `#timerBox`, `#syncText`, `#candidateName` chỉ đọc). Bảng số câu: cột phải ≥1024px; điện thoại là nút `#btnPalette` mở tấm trượt. KHÔNG có nút nạp JSON/soạn đề/ngân hàng trên màn học sinh. Nút `#btnOpenExamList` đổi thành "Về trang học sinh".
- **Kết quả**: giữ `#reportWrapper`, `#scorePartI/II/III`, `#scoreTotal`, `#btnDownloadReportHtml`, `#btnRestart` (chỉ khi còn lượt và còn hạn).
- **Giáo viên** `#/giao-vien` (và `?teacher`): `#teacherLogin` gồm `input#teacherUsername`, `input#teacherPassword[type=password]`, `#btnTeacherLogin`, `#teacherLoginError`; chưa cấu hình Apps Script → chữ "chưa cấu hình". Đăng nhập xong → `#teacherShell` với điều hướng `#teacherNav` có `a[data-nav="lop"]`, `a[data-nav="de"]`, `a[data-nav="ket-qua"]` (mục đang chọn `aria-current="page"`), nút `#btnTeacherLogout`.
  - **Lớp học** `#/giao-vien/lop`: `#btnCreateClass` → hộp thoại tên lớp → lớp mới hiện thành thẻ `.class-card[data-class-id]` có tên, mã lớp `.class-code` (6 ký tự in hoa, không có 0/O/1/I), nút sao chép mã + link mời (`…/#/hoc-sinh?lop=<MÃ>`), sĩ số (số học sinh đã nộp ít nhất 1 bài). Bấm thẻ → chi tiết lớp: danh sách đề đã giao (`.assignment-row[data-assignment-id]` có giờ mở, hạn nộp, số bài đã nộp), nút `#btnAssignExam`.
  - **Giao đề** (`#assignDialog`): chọn đề (của mình + kho chung), `input#assignOpenAt[type=datetime-local]`, `input#assignDueAt[type=datetime-local]` (hạn > mở), nút `#btnAssignConfirm`.
  - **Đề thi** `#/giao-vien/de`: lưới ExamCard của mình (`data-exam-id`) + "Kho đề chung" (đề tĩnh); nút `#btnTeacherNewExam`; mỗi thẻ có `.btn-teacher-edit`, `.btn-teacher-assign`, đề của mình có `.btn-teacher-unpublish`. Trình soạn đề giữ `#builderModal`, `#builderExamTitle`, `#btnPublishExam`, `#teacherPublishStatus` và PHẢI giữ nguyên mọi trường của đề khi chỉ sửa một phần (lỗi thật: 15 phút thành 50 phút).
  - **Kết quả** `#/giao-vien/ket-qua`: chọn lớp + đề → bảng `#resultsTable` (tên, lúc nộp, điểm từng phần, tổng), nút `#btnExportResults` (CSV chống công thức).
- **Admin** `admin.html` (trang riêng, không có liên kết từ trang học sinh): `#adminLogin` (`input#adminPassword`, `#btnAdminLogin`, `#adminLoginError`) → `#adminPanel`: `#btnCreateTeacher` → hộp thoại `input#newTeacherName`, `input#newTeacherUsername`, `input#newTeacherPassword`, `#btnCreateTeacherConfirm`; danh sách `.teacher-row[data-username]` với nút `.btn-reset-password`, `.btn-toggle-teacher` (khóa/mở); số liệu tổng `#adminStats` (số giáo viên, lớp, đề, bài nộp).

### 19.2 Apps Script — hành động mới (cùng quy tắc 17.2–17.6: GET đọc công khai, POST text/plain, không lộ mật khẩu, ES2019)
- Script Properties: `ADMIN_PASSWORD` (Admin), giữ `TEACHER_PASSWORD` cũ chỉ để tương thích (đăng nhập bằng tên `admin`? KHÔNG — bỏ; giáo viên phải có tài khoản).
- Trang tính mới: `GiaoVien` (username, tên, muối + băm SHA-256 của mật khẩu, trạng thái, tạo lúc), `Lop` (classId, code, tên, username giáo viên, tạo lúc), `GiaoDe` (assignmentId, classId, examId, openAt, dueAt, tạo lúc). `DeThi` thêm cột `owner` (username). `KetQua` thêm cột `class_code`, `assignment_id`.
- Phiên: `teacherLogin {username, password}` → `{success, token, name, expiresAt}` (token ngẫu nhiên 32 byte, lưu CacheService 8 giờ); `adminLogin {password}` → token admin. Mọi hành động cần quyền gửi `token`, KHÔNG gửi lại mật khẩu. Token sai/hết hạn → `UNAUTHORIZED`.
- Admin: `adminCreateTeacher {token, name, username, password}` (username 3–32 ký tự a-z0-9._-, trùng → `USERNAME_TAKEN`, mật khẩu ≥ 8 ký tự), `adminListTeachers {token}`, `adminResetPassword {token, username, password}`, `adminSetTeacherActive {token, username, active}`, `adminStats {token}`. Giáo viên bị khóa không đăng nhập được.
- Giáo viên: `createClass {token, name}` → `{classId, code}`; `listMyClasses {token}`; `publishExam {token, exam}` (chủ sở hữu = giáo viên; sửa đề của giáo viên khác → `FORBIDDEN`); `unpublishExam {token, examId}`; `assignExam {token, classId, examId, openAt, dueAt}` (lớp phải của mình; `dueAt > openAt`; ISO 8601) ; `listAssignments {token, classId}`; `listResults {token, classId, assignmentId?}` (chỉ kết quả lớp của mình).
- Học sinh (GET, không cần đăng nhập): `getClass&code=<MÃ>` → `{class:{code,name,teacherName}, assignments:[{assignmentId, examId, title, openAt, dueAt, questionCount, durationMinutes}]}` (mã sai → `NOT_FOUND`); `listExams`/`getExam` như cũ.
- Nộp bài: payload thêm `class_code`, `assignment_id` (nếu làm đề được giao). Server kiểm: bài giao chưa mở → `NOT_OPEN`; nộp sau `dueAt` + 2 phút (bù trễ mạng) → `PAST_DUE` (bài vẫn lưu trên máy, báo trung thực "Nộp sau hạn — giáo viên chưa nhận"). Idempotent theo `attempt_id` như cũ.

### 19.3 Ranh giới module (làm song song)
- `src/ui/**` — vùng ui: `tokens.css`, `components.css`, `components.ts` (Button, Input, Card, ExamCard, StatusBadge, TopBar, NavRail/BottomNav, Dialog/BottomSheet, Toast, EmptyState, ErrorState, Skeleton, Table), `icons.ts`. Các vùng khác CHỈ dùng các hàm/class này.
- `src/collect/appsScript.ts` — vùng collect: thêm hàm client cho mọi hành động 19.2 (`teacherLogin(username,password)` trả token; các hàm sau nhận token), lưu token giáo viên/admin trong sessionStorage.
- `src/student/**` — vùng student: khu học sinh (`#startScreen`, cổng tên, vào lớp, lưới đề, `#examPreview`), màn làm bài và kết quả theo DESIGN.md.
- `src/teacher/**` — vùng teacher: khu giáo viên (`#teacherLogin`, `#teacherShell`, Lớp/Đề/Kết quả, giao đề).
- `src/admin/**` + `admin.html` (qua `scripts/web-build.ts`) — vùng admin.
- `src/app/**` — vùng app: chọn vai `#roleChooser`, định tuyến hash, nạp cấu hình, nối các vùng.
- `apps-script/**` — Apps Script (19.2).

## 20. Xem lại bài: hiện đầy đủ câu hỏi cùng đáp án (Trưởng phòng yêu cầu 18/11/2026)

Lỗi thật trên bản build: phần "Chi tiết bài làm & lời giải" chỉ ghi "Bạn chọn: A | Đáp án đúng: D", không hiện nội dung các phương án; tiêu đề báo cáo đề Vật lí lại ghi "… TOÁN 12". Áp dụng cho màn kết quả trên `dist/` và file báo cáo `.html` tải về (cùng nội dung, tự chứa, ảnh nhúng). Không đổi cách chấm điểm.

- Tiêu đề báo cáo `#reportWrapper .report-title` chứa đúng tiêu đề đề đang làm (không gắn cứng môn).
- Mỗi câu một thẻ `#reportWrapper .review-question-card[data-qid="<questionVersionId>"]`, đúng thứ tự học sinh đã làm (kể cả khi trộn). Thẻ có: số câu, phần, điểm câu, trạng thái; **toàn văn đề bài** (công thức, bảng, hình như lúc làm bài); lời giải `.explanation-box` (D08).
- Phần I: đủ 4 phương án `.review-option[data-option-id]` theo thứ tự đã hiển thị lúc làm, mỗi phương án có nhãn chữ cái + toàn văn. Phương án đúng `data-correct="true"`, phương án học sinh chọn `data-chosen="true"`; chọn sai thì phân biệt rõ bằng chữ và biểu tượng (không chỉ bằng màu). Không chọn → ghi "Chưa chọn".
- Phần II: đủ 4 mệnh đề `.review-statement[data-statement-id]`, mỗi mệnh đề có nhãn a–d + toàn văn, `data-key="true|false"` (đáp án), `data-chosen="true|false|none"` (học sinh chọn Đúng/Sai/bỏ trống), chữ "Đúng"/"Sai"/"Chưa chọn" cho cả hai.
- Phần III: `.review-short-answer` hiện "Bạn điền: …" (nguyên văn, hoặc "Chưa làm") và "Đáp án: …".
- File `.html` tải về chứa cùng các thông tin trên (toàn văn đề bài, phương án, mệnh đề, đáp án, lời giải), mọi nội dung người dùng đã escape.

## 21. Đề chỉ đến tay học sinh qua lớp (Trưởng phòng chốt 19/11/2026) — thay phần "Đề luyện tập" của §15 và §19.1

Quyết định: đề luyện tập không hiện công khai; mọi đề (16 đề Lý 12, đề mẫu, đề giáo viên xuất bản) nằm trong **thư viện đề** của giáo viên ("Kho đề chung" + "Đề của tôi" ở `#/giao-vien/de`). Học sinh chỉ thấy đề khi **vào lớp bằng mã** và giáo viên đã giao. Mức ẩn: **trên giao diện** (file đề tĩnh vẫn nằm trong bản công khai; không phải bảo mật). Link `?exam=` bị bỏ.

- Khu học sinh `#/hoc-sinh` **không còn** lưới `#practiceExams` hay bất kỳ thẻ đề nào ngoài `#myClasses`. Chưa vào lớp nào: trạng thái trống (EmptyState) hướng dẫn "Nhập mã lớp do giáo viên cung cấp để xem đề được giao"; ô `#classCodeInput` + `#btnJoinClass` luôn hiện.
- `#myClasses .class-section[data-class-code]` chứa các ExamCard đề được giao (như §19.1). Lớp đã vào được nhớ trên máy.
- Mở `?exam=<id>` (hoặc `#/hoc-sinh?exam=`): **không** mở `#examPreview` hay bài thi; vào khu học sinh và hiện thông báo có chữ "giáo viên giao" (ví dụ "Đề này chỉ làm được khi giáo viên giao cho lớp của em."). Bài làm dở có sẵn trên máy (D03) vẫn mở tiếp được qua thẻ đề của lớp.
- Không đổi: nút `#btnOpenExamList` ("Về trang học sinh"); kết quả và bài đã nộp vẫn xem lại được trên máy.
- Đề nạp bằng file (`#examFileInput`, ẩn, không có nút trên màn học sinh) dùng **tên học sinh đã nhập ở cổng tên** làm `#candidateName`, không dùng "Thí sinh tự do".
- Giáo viên: thư viện đề (`#/giao-vien/de`) vẫn hiện đủ đề kho chung theo `public/exams/index.json` (network-first, §17.6) để giao cho lớp.

## 22. Máy chủ trên Vercel + Neon thay Apps Script (Trưởng phòng chốt 19/11/2026, không chuyển dữ liệu cũ từ Sheet)

Web chính: https://cunata.vercel.app (Vercel Hobby, tự triển khai từ repo công khai). Máy chủ mới thay hoàn toàn `apps-script/Code.js`, giữ nguyên **tên hành động, dữ liệu vào/ra và mã lỗi** của §17.2–17.6 và §19.2 để phía web chỉ đổi đường gửi.
- **Mã nguồn:** `src/api/**` (vùng `api`), TypeScript, CHỈ dùng thư viện có sẵn của Node 20+ (`node:crypto`, `fetch`); không thêm gói npm. Lõi là hàm thuần `handle(request, ctx) → { status, body }` nhận `ctx.store` (giao diện lưu trữ) và `ctx.now`.
- **Lưu trữ:** giao diện `Store` với hai bản: `src/api/store/memory.ts` (test) và `src/api/store/neon.ts` (Neon Postgres qua SQL-over-HTTP bằng `fetch`, chuỗi kết nối từ biến môi trường `DATABASE_URL`, không in ra log). Bảng tạo tự động bằng `CREATE TABLE IF NOT EXISTS` ở lần gọi đầu: `teachers`, `sessions`, `classes`, `students` (§23), `assignments`, `exams` (đề giáo viên xuất bản, cột `owner`), `results`.
- **Điểm vào Vercel:** một hàm `api/rpc.js` (ES module, `api/package.json` có `"type":"module"`), `GET /api/rpc?action=…` cho hành động đọc công khai, `POST /api/rpc` thân JSON `{ action, … }` cho mọi hành động khác. Bản build: `node scripts/build.js` xuất `dist/api/**` (tự chứa, không import ra ngoài `dist/api`); `ops/publish.py` chép `dist/api` → `api/` ở gốc repo công khai, KHÔNG chép vào `site/`.
- **Bảo mật:** mật khẩu giáo viên băm `scrypt` có muối (`node:crypto`); token phiên 32 byte ngẫu nhiên, lưu dạng băm trong `sessions`, **hết hạn sau 8 giờ** (giải quyết Q1); khóa/đặt lại mật khẩu vô hiệu phiên cũ. Mật khẩu Admin từ biến môi trường `ADMIN_PASSWORD` (chưa đặt → `ADMIN_PASSWORD_NOT_SET`). Phản hồi không bao giờ chứa mật khẩu, băm, muối, PIN băm hay `DATABASE_URL`. Hạn nộp: `NOT_OPEN`, `PAST_DUE` (+2 phút) như §19.2; nộp lại cùng `attempt_id` không tạo dòng trùng.
- **Danh mục đề kho chung phía máy chủ** (giải quyết Q2): bản build sinh `dist/api/catalog.json` từ `public/exams/index.json` (id, title, subject, questionCount, durationMinutes); `getClass` và danh sách giao đề trả **tiêu đề thật** cho cả đề tĩnh.
- **Phía web:** `public/config.json` có thêm `apiBase`; có `apiBase` thì dùng máy chủ mới (POST JSON bình thường, cùng nguồn), không thì dùng `appsScriptUrl` như cũ. `ops/publish.py` ghi `{"apiBase":"/api/rpc"}` cho `site/` (Vercel) và `{"apiBase":"https://cunata.vercel.app/api/rpc"}` cho GitHub Pages (máy chủ cho phép CORS từ `https://quancn12.github.io`).
- **Không chuyển dữ liệu từ Google Sheet** (Trưởng phòng 19/11/2026). Apps Script giữ nguyên, không xóa, tới khi Trưởng phòng bỏ.

## 23. Danh sách lớp + mã PIN học sinh (để học sinh xem lại bài trên mọi máy)

- **Giáo viên**, chi tiết lớp: khối `#rosterPanel` có `textarea#rosterInput` (mỗi dòng một tên) + `#btnRosterSave` → mỗi học sinh một mã PIN 4 chữ số (khác nhau trong lớp), hiện thành `.roster-row[data-student-id]` (tên, PIN, nút `.btn-reset-pin`, `.btn-remove-student`); `#btnRosterPrint` in danh sách tên + PIN. API: `addStudents {token, classId, names}`, `listStudents {token, classId}`, `resetPin {token, studentId}`, `removeStudent {token, studentId}` (chỉ lớp của mình, khác → `FORBIDDEN`). PIN lưu băm.
- **Học sinh** vào lớp: mã lớp → danh sách tên `#rosterPick .roster-name[data-student-id]` → `input#studentPinInput` + `#btnPinConfirm` → `studentLogin {code, studentId, pin}` → `{ studentToken, name }`. Sai PIN: `#pinError`; sai 5 lần liền → khóa 10 phút (`PIN_LOCKED`, máy chủ kiểm). Lớp chưa có danh sách: báo "Lớp chưa có danh sách học sinh — nhờ giáo viên thêm tên em".
- Tên thí sinh của bài làm trong lớp = tên trong danh sách (không gõ tự do). Bài nộp mang `student_id`.
- `myResults {studentToken}` trả các bài đã nộp của học sinh đó (đề, lớp, bài giao, điểm từng phần, lúc nộp, câu trả lời) → trên **máy bất kỳ** sau khi nhập PIN: thẻ đề hiện "Đã nộp" + điểm, "Xem kết quả" dựng lại báo cáo §20 từ dữ liệu máy chủ.
- Bảng `#resultsTable` của giáo viên theo học sinh trong danh sách; học sinh chưa nộp hiện "Chưa nộp".

## 24. Tính năng thêm (Trưởng phòng giao 19/11/2026: "lộ trình thay đổi và cả tính năng")

- **24.1 Lọc khi xem lại bài (F1):** trong báo cáo, `#reviewFilter` có nút `[data-filter="all"|"wrong"|"blank"]` (`aria-pressed`), lọc `.review-question-card`; thanh số câu `#reviewNav a[href="#q-…"]` nhảy tới câu, câu sai/bỏ trống có nhãn chữ (không chỉ màu).
- **24.2 Giáo viên xem bài từng học sinh (F3):** mỗi dòng `#resultsTable` có `.btn-view-submission` → hộp thoại `#submissionDialog` hiện bài làm như §20 (toàn văn câu, lựa chọn của học sinh, đáp án, điểm từng câu).
- **24.3 Thống kê đề (F4):** ở Kết quả, chọn lớp + bài giao → `#examStats`: mỗi câu `.stat-row[data-qid]` có % đúng; Phần I có tỉ lệ chọn từng phương án; Phần III có 3 câu trả lời sai hay gặp nhất. Chỉ tính bài đã nộp hợp lệ.
- **24.4 Lịch sử điểm của học sinh (F5):** khu học sinh có `#myHistory` (đề, lớp, điểm, ngày nộp; lấy từ `myResults`) và biểu đồ cột SVG tự vẽ `#historyChart` (không thư viện ngoài), có bảng chữ thay thế cho trình đọc màn hình.
- **24.5 Luyện lại câu sai (F2):** báo cáo có `#btnRetryWrong` → lượt luyện mới chỉ gồm câu sai/bỏ trống, ghi rõ "Luyện lại câu sai — không gửi giáo viên"; KHÔNG gửi máy chủ, không đổi kết quả đã nộp.
- **24.6 In đề (F7):** thẻ đề của giáo viên có `.btn-teacher-print` → trang in: đề không đáp án + phiếu trả lời (I: A–D, II: Đ/S từng ý, III: ô 4 ký tự) + trang đáp án riêng; dùng `window.print` và CSS in, công thức/hình hiện đúng.
- **24.7 Chế độ tối (F8):** bộ màu tối trong `src/ui/tokens.css` theo `prefers-color-scheme` + nút `#btnTheme` trên TopBar (Sáng/Tối/Theo máy, nhớ trên máy); mọi màn đạt tương phản WCAG AA ở cả hai chế độ.
