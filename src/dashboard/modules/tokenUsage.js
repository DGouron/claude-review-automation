/**
 * Dashboard module — token consumption and cost tile.
 * Humble object: pure functions, no global state, no direct DOM access.
 * Closes the Open Host Service link from Token Accounting to the dashboard
 * identified in docs/ddd/event-storming/token-accounting.md.
 */

/**
 * @typedef {Object} ModelBreakdownItem
 * @property {string} name
 * @property {number} count
 * @property {string} costUsd
 * @property {string} costShare
 */

/**
 * @typedef {Object} TokenUsageSummaryViewModel
 * @property {string} totalCostUsd
 * @property {number} recordCount
 * @property {number} totalTokens
 * @property {boolean} isEmpty
 * @property {ModelBreakdownItem[]} models
 */

/**
 * @param {string | null | undefined} text
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
 * Formats a token count compactly for display.
 *
 * @param {number} count
 * @returns {string}
 */
export function formatTokenCount(count) {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}m`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * @param {ModelBreakdownItem} model
 * @returns {string}
 */
function renderModelRow(model) {
  return `
    <div class="token-usage-model-row">
      <span class="token-usage-model-name">${escapeHtml(model.name)}</span>
      <span class="token-usage-model-count">${model.count}</span>
      <span class="token-usage-model-cost">${escapeHtml(model.costUsd)}</span>
      <span class="token-usage-model-share">${escapeHtml(model.costShare)}</span>
    </div>
  `;
}

/**
 * Renders the token usage tile as an HTML string.
 *
 * @param {TokenUsageSummaryViewModel} viewModel
 * @returns {string}
 */
export function renderTokenUsageTile(viewModel) {
  if (viewModel.isEmpty) {
    return `
      <div class="token-usage-tile token-usage-tile--empty">
        <div class="token-usage-header">Token usage</div>
        <div class="token-usage-empty">No reviews yet — nothing to bill.</div>
      </div>
    `;
  }

  const modelsHtml = viewModel.models.map(renderModelRow).join('');

  return `
    <div class="token-usage-tile">
      <div class="token-usage-header">Token usage</div>
      <div class="token-usage-total">
        <span class="token-usage-cost">${escapeHtml(viewModel.totalCostUsd)}</span>
        <span class="token-usage-meta">${viewModel.recordCount} reviews · ${formatTokenCount(viewModel.totalTokens)} tokens</span>
      </div>
      <div class="token-usage-models">
        ${modelsHtml}
      </div>
    </div>
  `;
}

/**
 * Fetches the token usage summary for a given project.
 *
 * @param {string} projectPath
 * @param {string} [since]  ISO timestamp, optional
 * @param {typeof fetch} [fetchImpl]  injectable for tests
 * @returns {Promise<TokenUsageSummaryViewModel>}
 */
export async function fetchTokenUsageSummary(projectPath, since, fetchImpl = fetch) {
  const params = new URLSearchParams({ projectPath });
  if (since) params.set('since', since);
  const response = await fetchImpl(`/api/token-usage/summary?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Token usage summary request failed: ${response.status}`);
  }
  return response.json();
}
