export type BypassMarkerResult =
  | { kind: 'no-marker' }
  | { kind: 'valid'; reason: string }
  | { kind: 'invalid-missing-reason' };

const MARKER_TOKEN = '/bypass-quality';
const QUOTED_REASON_PATTERN = /\/bypass-quality\s+"([^"]*)"/;

export function parseBypassMarker(commentBody: string): BypassMarkerResult {
  if (!commentBody.includes(MARKER_TOKEN)) {
    return { kind: 'no-marker' };
  }

  const match = commentBody.match(QUOTED_REASON_PATTERN);
  if (!match) {
    return { kind: 'invalid-missing-reason' };
  }

  const reason = match[1].trim();
  if (reason.length === 0) {
    return { kind: 'invalid-missing-reason' };
  }

  return { kind: 'valid', reason };
}
