/**
 * Public entrypoint for bounded native ZIP reader.
 * Conforms to docs/contracts/WEB-contract.md §4-§5 and §8.
 */

export type {
  ZipLimits,
  ZipEntry,
  WebError,
  Result,
} from "./types.ts";

export {
  PROPOSED_ZIP_LIMITS,
} from "./types.ts";

export {
  computeCrc32,
} from "./crc32.ts";

export {
  readZip,
  supportsDeflateRaw,
} from "./reader.ts";
