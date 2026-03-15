import { escapeHtml } from './html.js';
import { icon } from './icons.js';

const CATEGORY_KEYS = ['quality', 'responsiveness', 'codeVolume', 'iteration'];

const RADAR_CSS_SIZE = 320;
const RADAR_MAX_RADIUS = 120;
const RADAR_LABEL_OFFSET = 28;

const COLORS = {
  textPrimary: '#e8efff',
  textMuted: '#8393b0',
  focus: '#7ad8ff',
  success: '#62d3a8',
  warning: '#f4bc71',
  danger: '#f07f88',
  gridLine: 'rgba(131, 147, 176, 0.15)',
  areaFill: 'rgba(122, 216, 255, 0.15)',
  areaStroke: 'rgba(122, 216, 255, 0.6)',
};

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
 * @param {number} value
 * @param {number} [decimals]
 * @returns {string}
 */
function formatNumber(value, decimals = 1) {
  return Number(value).toFixed(decimals);
}

/**
 * @param {object} metrics
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderMetricsSection(metrics, translate) {
  if (!metrics) return '';

  const qualityRate = Math.round(metrics.firstReviewQualityRate * 100);

  return `
    <div class="sheet-section">
      <div class="sheet-section-title">${icon('bar-chart-2')} ${translate('devSheet.metrics')}</div>
      <div class="dev-sheet-metrics-grid">
        <div class="dev-sheet-metric">
          <span class="dev-sheet-metric-value">${formatNumber(metrics.averageScore)}/10</span>
          <span class="dev-sheet-metric-label">${translate('devSheet.metrics.averageScore')}</span>
        </div>
        <div class="dev-sheet-metric">
          <span class="dev-sheet-metric-value">${formatNumber(metrics.averageBlocking)}</span>
          <span class="dev-sheet-metric-label">${translate('devSheet.metrics.blockingPerReview')}</span>
        </div>
        <div class="dev-sheet-metric">
          <span class="dev-sheet-metric-value">${formatNumber(metrics.averageWarnings)}</span>
          <span class="dev-sheet-metric-label">${translate('devSheet.metrics.warningsPerReview')}</span>
        </div>
        <div class="dev-sheet-metric">
          <span class="dev-sheet-metric-value">${qualityRate}%</span>
          <span class="dev-sheet-metric-label">${translate('devSheet.metrics.firstPassQuality')}</span>
        </div>
        ${metrics.averageAdditions > 0 ? `
          <div class="dev-sheet-metric">
            <span class="dev-sheet-metric-value">+${Math.round(metrics.averageAdditions)}</span>
            <span class="dev-sheet-metric-label">${translate('devSheet.metrics.averageAdditions')}</span>
          </div>
          <div class="dev-sheet-metric">
            <span class="dev-sheet-metric-value">-${Math.round(metrics.averageDeletions)}</span>
            <span class="dev-sheet-metric-label">${translate('devSheet.metrics.averageDeletions')}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * @param {Array<{category: string, type: string, descriptionKey: string, params: object|null}>} descriptions
 * @param {string} type
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
function renderInsightDescriptions(descriptions, type, translate) {
  const filtered = (descriptions || []).filter((description) => description.type === type);
  if (filtered.length === 0) return '';

  const iconName = type === 'strength' ? 'check-circle' : 'alert-circle';
  const itemClass = type === 'strength' ? 'strength' : 'weakness';

  return filtered.map((description) => {
    const text = translate(description.descriptionKey, description.params || {});
    return `<li class="dev-sheet-list-item ${itemClass}">${icon(iconName)} ${escapeHtml(text)}</li>`;
  }).join('');
}

/**
 * @param {object} developer
 * @param {(key: string, params?: Record<string, string|number>) => string} translate
 * @returns {string}
 */
export function renderDeveloperSheetContent(developer, translate) {
  const initial = developer.developerName.charAt(0).toUpperCase();
  const avatarBorderClass = getAvatarBorderClass(developer.overallLevel);

  const statBarsHtml = CATEGORY_KEYS.map(
    (key) => renderStatBar(developer.categoryLevels[key], key, translate)
  ).join('');

  const hasDescriptions = developer.insightDescriptions && developer.insightDescriptions.length > 0;

  const strengthsHtml = hasDescriptions
    ? renderInsightDescriptions(developer.insightDescriptions, 'strength', translate)
    : developer.strengths.map(
        (category) => `<li class="dev-sheet-list-item strength">${icon('check-circle')} ${translate('category.' + category)}</li>`
      ).join('');

  const weaknessesHtml = hasDescriptions
    ? renderInsightDescriptions(developer.insightDescriptions, 'weakness', translate)
    : developer.weaknesses.map(
        (category) => `<li class="dev-sheet-list-item weakness">${icon('alert-circle')} ${translate('category.' + category)}</li>`
      ).join('');

  const topPriorityHtml = developer.topPriority
    ? `<span class="dev-sheet-priority-value">${icon('target')} ${translate('category.' + developer.topPriority)}</span>`
    : `<span class="dev-sheet-priority-empty">${translate('devSheet.noTopPriority')}</span>`;

  const metricsHtml = renderMetricsSection(developer.metrics, translate);

  return `
    <button class="sheet-close" onclick="closeDevSheet()" aria-label="Close">
      ${icon('x')}
    </button>

    <div class="dev-sheet-header">
      <div class="dev-sheet-avatar ${avatarBorderClass}">${escapeHtml(initial)}</div>
      <div class="dev-sheet-identity">
        <div class="dev-sheet-name">${escapeHtml(developer.developerName)}</div>
        <div class="dev-sheet-title">${translate('title.' + developer.title)}</div>
      </div>
      <div class="dev-sheet-level">
        <div class="dev-sheet-level-value">${developer.overallLevel}</div>
        <div class="dev-sheet-level-label">${translate('team.overallLevel')}</div>
      </div>
    </div>

    <div class="sheet-section">
      <div class="radar-chart-container">
        <canvas id="dev-radar-canvas" width="${RADAR_CSS_SIZE}" height="${RADAR_CSS_SIZE}"></canvas>
      </div>
    </div>

    <div class="sheet-section">
      <div class="dev-sheet-bars">
        ${statBarsHtml}
      </div>
    </div>

    ${metricsHtml}

    <div class="sheet-section">
      <div class="sheet-section-title">${icon('trending-up')} ${translate('devSheet.scoreTrend')}</div>
      <div class="sheet-canvas-wrap">
        <canvas id="dev-score-trend-canvas" width="460" height="180"></canvas>
      </div>
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title">${icon('thumbs-up')} ${translate('devSheet.strengths')}</div>
      <ul class="dev-sheet-list">${strengthsHtml || '<li class="dev-sheet-list-empty">-</li>'}</ul>
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title">${icon('alert-triangle')} ${translate('devSheet.weaknesses')}</div>
      <ul class="dev-sheet-list">${weaknessesHtml || '<li class="dev-sheet-list-empty">-</li>'}</ul>
    </div>

    <div class="sheet-section">
      <div class="sheet-section-title">${icon('target')} ${translate('devSheet.topPriority')}</div>
      ${topPriorityHtml}
    </div>

    <div class="dev-sheet-review-badge">
      ${icon('file-search')} ${translate('devSheet.reviewCount', { count: developer.reviewCount })}
    </div>
  `;
}

/**
 * @param {string} canvasId
 * @param {object} categoryLevels
 */
export function drawRadarChart(canvasId, categoryLevels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssSize = RADAR_CSS_SIZE;
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  ctx.scale(dpr, dpr);

  const centerX = cssSize / 2;
  const centerY = cssSize / 2;
  const maxRadius = RADAR_MAX_RADIUS;

  const axes = [
    { key: 'quality', label: 'Quality', angle: -Math.PI / 2 },
    { key: 'responsiveness', label: 'Responsiveness', angle: 0 },
    { key: 'iteration', label: 'Iteration', angle: Math.PI / 2 },
    { key: 'codeVolume', label: 'Code Volume', angle: Math.PI },
  ];

  for (let ring = 2; ring <= 10; ring += 2) {
    const radius = (ring / 10) * maxRadius;
    ctx.beginPath();
    for (let axisIndex = 0; axisIndex < axes.length; axisIndex++) {
      const angle = axes[axisIndex].angle;
      const pointX = centerX + Math.cos(angle) * radius;
      const pointY = centerY + Math.sin(angle) * radius;
      if (axisIndex === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    ctx.closePath();
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  for (const axis of axes) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(axis.angle) * maxRadius,
      centerY + Math.sin(axis.angle) * maxRadius
    );
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.beginPath();
  for (let axisIndex = 0; axisIndex < axes.length; axisIndex++) {
    const axis = axes[axisIndex];
    const level = categoryLevels[axis.key]?.level || 0;
    const radius = (level / 10) * maxRadius;
    const pointX = centerX + Math.cos(axis.angle) * radius;
    const pointY = centerY + Math.sin(axis.angle) * radius;
    if (axisIndex === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  ctx.closePath();
  ctx.fillStyle = COLORS.areaFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.areaStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const axis of axes) {
    const level = categoryLevels[axis.key]?.level || 0;
    const radius = (level / 10) * maxRadius;
    const pointX = centerX + Math.cos(axis.angle) * radius;
    const pointY = centerY + Math.sin(axis.angle) * radius;

    ctx.beginPath();
    ctx.arc(pointX, pointY, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.focus;
    ctx.fill();
    ctx.strokeStyle = COLORS.textPrimary;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = COLORS.textMuted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const axis of axes) {
    const labelRadius = maxRadius + RADAR_LABEL_OFFSET;
    const labelX = centerX + Math.cos(axis.angle) * labelRadius;
    const labelY = centerY + Math.sin(axis.angle) * labelRadius;
    ctx.fillText(axis.label, labelX, labelY);
  }
}
