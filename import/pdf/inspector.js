/**
 * Structural inspector for PDF binary buffers.
 * Detects signatures, versions, encryption, corruption, scans, text-layers, and multi-column layouts
 * without external dependencies.
 *
 * Conforms to docs/contracts/WEB-contract.md §8 and Shared Product Contract v2.0 §6.
 */
import { PDF_FLAGS } from "./types.js";
/**
 * Inspects a PDF byte buffer and produces a detailed structural assessment.
 */
export function inspectPdf(bytes) {
    const flags = [PDF_FLAGS.MANUAL_REVIEW_REQUIRED];
    const limitations = [];
    // 1. Size sanity check
    if (bytes.length < 5) {
        return {
            signatureValid: false,
            pdfVersion: null,
            isEncrypted: false,
            isCorrupt: true,
            isScanned: false,
            hasTextLayer: false,
            isMultiColumn: false,
            pageCountEstimate: 0,
            flags: [PDF_FLAGS.CORRUPT, PDF_FLAGS.MANUAL_REVIEW_REQUIRED],
            limitations: [
                "Tệp tin rỗng hoặc quá nhỏ để là tệp PDF hợp lệ (< 5 bytes).",
                "Chữ ký PDF không hợp lệ hoặc tệp tin bị hỏng.",
            ],
        };
    }
    // 2. Signature check (%PDF-x.y in the first 1024 bytes)
    const headerLen = Math.min(bytes.length, 1024);
    const headerBytes = bytes.subarray(0, headerLen);
    const headerText = new TextDecoder("latin1").decode(headerBytes);
    const sigMatch = headerText.match(/%PDF-(\d+\.\d+)/);
    const signatureValid = sigMatch !== null;
    const pdfVersion = sigMatch ? (sigMatch[1] ?? null) : null;
    if (!signatureValid) {
        return {
            signatureValid: false,
            pdfVersion: null,
            isEncrypted: false,
            isCorrupt: true,
            isScanned: false,
            hasTextLayer: false,
            isMultiColumn: false,
            pageCountEstimate: 0,
            flags: [PDF_FLAGS.CORRUPT, PDF_FLAGS.MANUAL_REVIEW_REQUIRED],
            limitations: [
                "Chữ ký PDF (%PDF-) không tìm thấy trong tiêu đề tệp tin.",
                "Tệp tin không đúng định dạng PDF chuẩn hoặc đã bị hỏng.",
            ],
        };
    }
    // 3. Decode full buffer with latin1 for structural token scanning
    const fullText = new TextDecoder("latin1").decode(bytes);
    // 4. EOF check (standard PDF must end with %%EOF within last 2048 bytes)
    const tailLen = Math.min(bytes.length, 2048);
    const tailBytes = bytes.subarray(bytes.length - tailLen);
    const tailText = new TextDecoder("latin1").decode(tailBytes);
    const hasEof = tailText.includes("%%EOF");
    let isCorrupt = false;
    if (!hasEof) {
        isCorrupt = true;
        flags.push(PDF_FLAGS.CORRUPT);
        limitations.push("Không tìm thấy dấu kết thúc tài liệu %%EOF chuẩn; tệp tin có thể bị cắt cụt hoặc tải về chưa đầy đủ.");
    }
    // 5. Encryption check (/Encrypt dictionary)
    const isEncrypted = /\/Encrypt\b/.test(fullText);
    if (isEncrypted) {
        flags.push(PDF_FLAGS.ENCRYPTED);
        limitations.push("Tài liệu PDF được mã hóa hoặc cài đặt mật khẩu bảo vệ; không thể tự động xử lý nội dung.");
    }
    // 6. Page count estimation
    let pageCountEstimate = null;
    const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
    if (pageMatches && pageMatches.length > 0) {
        pageCountEstimate = pageMatches.length;
    }
    else {
        // Fallback: check /Pages << /Count n >>
        const countMatch = fullText.match(/\/Count\s+(\d+)/);
        if (countMatch && countMatch[1]) {
            const parsed = parseInt(countMatch[1], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                pageCountEstimate = parsed;
            }
        }
    }
    // 7. Text-layer vs Scan detection
    // Count text operators: BT (begin text), ET (end text), Tj / TJ (show text)
    const btCount = (fullText.match(/\bBT\b/g) || []).length;
    const tjCount = (fullText.match(/\b(Tj|TJ)\b/g) || []).length;
    const hasFont = /\/Font\b/.test(fullText);
    // Check for image XObjects
    const hasImage = /\/Subtype\s*\/Image\b/.test(fullText) || /\/Image\b/.test(fullText);
    const hasTextLayer = (btCount > 0 || tjCount > 0) && hasFont;
    // If document contains images but has zero or practically no text operators, classify as scan
    const isScanned = hasImage && btCount === 0 && tjCount === 0;
    if (hasTextLayer) {
        flags.push(PDF_FLAGS.TEXT_LAYER_DETECTED);
    }
    if (isScanned) {
        flags.push(PDF_FLAGS.OCR_UNAVAILABLE);
        limitations.push("Tài liệu PDF được xác định là bản quét ảnh (scan). Chức năng OCR tự động chưa khả dụng trong bản MVP; vui lòng dùng trình xem trước để nhập dữ liệu câu hỏi thủ công.");
    }
    // 8. Multi-column detection heuristics
    // Look for multiple distinct text positioning coordinates in text matrices (Tm) or displacement (Td)
    // Or explicit indicators of multi-column layout
    let isMultiColumn = false;
    const tmMatches = fullText.match(/([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+Tm/g);
    if (tmMatches && tmMatches.length >= 4) {
        const xCoordinates = [];
        for (const tm of tmMatches) {
            const parts = tm.trim().split(/\s+/);
            if (parts.length >= 6) {
                const x = parseFloat(parts[4] ?? "0");
                if (!Number.isNaN(x) && x > 0) {
                    xCoordinates.push(x);
                }
            }
        }
        if (xCoordinates.length >= 4) {
            const minX = Math.min(...xCoordinates);
            const maxX = Math.max(...xCoordinates);
            const range = maxX - minX;
            // If X coordinates span across two distinct sides (e.g. gap > 150pt)
            if (range > 150) {
                const mid = minX + range / 2;
                const leftCount = xCoordinates.filter((x) => x < mid - 20).length;
                const rightCount = xCoordinates.filter((x) => x > mid + 20).length;
                if (leftCount >= 2 && rightCount >= 2) {
                    isMultiColumn = true;
                }
            }
        }
    }
    // Also check explicit keywords or column markers in text streams
    if (!isMultiColumn && (/\/Columns\b/.test(fullText) || /MultiColumn/i.test(fullText))) {
        isMultiColumn = true;
    }
    if (isMultiColumn) {
        flags.push(PDF_FLAGS.MULTICOLUMN_LAYOUT);
        limitations.push("Phát hiện tài liệu có bố cục đa cột; hệ thống không tự động tái cấu trúc luồng đọc để tránh xáo trộn nội dung và phương án.");
    }
    // General note: no automatic extraction promise
    limitations.push("Hệ thống không tự động trích xuất nội dung hay suy luận đáp án từ tệp PDF (tuân thủ đặc tả D06 Phương án A: Native Preview + Manual IR Fallback).");
    return {
        signatureValid,
        pdfVersion,
        isEncrypted,
        isCorrupt,
        isScanned,
        hasTextLayer,
        isMultiColumn,
        pageCountEstimate,
        flags: Object.freeze(flags),
        limitations: Object.freeze(limitations),
    };
}
