import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';

export class StubEnvironmentGateway implements EnvironmentGateway {
  private hasKey = false;

  setHasAnthropicApiKey(value: boolean): void {
    this.hasKey = value;
  }

  hasAnthropicApiKey(): boolean {
    return this.hasKey;
  }
}
