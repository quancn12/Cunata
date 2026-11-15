import type { AttemptRecord, CollectorPort } from './types.ts';
import { CollectorError, computePayloadHash } from './index.ts';
import { resolveScoreDTO } from './export.ts';
import { ENGINE_VERSION } from '../domain/index.ts';

/**
 * Options for configuring the HTTP collector transport.
 */
export interface HttpTransportOptions {
  /**
   * The destination endpoint URL. Must match an entry in `approvedEndpoints`.
   */
  readonly endpointUrl: string;

  /**
   * Explicit allowlist of owner-approved endpoints.
   * Endpoints not in this list are immediately rejected with COLLECTOR_DISABLED.
   */
  readonly approvedEndpoints: readonly string[];

  /**
   * Injected fetch implementation (defaults to globalThis.fetch).
   */
  readonly fetchFn?: typeof fetch;
}

/**
 * Native HTTP collector transport implementing CollectorPort.
 * Enforces:
 * - Strict destination endpoint allowlist check (no arbitrary or unapproved endpoints).
 * - Rejection of endpoints inherited from exam files (examSnapshot.collectorUrl is never used).
 * - Full AbortSignal support with timeout detection.
 * - Prohibition of 'no-cors' mode (opaque responses fail with COLLECTOR_HTTP).
 * - Verification of redirects (disallows redirection to unapproved hosts).
 * - Differentiation of HTTP 4xx (non-retryable) vs 5xx (retryable).
 */
export class HttpCollectorTransport implements CollectorPort {
  readonly endpointUrl: string;
  private readonly approvedEndpoints: ReadonlySet<string>;
  private readonly fetchFn: typeof fetch;

  constructor(options: HttpTransportOptions) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('HttpTransportOptions must be a non-null object');
    }
    this.endpointUrl = (options.endpointUrl ?? '').trim();
    this.approvedEndpoints = new Set((options.approvedEndpoints ?? []).map(u => u.trim()));
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async send(final: AttemptRecord, signal: AbortSignal): Promise<unknown> {
    // 1. Injected approved endpoint allowlist verification
    if (!this.endpointUrl) {
      throw new CollectorError(
        'COLLECTOR_DISABLED',
        'endpointUrl',
        'Collector endpoint URL is not configured or is empty',
        false
      );
    }

    if (!this.approvedEndpoints.has(this.endpointUrl)) {
      throw new CollectorError(
        'COLLECTOR_DISABLED',
        'endpointUrl',
        `Endpoint '${this.endpointUrl}' is not in the approved endpoint allowlist`,
        false
      );
    }

    // 2. Defense: NEVER inherit or read endpoint from final.examSnapshot!
    // The transport strictly targets this.endpointUrl injected by application configuration.

    // 3. Pre-flight check on AbortSignal
    if (signal.aborted) {
      throw new CollectorError(
        'COLLECTOR_TIMEOUT',
        'signal',
        'Collector dispatch was aborted prior to execution',
        true
      );
    }

    // 4. Construct canonical web-result-v1 payload
    const scoreDTO = resolveScoreDTO(final);
    const payloadHash = computePayloadHash(final);
    const durationSeconds =
      final.submittedAt !== null && typeof final.startedAt === 'number'
        ? Math.max(0, Math.round((final.submittedAt - final.startedAt) / 1000))
        : 0;

    const payload = {
      schemaVersion: 'web-result-v1',
      attemptId: final.attemptId,
      attempt_id: final.attemptId,
      examId: final.examId,
      exam_id: final.examId,
      examVersionId: final.examVersionId,
      exam_version_id: final.examVersionId,
      candidateName: final.candidateName,
      candidate_display: final.candidateName,
      payloadHash,
      payload_hash: payloadHash,
      startedAt: final.startedAt,
      started_at: typeof final.startedAt === 'number' ? new Date(final.startedAt).toISOString() : '',
      submittedAt: final.submittedAt,
      submitted_at: typeof final.submittedAt === 'number' ? new Date(final.submittedAt).toISOString() : '',
      durationSeconds,
      duration_seconds: durationSeconds,
      ruleSetId: (scoreDTO as any)?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1',
      policy_version: (scoreDTO as any)?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1',
      inputPolicyId: (scoreDTO as any)?.inputPolicyId ?? final.examSnapshot?.inputPolicyId ?? 'sa-charset-v1',
      engineVersion: (scoreDTO as any)?.engineVersion ?? ENGINE_VERSION,
      total: (scoreDTO as any)?.total ?? '0',
      total_score: (scoreDTO as any)?.total ?? '0',
      maxTotal: (scoreDTO as any)?.maxTotal ?? '0',
      max_total: (scoreDTO as any)?.maxTotal ?? '0',
      sections: (scoreDTO as any)?.sections ?? {},
      scoreDTO,
      responses: final.responses,
    };

    // 5. Execute fetch with CORS mode and redirect tracking
    let response: Response;
    try {
      response = await this.fetchFn(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal,
        mode: 'cors',
        redirect: 'follow',
      });
    } catch (err: any) {
      if (
        signal.aborted ||
        err?.name === 'AbortError' ||
        err?.code === 'COLLECTOR_TIMEOUT' ||
        err?.message?.includes('COLLECTOR_TIMEOUT') ||
        err?.name === 'TimeoutError'
      ) {
        throw new CollectorError(
          'COLLECTOR_TIMEOUT',
          'transport',
          'Collector network request timed out or was aborted',
          true
        );
      }
      throw new CollectorError(
        'COLLECTOR_NETWORK',
        'transport',
        `Network failure during transport dispatch: ${err?.message || String(err)}`,
        true
      );
    }

    // 6. Check for opaque response (mode: 'no-cors' success is strictly disallowed per contract)
    // In browser environments, no-cors fetch returns response.type === 'opaque' with status 0.
    if (response.type === 'opaque' || response.status === 0) {
      throw new CollectorError(
        'COLLECTOR_HTTP',
        'response',
        'Opaque response received; no-cors success is disallowed and server receipt cannot be verified',
        false,
        0
      );
    }

    // 7. Check for redirects to unapproved domains/endpoints
    if (response.redirected) {
      if (!this.approvedEndpoints.has(response.url)) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'redirect',
          `Redirected to unapproved endpoint: '${response.url}'`,
          false,
          response.status
        );
      }
    }

    // 8. Check HTTP status code
    if (!response.ok) {
      const is4xx = response.status >= 400 && response.status < 500;
      throw new CollectorError(
        'COLLECTOR_HTTP',
        'response',
        `HTTP error ${response.status}: ${response.statusText}`,
        !is4xx,
        response.status
      );
    }

    // 9. Read and parse JSON receipt body
    let rawText: string;
    try {
      rawText = await response.text();
    } catch (err: any) {
      throw new CollectorError(
        'COLLECTOR_NETWORK',
        'response',
        `Failed to read response body: ${err?.message || String(err)}`,
        true
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new CollectorError(
        'RECEIPT_INVALID',
        'response',
        'Server response is not valid JSON',
        false
      );
    }

    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (p.error === 'SERVER_BUSY' || p.status === 503) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          String(p.message || 'Server busy; retry scheduled'),
          true,
          503
        );
      }
      if (p.error === 'SERVER_ERROR' || (typeof p.status === 'number' && p.status >= 500)) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          String(p.message || 'Server error; retry scheduled'),
          true,
          typeof p.status === 'number' ? p.status : 500
        );
      }
      if (p.error === 'PAYLOAD_CONFLICT' || p.status === 409) {
        throw new CollectorError(
          'PAYLOAD_CONFLICT',
          'response',
          String(p.message || 'Payload conflict'),
          false,
          409
        );
      }
      if (p.success === false && typeof p.status === 'number' && p.status >= 400 && p.status < 500) {
        throw new CollectorError(
          'COLLECTOR_HTTP',
          'response',
          String(p.message || 'Client error'),
          false,
          p.status
        );
      }
    }

    return parsed;
  }
}

/**
 * Factory helper for creating an HttpCollectorTransport instance.
 */
export function createHttpTransport(options: HttpTransportOptions): CollectorPort {
  return new HttpCollectorTransport(options);
}
