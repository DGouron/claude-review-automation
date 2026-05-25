/**
 * Dashboard module — manage panel humble object (SPEC-177).
 *
 * Pure functions, no global state, no DOM access. Builds a viewmodel and
 * renders HTML for the sidebar manage panel (add form + per-repository rows
 * with delete and enable/disable controls).
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';

/**
 * @typedef {Object} ManagePanelRepositoryInput
 * @property {string} name
 * @property {string} localPath
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ManagePanelBuildInput
 * @property {ManagePanelRepositoryInput[]} repositories
 * @property {boolean} isOpen
 */

/**
 * @typedef {Object} ManagePanelRowViewModel
 * @property {string} name
 * @property {string} localPath
 * @property {string} shortPath
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ManagePanelViewModel
 * @property {ManagePanelRowViewModel[]} rows
 * @property {boolean} isOpen
 */

/**
 * @param {string} localPath
 * @returns {string}
 */
function computeShortPath(localPath) {
  const segments = localPath.split('/').filter(Boolean);
  if (segments.length <= 2) return segments.join('/');
  return segments.slice(-2).join('/');
}

/**
 * @param {ManagePanelBuildInput} input
 * @returns {ManagePanelViewModel}
 */
export function buildManagePanelModel(input) {
  const repositories = Array.isArray(input.repositories) ? input.repositories : [];
  const rows = repositories.map((repository) => ({
    name: repository.name,
    localPath: repository.localPath,
    shortPath: computeShortPath(repository.localPath),
    enabled: repository.enabled !== false,
  }));
  return { rows, isOpen: input.isOpen === true };
}

/**
 * @param {ManagePanelRowViewModel} row
 * @returns {string}
 */
function renderRow(row) {
  const toggleState = row.enabled ? 'is-on' : 'is-off';
  const enabledAttribute = row.enabled ? 'true' : 'false';
  return `<div class="manage-row" data-local-path="${escapeHtml(row.localPath)}" data-enabled="${enabledAttribute}">
  <span class="manage-row-name">${escapeHtml(row.name)}</span>
  <span class="manage-row-path" title="${escapeHtml(row.localPath)}">${escapeHtml(row.shortPath)}</span>
  <button type="button" class="manage-row-toggle ${toggleState}" data-action="toggle" aria-label="Toggle ${escapeHtml(row.name)}"><span class="row-toggle-icon"></span></button>
  <button type="button" class="manage-row-delete" data-action="delete" aria-label="Remove ${escapeHtml(row.name)}">×</button>
</div>`;
}

/**
 * @param {ManagePanelViewModel} viewModel
 * @returns {string}
 */
export function renderManagePanelHtml(viewModel) {
  const rowsHtml = viewModel.rows.map(renderRow).join('');
  const openAttribute = viewModel.isOpen ? 'true' : 'false';
  return `<div class="manage-panel-inner" data-open="${openAttribute}">
  <div class="manage-rows">${rowsHtml}</div>
  <form class="add-form" data-action="add-repository">
    <input type="text" class="add-form-input" name="localPath" placeholder="/absolute/path/to/project" autocomplete="off" spellcheck="false" />
    <button type="submit" class="add-form-submit">Add</button>
  </form>
  <p class="add-form-error" data-role="error-message" hidden></p>
</div>`;
}

/**
 * @param {ManagePanelRepositoryInput} repository
 * @returns {ManagePanelRowViewModel}
 */
export function buildOptimisticAddedRow(repository) {
  return {
    name: repository.name,
    localPath: repository.localPath,
    shortPath: computeShortPath(repository.localPath),
    enabled: repository.enabled !== false,
  };
}

/**
 * @typedef {{ ok: true } | { ok: false, reason: 'empty' | 'relative' }} ValidateLocalPathInputResult
 */

/**
 * @param {string} rawInput
 * @returns {ValidateLocalPathInputResult}
 */
export function validateLocalPathInput(rawInput) {
  const trimmed = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (!trimmed.startsWith('/')) return { ok: false, reason: 'relative' };
  return { ok: true };
}
