import { escapeHtml, renderMetaBits, titleize } from '../utils.js';

export function renderTopbar({
  session,
  focusMode,
  activeCharacterName,
  charactersCount,
  editionFilter,
  editionOptions,
  canInstall,
}) {
  return `
    <header class="panel topbar topbar--campaign ${focusMode ? 'topbar--sheet-focus' : ''}">
      <div class="topbar__copy">
        <div class="eyebrow">World Shapers</div>
        <div class="topbar-title">${focusMode ? 'Character Builder Navigation' : 'Roster and builder workspace.'}</div>
        <div class="topbar-meta">${renderMetaBits([`Signed in as ${session.displayName}`, session.email, activeCharacterName])}</div>
      </div>
      <div class="topbar__actions">
        <div class="topbar__badges">
          <span class="badge">${escapeHtml(titleize(session.role, session.role))}</span>
          <span class="badge badge--muted">${escapeHtml(String(charactersCount))} characters</span>
        </div>
        <select class="select" data-action="edition-filter">
          ${editionOptions
            .map(
              ([value, label]) => `
                <option value="${value}" ${editionFilter === value ? 'selected' : ''}>${escapeHtml(label)}</option>
              `
            )
            .join('')}
        </select>
        ${canInstall ? '<button class="button subtle topbar__install" data-action="install-pwa">Install App</button>' : ''}
        ${focusMode ? '<button class="button subtle" data-action="back-to-roster">Characters</button>' : ''}
        <button class="button subtle" data-action="open-compendium">Compendium</button>
        <button class="button" data-action="logout">Sign Out</button>
      </div>
    </header>
  `;
}
