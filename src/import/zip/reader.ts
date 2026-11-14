/**
 * Bounded native ZIP reader with streaming decompression and cancellation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11.
 */

import type { ZipEntry, ZipLimits, Result, WebError } from "./types.ts";
import { computeCrc32 } from "./crc32.ts";

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function makeError(
  code: string,
  path: string,
  message: string,
  recoverable: boolean = false,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      path,
      message,
      recoverable,
    },
  };
}

/**
 * Feature detection for DecompressionStream with 'deflate-raw'.
 */
export function supportsDeflateRaw(): boolean {
  if (typeof DecompressionStream === "undefined") {
    return false;
  }
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

interface ParsedHeaderMeta {
  readonly index: number;
  readonly name: string;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

interface ValidatedEntrySpan extends ParsedHeaderMeta {
  readonly dataOffset: number;
  readonly dataEnd: number;
  readonly spanStart: number;
  readonly spanEnd: number;
}

/**
 * Parses a ZIP archive from memory with strict boundaries, offset/overlap checks,
 * cancellation support, and streaming expansion limits.
 *
 * Inert output only: no filesystem extraction, no external network fetch.
 */
export async function readZip(
  bytes: Uint8Array,
  limits: ZipLimits,
  signal: AbortSignal = new AbortController().signal,
): Promise<Result<readonly ZipEntry[]>> {
  if (signal.aborted) {
    return makeError("IMPORT_CANCELLED", "zip", "ZIP decompression cancelled", true);
  }

  // 1. Validate input size
  if (bytes.byteLength > limits.maxInputBytes) {
    return makeError(
      "ZIP_LIMIT",
      "input",
      `Input size ${bytes.byteLength} exceeds limit of ${limits.maxInputBytes} bytes`,
      false,
    );
  }

  // Minimum valid ZIP must contain at least an empty EOCD record (22 bytes)
  if (bytes.byteLength < 22) {
    return makeError("ZIP_INVALID", "eocd", "ZIP archive is too small", false);
  }

  // 2. Find End of Central Directory (EOCD) record
  // Signature: 0x06054b50 ('PK\x05\x06')
  const maxComment = 65535;
  const minEocdOffset = Math.max(0, bytes.byteLength - 22 - maxComment);
  let eocdOffset = -1;

  for (let i = bytes.byteLength - 22; i >= minEocdOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      const commentLen = readUint16LE(bytes, i + 20);
      if (i + 22 + commentLen === bytes.byteLength) {
        eocdOffset = i;
        break;
      }
      if (eocdOffset === -1 && i + 22 + commentLen <= bytes.byteLength) {
        eocdOffset = i;
      }
    }
  }

  if (eocdOffset === -1) {
    return makeError("ZIP_INVALID", "eocd", "End of central directory record not found", false);
  }

  // Check comment length consistency
  const eocdCommentLen = readUint16LE(bytes, eocdOffset + 20);
  if (eocdOffset + 22 + eocdCommentLen > bytes.byteLength) {
    return makeError("ZIP_INVALID", "eocd", "Truncated central directory comment", false);
  }

  // 3. Reject multi-disk archives
  const diskNumber = readUint16LE(bytes, eocdOffset + 4);
  const cdDiskNumber = readUint16LE(bytes, eocdOffset + 6);
  if (diskNumber !== 0 || cdDiskNumber !== 0) {
    return makeError("ZIP_UNSUPPORTED", "eocd", "Multi-disk ZIP archives are not supported", false);
  }

  // 4. Check for ZIP64 indicator in EOCD or preceding locator
  // ZIP64 Locator signature: 0x07064b50 (20 bytes before EOCD)
  if (eocdOffset >= 20) {
    if (
      bytes[eocdOffset - 20] === 0x50 &&
      bytes[eocdOffset - 19] === 0x4b &&
      bytes[eocdOffset - 18] === 0x06 &&
      bytes[eocdOffset - 17] === 0x07
    ) {
      return makeError("ZIP_UNSUPPORTED", "zip64", "ZIP64 format is not supported", false);
    }
  }

  const diskEntries = readUint16LE(bytes, eocdOffset + 8);
  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const cdSize = readUint32LE(bytes, eocdOffset + 12);
  const cdOffset = readUint32LE(bytes, eocdOffset + 16);

  if (
    diskEntries === 0xffff ||
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    return makeError("ZIP_UNSUPPORTED", "zip64", "ZIP64 format is not supported", false);
  }

  if (diskEntries !== totalEntries) {
    return makeError("ZIP_INVALID", "eocd", "Central directory disk entry count mismatch", false);
  }

  // 5. Check entry count limits
  if (totalEntries > limits.maxEntries) {
    return makeError(
      "ZIP_LIMIT",
      "entries",
      `Entry count ${totalEntries} exceeds limit of ${limits.maxEntries}`,
      false,
    );
  }

  // 6. Check central directory bounds
  if (cdOffset + cdSize > eocdOffset || cdOffset < 0) {
    return makeError(
      "ZIP_INVALID",
      "central_directory",
      "Central directory offset or size out of bounds",
      false,
    );
  }

  // 7. Parse Central Directory File Headers (CDFH)
  const seenNames = new Set<string>();
  const parsedHeaders: ParsedHeaderMeta[] = [];
  let declaredTotalExpanded = 0;
  let pos = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (signal.aborted) {
      return makeError("IMPORT_CANCELLED", "zip", "ZIP decompression cancelled", true);
    }

    if (pos + 46 > cdOffset + cdSize) {
      return makeError(
        "ZIP_INVALID",
        `entries/${i}`,
        "Truncated central directory file header",
        false,
      );
    }

    const sig = readUint32LE(bytes, pos);
    if (sig !== 0x02014b50) {
      return makeError(
        "ZIP_INVALID",
        `entries/${i}`,
        "Invalid central directory file header signature",
        false,
      );
    }

    const flags = readUint16LE(bytes, pos + 8);
    // Bit 0 = traditional encryption, Bit 6 = strong encryption
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      return makeError(
        "ZIP_UNSUPPORTED",
        `entries/${i}`,
        "Encrypted ZIP entries are not supported",
        false,
      );
    }

    const compressionMethod = readUint16LE(bytes, pos + 10);
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      return makeError(
        "ZIP_UNSUPPORTED",
        `entries/${i}`,
        `Unsupported compression method: ${compressionMethod}`,
        false,
      );
    }

    const crc32 = readUint32LE(bytes, pos + 16);
    const compressedSize = readUint32LE(bytes, pos + 20);
    const uncompressedSize = readUint32LE(bytes, pos + 24);
    const nameLen = readUint16LE(bytes, pos + 28);
    const extraLen = readUint16LE(bytes, pos + 30);
    const commentLen = readUint16LE(bytes, pos + 32);
    const diskStart = readUint16LE(bytes, pos + 34);
    const localHeaderOffset = readUint32LE(bytes, pos + 42);

    if (diskStart !== 0) {
      return makeError(
        "ZIP_UNSUPPORTED",
        `entries/${i}`,
        "Multi-disk ZIP entries are not supported",
        false,
      );
    }

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      return makeError("ZIP_UNSUPPORTED", `entries/${i}`, "ZIP64 entry size/offset not supported", false);
    }

    const headerTotalLen = 46 + nameLen + extraLen + commentLen;
    if (pos + headerTotalLen > cdOffset + cdSize) {
      return makeError(
        "ZIP_INVALID",
        `entries/${i}`,
        "Central directory entry overflows directory boundary",
        false,
      );
    }

    // Inspect extra field for ZIP64 (0x0001) or WinZip AES (0x9901)
    let extraPos = pos + 46 + nameLen;
    const extraEnd = extraPos + extraLen;
    while (extraPos + 4 <= extraEnd) {
      const tag = readUint16LE(bytes, extraPos);
      const tagSize = readUint16LE(bytes, extraPos + 2);
      if (tag === 0x0001) {
        return makeError(
          "ZIP_UNSUPPORTED",
          `entries/${i}`,
          "ZIP64 extra field is not supported",
          false,
        );
      }
      if (tag === 0x9901) {
        return makeError(
          "ZIP_UNSUPPORTED",
          `entries/${i}`,
          "Encrypted ZIP entries are not supported",
          false,
        );
      }
      extraPos += 4 + tagSize;
    }

    // File name validation
    if (nameLen === 0) {
      return makeError("ZIP_INVALID", `entries/${i}`, "Empty entry name is not allowed", false);
    }

    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
    let rawName: string;
    try {
      rawName = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      return makeError(
        "ZIP_INVALID",
        `entries/${i}`,
        "Entry name contains invalid UTF-8 encoding",
        false,
      );
    }

    if (rawName.includes("\0")) {
      return makeError("ZIP_INVALID", rawName, "Null byte in entry name is not allowed", false);
    }

    // Reject absolute paths
    if (
      rawName.startsWith("/") ||
      rawName.startsWith("\\") ||
      /^[a-zA-Z]:/.test(rawName)
    ) {
      return makeError("ZIP_INVALID", rawName, "Absolute path in entry name is not allowed", false);
    }

    // Reject path traversal (Zip Slip)
    const segments = rawName.split(/[/\\]/);
    if (segments.some((seg) => seg.trim() === "..")) {
      return makeError(
        "ZIP_INVALID",
        rawName,
        "Directory traversal (..) in entry name is not allowed",
        false,
      );
    }

    // Normalize slashes to '/'
    const name = rawName.replace(/\\/g, "/");

    // Reject duplicate names
    if (seenNames.has(name)) {
      return makeError("ZIP_INVALID", name, `Duplicate entry name: ${name}`, false);
    }
    seenNames.add(name);

    // Stored entries consistency check
    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      return makeError(
        "ZIP_INVALID",
        name,
        "Stored entry compressed size must match uncompressed size",
        false,
      );
    }

    // Check declared uncompressed size limits before allocation
    if (uncompressedSize > limits.maxEntryBytes) {
      return makeError(
        "ZIP_LIMIT",
        name,
        `Entry uncompressed size ${uncompressedSize} exceeds maxEntryBytes (${limits.maxEntryBytes})`,
        false,
      );
    }

    declaredTotalExpanded += uncompressedSize;
    if (declaredTotalExpanded > limits.maxExpandedBytes) {
      return makeError(
        "ZIP_LIMIT",
        name,
        `Total declared uncompressed size exceeds maxExpandedBytes (${limits.maxExpandedBytes})`,
        false,
      );
    }

    parsedHeaders.push({
      index: i,
      name,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    pos += headerTotalLen;
  }

  // 8. Validate Local File Headers and check for overlaps
  const entrySpans: ValidatedEntrySpan[] = [];

  for (const h of parsedHeaders) {
    if (signal.aborted) {
      return makeError("IMPORT_CANCELLED", h.name, "ZIP decompression cancelled", true);
    }

    if (h.localHeaderOffset + 30 > cdOffset || h.localHeaderOffset < 0) {
      return makeError(
        "ZIP_INVALID",
        h.name,
        "Local file header offset exceeds central directory start",
        false,
      );
    }

    const lfhSig = readUint32LE(bytes, h.localHeaderOffset);
    if (lfhSig !== 0x04034b50) {
      return makeError(
        "ZIP_INVALID",
        h.name,
        "Invalid local file header signature",
        false,
      );
    }

    const lfhFlags = readUint16LE(bytes, h.localHeaderOffset + 6);
    if ((lfhFlags & 0x0001) !== 0 || (lfhFlags & 0x0040) !== 0) {
      return makeError(
        "ZIP_UNSUPPORTED",
        h.name,
        "Encrypted local file header is not supported",
        false,
      );
    }

    const lfhMethod = readUint16LE(bytes, h.localHeaderOffset + 8);
    if (lfhMethod !== h.compressionMethod) {
      return makeError(
        "ZIP_INVALID",
        h.name,
        "Compression method mismatch between central directory and local header",
        false,
      );
    }

    const lfhNameLen = readUint16LE(bytes, h.localHeaderOffset + 26);
    const lfhExtraLen = readUint16LE(bytes, h.localHeaderOffset + 28);

    // Inspect LFH extra fields for ZIP64 (0x0001) or WinZip AES (0x9901)
    let lfhExtraPos = h.localHeaderOffset + 30 + lfhNameLen;
    const lfhExtraEnd = lfhExtraPos + lfhExtraLen;
    if (lfhExtraEnd > cdOffset) {
      return makeError(
        "ZIP_INVALID",
        h.name,
        "Local file header overflows central directory boundary",
        false,
      );
    }

    while (lfhExtraPos + 4 <= lfhExtraEnd) {
      const tag = readUint16LE(bytes, lfhExtraPos);
      const tagSize = readUint16LE(bytes, lfhExtraPos + 2);
      if (tag === 0x0001) {
        return makeError(
          "ZIP_UNSUPPORTED",
          h.name,
          "ZIP64 extra field in local file header is not supported",
          false,
        );
      }
      if (tag === 0x9901) {
        return makeError(
          "ZIP_UNSUPPORTED",
          h.name,
          "Encrypted local file header is not supported",
          false,
        );
      }
      lfhExtraPos += 4 + tagSize;
    }

    const dataOffset = h.localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataOffset + h.compressedSize;

    if (dataEnd > cdOffset || dataOffset < 0 || dataEnd < dataOffset) {
      return makeError(
        "ZIP_INVALID",
        h.name,
        "Entry compressed data overflows or overlaps central directory",
        false,
      );
    }

    let spanEnd = dataEnd;
    // If bit 3 is set (data descriptor used), check if data descriptor exists
    if ((lfhFlags & 0x0008) !== 0 && dataEnd + 12 <= cdOffset) {
      const descSig = readUint32LE(bytes, dataEnd);
      if (descSig === 0x08074b50 && dataEnd + 16 <= cdOffset) {
        spanEnd = dataEnd + 16;
      } else {
        spanEnd = dataEnd + 12;
      }
    }

    entrySpans.push({
      ...h,
      dataOffset,
      dataEnd,
      spanStart: h.localHeaderOffset,
      spanEnd,
    });
  }

  // 9. Overlap check across entry spans
  const sortedSpans = [...entrySpans].sort((a, b) => a.spanStart - b.spanStart);
  for (let k = 0; k < sortedSpans.length - 1; k++) {
    const current = sortedSpans[k]!;
    const next = sortedSpans[k + 1]!;
    if (current.spanEnd > next.spanStart) {
      return makeError(
        "ZIP_INVALID",
        next.name,
        `Overlapping zip entries detected: ${current.name} overlaps with ${next.name}`,
        false,
      );
    }
  }

  if (sortedSpans.length > 0) {
    const lastSpan = sortedSpans[sortedSpans.length - 1]!;
    if (lastSpan.spanEnd > cdOffset) {
      return makeError(
        "ZIP_INVALID",
        lastSpan.name,
        "Entry data overlaps central directory start",
        false,
      );
    }
  }

  // 10. Decompression and streaming actual expanded bytes verification
  let totalActualExpandedBytes = 0;
  const results: ZipEntry[] = [];

  for (const entry of entrySpans) {
    if (signal.aborted) {
      return makeError("IMPORT_CANCELLED", entry.name, "ZIP decompression cancelled", true);
    }

    if (entry.compressionMethod === 0) {
      // Stored (no compression)
      const data = bytes.slice(entry.dataOffset, entry.dataEnd);
      if (data.byteLength !== entry.uncompressedSize) {
        return makeError(
          "ZIP_INVALID",
          entry.name,
          `Stored entry size ${data.byteLength} does not match expected size ${entry.uncompressedSize}`,
          false,
        );
      }

      const actualCrc = computeCrc32(data);
      if (actualCrc !== entry.crc32) {
        return makeError(
          "ZIP_INVALID",
          entry.name,
          `CRC32 mismatch for ${entry.name}: expected ${entry.crc32}, got ${actualCrc}`,
          false,
        );
      }

      totalActualExpandedBytes += data.byteLength;
      if (totalActualExpandedBytes > limits.maxExpandedBytes) {
        return makeError(
          "ZIP_LIMIT",
          entry.name,
          `Total expanded bytes exceeded limit of ${limits.maxExpandedBytes}`,
          false,
        );
      }

      results.push({
        name: entry.name,
        bytes: data,
      });
    } else if (entry.compressionMethod === 8) {
      // Deflate
      if (!supportsDeflateRaw()) {
        return makeError(
          "ZIP_UNSUPPORTED",
          entry.name,
          "DecompressionStream deflate-raw is not supported in this runtime",
          false,
        );
      }

      const compressedChunk = bytes.subarray(entry.dataOffset, entry.dataEnd);

      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(compressedChunk);
          controller.close();
        },
      });

      const ds = new DecompressionStream("deflate-raw") as unknown as {
        writable: WritableStream<Uint8Array>;
        readable: ReadableStream<Uint8Array>;
      };
      const decompressedStream = readable.pipeThrough(ds);
      const reader = decompressedStream.getReader();

      let entryActualBytes = 0;
      const chunks: Uint8Array[] = [];

      const abortListener = () => {
        reader.cancel().catch(() => {});
      };
      signal.addEventListener("abort", abortListener, { once: true });

      try {
        while (true) {
          if (signal.aborted) {
            await reader.cancel().catch(() => {});
            return makeError("IMPORT_CANCELLED", entry.name, "ZIP decompression cancelled", true);
          }

          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          if (value) {
            entryActualBytes += value.byteLength;
            totalActualExpandedBytes += value.byteLength;

            // Stream counting guards against zip bombs before resource exhaustion
            if (entryActualBytes > limits.maxEntryBytes) {
              await reader.cancel().catch(() => {});
              return makeError(
                "ZIP_LIMIT",
                entry.name,
                `Entry expanded bytes (${entryActualBytes}) exceeded limit (${limits.maxEntryBytes})`,
                false,
              );
            }

            if (totalActualExpandedBytes > limits.maxExpandedBytes) {
              await reader.cancel().catch(() => {});
              return makeError(
                "ZIP_LIMIT",
                entry.name,
                `Total expanded bytes (${totalActualExpandedBytes}) exceeded limit (${limits.maxExpandedBytes})`,
                false,
              );
            }

            chunks.push(value);
          }
        }
      } catch (err: unknown) {
        if (signal.aborted) {
          return makeError("IMPORT_CANCELLED", entry.name, "ZIP decompression cancelled", true);
        }
        const message = err instanceof Error ? err.message : String(err);
        return makeError(
          "ZIP_INVALID",
          entry.name,
          `Deflate decompression failed: ${message}`,
          false,
        );
      } finally {
        signal.removeEventListener("abort", abortListener);
      }

      if (signal.aborted) {
        return makeError("IMPORT_CANCELLED", entry.name, "ZIP decompression cancelled", true);
      }

      if (entryActualBytes !== entry.uncompressedSize) {
        return makeError(
          "ZIP_INVALID",
          entry.name,
          `Decompressed size (${entryActualBytes}) does not match header uncompressed size (${entry.uncompressedSize})`,
          false,
        );
      }

      const decompressedBytes = new Uint8Array(entryActualBytes);
      let chunkOffset = 0;
      for (const chunk of chunks) {
        decompressedBytes.set(chunk, chunkOffset);
        chunkOffset += chunk.byteLength;
      }

      const actualCrc = computeCrc32(decompressedBytes);
      if (actualCrc !== entry.crc32) {
        return makeError(
          "ZIP_INVALID",
          entry.name,
          `CRC32 mismatch for ${entry.name}: expected ${entry.crc32}, got ${actualCrc}`,
          false,
        );
      }

      results.push({
        name: entry.name,
        bytes: decompressedBytes,
      });
    }
  }

  if (signal.aborted) {
    return makeError("IMPORT_CANCELLED", "zip", "ZIP decompression cancelled", true);
  }

  return {
    ok: true,
    value: results,
  };
}
