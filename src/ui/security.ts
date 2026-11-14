/// <reference lib="dom" />

import type { Asset } from './types.ts';

/**
 * Whitelist of safe raster image MIME types.
 * SVG is handled separately and checked for hostile content.
 */
export const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedImageMime = typeof ALLOWED_IMAGE_MIMES[number];

/**
 * Validates whether a MIME type is in the approved raster whitelist.
 */
export function isSafeMimeType(mime: string): boolean {
  if (typeof mime !== 'string') return false;
  const normalized = mime.trim().toLowerCase();
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(normalized);
}

/**
 * Checks if a URL or path is safe for rendering in image src or asset references.
 *
 * Enforces WEB-contract.md §4.1:
 * - Blocks javascript:, vbscript:, data: (unless explicitly safe raster image mime), file:, about:
 * - Blocks external automatic fetch/relationships (http:, https:, //)
 * - Blocks directory traversal (.., %2e%2e)
 * - Allows safe local relative paths (public/..., ./...) and safe base64 data URLs.
 */
export function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Block null bytes and control characters
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return false;
  }

  // Check for safe base64 data URL
  if (/^data:/i.test(trimmed)) {
    // Only allow data:image/(png|jpeg|webp);base64,[valid-base64]
    const dataMatch = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
    return dataMatch !== null;
  }

  // Block dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('about:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  // Block external URLs and protocol-relative URLs (no external fetch/tracking)
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('//') ||
    lower.startsWith('ftp://')
  ) {
    return false;
  }

  // Block directory traversal (raw or URI encoded)
  if (
    trimmed.includes('..') ||
    trimmed.includes('%2e%2e') ||
    trimmed.includes('%2E%2E') ||
    trimmed.includes('\\')
  ) {
    return false;
  }

  // Must be a safe relative path starting with alphanumeric or ./
  // e.g., 'public/q01-bbt.svg', './images/fig1.png', 'assets/image.webp'
  return /^(?:\.\/)?[A-Za-z0-9_\-\/]+(?:\.[A-Za-z0-9]+)?$/.test(trimmed);
}

/**
 * Sanitizes an untrusted URL, returning fallback if deemed unsafe.
 */
export function sanitizeUrl(url: string, fallback = ''): string {
  return isSafeUrl(url) ? url.trim() : fallback;
}

/**
 * Checks if SVG content is safe and free of executable or external vectors.
 *
 * SVG from untrusted / student sources is inert by default.
 * Internal SVGs must not contain scripts, event handlers, foreignObjects or external refs.
 */
export function isSafeSvg(svgText: string): boolean {
  if (typeof svgText !== 'string') return false;
  const content = svgText.trim();
  if (content.length === 0) return false;

  // Reject XML DOCTYPE and ENTITY (XXE / entity expansion vectors)
  if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
    return false;
  }

  // Reject <script> tags
  if (/<script\b/i.test(content)) {
    return false;
  }

  // Reject <foreignObject> (arbitrary HTML embedding)
  if (/<foreignObject\b/i.test(content)) {
    return false;
  }

  // Reject inline event handlers (e.g., onload=, onerror=, onclick=)
  if (/\bon[a-z0-9_]+\s*=/i.test(content)) {
    return false;
  }

  // Reject javascript: URLs in attributes (href, xlink:href, etc.)
  if (/href\s*=\s*["']?\s*javascript:/i.test(content) || /xlink:href\s*=\s*["']?\s*javascript:/i.test(content)) {
    return false;
  }

  // Reject external URL references in attributes (http:, https:, //)
  if (
    /href\s*=\s*["']?\s*(?:https?:)?\/\//i.test(content) ||
    /xlink:href\s*=\s*["']?\s*(?:https?:)?\/\//i.test(content)
  ) {
    return false;
  }

  // Reject external CSS imports / url() in style elements or attributes
  if (/<style\b[^>]*>[\s\S]*?@import[\s\S]*?<\/style>/i.test(content)) {
    return false;
  }
  if (/url\s*\(\s*["']?(?:https?:)?\/\//i.test(content)) {
    return false;
  }

  return true;
}

/**
 * Resolves an asset ID to a safe displayable URL, or null if invalid or unsafe.
 */
export function resolveAssetUrl(
  assetId: string,
  assets?: readonly Asset[]
): string | null {
  if (typeof assetId !== 'string') return null;
  const trimmed = assetId.trim();
  if (trimmed.length === 0) return null;

  // 1. Look up in provided assets dictionary if present
  if (assets && assets.length > 0) {
    const asset = assets.find((a) => a.assetId === trimmed);
    if (asset) {
      if (isSafeMimeType(asset.mime)) {
        if (asset.data.startsWith('data:')) {
          return isSafeUrl(asset.data) ? asset.data : null;
        }
        // Base64 payload without prefix
        const dataUrl = `data:${asset.mime};base64,${asset.data.trim()}`;
        return isSafeUrl(dataUrl) ? dataUrl : null;
      }
      // If asset is SVG, verify content if stored as text/base64
      if (asset.mime === 'image/svg+xml') {
        // Internal checked SVG only
        if (asset.data.startsWith('data:')) {
          return null; // Don't allow unchecked SVG data URLs directly
        }
      }
      return null;
    }
  }

  // 2. Direct relative path reference (e.g. 'public/q01-bbt.svg')
  if (isSafeUrl(trimmed)) {
    return trimmed;
  }

  return null;
}
