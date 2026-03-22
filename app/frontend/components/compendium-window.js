import { escapeHtml, titleize } from '../utils.js';

export function renderCompendiumWindowShell({
  open,
  hidden,
  pinned,
  dock,
  type,
  query,
  searching,
  detailIndex,
  resultsHtml,
  detailHtml,
  activeCharacterLabel,
  floatingPosition,
  size,
}) {
  if (!open) {
    return '';
  }

  if (hidden) {
    return `
      <button class="compendium-peek ${pinned ? 'is-pinned' : ''}" data-action="restore-compendium">
        <span>Compendium</span>
        <strong>${escapeHtml(titleize(type.slice(0, -1), type))}</strong>
      </button>
    `;
  }

  return `
    <section
      class="compendium-window ${dock ? `is-docked is-docked--${dock}` : 'is-floating'} ${pinned ? 'is-pinned' : ''}"
      ${floatingPosition ? `style="left:${floatingPosition.x}px; top:${floatingPosition.y}px; width:min(${size.width}px, calc(100vw - 32px)); height:min(${size.height}px, calc(100vh - 32px));"` : ''}
    >
      <header class="compendium-window__header" data-compendium-drag-handle="true">
        <div>
          <div class="section-title">Compendium</div>
          <h3 class="compendium-window__title">Search, inspect, and drag to the sheet</h3>
          <div class="muted">${escapeHtml(activeCharacterLabel)}${pinned ? ' - pinned' : ' - auto-hide after add'}</div>
        </div>
        <div class="compendium-window__controls">
          <button class="button subtle ${dock === 'left' ? 'active' : ''}" data-action="dock-compendium" data-side="left">Dock Left</button>
          <button class="button subtle ${dock === 'right' ? 'active' : ''}" data-action="dock-compendium" data-side="right">Dock Right</button>
          <button class="button subtle" data-action="toggle-compendium-pin">${pinned ? 'Unpin' : 'Pin'}</button>
          <button class="button subtle" data-action="hide-compendium">Hide</button>
          <button class="modal-close" data-action="close-compendium">&times;</button>
        </div>
      </header>
      <div class="compendium-window__body">
        <div class="compendium-card compendium-card--window">
          <div class="compendium-toolbar">
            <div class="tabs tabs--stretch">
              ${['spells', 'items', 'features']
                .map(
                  (entryType) => `
                    <button class="tab ${type === entryType ? 'active' : ''}" data-action="switch-compendium" data-type="${entryType}">${escapeHtml(titleize(entryType.slice(0, -1), entryType))}</button>
                  `
                )
                .join('')}
            </div>
            <div class="search-row">
              <input class="input" id="compendium-query" placeholder="Search ${escapeHtml(type)} by name or keyword" value="${escapeHtml(query)}" />
              <button class="button primary" data-action="search-compendium">${searching ? 'Searching...' : 'Search'}</button>
            </div>
          </div>
          <div class="compendium-modal__layout">
            <div class="search-results">
              ${resultsHtml || `<div class="empty-card empty-card--compendium">Search ${escapeHtml(type)} by name or keyword. Add entries directly or drag them onto the matching sheet section.</div>`}
            </div>
            <aside class="compendium-detail">
              ${detailIndex == null && !detailHtml ? '<div class="compendium-detail__empty">Search the compendium and select a result to inspect it in detail.</div>' : detailHtml}
            </aside>
          </div>
        </div>
      </div>
    </section>
  `;
}
