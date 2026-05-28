import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';
import type { EmberMessage } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';
import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import type {
  EmberSessionRegistry,
  EmberStreamSubscriber,
} from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import { buildEmberSystemPrompt } from '@/modules/ember-chat/services/emberSystemPrompt.js';

export type { EmberStreamSubscriber } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';

export interface AskEmberDependencies {
  registry: EmberSessionRegistry;
  environment: EnvironmentGateway;
  readData: EmberReadDataGateway;
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

  const { readData, projectPath } = dependencies;
  const systemPrompt = buildEmberSystemPrompt({
    reviewScores: await readData.reviewScores(projectPath),
    insights: await readData.insights(projectPath),
    jobHistory: await readData.jobHistory(projectPath),
    worktrees: await readData.worktrees(),
  });

  const result = dependencies.registry.ask({
    question: message.question,
    systemPrompt,
    projectPath,
  });

  if (result.status === 'unavailable') {
    return { status: 'unavailable', reason: result.reason };
  }

  return { status: 'streaming', subscribe: result.subscribe };
}
