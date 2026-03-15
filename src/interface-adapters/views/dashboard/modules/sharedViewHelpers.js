import { icon } from './icons.js';

/**
 * @param {number} level
 * @returns {string}
 */
export function getStatBarColorClass(level) {
  if (level <= 3) return 'stat-bar-danger';
  if (level <= 6) return 'stat-bar-warning';
  if (level <= 8) return 'stat-bar-focus';
  return 'stat-bar-success';
}

/**
 * @param {number} level
 * @returns {string}
 */
export function getAvatarBorderClass(level) {
  if (level <= 3) return 'dev-avatar-danger';
  if (level <= 6) return 'dev-avatar-warning';
  if (level <= 8) return 'dev-avatar-focus';
  return 'dev-avatar-success';
}

/**
 * @param {number} level
 * @returns {string}
 */
export function getTierClass(level) {
  if (level <= 3) return 'tier-danger';
  if (level <= 6) return 'tier-warning';
  if (level <= 8) return 'tier-focus';
  return 'tier-success';
}

/**
 * @param {string} trend
 * @returns {string}
 */
export function getTrendClass(trend) {
  if (trend === 'improving') return 'trend-improving';
  if (trend === 'declining') return 'trend-declining';
  return 'trend-stable';
}

/**
 * @param {string} trend
 * @returns {string}
 */
export function getTrendIcon(trend) {
  if (trend === 'improving') return icon('trending-up', 'trend-icon');
  if (trend === 'declining') return icon('trending-down', 'trend-icon');
  return icon('minus', 'trend-icon');
}

/**
 * @param {number} level
 * @param {number} [size]
 * @param {string} [tooltip]
 * @returns {string}
 */
export function renderLevelRing(level, size = 52, tooltip = '') {
  const halfSize = size / 2;
  const radius = halfSize - 4;
  const circumference = 2 * Math.PI * radius;
  const fillLength = (level / 10) * circumference;
  const tierClass = getTierClass(level);
  const titleAttr = tooltip ? ` title="${tooltip}"` : '';

  return `
    <div class="dev-level-ring ${tierClass}" style="width:${size}px;height:${size}px"${titleAttr}>
      <svg viewBox="0 0 ${size} ${size}">
        <circle cx="${halfSize}" cy="${halfSize}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
        <circle cx="${halfSize}" cy="${halfSize}" r="${radius}" fill="none" stroke="currentColor" stroke-width="3.5"
          stroke-dasharray="${fillLength.toFixed(1)} ${circumference.toFixed(1)}" stroke-linecap="round"
          transform="rotate(-90 ${halfSize} ${halfSize})"/>
      </svg>
      <span class="ring-value">${level}</span>
    </div>
  `;
}

/**
 * @param {object} categoryLevel
 * @param {string} categoryKey
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
export function renderStatBar(categoryLevel, categoryKey, translate) {
  const level = categoryLevel.level;
  const trend = categoryLevel.trend;
  const widthPercent = (level / 10) * 100;
  const colorClass = getStatBarColorClass(level);
  const trendClass = getTrendClass(trend);

  return `
    <div class="stat-bar-container">
      <span class="stat-bar-label">${translate('category.' + categoryKey)}</span>
      <div class="stat-bar">
        <div class="stat-bar-fill ${colorClass}" style="width: 0%" data-target-width="${widthPercent}%"></div>
      </div>
      <span class="stat-bar-value">${level}</span>
      <span class="trend-indicator ${trendClass}" title="${translate('trend.' + trend)}">${getTrendIcon(trend)}</span>
    </div>
  `;
}
