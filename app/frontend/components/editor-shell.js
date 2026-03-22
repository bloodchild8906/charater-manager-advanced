import { editionLabel, escapeHtml, renderMetaBits } from '../utils.js';

export function renderEditorShell({
  character,
  charactersCount,
  sheetContent,
  sheetTabsHtml,
  initiativeButtonHtml,
  classOptionsHtml,
  ancestryOptionsHtml,
  backgroundOptionsHtml,
  editionOptionsHtml,
  overview,
}) {
  if (!character) {
    const hasCharacters = charactersCount > 0;
    return `
      <div class="editor-card empty-sheet">
        <div class="eyebrow">${hasCharacters ? 'Roster View' : 'No Active Sheet'}</div>
        <h2 class="empty-sheet__title">${hasCharacters ? 'Select a character from the roster to enter the builder.' : 'Choose how you want to start a character.'}</h2>
        <p class="empty-sheet__copy">${hasCharacters ? 'Use the roster on the left as your character index, or create a new sheet if the party is still growing.' : 'Launch the step-by-step wizard or drop straight into a blank sheet. The compendium and dice toolbar stay around the sheet instead of occupying the editor itself.'}</p>
        <div class="button-row">
          <button class="button primary" data-action="create-character">Create Character</button>
          <button class="button subtle" data-action="open-compendium">Open Compendium</button>
        </div>
      </div>
    `;
  }

  return `
    <section class="sheet-shell">
      <header class="editor-card sheet-nav-shell">
        <div class="sheet-nav-top">
          <div class="sheet-nav-breadcrumbs">
            <button class="sheet-nav-back" data-action="back-to-roster">&larr; Characters</button>
            <span class="sheet-nav-divider"></span>
            <span class="sheet-nav-current">Character Builder</span>
          </div>
          <div class="sheet-nav-actions">
            <button class="button subtle" data-action="open-compendium">Compendium</button>
            <button class="button" data-action="open-levelup-wizard">Level Up</button>
            <button class="button subtle" data-action="save-character">Save Sheet</button>
            <button class="button danger" data-action="delete-character">Delete</button>
          </div>
        </div>
        <div class="sheet-header">
          <div class="sheet-header__copy">
            <div class="eyebrow">Character Sheet</div>
            <div class="sheet-header__title-row">
              <h2 class="character-title">${escapeHtml(character.data.name)}</h2>
              <span class="pill-badge">Level ${escapeHtml(String(character.data.level))}</span>
            </div>
            <div class="character-lineage">${escapeHtml(overview.lineage)}</div>
            <div class="meta-row">${renderMetaBits([editionLabel(character.data.edition), character.data.alignment || '', character.ownerDisplayName || ''])}</div>
          </div>
          <div class="sheet-header__summary">
            <div class="sheet-header__summary-card">
              <span class="label">Hit Points</span>
              <strong>${escapeHtml(`${character.data.hp.current}/${character.data.hp.max}`)}</strong>
            </div>
            <div class="sheet-header__summary-card">
              <span class="label">Armor Class</span>
              <strong>${escapeHtml(String(character.data.ac))}</strong>
            </div>
            <div class="sheet-header__summary-card">
              <span class="label">Initiative</span>
              <strong>${escapeHtml(String(character.data.initiative >= 0 ? `+${character.data.initiative}` : character.data.initiative))}</strong>
              ${initiativeButtonHtml}
            </div>
          </div>
        </div>
        <section class="sheet-identity">
          <div class="sheet-identity__grid">
            <label class="field">
              <span class="label">Name</span>
              <input class="input" data-bind="name" value="${escapeHtml(character.data.name)}" />
            </label>
            <label class="field">
              <span class="label">Alignment</span>
              <input class="input" data-bind="alignment" value="${escapeHtml(character.data.alignment)}" />
            </label>
            <label class="field">
              <span class="label">Edition</span>
              <select class="select" data-bind="edition">
                ${editionOptionsHtml}
              </select>
            </label>
            <label class="field">
              <span class="label">Class</span>
              <select class="select" data-bind="classSlug">
                <option value="">Choose a class</option>
                ${classOptionsHtml}
              </select>
            </label>
            <label class="field">
              <span class="label">Ancestry</span>
              <select class="select" data-bind="ancestrySlug">
                <option value="">Choose an ancestry</option>
                ${ancestryOptionsHtml}
              </select>
            </label>
            <label class="field">
              <span class="label">Background</span>
              <select class="select" data-bind="backgroundSlug">
                <option value="">Choose a background</option>
                ${backgroundOptionsHtml}
              </select>
            </label>
          </div>
        </section>
        ${sheetTabsHtml}
      </header>
      <div class="sheet-content" data-dropzone="sheet">
        ${sheetContent}
      </div>
    </section>
  `;
}
