import type { BudgetGateway } from '@/modules/token-accounting/entities/budget/budget.gateway.js';
import { budgetConfigGuard } from '@/modules/token-accounting/entities/budget/budgetConfig.guard.js';
import {
  BUDGET_FLOOR_USD,
  BUDGET_CEILING_USD,
} from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

export interface UpdateBudgetDependencies {
  budgetGateway: BudgetGateway;
}

export interface UpdateBudgetInput {
  limitUsd: number;
}

export type UpdateBudgetResult =
  | { success: true; limitUsd: number }
  | { success: false; error: string };

const RANGE_ERROR = `limitUsd must be between ${BUDGET_FLOOR_USD} and ${BUDGET_CEILING_USD}`;

export class UpdateBudgetUseCase {
  constructor(private readonly deps: UpdateBudgetDependencies) {}

  async execute({ limitUsd }: UpdateBudgetInput): Promise<UpdateBudgetResult> {
    const parsed = budgetConfigGuard.safeParse({ limitUsd });
    if (!parsed.success) {
      return { success: false, error: RANGE_ERROR };
    }

    await this.deps.budgetGateway.save(parsed.data);
    return { success: true, limitUsd: parsed.data.limitUsd };
  }
}
