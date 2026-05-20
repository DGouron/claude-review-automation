import type { BudgetStatus } from '@/modules/token-accounting/entities/budget/budgetStatus.js';
import type { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';

export interface EnforceBudgetDependencies {
  getBudgetStatus: GetBudgetStatusUseCase;
}

export interface EnforceBudgetInput {
  localPaths: string[];
  now?: Date;
}

export interface EnforceBudgetDecision {
  accepted: boolean;
  status: BudgetStatus;
}

export class EnforceBudgetUseCase {
  constructor(private readonly deps: EnforceBudgetDependencies) {}

  async execute({ localPaths, now }: EnforceBudgetInput): Promise<EnforceBudgetDecision> {
    const status = await this.deps.getBudgetStatus.execute({ localPaths, now });
    return {
      accepted: !status.exceeded,
      status,
    };
  }
}
