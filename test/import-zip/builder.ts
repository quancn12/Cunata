/**
 * Synthetic ZIP builder for unit and integration testing of ZIP reader.
 * Creates byte-level controlled ZIP archives including valid, corrupt,
 * boundaries, zip bombs, and attack scenarios without external dependencies.
 */

import { computeCrc32 } from "../../src/import/zip/crc32.ts";

export interface SyntheticZipEntry {
  name: string;
  data: Uint8Array;
  method?: 0 | 8 | number; // 0=stored, 8=deflate, or unsupported numbers
  crc?: number; // override CRC32
  compressedData?: Uint8Array; // override compressed payload
  compressedSize?: number; // override header compressedSize
  uncompressedSize?: number; // override header uncompressedSize
  flags?: number; // override general purpose bit flags
  extraField?: Uint8Array; // extra field in CDFH
  lfhExtraField?: Uint8Array; // extra field in LFH
  diskStart?: number;
  lfhOffset?: number; // override localHeaderOffset in CDFH
  corruptLfhSig?: boolean;
  corruptCdfhSig?: boolean;
  lfhMethodMismatch?: number;
}

export interface SyntheticZipOptions {
  entries: SyntheticZipEntry[];
  comment?: string;
  diskNumber?: number;
  cdDiskNumber?: number;
  diskEntries?: number;
  totalEntries?: number;
  cdOffsetOverride?: number;
  cdSizeOverride?: number;
  zip64Locator?: boolean;
  zip64EocdValues?: boolean;
}

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter() as unknown as {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
  };
  await writer.write(data);
  await writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function writeUint16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

export async function buildSyntheticZip(
  options: SyntheticZipOptions,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let currentOffset = 0;

  for (let i = 0; i < options.entries.length; i++) {
    const entry = options.entries[i]!;
    const method = entry.method ?? 0;

    let payload: Uint8Array;
    if (entry.compressedData) {
      payload = entry.compressedData;
    } else if (method === 8) {
      payload = await deflateRaw(entry.data);
    } else {
      payload = entry.data;
    }

    const actualCrc = computeCrc32(entry.data);
    const crc = entry.crc !== undefined ? entry.crc : actualCrc;
    const compSize =
      entry.compressedSize !== undefined ? entry.compressedSize : payload.byteLength;
    const uncompSize =
      entry.uncompressedSize !== undefined ? entry.uncompressedSize : entry.data.byteLength;

    const nameBytes = new TextEncoder().encode(entry.name);
    const lfhExtra = entry.lfhExtraField ?? new Uint8Array(0);
    const cdfhExtra = entry.extraField ?? new Uint8Array(0);

    const flags = entry.flags !== undefined ? entry.flags : 0x0800; // default UTF-8

    // 1. Local File Header (LFH) - 30 bytes
    const lfh = new Uint8Array(30);
    const lfhSig = entry.corruptLfhSig ? 0x00000000 : 0x04034b50;
    writeUint32LE(lfh, 0, lfhSig);
    writeUint16LE(lfh, 4, 20); // version needed
    writeUint16LE(lfh, 6, flags);
    writeUint16LE(
      lfh,
      8,
      entry.lfhMethodMismatch !== undefined ? entry.lfhMethodMismatch : method,
    );
    writeUint16LE(lfh, 10, 0); // time
    writeUint16LE(lfh, 12, 0); // date
    writeUint32LE(lfh, 14, crc);
    writeUint32LE(lfh, 18, compSize);
    writeUint32LE(lfh, 22, uncompSize);
    writeUint16LE(lfh, 26, nameBytes.byteLength);
    writeUint16LE(lfh, 28, lfhExtra.byteLength);

    const entryLfhOffset = currentOffset;
    parts.push(lfh, nameBytes, lfhExtra, payload);
    currentOffset += lfh.byteLength + nameBytes.byteLength + lfhExtra.byteLength + payload.byteLength;

    // 2. Central Directory File Header (CDFH) - 46 bytes
    const cdfh = new Uint8Array(46);
    const cdfhSig = entry.corruptCdfhSig ? 0x00000000 : 0x02014b50;
    writeUint32LE(cdfh, 0, cdfhSig);
    writeUint16LE(cdfh, 4, 20); // version made by
    writeUint16LE(cdfh, 6, 20); // version needed
    writeUint16LE(cdfh, 8, flags);
    writeUint16LE(cdfh, 10, method);
    writeUint16LE(cdfh, 12, 0); // time
    writeUint16LE(cdfh, 14, 0); // date
    writeUint32LE(cdfh, 16, crc);
    writeUint32LE(cdfh, 20, compSize);
    writeUint32LE(cdfh, 24, uncompSize);
    writeUint16LE(cdfh, 28, nameBytes.byteLength);
    writeUint16LE(cdfh, 30, cdfhExtra.byteLength);
    writeUint16LE(cdfh, 32, 0); // comment length
    writeUint16LE(cdfh, 34, entry.diskStart ?? 0);
    writeUint16LE(cdfh, 36, 0); // internal attr
    writeUint32LE(cdfh, 38, 0); // external attr
    writeUint32LE(
      cdfh,
      42,
      entry.lfhOffset !== undefined ? entry.lfhOffset : entryLfhOffset,
    );

    cdParts.push(cdfh, nameBytes, cdfhExtra);
  }

  const cdOffset =
    options.cdOffsetOverride !== undefined ? options.cdOffsetOverride : currentOffset;
  let cdSize = 0;
  for (const p of cdParts) cdSize += p.byteLength;
  if (options.cdSizeOverride !== undefined) {
    cdSize = options.cdSizeOverride;
  }

  const commentBytes = options.comment
    ? new TextEncoder().encode(options.comment)
    : new Uint8Array(0);

  // Optional ZIP64 locator (20 bytes)
  const zip64Parts: Uint8Array[] = [];
  if (options.zip64Locator) {
    const locator = new Uint8Array(20);
    writeUint32LE(locator, 0, 0x07064b50); // ZIP64 locator sig
    writeUint32LE(locator, 4, 0); // disk with start of ZIP64 EOCD
    writeUint32LE(locator, 8, cdOffset); // relative offset of ZIP64 EOCD
    writeUint32LE(locator, 12, 0);
    writeUint32LE(locator, 16, 1); // total disks
    zip64Parts.push(locator);
  }

  // 3. End of Central Directory (EOCD) - 22 bytes
  const eocd = new Uint8Array(22);
  writeUint32LE(eocd, 0, 0x06054b50);
  writeUint16LE(eocd, 4, options.diskNumber ?? 0);
  writeUint16LE(eocd, 6, options.cdDiskNumber ?? 0);
  writeUint16LE(
    eocd,
    8,
    options.zip64EocdValues
      ? 0xffff
      : options.diskEntries !== undefined
      ? options.diskEntries
      : options.entries.length,
  );
  writeUint16LE(
    eocd,
    10,
    options.zip64EocdValues
      ? 0xffff
      : options.totalEntries !== undefined
      ? options.totalEntries
      : options.entries.length,
  );
  writeUint32LE(eocd, 12, options.zip64EocdValues ? 0xffffffff : cdSize);
  writeUint32LE(eocd, 16, options.zip64EocdValues ? 0xffffffff : cdOffset);
  writeUint16LE(eocd, 20, commentBytes.byteLength);

  const allChunks = [...parts, ...cdParts, ...zip64Parts, eocd, commentBytes];
  let totalLen = 0;
  for (const c of allChunks) totalLen += c.byteLength;

  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const c of allChunks) {
    result.set(c, off);
    off += c.byteLength;
  }

  return result;
}
