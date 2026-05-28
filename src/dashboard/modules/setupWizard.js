/**
 * Dashboard module — Setup Wizard HUD view model (SPEC-184, Iteration A).
 * Humble object: pure functions, no global state, no direct DOM access.
 * Maps the SPEC-183 wizard stream events into the 10-step boot sequence rows
 * and the banner model. Animation choreography lives in styles.css; the stream
 * client wiring lives in setupWizardStream.js.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';

/**
 * @typedef {'dependencies' | 'claude-login' | 'daemon' | 'secrets' | 'add-project'
 *        | 'pipeline' | 'generate-files' | 'register-project' | 'validate' | 'next-actions'} StepId
 */

/**
 * @typedef {'pending' | 'in_progress' | 'succeeded' | 'skipped' | 'blocked'
 *        | 'warning' | 'awaiting_input'} StepRowStatus
 */

/**
 * @typedef {Object} StepRowViewModel
 * @property {StepId} id
 * @property {string} label
 * @property {StepRowStatus} status
 * @property {string | null} message
 * @property {string | null} remediation
 * @property {number} position
 * @property {number} total
 */

/**
 * @typedef {Object} BannerViewModel
 * @property {'instructions' | 'warning' | 'resume' | 'done'} kind
 * @property {string | null} message
 * @property {string[]} lines
 * @property {string | null} resumeAt
 * @property {number | null} position
 * @property {number | null} total
 */

/**
 * The 10 SPEC-183 step ids, in execution order. Kept in sync with
 * entities/stepId/stepId.schema.ts (the backend source of truth).
 * @type {StepId[]}
 */
export const STEP_ROW_IDS = [
  'dependencies',
  'claude-login',
  'daemon',
  'secrets',
  'add-project',
  'pipeline',
  'generate-files',
  'register-project',
  'validate',
  'next-actions',
];

/** @type {Record<StepId, string>} */
const STEP_LABELS = {
  dependencies: 'Dependencies',
  'claude-login': 'Claude login',
  daemon: 'Daemon',
  secrets: 'Secrets',
  'add-project': 'Add project',
  pipeline: 'Pipeline',
  'generate-files': 'Generate files',
  'register-project': 'Register project',
  validate: 'Validate',
  'next-actions': 'Next actions',
};

const BANNER_STEPS = new Set(['instructions', 'warning', 'resume', 'done']);

/**
 * @param {string} step
 * @returns {boolean}
 */
function isStepRowId(step) {
  return STEP_ROW_IDS.includes(step);
}

const ROW_STATUSES = new Set([
  'pending',
  'in_progress',
  'succeeded',
  'skipped',
  'blocked',
  'warning',
  'awaiting_input',
]);

/**
 * @param {Record<string, unknown>} event
 * @returns {StepRowStatus}
 */
function statusFromEvent(event) {
  const status = event.status;
  if (typeof status === 'string' && ROW_STATUSES.has(status)) {
    return status;
  }
  return 'pending';
}

/**
 * @param {Record<string, unknown>} event
 * @returns {string | null}
 */
function messageFromEvent(event) {
  if (event.status === 'awaiting_input') {
    return typeof event.prompt === 'string' ? event.prompt : null;
  }
  return typeof event.message === 'string' ? event.message : null;
}

/**
 * Folds the ordered event stream into the 10 step rows. Banner events are
 * never folded into rows (they drive buildBannerModel instead).
 *
 * @param {Array<Record<string, unknown>>} events
 * @returns {StepRowViewModel[]}
 */
export function buildStepRowsModel(events) {
  const total = STEP_ROW_IDS.length;
  /** @type {StepRowViewModel[]} */
  const rows = STEP_ROW_IDS.map((id, index) => ({
    id,
    label: STEP_LABELS[id],
    status: 'pending',
    message: null,
    remediation: null,
    position: index + 1,
    total,
  }));

  const indexById = new Map(rows.map((row, index) => [row.id, index]));

  for (const event of events) {
    const step = typeof event.step === 'string' ? event.step : '';
    if (!isStepRowId(step)) {
      continue;
    }
    const rowIndex = indexById.get(step);
    if (rowIndex === undefined) {
      continue;
    }
    const row = rows[rowIndex];
    row.status = statusFromEvent(event);
    row.message = messageFromEvent(event);
    row.remediation = typeof event.remediation === 'string' ? event.remediation : null;
  }

  return rows;
}

/**
 * Extracts the banner events (instructions / warning / resume / done) in order.
 *
 * @param {Array<Record<string, unknown>>} events
 * @returns {BannerViewModel[]}
 */
export function buildBannerModel(events) {
  /** @type {BannerViewModel[]} */
  const banners = [];
  for (const event of events) {
    const step = typeof event.step === 'string' ? event.step : '';
    if (!BANNER_STEPS.has(step)) {
      continue;
    }
    banners.push({
      kind: step,
      message: typeof event.message === 'string' ? event.message : null,
      lines: Array.isArray(event.lines) ? event.lines.map((line) => String(line)) : [],
      resumeAt: typeof event.resumeAt === 'string' ? event.resumeAt : null,
      position: typeof event.position === 'number' ? event.position : null,
      total: typeof event.total === 'number' ? event.total : null,
    });
  }
  return banners;
}

/**
 * @param {StepRowStatus} status
 * @returns {string}
 */
export function statusToDotClass(status) {
  const suffix = status.replace(/_/g, '-');
  return `setup-step-dot setup-step-dot--${suffix}`;
}

/**
 * @param {StepRowStatus} status
 * @returns {string}
 */
export function statusToLabel(status) {
  return status.replace(/_/g, ' ').toUpperCase();
}

/**
 * @param {StepRowViewModel} row
 * @returns {string}
 */
export function buildAriaAnnouncement(row) {
  const statusLabel = statusToLabel(row.status).toLowerCase();
  return `Step ${row.position} of ${row.total}, ${statusLabel}: ${row.label}`;
}

/**
 * @param {StepRowViewModel} row
 * @returns {string}
 */
export function renderStepRow(row) {
  const dotClass = statusToDotClass(row.status);
  const labelPrefix = `// ${row.label.toUpperCase()}`;
  const messageMarkup = row.message
    ? `<div class="setup-step-message">${escapeHtml(row.message)}</div>`
    : '';
  const remediationMarkup = row.remediation
    ? `<div class="setup-step-remediation">${escapeHtml(row.remediation)}</div>`
    : '';
  return `
    <li class="setup-step setup-step--${row.status.replace(/_/g, '-')}" data-step-id="${escapeHtml(row.id)}" data-status="${escapeHtml(row.status)}">
      <span class="setup-corner setup-corner--tl" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--tr" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--bl" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--br" aria-hidden="true"></span>
      <span class="${dotClass}" aria-hidden="true"></span>
      <div class="setup-step-body">
        <div class="setup-step-header">
          <span class="setup-step-label">${escapeHtml(labelPrefix)}</span>
          <span class="setup-step-status" data-status="${escapeHtml(row.status)}">${escapeHtml(statusToLabel(row.status))}</span>
        </div>
        ${messageMarkup}
        ${remediationMarkup}
      </div>
    </li>
  `;
}

/**
 * @param {BannerViewModel} banner
 * @returns {string}
 */
export function renderBanner(banner) {
  if (banner.kind === 'resume') {
    const position = banner.position ?? 0;
    const total = banner.total ?? STEP_ROW_IDS.length;
    return `<div class="setup-banner setup-banner--resume" role="status">// REPRISE — Étape ${position}/${total}</div>`;
  }
  if (banner.kind === 'done') {
    return `<div class="setup-banner setup-banner--done" role="status">// SETUP TERMINÉ</div>`;
  }
  if (banner.kind === 'instructions') {
    const items = banner.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
    return `<div class="setup-banner setup-banner--instructions" role="status"><div class="setup-banner-title">// INSTRUCTIONS</div><ul>${items}</ul></div>`;
  }
  return `<div class="setup-banner setup-banner--warning" role="status"><span class="setup-banner-title">// ATTENTION</span> ${escapeHtml(banner.message)}</div>`;
}
