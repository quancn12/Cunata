// Self-contained Node builtin bridge for dist/api
const _get = (m) => (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') ? process.getBuiltinModule(m) : undefined;
const _crypto = _get('node:crypto');
const _fs = _get('node:fs');
const _path = _get('node:path');
const _url = _get('node:url');

export const scryptSync = _crypto?.scryptSync;
export const randomBytes = _crypto?.randomBytes;
export const createHash = _crypto?.createHash;
export const timingSafeEqual = _crypto?.timingSafeEqual;
export const randomUUID = _crypto?.randomUUID;

export const fs = _fs;
export const path = _path;
export const fileURLToPath = _url?.fileURLToPath;
export const pathToFileURL = _url?.pathToFileURL;

export default {
  crypto: _crypto,
  fs: _fs,
  path: _path,
  url: _url,
  scryptSync,
  randomBytes,
  createHash,
  timingSafeEqual,
  randomUUID,
  fileURLToPath,
  pathToFileURL,
};
