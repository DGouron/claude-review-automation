import type { BudgetConfig } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

export class BudgetConfigFactory {
  static create(overrides?: Partial<BudgetConfig>): BudgetConfig {
    return {
      limitUsd: BUDGET_DEFAULT_USD,
      ...overrides,
    };
  }
}
