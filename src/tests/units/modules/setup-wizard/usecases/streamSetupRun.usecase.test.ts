import { describe, it, expect, beforeEach } from 'vitest';
import { StubSetupProcessGateway } from '@/tests/stubs/setupProcess.stub.js';
import { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';

describe('SetupRunRegistry', () => {
  let registry: SetupRunRegistry;
  let gateway: StubSetupProcessGateway;

  beforeEach(() => {
    gateway = new StubSetupProcessGateway();
    registry = new SetupRunRegistry(gateway);
  });

  it('starts a run and returns a run id', () => {
    const result = registry.start({ projectPath: null });

    expect(result.status).toBe('started');
    if (result.status === 'started') {
      expect(result.runId).toMatch(/.+/);
    }
    expect(gateway.spawnCount).toBe(1);
  });

  it('rejects a second start while a run is already active', () => {
    registry.start({ projectPath: null });

    const second = registry.start({ projectPath: null });

    expect(second.status).toBe('already-active');
    expect(gateway.spawnCount).toBe(1);
  });

  it('allows a new run after the active run exits', () => {
    registry.start({ projectPath: null });
    gateway.exit(0);

    const second = registry.start({ projectPath: null });

    expect(second.status).toBe('started');
    expect(gateway.spawnCount).toBe(2);
  });

  it('forwards stdout lines to subscribed listeners of the active run', () => {
    const started = registry.start({ projectPath: null });
    const received: string[] = [];
    if (started.status === 'started') {
      registry.subscribe(started.runId, {
        onEvent: (line) => received.push(line),
        onClose: () => {},
      });
    }

    gateway.emitLine('{"step":"dependencies","status":"in_progress","message":"x"}');

    expect(received).toEqual(['{"step":"dependencies","status":"in_progress","message":"x"}']);
  });

  it('notifies subscribers when the process exits', () => {
    const started = registry.start({ projectPath: null });
    let closedCode: number | null | undefined;
    if (started.status === 'started') {
      registry.subscribe(started.runId, {
        onEvent: () => {},
        onClose: (code) => {
          closedCode = code;
        },
      });
    }

    gateway.exit(0);

    expect(closedCode).toBe(0);
  });

  it('reports no active run when none has started', () => {
    expect(registry.hasActiveRun()).toBe(false);
  });

  it('reports an active run after start', () => {
    registry.start({ projectPath: null });

    expect(registry.hasActiveRun()).toBe(true);
  });
});
