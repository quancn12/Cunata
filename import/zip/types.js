/**
 * ZIP reader contract and types for Cunata.
 * Conforms to docs/contracts/WEB-contract.md §4-§5 and §8.
 */
/**
 * Technical caps proposed for D07 in WEB-contract.md §8:
 * - maxInputBytes: 10 MiB
 * - maxEntries: 2,000 entries
 * - maxExpandedBytes: 50 MiB
 * - maxEntryBytes: 10 MiB
 * Note: These are proposed caps and must not be treated as approved product caps
 * without formal Product Owner decision (D07).
 */
export const PROPOSED_ZIP_LIMITS = {
    maxInputBytes: 10 * 1024 * 1024,
    maxEntries: 2000,
    maxExpandedBytes: 50 * 1024 * 1024,
    maxEntryBytes: 10 * 1024 * 1024,
};
