/**
 * Client for the optional AI Assist backend (see server/index.js). Only ever called for rows the
 * deterministic classifier already gave up on (Manual Review) -- never a replacement for it, and
 * never trusted blindly: the caller (aiAssistEnrichment.ts) re-validates whatever expression comes
 * back against the same known-field/keyword whitelist used everywhere else before accepting it.
 */

export interface ClassifyTransformationRequest {
  transformation: string;
  knownFields: string[];
  targetField: string;
}

export type ClassifyTransformationResult =
  | { ok: true; expression: string | null }
  | { ok: false; error: string };

export async function checkAiAssistServer(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function classifyTransformationWithAi(
  serverUrl: string,
  request: ClassifyTransformationRequest
): Promise<ClassifyTransformationResult> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/classify-transformation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `Server responded ${res.status}` };
    }

    const body = await res.json();
    if (typeof body.expression === 'string' || body.expression === null) {
      return { ok: true, expression: body.expression };
    }
    return { ok: false, error: 'Unexpected response shape from AI Assist server' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error contacting AI Assist server' };
  }
}
