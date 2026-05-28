import type { EmberSessionPhase } from '@/modules/ember-chat/entities/emberSession/emberSession.schema.js';

interface EmberSessionStateProps {
  phase: EmberSessionPhase;
  lastActivityAt: Date | null;
}

export class EmberSessionState {
  private constructor(private readonly props: EmberSessionStateProps) {}

  static idle(): EmberSessionState {
    return new EmberSessionState({ phase: 'idle', lastActivityAt: null });
  }

  get phase(): EmberSessionPhase {
    return this.props.phase;
  }

  needsProcess(): boolean {
    return this.props.phase === 'idle';
  }

  onQuestion(now: Date): EmberSessionState {
    return new EmberSessionState({ phase: 'live', lastActivityAt: now });
  }

  onAnswerDone(now: Date): EmberSessionState {
    return new EmberSessionState({ phase: 'live', lastActivityAt: now });
  }

  onIdleTick(now: Date, timeoutMs: number): EmberSessionState {
    if (this.props.phase === 'idle' || this.props.lastActivityAt === null) {
      return this;
    }
    const inactiveMs = now.getTime() - this.props.lastActivityAt.getTime();
    if (inactiveMs >= timeoutMs) {
      return EmberSessionState.idle();
    }
    return this;
  }
}

export function createIdleEmberSessionState(): EmberSessionState {
  return EmberSessionState.idle();
}
