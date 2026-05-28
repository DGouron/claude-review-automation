import type { SetupInput } from '@/modules/setup-wizard/entities/setupInput/setupInput.schema.js';

export class SetupInputFactory {
  static text(value = '/home/u/api'): SetupInput {
    return { kind: 'text', value };
  }

  static confirm(value = true): SetupInput {
    return { kind: 'confirm', value };
  }

  static choice(value = 'backend'): SetupInput {
    return { kind: 'choice', value };
  }

  static multiSelect(value: string[] = ['solid', 'testing']): SetupInput {
    return { kind: 'multiSelect', value };
  }
}
