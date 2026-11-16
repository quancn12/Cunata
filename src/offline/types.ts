/**
 * Cunata Web M2/M6 — Offline & Service Worker Contracts and Types
 * Conforms to WEB-contract.md §3, §6, §9-10 and tasks.json (WEB-W3-OFFLINE).
 */

import type { Result, WebError } from '../schema/types.ts';

export type { Result, WebError };

export const CACHE_VERSION = 'cunata-web-v1';
export const CACHE_NAME_PREFIX = 'cunata-cache-';
export const CACHE_NAME = `${CACHE_NAME_PREFIX}v1`;

export const FILE_PROTOCOL_LIMITATION =
  'Giới hạn giao thức: Service Worker và cơ chế ngoại tuyến không hỗ trợ trên giao thức file:// theo tiêu chuẩn bảo mật của trình duyệt. Vui lòng mở ứng dụng qua máy chủ HTTP cục bộ (http://localhost:8000) hoặc HTTPS.';

export const FIRST_TIME_OFFLINE_LIMITATION =
  'Giới hạn lần đầu: Ứng dụng không thể sẵn sàng ngoại tuyến ở lần truy cập đầu tiên nếu chưa từng kết nối mạng để tải trước tài nguyên (precache). Chỉ hiển thị "sẵn sàng offline" sau khi precache được xác thực hoàn tất.';

export const INSECURE_ORIGIN_LIMITATION =
  'Giới hạn nguồn không an toàn: Service Worker yêu cầu kết nối an toàn (HTTPS) hoặc localhost theo tiêu chuẩn W3C.';

export const COLLECTOR_CACHE_FORBIDDEN_MESSAGE =
  'Quy tắc bảo mật: Tuyệt đối không lưu cache dữ liệu collector, báo cáo riêng tư hoặc snapshot bài thi của thí sinh trong CacheStorage.';

export type OfflineErrorCode =
  | 'OFFLINE_SW_UNSUPPORTED'
  | 'OFFLINE_FILE_PROTOCOL'
  | 'OFFLINE_INSECURE_ORIGIN'
  | 'OFFLINE_FIRST_TIME_UNAVAILABLE'
  | 'OFFLINE_PRECACHE_FAILED'
  | 'OFFLINE_VERIFICATION_FAILED'
  | 'OFFLINE_UPDATE_DEFERRED'
  | 'OFFLINE_STORAGE_QUOTA'
  | 'OFFLINE_CLEAR_UNCONFIRMED';

export type OfflineStatus =
  | 'unsupported'       // SW not supported or file:// protocol
  | 'idle'              // Initial uninitialized state
  | 'registering'       // register() in progress
  | 'installing'        // SW installing and precaching assets
  | 'offline_ready'     // Precache fully verified, ready for cold-start offline
  | 'update_available'  // New version installed & waiting, safe to apply
  | 'update_deferred'   // New version waiting, but deferred due to active exam attempt
  | 'updating'          // skipWaiting requested, waiting for controller change
  | 'error';            // Error in registration, precache or activation

export interface PrecacheManifestItem {
  readonly url: string;
  readonly critical: boolean;
  readonly category: 'shell' | 'style' | 'script' | 'sample' | 'asset';
}

export const DEFAULT_PRECACHE_ENTRIES: readonly PrecacheManifestItem[] = Object.freeze([
  // Shell
  { url: 'index.html', critical: true, category: 'shell' },
  { url: './', critical: true, category: 'shell' },
  // Styles
  { url: 'styles/style.css', critical: true, category: 'style' },
  // Core Samples and Fixtures
  { url: 'public/sample-exam.json', critical: true, category: 'sample' },
  { url: 'public/q01-bbt.svg', critical: true, category: 'asset' },
  { url: 'public/exams/index.json', critical: false, category: 'sample' },
  { url: 'public/exams/toan-full.json', critical: false, category: 'sample' },
  { url: 'public/exams/ly-part-I.json', critical: false, category: 'sample' },
  { url: 'public/exams/hoa-repeating.json', critical: false, category: 'sample' },
  // Application Scripts (emitted under dist/)
  { url: 'app/main.js', critical: false, category: 'script' },
  { url: 'app/routes.js', critical: false, category: 'script' },
  { url: 'app/exam-list.js', critical: false, category: 'script' },
  { url: 'app/authoring.js', critical: false, category: 'script' },
  { url: 'app/legacy.js', critical: false, category: 'script' },
  { url: 'ui/index.js', critical: false, category: 'script' },
  { url: 'student/index.js', critical: false, category: 'script' },
  { url: 'student/view.js', critical: false, category: 'script' },
  { url: 'storage/index.js', critical: false, category: 'script' },
  { url: 'report/index.js', critical: false, category: 'script' },
  { url: 'report/view.js', critical: false, category: 'script' },
  { url: 'teacher/index.js', critical: false, category: 'script' },
  { url: 'teacher/portal.js', critical: false, category: 'script' },
  { url: 'teacher/view.js', critical: false, category: 'script' },
  { url: 'bank/index.js', critical: false, category: 'script' },
  { url: 'bank/view.js', critical: false, category: 'script' },
  { url: 'collect/index.js', critical: false, category: 'script' },
  { url: 'collect/appsScript.js', critical: false, category: 'script' },
  { url: 'schema/index.js', critical: false, category: 'script' },
  { url: 'domain/index.js', critical: false, category: 'script' },
  { url: 'offline/index.js', critical: false, category: 'script' },
]);

export interface ServiceWorkerLifecycleCallbacks {
  readonly onRegistered?: (registration: unknown) => void;
  readonly onOfflineReady?: (verified: boolean) => void;
  readonly onUpdateAvailable?: (activateUpdate: () => Promise<void>) => void;
  readonly onUpdateDeferred?: () => void;
  readonly onStatusChange?: (status: OfflineStatus, detail?: string) => void;
  readonly onError?: (error: WebError) => void;
}

export interface ServiceWorkerManagerConfig {
  readonly swUrl?: string;
  readonly scope?: string;
  readonly autoVerify?: boolean;
  readonly requiredUrls?: readonly string[];
  readonly bypassAttemptLock?: boolean;
}

export interface OfflineVerificationResult {
  readonly ready: boolean;
  readonly cachedCount: number;
  readonly totalRequired: number;
  readonly missingUrls: readonly string[];
  readonly cacheName: string;
}

export interface StorageEstimateResult {
  readonly quota: number;
  readonly usage: number;
  readonly usagePercent: number;
  readonly persistent: boolean;
}

export type ServiceWorkerInboundMessage =
  | { readonly type: 'SKIP_WAITING' }
  | { readonly type: 'CLAIM_CLIENTS' }
  | { readonly type: 'CHECK_OFFLINE_READY'; readonly requiredUrls?: readonly string[]; readonly scopeBase?: string }
  | { readonly type: 'GET_VERSION' }
  | { readonly type: 'SET_ATTEMPT_ACTIVE'; readonly active: boolean }
  | { readonly type: 'PING' };

export type ServiceWorkerOutboundMessage =
  | { readonly type: 'PONG'; readonly version: string }
  | { readonly type: 'VERSION_REPORT'; readonly version: string; readonly cacheName: string }
  | { readonly type: 'OFFLINE_READY_REPORT'; readonly ready: boolean; readonly cachedCount: number; readonly totalCount: number; readonly missingUrls: readonly string[] }
  | { readonly type: 'ATTEMPT_STATUS_ACK'; readonly active: boolean }
  | { readonly type: 'UPDATE_DEFERRED_REPORT'; readonly active: boolean };

/**
 * Normalizes relative URLs under a base scope path (e.g. '/' or '/Cunata/').
 */
export function resolveScopeUrl(scopeBase: string, relativePath: string): string {
  const cleanBase = scopeBase.endsWith('/') ? scopeBase : `${scopeBase}/`;
  const cleanPath = relativePath.startsWith('./')
    ? relativePath.slice(2)
    : relativePath.startsWith('/')
      ? relativePath.slice(1)
      : relativePath;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Checks whether a request URL and method are allowed to be cached in CacheStorage.
 * FORBIDDEN from CacheStorage:
 * - Non-GET methods
 * - Collector endpoints (macros.google.com, script.google.com, /collect, /collector, Apps Script)
 * - Private student reports / downloads / attempts / outbox receipts
 * - Unsupported schemes (chrome-extension:, file:, data:, blob:)
 */
export function isCacheableRequest(requestUrl: string, method = 'GET'): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false;
  }

  const lower = requestUrl.toLowerCase();

  // Exclude unsupported URL schemes
  if (
    lower.startsWith('chrome-extension:') ||
    lower.startsWith('file:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  // Exclude collector endpoints (Google Apps Script, Macros, Collector endpoints)
  if (
    lower.includes('script.google.com') ||
    lower.includes('script.googleusercontent.com') ||
    lower.includes('macros.google.com') ||
    lower.includes('google.com/macros')
  ) {
    return false;
  }

  const cleanPath = (lower.split('?')[0] ?? '').split('#')[0] ?? '';

  // Distinguish static application files from dynamic data/collector endpoints
  const isStaticFile =
    cleanPath.endsWith('.js') ||
    cleanPath.endsWith('.css') ||
    cleanPath.endsWith('.svg') ||
    cleanPath.endsWith('.png') ||
    cleanPath.endsWith('.jpg') ||
    cleanPath.endsWith('.jpeg') ||
    cleanPath.endsWith('.webp') ||
    cleanPath.endsWith('.json') ||
    cleanPath.endsWith('.html') ||
    cleanPath.endsWith('/');

  // If not a static file, reject collector, outbox, receipt, or attempt data paths
  if (!isStaticFile) {
    if (
      lower.includes('/collect') ||
      lower.includes('/collector') ||
      lower.includes('appsscript') ||
      lower.includes('outbox') ||
      lower.includes('receipt')
    ) {
      return false;
    }
  }

  // Always exclude private report downloads, attempt mutations, and snapshot stores
  if (
    lower.includes('/report/download') ||
    lower.includes('exportresults') ||
    lower.includes('cunata:attempt') ||
    lower.includes('cunata:final') ||
    lower.includes('cunata:active') ||
    lower.includes('cunata:snapshot')
  ) {
    return false;
  }

  return true;
}
