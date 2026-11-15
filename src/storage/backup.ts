import type {
  AttemptRecord,
  OutboxRecord,
  Result,
  WebError,
} from '../schema/index.ts';

import type {
  StoragePort,
  StoredObjectEnvelope,
  StorageBackupPayload,
} from './types.ts';
import type { StorageLike, QuarantineEntry } from './migrate.ts';
import { exportQuarantineRaw, exportQuarantineRawString } from './migrate.ts';

export type { StorageBackupPayload };
export { exportQuarantineRaw, exportQuarantineRawString };

export interface ExtendedBackupPayload extends StorageBackupPayload {
  readonly meta?: readonly StoredObjectEnvelope[];
}

export interface ConfirmedDeletionOptions {
  readonly storage: StoragePort;
  readonly localStorage?: StorageLike;
  readonly confirmed: boolean;
  readonly exportBackupFirst?: boolean;
}

export interface DeletionResult {
  readonly backupBlob?: Blob;
  readonly deletedLocalKeys: number;
  readonly clearedStorage: boolean;
}

/**
 * Validate that an unknown input is a structurally sound StorageBackupPayload.
 */
export function validateBackupPayload(input: unknown): Result<StorageBackupPayload> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'input',
        message: 'Dữ liệu sao lưu không phải là đối tượng hợp lệ',
        recoverable: false,
      },
    };
  }

  const raw = input as Record<string, unknown>;

  if (typeof raw.schemaVersion === 'string' && raw.schemaVersion !== 'cunata-backup-v1') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_VERSION_UNSUPPORTED',
        path: 'schemaVersion',
        message: `Phiên bản schema sao lưu '${raw.schemaVersion}' không được hỗ trợ (future schema version)`,
        recoverable: false,
      },
    };
  }

  if (raw.schemaVersion !== 'cunata-backup-v1') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'schemaVersion',
        message: 'Dữ liệu sao lưu không đúng định dạng schemaVersion: "cunata-backup-v1"',
        recoverable: false,
      },
    };
  }

  if (typeof raw.exportedAt !== 'string') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'exportedAt',
        message: 'Dữ liệu sao lưu thiếu trường exportedAt dạng chuỗi thời gian',
        recoverable: false,
      },
    };
  }

  if (!Array.isArray(raw.attempts)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'attempts',
        message: 'Trường attempts phải là mảng',
        recoverable: false,
      },
    };
  }

  if (!Array.isArray(raw.outbox)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'outbox',
        message: 'Trường outbox phải là mảng',
        recoverable: false,
      },
    };
  }

  if (!Array.isArray(raw.bank)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'bank',
        message: 'Trường bank phải là mảng',
        recoverable: false,
      },
    };
  }

  if (!Array.isArray(raw.exams)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'exams',
        message: 'Trường exams phải là mảng',
        recoverable: false,
      },
    };
  }

  if (!Array.isArray(raw.imports)) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_CORRUPT',
        path: 'imports',
        message: 'Trường imports phải là mảng',
        recoverable: false,
      },
    };
  }

  return { ok: true, value: input as StorageBackupPayload };
}

/**
 * Export complete backup from storage port to a Blob.
 */
export async function exportBackup(
  storage: StoragePort,
  localStorage?: StorageLike
): Promise<Result<Blob>> {
  if (!storage || typeof storage.exportBackup !== 'function') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        path: 'storage',
        message: 'StoragePort không khả dụng để xuất bản sao lưu',
        recoverable: false,
      },
    };
  }

  return storage.exportBackup();
}

/**
 * Import and restore backup into storage port.
 */
export async function importBackup(
  storage: StoragePort,
  input: unknown
): Promise<Result<void>> {
  if (!storage || typeof storage.importBackup !== 'function') {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        path: 'storage',
        message: 'StoragePort không khả dụng để nạp bản sao lưu',
        recoverable: false,
      },
    };
  }

  const valRes = validateBackupPayload(
    typeof input === 'string'
      ? (() => {
          try {
            return JSON.parse(input);
          } catch {
            return null;
          }
        })()
      : input
  );

  if (!valRes.ok) {
    return valRes;
  }

  return storage.importBackup(input);
}

/**
 * Confirmed deletion: Purge all data with mandatory explicit confirmation.
 * Rules per Section 6:
 * - Requires explicit confirmation (confirmed === true).
 * - If exportBackupFirst === true, exports backup before purging.
 * - Clears storage through storage.clearAll(true).
 * - If localStorage provided, removes all Cunata-specific keys ('cunata:*', 'cunata_exam_attempt_v1').
 */
export async function deleteConfirmed(
  options: ConfirmedDeletionOptions
): Promise<Result<DeletionResult>> {
  if (options.confirmed !== true) {
    return {
      ok: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        path: 'confirmed',
        message: 'Hành động xóa toàn bộ yêu cầu xác nhận explicit (confirmed: true).',
        recoverable: false,
      },
    };
  }

  let backupBlob: Blob | undefined;

  if (options.exportBackupFirst === true) {
    const backupRes = await exportBackup(options.storage, options.localStorage);
    if (!backupRes.ok) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_CORRUPT',
          path: 'exportBackupFirst',
          message: `Không thể sao lưu trước khi xóa: ${backupRes.error.message}`,
          recoverable: false,
        },
      };
    }
    backupBlob = backupRes.value;
  }

  const clearRes = await options.storage.clearAll(true);
  if (!clearRes.ok) {
    return {
      ok: false,
      error: clearRes.error,
    };
  }

  let deletedLocalKeys = 0;
  if (options.localStorage) {
    const ls = options.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (k.startsWith('cunata:') || k === 'cunata_exam_attempt_v1')) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      ls.removeItem(k);
      deletedLocalKeys++;
    }
  }

  return {
    ok: true,
    value: {
      backupBlob,
      deletedLocalKeys,
      clearedStorage: true,
    },
  };
}
