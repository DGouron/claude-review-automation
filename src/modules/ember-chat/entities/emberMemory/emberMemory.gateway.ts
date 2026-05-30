import type {
  EmberMemory,
  EmberMemoryTurn,
  EmberRecurringInsight,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';

export interface EmberMemoryGateway {
  load(projectPath: string): Promise<EmberMemory | null>;
  appendTurn(projectPath: string, turn: EmberMemoryTurn): Promise<void>;
  appendInsight(projectPath: string, insight: EmberRecurringInsight): Promise<void>;
  clear(projectPath: string): Promise<void>;
}
