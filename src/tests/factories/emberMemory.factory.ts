import type {
  EmberMemory,
  EmberMemoryTurn,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';

export class EmberMemoryTurnFactory {
  static create(overrides: Partial<EmberMemoryTurn> = {}): EmberMemoryTurn {
    return {
      question: 'Quel projet régresse le vendredi ?',
      answer: 'Le projet X régresse chaque vendredi.',
      ...overrides,
    };
  }
}

export class EmberMemoryFactory {
  static create(overrides: Partial<EmberMemory> = {}): EmberMemory {
    return {
      turns: [EmberMemoryTurnFactory.create()],
      insights: [],
      ...overrides,
    };
  }
}
