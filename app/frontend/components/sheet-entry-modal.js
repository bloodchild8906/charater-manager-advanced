import { escapeHtml } from '../utils.js';

export function renderSheetEntryModalShell({ sectionLabel, title, body }) {
  if (!body) {
    return '';
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--entry">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">${escapeHtml(sectionLabel)}</div>
            <h3 class="modal-title">${escapeHtml(title)}</h3>
          </div>
          <button class="modal-close" data-action="close-sheet-entry">&times;</button>
        </div>
        <div class="modal-panel__body">
          ${body}
        </div>
        <div class="modal-panel__footer">
          <button class="button subtle" data-action="close-sheet-entry">Close</button>
        </div>
      </section>
    </div>
  `;
}
