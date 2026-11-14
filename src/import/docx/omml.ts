/**
 * OMML (Office Math Markup Language) to LaTeX converter.
 * Conforms to docs/contracts/WEB-contract.md §8:
 * "OMML→LaTeX chỉ subset có tests đối chiếu; còn lại giữ nguồn và cảnh báo."
 * Preserves OMML source XML when outside the verified subset.
 */

import type { XmlElement } from "./types.ts";
import { getChildren, getAttr } from "./xml-parser.ts";

/**
 * Common mathematical Unicode symbols mapping to standard LaTeX commands.
 */
const UNICODE_MATH_MAP: Readonly<Record<string, string>> = {
  "±": "\\pm",
  "×": "\\times",
  "÷": "\\div",
  "·": "\\cdot",
  "≠": "\\neq",
  "≤": "\\le",
  "≥": "\\ge",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊆": "\\subseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∅": "\\emptyset",
  "∞": "\\infty",
  "→": "\\to",
  "⇒": "\\Rightarrow",
  "⇔": "\\Leftrightarrow",
  "↔": "\\leftrightarrow",
  "⊥": "\\perp",
  "∠": "\\angle",
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "ε": "\\epsilon",
  "θ": "\\theta",
  "λ": "\\lambda",
  "μ": "\\mu",
  "π": "\\pi",
  "ρ": "\\rho",
  "σ": "\\sigma",
  "τ": "\\tau",
  "φ": "\\phi",
  "ω": "\\omega",
  "Δ": "\\Delta",
  "Ω": "\\Omega",
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
};

/**
 * Serializes an XML element back to raw XML string.
 */
export function serializeXml(elem: XmlElement | Element): string {
  const tagName = elem.tagName || elem.localName;
  let attrs = "";

  if ("attributes" in elem && elem.attributes instanceof Map) {
    for (const [k, v] of elem.attributes) {
      attrs += ` ${k}="${v.replace(/"/g, "&quot;")}"`;
    }
  } else if ("attributes" in elem && elem.attributes) {
    const list = elem.attributes as NamedNodeMap;
    for (let i = 0; i < list.length; i++) {
      const attr = list[i];
      if (attr) {
        attrs += ` ${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`;
      }
    }
  }

  const children = getChildren(elem);
  if (children.length === 0) {
    const text = elem.textContent || "";
    if (!text) {
      return `<${tagName}${attrs}/>`;
    }
    return `<${tagName}${attrs}>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</${tagName}>`;
  }

  let inner = "";
  for (const child of children) {
    inner += serializeXml(child);
  }
  return `<${tagName}${attrs}>${inner}</${tagName}>`;
}

function escapeLatexText(text: string): string {
  let result = "";
  for (const ch of text) {
    if (Object.hasOwn(UNICODE_MATH_MAP, ch)) {
      result += ` ${UNICODE_MATH_MAP[ch]} `;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Result of OMML conversion attempt.
 */
export interface OmmlConversionResult {
  readonly converted: string | null;
  readonly rawOmml: string;
}

/**
 * Converts an OMML element (<m:oMath> or <m:oMathPara>) into LaTeX if within verified subset.
 * Returns null converted string and raw XML source if unsupported.
 */
export function convertOmmlToLatex(
  mathElem: XmlElement | Element,
): OmmlConversionResult {
  const rawOmml = serializeXml(mathElem);

  try {
    const converted = convertNode(mathElem);
    if (converted === null || converted.trim().length === 0) {
      return { converted: null, rawOmml };
    }
    return { converted: cleanLatex(converted), rawOmml };
  } catch {
    return { converted: null, rawOmml };
  }
}

function cleanLatex(tex: string): string {
  return tex
    .replace(/\s+/g, " ")
    .replace(/\s*([+=\-])\s*/g, " $1 ")
    .trim();
}

/**
 * Recursively converts verified OMML AST nodes into LaTeX.
 * Returns null if an unverified or unknown structure is encountered.
 */
function convertNode(node: XmlElement | Element): string | null {
  const local = (node.localName || node.tagName).replace(/^m:/, "");

  switch (local) {
    case "oMathPara": {
      // Container of one or more oMath
      const oMathChildren = getChildren(node, "oMath");
      if (oMathChildren.length === 0) {
        return convertChildren(node);
      }
      const parts: string[] = [];
      for (const m of oMathChildren) {
        const res = convertNode(m);
        if (res === null) return null;
        parts.push(res);
      }
      return parts.join(" ");
    }

    case "oMath":
    case "e": // Expression container
    case "num": // Numerator
    case "den": // Denominator
    case "sub": // Subscript
    case "sup": // Superscript
    case "deg": // Degree of radical
      return convertChildren(node);

    case "r": {
      // Run: contains <m:t>
      const tElems = getChildren(node, "t");
      if (tElems.length > 0) {
        let text = "";
        for (const t of tElems) {
          text += t.textContent || "";
        }
        return escapeLatexText(text);
      }
      // If no <m:t>, check child textContent directly
      return escapeLatexText(node.textContent || "");
    }

    case "t":
      return escapeLatexText(node.textContent || "");

    case "f": {
      // Fraction: <m:num> and <m:den>
      const numElem = getChildren(node, "num")[0];
      const denElem = getChildren(node, "den")[0];
      if (!numElem || !denElem) return null;

      const numTex = convertNode(numElem);
      const denTex = convertNode(denElem);
      if (numTex === null || denTex === null) return null;

      return `\\frac{${numTex.trim()}}{${denTex.trim()}}`;
    }

    case "rad": {
      // Radical: <m:deg> (optional) and <m:e>
      const degElem = getChildren(node, "deg")[0];
      const eElem = getChildren(node, "e")[0];
      if (!eElem) return null;

      const eTex = convertNode(eElem);
      if (eTex === null) return null;

      // Check if degree is hidden via <m:radPr><m:degHide m:val="1"/>
      const radPr = getChildren(node, "radPr")[0];
      const degHide = radPr ? getChildren(radPr, "degHide")[0] : null;
      const isDegHidden = degHide && getAttr(degHide, "m:val") === "1";

      const degTex = degElem && !isDegHidden ? convertNode(degElem)?.trim() : "";
      if (degTex && degTex.length > 0) {
        return `\\sqrt[${degTex}]{${eTex.trim()}}`;
      }
      return `\\sqrt{${eTex.trim()}}`;
    }

    case "sSup": {
      // Superscript: base <m:e> and power <m:sup>
      const eElem = getChildren(node, "e")[0];
      const supElem = getChildren(node, "sup")[0];
      if (!eElem || !supElem) return null;

      const eTex = convertNode(eElem);
      const supTex = convertNode(supElem);
      if (eTex === null || supTex === null) return null;

      return `${wrapBase(eTex.trim())}^{${supTex.trim()}}`;
    }

    case "sSub": {
      // Subscript: base <m:e> and index <m:sub>
      const eElem = getChildren(node, "e")[0];
      const subElem = getChildren(node, "sub")[0];
      if (!eElem || !subElem) return null;

      const eTex = convertNode(eElem);
      const subTex = convertNode(subElem);
      if (eTex === null || subTex === null) return null;

      return `${wrapBase(eTex.trim())}_{${subTex.trim()}}`;
    }

    case "sSubSup": {
      // Subscript and Superscript: base <m:e>, <m:sub>, <m:sup>
      const eElem = getChildren(node, "e")[0];
      const subElem = getChildren(node, "sub")[0];
      const supElem = getChildren(node, "sup")[0];
      if (!eElem || !subElem || !supElem) return null;

      const eTex = convertNode(eElem);
      const subTex = convertNode(subElem);
      const supTex = convertNode(supElem);
      if (eTex === null || subTex === null || supTex === null) return null;

      return `${wrapBase(eTex.trim())}_{${subTex.trim()}}^{${supTex.trim()}}`;
    }

    case "d": {
      // Delimiter: <m:dPr> with begChr, endChr, sepChr, and one or more <m:e>
      const dPr = getChildren(node, "dPr")[0];
      const begChrElem = dPr ? getChildren(dPr, "begChr")[0] : null;
      const endChrElem = dPr ? getChildren(dPr, "endChr")[0] : null;

      const begChr = begChrElem ? getAttr(begChrElem, "m:val") ?? "(" : "(";
      const endChr = endChrElem ? getAttr(endChrElem, "m:val") ?? ")" : ")";

      const eChildren = getChildren(node, "e");
      if (eChildren.length === 0) return null;

      const childTexts: string[] = [];
      for (const e of eChildren) {
        const t = convertNode(e);
        if (t === null) return null;
        childTexts.push(t.trim());
      }
      const inner = childTexts.join(", ");

      const left = mapDelimiter(begChr, "left");
      const right = mapDelimiter(endChr, "right");
      return `${left} ${inner} ${right}`;
    }

    case "nary": {
      // N-ary operator: integral, summation, product
      const naryPr = getChildren(node, "naryPr")[0];
      const chrElem = naryPr ? getChildren(naryPr, "chr")[0] : null;
      const chr = chrElem ? getAttr(chrElem, "m:val") ?? "∫" : "∫";

      const subElem = getChildren(node, "sub")[0];
      const supElem = getChildren(node, "sup")[0];
      const eElem = getChildren(node, "e")[0];
      if (!eElem) return null;

      const eTex = convertNode(eElem);
      if (eTex === null) return null;

      let op = "\\int";
      if (chr === "∑") op = "\\sum";
      else if (chr === "∏") op = "\\prod";
      else if (chr === "lim") op = "\\lim";

      let limits = "";
      if (subElem) {
        const subTex = convertNode(subElem);
        if (subTex !== null && subTex.trim().length > 0) {
          limits += `_{${subTex.trim()}}`;
        }
      }
      if (supElem) {
        const supTex = convertNode(supElem);
        if (supTex !== null && supTex.trim().length > 0) {
          limits += `^{${supTex.trim()}}`;
        }
      }

      return `${op}${limits} ${eTex.trim()}`;
    }

    case "acc": {
      // Accent: vector arrow, bar, hat
      const accPr = getChildren(node, "accPr")[0];
      const chrElem = accPr ? getChildren(accPr, "chr")[0] : null;
      const chr = chrElem ? getAttr(chrElem, "m:val") ?? "⃗" : "⃗";

      const eElem = getChildren(node, "e")[0];
      if (!eElem) return null;

      const eTex = convertNode(eElem);
      if (eTex === null) return null;

      if (chr === "⃗" || chr === "→") {
        return `\\vec{${eTex.trim()}}`;
      } else if (chr === "̂" || chr === "^") {
        return `\\hat{${eTex.trim()}}`;
      } else if (chr === "̄" || chr === "¯") {
        return `\\bar{${eTex.trim()}}`;
      }
      return `\\vec{${eTex.trim()}}`;
    }

    case "bar": {
      // Overline or underline
      const barPr = getChildren(node, "barPr")[0];
      const posElem = barPr ? getChildren(barPr, "pos")[0] : null;
      const pos = posElem ? getAttr(posElem, "m:val") ?? "top" : "top";

      const eElem = getChildren(node, "e")[0];
      if (!eElem) return null;

      const eTex = convertNode(eElem);
      if (eTex === null) return null;

      return pos === "bot" ? `\\underline{${eTex.trim()}}` : `\\overline{${eTex.trim()}}`;
    }

    case "m": {
      // Matrix: rows <m:mr> with cells <m:e>
      const rows = getChildren(node, "mr");
      if (rows.length === 0) return null;

      const rowStrings: string[] = [];
      for (const r of rows) {
        const cells = getChildren(r, "e");
        const cellStrings: string[] = [];
        for (const c of cells) {
          const cTex = convertNode(c);
          if (cTex === null) return null;
          cellStrings.push(cTex.trim());
        }
        rowStrings.push(cellStrings.join(" & "));
      }
      return `\\begin{matrix} ${rowStrings.join(" \\\\ ")} \\end{matrix}`;
    }

    case "eqArr": {
      // Equation array
      const eqs = getChildren(node, "e");
      if (eqs.length === 0) return null;

      const eqStrings: string[] = [];
      for (const e of eqs) {
        const eTex = convertNode(e);
        if (eTex === null) return null;
        eqStrings.push(eTex.trim());
      }
      return `\\begin{aligned} ${eqStrings.join(" \\\\ ")} \\end{aligned}`;
    }

    // Ignored property nodes
    case "fPr":
    case "radPr":
    case "dPr":
    case "sSupPr":
    case "sSubPr":
    case "sSubSupPr":
    case "naryPr":
    case "accPr":
    case "barPr":
    case "mPr":
    case "ctrlPr":
    case "rPr":
      return "";

    default:
      // Any unsupported OMML structure returns null to trigger fallback to raw OMML source!
      return null;
  }
}

function convertChildren(elem: XmlElement | Element): string | null {
  const children = getChildren(elem);
  const parts: string[] = [];

  for (const child of children) {
    const res = convertNode(child);
    if (res === null) return null;
    if (res.length > 0) {
      parts.push(res);
    }
  }

  return parts.join(" ");
}

function wrapBase(base: string): string {
  if (base.length <= 1) return base;
  if (base.startsWith("{") && base.endsWith("}")) return base;
  if (base.startsWith("(") && base.endsWith(")")) return base;
  return `{${base}}`;
}

function mapDelimiter(chr: string, side: "left" | "right"): string {
  switch (chr) {
    case "(":
      return side === "left" ? "\\left(" : "\\right(";
    case ")":
      return side === "left" ? "\\left)" : "\\right)";
    case "[":
      return side === "left" ? "\\left[" : "\\right[";
    case "]":
      return side === "left" ? "\\left]" : "\\right]";
    case "{":
      return side === "left" ? "\\left\\{" : "\\right\\{";
    case "}":
      return side === "left" ? "\\left\\}" : "\\right\\}";
    case "|":
      return side === "left" ? "\\left|" : "\\right|";
    case "":
      return side === "left" ? "\\left." : "\\right.";
    default:
      return side === "left" ? "\\left(" : "\\right)";
  }
}
