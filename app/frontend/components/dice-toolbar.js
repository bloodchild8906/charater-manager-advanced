import { escapeHtml } from '../utils.js';

export function renderDiceToolbarShell({
  hidden,
  open,
  position,
  peekLabel,
  railHtml,
  controlsHtml,
  summaryHtml,
  historyHtml,
}) {
  if (hidden) {
    return `
      <button class="dice-peek" data-action="restore-dice-toolbar" style="left:${position.x}px; top:${position.y}px;">
        <span>Dice</span>
        <strong>${escapeHtml(peekLabel)}</strong>
      </button>
    `;
  }

  return `
    <section class="dice-toolbar-shell ${open ? 'is-open' : ''}" style="left:${position.x}px; top:${position.y}px;">
      <header class="dice-toolbar__header" data-dice-drag-handle="true">
        <div>
          <div class="section-title">Table Dice</div>
          <div class="muted">Global rolls, sheet checks, and attack throws all land in the same scene.</div>
        </div>
        <div class="dice-toolbar__header-actions">
          <button class="button subtle" data-action="toggle-dice-toolbar">${open ? 'Collapse' : 'Expand'}</button>
          <button class="button subtle" data-action="hide-dice-toolbar">Hide</button>
        </div>
      </header>
      <div class="dice-toolbar__rail">
        ${railHtml}
      </div>
      ${open ? `
        <div class="dice-toolbar__panel">
          <div data-dice-controls>${controlsHtml}</div>
          <div class="dice-stage__summary" data-dice-summary>${summaryHtml}</div>
          <div class="dice-history" data-dice-history>${historyHtml}</div>
        </div>
      ` : ''}
    </section>
  `;
}
