/**
 * ZIP reader contract and types for Cunata.
 * Conforms to docs/contracts/WEB-contract.md §4-§5 and §8.
 */

export interface ZipLimits {
  readonly maxInputBytes: number;
  readonly maxEntries: number;
  readonly maxExpandedBytes: number;
  readonly maxEntryBytes: number;
}

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface WebError {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WebError };

/**
 * Technical caps proposed for D07 in WEB-contract.md §8:
 * - maxInputBytes: 10 MiB
 * - maxEntries: 2,000 entries
 * - maxExpandedBytes: 50 MiB
 * - maxEntryBytes: 10 MiB
 * Note: These are proposed caps and must not be treated as approved product caps
 * without formal Product Owner decision (D07).
 */
export const PROPOSED_ZIP_LIMITS: ZipLimits = {
  maxInputBytes: 10 * 1024 * 1024,
  maxEntries: 2000,
  maxExpandedBytes: 50 * 1024 * 1024,
  maxEntryBytes: 10 * 1024 * 1024,
};
