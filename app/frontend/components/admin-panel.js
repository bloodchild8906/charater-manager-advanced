import { escapeHtml } from '../utils.js';

export function renderAdminPanel({ isAdmin, users = [] }) {
  if (!isAdmin) {
    return '';
  }

  return `
    <section class="panel admin-panel">
      <div class="panel-header">
        <div>
          <div class="section-title">User Roles</div>
          <div class="muted">Review access levels without leaving the roster workspace.</div>
        </div>
        <button class="button subtle" data-action="refresh-bootstrap">Refresh</button>
      </div>
      <div class="item-list">
        ${users
          .map(
            (user) => `
              <div class="entry entry--compact">
                <div class="entry-top">
                  <div>
                    <strong>${escapeHtml(user.displayName)}</strong>
                    <div class="muted">${escapeHtml(user.email)}</div>
                  </div>
                  <select class="select role-select" data-action="user-role" data-user-id="${escapeHtml(user.id)}">
                    ${['admin', 'gm', 'player']
                      .map((role) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`)
                      .join('')}
                  </select>
                </div>
              </div>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}
