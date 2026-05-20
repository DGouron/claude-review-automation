import type { BudgetConfig } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

export interface BudgetGateway {
  load(): Promise<BudgetConfig | null>;
  save(config: BudgetConfig): Promise<void>;
}
