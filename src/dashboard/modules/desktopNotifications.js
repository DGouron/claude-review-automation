/**
 * @param {{ permission: string, isDocumentHidden: boolean, notifyWhenVisible?: boolean }} options
 * @returns {boolean}
 */
export function shouldNotifyDesktop(options) {
  if (options.permission !== 'granted') return false;
  if (options.notifyWhenVisible === true) return true;
  return options.isDocumentHidden;
}

/**
 * @typedef {Object} KindFormat
 * @property {string} emoji
 * @property {string} labelKey
 */

/** @type {Record<string, KindFormat>} */
const KIND_FORMATS = {
  reviewStarted: { emoji: '🔍', labelKey: 'notify.label.reviewStarted' },
  followupStarted: { emoji: '🔁', labelKey: 'notify.label.followupStarted' },
  reviewCompleted: { emoji: '✅', labelKey: 'notify.label.reviewCompleted' },
  followupCompleted: { emoji: '✅', labelKey: 'notify.label.followupCompleted' },
  reviewFailed: { emoji: '❌', labelKey: 'notify.label.reviewFailed' },
  reviewPendingConfirmation: { emoji: '⏳', labelKey: 'notify.label.reviewPendingConfirmation' },
};

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function resolveAuthor(review) {
  const assignedBy = review.assignedBy;
  if (!assignedBy || typeof assignedBy !== 'object') return null;
  const typed = /** @type {{ displayName?: unknown, username?: unknown }} */ (assignedBy);
  if (typeof typed.displayName === 'string' && typed.displayName.length > 0) {
    return typed.displayName;
  }
  if (typeof typed.username === 'string' && typed.username.length > 0) {
    return typed.username;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function resolveProjectShortName(review) {
  if (typeof review.project !== 'string' || review.project.length === 0) return null;
  const segments = review.project.split('/');
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : null;
}

/**
 * @param {Record<string, unknown>} review
 * @returns {'!' | '#'}
 */
function resolveMrPrefix(review) {
  const id = typeof review.id === 'string' ? review.id : '';
  return id.startsWith('github') ? '#' : '!';
}

/**
 * @param {KindFormat} format
 * @param {(key: string) => string} translate
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function buildTitle(format, translate, review) {
  const mrNumber = typeof review.mrNumber === 'number' ? String(review.mrNumber) : '?';
  const mrToken = `${resolveMrPrefix(review)}${mrNumber}`;
  const label = translate(format.labelKey);
  const author = resolveAuthor(review);
  const segments = author
    ? [`${format.emoji} ${label}`, author, mrToken]
    : [`${format.emoji} ${label}`, mrToken];
  return segments.join(' · ');
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function buildBody(review) {
  const lines = [];
  const title = typeof review.title === 'string' ? review.title.trim() : '';
  if (title.length > 0) lines.push(title);
  const project = resolveProjectShortName(review);
  if (project) lines.push(project);
  return lines.join('\n');
}

/**
 * @param {{ kind: string, review: Record<string, unknown> }} notification
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {{ title: string, body: string, tag: string } | null}
 */
export function getDesktopNotificationPayload(notification, translate) {
  const format = KIND_FORMATS[notification.kind];
  if (!format) return null;

  const mrNumber = typeof notification.review.mrNumber === 'number'
    ? String(notification.review.mrNumber)
    : '?';

  return {
    title: buildTitle(format, translate, notification.review),
    body: buildBody(notification.review),
    tag: `reviewflow-${notification.kind}-${mrNumber}`,
  };
}
