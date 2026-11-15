# CK-CODEX-TESTS

Supplemental real Chrome/Edge browser tests using the unchanged `../claude-check/harness.mjs` and `app.mjs`. JavaScript ESM, Node built-ins only; no install, build, product edits, network collector or deployment.

```powershell
node --test --test-reporter=spec "test/codex-check/**/*.test.mjs"
node --test --test-reporter=spec --test-name-pattern="^root" "test/codex-check/**/*.test.mjs"
node test/codex-check/probe.mjs
python -B test/codex-check/validate-fixture.py
```

58 cases per target, 116 total. Each case has a fresh browser context, a 59-second timeout and `finally` cleanup; suites use concurrency 3. Both TARGETS are used without skip/xfail or expected product failures. The teacher roundtrip also closes its second context in `finally`. Output is real browser UI, not a VM or DOM stub.

43 differential cases read existing oracle fixtures without importing a product scorer: all 29 golden, eight Part II (k=0..4 and false-key/unanswered), six short-answer exactness cases. Only display metadata is added; IDs, keys, responses and expected values remain unchanged. UI scores and maxima are compared exactly by BigInt cross multiplication, including rational fractions; a labelled decimal approximation is ignored. No rounding policy is invented. All 43 also run on dist; inability to expose section scores is a failed report prerequisite, not evidence of wrong arithmetic.

Other cases cover teacher creation/edit/answer validation/runner/roundtrip, bank seed/filter/backup/restore/reuse isolation, synthetic DOCX preview/correction/cancel, JSON/CSV formula prefixes and truthful local save/reload without endpoint. Teacher/bank controls are first checked for opening, so dist's disconnected buttons fail before relying on legacy editor selectors. Import cases fail explicitly when the application has no DOCX file chooser. They do not call unattached module functions to simulate a working UI.

`support.mjs` generates JSON files and a minimal valid DOCX under `fixtures/`. Its ZIP writer implements CRC32, local headers, central directory and EOCD; the document has Unicode text, one table, a relationship and an embedded valid PNG. `validate-fixture.py` independently verifies ZIP, XML and PNG using Python's standard library. JSON fixtures are regenerated deterministically except IDs produced by the application's own teacher UI. No generated source contains real student data.

`probe.mjs` captures screenshots and JSON evidence under `evidence/`, browser version, DOM/control inventory, reload observations and source SHA256 before/after. `acceptance.log` is the authoritative final full-suite log. Review and case inventory: `../../docs/reviews/CK-codex-tests.md`.

Limitations: missing DOCX/export UI blocks downstream assertions; these have not validated actual preservation/cancel/sanitizer behavior yet. No live Google endpoint or approved collector exists for this task. No dependency additions or changes to `test/claude-check` are needed.
