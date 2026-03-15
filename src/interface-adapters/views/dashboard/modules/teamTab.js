import { escapeHtml } from './html.js';
import { icon } from './icons.js';

const CATEGORY_KEYS = ['quality', 'responsiveness', 'codeVolume', 'iteration'];

/**
 * @param {number} level
 * @returns {string}
 */
function getStatBarColorClass(level) {
  if (level <= 3) return 'stat-bar-danger';
  if (level <= 6) return 'stat-bar-warning';
  if (level <= 8) return 'stat-bar-focus';
  return 'stat-bar-success';
}

/**
 * @param {number} level
 * @returns {string}
 */
function getAvatarBorderClass(level) {
  if (level <= 3) return 'dev-avatar-danger';
  if (level <= 6) return 'dev-avatar-warning';
  if (level <= 8) return 'dev-avatar-focus';
  return 'dev-avatar-success';
}

/**
 * @param {string} trend
 * @returns {string}
 */
function getTrendClass(trend) {
  if (trend === 'improving') return 'trend-improving';
  if (trend === 'declining') return 'trend-declining';
  return 'trend-stable';
}

/**
 * @param {string} trend
 * @returns {string}
 */
function getTrendIcon(trend) {
  if (trend === 'improving') return icon('trending-up', 'trend-icon');
  if (trend === 'declining') return icon('trending-down', 'trend-icon');
  return icon('minus', 'trend-icon');
}

/**
 * @param {object} categoryLevel
 * @param {string} categoryKey
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderStatBar(categoryLevel, categoryKey, translate) {
  const level = categoryLevel.level;
  const trend = categoryLevel.trend;
  const widthPercent = (level / 10) * 100;
  const colorClass = getStatBarColorClass(level);
  const trendClass = getTrendClass(trend);

  return `
    <div class="stat-bar-container">
      <span class="stat-bar-label">${translate('category.' + categoryKey)}</span>
      <div class="stat-bar">
        <div class="stat-bar-fill ${colorClass}" style="width: 0%" data-target-width="${widthPercent}%">
          <span class="stat-bar-level">${level}</span>
        </div>
      </div>
      <span class="trend-indicator ${trendClass}" title="${translate('trend.' + trend)}">${getTrendIcon(trend)}</span>
    </div>
  `;
}

/**
 * @param {object} developer
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderDeveloperCard(developer, translate) {
  const initial = developer.developerName.charAt(0).toUpperCase();
  const avatarBorderClass = getAvatarBorderClass(developer.overallLevel);
  const encodedName = encodeURIComponent(developer.developerName);

  const statBarsHtml = CATEGORY_KEYS.map(
    (key) => renderStatBar(developer.categoryLevels[key], key, translate)
  ).join('');

  return `
    <div class="dev-card" onclick="openDevSheet('${encodedName}')" role="button" tabindex="0">
      <div class="dev-card-header">
        <div class="dev-avatar-placeholder ${avatarBorderClass}">${escapeHtml(initial)}</div>
        <div class="dev-card-identity">
          <div class="dev-name">${escapeHtml(developer.developerName)}</div>
          <div class="dev-title">${translate('title.' + developer.title)}</div>
        </div>
        <div class="dev-overall-level">${developer.overallLevel}</div>
      </div>
      <div class="dev-card-stats">
        ${statBarsHtml}
      </div>
      <div class="dev-card-footer">
        <span class="dev-review-count">${icon('file-search', 'dev-count-icon')} ${translate('team.reviews', { count: developer.reviewCount })}</span>
      </div>
    </div>
  `;
}

/**
 * @param {object} team
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderTeamInsights(team, translate) {
  const strengthTags = team.strengths.map(
    (category) => `<span class="insight-tag insight-strength">${icon('thumbs-up', 'insight-icon')} ${translate('category.' + category)}</span>`
  ).join('');

  const weaknessTags = team.weaknesses.map(
    (category) => `<span class="insight-tag insight-weakness">${icon('alert-triangle', 'insight-icon')} ${translate('category.' + category)}</span>`
  ).join('');

  const tipsList = team.tips.map(
    (tip) => `<li class="insight-tip-item">${icon('lightbulb', 'insight-icon')} ${escapeHtml(tip)}</li>`
  ).join('');

  return `
    <div class="team-insights">
      <div class="team-insight-group">
        <div class="team-insight-section">
          <div class="team-insight-label">${icon('thumbs-up')} ${translate('team.strengths')}</div>
          <div class="team-insight-tags">${strengthTags || '<span class="team-insight-empty">-</span>'}</div>
        </div>
        <div class="team-insight-section">
          <div class="team-insight-label">${icon('alert-triangle')} ${translate('team.weaknesses')}</div>
          <div class="team-insight-tags">${weaknessTags || '<span class="team-insight-empty">-</span>'}</div>
        </div>
      </div>
      ${team.tips.length > 0 ? `
        <div class="team-insight-tips">
          <div class="team-insight-label">${icon('lightbulb')} ${translate('team.tips')}</div>
          <ul class="insight-tips-list">${tipsList}</ul>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * @param {object} insightsData
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
export function renderTeamTab(insightsData, translate) {
  if (insightsData.isEmpty) {
    return `<div class="empty-state">${icon('users')} ${translate('team.noData')}</div>`;
  }

  const teamInsightsHtml = renderTeamInsights(insightsData.team, translate);

  const developerCardsHtml = insightsData.developers.map(
    (developer) => renderDeveloperCard(developer, translate)
  ).join('');

  return `
    ${teamInsightsHtml}
    <div class="team-grid">
      ${developerCardsHtml}
    </div>
  `;
}

/**
 * @param {string} projectPath
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @param {string} apiUrl
 */
export async function fetchAndRenderTeamTab(projectPath, translate, apiUrl) {
  const container = document.getElementById('team-tab-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-state team-loading">${icon('loader-circle', 'spinning')} ${translate('team.loading')}</div>`;

  try {
    const response = await fetch(`${apiUrl}/api/insights?path=${encodeURIComponent(projectPath)}`);
    const data = await response.json();

    container.innerHTML = renderTeamTab(data, translate);

    setTimeout(() => {
      container.querySelectorAll('.stat-bar-fill[data-target-width]').forEach((bar) => {
        bar.style.width = bar.dataset.targetWidth;
      });
    }, 50);
  } catch (error) {
    console.error('Error fetching team insights:', error);
    container.innerHTML = `<div class="empty-state">${translate('team.noData')}</div>`;
  }
}
