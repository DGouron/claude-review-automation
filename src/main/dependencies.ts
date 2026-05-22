import type { Config } from '../config/loader.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/reviewRequestTracking.gateway.js';
import type { StatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/stats.gateway.js';
import type { ReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewFile.gateway.js';
import type { ReviewLogFileGateway } from '@/modules/data-lifecycle/interface-adapters/gateways/reviewLogFile.gateway.js';
import type { ReviewContextGateway } from '@/modules/review-execution/entities/reviewContext/reviewContext.gateway.js';
import type { InsightsGateway } from '@/modules/statistics-insights/entities/insight/insights.gateway.js';
import { FileSystemReviewRequestTrackingGateway } from '@/modules/tracking/interface-adapters/gateways/fileSystem/reviewRequestTracking.fileSystem.js';
import { FileSystemStatsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/stats.fileSystem.js';
import { FileSystemInsightsGateway } from '@/modules/statistics-insights/interface-adapters/gateways/fileSystem/insights.fileSystem.js';
import { FileSystemReviewFileGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/reviewFile.fileSystem.js';
import { FileSystemReviewLogFileGateway } from '@/modules/data-lifecycle/interface-adapters/gateways/fileSystem/reviewLogFile.fileSystem.gateway.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import { ReviewContextWatcherService } from '@/modules/review-execution/services/reviewContextWatcher.service.js';
import { ReviewContextProgressPresenter } from '@/modules/review-execution/interface-adapters/presenters/reviewContextProgress.presenter.js';
import { ProjectStatsCalculator } from '@/modules/statistics-insights/interface-adapters/presenters/projectStats.calculator.js';
import {
  createDefaultClaudeInvocationDeps,
  type ClaudeInvocationDeps,
} from '@/frameworks/claude/claudeInvoker.js';
import { pino, type Logger, type LoggerOptions } from 'pino';
import { mkdirSync } from 'node:fs';
import { LOG_DIR, LOG_FILE_PATH } from '../shared/services/daemonPaths.js';

export interface Dependencies {
  reviewRequestTrackingGateway: ReviewRequestTrackingGateway;
  statsGateway: StatsGateway;
  reviewFileGateway: ReviewFileGateway;
  reviewLogFileGateway: ReviewLogFileGateway;
  reviewContextGateway: ReviewContextGateway;
  insightsGateway: InsightsGateway;
  reviewContextWatcher: ReviewContextWatcherService;
  progressPresenter: ReviewContextProgressPresenter;
  claudeInvocationDeps: ClaudeInvocationDeps;
  logger: Logger;
  config: Config;
}

function createLoggerOptions(): LoggerOptions {
  const isDaemon = process.env.REVIEWFLOW_DAEMON === '1';

  if (isDaemon) {
    mkdirSync(LOG_DIR, { recursive: true });
    return {
      level: process.env.LOG_LEVEL || 'info',
    };
  }

  return {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  };
}

function createLogger(): Logger {
  const isDaemon = process.env.REVIEWFLOW_DAEMON === '1';
  const options = createLoggerOptions();

  if (isDaemon) {
    return pino(options, pino.destination(LOG_FILE_PATH));
  }

  return pino(options);
}

export function createDependencies(config: Config): Dependencies {
  const logger = createLogger();

  const reviewContextGateway = new ReviewContextFileSystemGateway();

  return {
    reviewRequestTrackingGateway: new FileSystemReviewRequestTrackingGateway(new ProjectStatsCalculator()),
    statsGateway: new FileSystemStatsGateway(),
    reviewFileGateway: new FileSystemReviewFileGateway(),
    reviewLogFileGateway: new FileSystemReviewLogFileGateway(),
    reviewContextGateway,
    insightsGateway: new FileSystemInsightsGateway(),
    reviewContextWatcher: new ReviewContextWatcherService(reviewContextGateway),
    progressPresenter: new ReviewContextProgressPresenter(),
    claudeInvocationDeps: createDefaultClaudeInvocationDeps(),
    logger,
    config,
  };
}
