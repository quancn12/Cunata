/**
 * IEEE 802.3 32-bit Cyclic Redundancy Check (CRC-32).
 * Uses standard polynomial 0xEDB88320 (reversed).
 * Compatible with Node.js zlib.crc32 and PKZIP 2.04g standard.
 */

const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

/**
 * Computes standard CRC-32 checksum of given bytes as an unsigned 32-bit integer.
 */
export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF]!;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
