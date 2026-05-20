import type { BudgetGateway } from '@/modules/token-accounting/entities/budget/budget.gateway.js';
import type { BudgetConfig } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

export class StubBudgetGateway implements BudgetGateway {
  private config: BudgetConfig | null = null;
  saveCount = 0;

  async load(): Promise<BudgetConfig | null> {
    return this.config;
  }

  async save(config: BudgetConfig): Promise<void> {
    this.config = { ...config };
    this.saveCount += 1;
  }

  setConfig(config: BudgetConfig | null): void {
    this.config = config === null ? null : { ...config };
  }
}
