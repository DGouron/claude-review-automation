import {
  DEFAULT_RETRY_SCHEDULE_CONFIG,
  type RetryScheduleConfig,
} from '@/modules/claude-invocation/entities/retrySchedule/retrySchedule.schema.js';

export type RetryDecision =
  | { status: 'retry'; delayMs: number; nextAttempt: number }
  | { status: 'give-up' };

export function planRetry(
  currentAttempt: number,
  config: RetryScheduleConfig = DEFAULT_RETRY_SCHEDULE_CONFIG,
): RetryDecision {
  const nextAttempt = currentAttempt + 1;
  if (nextAttempt > config.maxAttempts) {
    return { status: 'give-up' };
  }
  const exponential = config.initialDelayMs * Math.pow(config.multiplier, currentAttempt);
  const delayMs = Math.min(exponential, config.maxDelayMs);
  return { status: 'retry', delayMs, nextAttempt };
}
