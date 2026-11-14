# LC32 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Có 6 findings OPEN: 1 BLOCKER, 1 CRITICAL, 4 MAJOR. npm gate xanh **355/355**, nhưng chưa đủ nghiệm thu sản phẩm. Handoff **NEED_DECISION** cho trust/collector và policy còn mở; các lỗi kỹ thuật dưới có thể sửa ngay, không cần chờ quyết định đó.

review_id/task_id/worker_id: LC32; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0, M1-scoring-contract v1.0 (đã đọc toàn bộ); acceptance_reference: READINESS §6, B1-AC01–08/B1-T01–17; risk_level: HIGH.

## Revision và phạm vi

- base_commit lúc bắt đầu: `2425ce864bd6eb06be5c56945d241da296c6986c`, main. Trong lúc review, điều phối commit round26 thành **head_commit `4cb362925497b80fa8c5750b35adea67277a9c72`**. Reviewer không commit. Các bytes production/test đã chạy giữ nguyên qua commit, xác minh SHA256 hai lần.
- Cutoff SHA256: index.html `15c2c4979930dab05f11743d575aeaadf5b66cdb7d7337f7d2d08a4ce091d56f`; apps-script/Code.js `f7b85ba5e715f3d5b96fa5beb6c08f0c1148d2653ff8f13f0c8b8463a584ffa4`; test/e2e/demoFlow.test.ts `b407404c95ec36f03ce032788422529b01cd322f8d8e071f0d68e7cc6b0eec7c`.
- So LC31: collector bytes không đổi; web/test thay đổi. Restart hiện xóa final cũ (LC31 báo giữ lại); regression cũ đòi xóa final nay xanh. Đây là hồi quy sản phẩm F05, không coi gate xanh là đã sửa đúng.
- Delta round25→26: index +267/-khối cũ (diff tổng web 267 dòng thay đổi), collector141 dòng, judge95, shortAnswer7, demoFlow294; production src/domain/package/lock/tsconfig/scripts/styles/public/README không đổi. Đã đọc git log/diff thực, báo cáo LC31 và lần theo callers/tests, không đọc prompt riêng của worker khác.
- files_reviewed: toàn API src/domain gồm model/index/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize; web validation/scoring/order/input/timer → local restore/save → submit/collector → history/report/restart; JSON bank/builder/import/export/filter; collector Code.js/README/manifest; package/tsconfigs/build verifier; oracle fixtures và assertions/harness liên quan. CSS/assets kiểm tĩnh. Đây là review theo luồng và ranh giới, không tuyên bố đọc từng dòng toàn ops/dependencies/history hoặc chạy browser thật.
- Chỉ tạo file review này; không sửa source/test, install, dependency, branch/worktree, commit, deploy hay gửi Google. Mocks/probes chỉ ở RAM qua Node stdin. Working tree có hoạt động điều phối song song; không hoàn tác file của người khác.

## Findings OPEN

### LC32-F01 — CRITICAL — Collector validate và ghi hai schema alias khác nhau

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, tiếp tục LC31-F01.
- affected_files: `apps-script/Code.js:158–159,214–229,255–257,323–337`.
- evidence/reproduction_steps: chạy Code.js trong node:vm với Sheet mock appendRow/getRange và Lock/ContentService mock. Gọi doPost JSON có attempt_id="alias", exam_id="ex", exam_version_id="v1", total="1", maxTotal="10", total_score="999", max_total="1", sections I=1/10, II=0/0, III=0/0. Receipt NEWLY_RECORDED; row H:M là 1/10,0/0,0/0 nhưng N:O **999/1**. Validator ưu tiên total, formatter ưu tiên total_score. Đã tái lập tại cutoff.
- Bypass cùng boundary đã chạy: `{attempt_id:"missing"}` được ghi thiếu identity/score; sections chỉ I=999/1 với total1/max10 vẫn nhận; numeric attempt_id123 thành "123"; retry ID alias với total9 và sections hợp lệ nhận ALREADY_RECORDED dù nội dung khác. Không append lần hai, nhưng receipt không chứng minh payload tương ứng đã được ghi.
- expected: Shared §2–5 yêu cầu dữ liệu điểm/identity/version nhất quán, retry đúng dữ liệu; actual/impact: owner nhận hàng sai hoặc thiếu dữ liệu và xác nhận sai nội dung. Sink đã chứng minh bằng mock, chưa ghi Google thật. Kiểm consistency không làm điểm client trở thành trusted grade.
- minimal_fix: normalize một canonical typed schema rồi validate và format chính object đó; reject alias mâu thuẫn, required fields/sections, exact rational/range/sum checks; payload fingerprint để reject same-ID conflict. Tách lựa chọn trust mode ở mục NEED_DECISION.
- regression_test: năm payload trên phải reject không append; valid full sections với 10/3 phải qua; valid retry append đúng một lần; section aliases, malformed types/fractions, lost-response retry và conflict phải có negative controls.

### LC32-F02 — MAJOR — Không có immutable exam snapshot cho boot/resume

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, tiếp tục LC31-F02.
- affected_files: `index.html:1672–1704,1841–1869,3290–3341`.
- evidence/reproduction_steps: loadExamVersion với CUSTOM/v1/custom-v1/sa-charset-v1, một câu III q/key1; responses.q="1"; saveLocalState. Tạo page context mới cùng Storage, initExam fetch sample hợp lệ → currentExam.examId **exam-thpt-toan-demo-01**, không phải CUSTOM. Pointer chỉ được tìm sau khi chọn đề, không có boot snapshot CUSTOM.
- Probe bổ sung: cùng draft CUSTOM, reimport cùng exam/version/q nhưng key đổi thành2; vẫn phục hồi raw1, điểm **10→0**. Không có saved immutable source để pin key/settings. Không coi việc dùng lại ID phiên bản với nội dung mới là thao tác xuất bản hợp lệ; runner cần phát hiện conflict hoặc giữ snapshot cũ.
- expected: Shared §3/5 refresh/offline giữ đúng đề/phiên bản/snapshot/order/input, sửa nguồn không đổi bài cũ; actual/impact: boot lạc đề và reimport có thể đổi dữ liệu dùng chấm. Draft không bị chứng minh đã xóa; reimport chính JSON cũ vẫn resume được.
- minimal_fix: persist active exam+attempt tuple và immutable exam/settings snapshot; boot resolve trước sample; reject same-version content conflict, tạo version mới khi publish sửa nguồn; không lấy bank/latest thay snapshot.
- regression_test: CUSTOM refresh online/offline/back-forward, reimport nguyên bản, same-ID changed-key/settings negative control, restart CUSTOM→reload, source edit sau draft/final; giữ deadline/order/raw/name và kết quả cũ.

### LC32-F03 — MAJOR — Submit vẫn adopt receipt sai đã lưu

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, tiếp tục LC31-F03.
- affected_files: `index.html:2674–2677,2720–2723`; so với restore validation `index.html:1989–1999`.
- evidence/reproduction_steps: submitExam tạo final hợp lệ; sửa final/draft trong Storage thành serverConfirmed=true, serverReceipt={success:true,attempt_id:"FOREIGN",status:"BOGUS"}; reset active confirmation rồi submitExam lại. Kết quả **confirmed:true**, receipt FOREIGN/BOGUS được adopt. POST/restore có kiểm binding nhưng hai nhánh submit bỏ kiểm.
- expected: Shared §3 chỉ server_confirmed khi receipt đúng schema/status/attempt; actual/impact: bỏ retry và có thể báo máy chủ nhận dù chưa có receipt tương ứng. Đây là inconsistency recovery; không khẳng định client no-login chống được mọi sửa localStorage.
- minimal_fix: validator receipt dùng chung cho restore/submit/dispatch, invalid receipt giữ pending; binding tuple/payload theo protocol.
- regression_test: final valid + foreign/missing ID/unknown status/success=false/no receipt cho cả hai submit adoption branches; matching receipt control; reload rồi submit không nâng receipt invalid thành confirmed.

### LC32-F04 — MAJOR — Chưa có durable outbox và bounded retry/backoff

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, tiếp tục LC31-F04.
- affected_files: `index.html:2016–2020,2682–2684,2731–2733,2790–2910`.
- evidence/reproduction_steps: submit final local, cấu hình collector.invalid; fetch mock throw offline; await dispatchToServerCollector với setTimeout spy → **[]**, không lịch retry. Source chỉ gọi dispatch khi submit/restore, không retry metadata/outbox/backoff/online wake/in-flight guard. setTimeout hiện có là highlight UI.
- expected: Shared §3 pending payload bền vững, retry hữu hạn/backoff, phân biệt queued/sending/failed/confirmed; actual/impact: mạng hồi phục trong trang đang mở không tự gửi; cần reload/nộp thủ công. Reload retry hiện có và npm regression PASS, không báo nó là chưa implement.
- minimal_fix: immutable outgoing payload + retry count/nextRetry persisted; một request/attempt, bounded backoff, online/manual wake, ack đúng mới clear; hết lượt vẫn có recovery thủ công.
- regression_test: offline→online không reload, clock/backoff/limit, pending close/reopen, concurrent dispatch, response lost sau append, quota và labels; giữ same attempt/payload qua mọi retry.

### LC32-F05 — BLOCKER — Restart xóa bản đầy đủ duy nhất của kết quả chưa đồng bộ

- **VÙNG chịu trách nhiệm: glue.** VERIFIED; hồi quy so cutoff LC31.
- affected_files: `index.html:3222–3225`; test khuyến khích hành vi này: `test/e2e/demoFlow.test.ts:1883–1885`.
- evidence/reproduction_steps: page VM cùng harness hiện tại; submitExam không cấu hình collector (hoặc offline); final tồn tại, serverConfirmed=false. Ghi lại finalKey/attemptId; restartExam. Sau restart **finalKey không tồn tại**, draft cũ cũng mất; Storage chỉ còn history và active pointer. History chỉ chứa identity/name/time/score summaries/serverConfirmed, **không có raw responses, questionResults hay immutable payload**. Không thể gửi lại/mở lại báo cáo chi tiết bài cũ từ history. Đây là mất dữ liệu đã lưu thật trong Storage mock, không phải suy luận từ test đỏ.
- expected: Shared §3/5 bảo toàn bài đã lưu và pending kết quả; restart mở lượt mới độc lập, không xóa kết quả chưa ack; actual/impact: offline submit→làm lại làm mất câu trả lời và khả năng retry bài cũ. Ngay cả bài đã ack, archive chi tiết để tải lại chưa được bảo toàn local.
- minimal_fix: giữ immutable final/archive/outbox theo attempt cũ; chỉ đổi active pointer/new draft; nếu cần cleanup thì retention riêng có điều kiện ack/export, không gắn với restart.
- regression_test: pending A→restart B→reload, vẫn xem/tải/gửi A đúng raw và score; late receipt A không finalize B; confirmed A vẫn còn archive; sửa expectation xóa final ở test hiện tại thành preservation và kiểm raw/report chứ không chỉ score history.

### LC32-F06 — MAJOR — Metadata difficulty từ JSON chui nguyên vào innerHTML của builder

- **VÙNG chịu trách nhiệm: glue.** VERIFIED active-markup injection tại sink; thực thi JavaScript browser **NOT_RUN**.
- affected_files: `index.html:3461–3494,3851–3855,3962–3963,4372–4384`.
- evidence/reproduction_steps: JSON exam hợp lệ custom-v1/sa-charset-v1 với một câu III q/key1 và difficulty=`<img src=x onerror="globalThis.__LC32_XSS=1">`. validateExamVersion trả true; loadExamFromJson→builder render (probe gọi renderBuilderForm cùng payload) ghi nguyên chuỗi img/onerror vào `builderQuestionsContainer.innerHTML`. Probe includes(rawPayload) **true**. Import bank cũng không kiểm difficulty enum; các metadata subject/topic đã escape nhưng fallback difficulty chưa escape.
- expected: JSON không tin cậy chỉ thành text/metadata được kiểm; actual/impact: có active element/event handler trong HTML builder, tạo đường XSS qua file được chia sẻ; có thể tác động dữ liệu local cùng origin. VM không có DOM event execution, không tuyên bố đã chạy handler hay lấy dữ liệu.
- minimal_fix: escapeHtml toàn label difficulty sau mapping hoặc textContent; validate metadata enum ở import, vẫn escape ở sink; rà các metadata fallback tương tự.
- regression_test: payload trên qua JSON exam và bank→reuse→builder; HTML phải escape, browser không tạo img/không đổi marker; ba difficulty hợp lệ và unknown text controls; giữ các XSS tests question/answer/report hiện có.

## checks_run và phương pháp

Environment: PowerShell, D:\Cunata; Node24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Bằng chứng là command outputs của phiên; không tạo log ngoài scope.

| Command/check | Exit | Kết quả thực / giới hạn |
|---|---:|---|
| npm test | 0 | **355 tests,58 suites,355 pass,0 fail/cancel/skip/todo**, duration800.7339ms. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics, wall1.3497s. Compiler hiện có, không dùng NOT_RUN lịch sử trong M1. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; noEmit/include src,scripts,test, không kiểm inline HTML JS hoặc Google runtime. |
| node scripts/build.js | 0 | 7 assets, sample8 câu schema valid, CSS link và collector syntax; index245802 bytes/collector14647 bytes. Read-only verifier, không bundling/render/deploy. |
| python -B test/oracle/oracle.py --check | 0 | 11 pass/0 fail/skip,1632 fixtures,5849 maxima,9 negative controls,seed20261114,duration_s1.0252; independent oracle only. |
| Node stdin: domain/web differential + DTO roundtrip | 0 | Toàn **1632 fixtures**: domain total/max oracle match, DTO JSON roundtrip deepEqual; web total/max và từng phần exact fraction match oracle. Không cộng fixture count vào npm count. |
| Node stdin: boot/receipt/retry/collector observational probes | 0 | Ghi nhận 8 counterexamples của F01–04: CUSTOM boot, forged receipt, no retry callbacks, alias/missing/partial/numeric/conflicting payload. Exit0 vì lệnh ghi actual để chẩn đoán, **không phải PASS acceptance**. |
| Node stdin: restart, same-version source, metadata HTML | 0 | F05 mất final/raw; F02 điểm10→0; F06 active markup vào sink. Đây là counterexamples, không phải assertions acceptance pass. |
| Probe đầu tiên dùng tên saveToLocalStorage | 1 | ReferenceError của harness reviewer; sửa thành API thật saveLocalState và chạy lại thành công. Không coi là bug sản phẩm. Probe metadata đầu kiểm nhầm node builderQuestionsList nên false; đã kiểm đúng builderQuestionsContainer→true. |
| git diff --check -- index.html src test scripts styles README.md apps-script (trước commit điều phối) | 2 | apps-script/Code.js:50 trailing whitespace. Sau điều phối commit, cùng lệnh exit0 vì không còn tracked diff ở các path đó; không coi whitespace tự được sửa. |
| git status/log/rev-parse/diff/inventory/hash/version | 0 | Snapshot/cutoff trên; không AGENTS.md trong repo inventory. |

Probe tái hiện: chạy `node --input-type=module` qua PowerShell stdin, import fs/vm/node:module.stripTypeScriptTypes và src/domain/index.ts. Trích **chỉ function createPageContext** từ test/e2e/demoFlow.test.ts trước test LC13-F01, strip types rồi tạo factory với fs/vm/indexPath. Bổ sung Storage.length getter và key(i) trên Map; renderExamPane/renderPalette stub; fetch mock, không network. Thực hiện từng API/raw payload theo findings. Collector mock appendRow thu toàn hàng, getRange trả cột tương ứng; ContentService trả JSON body; Lock tryLock=true. Differential chuyển Response I→selectedOptionId, II→map statementId/value, III→raw; gọi engine thật và inline web scoreAttemptLocally; so expected fixtures độc lập. Không tạo test file vì scope chỉ review.

## Retest LC31 và coverage_gaps

- LC31-F01–04 vẫn OPEN, đã tái lập mới; F01 không đổi bytes. LC31-F05 gate đỏ **không còn**: 355/355 xanh. Tuy nhiên chưa chấp nhận sửa regression lifecycle vì assertion xóa final nay đạt bằng hành vi gây mất bài (LC32-F05). Không giữ nguyên verdict/count của vòng trước.
- B1-AC01–03/T01–09/T15: chưa tìm counterexample số học; domain/web differential1632 và exhaustive II/unit chứng minh phạm vi fixtures, exact III, maxima5/15/16, repeating fractions; không suy ra toàn sản phẩm đúng.
- B1-AC04–06/T10–14: API validation/DTO/shuffle đọc lại, unit hiện xanh; source domain không delta. Browser durable versioning còn F02; non-transactional localStorage multi-tab scheduling/quota/private mode/migration chưa nghiệm thu. Không khẳng định check-then-write là atomic.
- B1-AC07/08/T16/17: type/test/build có evidence; mutation discrimination tests hiện có không đồng nghĩa đã instrument và chạy mọi mutant sản phẩm. Display dùng formatScore toFixed(2), policy owner còn mở. Rational parse200 ký tự/precision100 là giới hạn implementation cần ghi nhận khi chốt API/limits, không tự coi owner đã duyệt.
- Các tests gọi E2E hiện là node:vm/DOM/storage/Google mocks. **Browser thật NOT_RUN**: Chrome/Firefox/WebKit, mobile/desktop screenshot/trace, OS Telex/VNI/composition/cursor, keyboard/focus/AT/contrast/axe, media/math overflow, timer background/clock shifts, tải/mở report offline thật, cold boot offline/service-worker/cache. Không lấy VM thay các kiểm này.
- Collector Google integration **NOT_RUN**: deployment, CORS/redirect, endpoint ownership, write/readback/receipt thực, actual Sheets formula/literal conversion, simultaneous cold-sheet lock, anonymous abuse/resource limits. Không deploy hoặc POST tới dịch vụ thật trong review.
- Report có totals/sections/timing/raw/correct answer/explanations, HTML download/print và releasePolicy; chưa nghiệm thu tự reveal sau deadline khi submit sớm. Keys vẫn ở client, không đạt trusted hidden-answer exam bằng UI hide.
- Bank/builder hiện có JSON/edit/reorder/duplicate/reuse/filter subject/grade/topic/difficulty; không ghi là hoàn toàn chưa implement. Thiếu hierarchy Topic→Lesson ổn định, durable builder recovery, publish/archive/version/media migrations đã nghiệm thu. F06 chỉ rõ một sink bỏ sót dù các sink khác đã có escaping.
- Full secret-history/advisory/license/SAST/dependency audit, performance/load/a11y budgets, rollback/CI browser và milestone owner acceptance **NOT_RUN**. Không cài hay nghiên cứu stack mới cho LC32.

## Lộ trình còn thiếu theo ưu tiên

1. **P0/glue:** giữ final/archive/outbox khi restart F05; canonical collector/schema/conflict F01; escape metadata F06; pin snapshot/boot F02; receipt adoption F03. Đưa counterexamples vào regression thay vì chỉ giữ gate355 xanh.
2. **P1/glue:** durable bounded retry/backoff/in-flight F04; protocol/trust decision, anti-spam/resources, retention/xóa/xuất/backup; Google end-to-end write/readback/receipt/CORS trên endpoint thử được duyệt.
3. **P1/glue:** browser desktop/mobile/two-tabs thật, CUSTOM refresh/restart/back-forward/offline boot; timer/quota/retry/lost receipt; mở report tải thật; Telex/VNI/keyboard/a11y/math/media; release policy và maxAttempts minh bạch giới hạn no-login.
4. **P1/glue:** taxonomy môn→khối→chương/chủ đề→bài→mức độ, stable question/exam versions, publish/archive, builder draft recovery, media packages/migrations/export/import/backup.
5. **P2/glue:** DOCX/PDF importer **NOT_IMPLEMENTED**: file→IR paragraph/table/image/OMML/LaTeX/provenance/confidence→preview/sửa→confirm; PDF text/scan/OCR, multi-column/corrupt/oversized corpus; không đoán key.
6. **P2/glue + src/domain nếu rule mới:** mẫu chuẩn THPT theo môn/năm/văn bản verified, tách custom-v1; policy versions/rounding/limits/migrations; security/license/performance/browser CI, changelog/rollback, owner nghiệm thu. Class/Assignment sau MVP.

## NEED_DECISION

Không thấy mâu thuẫn scoring mới giữa hai contract; không tự thay invariant. Các lựa chọn sau chưa được owner phê duyệt:

- Trust/collector: (A) luyện tập self-reported, gắn nhãn điểm client và giới hạn tin cậy; (B) server grade từ immutable exam/key phía owner, không dùng điểm/key client; (C) tạm local/export-only cho đến khi có protocol được duyệt. Không gọi A là trusted exam.
- Display rounding: (A) exact fraction làm giá trị chính; (B) decimal half-up hai chữ số kèm exact source; (C) precision/mode theo policy version do owner định. Hiện toFixed(2) không phải bằng chứng được duyệt.
- Short-answer grammar: (A) giữ charset/length-only sa-charset-v1; (B) grammar numeric được owner mô tả, version mới/migration; không tự cấm --1/,5/01 trong policy hiện tại.
- Limits/grouping/mẫu chuẩn: (A) phê duyệt giới hạn1000 và giữ nhóm I→II→III như M1 tạm; (B) cấu hình/version mới sau owner chọn limits/grouping; mẫu chuẩn cần môn/năm/văn bản cụ thể, không giả custom-v1 là chuẩn chung.

recommended_action: giao worker glue sửa F01–06 với tests âm/dương và snapshot hash; chưa merge/nghiệm thu toàn sản phẩm chỉ vì gate xanh. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật; không nội dung chỉ thị riêng, credentials hay dữ liệu học sinh thật.
