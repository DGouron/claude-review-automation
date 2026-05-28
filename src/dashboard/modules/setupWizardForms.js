/**
 * Dashboard module — Setup Wizard interactive forms (SPEC-184, Iteration B2).
 * Humble object: pure functions, no global state, no direct DOM access.
 * Turns a self-describing `awaiting_input` event (kind/options/defaultValue)
 * into the matching form markup and into the exact `POST /api/setup/input`
 * body the SPEC-187 backend parses. The DOM wiring (render/submit/clear) lives
 * in setupWizardStream.js; the styling lives in styles.css.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';

/**
 * @typedef {'text' | 'confirm' | 'choice' | 'multiSelect'} FormKind
 */

/**
 * @typedef {Object} FormOption
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} FormModel
 * @property {string} stepId
 * @property {FormKind} kind
 * @property {string} prompt
 * @property {FormOption[]} options
 * @property {string | null} defaultValue
 */

/**
 * @typedef {Object} TextPayload
 * @property {string} runId
 * @property {'text'} kind
 * @property {string} value
 */

/**
 * @typedef {Object} ConfirmPayload
 * @property {string} runId
 * @property {'confirm'} kind
 * @property {boolean} value
 */

/**
 * @typedef {Object} ChoicePayload
 * @property {string} runId
 * @property {'choice'} kind
 * @property {string} value
 */

/**
 * @typedef {Object} MultiSelectPayload
 * @property {string} runId
 * @property {'multiSelect'} kind
 * @property {string[]} value
 */

/**
 * @typedef {TextPayload | ConfirmPayload | ChoicePayload | MultiSelectPayload} InputPayload
 */

/**
 * @typedef {{ ok: true, body: InputPayload } | { ok: false, error: string }} PayloadResult
 */

const FORM_KINDS = new Set(['text', 'confirm', 'choice', 'multiSelect']);

/**
 * @param {unknown} value
 * @returns {value is FormOption}
 */
function isFormOption(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (/** @type {Record<string, unknown>} */ (value).value) === 'string' &&
    typeof (/** @type {Record<string, unknown>} */ (value).label) === 'string'
  );
}

/**
 * @param {unknown} options
 * @returns {FormOption[]}
 */
function normalizeOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.filter(isFormOption);
}

/**
 * Maps an awaiting_input event into the form view model, or null when the event
 * is absent or not an awaiting_input event.
 *
 * @param {Record<string, unknown> | null} event
 * @returns {FormModel | null}
 */
export function buildFormModel(event) {
  if (event === null || typeof event !== 'object') {
    return null;
  }
  if (event.status !== 'awaiting_input') {
    return null;
  }
  const kind = event.kind;
  if (typeof kind !== 'string' || !FORM_KINDS.has(kind)) {
    return null;
  }
  return {
    stepId: typeof event.step === 'string' ? event.step : '',
    kind: /** @type {FormKind} */ (kind),
    prompt: typeof event.prompt === 'string' ? event.prompt : '',
    options: normalizeOptions(event.options),
    defaultValue: typeof event.defaultValue === 'string' ? event.defaultValue : null,
  };
}

/**
 * @returns {string}
 */
function renderCornerBrackets() {
  return `
      <span class="setup-corner setup-corner--tl" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--tr" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--bl" aria-hidden="true"></span>
      <span class="setup-corner setup-corner--br" aria-hidden="true"></span>`;
}

/**
 * @param {FormModel} model
 * @returns {string}
 */
function renderTextControl(model) {
  const placeholder = model.defaultValue ? ` placeholder="${escapeHtml(model.defaultValue)}"` : '';
  return `
      <input class="setup-form-input" type="text" name="value" autocomplete="off"${placeholder} aria-label="${escapeHtml(model.prompt)}">
      <button class="setup-form-submit btn btn-primary" type="submit">Valider</button>`;
}

/**
 * @returns {string}
 */
function renderConfirmControl() {
  return `
      <button class="setup-form-confirm btn btn-primary" type="button" data-confirm-value="true">Confirmer</button>
      <button class="setup-form-cancel btn btn-secondary" type="button" data-confirm-value="false">Annuler</button>`;
}

/**
 * @param {FormModel} model
 * @returns {string}
 */
function renderChoiceControl(model) {
  const items = model.options
    .map(
      (option) =>
        `<button class="setup-form-choice btn btn-secondary" type="button" data-choice-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`,
    )
    .join('');
  return `<div class="setup-form-choices" role="group">${items}</div>`;
}

/**
 * @param {FormModel} model
 * @returns {string}
 */
function renderMultiSelectControl(model) {
  const items = model.options
    .map(
      (option) =>
        `<label class="setup-form-option"><input class="setup-form-checkbox" type="checkbox" name="value" value="${escapeHtml(option.value)}"> ${escapeHtml(option.label)}</label>`,
    )
    .join('');
  return `
      <div class="setup-form-checkboxes" role="group">${items}</div>
      <button class="setup-form-submit btn btn-primary" type="submit">Valider</button>`;
}

/**
 * @param {FormModel} model
 * @returns {string}
 */
function renderControl(model) {
  if (model.kind === 'text') {
    return renderTextControl(model);
  }
  if (model.kind === 'confirm') {
    return renderConfirmControl();
  }
  if (model.kind === 'choice') {
    return renderChoiceControl(model);
  }
  return renderMultiSelectControl(model);
}

/**
 * Renders the form markup for the active awaiting_input step. The DOM wiring
 * binds submit/click handlers afterwards; the markup here is keyboard-reachable
 * through native inputs and buttons in DOM order.
 *
 * @param {FormModel | null} model
 * @returns {string}
 */
export function renderForm(model) {
  if (model === null) {
    return '';
  }
  const labelPrefix = `// ${model.prompt.toUpperCase()}`;
  return `
    <form class="setup-form" data-step-id="${escapeHtml(model.stepId)}" data-kind="${escapeHtml(model.kind)}">
      ${renderCornerBrackets()}
      <div class="setup-form-label">${escapeHtml(labelPrefix)}</div>
      <div class="setup-form-controls">${renderControl(model)}</div>
      <div class="setup-form-error" role="alert" hidden></div>
    </form>
  `;
}

/**
 * @param {FormOption[]} options
 * @param {string} value
 * @returns {boolean}
 */
function isOffered(options, value) {
  return options.some((option) => option.value === value);
}

/**
 * Builds the exact `{ runId, kind, value }` body the SPEC-187 endpoint accepts,
 * coercing the raw form value to the type the kind requires and rejecting any
 * choice/multiSelect value that was not offered (so junk is never posted).
 *
 * @param {FormKind} kind
 * @param {string} runId
 * @param {unknown} rawValue
 * @param {FormOption[]} options
 * @returns {PayloadResult}
 */
export function buildInputPayload(kind, runId, rawValue, options) {
  if (kind === 'text') {
    if (typeof rawValue !== 'string') {
      return { ok: false, error: 'La valeur du champ texte est invalide' };
    }
    return { ok: true, body: { runId, kind, value: rawValue } };
  }
  if (kind === 'confirm') {
    if (typeof rawValue !== 'boolean') {
      return { ok: false, error: 'La confirmation doit être un booléen' };
    }
    return { ok: true, body: { runId, kind, value: rawValue } };
  }
  if (kind === 'choice') {
    if (typeof rawValue !== 'string' || !isOffered(options, rawValue)) {
      return { ok: false, error: 'Le choix sélectionné ne fait pas partie des options proposées' };
    }
    return { ok: true, body: { runId, kind, value: rawValue } };
  }
  if (!Array.isArray(rawValue) || !rawValue.every((value) => typeof value === 'string')) {
    return { ok: false, error: 'La sélection multiple est invalide' };
  }
  const offered = rawValue.every((value) => isOffered(options, value));
  if (!offered) {
    return {
      ok: false,
      error: 'Une valeur sélectionnée ne fait pas partie des options proposées',
    };
  }
  return { ok: true, body: { runId, kind, value: rawValue } };
}
