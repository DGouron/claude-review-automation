import { projectConcurrencyCapGuard } from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.guard.js';
import {
  DEFAULT_PROJECT_CONCURRENCY_CAP,
  type ProjectConcurrencyCap,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';

export class ProjectConcurrencyCapFactory {
  static create(value: number = DEFAULT_PROJECT_CONCURRENCY_CAP): ProjectConcurrencyCap {
    return projectConcurrencyCapGuard.parse(value);
  }
}
