import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { EmberMessage } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';
import type {
  EmberSessionRegistry,
  EmberStreamSubscriber,
} from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';

export type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';

export interface AskEmberDependencies {
  registry: EmberSessionRegistry;
  environment: EnvironmentGateway;
  projectPath: string;
  now: () => Date;
}

export type AskEmberResult =
  | { status: 'streaming'; subscribe: (subscriber: EmberStreamSubscriber) => void }
  | { status: 'unavailable'; reason: string }
  | { status: 'billing-regression-prevented' };

export async function askEmber(
  message: EmberMessage,
  dependencies: AskEmberDependencies,
): Promise<AskEmberResult> {
  if (dependencies.environment.hasAnthropicApiKey()) {
    return { status: 'billing-regression-prevented' };
  }

  const result = dependencies.registry.ask({
    question: message.question,
    systemPrompt: buildEmberSystemPrompt(),
    projectPath: dependencies.projectPath,
  });

  if (result.status === 'unavailable') {
    return { status: 'unavailable', reason: result.reason };
  }

  return { status: 'streaming', subscribe: result.subscribe };
}
