import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';

export type EnvSource = () => Record<string, string | undefined>;

export class ProcessEnvironmentGateway implements EnvironmentGateway {
  constructor(private readonly readEnv: EnvSource = () => process.env) {}

  hasAnthropicApiKey(): boolean {
    const value = this.readEnv().ANTHROPIC_API_KEY;
    return typeof value === 'string' && value.length > 0;
  }
}
