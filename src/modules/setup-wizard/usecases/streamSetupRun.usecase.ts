import { randomUUID } from 'node:crypto';
import type {
  SetupProcessGateway,
  SetupProcessHandle,
  SetupProcessSpawnOptions,
} from '@/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.js';

export interface SetupRunSubscriber {
  onEvent: (line: string) => void;
  onClose: (code: number | null) => void;
}

export type StartSetupRunResult =
  | { status: 'started'; runId: string }
  | { status: 'already-active'; runId: string };

interface ActiveRun {
  runId: string;
  handle: SetupProcessHandle;
  bufferedLines: string[];
  subscribers: Set<SetupRunSubscriber>;
  exitCode: number | null;
  exited: boolean;
}

export class SetupRunRegistry {
  private activeRun: ActiveRun | null = null;

  constructor(private readonly processGateway: SetupProcessGateway) {}

  start(options: SetupProcessSpawnOptions): StartSetupRunResult {
    if (this.activeRun !== null && !this.activeRun.exited) {
      return { status: 'already-active', runId: this.activeRun.runId };
    }

    const handle = this.processGateway.spawn(options);
    const run: ActiveRun = {
      runId: randomUUID(),
      handle,
      bufferedLines: [],
      subscribers: new Set(),
      exitCode: null,
      exited: false,
    };
    this.activeRun = run;

    handle.onLine((line) => {
      run.bufferedLines.push(line);
      for (const subscriber of run.subscribers) {
        subscriber.onEvent(line);
      }
    });

    handle.onExit((code) => {
      run.exited = true;
      run.exitCode = code;
      for (const subscriber of run.subscribers) {
        subscriber.onClose(code);
      }
    });

    return { status: 'started', runId: run.runId };
  }

  subscribe(runId: string, subscriber: SetupRunSubscriber): () => void {
    const run = this.activeRun;
    if (run === null || run.runId !== runId) {
      return () => {};
    }

    for (const line of run.bufferedLines) {
      subscriber.onEvent(line);
    }

    if (run.exited) {
      subscriber.onClose(run.exitCode);
      return () => {};
    }

    run.subscribers.add(subscriber);
    return () => {
      run.subscribers.delete(subscriber);
    };
  }

  hasActiveRun(): boolean {
    return this.activeRun !== null && !this.activeRun.exited;
  }
}
