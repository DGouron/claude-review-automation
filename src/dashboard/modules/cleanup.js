/**
 * @param {number} retentionDays
 * @returns {string}
 */
export function renderCleanupSection(retentionDays) {
  return `
    <div class="cleanup-section">
      <p class="retention-info">Retention : <strong>${retentionDays} jours</strong></p>
      <button id="cleanup-btn" class="btn btn-secondary" onclick="handleCleanupClick()">
        Nettoyer les anciennes reviews
      </button>
      <span id="cleanup-result" class="cleanup-result"></span>
    </div>
  `;
}

/**
 * @returns {Promise<void>}
 */
export async function handleCleanupClick() {
  const button = document.getElementById('cleanup-btn');
  const resultElement = document.getElementById('cleanup-result');

  if (!button || !resultElement) return;

  if (!confirm('Supprimer les fichiers de review expir\u00e9s ?')) return;

  button.disabled = true;
  resultElement.textContent = 'Nettoyage en cours...';

  try {
    const response = await fetch('/api/reviews/cleanup', { method: 'POST' });
    const data = await response.json();

    if (data.success) {
      resultElement.textContent = `${data.deletedCount} fichier(s) supprim\u00e9(s)`;
    } else {
      resultElement.textContent = 'Erreur lors du nettoyage';
    }
  } catch {
    resultElement.textContent = 'Erreur de connexion';
  } finally {
    button.disabled = false;
  }
}
