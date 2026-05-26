import { describe, it, expect } from 'vitest';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import { InMemoryReviewRequestTrackingGateway } from '../../../stubs/reviewRequestTracking.stub.js';
import { TrackedMrFactory } from '../../../factories/trackedMr.factory.js';

describe('TransitionStateUseCase', () => {
  it('should transition MR to approved state', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('approved');
    expect(updated?.approvedAt).not.toBeNull();
  });

  it('should transition MR to merged state with mergedAt timestamp', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'approved' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
    expect(updated?.mergedAt).not.toBeNull();
    expect(updated?.approvedAt).toBeNull();
  });

  it('should report not-found when MR does not exist', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'nonexistent',
      targetState: 'approved',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-found');
  });

  it('should reject approval transition when quality check fails', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
      qualityCheck: () => ({
        allowed: false,
        reason: 'below-threshold',
        message: 'Seuil qualité non atteint (6/10 < 7/10)',
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'quality-gate') {
      throw new Error('Expected quality-gate rejection');
    }
    expect(result.message).toBe('Seuil qualité non atteint (6/10 < 7/10)');
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('pending-approval');
    expect(updated?.approvedAt).toBeNull();
  });

  it('should allow approval transition when quality check passes', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'pending-approval' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'approved',
      qualityCheck: () => ({ allowed: true }),
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('approved');
  });

  it('should skip quality check for non-approval transitions', () => {
    const gateway = new InMemoryReviewRequestTrackingGateway();
    const mr = TrackedMrFactory.create({ id: 'mr-1', state: 'approved' });
    gateway.create('/project', mr);
    const useCase = new TransitionStateUseCase(gateway);

    const result = useCase.execute({
      projectPath: '/project',
      mrId: 'mr-1',
      targetState: 'merged',
      qualityCheck: () => ({
        allowed: false,
        reason: 'blockers-present',
        message: 'Issues bloquantes non résolues',
      }),
    });

    expect(result.ok).toBe(true);
    const updated = gateway.getById('/project', 'mr-1');
    expect(updated?.state).toBe('merged');
  });
});
