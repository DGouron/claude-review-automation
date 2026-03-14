import { escapeHtml } from './html.js';

/**
 * @param {{ currentVersion: string, updateAvailable: boolean, latestVersion: string | null }} versionData
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {string}
 */
export function renderVersionUpdateArea(versionData, translate) {
  const versionLabel = `<span class="version-label">v${escapeHtml(versionData.currentVersion)}</span>`;

  const checkButton = `<button id="version-check-btn" class="btn btn-icon" title="${escapeHtml(translate('version.checkTooltip'))}" onclick="checkForUpdates()">
    <i data-lucide="refresh-cw"></i>
  </button>`;

  if (!versionData.updateAvailable || !versionData.latestVersion) {
    return `${versionLabel}${checkButton}`;
  }

  const label = translate('version.updateAvailable', { version: versionData.latestVersion });
  const updateButton = `<button id="version-update-btn" class="btn btn-update" onclick="triggerVersionUpdate()">
    <i data-lucide="download"></i> <span>${escapeHtml(label)}</span>
  </button>`;

  return `${versionLabel}${updateButton}${checkButton}`;
}

/**
 * @param {'idle' | 'checking' | 'updating' | 'restarting'} status
 * @param {(key: string) => string} translate
 */
export function setVersionCheckState(status, translate) {
  const checkBtn = document.getElementById('version-check-btn');
  const updateBtn = document.getElementById('version-update-btn');

  if (status === 'checking' && checkBtn) {
    checkBtn.classList.add('spinning');
    checkBtn.disabled = true;
  } else if (checkBtn) {
    checkBtn.classList.remove('spinning');
    checkBtn.disabled = false;
  }

  if (status === 'updating' && updateBtn) {
    updateBtn.disabled = true;
    const span = updateBtn.querySelector('span');
    if (span) span.textContent = translate('version.updating');
  }

  if (status === 'restarting' && updateBtn) {
    updateBtn.disabled = true;
    const span = updateBtn.querySelector('span');
    if (span) span.textContent = translate('version.restarting');
  }
}
