import fs from 'node:fs';

const htmlPath = 'index.html';
const raw = fs.readFileSync(htmlPath, 'utf8');

const markerStart = "    // ==============================================================\n    // Rational Arithmetic & Scoring Engine (Chuẩn phân số BigInt theo M1 & GDPT 2018)\n    // ==============================================================";
const markerEnd = "    // Khởi động ứng dụng khi trang sẵn sàng\n    window.addEventListener('DOMContentLoaded', initExam);";

const startIndex = raw.indexOf(markerStart);
const endIndex = raw.indexOf(markerEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found in index.html");
  process.exit(1);
}

const newScript = `    // ==============================================================
    // Rational Arithmetic & Scoring Engine (Chuẩn phân số BigInt theo M1 & GDPT 2018)
    // ==============================================================
    function gcdBigInt(a, b) {
      let x = a < 0n ? -a : a;
      let y = b < 0n ? -b : b;
      while (y !== 0n) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    }

    function rational(num, den = 1n) {
      let n = typeof num === 'bigint' ? num : BigInt(num);
      let d = typeof den === 'bigint' ? den : BigInt(den);
      if (d === 0n) throw new RangeError('Denominator cannot be zero');
      if (n === 0n) return { num: 0n, den: 1n };
      if (d < 0n) { n = -n; d = -d; }
      const g = gcdBigInt(n, d);
      return { num: n / g, den: d / g };
    }

    function ratAdd(a, b) {
      return rational(a.num * b.den + b.num * a.den, a.den * b.den);
    }

    function ratSub(a, b) {
      return rational(a.num * b.den - b.num * a.den, a.den * b.den);
    }

    function ratMul(a, b) {
      return rational(a.num * b.num, a.den * b.den);
    }

    function ratDiv(a, b) {
      return rational(a.num * b.den, a.den * b.num);
    }

    function ratCompare(a, b) {
      const diff = a.num * b.den - b.num * a.den;
      if (diff < 0n) return -1;
      if (diff > 0n) return 1;
      return 0;
    }

    function ratToNumber(r) {
      return Number(r.num) / Number(r.den);
    }

    function ratToFractionString(r) {
      if (!r || typeof r.num !== 'bigint' || typeof r.den !== 'bigint') return '0';
      if (r.den === 1n) return r.num.toString();
      return r.num.toString() + '/' + r.den.toString();
    }

    function formatRationalScore(val) {
      if (val === null || val === undefined) return '0';
      let num = 0n, den = 1n;
      if (typeof val === 'string') {
        const parts = val.split('/');
        if (parts.length === 1) {
          num = BigInt(parts[0] || 0);
          den = 1n;
        } else {
          num = BigInt(parts[0] || 0);
          den = BigInt(parts[1] || 1);
        }
      } else if (typeof val === 'object' && val.num !== undefined) {
        num = BigInt(val.num);
        den = BigInt(val.den || 1);
      } else if (typeof val === 'number') {
        return formatScore(val);
      }
      if (den === 1n) return num.toString();
      let d = den < 0n ? -den : den;
      while (d % 2n === 0n) d /= 2n;
      while (d % 5n === 0n) d /= 5n;
      if (d === 1n) {
        const n = Number(num) / Number(den);
        const fixed = n.toFixed(2).replace(/\\.?0+$/, '');
        return fixed.replace('.', ',');
      }
      const approx = (Number(num) / Number(den)).toFixed(2).replace('.', ',');
      return num.toString() + '/' + den.toString() + ' (\\u2248 ' + approx + ')';
    }

    const SHORT_ANSWER_MAX_LENGTH = 4;
    function checkShortAnswer(raw) {
      if (typeof raw !== 'string') return ['bad_char'];
      const codePoints = Array.from(raw);
      if (codePoints.length === 0) return ['empty'];
      const issues = [];
      if (codePoints.length > SHORT_ANSWER_MAX_LENGTH) issues.push('too_long');
      let hasBadChar = false;
      for (const ch of codePoints) {
        const code = ch.codePointAt(0);
        const isAllowed = code !== undefined && (
          (code >= 0x30 && code <= 0x39) || // 0-9
          code === 0x2D ||                   // -
          code === 0x2C                      // ,
        );
        if (!isAllowed) {
          hasBadChar = true;
          break;
        }
      }
      if (hasBadChar) issues.push('bad_char');
      return issues;
    }

    const PART2_RATIONALS = Object.freeze([
      rational(0n),
      rational(1n, 10n),
      rational(1n, 4n),
      rational(1n, 2n),
      rational(1n)
    ]);

    function computeExamMaxFromQuestions(questions) {
      let n1 = 0, n2 = 0, n3 = 0;
      if (Array.isArray(questions)) {
        for (const q of questions) {
          if (q.kind === 'I') n1++;
          else if (q.kind === 'II') n2++;
          else if (q.kind === 'III') n3++;
        }
      }
      if (n1 + n2 + n3 === 0) {
        const zero = rational(0n);
        return { n1: 0, n2: 0, n3: 0, maxI: zero, maxII: zero, pointIII: zero, maxIII: zero, maxTotal: zero };
      }
      const ratN1 = rational(n1);
      const ratN2 = rational(n2);
      const ratN3 = rational(n3);
      const pointI = rational(1n, 4n);

      const maxI = ratMul(ratN1, pointI);
      const maxII = ratN2;

      let pointIII, maxIII;
      if (n3 === 0) {
        pointIII = rational(0n);
        maxIII = rational(0n);
      } else {
        const base = ratAdd(maxI, maxII);
        const ten = rational(10n);
        if (ratCompare(base, ten) < 0) {
          pointIII = ratDiv(ratSub(ten, base), ratN3);
        } else {
          pointIII = pointI;
        }
        maxIII = ratMul(ratN3, pointIII);
      }
      const maxTotal = ratAdd(ratAdd(maxI, maxII), maxIII);
      return { n1, n2, n3, maxI, maxII, pointIII, maxIII, maxTotal };
    }

    const STORAGE_KEY = 'cunata_exam_attempt_v1';
    let currentExam = EMBEDDED_SAMPLE_EXAM;
    let studentState = {
      attemptId: 'attempt-sample-01',
      candidateName: 'Thí sinh tự do',
      durationSeconds: 50 * 60,
      startedAt: null,
      deadline: null,
      remainingSeconds: 50 * 60,
      responses: {},
      flagged: {},
      submitted: false,
      scoreResult: null
    };

    function renderMathText(text) {
      if (!text) return '';
      let html = text;
      html = html.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" class="exam-figure" />');
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\$([^$]+)\\$/g, (match, formula) => {
        let f = formula;
        f = f.replace(/\\\\vec\\{([a-zA-Z])\\}/g, '$1&#8407;');
        f = f.replace(/\\\\int_\\{([^}]+)\\}\\^\\{([^}]+)\\}/g, '&int;<sub>$1</sub><sup>$2</sup> ');
        f = f.replace(/\\\\frac\\{([^}]+)\\}\\{([^}]+)\\}/g, '($1/$2)');
        f = f.replace(/\\\\sqrt\\{([^}]+)\\}/g, '&radic;($1)');
        f = f.replace(/\\\\pm/g, '&plusmn;');
        f = f.replace(/\\\\neq/g, '&ne;');
        f = f.replace(/\\\\Leftrightarrow/g, ' &hArr; ');
        f = f.replace(/\\\\Rightarrow/g, ' &rArr; ');
        f = f.replace(/\\\\in/g, ' &isin; ');
        f = f.replace(/\\\\infty/g, '&infin;');
        f = f.replace(/\\\\Omega/g, '&Omega;');
        f = f.replace(/\\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');
        f = f.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');
        return '<span class="math-expr">' + f + '</span>';
      });
      html = html.replace(/\\n\\n/g, '</p><p>').replace(/\\n/g, '<br/>');
      return '<p>' + html + '</p>';
    }

    function formatScore(num) {
      if (typeof num !== 'number') return '0';
      const fixed = num % 1 === 0 ? num.toFixed(0) : num.toFixed(2).replace(/\\.?0+$/, '');
      return fixed.replace('.', ',');
    }

    async function initExam() {
      try {
        const resp = await fetch('public/sample-exam.json');
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.questions) && data.questions.length > 0) {
            currentExam = data;
          }
        }
      } catch (e) {
        console.warn('Không thể fetch public/sample-exam.json, sử dụng embedded sample exam:', e);
      }

      loadLocalState();

      const titleEl = document.getElementById('examTitle');
      if (titleEl) titleEl.textContent = currentExam.title || 'Đề Khảo Sát Năng Lực Toán 12';
      const candEl = document.getElementById('candidateName');
      if (candEl) candEl.value = studentState.candidateName;

      renderExamPane();
      renderPalette();
      startTimer();

      if (studentState.submitted && studentState.scoreResult) {
        showReportView();
      }
    }

    function saveLocalState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const existing = JSON.parse(raw);
          if (existing && existing.submitted === true) {
            studentState.submitted = true;
            if (existing.scoreResult) studentState.scoreResult = existing.scoreResult;
            if (existing.candidateName) studentState.candidateName = existing.candidateName;
            return;
          }
        }
        if (!studentState.startedAt) {
          studentState.startedAt = Date.now();
          studentState.deadline = studentState.startedAt + (studentState.remainingSeconds || 50 * 60) * 1000;
        }
        const nameEl = document.getElementById('candidateName');
        if (nameEl && typeof nameEl.value === 'string') {
          const trimmed = nameEl.value.trim();
          if (trimmed) studentState.candidateName = trimmed;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(studentState));
        const syncText = document.getElementById('syncText');
        if (syncText) syncText.textContent = 'Đã lưu cục bộ';
      } catch (err) {
        console.warn('Lỗi khi lưu vào localStorage:', err);
      }
    }

    function loadLocalState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            studentState = Object.assign(studentState, parsed);
            const now = Date.now();
            if (studentState.deadline && now >= studentState.deadline && !studentState.submitted) {
              studentState.remainingSeconds = 0;
              submitExam();
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi khi đọc localStorage:', e);
      }
    }

    let timerInterval = null;
    function startTimer() {
      if (timerInterval) clearInterval(timerInterval);
      if (studentState.submitted) {
        updateTimerDisplay(studentState.remainingSeconds);
        return;
      }

      const now = Date.now();
      if (!studentState.startedAt || !studentState.deadline || studentState.startedAt > now) {
        studentState.startedAt = now;
        studentState.deadline = now + (studentState.remainingSeconds || 50 * 60) * 1000;
      }

      if (now >= studentState.deadline) {
        studentState.remainingSeconds = 0;
        updateTimerDisplay(0);
        submitExam();
        return;
      }

      studentState.remainingSeconds = Math.max(0, Math.ceil((studentState.deadline - now) / 1000));
      updateTimerDisplay(studentState.remainingSeconds);

      timerInterval = setInterval(() => {
        const curNow = Date.now();
        if (curNow >= studentState.deadline) {
          studentState.remainingSeconds = 0;
          clearInterval(timerInterval);
          updateTimerDisplay(0);
          alert('Đã hết thời gian làm bài! Hệ thống tự động nộp bài.');
          submitExam();
          return;
        }
        studentState.remainingSeconds = Math.max(0, Math.ceil((studentState.deadline - curNow) / 1000));
        updateTimerDisplay(studentState.remainingSeconds);
        if (studentState.remainingSeconds % 10 === 0) {
          saveLocalState();
        }
      }, 1000);
    }

    function updateTimerDisplay(sec) {
      const timerBox = document.getElementById('timerBox');
      if (!timerBox) return;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const formatted = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      timerBox.textContent = formatted;
      if (sec < 5 * 60) {
        timerBox.classList.add('timer-warning');
      } else {
        timerBox.classList.remove('timer-warning');
      }
    }

    function renderExamPane() {
      const pane = document.getElementById('examPane');
      if (!pane) return;
      pane.innerHTML = '';

      const examMax = computeExamMaxFromQuestions(currentExam.questions || []);
      let currentSectionKind = null;

      (currentExam.questions || []).forEach((q, idx) => {
        if (q.kind !== currentSectionKind) {
          currentSectionKind = q.kind;
          const banner = document.createElement('div');
          banner.className = 'section-banner';
          if (q.kind === 'I') {
            banner.innerHTML = '<span class="section-tag">Phần I</span><h2>Câu hỏi trắc nghiệm nhiều phương án lựa chọn</h2><p>Mỗi câu thí sinh chỉ chọn một phương án. Đúng mỗi câu được 0,25 điểm.</p>';
          } else if (q.kind === 'II') {
            banner.innerHTML = '<span class="section-tag">Phần II</span><h2>Câu hỏi trắc nghiệm Đúng / Sai</h2><p>Mỗi câu có 4 ý a), b), c), d). Điểm theo số ý đúng: 1 ý = 0,10; 2 ý = 0,25; 3 ý = 0,50; 4 ý = 1,00 điểm.</p>';
          } else if (q.kind === 'III') {
            const ptLabel = formatRationalScore(ratToFractionString(examMax.pointIII));
            banner.innerHTML = '<span class="section-tag">Phần III</span><h2>Câu hỏi trắc nghiệm trả lời ngắn</h2><p>Thí sinh điền kết quả vào ô trống (tối đa 4 ký tự). Điểm mỗi câu: ' + ptLabel + ' điểm.</p>';
          }
          pane.appendChild(banner);
        }

        const card = document.createElement('article');
        card.className = 'question-card';
        card.id = 'qcard-' + q.questionVersionId;

        const isFlagged = !!studentState.flagged[q.questionVersionId];
        const pointLabel = q.kind === 'I' ? '0,25 điểm' : (q.kind === 'II' ? '1,00 điểm' : (formatRationalScore(ratToFractionString(examMax.pointIII)) + ' điểm'));

        const metaBar = document.createElement('div');
        metaBar.className = 'question-meta-bar';
        metaBar.innerHTML = '<div class="question-num-tag"><span>' + (q.title || ('Câu ' + (idx + 1))) + '</span><span class="point-badge">' + pointLabel + '</span></div><button type="button" class="btn-flag ' + (isFlagged ? 'flagged' : '') + '" data-qid="' + q.questionVersionId + '" aria-label="Đánh dấu câu hỏi này">★ ' + (isFlagged ? 'Đã đánh dấu' : 'Đánh dấu') + '</button>';
        card.appendChild(metaBar);

        const stem = document.createElement('div');
        stem.className = 'question-stem';
        stem.innerHTML = renderMathText(q.content);
        card.appendChild(stem);

        if (q.kind === 'I') {
          const optGrid = document.createElement('div');
          optGrid.className = 'options-grid';
          const selectedId = studentState.responses[q.questionVersionId] || null;

          (q.options || []).forEach((opt) => {
            const isSelected = selectedId === opt.optionId;
            const optCard = document.createElement('div');
            optCard.className = 'option-card ' + (isSelected ? 'selected' : '');
            optCard.setAttribute('role', 'radio');
            optCard.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            optCard.innerHTML = '<div class="option-letter">' + opt.label + '</div><div class="option-text">' + renderMathText(opt.text) + '</div>';
            optCard.addEventListener('click', () => {
              if (studentState.submitted) return;
              studentState.responses[q.questionVersionId] = opt.optionId;
              saveLocalState();
              renderExamPane();
              renderPalette();
            });
            optGrid.appendChild(optCard);
          });
          card.appendChild(optGrid);
        } else if (q.kind === 'II') {
          const table = document.createElement('div');
          table.className = 'statements-table';
          const userSts = studentState.responses[q.questionVersionId] || {};

          (q.statements || []).forEach((st) => {
            const userVal = userSts[st.statementId];
            const row = document.createElement('div');
            row.className = 'statement-row';
            row.innerHTML = '<div class="statement-label">' + st.label + ')</div><div class="statement-text">' + renderMathText(st.text) + '</div><div class="tf-toggle-group"><button type="button" class="tf-btn ' + (userVal === true ? 'selected-true' : '') + '" data-val="true">Đúng</button><button type="button" class="tf-btn ' + (userVal === false ? 'selected-false' : '') + '" data-val="false">Sai</button></div>';

            const btnTrue = row.querySelector('[data-val="true"]');
            const btnFalse = row.querySelector('[data-val="false"]');

            if (btnTrue) {
              btnTrue.addEventListener('click', () => {
                if (studentState.submitted) return;
                if (!studentState.responses[q.questionVersionId]) studentState.responses[q.questionVersionId] = {};
                if (studentState.responses[q.questionVersionId][st.statementId] === true) {
                  delete studentState.responses[q.questionVersionId][st.statementId];
                } else {
                  studentState.responses[q.questionVersionId][st.statementId] = true;
                }
                saveLocalState();
                renderExamPane();
                renderPalette();
              });
            }

            if (btnFalse) {
              btnFalse.addEventListener('click', () => {
                if (studentState.submitted) return;
                if (!studentState.responses[q.questionVersionId]) studentState.responses[q.questionVersionId] = {};
                if (studentState.responses[q.questionVersionId][st.statementId] === false) {
                  delete studentState.responses[q.questionVersionId][st.statementId];
                } else {
                  studentState.responses[q.questionVersionId][st.statementId] = false;
                }
                saveLocalState();
                renderExamPane();
                renderPalette();
              });
            }

            table.appendChild(row);
          });
          card.appendChild(table);
        } else if (q.kind === 'III') {
          const rawVal = studentState.responses[q.questionVersionId] ?? '';
          const container = document.createElement('div');
          container.className = 'short-answer-container';

          const charsPreview = document.createElement('div');
          charsPreview.className = 'short-answer-chars-preview';
          for (let i = 0; i < 4; i++) {
            const ch = (typeof rawVal === 'string' && rawVal[i]) ? rawVal[i] : '';
            const box = document.createElement('div');
            box.className = 'char-box ' + (ch ? 'filled' : '');
            box.textContent = ch;
            charsPreview.appendChild(box);
          }

          container.innerHTML = '<div class="short-answer-input-wrap"><input type="text" maxlength="4" class="short-answer-input" placeholder="Ví dụ: -0,5" value="' + (typeof rawVal === 'string' ? rawVal.replace(/"/g, '&quot;') : '') + '" autocomplete="off" /></div><div class="quick-keys-bar"><span style="font-size: 0.8125rem; color: var(--gray-600); font-weight: 500;">Phím tắt:</span><button type="button" class="quick-key-btn" data-char="-">- (Dấu âm)</button><button type="button" class="quick-key-btn" data-char=",">, (Dấu phẩy)</button><button type="button" class="quick-key-btn" data-action="clear">Xóa</button></div><div class="input-hint-text">Tối đa 4 ký tự: chữ số 0-9, dấu trừ (-) và dấu phẩy (,). So sánh chính xác từng ký tự.</div>';

          container.insertBefore(charsPreview, container.querySelector('.quick-keys-bar'));

          const inputEl = container.querySelector('.short-answer-input');
          inputEl.addEventListener('input', (e) => {
            if (studentState.submitted) return;
            const val = e.target.value;
            studentState.responses[q.questionVersionId] = val;
            try {
              const boxes = charsPreview.querySelectorAll('.char-box');
              for (let i = 0; i < 4; i++) {
                const ch = (typeof val === 'string' && val[i]) ? val[i] : '';
                if (boxes[i]) {
                  boxes[i].textContent = ch;
                  if (ch) boxes[i].classList.add('filled');
                  else boxes[i].classList.remove('filled');
                }
              }
            } catch (_) {}
            saveLocalState();
            renderPalette();
          });

          container.querySelectorAll('.quick-key-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              if (studentState.submitted) return;
              if (btn.dataset.action === 'clear') {
                studentState.responses[q.questionVersionId] = '';
                if (inputEl) inputEl.value = '';
              } else {
                const char = btn.dataset.char;
                const cur = (typeof studentState.responses[q.questionVersionId] === 'string') ? studentState.responses[q.questionVersionId] : '';
                if (cur.length < 4) {
                  const updated = cur + char;
                  studentState.responses[q.questionVersionId] = updated;
                  if (inputEl) inputEl.value = updated;
                }
              }
              try {
                const curVal = studentState.responses[q.questionVersionId] || '';
                const boxes = charsPreview.querySelectorAll('.char-box');
                for (let i = 0; i < 4; i++) {
                  const ch = curVal[i] || '';
                  if (boxes[i]) {
                    boxes[i].textContent = ch;
                    if (ch) boxes[i].classList.add('filled');
                    else boxes[i].classList.remove('filled');
                  }
                }
              } catch (_) {}
              saveLocalState();
              renderPalette();
            });
          });

          card.appendChild(container);
        }

        const flagBtn = card.querySelector('.btn-flag');
        if (flagBtn) {
          flagBtn.addEventListener('click', () => {
            studentState.flagged[q.questionVersionId] = !studentState.flagged[q.questionVersionId];
            saveLocalState();
            renderExamPane();
            renderPalette();
          });
        }

        pane.appendChild(card);
      });
    }

    function renderPalette() {
      const grid = document.getElementById('paletteGrid');
      if (!grid) return;
      grid.innerHTML = '';

      let answeredCount = 0;
      (currentExam.questions || []).forEach((q, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-btn';
        btn.textContent = String(idx + 1);

        const isFlagged = !!studentState.flagged[q.questionVersionId];
        if (isFlagged) btn.classList.add('flagged');

        const res = studentState.responses[q.questionVersionId];
        if (q.kind === 'I') {
          if (res) {
            btn.classList.add('answered');
            answeredCount++;
          }
        } else if (q.kind === 'II') {
          const keys = res ? Object.keys(res) : [];
          if (keys.length === 4) {
            btn.classList.add('answered');
            answeredCount++;
          } else if (keys.length > 0) {
            btn.classList.add('partial');
          }
        } else if (q.kind === 'III') {
          if (typeof res === 'string' && res.length > 0) {
            btn.classList.add('answered');
            answeredCount++;
          }
        }

        btn.addEventListener('click', () => {
          const target = document.getElementById('qcard-' + q.questionVersionId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.classList.add('highlight');
            setTimeout(() => target.classList.remove('highlight'), 1200);
          }
        });

        grid.appendChild(btn);
      });

      const prog = document.getElementById('paletteProgress');
      if (prog) {
        prog.textContent = 'Đã làm: ' + answeredCount + '/' + (currentExam.questions || []).length + ' câu';
      }
    }

    const btnSubmit = document.getElementById('btnSubmit');
    const submitModal = document.getElementById('submitModal');
    const btnCancelSubmit = document.getElementById('btnCancelSubmit');
    const btnConfirmSubmit = document.getElementById('btnConfirmSubmit');

    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        if (studentState.submitted) return;
        let answeredCount = 0;
        (currentExam.questions || []).forEach((q) => {
          const res = studentState.responses[q.questionVersionId];
          if (q.kind === 'I' && res) answeredCount++;
          else if (q.kind === 'II' && res && Object.keys(res).length === 4) answeredCount++;
          else if (q.kind === 'III' && typeof res === 'string' && res.length > 0) answeredCount++;
        });

        const total = (currentExam.questions || []).length;
        const un = total - answeredCount;
        const modalBody = document.getElementById('modalBodyText');
        if (modalBody) {
          if (un > 0) {
            modalBody.innerHTML = 'Bạn đã hoàn thành <strong>' + answeredCount + '/' + total + '</strong> câu hỏi. Còn <strong>' + un + '</strong> câu chưa hoàn thành hoặc chưa làm đủ ý.<br><br>Bạn có chắc chắn muốn nộp bài ngay bây giờ?';
          } else {
            modalBody.innerHTML = 'Bạn đã hoàn thành toàn bộ <strong>' + total + '/' + total + '</strong> câu hỏi.<br><br>Bạn có chắc chắn muốn nộp bài để xem bảng điểm và lời giải chi tiết?';
          }
        }
        if (submitModal) submitModal.style.display = 'flex';
      });
    }

    if (btnCancelSubmit) {
      btnCancelSubmit.addEventListener('click', () => {
        if (submitModal) submitModal.style.display = 'none';
      });
    }

    if (btnConfirmSubmit) {
      btnConfirmSubmit.addEventListener('click', () => {
        if (submitModal) submitModal.style.display = 'none';
        submitExam();
      });
    }

    function scoreAttemptLocally() {
      const examMax = computeExamMaxFromQuestions(currentExam.questions || []);

      const questionResults = [];
      let scoreIRat = rational(0n);
      let scoreIIRat = rational(0n);
      let scoreIIIRat = rational(0n);

      (currentExam.questions || []).forEach((q) => {
        if (q.kind === 'I') {
          const selected = studentState.responses[q.questionVersionId] || null;
          let status = 'unanswered';
          let ptsRat = rational(0n);
          const isSelected = selected !== null && selected !== undefined;
          const isValidOption = isSelected && Array.isArray(q.options) && q.options.some(o => o.optionId === selected);

          if (!isSelected) {
            status = 'unanswered';
            ptsRat = rational(0n);
          } else if (!isValidOption) {
            status = 'invalid';
            ptsRat = rational(0n);
          } else if (selected === q.correctOptionId) {
            status = 'full';
            ptsRat = rational(1n, 4n);
          } else {
            status = 'wrong';
            ptsRat = rational(0n);
          }

          scoreIRat = ratAdd(scoreIRat, ptsRat);
          questionResults.push({
            questionVersionId: q.questionVersionId,
            kind: 'I',
            title: q.title,
            status,
            userAnswer: selected ? (q.options?.find(o => o.optionId === selected)?.label || selected) : 'Chưa chọn',
            correctAnswer: q.options?.find(o => o.optionId === q.correctOptionId)?.label || q.correctOptionId,
            pointsFraction: ratToFractionString(ptsRat),
            maxPointsFraction: '1/4',
            points: ratToNumber(ptsRat),
            maxPoints: 0.25,
            explanation: q.explanation
          });
        } else if (q.kind === 'II') {
          const userSts = studentState.responses[q.questionVersionId] || {};
          let correctCount = 0;
          let answeredStatements = 0;
          const stDetails = [];

          (q.statements || []).forEach((st) => {
            const userVal = userSts[st.statementId];
            if (userVal !== undefined) answeredStatements++;
            const isMatch = userVal === st.answer;
            if (isMatch) correctCount++;
            stDetails.push({
              label: st.label,
              userVal: userVal === undefined ? 'Chưa chọn' : (userVal ? 'Đúng' : 'Sai'),
              correctVal: st.answer ? 'Đúng' : 'Sai',
              isMatch
            });
          });

          const ptsRat = PART2_RATIONALS[correctCount] || rational(0n);
          scoreIIRat = ratAdd(scoreIIRat, ptsRat);

          let status = 'unanswered';
          if (correctCount === 4) {
            status = 'full';
          } else if (correctCount >= 1 && correctCount <= 3) {
            status = 'partial';
          } else if (answeredStatements > 0) {
            status = 'wrong';
          } else {
            status = 'unanswered';
          }

          questionResults.push({
            questionVersionId: q.questionVersionId,
            kind: 'II',
            title: q.title,
            status,
            correctCount,
            stDetails,
            pointsFraction: ratToFractionString(ptsRat),
            maxPointsFraction: '1',
            points: ratToNumber(ptsRat),
            maxPoints: 1.00,
            explanation: (q.statements || []).map(s => '<strong>' + s.label + ')</strong> ' + (s.explanation || '')).join('<br/>')
          });
        } else if (q.kind === 'III') {
          const raw = studentState.responses[q.questionVersionId];
          let status = 'unanswered';
          let ptsRat = rational(0n);
          let inputIssues = [];

          if (raw === undefined || raw === null || raw === '') {
            status = 'unanswered';
            ptsRat = rational(0n);
          } else {
            inputIssues = checkShortAnswer(raw);
            if (inputIssues.length > 0) {
              status = 'invalid';
              ptsRat = rational(0n);
            } else if (raw === q.answerKey) {
              status = 'full';
              ptsRat = examMax.pointIII;
            } else {
              status = 'wrong';
              ptsRat = rational(0n);
            }
          }

          scoreIIIRat = ratAdd(scoreIIIRat, ptsRat);
          questionResults.push({
            questionVersionId: q.questionVersionId,
            kind: 'III',
            title: q.title,
            status,
            inputIssues,
            userAnswer: (raw !== undefined && raw !== null && raw !== '') ? raw : 'Chưa điền',
            correctAnswer: q.answerKey,
            pointsFraction: ratToFractionString(ptsRat),
            maxPointsFraction: ratToFractionString(examMax.pointIII),
            points: ratToNumber(ptsRat),
            maxPoints: ratToNumber(examMax.pointIII),
            explanation: q.explanation
          });
        }
      });

      const totalRat = ratAdd(ratAdd(scoreIRat, scoreIIRat), scoreIIIRat);

      return {
        scoreI: ratToNumber(scoreIRat),
        maxI: ratToNumber(examMax.maxI),
        scoreII: ratToNumber(scoreIIRat),
        maxII: ratToNumber(examMax.maxII),
        scoreIII: ratToNumber(scoreIIIRat),
        maxIII: ratToNumber(examMax.maxIII),
        total: ratToNumber(totalRat),
        maxTotal: ratToNumber(examMax.maxTotal),

        scoreIFraction: ratToFractionString(scoreIRat),
        maxIFraction: ratToFractionString(examMax.maxI),
        scoreIIFraction: ratToFractionString(scoreIIRat),
        maxIIFraction: ratToFractionString(examMax.maxII),
        scoreIIIFraction: ratToFractionString(scoreIIIRat),
        maxIIIFraction: ratToFractionString(examMax.maxIII),
        totalFraction: ratToFractionString(totalRat),
        maxTotalFraction: ratToFractionString(examMax.maxTotal),
        pointIIIFraction: ratToFractionString(examMax.pointIII),

        n1: examMax.n1,
        n2: examMax.n2,
        n3: examMax.n3,

        questionResults,
        submittedAt: new Date().toLocaleTimeString('vi-VN')
      };
    }

    function submitExam() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const existing = JSON.parse(raw);
          if (existing && existing.submitted === true) {
            studentState.submitted = true;
            studentState.scoreResult = existing.scoreResult || scoreAttemptLocally();
            if (timerInterval) clearInterval(timerInterval);
            showReportView();
            return;
          }
        }
      } catch (_) {}

      studentState.submitted = true;
      if (timerInterval) clearInterval(timerInterval);
      studentState.scoreResult = scoreAttemptLocally();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(studentState));
      } catch (err) {
        console.warn('Lỗi khi lưu vào localStorage:', err);
      }
      showReportView();
    }

    function showReportView() {
      const examWrap = document.getElementById('examWrapper');
      if (examWrap) examWrap.style.display = 'none';
      const reportWrap = document.getElementById('reportWrapper');
      if (reportWrap) reportWrap.style.display = 'block';
      const btnSub = document.getElementById('btnSubmit');
      if (btnSub) btnSub.style.display = 'none';

      const res = studentState.scoreResult;
      if (!res) return;

      const subTitle = document.getElementById('reportSubtitle');
      if (subTitle) subTitle.textContent = 'Thí sinh: ' + studentState.candidateName + ' · Nộp bài lúc: ' + res.submittedAt;

      const scorePartI = document.getElementById('scorePartI');
      const scorePartII = document.getElementById('scorePartII');
      const scorePartIII = document.getElementById('scorePartIII');
      const scoreTotal = document.getElementById('scoreTotal');
      const detailPartI = document.getElementById('detailPartI');
      const detailPartII = document.getElementById('detailPartII');
      const detailPartIII = document.getElementById('detailPartIII');

      if (scorePartI) scorePartI.textContent = formatRationalScore(res.scoreIFraction) + ' / ' + formatRationalScore(res.maxIFraction);
      if (scorePartII) scorePartII.textContent = formatRationalScore(res.scoreIIFraction) + ' / ' + formatRationalScore(res.maxIIFraction);
      if (scorePartIII) scorePartIII.textContent = formatRationalScore(res.scoreIIIFraction) + ' / ' + formatRationalScore(res.maxIIIFraction);
      if (scoreTotal) scoreTotal.textContent = formatRationalScore(res.totalFraction) + ' / ' + formatRationalScore(res.maxTotalFraction);

      if (detailPartI) detailPartI.textContent = res.n1 + ' câu (0,25 đ/câu)';
      if (detailPartII) detailPartII.textContent = res.n2 + ' câu (tối đa 1 đ/câu)';
      if (detailPartIII) detailPartIII.textContent = res.n3 + ' câu (' + formatRationalScore(res.pointIIIFraction) + ' đ/câu)';

      const pct = res.maxTotal > 0 ? Math.round((res.total / res.maxTotal) * 100) : 0;
      const pctEl = document.getElementById('percentTotal');
      if (pctEl) pctEl.textContent = 'Tỷ lệ đạt: ' + pct + '%';

      const listContainer = document.getElementById('reviewQuestionsList');
      if (!listContainer) return;
      listContainer.innerHTML = '';

      res.questionResults.forEach((qr) => {
        const item = document.createElement('div');
        item.className = 'review-question-item';

        let badgeClass = 'unanswered';
        let badgeText = 'Chưa làm';
        if (qr.status === 'full') { badgeClass = 'full'; badgeText = 'Đúng hoàn toàn'; }
        else if (qr.status === 'partial') { badgeClass = 'partial'; badgeText = 'Đúng một phần'; }
        else if (qr.status === 'wrong') { badgeClass = 'wrong'; badgeText = 'Sai'; }
        else if (qr.status === 'invalid') { badgeClass = 'wrong'; badgeText = 'Không hợp lệ (0 điểm)'; }

        let detailHtml = '';
        if (qr.kind === 'I' || qr.kind === 'III') {
          detailHtml = '<div class="review-detail-grid"><div>Câu trả lời của bạn: <strong>' + qr.userAnswer + '</strong></div><div>Đáp án chuẩn: <strong class="text-success">' + qr.correctAnswer + '</strong></div></div>';
        } else if (qr.kind === 'II') {
          detailHtml = '<div style="margin-top: 0.75rem;"><table style="width: 100%; font-size: 0.875rem; border-collapse: collapse;"><tr style="border-bottom: 1px solid var(--gray-200); text-align: left; color: var(--gray-600);"><th style="padding: 4px;">Ý</th><th style="padding: 4px;">Bạn chọn</th><th style="padding: 4px;">Đáp án chuẩn</th><th style="padding: 4px;">Kết quả</th></tr>' +
            qr.stDetails.map(st => '<tr style="border-bottom: 1px solid var(--gray-100);"><td style="padding: 6px 4px; font-weight: 700;">' + st.label + ')</td><td style="padding: 6px 4px;">' + st.userVal + '</td><td style="padding: 6px 4px; font-weight: 600; color: var(--gray-800);">' + st.correctVal + '</td><td style="padding: 6px 4px;">' + (st.isMatch ? '<span class="text-success">✔ Đúng</span>' : '<span class="text-danger">✘ Sai</span>') + '</td></tr>').join('') +
            '</table></div>';
        }

        item.innerHTML = '<div class="review-item-header"><div><span style="font-weight: 700; color: var(--primary); font-size: 1rem;">' + qr.title + '</span><span class="status-badge ' + badgeClass + '" style="margin-left: 0.5rem;">' + badgeText + '</span></div><div style="font-weight: 700; font-size: 0.9375rem; color: var(--gray-800);">' + formatRationalScore(qr.pointsFraction) + ' / ' + formatRationalScore(qr.maxPointsFraction) + ' điểm</div></div>' + detailHtml + '<div class="explanation-box"><span class="explanation-title">Lời giải chi tiết:</span><div>' + renderMathText(qr.explanation) + '</div></div>';

        listContainer.appendChild(item);
      });

      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    const btnPrint = document.getElementById('btnPrintReport');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    const btnRes = document.getElementById('btnRestart');
    if (btnRes) {
      btnRes.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xóa bài làm hiện tại để làm lại từ đầu?')) {
          localStorage.removeItem(STORAGE_KEY);
          window.location.reload();
        }
      });
    }
\n`;

const updatedHtml = raw.slice(0, startIndex) + newScript + raw.slice(endIndex);
fs.writeFileSync(htmlPath, updatedHtml, 'utf8');
console.log("Successfully updated index.html with JSON-serializable scoreResult! New length:", updatedHtml.length);
