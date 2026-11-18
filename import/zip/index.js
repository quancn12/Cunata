/**
 * Public entrypoint for bounded native ZIP reader.
 * Conforms to docs/contracts/WEB-contract.md §4-§5 and §8.
 */
export { PROPOSED_ZIP_LIMITS, } from "./types.js";
export { computeCrc32, } from "./crc32.js";
export { readZip, supportsDeflateRaw, } from "./reader.js";
