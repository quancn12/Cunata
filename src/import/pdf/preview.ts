/**
 * Native PDF preview and Blob URL lifecycle manager.
 * Conforms to docs/contracts/WEB-contract.md §8 and Shared Product Contract v2.0 §6.
 */

import type { PdfPreviewSession } from "./types.ts";

/**
 * Registry of active preview sessions to prevent memory leaks.
 */
interface ActiveSessionEntry {
  readonly blobUrl: string | null;
  readonly revoke: () => void;
}

const activeSessionRegistry = new Map<string, ActiveSessionEntry>();

let sessionCounter = 0;

/**
 * Checks whether the host environment has a native PDF viewer available.
 * In modern browsers, this inspects `navigator.pdfViewerEnabled`.
 * In headless / Node.js environments, returns false.
 */
export function checkNativePdfViewerSupport(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.pdfViewerEnabled === "boolean") {
    return navigator.pdfViewerEnabled;
  }
  return false;
}

/**
 * Creates a managed PDF preview session with a Blob URL for native `<object>` or `<iframe>` rendering,
 * as well as a link for opening/downloading in a new tab.
 *
 * Automatically registers the Blob URL for lifecycle management and clean revocation.
 */
export function createPdfPreviewSession(
  source: Blob | File | Uint8Array,
  options?: { readonly filename?: string; readonly mimeType?: string }
): PdfPreviewSession {
  sessionCounter++;
  const sessionId = `pdf-session-${Date.now().toString(36)}-${sessionCounter}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const mimeType = options?.mimeType || "application/pdf";
  let blob: Blob;

  if (source instanceof Blob) {
    blob = source;
  } else {
    blob = new Blob([source as BlobPart], { type: mimeType });
  }

  let blobUrl: string | null = null;
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      blobUrl = URL.createObjectURL(blob);
    } catch {
      blobUrl = null;
    }
  }

  let isRevoked = false;

  const revoke = () => {
    if (!isRevoked) {
      isRevoked = true;
      if (blobUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // Ignore revocation errors in unusual environments
        }
      }
      activeSessionRegistry.delete(sessionId);
    }
  };

  const session: PdfPreviewSession = {
    sessionId,
    blobUrl,
    openDownloadUrl: blobUrl,
    hasNativeViewer: checkNativePdfViewerSupport(),
    get isRevoked() {
      return isRevoked;
    },
    revoke,
  };

  activeSessionRegistry.set(sessionId, { blobUrl, revoke });
  return session;
}

/**
 * Revokes a specific preview session by reference.
 */
export function revokePdfPreviewSession(session: PdfPreviewSession): void {
  session.revoke();
}

/**
 * Revokes all currently active PDF preview sessions.
 * Useful on component unmount, navigation, or application shutdown.
 * Returns the count of revoked sessions.
 */
export function revokeAllPdfPreviewSessions(): number {
  const count = activeSessionRegistry.size;
  for (const entry of activeSessionRegistry.values()) {
    entry.revoke();
  }
  activeSessionRegistry.clear();
  return count;
}

/**
 * Returns the current number of active preview sessions in memory.
 */
export function getActivePreviewSessionCount(): number {
  return activeSessionRegistry.size;
}
