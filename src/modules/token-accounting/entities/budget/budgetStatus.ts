export type BudgetStatus = {
  limitUsd: number;
  consumedUsd: number;
  remainingUsd: number;
  percentUsed: number;
  exceeded: boolean;
  periodStart: string;
};
