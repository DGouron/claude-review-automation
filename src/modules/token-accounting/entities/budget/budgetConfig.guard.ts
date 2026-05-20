import { createGuard } from '@/shared/foundation/guard.base.js';
import { budgetConfigSchema, type BudgetConfig } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';

export const budgetConfigGuard = createGuard<BudgetConfig>(budgetConfigSchema, 'budgetConfig');
