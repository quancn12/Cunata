import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readZip,
  computeCrc32,
  PROPOSED_ZIP_LIMITS,
} from "../../src/import/zip/index.ts";
import type { ZipLimits } from "../../src/import/zip/types.ts";
import {
  buildSyntheticZip,
  deflateRaw,
} from "./builder.ts";

const DEFAULT_TEST_LIMITS: ZipLimits = {
  maxInputBytes: 10 * 1024 * 1024,
  maxEntries: 1000,
  maxExpandedBytes: 20 * 1024 * 1024,
  maxEntryBytes: 5 * 1024 * 1024,
};

describe("CRC-32 computation", () => {
  it("calculates correct CRC-32 for empty byte array", () => {
    assert.equal(computeCrc32(new Uint8Array(0)), 0);
  });

  it("calculates independent known golden CRC-32 values", () => {
    // "123456789" -> 0xCBF43926 (3421780262)
    const test1 = new TextEncoder().encode("123456789");
    assert.equal(computeCrc32(test1), 3421780262);

    // "Hello, World!" -> 0xEC4AE370 (3964322768)
    const test2 = new TextEncoder().encode("Hello, World!");
    assert.equal(computeCrc32(test2), 3964322768);
  });
});

describe("Valid ZIP Archives (Stored and Deflated)", () => {
  it("reads single stored entry correctly", async () => {
    const content = new TextEncoder().encode("Hello, Stored file!");
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "hello.txt", data: content, method: 0 }],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 1);
    assert.equal(res.value[0]!.name, "hello.txt");
    assert.deepEqual(res.value[0]!.bytes, content);
  });

  it("reads single deflated entry correctly", async () => {
    const text = "Repeated text for deflation ".repeat(30);
    const content = new TextEncoder().encode(text);
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "deflated.txt", data: content, method: 8 }],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 1);
    assert.equal(res.value[0]!.name, "deflated.txt");
    assert.deepEqual(res.value[0]!.bytes, content);
  });

  it("reads mixed stored and deflated entries in same archive", async () => {
    const docXml = new TextEncoder().encode("<w:document><w:body>Sample</w:body></w:document>");
    const relsXml = new TextEncoder().encode("<Relationships>Test</Relationships>");
    const media = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "word/document.xml", data: docXml, method: 8 },
        { name: "word/_rels/document.xml.rels", data: relsXml, method: 0 },
        { name: "word/media/image1.png", data: media, method: 0 },
      ],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 3);
    assert.equal(res.value[0]!.name, "word/document.xml");
    assert.deepEqual(res.value[0]!.bytes, docXml);
    assert.equal(res.value[1]!.name, "word/_rels/document.xml.rels");
    assert.deepEqual(res.value[1]!.bytes, relsXml);
    assert.equal(res.value[2]!.name, "word/media/image1.png");
    assert.deepEqual(res.value[2]!.bytes, media);
  });

  it("handles empty (0-byte) stored and deflated files", async () => {
    const emptyBytes = new Uint8Array(0);
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "empty_stored.txt", data: emptyBytes, method: 0 },
        { name: "empty_deflated.txt", data: emptyBytes, method: 8 },
      ],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 2);
    assert.equal(res.value[0]!.name, "empty_stored.txt");
    assert.equal(res.value[0]!.bytes.byteLength, 0);
    assert.equal(res.value[1]!.name, "empty_deflated.txt");
    assert.equal(res.value[1]!.bytes.byteLength, 0);
  });

  it("handles Vietnamese Unicode characters in entry names", async () => {
    const content = new TextEncoder().encode("Đề thi tốt nghiệp THPT Quốc gia môn Toán");
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "đề_thi/toán_học_2024.docx", data: content, method: 8 },
        { name: "lời_giải/chi_tiết.txt", data: content, method: 0 },
      ],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 2);
    assert.equal(res.value[0]!.name, "đề_thi/toán_học_2024.docx");
    assert.deepEqual(res.value[0]!.bytes, content);
    assert.equal(res.value[1]!.name, "lời_giải/chi_tiết.txt");
    assert.deepEqual(res.value[1]!.bytes, content);
  });

  it("normalizes backward slashes in entry names to forward slashes", async () => {
    const content = new TextEncoder().encode("Normalized path test");
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "word\\media\\image.png", data: content, method: 0 }],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value[0]!.name, "word/media/image.png");
  });

  it("allows archive with ZIP file comment", async () => {
    const content = new TextEncoder().encode("Archive with comment");
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: content, method: 0 }],
      comment: "This is a legitimate comment",
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.length, 1);
    assert.deepEqual(res.value[0]!.bytes, content);
  });
});

describe("Corrupt and Truncated Archives (ZIP_INVALID)", () => {
  it("rejects archives smaller than 22 bytes", async () => {
    const res = await readZip(new Uint8Array(10), DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "eocd");
  });

  it("rejects arbitrary garbage bytes without EOCD signature", async () => {
    const garbage = new Uint8Array(200);
    garbage.fill(0xaa);
    const res = await readZip(garbage, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "eocd");
  });

  it("rejects truncated archive cut off before Central Directory", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0 }],
    });
    // Truncate halfway
    const truncated = zipBytes.subarray(0, zipBytes.byteLength - 30);
    const res = await readZip(truncated, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects archive when EOCD comment length extends past buffer end", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0 }],
      comment: "abc",
    });
    // Tamper comment length in EOCD (offset byteLength - 2 - 3)
    const tampered = new Uint8Array(zipBytes);
    const eocdPos = tampered.byteLength - 22 - 3;
    tampered[eocdPos + 20] = 0xff; // commentLen = 255
    const res = await readZip(tampered, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects inconsistent entry counts in EOCD", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0 }],
      diskEntries: 1,
      totalEntries: 2, // mismatch!
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "eocd");
  });

  it("rejects central directory offset out of bounds", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0 }],
      cdOffsetOverride: 999999,
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "central_directory");
  });

  it("rejects corrupt CDFH signature", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0, corruptCdfhSig: true }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "entries/0");
  });

  it("rejects corrupt LFH signature", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0, corruptLfhSig: true }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "test.txt");
  });

  it("rejects compression method mismatch between CDFH and LFH", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0, lfhMethodMismatch: 8 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "test.txt");
  });

  it("rejects stored entry where compressed size != uncompressed size", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0, compressedSize: 10, uncompressedSize: 5 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects CRC-32 mismatch on stored entry", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new TextEncoder().encode("Hello"), method: 0, crc: 0x12345678 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "test.txt");
    assert.match(res.error.message, /CRC32 mismatch/);
  });

  it("rejects CRC-32 mismatch on deflated entry", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "deflated.txt", data: new TextEncoder().encode("Some test string"), method: 8, crc: 0x12345678 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "deflated.txt");
    assert.match(res.error.message, /CRC32 mismatch/);
  });

  it("rejects corrupt deflate bitstream", async () => {
    const corruptPayload = new Uint8Array([0x99, 0x88, 0x77, 0x66, 0x55]);
    const zipBytes = await buildSyntheticZip({
      entries: [{
        name: "corrupt.txt",
        data: new Uint8Array(20),
        method: 8,
        compressedData: corruptPayload,
        compressedSize: corruptPayload.byteLength,
        uncompressedSize: 20,
      }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "corrupt.txt");
    assert.match(res.error.message, /Deflate decompression failed/);
  });

  it("rejects decompressed size mismatch", async () => {
    // Declares uncompressedSize 100, but actually decompresses to 10
    const actualData = new TextEncoder().encode("0123456789");
    const comp = await deflateRaw(actualData);
    const zipBytes = await buildSyntheticZip({
      entries: [{
        name: "mismatch.txt",
        data: actualData,
        method: 8,
        compressedData: comp,
        compressedSize: comp.byteLength,
        uncompressedSize: 100, // mismatch!
      }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.equal(res.error.path, "mismatch.txt");
    assert.match(res.error.message, /does not match header uncompressed size/);
  });
});

describe("Path Traversal and Malicious Entry Names (ZIP_INVALID)", () => {
  it("rejects entry with relative directory traversal (..)", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "../traversal.txt", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Directory traversal/);
  });

  it("rejects entry with nested directory traversal", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "word/../../secret.txt", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects entry with Windows backslash directory traversal (..\\)", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "..\\secret.txt", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects absolute path with leading slash", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "/etc/passwd", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Absolute path/);
  });

  it("rejects absolute path with Windows drive letter", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "C:/Windows/system.ini", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Absolute path/);
  });

  it("rejects null byte in entry name", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "document.xml\0evil", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Null byte/);
  });

  it("rejects empty entry name", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "", data: new Uint8Array(5), method: 0 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });

  it("rejects duplicate entry names in archive", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "word/document.xml", data: new TextEncoder().encode("Doc 1"), method: 0 },
        { name: "word/document.xml", data: new TextEncoder().encode("Doc 2"), method: 0 },
      ],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Duplicate entry name/);
  });

  it("rejects duplicate entry names across slash variants", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "word/document.xml", data: new TextEncoder().encode("Doc 1"), method: 0 },
        { name: "word\\document.xml", data: new TextEncoder().encode("Doc 2"), method: 0 },
      ],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Duplicate entry name/);
  });
});

describe("Offset and Overlap Validation (ZIP_INVALID)", () => {
  it("rejects overlapping zip entries", async () => {
    // Entry 1 and Entry 2 both point to offset 0 (ZIP quine / overlap attack)
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "file1.txt", data: new Uint8Array(50), method: 0 },
        { name: "file2.txt", data: new Uint8Array(50), method: 0, lfhOffset: 0 },
      ],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
    assert.match(res.error.message, /Overlapping zip entries/);
  });

  it("rejects entry data overflowing into central directory", async () => {
    // Override compressedSize to claim more bytes than exist before CD
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "overflow.txt", data: new Uint8Array(20), method: 0, compressedSize: 9999 },
      ],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_INVALID");
  });
});

describe("Unsupported Archives (ZIP_UNSUPPORTED)", () => {
  it("rejects encrypted archive with traditional encryption bit 0", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "encrypted.txt", data: new Uint8Array(10), method: 0, flags: 0x0001 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.match(res.error.message, /Encrypted/);
  });

  it("rejects encrypted archive with strong encryption bit 6", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "encrypted.txt", data: new Uint8Array(10), method: 0, flags: 0x0040 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.match(res.error.message, /Encrypted/);
  });

  it("rejects WinZip AES encryption extra field (0x9901)", async () => {
    // Tag 0x9901, data size 7
    const aesExtra = new Uint8Array([0x01, 0x99, 0x07, 0x00, 0x02, 0x00, 0x41, 0x45, 0x03, 0x08, 0x00]);
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "aes.txt", data: new Uint8Array(10), method: 0, extraField: aesExtra }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
  });

  it("rejects ZIP64 archive with locator signature before EOCD", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new Uint8Array(10), method: 0 }],
      zip64Locator: true,
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.equal(res.error.path, "zip64");
    assert.match(res.error.message, /ZIP64/);
  });

  it("rejects ZIP64 archive with 0xFFFF / 0xFFFFFFFF indicator fields in EOCD", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new Uint8Array(10), method: 0 }],
      zip64EocdValues: true,
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.equal(res.error.path, "zip64");
  });

  it("rejects ZIP64 extra field (0x0001) in central directory header", async () => {
    // Tag 0x0001, data size 8
    const zip64Extra = new Uint8Array([0x01, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "zip64.txt", data: new Uint8Array(10), method: 0, extraField: zip64Extra }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.match(res.error.message, /ZIP64/);
  });

  it("rejects unsupported compression methods (e.g. BZIP2 method 12)", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "bzip.txt", data: new Uint8Array(10), method: 12 }],
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.match(res.error.message, /Unsupported compression method/);
  });

  it("rejects multi-disk archives", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new Uint8Array(10), method: 0 }],
      diskNumber: 1, // disk 1
    });
    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_UNSUPPORTED");
    assert.match(res.error.message, /Multi-disk/);
  });
});

describe("Resource Limits and Streaming Zip Bomb Protection (ZIP_LIMIT)", () => {
  it("enforces maxInputBytes boundary", async () => {
    const content = new Uint8Array(100);
    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: content, method: 0 }],
    });

    const tightLimits: ZipLimits = {
      maxInputBytes: zipBytes.byteLength - 1, // 1 byte less than archive
      maxEntries: 10,
      maxExpandedBytes: 1000,
      maxEntryBytes: 1000,
    };

    const res = await readZip(zipBytes, tightLimits);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_LIMIT");
    assert.equal(res.error.path, "input");
  });

  it("enforces maxEntries boundary", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "f1.txt", data: new Uint8Array(1), method: 0 },
        { name: "f2.txt", data: new Uint8Array(1), method: 0 },
        { name: "f3.txt", data: new Uint8Array(1), method: 0 },
      ],
    });

    const limits: ZipLimits = {
      maxInputBytes: 10000,
      maxEntries: 2, // only allow 2 entries
      maxExpandedBytes: 10000,
      maxEntryBytes: 10000,
    };

    const res = await readZip(zipBytes, limits);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_LIMIT");
    assert.equal(res.error.path, "entries");
  });

  it("enforces maxEntryBytes pre-allocation limit on declared size", async () => {
    const zipBytes = await buildSyntheticZip({
      entries: [
        {
          name: "large.txt",
          data: new Uint8Array(500),
          method: 8,
          uncompressedSize: 5000,
        },
      ],
    });

    const limits: ZipLimits = {
      maxInputBytes: 10000,
      maxEntries: 10,
      maxExpandedBytes: 10000,
      maxEntryBytes: 1000, // lower than 5000 declared
    };

    const res = await readZip(zipBytes, limits);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_LIMIT");
    assert.equal(res.error.path, "large.txt");
  });

  it("aborts streaming deflation before resource exhaustion (Zip Bomb)", async () => {
    // Create a highly compressible payload: 50,000 zeros deflates to ~60 bytes
    const hugePayload = new Uint8Array(50000);
    const comp = await deflateRaw(hugePayload);

    // Lie in the header: claim uncompressedSize is 100 (passes pre-allocation check of 2000)
    const zipBytes = await buildSyntheticZip({
      entries: [{
        name: "bomb.txt",
        data: hugePayload,
        method: 8,
        compressedData: comp,
        compressedSize: comp.byteLength,
        uncompressedSize: 100, // lies in header!
      }],
    });

    const limits: ZipLimits = {
      maxInputBytes: 10000,
      maxEntries: 10,
      maxExpandedBytes: 100000,
      maxEntryBytes: 2000, // Limit is 2000 bytes, bomb is 50,000 bytes
    };

    const res = await readZip(zipBytes, limits);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_LIMIT");
    assert.equal(res.error.path, "bomb.txt");
    assert.match(res.error.message, /Entry expanded bytes .* exceeded limit/);
  });

  it("enforces maxExpandedBytes across multiple streaming entries", async () => {
    const payload1 = new Uint8Array(3000);
    const payload2 = new Uint8Array(3000);
    const comp1 = await deflateRaw(payload1);
    const comp2 = await deflateRaw(payload2);

    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "part1.txt", data: payload1, method: 8, compressedData: comp1, compressedSize: comp1.byteLength, uncompressedSize: 3000 },
        { name: "part2.txt", data: payload2, method: 8, compressedData: comp2, compressedSize: comp2.byteLength, uncompressedSize: 3000 },
      ],
    });

    const limits: ZipLimits = {
      maxInputBytes: 20000,
      maxEntries: 10,
      maxExpandedBytes: 4500, // Each is 3000, sum is 6000 > 4500
      maxEntryBytes: 3500,
    };

    const res = await readZip(zipBytes, limits);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ZIP_LIMIT");
  });
});

describe("Cancellation via AbortSignal (IMPORT_CANCELLED)", () => {
  it("cancels immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const zipBytes = await buildSyntheticZip({
      entries: [{ name: "test.txt", data: new Uint8Array(10), method: 0 }],
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS, controller.signal);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "IMPORT_CANCELLED");
    assert.equal(res.error.recoverable, true);
  });

  it("cancels cleanly during decompression and marks recoverable: true", async () => {
    const controller = new AbortController();

    const huge = new Uint8Array(100000);
    huge.fill(0x55);
    const zipBytes = await buildSyntheticZip({
      entries: [
        { name: "file1.txt", data: huge, method: 8 },
        { name: "file2.txt", data: huge, method: 8 },
      ],
    });

    // Abort after small microtask tick
    queueMicrotask(() => {
      controller.abort();
    });

    const res = await readZip(zipBytes, DEFAULT_TEST_LIMITS, controller.signal);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "IMPORT_CANCELLED");
    assert.equal(res.error.recoverable, true);
  });
});

describe("Proposed caps and contract adherence", () => {
  it("exposes PROPOSED_ZIP_LIMITS matching WEB-contract.md §8 caps", () => {
    assert.equal(PROPOSED_ZIP_LIMITS.maxInputBytes, 10 * 1024 * 1024);
    assert.equal(PROPOSED_ZIP_LIMITS.maxEntries, 2000);
    assert.equal(PROPOSED_ZIP_LIMITS.maxExpandedBytes, 50 * 1024 * 1024);
    assert.equal(PROPOSED_ZIP_LIMITS.maxEntryBytes, 10 * 1024 * 1024);
  });
});
