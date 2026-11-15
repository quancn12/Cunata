"""Build the review inventory from the actual completed browser log."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
here = Path(__file__).resolve().parent
data = (here / 'acceptance.log').read_bytes()
log = data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig').replace('\r\n', '\n')
rows = re.findall(r'^  ([✔✖]) (root|dist): (.*?) \(([0-9.]+)ms\)$', log, re.M)
assert len(rows) == 116, f'Incomplete browser run: {len(rows)} cases'
assert 'tests 116' in log and 'pass 51' in log and 'fail 65' in log
assert all(float(ms) < 60000 for _, _, _, ms in rows)
inventory = {}
for mark, target, name, milliseconds in rows:
    inventory.setdefault(name, {})[target] = {'status': 'PASS' if mark == '✔' else 'FAIL', 'duration_ms': float(milliseconds)}
assert len(inventory) == 58
probe = json.loads((here / 'evidence' / 'probe.json').read_text(encoding='utf-8'))
assert probe['hashesBefore'] == probe['hashesAfter']
current_hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in probe['hashesAfter']}
drift = {name: {'probed': expected, 'current': current_hashes[name]} for name, expected in probe['hashesAfter'].items() if current_hashes[name] != expected}
(here / 'evidence' / 'handoff-hashes.json').write_text(json.dumps({'current': current_hashes, 'drift': drift}, indent=2), encoding='utf-8')
runtime_drift = {name: values for name, values in drift.items() if name not in ('src/app/main.ts', 'src/app/shell.html')}
assert not runtime_drift, f'Runtime/fixture drift: {runtime_drift}'
(here / 'evidence' / 'case-results.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
table = '\n'.join(f'| {i} | {name} | {result["root"]["status"]} | {result["dist"]["status"]} |'
                  for i, (name, result) in enumerate(inventory.items(), 1))
max_duration = max(float(ms) for _, _, _, ms in rows)
duration = float(re.search(r'duration_ms ([0-9.]+)', log).group(1)) / 1000
report = '''# CK-CODEX-TESTS — kiểm định trình duyệt bổ sung

review_id/task_id: CK-CODEX-TESTS; reviewer: Codex; requirements: Shared Product Contract v2.0 + WEB-contract v1.0; risk: HIGH.

**Bàn giao: READY_FOR_REVIEW cho bộ test; verdict hai artifact runtime đã chạy: CHANGES_REQUESTED. Không phải DONE/nghiệm thu sản phẩm. Source mới đang được worker khác sửa: NOT_REVIEWED, phải build/test lại sau tích hợp.**

## Snapshot và phạm vi

- HEAD/base thực đọc: `9979578b24a5e1db1203c395d3694ca1b1cf3cdd`. Chạy Windows, Node v24.14.0, Chrome/157.0.8103.52 headless qua CDP, server thật dưới `/Cunata/` cho cả hai TARGETS. Evidence có UTC timestamp và browser version đầy đủ.
- Chỉ tạo `test/codex-check/**` và báo cáo này. Không sửa sản phẩm, `test/claude-check`, dependency, package/lock; không install, build, commit hoặc deploy.
- Working tree ban đầu đã có thay đổi ops; trong lúc chạy có thay đổi `plan.html`, ảnh `test/browser/artifacts/*`, `index.html`, `src/ui/*`, `test/ui/layout/keyboard-ime.test.ts` và ops bởi công việc khác. Không sửa/khôi phục các file đó. Sau khi phát hiện root đổi hash, đã chạy lại probe + toàn bộ suite + cả hai typecheck. Runtime `index.html`, `dist/index.html`, `dist/app/main.js`, harness và fixtures oracle đã đối chiếu lại: không đổi so với probe cuối. **Sau đó `src/app/main.ts` tiếp tục bị worker khác sửa (restore/pointer), chưa emit vào dist; báo cáo không review/approve diff mới đó.** [probe.json](../../test/codex-check/evidence/probe.json) giữ snapshot đã chạy; [handoff-hashes.json](../../test/codex-check/evidence/handoff-hashes.json) ghi hash lúc bàn giao và drift nguồn. Các số dòng main.ts trong findings trỏ snapshot đã probe; runtime dist cũ vẫn có lỗi đã chứng minh.
- **Thông tin “dist chưa khởi động được / WEB-F01” trong task không tái hiện trên snapshot này.** Dist khởi động, có 8 câu mẫu, nạp JSON được; các lỗi dưới đây xảy ra sau boot. Không quy lỗi hiện tại cho lỗi boot cũ.

## Checks đã chạy

| Lệnh | Exit | Kết quả thật | Evidence |
| --- | --- | --- | --- |
| `node --test --test-reporter=spec "test/codex-check/**/*.test.mjs"` | 1 | 116 tests, 2 suites; **51 PASS, 65 FAIL**, 0 skipped/cancelled/todo; __DURATION__ giây | [acceptance.log](../../test/codex-check/acceptance.log) |
| Root trong chính lệnh trên | 1 theo full runner | **51 PASS / 7 FAIL**; 43/43 oracle PASS | cùng log, prefix `root: ` |
| Dist trong chính lệnh trên | 1 theo full runner | **0 PASS / 58 FAIL**; tất cả ca đã được gọi, không skip | cùng log, prefix `dist: ` |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS | [typecheck-main.log](../../test/codex-check/typecheck-main.log), rỗng vì không có diagnostics |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS | [typecheck-web.log](../../test/codex-check/typecheck-web.log), rỗng vì không có diagnostics |
| `python -B test/oracle/oracle.py --check` | 0 | 11 PASS, 0 FAIL; 1.632 fixtures, 5.849 maxima, 9 negative controls | [oracle-check.log](../../test/codex-check/oracle-check.log) |
| `node test/codex-check/probe.mjs` | 0 | Đã chụp browser/DOM/storage/reload/screenshots; không phải PASS cho tính năng sản phẩm | [probe.log](../../test/codex-check/probe.log), [probe.json](../../test/codex-check/evidence/probe.json) |
| `python -B test/codex-check/validate-fixture.py` | 0 | ZIP CRC/size, 5 entries, XML/rels, table/media, CRC từng chunk PNG và pixel giải nén hợp lệ | [docx-validation.log](../../test/codex-check/docx-validation.log) |

PowerShell lưu các log lệnh bằng UTF-16LE; JSON/Markdown/source là UTF-8. Lệnh shell có `exit $LASTEXITCODE` để không nhầm output unittest trên stderr thành exit lỗi. Không chạy build vì task không cho ghi lại dist. Full legacy/domain/acceptance suites của người khác: NOT_RUN trong task này; không coi typecheck hoặc oracle self-check là nghiệm thu browser.

## Thiết kế và độ phủ

`browser.test.mjs` dùng `node:test`, `assert/strict`, harness/app có sẵn và Node built-ins; không mock DOM/transport/score. Mỗi ca tên bắt đầu bằng `<target>: `, có nhãn vùng, context sạch và `finally` đóng context; timeout 59.000ms. Teacher roundtrip có context thứ hai cũng đóng trong `finally`. Cả hai TARGETS chạy cùng 58 ca, không skip/xfail.

43 ca vi sai lấy nguyên `exam`, `attempt.responses`, `expected` từ oracle: toàn bộ 29 golden, 8 ca II (k=0..4, key False với null/thiếu/một False), 6 ca III exact/trailing-zero/negative/integer. Chỉ thêm metadata hiển thị; không đổi ID, key, raw hoặc expected. Trả lời từng lựa chọn/ý/input qua giao diện thật, rồi nộp. So chính xác score/max I, II, III và total bằng nhân chéo BigInt; phân số vô hạn giữ exact, bỏ phần xấp xỉ có nhãn. Không dùng scorer sản phẩm làm expected hoặc tự chọn policy làm tròn. [case-results.json](../../test/codex-check/evidence/case-results.json) có thời lượng và trạng thái từng target.

Root: tạo mới đủ I/II/III, sửa key/nội dung tiếng Việt, nạp phòng thi, làm đúng 10/10; tải JSON và nạp nguyên dữ liệu vào context sạch cho điểm tương đương. Import JSON thiếu key từng phần bị từ chối, giữ nguyên draft tốt; **II thiếu boolean không bị đổi thành toàn Sai**. III rỗng bị chặn lưu, sửa hợp lệ rồi publish được. Bank khôi phục mẫu, lọc II kết hợp search không khớp/clear, export-clear-import bảo toàn dữ liệu; reuse rồi sửa bản sao không đổi bank. Không endpoint: root lưu final, reload giữ tên/kết quả, không claim đã gửi và không phát request collector ngoài origin.

DOCX được tự sinh bằng ZIP stored + CRC32 tự viết, có văn bản Unicode, bảng `TABLE-KEEP-42`, ảnh PNG `IMAGE-KEEP-42` và relationships. Các ca thiết kế kiểm preview, hiệu đính, confirm, giữ bảng/ảnh hoặc cảnh báo và cancel; UI thiếu nên **chưa chạy được các nhánh sau upload**. Các ca collect kiểm nickname prefix `= + - @`, raw `-0,5`, JSON nguyên chuỗi và CSV bằng parser độc lập; UI thiếu nên **chưa chứng minh sanitizer an toàn hay có lỗ hổng formula injection**.

## Findings đã chứng minh

### CK-F01 — MAJOR — Không có đường nhập DOCX qua UI

- Affected: `index.html:128`, `index.html:314`, `index.html:382`; `src/app/shell.html:128`, `src/app/shell.html:307`, `src/app/shell.html:396`; app integration `src/app/main.ts:1094` và `:1165`.
- Contract: Shared §6 (đọc → preview/sửa → xác nhận → lưu/xuất; giữ bảng/hình hoặc cảnh báo), WEB §8–9.
- Repro: mở root → `#btnOpenBuilder`; liệt kê mọi input file. Thực tế chỉ `examFileInput`, `builderFileInput`, `bankFileInput`, tất cả accept `.json,application/json`. Không có chooser DOCX. Probe dist cũng có đúng ba input JSON, chưa nối importer vào luồng thật.
- Expected: chọn được DOCX rồi preview và xác nhận. Actual: ba ca `[import]` root fail tại prerequisite `DOCX file chooser is missing`; dist dừng sớm hơn vì CK-F04. Đây là thiếu tính năng sản phẩm, không phải archive lỗi: fixture được validator Python độc lập kiểm cả ZIP/XML/PNG.
- Impact: giáo viên không nhập được Word; các yêu cầu giữ bảng/hình/cancel chưa kiểm chứng, **không kết luận đã quan sát mất bảng/hình**.
- Minimal fix: nối importer + preview/correction/confirm/cancel vào UI thật, giữ cảnh báo/provenance; không gọi module từ test để giả luồng.
- Regression: ba ca `[import]` trong inventory; sau khi nối UI cần chạy lại cả các assertions downstream đang bị chặn.

### CK-F02 — MAJOR — Thiếu tải kết quả JSON/CSV qua UI

- Affected: report actions `index.html:179`–`:203`, `src/app/shell.html:178`–`:202`; app report integration `src/app/main.ts:837`–`:875`.
- Contract: WEB §7 (default local/export JSON/CSV, nguyên raw JSON, CSV safe encoding), §9 Thu kết quả; Shared §3 trạng thái gửi trung thực.
- Repro: tải đề một câu III → tên `=SUM(1,1)` / `+SUM(1,1)` / `-SUM(1,1)` / `@SUM(1,1)` → nhập `-0,5` → nộp → kiểm các nút đang hiện. Root chỉ còn Print/PDF, HTML offline, Restart; không JSON/CSV. Dist bị CK-F03 xóa cả report actions.
- Evidence: bốn ca `[collect] JSON raw + CSV...` root fail có inventory nút thực tế trong log; `probe.json.result.buttons` và [root-result.png](../../test/codex-check/evidence/root-result.png).
- Expected: tải được JSON/CSV thật để đối chiếu raw/escaping. Actual: không thể tải. Không kết luận CSV injection đã khai thác được khi exporter chưa truy cập được.
- Minimal fix: expose exporter qua UI; giữ raw JSON và sanitize toàn bộ trường untrusted cho CSV. Không thay bằng alert tải thành công.
- Regression: bốn prefix cases; các kiểm tra nội dung file còn NOT_REACHED.

### CK-F03 — BLOCKER — Dist xóa điểm từng phần, actions và chi tiết báo cáo sau nộp

- Affected: `src/app/main.ts:853`–`:873`, đặc biệt `reportView.innerHTML` tại `:866`; nested structure `src/app/shell.html:146`–`:202`.
- Contract: Shared §2 Báo cáo CRITICAL và §7: tổng cùng riêng từng phần đạt/tối đa; WEB §9–10; DOM contract `test/claude-check/README.md`.
- Repro: dist → nạp `golden-20-0-0-full` → chọn đúng 20 câu → nộp. App tính/hiện tổng `5 / 5` trong một đoạn văn, nhưng sau khi cập nhật các score nodes lại gán `reportView.innerHTML` bằng summary đơn giản. Toàn bộ scorePartI/II/III/scoreTotal, actions và review descendants biến mất.
- Evidence: 43 ca oracle dist fail `I must display score / max:` vì chuỗi rỗng. [dist-submitted.png](../../test/codex-check/evidence/dist-submitted.png) cho thấy chỉ tổng 5/5, không bảng điểm từng phần; `probe.json.submitted.reportText` xác nhận.
- Expected: UI giữ đủ I/II/III/total, review và downloads; Actual: thiếu dữ liệu bắt buộc. Đây không chỉ là selector khác: screenshot và toàn bộ report text cũng thiếu điểm từng phần. **Không suy ra arithmetic của dist sai từ 43 lỗi prerequisite này.** Root cùng dữ liệu, thao tác và comparator pass 43/43.
- Minimal fix: không ghi đè container đang chứa toàn report; cập nhật summary riêng hoặc mount report view đầy đủ, giữ DOM contract và policy.
- Regression: toàn bộ 43 oracle browser cases trên cả hai target.

### CK-F04 — MAJOR — Dist mở teacher/bank không có hành vi

- Affected: `src/app/main.ts:1165`–`:1177` (attach submit/close/name/file, thiếu open-builder/open-bank và authoring bindings); shell có nút nhưng không được nối.
- Contract: Shared §1, §5; WEB §9 Soạn đề/Bank, §10 parity browser.
- Repro: dist khởi động → click `#btnOpenBuilder` hoặc `#btnOpenBank`. Modal vẫn `display:none`; click thêm III trong probe cũng giữ questionCount=0, list rỗng. Không có đường người dùng tiếp tục authoring/bank.
- Evidence: năm ca `[teacher]`, hai `[bank]`, ba `[import]` dist fail ngay assertion mở modal; `probe.json.builder` ghi display none/count 0.
- Expected: mở được công cụ và thao tác; Actual: nút inert. Tests kiểm modal trước, **chưa phụ thuộc selector editor riêng của root** nên không phải test sai vì dist dùng markup khác.
- Minimal fix: nối routes/mount/actions teacher+bank từ composition root, sau đó chạy lại workflows đầy đủ. Không dựng hàm sản phẩm giả trong test.
- Regression: năm teacher, hai bank và ba import cases.

### CK-F05 — BLOCKER — Dist không lưu final, reload mất danh tính/kết quả đã nộp

- Affected: `src/app/main.ts:515`–`:556`, `:827`–`:834`; `src/app/legacy.ts:462` trở đi spread `...scoreRes` có Rational BigInt vào LegacyScoredResult.
- Contract: Shared §3, §5; WEB §4.1 cấm stringify bigint trực tiếp, §6 durable final/recovery, §7 trạng thái lưu chính xác.
- Repro: dist → nạp đề → nhập nickname `Codex trạng thái cục bộ` → nộp → reload. Badge vẫn `Đã lưu`; nickname về `Thí sinh tự do`, report không còn final đã chốt. Do hash route còn report, wrapper vẫn có thể hiện template — **không khẳng định mọi lần reload đều về màn làm bài**.
- Evidence: ca `[collect][storage] no endpoint...` dist fail `reload must preserve final candidate name`; probe sau submit chỉ còn draft `submitted:false, scoreResult:null`, không final, sau reload tên mặc định. `probe.json.submitted.records` và `.afterReload`.
- Cause: scoredResult chứa `...scoreRes` với bigint; `JSON.stringify(payload)` trong saveStateToStorage ném lỗi rồi bị `catch (_) {}` nuốt, bỏ write final và giữ badge từ draft. Đây là nguyên nhân được source hỗ trợ, độc lập bằng chứng mất dữ liệu browser.
- Expected: final có thể phục hồi cùng tên/điểm, hoặc lỗi lưu trung thực và phương án export. Actual: badge cũ che việc final chưa lưu; dữ liệu đã nộp không bền.
- Minimal fix: serialize score bằng DTO rational strings theo barrel/API, xử lý lỗi lưu, restore đúng immutable final. Giữ storage decision D03 tách khỏi bug mất dữ liệu: test chỉ yêu cầu reload giữ final, không ép localStorage hay IndexedDB.
- Regression: no-endpoint case trên cả hai target; cần mở rộng quota/two-tab sau fix ở worker sản phẩm.

## NEED_DECISION — không viết thành ca đỏ

**ND-01: Publish khi còn bản sửa key chưa lưu/không hợp lệ.** Root: thêm III (key mẫu `1,5`) → sửa key rỗng → Lưu báo lỗi empty và giữ editor → bấm Nạp vào phòng thi vẫn publish bản key cũ. Probe ghi cả alert lỗi lẫn alert thành công. Contract cấm publish draft không hợp lệ nhưng chưa xác định bản sửa chưa lưu thuộc draft nào. Không dùng hành vi này làm ca đỏ; ca tự động chỉ yêu cầu chặn Lưu key rỗng, sửa thành `-0,5`, rồi publish bản hợp lệ.

- A: chặn publish/export khi editor còn dirty/invalid, buộc lưu hoặc hủy.
- B: publish bản đã lưu nhưng phải cảnh báo rõ và yêu cầu xác nhận bỏ thay đổi.
- C: tự validate+save editor trước publish, lỗi thì giữ editor và chặn.

**D02 hiển thị điểm:** các phương án của WEB §12 vẫn là exact-only / decimal có policy digits+mode / exact kèm decimal xấp xỉ có nhãn. Bộ test chỉ so exact score/max hiện có, không phê duyệt policy làm tròn.

**D04 endpoint Google:** local/export / owner-controlled Apps Script pilot / serverless được duyệt. Live CORS, receipt và Sheets/Drive readback: NOT_RUN vì task không có endpoint/quyền được duyệt. Không tạo ca đỏ vì chưa được cấp endpoint; không tự gửi tin hoặc request tới Google.

## Danh sách từng ca (cùng tên logic trên cả hai target)

Prefix thực tế luôn là `root: ` hoặc `dist: ` trước cột tên dưới đây. FAIL ở prerequisite được mô tả trong findings, không coi các bước downstream là đã chạy.

| # | Tên sau prefix target | Root | Dist |
| --- | --- | --- | --- |
__TABLE__

Thời lượng ca dài nhất trong full run: __MAX__ ms, dưới 60 giây. Toàn bộ kết quả lấy từ log thật, không gắn expected-fail để làm xanh.

## Giới hạn và bước tiếp theo

- Root 7 ca đỏ là thiếu UI DOCX (3) và export JSON/CSV (4). Dist 58 ca đỏ chia thành report mất điểm từng phần (43), teacher/bank/import không mở (10), exporter không hiện sau submit (4), reload không giữ final (1).
- DOCX table/image preservation, hiệu đính/confirm/cancel, CSV sanitizer và raw JSON payload chưa đạt đến bước thực thi; assertions có sẵn nhưng cần chạy và rà lại trên UI đã tích hợp. Không coi module/unit tests như đã kiểm browser cho các hành vi này.
- Corpus là synthetic minimal DOCX, chưa phải toàn bộ corpus nhiều cột/OMML/merged table/PDF/zip bomb. CSV browser cases hiện tập trung bốn prefix nickname và raw âm III; fullwidth/control prefixes và mọi ID/text field cần bổ sung khi exporter UI dùng được.
- Không nghiệm thu two-tab, IME OS, accessibility, mobile, production collector hay offline service worker trong task bổ sung này; đây không phải blanket approval.
- Giao worker sửa CK-F01…05 trong scope sản phẩm của họ rồi chạy lại nguyên bộ test. Chốt ND-01 riêng. Không sửa/xóa/skip test để né hành vi bắt buộc.
'''
report = report.replace('__TABLE__', table).replace('__MAX__', f'{max_duration:.3f}').replace('__DURATION__', f'{duration:.3f}')
destination = root / 'docs' / 'reviews' / 'CK-codex-tests.md'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(report, encoding='utf-8')
print(f'Wrote {destination}: {len(inventory)} cases x 2 targets; max case {max_duration:.3f}ms; runtime hashes stable; source drift={list(drift)}')
