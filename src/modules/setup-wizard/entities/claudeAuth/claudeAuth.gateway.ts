export interface ClaudeLoginResult {
  success: boolean;
  error: string | null;
}

export interface ClaudeAuthGateway {
  isLoggedIn(): Promise<boolean>;
  triggerLogin(): Promise<ClaudeLoginResult>;
}
