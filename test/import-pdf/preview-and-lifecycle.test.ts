import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPdfPreviewSession,
  revokePdfPreviewSession,
  revokeAllPdfPreviewSessions,
  getActivePreviewSessionCount,
  checkNativePdfViewerSupport,
} from "../../src/import/pdf/preview.ts";
import { buildSyntheticPdfText } from "./builder.ts";

describe("PDF Preview: Managed Blob URL Lifecycle", () => {
  it("creates a managed preview session with Blob URL and download link", () => {
    revokeAllPdfPreviewSessions();
    const bytes = buildSyntheticPdfText();
    const session = createPdfPreviewSession(bytes, { filename: "test.pdf" });

    assert.equal(typeof session.sessionId, "string");
    assert.equal(session.sessionId.startsWith("pdf-session-"), true);
    assert.equal(typeof session.blobUrl, "string");
    assert.equal(session.blobUrl?.startsWith("blob:"), true);
    assert.equal(session.openDownloadUrl, session.blobUrl);
    assert.equal(session.isRevoked, false);
    assert.equal(getActivePreviewSessionCount(), 1);

    session.revoke();
    assert.equal(session.isRevoked, true);
    assert.equal(getActivePreviewSessionCount(), 0);
  });

  it("supports revoking via session.revoke() directly", () => {
    revokeAllPdfPreviewSessions();
    const bytes = buildSyntheticPdfText();
    const session = createPdfPreviewSession(bytes);

    assert.equal(session.isRevoked, false);
    session.revoke();
    assert.equal(session.isRevoked, true);

    // Repeated call is safe and idempotent
    assert.doesNotThrow(() => session.revoke());
    assert.equal(session.isRevoked, true);
  });

  it("supports revoking via revokePdfPreviewSession helper", () => {
    revokeAllPdfPreviewSessions();
    const bytes = buildSyntheticPdfText();
    const session = createPdfPreviewSession(bytes);

    revokePdfPreviewSession(session);
    assert.equal(session.isRevoked, true);
    assert.equal(getActivePreviewSessionCount(), 0);
  });

  it("tracks multiple concurrent sessions and cleans them up independently", () => {
    revokeAllPdfPreviewSessions();
    const bytes = buildSyntheticPdfText();
    const s1 = createPdfPreviewSession(bytes);
    const s2 = createPdfPreviewSession(bytes);
    const s3 = createPdfPreviewSession(bytes);

    assert.equal(getActivePreviewSessionCount(), 3);

    s2.revoke();
    assert.equal(s1.isRevoked, false);
    assert.equal(s2.isRevoked, true);
    assert.equal(s3.isRevoked, false);
    assert.equal(getActivePreviewSessionCount(), 2);

    const revokedCount = revokeAllPdfPreviewSessions();
    assert.equal(revokedCount, 2);
    assert.equal(s1.isRevoked, true);
    assert.equal(s3.isRevoked, true);
    assert.equal(getActivePreviewSessionCount(), 0);
  });

  it("reports native viewer availability without throwing", () => {
    revokeAllPdfPreviewSessions();
    const hasViewer = checkNativePdfViewerSupport();
    assert.equal(typeof hasViewer, "boolean");

    const bytes = buildSyntheticPdfText();
    const session = createPdfPreviewSession(bytes);
    assert.equal(session.hasNativeViewer, hasViewer);
    session.revoke();
  });
});
