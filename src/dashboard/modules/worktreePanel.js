/**
 * Dashboard module — worktree pool panel (SPEC-173).
 * Humble object: pure functions, no global state, no direct DOM access here.
 * Animation choreography lives in the consumer (index.html) and styles.css.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

/**
 * @typedef {'active' | 'idle' | 'stale'} WorktreeRowStatus
 */

/**
 * @typedef {Object} WorktreeRowViewModel
 * @property {number} mrNumber
 * @property {string} path
 * @property {string} mtime
 * @property {number} ageSeconds
 * @property {number | null} sizeBytes
 * @property {WorktreeRowStatus} status
 */

/**
 * @typedef {Object} WorktreeGroupViewModel
 * @property {'gitlab' | 'github'} platform
 * @property {string} projectPath
 * @property {WorktreeRowViewModel[]} worktrees
 */

/**
 * @typedef {Object} LastSweepViewModel
 * @property {string} ranAt
 * @property {number} removed
 * @property {number} failures
 * @property {number} scanned
 */

/**
 * @typedef {Object} WorktreePanelViewModel
 * @property {number} totalCount
 * @property {number} totalSizeBytes
 * @property {string} nextSweepAt
 * @property {LastSweepViewModel | null} lastSweep
 * @property {WorktreeGroupViewModel[]} groups
 */

/**
 * @typedef {{ status: 'ok'; payload: { ranAt: string; removed: number; failures: number; scanned: number } }
 *        | { status: 'conflict'; startedAt: string }
 *        | { status: 'error'; reason?: string }} ManualSweepResult
 */

/**
 * @param {string | number | null | undefined} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {number | null} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * @param {number} ageSeconds
 * @returns {string}
 */
export function formatRelativeAge(ageSeconds) {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * @param {string} mtime
 * @returns {string}
 */
function formatMtime(mtime) {
  const date = new Date(mtime);
  if (Number.isNaN(date.getTime())) return mtime;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}

/**
 * @param {string} path
 * @returns {string}
 */
function truncatePathMiddle(path) {
  if (path.length <= 48) return path;
  return `${path.slice(0, 24)}…${path.slice(-20)}`;
}

/**
 * @param {WorktreeRowStatus} status
 * @returns {string}
 */
export function renderWorktreeStatusBadge(status) {
  if (status === 'active') {
    return '<span class="worktree-status worktree-status-active" data-status="active"><span class="worktree-status-glyph">●</span><span class="worktree-status-label">ACTIVE</span></span>';
  }
  if (status === 'idle') {
    return '<span class="worktree-status worktree-status-idle" data-status="idle"><span class="worktree-status-glyph">○</span><span class="worktree-status-label">IDLE</span></span>';
  }
  return '<span class="worktree-status worktree-status-stale" data-status="stale"><span class="worktree-status-glyph">◆</span><span class="worktree-status-label">STALE</span></span>';
}

/**
 * @returns {string}
 */
export function renderWorktreeEmptyState() {
  return `
    <div class="worktree-empty">
      <svg class="worktree-empty-illustration" viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <path d="M60 102 V62" />
          <path d="M60 62 L36 42" />
          <path d="M60 62 L84 42" />
          <path d="M36 42 L26 26" />
          <path d="M36 42 L48 26" />
          <path d="M84 42 L72 26" />
          <path d="M84 42 L94 26" />
          <circle cx="26" cy="26" r="3" />
          <circle cx="48" cy="26" r="3" />
          <circle cx="72" cy="26" r="3" />
          <circle cx="94" cy="26" r="3" class="worktree-empty-leaf" />
          <rect x="50" y="100" width="20" height="6" rx="0" />
        </g>
      </svg>
      <div class="worktree-empty-title">// POOL EMPTY</div>
      <div class="worktree-empty-subtitle">No worktree on disk. The next scheduled review will materialize one.</div>
    </div>
  `;
}

/**
 * @param {WorktreeRowViewModel} row
 * @param {string} projectPath
 * @returns {string}
 */
function renderRow(row, projectPath) {
  const escapedPath = escapeHtml(row.path);
  const truncatedPath = escapeHtml(truncatePathMiddle(row.path));
  const truncatedProjectPath =
    projectPath.length > 28 ? `${projectPath.slice(0, 24)}…` : projectPath;
  return `
    <tr class="worktree-row" data-status="${escapeHtml(row.status)}">
      <td class="worktree-cell worktree-cell-status">${renderWorktreeStatusBadge(row.status)}</td>
      <td class="worktree-cell worktree-cell-identity">
        <span class="worktree-project" title="${escapeHtml(projectPath)}">${escapeHtml(truncatedProjectPath)}</span>
        <span class="worktree-mr">#${escapeHtml(row.mrNumber)}</span>
      </td>
      <td class="worktree-cell worktree-cell-path"><span title="${escapedPath}">${truncatedPath}</span></td>
      <td class="worktree-cell worktree-cell-age">${escapeHtml(formatRelativeAge(row.ageSeconds))}</td>
      <td class="worktree-cell worktree-cell-size">${escapeHtml(formatBytes(row.sizeBytes))}</td>
      <td class="worktree-cell worktree-cell-mtime">${escapeHtml(formatMtime(row.mtime))}</td>
    </tr>
  `;
}

/**
 * @param {WorktreeGroupViewModel} group
 * @returns {string}
 */
function renderGroupRows(group) {
  return group.worktrees.map((row) => renderRow(row, `${group.platform} · ${group.projectPath}`)).join('');
}

/**
 * @param {WorktreePanelViewModel} viewModel
 * @returns {number}
 */
function countByStatus(viewModel, status) {
  let count = 0;
  for (const group of viewModel.groups) {
    for (const row of group.worktrees) {
      if (row.status === status) count += 1;
    }
  }
  return count;
}

/**
 * @param {LastSweepViewModel | null} lastSweep
 * @returns {string}
 */
function renderLastSweep(lastSweep) {
  if (lastSweep === null) {
    return '<span class="worktree-lastsweep-value">never</span>';
  }
  const ranAt = formatMtime(lastSweep.ranAt);
  return `<span class="worktree-lastsweep-value">${escapeHtml(ranAt)} UTC · removed ${escapeHtml(lastSweep.removed)} · failures ${escapeHtml(lastSweep.failures)} · scanned ${escapeHtml(lastSweep.scanned)}</span>`;
}

/**
 * @param {string} nextSweepAt
 * @returns {string}
 */
function renderNextSweep(nextSweepAt) {
  const date = new Date(nextSweepAt);
  if (Number.isNaN(date.getTime())) return escapeHtml(nextSweepAt);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'imminent';
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `in ${minutes}m`;
  const pad = (value) => String(value).padStart(2, '0');
  return `in ${hours}h ${pad(minutes)}m`;
}

/**
 * @param {WorktreePanelViewModel} viewModel
 * @returns {string}
 */
export function renderWorktreeSection(viewModel) {
  const isEmpty = viewModel.totalCount === 0;
  const runningCount = countByStatus(viewModel, 'active');
  const idleCount = countByStatus(viewModel, 'idle');
  const staleCount = countByStatus(viewModel, 'stale');

  const body = isEmpty
    ? renderWorktreeEmptyState()
    : `
      <div class="worktree-metrics">
        <div class="worktree-metric"><div class="worktree-metric-label">TOTAL</div><div class="worktree-metric-value" data-metric="total">${escapeHtml(viewModel.totalCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">ACTIVE</div><div class="worktree-metric-value" data-metric="active">${escapeHtml(runningCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">IDLE</div><div class="worktree-metric-value" data-metric="idle">${escapeHtml(idleCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">STALE</div><div class="worktree-metric-value" data-metric="stale">${escapeHtml(staleCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">TOTAL SIZE</div><div class="worktree-metric-value" data-metric="size">${escapeHtml(formatBytes(viewModel.totalSizeBytes))}</div></div>
      </div>
      <div class="worktree-table-wrapper">
        <table class="worktree-table">
          <thead>
            <tr>
              <th class="worktree-th">STATUS</th>
              <th class="worktree-th">PLATFORM · MR</th>
              <th class="worktree-th">PATH</th>
              <th class="worktree-th">AGE</th>
              <th class="worktree-th">SIZE</th>
              <th class="worktree-th">MTIME</th>
            </tr>
          </thead>
          <tbody>
            ${viewModel.groups.map(renderGroupRows).join('')}
          </tbody>
        </table>
      </div>
    `;

  return `
    <div class="worktree-panel" data-empty="${isEmpty ? 'true' : 'false'}">
      <div class="worktree-panel-header">
        <span class="worktree-panel-title">// WORKTREE POOL · ${escapeHtml(viewModel.totalCount)}</span>
        <button class="worktree-sweep-button" data-action="sweep" type="button">
          <svg class="worktree-sweep-broom" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M14 4 L20 10" />
              <path d="M13 5 L4 14 L10 20 L19 11" />
              <path d="M4 14 L2 18" />
              <path d="M6 16 L4 20" />
              <path d="M8 18 L6 22" />
            </g>
          </svg>
          <span class="worktree-sweep-label">SWEEP NOW</span>
        </button>
      </div>
      <div class="worktree-panel-body">${body}</div>
      <div class="worktree-panel-footer">
        <div class="worktree-footer-block">
          <span class="worktree-footer-label">// LAST SWEEP</span>
          ${renderLastSweep(viewModel.lastSweep)}
        </div>
        <div class="worktree-footer-block worktree-footer-next">
          <span class="worktree-footer-label">// NEXT SWEEP</span>
          <span class="worktree-nextsweep-value">${escapeHtml(renderNextSweep(viewModel.nextSweepAt))}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<WorktreePanelViewModel>}
 */
export async function fetchWorktreeOverview(fetchImpl = fetch) {
  const response = await fetchImpl('/api/worktrees');
  if (!response.ok) {
    throw new Error(`Worktree overview request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<ManualSweepResult>}
 */
export async function triggerManualSweep(fetchImpl = fetch) {
  const response = await fetchImpl('/api/worktrees/sweep', { method: 'POST' });
  if (response.ok) {
    const payload = await response.json();
    return { status: 'ok', payload };
  }
  if (response.status === 409) {
    const body = await response.json();
    return { status: 'conflict', startedAt: body.startedAt };
  }
  const body = await response.json().catch(() => ({}));
  return { status: 'error', reason: body.error };
}
