/**
 * Dashboard module — multi-project overview humble object (SPEC-91).
 * Pure functions, no global state, no DOM access.
 * All presentation logic lives in OverviewPresenter (server-side TypeScript);
 * this module mirrors the presenter view-model shape and renders it as HTML.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 28;
const SPARKLINE_PADDING = 2;

/**
 * @typedef {Object} OverviewActiveReviewItem
 * @property {string} jobId
 * @property {string} projectName
 * @property {string} projectPath
 * @property {'MR' | 'PR'} mrPrefix
 * @property {number} mrNumber
 * @property {string} mrUrl
 * @property {string} elapsedLabel
 * @property {'review' | 'followup'} jobType
 */

/**
 * @typedef {Object} OverviewActiveReviewsSection
 * @property {OverviewActiveReviewItem[]} items
 * @property {boolean} isEmpty
 * @property {string} emptyMessage
 */

/**
 * @typedef {Object} OverviewProjectCardItem
 * @property {string} projectName
 * @property {string} projectPath
 * @property {'gitlab' | 'github'} platform
 * @property {number} totalReviews
 * @property {string} averageScoreLabel
 * @property {number[]} sparklinePoints
 * @property {boolean} isEmptyHistory
 */

/**
 * @typedef {Object} OverviewProjectCardsSection
 * @property {OverviewProjectCardItem[]} items
 * @property {boolean} isEmpty
 * @property {string} emptyMessage
 */

/**
 * @typedef {Object} OverviewRecentReviewItem
 * @property {string} filename
 * @property {string} projectName
 * @property {'MR' | 'PR'} mrPrefix
 * @property {string} mrNumber
 * @property {string} title
 * @property {string} mtime
 */

/**
 * @typedef {Object} OverviewRecentReviewsFeedSection
 * @property {OverviewRecentReviewItem[]} items
 * @property {boolean} isEmpty
 * @property {string} emptyMessage
 */

/**
 * @typedef {Object} OverviewViewModel
 * @property {OverviewActiveReviewsSection} activeReviews
 * @property {OverviewProjectCardsSection} projectCards
 * @property {OverviewRecentReviewsFeedSection} recentReviewsFeed
 */

/**
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {unknown} payload
 * @returns {OverviewViewModel}
 */
export function buildOverviewModel(payload) {
  const source = payload && typeof payload === 'object' ? /** @type {Record<string, unknown>} */ (payload) : {};
  const activeReviews = sectionWithDefaults(source.activeReviews, 'Aucune review en cours');
  const projectCards = sectionWithDefaults(source.projectCards, 'Aucun projet configuré');
  const recentReviewsFeed = sectionWithDefaults(source.recentReviewsFeed, 'Aucune review récente');
  return {
    activeReviews: /** @type {OverviewActiveReviewsSection} */ (activeReviews),
    projectCards: /** @type {OverviewProjectCardsSection} */ (projectCards),
    recentReviewsFeed: /** @type {OverviewRecentReviewsFeedSection} */ (recentReviewsFeed),
  };
}

/**
 * @param {unknown} section
 * @param {string} emptyMessage
 * @returns {{ items: unknown[]; isEmpty: boolean; emptyMessage: string }}
 */
function sectionWithDefaults(section, emptyMessage) {
  if (!section || typeof section !== 'object') {
    return { items: [], isEmpty: true, emptyMessage };
  }
  const typed = /** @type {Record<string, unknown>} */ (section);
  const items = Array.isArray(typed.items) ? typed.items : [];
  const explicitMessage = typeof typed.emptyMessage === 'string' ? typed.emptyMessage : emptyMessage;
  return {
    items,
    isEmpty: items.length === 0,
    emptyMessage: explicitMessage,
  };
}

/**
 * Renders a vector-only sparkline. Returns '' when there is nothing to draw.
 *
 * @param {number[]} points
 * @returns {string}
 */
export function renderSparklineSvg(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const usableWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2;
  const usableHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2;
  const stepX = points.length === 1 ? 0 : usableWidth / (points.length - 1);
  const coordinates = points
    .map((value, index) => {
      const x = SPARKLINE_PADDING + index * stepX;
      const y = SPARKLINE_PADDING + usableHeight - ((value - min) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg class="overview-sparkline" viewBox="0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${coordinates}" /></svg>`;
}

/**
 * @param {OverviewActiveReviewItem} item
 * @returns {string}
 */
function renderActiveReviewRow(item) {
  return `
    <li class="overview-active-row" data-job-id="${escapeHtml(item.jobId)}">
      <span class="overview-status-dot" data-status="running"></span>
      <span class="overview-active-project">${escapeHtml(item.projectName)}</span>
      <a class="overview-active-mr" href="${escapeHtml(item.mrUrl)}" target="_blank" rel="noopener">${escapeHtml(item.mrPrefix)} #${escapeHtml(item.mrNumber)}</a>
      <span class="overview-active-elapsed">${escapeHtml(item.elapsedLabel)}</span>
    </li>
  `.trim();
}

/**
 * @param {OverviewActiveReviewsSection} section
 * @returns {string}
 */
function renderActiveReviewsSection(section) {
  const body = section.isEmpty
    ? `<div class="overview-empty">${escapeHtml(section.emptyMessage)}</div>`
    : `<ul class="overview-active-list">${section.items.map(renderActiveReviewRow).join('')}</ul>`;
  return `
    <section class="overview-panel" data-section="active">
      <div class="overview-panel-title">// ACTIVE REVIEWS</div>
      ${body}
    </section>
  `.trim();
}

/**
 * @param {OverviewProjectCardItem} card
 * @returns {string}
 */
function renderProjectCard(card) {
  const sparkline = card.sparklinePoints.length === 0 ? '' : renderSparklineSvg(card.sparklinePoints);
  return `
    <button type="button" class="overview-project-card" data-project-path="${escapeHtml(card.projectPath)}">
      <div class="overview-project-card-header">
        <span class="overview-project-card-name">${escapeHtml(card.projectName)}</span>
        <span class="overview-project-card-platform" data-platform="${escapeHtml(card.platform)}">${escapeHtml(card.platform)}</span>
      </div>
      <div class="overview-project-card-totals">
        <span class="overview-project-card-count">${escapeHtml(card.totalReviews)} reviews</span>
        <span class="overview-project-card-score">Score ${escapeHtml(card.averageScoreLabel)}</span>
      </div>
      <div class="overview-project-card-sparkline">${sparkline}</div>
    </button>
  `.trim();
}

/**
 * @param {OverviewProjectCardsSection} section
 * @returns {string}
 */
function renderProjectCardsSection(section) {
  const body = section.isEmpty
    ? `<div class="overview-empty">${escapeHtml(section.emptyMessage)}</div>`
    : `<div class="overview-project-card-grid">${section.items.map(renderProjectCard).join('')}</div>`;
  return `
    <section class="overview-panel" data-section="projects">
      <div class="overview-panel-title">// PROJECTS</div>
      ${body}
    </section>
  `.trim();
}

/**
 * @param {OverviewRecentReviewItem} item
 * @returns {string}
 */
function renderRecentReviewRow(item) {
  return `
    <li class="overview-recent-row" data-filename="${escapeHtml(item.filename)}">
      <span class="overview-recent-project">${escapeHtml(item.projectName)}</span>
      <span class="overview-recent-mr">${escapeHtml(item.mrPrefix)} #${escapeHtml(item.mrNumber)}</span>
      <span class="overview-recent-title">${escapeHtml(item.title)}</span>
    </li>
  `.trim();
}

/**
 * @param {OverviewRecentReviewsFeedSection} section
 * @returns {string}
 */
function renderRecentReviewsSection(section) {
  const body = section.isEmpty
    ? `<div class="overview-empty">${escapeHtml(section.emptyMessage)}</div>`
    : `<ul class="overview-recent-list">${section.items.map(renderRecentReviewRow).join('')}</ul>`;
  return `
    <section class="overview-panel" data-section="recent">
      <div class="overview-panel-title">// RECENT REVIEWS</div>
      ${body}
    </section>
  `.trim();
}

/**
 * @param {OverviewViewModel} viewModel
 * @returns {string}
 */
export function renderOverviewHtml(viewModel) {
  return `
    <div class="overview-grid">
      ${renderActiveReviewsSection(viewModel.activeReviews)}
      ${renderProjectCardsSection(viewModel.projectCards)}
      ${renderRecentReviewsSection(viewModel.recentReviewsFeed)}
    </div>
  `.trim();
}
