/**
 * @typedef {Object} PendingReviewViewModel
 * @property {string} identifier
 * @property {number} mrNumber
 * @property {string} displayTitle
 * @property {string} projectPath
 * @property {string} mrUrl
 * @property {string} jobTypeLabel
 * @property {string} triggerSourceLabel
 * @property {string} createdAtRelative
 * @property {string} confirmActionUrl
 * @property {string} dismissActionUrl
 */

/**
 * @typedef {Object} PendingReviewsModel
 * @property {PendingReviewViewModel[]} items
 * @property {number} count
 * @property {boolean} isEmpty
 * @property {string} emptyMessage
 */

/**
 * @param {PendingReviewViewModel[]} viewModels
 * @returns {PendingReviewsModel}
 */
export function buildPendingReviewsModel(viewModels) {
  const items = Array.isArray(viewModels) ? viewModels : [];
  return {
    items,
    count: items.length,
    isEmpty: items.length === 0,
    emptyMessage: 'Aucune review en attente de confirmation',
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {PendingReviewViewModel} entry
 * @returns {string}
 */
function renderPendingReviewCard(entry) {
  const identifier = escapeHtmlAttribute(entry.identifier);
  const mrUrl = escapeHtmlAttribute(entry.mrUrl);
  return `
    <div class="pending-review-card" data-pending-id="${identifier}">
      <div class="pending-review-header">
        <span class="pending-review-title"><a href="${mrUrl}" target="_blank" rel="noopener">${escapeHtmlAttribute(entry.displayTitle)}</a></span>
        <span class="pending-review-meta">${escapeHtmlAttribute(entry.jobTypeLabel)} · ${escapeHtmlAttribute(entry.triggerSourceLabel)} · ${escapeHtmlAttribute(entry.createdAtRelative)}</span>
      </div>
      <div class="pending-review-actions">
        <button class="btn-confirm-pending" data-pending-id="${identifier}" type="button">Confirmer</button>
        <button class="btn-dismiss-pending" data-pending-id="${identifier}" type="button">Ignorer</button>
      </div>
    </div>
  `.trim();
}

/**
 * @param {PendingReviewsModel} model
 * @returns {string}
 */
export function renderPendingReviewsHtml(model) {
  if (model.isEmpty) {
    return `<div class="empty-state">${model.emptyMessage}</div>`;
  }
  return model.items.map(renderPendingReviewCard).join('\n');
}
