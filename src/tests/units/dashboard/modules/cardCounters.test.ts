import { describe, expect, it } from 'vitest';
import { computeCardCounters } from '@/dashboard/modules/cardCounters.js';

describe('computeCardCounters', () => {
  describe('overview scope', () => {
    it('should count all running and queued reviews globally', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.running).toBe(2);
      expect(result.queued).toBe(1);
    });

    it('should use reviewFiles length as completed count', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [{}, {}, {}, {}, {}],
        scope: { kind: 'overview' },
      });

      expect(result.completed).toBe(5);
    });

    it('should return the overview marker label', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.markerLabel).toBe('TOUS LES PROJETS');
      expect(result.markerKind).toBe('overview');
    });
  });

  describe('project scope', () => {
    it('should filter running reviews by activeTabId localPath', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/B', status: 'running' },
          { project: '/repo/A', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.running).toBe(1);
      expect(result.queued).toBe(1);
    });

    it('should count multiple queued matches for the active project', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'queued' },
          { project: '/repo/A', status: 'queued' },
          { project: '/repo/B', status: 'queued' },
        ],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.queued).toBe(2);
    });

    it('should use reviewFiles length as completed count for the active project', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [{}, {}],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'A' },
      });

      expect(result.completed).toBe(2);
    });

    it('should return uppercased projectName as marker label', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/A', projectName: 'a' },
      });

      expect(result.markerLabel).toBe('A');
      expect(result.markerKind).toBe('project');
    });

    it('should return zero counts for empty project state', () => {
      const result = computeCardCounters({
        activeReviews: [],
        reviewFiles: [],
        scope: { kind: 'project', localPath: '/repo/empty', projectName: 'empty' },
      });

      expect(result.running).toBe(0);
      expect(result.queued).toBe(0);
      expect(result.completed).toBe(0);
    });
  });

  describe('defensive filtering', () => {
    it('should ignore statuses other than running and queued', () => {
      const result = computeCardCounters({
        activeReviews: [
          { project: '/repo/A', status: 'running' },
          { project: '/repo/A', status: 'cancelled' },
          { project: '/repo/A', status: 'completed' },
        ],
        reviewFiles: [],
        scope: { kind: 'overview' },
      });

      expect(result.running).toBe(1);
      expect(result.queued).toBe(0);
    });
  });
});
