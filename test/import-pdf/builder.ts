/**
 * Synthetic PDF builder for unit testing PDF import, classification, and limits.
 * Pure TypeScript, zero external dependencies.
 */

export interface SyntheticTextOptions {
  readonly version?: string;
  readonly text?: string;
  readonly pageCount?: number;
}

export interface SyntheticScanOptions {
  readonly version?: string;
  readonly pageCount?: number;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
}

export interface SyntheticMultiColumnOptions {
  readonly version?: string;
  readonly leftColumnText?: string;
  readonly rightColumnText?: string;
}

export interface SyntheticEncryptedOptions {
  readonly version?: string;
}

/**
 * Helper to construct a File object from Uint8Array bytes avoiding TypeScript BlobPart mismatch.
 */
export function toFile(bytes: Uint8Array, filename: string, mimeType = "application/pdf"): File {
  return new File([bytes as unknown as BlobPart], filename, { type: mimeType });
}

/**
 * Builds a synthetic valid PDF with a native text layer (BT, ET, Tj, /Font).
 */
export function buildSyntheticPdfText(options: SyntheticTextOptions = {}): Uint8Array {
  const version = options.version || "1.4";
  const text = options.text || "De thi THPT Mon Toan 2026 - Cau 1";
  const pageCount = options.pageCount || 1;

  let body = `%PDF-${version}\n`;
  body += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  const kidRefs: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const pageObjNum = 3 + p * 3;
    kidRefs.push(`${pageObjNum} 0 R`);
  }

  body += `2 0 obj\n<< /Type /Pages /Kids [${kidRefs.join(" ")}] /Count ${pageCount} >>\nendobj\n`;

  for (let p = 0; p < pageCount; p++) {
    const pageObjNum = 3 + p * 3;
    const fontObjNum = 4 + p * 3;
    const contentObjNum = 5 + p * 3;

    const streamContent = `BT\n/F1 12 Tf\n72 720 Td\n(${text} - Page ${p + 1}) Tj\nET\n`;
    const streamLen = streamContent.length;

    body += `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`;
    body += `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
    body += `${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`;
  }

  body += `xref\n0 ${3 + pageCount * 3}\n0000000000 65535 f\n`;
  body += `trailer\n<< /Size ${3 + pageCount * 3} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

/**
 * Builds a synthetic scanned PDF containing image XObjects without any text operators.
 */
export function buildSyntheticPdfScan(options: SyntheticScanOptions = {}): Uint8Array {
  const version = options.version || "1.4";
  const pageCount = options.pageCount || 1;
  const width = options.imageWidth || 400;
  const height = options.imageHeight || 600;

  let body = `%PDF-${version}\n`;
  body += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  const kidRefs: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const pageObjNum = 3 + p * 3;
    kidRefs.push(`${pageObjNum} 0 R`);
  }

  body += `2 0 obj\n<< /Type /Pages /Kids [${kidRefs.join(" ")}] /Count ${pageCount} >>\nendobj\n`;

  for (let p = 0; p < pageCount; p++) {
    const pageObjNum = 3 + p * 3;
    const imgObjNum = 4 + p * 3;
    const contentObjNum = 5 + p * 3;

    // Stream draws the image using Do operator, without BT/ET/Tj
    const streamContent = `q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n`;
    const streamLen = streamContent.length;

    body += `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${imgObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`;
    // Pure scanned image XObject
    body += `${imgObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 16 >>\nstream\n0123456789abcdef\nendstream\nendobj\n`;
    body += `${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`;
  }

  body += `xref\n0 ${3 + pageCount * 3}\n0000000000 65535 f\n`;
  body += `trailer\n<< /Size ${3 + pageCount * 3} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

/**
 * Builds a synthetic PDF with two-column text layout using text matrices (Tm) across distinct X coordinates.
 */
export function buildSyntheticPdfMultiColumn(options: SyntheticMultiColumnOptions = {}): Uint8Array {
  const version = options.version || "1.4";
  const leftText = options.leftColumnText || "Cau 1. Phan I Cot Ben Trai";
  const rightText = options.rightColumnText || "Cau 2. Phan I Cot Ben Phai";

  let body = `%PDF-${version}\n`;
  body += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  body += `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;

  // Left column placed at X=50, right column placed at X=340 (gutter > 150pt)
  const streamContent = `BT
/F1 10 Tf
1 0 0 1 50 720 Tm
(${leftText} line 1) Tj
1 0 0 1 50 700 Tm
(${leftText} line 2) Tj
1 0 0 1 340 720 Tm
(${rightText} line 1) Tj
1 0 0 1 340 700 Tm
(${rightText} line 2) Tj
ET
`;
  const streamLen = streamContent.length;

  body += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
  body += `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  body += `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}endstream\nendobj\n`;
  body += `xref\n0 6\n0000000000 65535 f\n`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

/**
 * Builds a synthetic password-protected/encrypted PDF with an /Encrypt trailer dictionary.
 */
export function buildSyntheticPdfEncrypted(options: SyntheticEncryptedOptions = {}): Uint8Array {
  const version = options.version || "1.7";

  let body = `%PDF-${version}\n`;
  body += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  body += `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  body += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  // Encryption dictionary object
  body += `4 0 obj\n<< /Filter /Standard /V 2 /R 3 /O (hash_owner) /U (hash_user) /P -4 >>\nendobj\n`;
  body += `xref\n0 5\n0000000000 65535 f\n`;
  body += `trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

/**
 * Builds corrupt PDF buffers of various failure modes.
 */
export function buildSyntheticPdfCorrupt(
  reason: "no_signature" | "truncated" | "missing_eof" | "empty_bytes" | "garbage_bytes"
): Uint8Array {
  switch (reason) {
    case "empty_bytes":
      return new Uint8Array(0);

    case "no_signature":
      return new TextEncoder().encode("NOT_A_PDF_DOCUMENT_Just_plain_text\nSome line\n%%EOF");

    case "truncated":
      // Valid header, but cuts off abruptly at byte 20
      return new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Cat");

    case "missing_eof":
      return new TextEncoder().encode(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Size 3 /Root 1 0 R >>\n"
      );

    case "garbage_bytes": {
      const b = new Uint8Array(200);
      for (let i = 0; i < b.length; i++) {
        b[i] = (i * 37) % 256;
      }
      return b;
    }
  }
}

/**
 * Builds an oversized synthetic PDF exceeding a given byte size limit (e.g. 10 MiB + 1 KiB).
 */
export function buildSyntheticPdfOversized(sizeBytes = 10 * 1024 * 1024 + 1024): Uint8Array {
  const header = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const trailer = new TextEncoder().encode("trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n100\n%%EOF\n");

  const total = new Uint8Array(sizeBytes);
  total.set(header, 0);

  // Pad the middle with comment lines "% padding..."
  const padByte = 0x25; // '%'
  for (let i = header.length; i < sizeBytes - trailer.length; i++) {
    total[i] = i % 80 === 79 ? 0x0a : padByte;
  }

  total.set(trailer, sizeBytes - trailer.length);
  return total;
}
