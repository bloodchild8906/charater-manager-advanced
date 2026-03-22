import { escapeHtml } from '../utils.js';

export function renderSidebar({
  visibleCharacters,
  totalCharacters,
  rosterQuery,
  renderCharacterPill,
}) {
  return `
    <section class="panel roster-panel">
      <div class="panel-header">
        <div>
          <div class="section-title">Roster</div>
          <div class="muted">${escapeHtml(String(visibleCharacters.length))} shown of ${escapeHtml(String(totalCharacters))} total</div>
        </div>
        <button class="button primary" data-action="create-character">New Character</button>
      </div>
      <label class="field">
        <span class="label">Search Roster</span>
        <input class="input" id="roster-query" placeholder="Name, class, ancestry, owner" value="${escapeHtml(rosterQuery)}" />
      </label>
      <div class="character-list">
        ${
          visibleCharacters.length === 0
            ? '<div class="empty-card">No matching characters. Clear the filter or create a new sheet.</div>'
            : visibleCharacters.map(renderCharacterPill).join('')
        }
      </div>
    </section>
  `;
}
