import type { Logger } from 'pino';

export interface CapturingLogger {
  logger: Logger;
  infoMessages: string[];
  warnMessages: string[];
  errorMessages: string[];
}

function formatArgument(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function recordTo(target: string[]): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    target.push(args.map(formatArgument).join(' '));
  };
}

export function createCapturingLogger(): CapturingLogger {
  const infoMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];

  const logger = {
    info: recordTo(infoMessages),
    warn: recordTo(warnMessages),
    error: recordTo(errorMessages),
    debug: () => {},
    trace: () => {},
    fatal: recordTo(errorMessages),
    child(): Logger {
      return logger as unknown as Logger;
    },
    level: 'silent',
  } as unknown as Logger;

  return { logger, infoMessages, warnMessages, errorMessages };
}
