/**
 * LaTeX (tập con dùng trong đề Cunata) -> MathML gốc của trình duyệt. Trình duyệt tự vẽ phân số dọc, căn, chỉ số trên/dưới
 * giống đề giấy, không cần thư viện hay phông chữ ngoài (Chrome/Edge 109+, Firefox, Safari).
 * Trả về null nếu gặp lệnh chưa hỗ trợ — nơi gọi giữ nguyên nguồn LaTeX kèm nhãn (WEB-contract §4.1).
 * Yêu cầu Trưởng phòng 21/11/2026: "phân số để dọc như đề thi".
 */

const SYMBOLS: Record<string, [string, string]> = {
  // lệnh -> [thẻ MathML, ký tự]
  Rightarrow: ['mo', '⇒'], Leftarrow: ['mo', '⇐'], Leftrightarrow: ['mo', '⇔'], rightarrow: ['mo', '→'], leftarrow: ['mo', '←'],
  to: ['mo', '→'], leftrightarrow: ['mo', '↔'], cdot: ['mo', '·'], times: ['mo', '×'], div: ['mo', '÷'], pm: ['mo', '±'], mp: ['mo', '∓'],
  neq: ['mo', '≠'], ne: ['mo', '≠'], le: ['mo', '≤'], leq: ['mo', '≤'], ge: ['mo', '≥'], geq: ['mo', '≥'], approx: ['mo', '≈'],
  sim: ['mo', '∼'], equiv: ['mo', '≡'], in: ['mo', '∈'], notin: ['mo', '∉'], subset: ['mo', '⊂'], cup: ['mo', '∪'], cap: ['mo', '∩'],
  infty: ['mi', '∞'], circ: ['mo', '∘'], degree: ['mo', '°'], parallel: ['mo', '∥'], perp: ['mo', '⊥'], angle: ['mo', '∠'],
  int: ['mo', '∫'], sum: ['mo', '∑'], prod: ['mo', '∏'], partial: ['mi', '∂'], nabla: ['mi', '∇'], ldots: ['mo', '…'], dots: ['mo', '…'],
  cdots: ['mo', '⋯'], quad: ['mspace', ''], qquad: ['mspace', ''], ',': ['mspace', ''], ';': ['mspace', ''], '!': ['mspace', ''],
  '%': ['mo', '%'], '{': ['mo', '{'], '}': ['mo', '}'], '\\': ['mspace', ''], left: ['mrow', ''], right: ['mrow', ''],
  alpha: ['mi', 'α'], beta: ['mi', 'β'], gamma: ['mi', 'γ'], delta: ['mi', 'δ'], epsilon: ['mi', 'ε'], varepsilon: ['mi', 'ε'],
  zeta: ['mi', 'ζ'], eta: ['mi', 'η'], theta: ['mi', 'θ'], vartheta: ['mi', 'ϑ'], iota: ['mi', 'ι'], kappa: ['mi', 'κ'],
  lambda: ['mi', 'λ'], mu: ['mi', 'μ'], nu: ['mi', 'ν'], xi: ['mi', 'ξ'], pi: ['mi', 'π'], rho: ['mi', 'ρ'], sigma: ['mi', 'σ'],
  tau: ['mi', 'τ'], upsilon: ['mi', 'υ'], phi: ['mi', 'φ'], varphi: ['mi', 'φ'], chi: ['mi', 'χ'], psi: ['mi', 'ψ'], omega: ['mi', 'ω'],
  Gamma: ['mi', 'Γ'], Delta: ['mi', 'Δ'], Theta: ['mi', 'Θ'], Lambda: ['mi', 'Λ'], Xi: ['mi', 'Ξ'], Pi: ['mi', 'Π'], Sigma: ['mi', 'Σ'],
  Phi: ['mi', 'Φ'], Psi: ['mi', 'Ψ'], Omega: ['mi', 'Ω'],
};
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lg', 'exp', 'min', 'max', 'lim']);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class Unsupported extends Error {}

class Parser {
  private i = 0;
  private readonly s: string;
  constructor(s: string) { this.s = s; }

  /** Đọc tới hết chuỗi hoặc tới dấu `}` đóng nhóm. */
  parseList(): string[] {
    const out: string[] = [];
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '}') break;
      if (c === '^' || c === '_') {
        // chỉ số đứng đầu (ví dụ ^{235}_{92}U): gắn vào phần tử rỗng
        const base = out.length ? out.pop()! : '<mrow></mrow>';
        out.push(this.scripts(base));
        continue;
      }
      const atom = this.atom();
      if (atom !== null) out.push(atom);
    }
    return out;
  }

  private scripts(base: string): string {
    let sub: string | null = null; let sup: string | null = null;
    while (this.i < this.s.length && (this.s[this.i] === '^' || this.s[this.i] === '_')) {
      const k = this.s[this.i++];
      const arg = this.arg();
      if (k === '^') sup = arg; else sub = arg;
    }
    if (sub !== null && sup !== null) return `<msubsup>${base}${sub}${sup}</msubsup>`;
    if (sup !== null) return `<msup>${base}${sup}</msup>`;
    return `<msub>${base}${sub}</msub>`;
  }

  /** Một đối số: nhóm {…} hoặc một ký hiệu đơn. */
  private arg(): string {
    this.skipSpaces();
    if (this.s[this.i] === '{') {
      this.i++;
      const inner = this.parseList();
      if (this.s[this.i] !== '}') throw new Unsupported('thiếu }');
      this.i++;
      return `<mrow>${inner.join('')}</mrow>`;
    }
    const a = this.atom();
    if (a === null) throw new Unsupported('thiếu đối số');
    return a;
  }

  private rawGroup(): string {
    this.skipSpaces();
    if (this.s[this.i] !== '{') throw new Unsupported('thiếu {');
    let depth = 0; const start = ++this.i;
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0) return this.s.slice(start, this.i - 1); depth--; }
    }
    throw new Unsupported('thiếu }');
  }

  private skipSpaces(): void { while (this.s[this.i] === ' ') this.i++; }

  private atom(): string | null {
    const s = this.s; const c = s[this.i] ?? "";
    if (c === ' ') { this.i++; return null; }
    if (c === '{') return this.arg();
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(this.i));
      if (!m) throw new Unsupported('\\');
      const name = m[1] ?? ""; this.i += m[0].length;
      switch (name) {
        case 'frac': case 'dfrac': case 'tfrac': { const a = this.arg(); const b = this.arg(); return `<mfrac>${a}${b}</mfrac>`; }
        case 'sqrt': {
          this.skipSpaces();
          if (s[this.i] === '[') { const end = s.indexOf(']', this.i); if (end < 0) throw new Unsupported('['); const idx = new Parser(s.slice(this.i + 1, end)).parseAll(); this.i = end + 1; return `<mroot>${this.arg()}<mrow>${idx}</mrow></mroot>`; }
          return `<msqrt>${this.arg()}</msqrt>`;
        }
        case 'vec': case 'overrightarrow': return `<mover accent="true">${this.arg()}<mo stretchy="true">→</mo></mover>`;
        case 'overline': case 'bar': return `<mover accent="true">${this.arg()}<mo>¯</mo></mover>`;
        case 'hat': return `<mover accent="true">${this.arg()}<mo>^</mo></mover>`;
        case 'text': case 'mathrm': case 'textrm': case 'operatorname': return `<mtext>${esc(this.rawGroup())}</mtext>`;
        case 'mathbf': case 'textbf': return `<mtext style="font-weight:700">${esc(this.rawGroup())}</mtext>`;
        default: {
          if (FUNCS.has(name)) return `<mi>${name}</mi>`;
          const sym = SYMBOLS[name];
          if (!sym) throw new Unsupported(name);
          if (sym[0] === 'mspace') return name === '!' ? '' : `<mspace width="${name === 'qquad' ? '2em' : name === 'quad' ? '1em' : '0.2em'}"/>`;
          if (sym[0] === 'mrow') return '';
          return `<${sym[0]}>${esc(sym[1])}</${sym[0]}>`;
        }
      }
    }
    // số (kể cả thập phân kiểu Việt Nam 0,5)
    const num = /^[0-9]+(?:[.,][0-9]+)?/.exec(s.slice(this.i));
    if (num) { this.i += num[0].length; return `<mn>${num[0]}</mn>`; }
    this.i++;
    if (/[A-Za-z]/.test(c)) {
      let j = this.i; while (j < s.length && /[A-Za-z]/.test(s[j] ?? '')) j++;
      const run = c + s.slice(this.i, j);
      if (run.length > 1 && UNITS.has(run)) { this.i = j; return `<mi>${run}</mi>`; }
      return `<mi>${c}</mi>`;
    }
    if (/[À-ỹ]/.test(c)) {
      // chữ tiếng Việt trong công thức: gom cả cụm thành chữ thường
      let j = this.i; while (j < s.length && /[À-ỹA-Za-z]/.test(s[j] ?? '')) j++;
      const word = c + s.slice(this.i, j); this.i = j; return `<mtext>${esc(word)}</mtext>`;
    }
    if (c === '(' || c === ')' || c === '[' || c === ']' || c === '|') return `<mo stretchy="false">${esc(c)}</mo>`;
    if (c === "'") return '<mo>′</mo>';
    if (c === '-') return '<mo>−</mo>';
    return `<mo>${esc(c)}</mo>`;
  }

  parseAll(): string {
    return this.parseAtoms().join('');
  }

  parseAtoms(): string[] {
    const out = this.parseList();
    if (this.i < this.s.length) throw new Unsupported('thừa }');
    return out;
  }
}

/** LaTeX -> chuỗi `<math>` (đã thoát HTML), hoặc null nếu có lệnh chưa hỗ trợ. */
/** Ký hiệu đơn vị SI hay gặp trong đề: công thức chỉ gồm các đơn vị này thì in đứng (N/s, J/(kg·K), cm/s) như đề giấy. */
const UNITS = new Set(['N', 's', 'J', 'kg', 'g', 'K', 'm', 'cm', 'mm', 'km', 'dm', 'W', 'kW', 'V', 'kV', 'mV', 'A', 'mA', 'Hz', 'kHz', 'MHz', 'Pa', 'kPa',
  'atm', 'C', 'T', 'Wb', 'F', 'H', 'mol', 'L', 'l', 'h', 'min', 'eV', 'keV', 'MeV', 'u', 'rad', 'lx', 'cd', 'Bq', 'Ci', 'kWh', 'cal', 'kcal', 'Ω', 'μm', 'nm', 'ms']);
function isUnitOnly(latex: string): boolean {
  if (/[=<>+]|\\(?!frac|cdot|text|mathrm|,|;| )/.test(latex)) return false;
  const stripped = latex.replace(/\\(frac|cdot|text|mathrm)/g, ' ').replace(/\^\{?-?[0-9]+\}?/g, ' ');
  if (/[0-9]/.test(stripped)) return false;
  const runs = stripped.match(/[A-Za-zΩμ]+/g) || [];
  return runs.length > 0 && runs.every((r) => UNITS.has(r));
}

export function latexToMathML(latex: string, display = false): string | null {
  try {
    const unit = isUnitOnly(latex);
    // MathML không tự xuống dòng: tách công thức dài sau mỗi dấu quan hệ ở mức ngoài cùng (=, ⇒, ≈…) thành nhiều <math>
    // để trình duyệt xuống dòng được — nếu không, lời giải dài làm trang rộng hơn màn điện thoại (lỗi đo thật 21/11/2026).
    const chunks: string[][] = [[]];
    for (const atom of new Parser(latex.trim()).parseAtoms()) {
      chunks[chunks.length - 1]!.push(atom);
      if (/^<mo>(=|⇒|⇔|≈|≠|≤|≥|→|&lt;|&gt;)<\/mo>$/.test(atom)) chunks.push([]);
    }
    const parts = chunks.filter((c) => c.length).map((c) => {
      let body = c.join('');
      if (unit) body = body.replace(/<mi>/g, '<mi mathvariant="normal">');
      // displaystyle: phân số trong dòng to bằng chữ thường (đề giấy), không bị thu nhỏ kiểu chỉ số
      return `<math${display ? ' display="block"' : ''} displaystyle="true" class="math-ml"><mrow>${body}</mrow></math>`;
    });
    return `<span class="math-ml-group" title="${esc(latex)}">${parts.join(' ')}</span>`;
  } catch (e) {
    if (e instanceof Unsupported) return null;
    throw e;
  }
}
