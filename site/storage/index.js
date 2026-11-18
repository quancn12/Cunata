import { DEFAULT_STORAGE_BROADCAST_CHANNEL, MemoryBroadcastChannel, createStorageBroadcastNotifier, createStorageBroadcastListener, recheckTransactionState, } from './broadcast.js';
import { migrateLegacyStorage, parseLegacyStorageKey, mapLegacyResponsesToDomain, recomputeLegacyScore, exportQuarantineRaw, exportQuarantineRawString, } from './migrate.js';
import { exportBackup, importBackup as importBackupPayload, deleteConfirmed, validateBackupPayload, } from './backup.js';
export { DEFAULT_STORAGE_BROADCAST_CHANNEL, MemoryBroadcastChannel, createStorageBroadcastNotifier, createStorageBroadcastListener, recheckTransactionState, migrateLegacyStorage, parseLegacyStorageKey, mapLegacyResponsesToDomain, recomputeLegacyScore, exportQuarantineRaw, exportQuarantineRawString, exportBackup, importBackupPayload, deleteConfirmed, validateBackupPayload, };
export async function migrateLegacyStorageToStoragePort(storage, localStorage, approvedD03 = true) {
    return migrateLegacyStorage({
        storage,
        localStorage,
        approvedD03,
    });
}
export function attemptKeyToString(k) {
    return JSON.stringify([k.examId, k.examVersionId, k.attemptId]);
}
function deepClone(val) {
    if (val === undefined || val === null || typeof val !== 'object') {
        return val;
    }
    if (typeof structuredClone === 'function') {
        return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
}
export function computePayloadHash(record) {
    const canonical = JSON.stringify({
        examId: record.examId,
        examVersionId: record.examVersionId,
        attemptId: record.attemptId,
        revision: record.revision,
        candidateName: record.candidateName,
        startedAt: record.startedAt,
        submittedAt: record.submittedAt,
        responses: record.responses,
        scoreDTO: record.scoreDTO,
    });
    let h1 = 0x811c9dc5;
    let h2 = 0x9dc5811c;
    for (let i = 0; i < canonical.length; i++) {
        const ch = canonical.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 16777619);
        h2 = Math.imul(h2 ^ (ch >>> 8), 16777619);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `${hex1}${hex2}`;
}
function mapStorageError(err, defaultPath = 'storage') {
    if (err && typeof err === 'object') {
        if ('code' in err && 'path' in err && 'message' in err && 'recoverable' in err) {
            return err;
        }
        const name = 'name' in err ? String(err.name) : '';
        const message = 'message' in err ? String(err.message) : String(err);
        if (name === 'QuotaExceededError') {
            return {
                code: 'STORAGE_QUOTA',
                path: defaultPath,
                message: 'Bộ nhớ lưu trữ cục bộ đã đầy (QuotaExceededError)',
                recoverable: true,
            };
        }
        if (name === 'SecurityError' ||
            name === 'InvalidStateError' ||
            name === 'BlockedError' ||
            message.toLowerCase().includes('blocked')) {
            return {
                code: 'STORAGE_UNAVAILABLE',
                path: defaultPath,
                message: `Lưu trữ không khả dụng: ${message}`,
                recoverable: false,
            };
        }
        if (name === 'VersionError') {
            return {
                code: 'STORAGE_VERSION_UNSUPPORTED',
                path: defaultPath,
                message: `Phiên bản cơ sở dữ liệu không được hỗ trợ (VersionError): ${message}`,
                recoverable: false,
            };
        }
        if (name === 'AbortError') {
            return {
                code: 'STORAGE_CONFLICT',
                path: defaultPath,
                message: 'Giao dịch lưu trữ bị hủy bỏ (aborted transaction)',
                recoverable: true,
            };
        }
        return {
            code: 'STORAGE_CORRUPT',
            path: defaultPath,
            message,
            recoverable: false,
        };
    }
    return {
        code: 'STORAGE_CORRUPT',
        path: defaultPath,
        message: String(err),
        recoverable: false,
    };
}
export class MemoryTransactionAdapter {
    data;
    unavailable = false;
    quotaExceeded = false;
    blocked = false;
    versionError = null;
    executionQueue = Promise.resolve();
    constructor(backingData) {
        if (backingData) {
            this.data = backingData;
            this.initStores();
        }
        else {
            this.data = new Map();
            this.initStores();
        }
    }
    initStores() {
        const stores = ['attempts', 'outbox', 'bank', 'exams', 'imports', 'meta'];
        for (const s of stores) {
            if (!this.data.has(s)) {
                this.data.set(s, new Map());
            }
        }
    }
    getBackingData() {
        return this.data;
    }
    close() {
        // Closes active connection; backing data is preserved for reopening
    }
    setUnavailable(flag) {
        this.unavailable = flag;
    }
    setQuotaExceeded(flag) {
        this.quotaExceeded = flag;
    }
    setBlocked(flag) {
        this.blocked = flag;
    }
    setVersionError(message) {
        this.versionError = message;
    }
    async isAvailable() {
        return !this.unavailable && !this.blocked && !this.versionError;
    }
    async clearAll() {
        if (this.unavailable) {
            const err = new Error('SecurityError: IndexedDB is blocked');
            err.name = 'SecurityError';
            throw err;
        }
        if (this.blocked) {
            const err = new Error('BlockedError: Database is blocked by another version upgrade');
            err.name = 'BlockedError';
            throw err;
        }
        if (this.versionError) {
            const err = new Error(`VersionError: ${this.versionError}`);
            err.name = 'VersionError';
            throw err;
        }
        for (const store of this.data.values()) {
            store.clear();
        }
    }
    async runTransaction(stores, mode, operation) {
        if (this.unavailable) {
            const err = new Error('SecurityError: IndexedDB is blocked or private mode');
            err.name = 'SecurityError';
            throw err;
        }
        if (this.blocked) {
            const err = new Error('BlockedError: Database open or transaction blocked by concurrent version upgrade');
            err.name = 'BlockedError';
            throw err;
        }
        if (this.versionError) {
            const err = new Error(`VersionError: ${this.versionError}`);
            err.name = 'VersionError';
            throw err;
        }
        if (this.quotaExceeded) {
            const err = new Error('QuotaExceededError: Local storage quota exceeded');
            err.name = 'QuotaExceededError';
            throw err;
        }
        return new Promise((resolve, reject) => {
            this.executionQueue = this.executionQueue.then(async () => {
                const staging = new Map();
                for (const s of stores) {
                    staging.set(s, new Map());
                }
                let isAborted = false;
                const tx = {
                    get: async (store, key) => {
                        if (isAborted) {
                            const err = new Error('AbortError: Transaction was aborted');
                            err.name = 'AbortError';
                            throw err;
                        }
                        const stMap = staging.get(store);
                        if (stMap && stMap.has(key)) {
                            const entry = stMap.get(key);
                            return entry.deleted ? null : deepClone(entry.value);
                        }
                        const backing = this.data.get(store);
                        const val = backing?.get(key);
                        return val !== undefined ? deepClone(val) : null;
                    },
                    put: async (store, key, value) => {
                        if (isAborted) {
                            const err = new Error('AbortError: Transaction was aborted');
                            err.name = 'AbortError';
                            throw err;
                        }
                        if (mode !== 'readwrite') {
                            throw new Error('InvalidStateError: Transaction is readonly');
                        }
                        if (this.quotaExceeded) {
                            const err = new Error('QuotaExceededError: Local storage quota exceeded');
                            err.name = 'QuotaExceededError';
                            throw err;
                        }
                        const stMap = staging.get(store);
                        if (!stMap) {
                            throw new Error(`Store ${store} not included in transaction`);
                        }
                        stMap.set(key, { deleted: false, value: deepClone(value) });
                    },
                    delete: async (store, key) => {
                        if (isAborted) {
                            const err = new Error('AbortError: Transaction was aborted');
                            err.name = 'AbortError';
                            throw err;
                        }
                        if (mode !== 'readwrite') {
                            throw new Error('InvalidStateError: Transaction is readonly');
                        }
                        const stMap = staging.get(store);
                        if (!stMap) {
                            throw new Error(`Store ${store} not included in transaction`);
                        }
                        stMap.set(key, { deleted: true, value: undefined });
                    },
                    getAll: async (store) => {
                        if (isAborted) {
                            const err = new Error('AbortError: Transaction was aborted');
                            err.name = 'AbortError';
                            throw err;
                        }
                        const backing = this.data.get(store) ?? new Map();
                        const combined = new Map();
                        for (const [k, v] of backing.entries()) {
                            combined.set(k, deepClone(v));
                        }
                        const stMap = staging.get(store);
                        if (stMap) {
                            for (const [k, entry] of stMap.entries()) {
                                if (entry.deleted) {
                                    combined.delete(k);
                                }
                                else {
                                    combined.set(k, deepClone(entry.value));
                                }
                            }
                        }
                        return Array.from(combined.values());
                    },
                    abort: async () => {
                        isAborted = true;
                        const err = new Error('AbortError: Transaction was aborted by caller');
                        err.name = 'AbortError';
                        throw err;
                    },
                };
                try {
                    const result = await operation(tx);
                    if (isAborted) {
                        const err = new Error('AbortError: Transaction was aborted');
                        err.name = 'AbortError';
                        throw err;
                    }
                    if (mode === 'readwrite') {
                        for (const [storeName, stMap] of staging.entries()) {
                            const backing = this.data.get(storeName);
                            if (backing) {
                                for (const [k, entry] of stMap.entries()) {
                                    if (entry.deleted) {
                                        backing.delete(k);
                                    }
                                    else {
                                        backing.set(k, entry.value);
                                    }
                                }
                            }
                        }
                    }
                    resolve(result);
                }
                catch (opErr) {
                    reject(opErr);
                }
            }).catch(reject);
        });
    }
}
export class IndexedDBTransactionAdapter {
    dbPromise = null;
    dbName = 'cunata-web';
    version = 1;
    async getDB() {
        if (typeof indexedDB === 'undefined') {
            const err = new Error('SecurityError: IndexedDB is not available');
            err.name = 'SecurityError';
            throw err;
        }
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, this.version);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    const stores = ['attempts', 'outbox', 'bank', 'exams', 'imports', 'meta'];
                    for (const s of stores) {
                        if (!db.objectStoreNames.contains(s)) {
                            db.createObjectStore(s);
                        }
                    }
                };
                req.onsuccess = () => {
                    const db = req.result;
                    db.onversionchange = () => {
                        try {
                            db.close();
                        }
                        catch (_) { }
                        this.dbPromise = null;
                    };
                    resolve(db);
                };
                req.onerror = () => {
                    this.dbPromise = null;
                    reject(req.error ?? new Error('Failed to open IndexedDB'));
                };
                req.onblocked = () => {
                    const err = new Error('BlockedError: IndexedDB open request blocked by another connection');
                    err.name = 'BlockedError';
                    reject(err);
                };
            });
        }
        return this.dbPromise;
    }
    close() {
        if (this.dbPromise) {
            this.dbPromise
                .then((db) => {
                try {
                    db.close();
                }
                catch (_) { }
            })
                .catch(() => { });
            this.dbPromise = null;
        }
    }
    async isAvailable() {
        try {
            if (typeof indexedDB === 'undefined')
                return false;
            const db = await this.getDB();
            return !!db;
        }
        catch {
            return false;
        }
    }
    async clearAll() {
        const db = await this.getDB();
        const stores = ['attempts', 'outbox', 'bank', 'exams', 'imports', 'meta'];
        const tx = db.transaction(stores, 'readwrite');
        for (const s of stores) {
            tx.objectStore(s).clear();
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
    async runTransaction(stores, mode, operation) {
        const db = await this.getDB();
        const idbTx = db.transaction(stores, mode);
        let isAborted = false;
        const tx = {
            get: (store, key) => {
                if (isAborted)
                    return Promise.reject(new Error('Transaction aborted'));
                return new Promise((resolve, reject) => {
                    const os = idbTx.objectStore(store);
                    const req = os.get(key);
                    req.onsuccess = () => resolve(req.result !== undefined ? deepClone(req.result) : null);
                    req.onerror = () => reject(req.error);
                });
            },
            put: (store, key, value) => {
                if (isAborted)
                    return Promise.reject(new Error('Transaction aborted'));
                return new Promise((resolve, reject) => {
                    const os = idbTx.objectStore(store);
                    const req = os.put(deepClone(value), key);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            },
            delete: (store, key) => {
                if (isAborted)
                    return Promise.reject(new Error('Transaction aborted'));
                return new Promise((resolve, reject) => {
                    const os = idbTx.objectStore(store);
                    const req = os.delete(key);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            },
            getAll: (store) => {
                if (isAborted)
                    return Promise.reject(new Error('Transaction aborted'));
                return new Promise((resolve, reject) => {
                    const os = idbTx.objectStore(store);
                    const req = os.getAll();
                    req.onsuccess = () => resolve(deepClone(req.result ?? []));
                    req.onerror = () => reject(req.error);
                });
            },
            abort: async () => {
                isAborted = true;
                idbTx.abort();
                const err = new Error('AbortError: Transaction was aborted by caller');
                err.name = 'AbortError';
                throw err;
            },
        };
        return new Promise((resolve, reject) => {
            let opResult;
            let opFinished = false;
            idbTx.oncomplete = () => {
                if (opFinished) {
                    resolve(opResult);
                }
            };
            idbTx.onerror = () => {
                reject(idbTx.error ?? new Error('IDB transaction error'));
            };
            idbTx.onabort = () => {
                reject(idbTx.error ?? new Error('IDB transaction aborted'));
            };
            operation(tx)
                .then((res) => {
                opResult = res;
                opFinished = true;
            })
                .catch((err) => {
                try {
                    idbTx.abort();
                }
                catch {
                    // ignore if already closing/aborted
                }
                reject(err);
            });
        });
    }
}
export function createStoragePort(adapter, broadcastChannel) {
    const notify = createStorageBroadcastNotifier(broadcastChannel);
    return {
        async load(key) {
            try {
                const result = await adapter.runTransaction(['attempts'], 'readonly', async (tx) => {
                    const keyStr = attemptKeyToString(key);
                    const rec = (await tx.get('attempts', keyStr));
                    return rec ? deepClone(rec) : null;
                });
                return { ok: true, value: result };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'load') };
            }
        },
        async create(record) {
            try {
                const res = await adapter.runTransaction(['attempts'], 'readwrite', async (tx) => {
                    const keyStr = attemptKeyToString(record);
                    const existing = (await tx.get('attempts', keyStr));
                    if (existing) {
                        if (existing.phase === 'final') {
                            return {
                                ok: false,
                                error: {
                                    code: 'ATTEMPT_FINALIZED',
                                    path: 'phase',
                                    message: 'Bài làm đã kết thúc, không thể tạo mới đè lên.',
                                    recoverable: false,
                                },
                            };
                        }
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'attemptId',
                                message: 'Lượt thi đã tồn tại trong lưu trữ.',
                                recoverable: false,
                            },
                        };
                    }
                    const toStore = {
                        ...deepClone(record),
                        revision: record.revision || 1,
                        phase: 'draft',
                    };
                    await tx.put('attempts', keyStr, toStore);
                    return { ok: true, value: deepClone(toStore) };
                });
                if (res.ok) {
                    notify('attempt_saved', res.value, res.value.revision, 'draft');
                }
                return res;
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'create') };
            }
        },
        async saveDraft(record, expectedRevision) {
            try {
                const res = await adapter.runTransaction(['attempts'], 'readwrite', async (tx) => {
                    const keyStr = attemptKeyToString(record);
                    const existing = (await tx.get('attempts', keyStr));
                    if (!existing) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'attemptId',
                                message: 'Không tìm thấy lượt thi để lưu nháp.',
                                recoverable: false,
                            },
                        };
                    }
                    if (existing.phase === 'final') {
                        return {
                            ok: false,
                            error: {
                                code: 'ATTEMPT_FINALIZED',
                                path: 'phase',
                                message: 'Lượt thi đã được nộp ở trạng thái cuối, không thể lưu nháp.',
                                recoverable: false,
                            },
                        };
                    }
                    if (existing.revision !== expectedRevision) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Xung đột phiên bản lưu trữ (kỳ vọng ${expectedRevision}, thực tế ${existing.revision})`,
                                recoverable: false,
                            },
                        };
                    }
                    const updated = {
                        ...deepClone(record),
                        revision: expectedRevision + 1,
                        phase: 'draft',
                    };
                    await tx.put('attempts', keyStr, updated);
                    return { ok: true, value: deepClone(updated) };
                });
                if (res.ok) {
                    notify('attempt_saved', res.value, res.value.revision, 'draft');
                }
                return res;
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'saveDraft') };
            }
        },
        async finalize(record, expectedRevision) {
            try {
                const res = await adapter.runTransaction(['attempts', 'outbox'], 'readwrite', async (tx) => {
                    const keyStr = attemptKeyToString(record);
                    const existingAttempt = (await tx.get('attempts', keyStr));
                    // Terminal existing final: existing final always wins!
                    if (existingAttempt && existingAttempt.phase === 'final') {
                        return {
                            ok: true,
                            value: deepClone(existingAttempt),
                        };
                    }
                    // Stale revision check when existing is draft
                    if (existingAttempt && existingAttempt.revision !== expectedRevision) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Xung đột phiên bản lưu trữ khi nộp bài (kỳ vọng ${expectedRevision}, thực tế ${existingAttempt.revision})`,
                                recoverable: false,
                            },
                        };
                    }
                    if (!existingAttempt && expectedRevision > 0) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Không tìm thấy lượt thi với phiên bản kỳ vọng ${expectedRevision}`,
                                recoverable: false,
                            },
                        };
                    }
                    const finalRevision = expectedRevision + 1;
                    const finalRecord = {
                        ...deepClone(record),
                        revision: finalRevision,
                        phase: 'final',
                        submittedAt: record.submittedAt ?? Date.now(),
                    };
                    const payloadHash = computePayloadHash(finalRecord);
                    const outboxRecord = {
                        examId: finalRecord.examId,
                        examVersionId: finalRecord.examVersionId,
                        attemptId: finalRecord.attemptId,
                        state: 'local_saved',
                        finalRevision,
                        payloadHash,
                        endpointId: null,
                        retryCount: 0,
                        nextRetryAt: null,
                        generation: 1,
                        receipt: null,
                        lastError: null,
                    };
                    await tx.put('attempts', keyStr, finalRecord);
                    const existingOutbox = (await tx.get('outbox', keyStr));
                    if (!existingOutbox) {
                        await tx.put('outbox', keyStr, outboxRecord);
                    }
                    return { ok: true, value: deepClone(finalRecord) };
                });
                if (res.ok) {
                    notify('attempt_finalized', res.value, res.value.revision, 'final');
                }
                return res;
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'finalize') };
            }
        },
        async listAttempts(examId, examVersionId) {
            try {
                const records = await adapter.runTransaction(['attempts'], 'readonly', async (tx) => {
                    const all = (await tx.getAll('attempts'));
                    return all
                        .filter((a) => a.examId === examId && a.examVersionId === examVersionId)
                        .sort((a, b) => a.startedAt - b.startedAt)
                        .map((a) => deepClone(a));
                });
                return { ok: true, value: records };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'listAttempts') };
            }
        },
        async getObject(store, id) {
            try {
                const result = await adapter.runTransaction([store], 'readonly', async (tx) => {
                    const env = (await tx.get(store, id));
                    return env ? deepClone(env.value) : null;
                });
                return { ok: true, value: result };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, `getObject:${store}`) };
            }
        },
        async putObject(store, id, value, expectedRevision) {
            try {
                return await adapter.runTransaction([store], 'readwrite', async (tx) => {
                    const existing = (await tx.get(store, id));
                    if (expectedRevision === null) {
                        const nextRev = existing ? existing.revision + 1 : 1;
                        const env = {
                            id,
                            revision: nextRev,
                            value: deepClone(value),
                            updatedAt: Date.now(),
                        };
                        await tx.put(store, id, env);
                        return { ok: true, value: nextRev };
                    }
                    if (!existing) {
                        if (expectedRevision === 0) {
                            const env = {
                                id,
                                revision: 1,
                                value: deepClone(value),
                                updatedAt: Date.now(),
                            };
                            await tx.put(store, id, env);
                            return { ok: true, value: 1 };
                        }
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Đối tượng ${store} không tồn tại (kỳ vọng revision ${expectedRevision})`,
                                recoverable: false,
                            },
                        };
                    }
                    if (existing.revision !== expectedRevision) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Xung đột phiên bản đối tượng ${store} (kỳ vọng ${expectedRevision}, thực tế ${existing.revision})`,
                                recoverable: false,
                            },
                        };
                    }
                    const nextRev = existing.revision + 1;
                    const env = {
                        id,
                        revision: nextRev,
                        value: deepClone(value),
                        updatedAt: Date.now(),
                    };
                    await tx.put(store, id, env);
                    return { ok: true, value: nextRev };
                });
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, `putObject:${store}`) };
            }
        },
        async deleteObject(store, id, expectedRevision) {
            try {
                return await adapter.runTransaction([store], 'readwrite', async (tx) => {
                    const existing = (await tx.get(store, id));
                    if (!existing) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'id',
                                message: `Không tìm thấy đối tượng ${store} để xóa`,
                                recoverable: false,
                            },
                        };
                    }
                    if (existing.revision !== expectedRevision) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'revision',
                                message: `Xung đột phiên bản khi xóa ${store} (kỳ vọng ${expectedRevision}, thực tế ${existing.revision})`,
                                recoverable: false,
                            },
                        };
                    }
                    await tx.delete(store, id);
                    return { ok: true, value: undefined };
                });
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, `deleteObject:${store}`) };
            }
        },
        async getOutbox(key) {
            try {
                const result = await adapter.runTransaction(['outbox'], 'readonly', async (tx) => {
                    const keyStr = attemptKeyToString(key);
                    const rec = (await tx.get('outbox', keyStr));
                    return rec ? deepClone(rec) : null;
                });
                return { ok: true, value: result };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'getOutbox') };
            }
        },
        async updateOutbox(value, expectedGeneration) {
            try {
                const res = await adapter.runTransaction(['outbox'], 'readwrite', async (tx) => {
                    const keyStr = attemptKeyToString(value);
                    const existing = (await tx.get('outbox', keyStr));
                    if (!existing) {
                        if (expectedGeneration === null) {
                            const initial = {
                                ...deepClone(value),
                                generation: 1,
                            };
                            await tx.put('outbox', keyStr, initial);
                            return { ok: true, value: deepClone(initial) };
                        }
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'generation',
                                message: 'Bản ghi outbox không tồn tại.',
                                recoverable: false,
                            },
                        };
                    }
                    if (expectedGeneration !== null && existing.generation !== expectedGeneration) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'generation',
                                message: `Xung đột thế hệ sync outbox (kỳ vọng ${expectedGeneration}, thực tế ${existing.generation})`,
                                recoverable: false,
                            },
                        };
                    }
                    // Terminal state: server_confirmed cannot be downgraded
                    if (existing.state === 'server_confirmed' && value.state !== 'server_confirmed') {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'state',
                                message: 'Trạng thái server_confirmed là trạng thái cuối, không thể ghi đè.',
                                recoverable: false,
                            },
                        };
                    }
                    // If existing is server_confirmed, reject un-versioned updates (require explicit generation CAS)
                    if (existing.state === 'server_confirmed' && expectedGeneration === null) {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CONFLICT',
                                path: 'generation',
                                message: 'Bản ghi outbox ở trạng thái server_confirmed yêu cầu expectedGeneration tường minh để cập nhật.',
                                recoverable: false,
                            },
                        };
                    }
                    // Invariant: updateOutbox only updates sync metadata; immutable final fields are preserved
                    const nextGen = existing.generation + 1;
                    const updated = {
                        ...deepClone(value),
                        payloadHash: existing.payloadHash,
                        finalRevision: existing.finalRevision,
                        generation: nextGen,
                    };
                    await tx.put('outbox', keyStr, updated);
                    return { ok: true, value: deepClone(updated) };
                });
                if (res.ok) {
                    notify('outbox_updated', res.value, res.value.generation);
                }
                return res;
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'updateOutbox') };
            }
        },
        async listOutbox() {
            try {
                const outbox = await adapter.runTransaction(['outbox'], 'readonly', async (tx) => {
                    return (await tx.getAll('outbox')).map(deepClone);
                });
                return { ok: true, value: outbox };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'listOutbox') };
            }
        },
        async exportBackup() {
            try {
                const payload = await adapter.runTransaction(['attempts', 'outbox', 'bank', 'exams', 'imports'], 'readonly', async (tx) => {
                    const attempts = (await tx.getAll('attempts')).map(deepClone);
                    const outbox = (await tx.getAll('outbox')).map(deepClone);
                    const bank = (await tx.getAll('bank')).map(deepClone);
                    const exams = (await tx.getAll('exams')).map(deepClone);
                    const imports = (await tx.getAll('imports')).map(deepClone);
                    const backup = {
                        schemaVersion: 'cunata-backup-v1',
                        exportedAt: new Date().toISOString(),
                        attempts,
                        outbox,
                        bank,
                        exams,
                        imports,
                    };
                    return backup;
                });
                const jsonStr = JSON.stringify(payload, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                return { ok: true, value: blob };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'exportBackup') };
            }
        },
        async importBackup(input) {
            try {
                let parsed = input;
                if (typeof input === 'string') {
                    try {
                        parsed = JSON.parse(input);
                    }
                    catch {
                        return {
                            ok: false,
                            error: {
                                code: 'STORAGE_CORRUPT',
                                path: 'input',
                                message: 'Dữ liệu sao lưu không phải là chuỗi JSON hợp lệ',
                                recoverable: false,
                            },
                        };
                    }
                }
                const valRes = validateBackupPayload(parsed);
                if (!valRes.ok) {
                    return valRes;
                }
                const backup = valRes.value;
                return await adapter.runTransaction(['attempts', 'outbox', 'bank', 'exams', 'imports'], 'readwrite', async (tx) => {
                    if (Array.isArray(backup.attempts)) {
                        for (const a of backup.attempts) {
                            await tx.put('attempts', attemptKeyToString(a), deepClone(a));
                        }
                    }
                    if (Array.isArray(backup.outbox)) {
                        for (const o of backup.outbox) {
                            await tx.put('outbox', attemptKeyToString(o), deepClone(o));
                        }
                    }
                    if (Array.isArray(backup.bank)) {
                        for (const b of backup.bank) {
                            await tx.put('bank', b.id, deepClone(b));
                        }
                    }
                    if (Array.isArray(backup.exams)) {
                        for (const e of backup.exams) {
                            await tx.put('exams', e.id, deepClone(e));
                        }
                    }
                    if (Array.isArray(backup.imports)) {
                        for (const i of backup.imports) {
                            await tx.put('imports', i.id, deepClone(i));
                        }
                    }
                    return { ok: true, value: undefined };
                });
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'importBackup') };
            }
        },
        async clearAll(confirmed) {
            if (!confirmed) {
                return {
                    ok: false,
                    error: {
                        code: 'CONFIRMATION_REQUIRED',
                        path: 'confirmed',
                        message: 'Hành động xóa toàn bộ yêu cầu xác nhận explicit.',
                        recoverable: false,
                    },
                };
            }
            try {
                await adapter.clearAll();
                return { ok: true, value: undefined };
            }
            catch (err) {
                return { ok: false, error: mapStorageError(err, 'clearAll') };
            }
        },
    };
}
export async function openStorage(adapterOrOptions, maybeOptions) {
    let adapter;
    let options;
    if (adapterOrOptions && 'runTransaction' in adapterOrOptions) {
        adapter = adapterOrOptions;
        options = maybeOptions ?? {};
    }
    else if (adapterOrOptions && typeof adapterOrOptions === 'object') {
        options = adapterOrOptions;
        adapter = options.adapter;
    }
    else {
        options = maybeOptions ?? {};
    }
    // Resolve broadcast channel:
    let resolvedBc = null;
    if (options.broadcastChannel &&
        typeof options.broadcastChannel === 'object' &&
        'postMessage' in options.broadcastChannel) {
        resolvedBc = options.broadcastChannel;
    }
    else if (options.broadcastChannel === true ||
        (options.broadcastChannel === undefined &&
            typeof window !== 'undefined' &&
            typeof BroadcastChannel !== 'undefined')) {
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel(options.channelName ?? DEFAULT_STORAGE_BROADCAST_CHANNEL);
                if (typeof bc.unref === 'function') {
                    bc.unref();
                }
                resolvedBc = bc;
            }
        }
        catch {
            resolvedBc = null;
        }
    }
    let port;
    if (adapter) {
        const available = await adapter.isAvailable().catch(() => false);
        if (!available) {
            return {
                ok: false,
                error: {
                    code: 'STORAGE_UNAVAILABLE',
                    path: 'storage',
                    message: 'Lưu trữ không khả dụng',
                    recoverable: false,
                },
            };
        }
        port = createStoragePort(adapter, resolvedBc);
    }
    else {
        // Without injected adapter, default to platform IndexedDB
        if (typeof indexedDB === 'undefined') {
            return {
                ok: false,
                error: {
                    code: 'STORAGE_UNAVAILABLE',
                    path: 'indexedDB',
                    message: 'IndexedDB không khả dụng trong môi trường này (D03 pending / không có IDB runtime)',
                    recoverable: false,
                },
            };
        }
        try {
            const idbAdapter = new IndexedDBTransactionAdapter();
            const available = await idbAdapter.isAvailable();
            if (!available) {
                return {
                    ok: false,
                    error: {
                        code: 'STORAGE_UNAVAILABLE',
                        path: 'indexedDB',
                        message: 'IndexedDB không thể khởi tạo trong môi trường này',
                        recoverable: false,
                    },
                };
            }
            port = createStoragePort(idbAdapter, resolvedBc);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                ok: false,
                error: {
                    code: 'STORAGE_UNAVAILABLE',
                    path: 'indexedDB',
                    message: `Không thể mở lưu trữ IndexedDB: ${message}`,
                    recoverable: false,
                },
            };
        }
    }
    // Wire migration and backup into openStorage ONLY after D03 approval; otherwise leave disabled
    const isD03Approved = options.approveD03 === true || options.approvedD03 === true;
    if (isD03Approved) {
        const ls = options.localStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
        if (ls) {
            if (options.autoBackupOnMigration) {
                try {
                    await port.exportBackup();
                }
                catch {
                    // non-fatal backup before migration
                }
            }
            const migResult = await migrateLegacyStorage({
                storage: port,
                localStorage: ls,
                approvedD03: true,
            });
            if (!migResult.ok && migResult.error.code === 'STORAGE_QUOTA') {
                return {
                    ok: false,
                    error: migResult.error,
                };
            }
        }
    }
    return { ok: true, value: port };
}
