/**
 * Error raised by a gateway implementation when an external system call
 * fails in a way that is not a business or application rule violation.
 *
 * Carries optional `extensions` metadata (status code, response body, etc.)
 * for callers that need to react to specific failure modes without coupling
 * to a particular transport.
 *
 * ```ts
 * throw new GatewayError('GitLab API rejected the request', {
 *   status: 403,
 *   endpoint: '/api/v4/projects/...',
 * });
 * ```
 */
export class GatewayError extends Error {
  readonly extensions?: Record<string, unknown>;

  constructor(message: string, extensions?: Record<string, unknown>) {
    super(message);
    this.name = 'GatewayError';
    this.extensions = extensions;
  }
}
