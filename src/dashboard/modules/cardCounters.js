/**
 * @typedef {{ kind: 'overview' } | { kind: 'project', localPath: string, projectName: string }} CardScope
 */

/**
 * @param {object} input
 * @param {Array<{ project: string, status: string }>} input.activeReviews
 * @param {Array<unknown>} input.reviewFiles
 * @param {CardScope} input.scope
 * @returns {{ running: number, queued: number, completed: number, markerLabel: string, markerKind: 'overview'|'project' }}
 */
export function computeCardCounters(input) {
  const { activeReviews, reviewFiles, scope } = input;

  const scoped = scope.kind === 'project'
    ? activeReviews.filter((review) => review.project === scope.localPath)
    : activeReviews;

  const running = scoped.filter((review) => review.status === 'running').length;
  const queued = scoped.filter((review) => review.status === 'queued').length;
  const completed = reviewFiles.length;

  if (scope.kind === 'overview') {
    return {
      running,
      queued,
      completed,
      markerLabel: 'TOUS LES PROJETS',
      markerKind: 'overview',
    };
  }

  return {
    running,
    queued,
    completed,
    markerLabel: scope.projectName.toUpperCase(),
    markerKind: 'project',
  };
}
