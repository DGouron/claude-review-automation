import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type {
  SetupProcessExitHandler,
  SetupProcessGateway,
  SetupProcessHandle,
  SetupProcessLineHandler,
  SetupProcessSpawnOptions,
} from '@/modules/setup-wizard/entities/setupProcess/setupProcess.gateway.js';

class ChildProcessSetupHandle implements SetupProcessHandle {
  private lineHandler: SetupProcessLineHandler | null = null;
  private exitHandler: SetupProcessExitHandler | null = null;
  private buffer = '';

  constructor(private readonly child: ChildProcessByStdio<null, Readable, Readable>) {
    this.child.stdout.setEncoding('utf-8');
    this.child.stdout.on('data', (chunk: string) => {
      this.consume(chunk);
    });
    this.child.on('close', (code) => {
      this.flush();
      this.exitHandler?.(code);
    });
    this.child.on('error', () => {
      this.exitHandler?.(null);
    });
  }

  get pid(): number | null {
    return this.child.pid ?? null;
  }

  onLine(handler: SetupProcessLineHandler): void {
    this.lineHandler = handler;
  }

  onExit(handler: SetupProcessExitHandler): void {
    this.exitHandler = handler;
  }

  kill(): void {
    this.child.kill();
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.lineHandler?.(line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private flush(): void {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining.length > 0) {
      this.lineHandler?.(remaining);
    }
  }
}

export class SetupProcessChildProcessGateway implements SetupProcessGateway {
  spawn(options?: SetupProcessSpawnOptions): SetupProcessHandle {
    const args = [process.argv[1], 'setup', '--json'];
    const projectPath = options?.projectPath ?? null;
    if (projectPath !== null) {
      args.push(projectPath);
    }

    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    return new ChildProcessSetupHandle(child);
  }
}
