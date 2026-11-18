import { validateBankEntry, saveBankEntry, deleteBankEntry, createNewVersion, } from './index.js';
function deepClone(val) {
    if (val === undefined || val === null || typeof val !== 'object') {
        return val;
    }
    if (typeof structuredClone === 'function') {
        return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
}
/**
 * Validates a Taxonomy structure strictly.
 */
export function validateTaxonomy(tax) {
    if (!tax || typeof tax !== 'object') {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy',
                message: 'Taxonomy phải là đối tượng hợp lệ',
                recoverable: true,
            },
        };
    }
    const raw = tax;
    if (typeof raw.subject !== 'string' || raw.subject.trim() === '') {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy.subject',
                message: 'Môn học (subject) không được rỗng',
                recoverable: true,
            },
        };
    }
    if (raw.grade !== 10 && raw.grade !== 11 && raw.grade !== 12) {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy.grade',
                message: 'Khối lớp (grade) phải là 10, 11 hoặc 12',
                recoverable: true,
            },
        };
    }
    if (typeof raw.topic !== 'string' || raw.topic.trim() === '') {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy.topic',
                message: 'Chủ đề (topic) không được rỗng',
                recoverable: true,
            },
        };
    }
    if (typeof raw.lesson !== 'string' || raw.lesson.trim() === '') {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy.lesson',
                message: 'Bài học (lesson) không được rỗng',
                recoverable: true,
            },
        };
    }
    const diff = raw.difficulty;
    if (diff !== 'Nhận biết' && diff !== 'Thông hiểu' && diff !== 'Vận dụng') {
        return {
            ok: false,
            error: {
                code: 'BANK_TAXONOMY_INVALID',
                path: 'taxonomy.difficulty',
                message: 'Mức độ (difficulty) phải là "Nhận biết", "Thông hiểu" hoặc "Vận dụng"',
                recoverable: true,
            },
        };
    }
    return {
        ok: true,
        value: {
            subject: raw.subject.trim(),
            grade: raw.grade,
            topic: raw.topic.trim(),
            lesson: raw.lesson.trim(),
            difficulty: diff,
        },
    };
}
/**
 * Serializes a list of BankEntry objects into a canonical BankTransferPayload JSON string.
 */
export function exportBankTransferJson(entries, metadata) {
    const clonedEntries = entries.map((e) => deepClone(e));
    const payload = {
        schemaVersion: 'cunata-bank-transfer-v1',
        exportedAt: new Date().toISOString(),
        generator: 'cunata-web-bank-v1',
        count: clonedEntries.length,
        entries: clonedEntries,
        ...(metadata ? { metadata: deepClone(metadata) } : {}),
    };
    return JSON.stringify(payload, null, 2);
}
/**
 * Exports a list of BankEntry objects as a downloadable Blob.
 */
export function exportBankTransfer(entries, metadata) {
    const jsonStr = exportBankTransferJson(entries, metadata);
    return new Blob([jsonStr], { type: 'application/json' });
}
/**
 * Parses and strictly validates an unknown input into a BankTransferPayload.
 * Handles strings, ArrayBuffers, or pre-parsed objects.
 */
export function parseBankTransfer(input) {
    let parsed = input;
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                ok: false,
                error: {
                    code: 'BANK_TRANSFER_INVALID',
                    path: 'json',
                    message: `Dữ liệu không phải là JSON hợp lệ: ${msg}`,
                    recoverable: false,
                },
            };
        }
    }
    else if (input instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer)) {
        try {
            const text = new TextDecoder('utf-8').decode(input);
            parsed = JSON.parse(text);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                ok: false,
                error: {
                    code: 'BANK_TRANSFER_INVALID',
                    path: 'bytes',
                    message: `Không thể giải mã dữ liệu nhị phân thành JSON: ${msg}`,
                    recoverable: false,
                },
            };
        }
    }
    if (!parsed || typeof parsed !== 'object') {
        return {
            ok: false,
            error: {
                code: 'BANK_TRANSFER_INVALID',
                path: 'root',
                message: 'Dữ liệu chuyển giao ngân hàng câu hỏi phải là đối tượng hợp lệ',
                recoverable: false,
            },
        };
    }
    const raw = parsed;
    if (raw.schemaVersion !== 'cunata-bank-transfer-v1') {
        return {
            ok: false,
            error: {
                code: 'BANK_TRANSFER_INVALID',
                path: 'schemaVersion',
                message: `schemaVersion không được hỗ trợ: kỳ vọng "cunata-bank-transfer-v1", nhận được "${String(raw.schemaVersion)}"`,
                recoverable: false,
            },
        };
    }
    if (!Array.isArray(raw.entries)) {
        return {
            ok: false,
            error: {
                code: 'BANK_TRANSFER_INVALID',
                path: 'entries',
                message: 'Trường entries phải là một mảng',
                recoverable: false,
            },
        };
    }
    const entriesList = raw.entries;
    const validatedEntries = [];
    const seenVersionIds = new Set();
    for (let i = 0; i < entriesList.length; i++) {
        const item = entriesList[i];
        const validation = validateBankEntry(item);
        if (!validation.ok) {
            return {
                ok: false,
                error: {
                    code: 'BANK_TRANSFER_INVALID',
                    path: `entries[${i}].${validation.error.path}`,
                    message: `Câu hỏi thứ ${i + 1} không hợp lệ: ${validation.error.message}`,
                    recoverable: false,
                },
            };
        }
        const entry = validation.value;
        if (seenVersionIds.has(entry.questionVersionId)) {
            return {
                ok: false,
                error: {
                    code: 'BANK_TRANSFER_INVALID',
                    path: `entries[${i}].questionVersionId`,
                    message: `questionVersionId bị trùng lặp trong cùng tệp chuyển giao: ${entry.questionVersionId}`,
                    recoverable: false,
                },
            };
        }
        seenVersionIds.add(entry.questionVersionId);
        // Also strictly validate taxonomy
        const taxRes = validateTaxonomy(entry.taxonomy);
        if (!taxRes.ok) {
            return {
                ok: false,
                error: {
                    code: 'BANK_TRANSFER_INVALID',
                    path: `entries[${i}].${taxRes.error.path}`,
                    message: `Phân loại câu hỏi thứ ${i + 1} không hợp lệ: ${taxRes.error.message}`,
                    recoverable: false,
                },
            };
        }
        validatedEntries.push(deepClone(entry));
    }
    const payload = {
        schemaVersion: 'cunata-bank-transfer-v1',
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
        generator: typeof raw.generator === 'string' ? raw.generator : 'cunata-web-bank-v1',
        count: validatedEntries.length,
        entries: Object.freeze(validatedEntries),
        ...(raw.metadata && typeof raw.metadata === 'object'
            ? { metadata: deepClone(raw.metadata) }
            : {}),
    };
    return { ok: true, value: Object.freeze(payload) };
}
/**
 * Imports a BankTransferPayload or raw JSON/bytes into StoragePort with deduplication.
 * NEVER writes directly to localStorage. All persistence is transactional through StoragePort.
 */
export async function importBankTransfer(payloadInput, storage, options = {}) {
    if (!storage || typeof storage.getObject !== 'function' || typeof storage.putObject !== 'function') {
        return {
            ok: false,
            error: {
                code: 'STORAGE_UNAVAILABLE',
                path: 'storage',
                message: 'StoragePort không khả dụng hoặc bị thiếu phương thức',
                recoverable: false,
            },
        };
    }
    const parseRes = parseBankTransfer(payloadInput);
    if (!parseRes.ok) {
        return parseRes;
    }
    const payload = parseRes.value;
    const dedupe = options.dedupe ?? 'skip';
    const idGen = options.idGenerator ?? (() => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `q-gen-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    });
    let imported = 0;
    let skipped = 0;
    let updated = 0;
    let forked = 0;
    const errors = [];
    const processedIds = [];
    for (let i = 0; i < payload.entries.length; i++) {
        const entry = payload.entries[i];
        if (!entry)
            continue;
        try {
            const existingRes = await storage.getObject('bank', entry.questionVersionId);
            if (!existingRes.ok) {
                errors.push({ entryIndex: i, questionVersionId: entry.questionVersionId, error: existingRes.error });
                continue;
            }
            const existing = existingRes.value;
            if (!existing) {
                // Not in storage: insert new entry with null revision expectation
                const saveRes = await saveBankEntry(entry, null, storage);
                if (!saveRes.ok) {
                    errors.push({ entryIndex: i, questionVersionId: entry.questionVersionId, error: saveRes.error });
                    continue;
                }
                imported++;
                processedIds.push(entry.questionVersionId);
            }
            else {
                // Already exists in storage: apply dedupe strategy
                if (dedupe === 'skip') {
                    skipped++;
                    processedIds.push(entry.questionVersionId);
                }
                else if (dedupe === 'overwrite') {
                    const saveRes = await saveBankEntry(entry, existing.revision, storage);
                    if (!saveRes.ok) {
                        errors.push({ entryIndex: i, questionVersionId: entry.questionVersionId, error: saveRes.error });
                        continue;
                    }
                    updated++;
                    processedIds.push(entry.questionVersionId);
                }
                else if (dedupe === 'fork_new_version') {
                    const newVersionId = idGen();
                    const forkRes = createNewVersion(entry, newVersionId);
                    if (!forkRes.ok) {
                        errors.push({ entryIndex: i, questionVersionId: entry.questionVersionId, error: forkRes.error });
                        continue;
                    }
                    const saveRes = await saveBankEntry(forkRes.value, null, storage);
                    if (!saveRes.ok) {
                        errors.push({ entryIndex: i, questionVersionId: newVersionId, error: saveRes.error });
                        continue;
                    }
                    forked++;
                    processedIds.push(newVersionId);
                }
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({
                entryIndex: i,
                questionVersionId: entry.questionVersionId,
                error: {
                    code: 'STORAGE_CORRUPT',
                    path: `entries[${i}]`,
                    message: `Lỗi xử lý câu hỏi: ${msg}`,
                    recoverable: false,
                },
            });
        }
    }
    const summary = {
        totalInPayload: payload.count,
        imported,
        skipped,
        updated,
        forked,
        errors: Object.freeze(errors),
        entryIds: Object.freeze(processedIds),
    };
    return { ok: true, value: Object.freeze(summary) };
}
/**
 * Extracts all bank entries stored in a StoragePort via its exportBackup mechanism.
 * Returns a list of validated BankEntry objects.
 */
export async function loadAllBankEntriesFromStorage(storage) {
    if (!storage || typeof storage.exportBackup !== 'function') {
        return {
            ok: false,
            error: {
                code: 'STORAGE_UNAVAILABLE',
                path: 'storage',
                message: 'StoragePort không khả dụng',
                recoverable: false,
            },
        };
    }
    const backupRes = await storage.exportBackup();
    if (!backupRes.ok) {
        return backupRes;
    }
    try {
        const text = await backupRes.value.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bank)) {
            return { ok: true, value: Object.freeze([]) };
        }
        const entries = [];
        for (const item of parsed.bank) {
            // In StorageBackupPayload, bank is array of StoredObjectEnvelope: { id, revision, value: BankEntry, updatedAt }
            // Or in test in-memory storage, array of [id, { revision, value }]
            let candidate = item;
            if (item && typeof item === 'object') {
                if ('value' in item) {
                    candidate = item.value;
                }
                else if (Array.isArray(item) && item.length === 2 && item[1] && typeof item[1] === 'object' && 'value' in item[1]) {
                    candidate = item[1].value;
                }
            }
            const valRes = validateBankEntry(candidate);
            if (valRes.ok) {
                entries.push(valRes.value);
            }
        }
        return { ok: true, value: Object.freeze(entries) };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: {
                code: 'STORAGE_CORRUPT',
                path: 'backup',
                message: `Không thể đọc dữ liệu ngân hàng câu hỏi từ bản sao lưu: ${msg}`,
                recoverable: false,
            },
        };
    }
}
/**
 * Exports all bank entries currently in StoragePort to a downloadable Blob.
 */
export async function exportBankViaStorage(storage, metadata) {
    const loadRes = await loadAllBankEntriesFromStorage(storage);
    if (!loadRes.ok) {
        return loadRes;
    }
    const blob = exportBankTransfer(loadRes.value, metadata);
    return { ok: true, value: blob };
}
/**
 * Confirmed deletion of a single BankEntry from StoragePort.
 * Requires explicit options.confirmed === true.
 */
export async function deleteBankEntryConfirmed(questionVersionId, expectedRevision, storage, options) {
    if (!options || options.confirmed !== true) {
        return {
            ok: false,
            error: {
                code: 'CONFIRMATION_REQUIRED',
                path: 'confirmed',
                message: 'Hành động xóa câu hỏi yêu cầu xác nhận rõ ràng (confirmed = true).',
                recoverable: false,
            },
        };
    }
    return deleteBankEntry(questionVersionId, expectedRevision, storage);
}
/**
 * Confirmed complete purge of all local bank records from StoragePort.
 * Requires explicit options.confirmed === true.
 */
export async function clearAllConfirmed(storage, options) {
    if (!options || options.confirmed !== true) {
        return {
            ok: false,
            error: {
                code: 'CONFIRMATION_REQUIRED',
                path: 'confirmed',
                message: 'Hành động xóa toàn bộ yêu cầu xác nhận rõ ràng (confirmed = true).',
                recoverable: false,
            },
        };
    }
    if (!storage || typeof storage.clearAll !== 'function') {
        return {
            ok: false,
            error: {
                code: 'STORAGE_UNAVAILABLE',
                path: 'storage',
                message: 'StoragePort không khả dụng',
                recoverable: false,
            },
        };
    }
    return storage.clearAll(true);
}
