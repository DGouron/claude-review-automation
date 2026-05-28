import type { EmberMessage } from '@/modules/ember-chat/entities/emberMessage/emberMessage.schema.js';

export class EmberMessageFactory {
  static create(overrides: Partial<EmberMessage> = {}): EmberMessage {
    return {
      question: 'Quel projet a le pire score moyen cette semaine ?',
      ...overrides,
    };
  }
}
