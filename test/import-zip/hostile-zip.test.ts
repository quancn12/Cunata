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

describe("WEB-W4-IMPORT: Hostile ZIP Corpus & Resource Boundaries", () => {
  describe("Streaming Zip Bomb & Aggregate Expansion Caps", () => {
    it("rejects entry whose declared uncompressed size exceeds maxEntryBytes before allocation", async () => {
      const data = new Uint8Array(100 * 1024);
      data.fill(0);
      const deflatedChunk = await deflateRaw(data);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "bomb.bin",
            data,
            method: 8,
            compressedData: deflatedChunk,
            compressedSize: deflatedChunk.byteLength,
            uncompressedSize: data.byteLength,
          },
        ],
      });

      const strictLimits: ZipLimits = {
        maxInputBytes: 10 * 1024 * 1024,
        maxEntries: 10,
        maxExpandedBytes: 50 * 1024 * 1024,
        maxEntryBytes: 20 * 1024, // 20 KiB
      };

      const res = await readZip(zipBytes, strictLimits);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_LIMIT");
      assert.strictEqual(res.error.path, "bomb.bin");
      assert.match(res.error.message, /Entry uncompressed size 102400 exceeds maxEntryBytes/);
    });

    it("aborts deceitful streaming zip bomb where header lies about uncompressed size during streaming", async () => {
      // 100 KiB uncompressed, but header deceitfully claims only 500 bytes uncompressed size!
      const bigZeroes = new Uint8Array(100 * 1024);
      bigZeroes.fill(0);
      const deflatedChunk = await deflateRaw(bigZeroes);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "lying_bomb.bin",
            data: bigZeroes,
            method: 8,
            compressedData: deflatedChunk,
            compressedSize: deflatedChunk.byteLength,
            uncompressedSize: 500, // Deceitful header! Passes pre-check
          },
        ],
      });

      const strictLimits: ZipLimits = {
        maxInputBytes: 10 * 1024 * 1024,
        maxEntries: 10,
        maxExpandedBytes: 50 * 1024 * 1024,
        maxEntryBytes: 20 * 1024, // 20 KiB limit
      };

      const res = await readZip(zipBytes, strictLimits);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_LIMIT");
      assert.strictEqual(res.error.path, "lying_bomb.bin");
      assert.match(res.error.message, /Entry expanded bytes.*exceeded limit/);
    });

    it("rejects archive when declared total uncompressed size exceeds maxExpandedBytes", async () => {
      const data10k = new Uint8Array(10 * 1024);
      data10k.fill(0x55);
      const deflated = await deflateRaw(data10k);

      const entries = [];
      for (let i = 0; i < 5; i++) {
        entries.push({
          name: `entry_${i}.bin`,
          data: data10k,
          method: 8,
          compressedData: deflated,
          compressedSize: deflated.byteLength,
          uncompressedSize: data10k.byteLength,
        });
      }

      const zipBytes = await buildSyntheticZip({ entries });

      // Cap total expansion at 25 KiB (5 entries * 10 KiB = 50 KiB declared)
      const tightExpandedLimits: ZipLimits = {
        maxInputBytes: 10 * 1024 * 1024,
        maxEntries: 20,
        maxExpandedBytes: 25 * 1024, // 25 KiB
        maxEntryBytes: 20 * 1024,
      };

      const res = await readZip(zipBytes, tightExpandedLimits);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_LIMIT");
      assert.match(res.error.message, /Total declared uncompressed size exceeds maxExpandedBytes/);
    });

    it("aborts when actual cumulative streaming expansion exceeds maxExpandedBytes mid-stream", async () => {
      // Single entry declares 10 KiB uncompressed, maxEntryBytes is 30 KiB, but maxExpandedBytes is 15 KiB.
      // During streaming, actual data reaches 20 KiB (> 15 KiB maxExpandedBytes)
      const data20k = new Uint8Array(20 * 1024);
      data20k.fill(0x77);
      const deflated = await deflateRaw(data20k);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "expansion_stream.bin",
            data: data20k,
            method: 8,
            compressedData: deflated,
            compressedSize: deflated.byteLength,
            uncompressedSize: 10 * 1024, // Declares 10 KiB (< 15 KiB maxExpandedBytes to pass header check)
          },
        ],
      });

      const tightExpandedLimits: ZipLimits = {
        maxInputBytes: 10 * 1024 * 1024,
        maxEntries: 10,
        maxExpandedBytes: 15 * 1024, // 15 KiB limit
        maxEntryBytes: 30 * 1024, // 30 KiB per entry allowed
      };

      const res = await readZip(zipBytes, tightExpandedLimits);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_LIMIT");
      assert.match(res.error.message, /Total expanded bytes.*exceeded limit/);
    });

    it("aborts cleanly mid-decompression when AbortSignal triggers during stream chunking", async () => {
      const data = new Uint8Array(200 * 1024);
      data.fill(0x42);
      const deflated = await deflateRaw(data);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "streaming.bin",
            data,
            method: 8,
            compressedData: deflated,
            compressedSize: deflated.byteLength,
            uncompressedSize: data.byteLength,
          },
        ],
      });

      const ac = new AbortController();
      // Schedule abort right as decompression starts
      queueMicrotask(() => {
        ac.abort();
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS, ac.signal);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "IMPORT_CANCELLED");
      assert.strictEqual(res.error.recoverable, true);
    });
  });

  describe("CRC-32 Tampering & Bitstream Inconsistencies", () => {
    it("rejects stored entry when data bytes are modified after CRC calculation", async () => {
      const original = new TextEncoder().encode("Original stored data for CRC check");
      const expectedCrc = computeCrc32(original);

      const tampered = new Uint8Array(original);
      tampered[0] = tampered[0]! ^ 0xff; // Flip bits

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "tampered_stored.txt",
            data: tampered,
            method: 0,
            crc: expectedCrc, // Claim original CRC
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_INVALID");
      assert.strictEqual(res.error.path, "tampered_stored.txt");
      assert.match(res.error.message, /CRC32 mismatch/);
    });

    it("rejects deflated entry when single bit in compressed bitstream is corrupt", async () => {
      const original = new TextEncoder().encode("Deflated data for single-bit corruption test");
      const compressed = await deflateRaw(original);
      const corruptCompressed = new Uint8Array(compressed);
      corruptCompressed[corruptCompressed.length - 2]! ^= 0x01; // Corrupt bitstream

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "corrupt_deflate.bin",
            data: original,
            method: 8,
            compressedData: corruptCompressed,
            compressedSize: corruptCompressed.byteLength,
            uncompressedSize: original.byteLength,
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_INVALID");
      assert.match(res.error.message, /Deflate decompression failed|CRC32 mismatch/);
    });
  });

  describe("Duplicate Entries, Path Overlaps & Malicious Spans", () => {
    it("rejects duplicate entries across backslash and slash normalized representations", async () => {
      const data = new TextEncoder().encode("Sample content");
      const zipBytes = await buildSyntheticZip({
        entries: [
          { name: "word/document.xml", data, method: 0 },
          { name: "word\\document.xml", data, method: 0 },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_INVALID");
      assert.match(res.error.message, /Duplicate entry name/);
    });

    it("rejects entry whose local header offset points past Central Directory offset", async () => {
      const data = new TextEncoder().encode("Out of bounds");
      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "invalid_offset.txt",
            data,
            method: 0,
            lfhOffset: 99999, // Wild offset
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_INVALID");
    });
  });

  describe("Encryption & ZIP64 Protection Verification", () => {
    it("rejects archive with traditional encryption bit 0 set in CDFH", async () => {
      const data = new TextEncoder().encode("Encrypted payload");
      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "encrypted.bin",
            data,
            method: 0,
            flags: 0x0001, // Bit 0: Encrypted
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_UNSUPPORTED");
      assert.match(res.error.message, /Encrypted ZIP/);
    });

    it("rejects archive with Strong Encryption bit 6 set in CDFH", async () => {
      const data = new TextEncoder().encode("Strong encrypted payload");
      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "strong_enc.bin",
            data,
            method: 0,
            flags: 0x0040, // Bit 6: Strong encryption
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_UNSUPPORTED");
      assert.match(res.error.message, /Encrypted ZIP/);
    });

    it("rejects archive containing ZIP64 locator tag (0x07064b50) before EOCD", async () => {
      const data = new TextEncoder().encode("ZIP64 indicator");
      const zipBytes = await buildSyntheticZip({
        entries: [{ name: "test.txt", data, method: 0 }],
        zip64Locator: true,
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_UNSUPPORTED");
      assert.match(res.error.message, /ZIP64/);
    });

    it("rejects archive containing ZIP64 extra field (0x0001) in central directory", async () => {
      const data = new TextEncoder().encode("ZIP64 extra field");
      // Extra field 0x0001, size 8 bytes
      const zip64Extra = new Uint8Array([0x01, 0x00, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "zip64_extra.txt",
            data,
            method: 0,
            extraField: zip64Extra,
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_UNSUPPORTED");
      assert.match(res.error.message, /ZIP64 extra field/);
    });

    it("rejects archive containing WinZip AES extra field (0x9901)", async () => {
      const data = new TextEncoder().encode("AES encrypted");
      // Extra field 0x9901, size 7 bytes
      const aesExtra = new Uint8Array([0x01, 0x99, 0x07, 0x00, 0x02, 0x00, 0x41, 0x45, 0x03, 0x08, 0x00]);

      const zipBytes = await buildSyntheticZip({
        entries: [
          {
            name: "aes_file.txt",
            data,
            method: 0,
            extraField: aesExtra,
          },
        ],
      });

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "ZIP_UNSUPPORTED");
      assert.match(res.error.message, /Encrypted ZIP/);
    });
  });

  describe("QA Resource & Performance Measurement (Timing & Memory)", () => {
    it("measures execution time and memory usage delta for synthetic archive decompression", async () => {
      const testData = new TextEncoder().encode("QA Benchmarking payload ".repeat(100));
      const zipBytes = await buildSyntheticZip({
        entries: [
          { name: "bench1.txt", data: testData, method: 8 },
          { name: "bench2.txt", data: testData, method: 0 },
        ],
      });

      const getHeap = (): number => {
        const proc = (globalThis as unknown as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
        return typeof proc?.memoryUsage === "function" ? proc.memoryUsage().heapUsed : 0;
      };

      const startMem = getHeap();
      const startTime = performance.now();

      const res = await readZip(zipBytes, PROPOSED_ZIP_LIMITS);

      const endTime = performance.now();
      const endMem = getHeap();
      const durationMs = endTime - startTime;
      const heapDeltaBytes = endMem - startMem;

      assert.strictEqual(res.ok, true);
      assert.ok(durationMs >= 0, "Duration must be non-negative");
      assert.ok(durationMs < 5000, `Decompression took too long: ${durationMs}ms`);

      // Log verified metrics for QA review
      assert.strictEqual(typeof durationMs, "number");
      assert.strictEqual(typeof heapDeltaBytes, "number");
    });
  });
});
