/**
 * Reads the current GitLab webhook token from the process environment on every
 * call so the secret can be rotated without redeploying or restarting the
 * process: an operator updates GITLAB_WEBHOOK_TOKEN (and the GitLab webhook
 * secret), and the next verification already uses the new value.
 */
export function currentGitlabWebhookToken(): string | null {
  const token = process.env.GITLAB_WEBHOOK_TOKEN;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function __resetGitlabTokenCacheForTests(): void {
  // No cache is kept; the token is read fresh on every call. This hook exists
  // so rotation tests document the no-capture contract explicitly.
}
