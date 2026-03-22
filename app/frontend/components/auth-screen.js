import { escapeHtml } from '../utils.js';

export function renderAuthScreen({ authMode, messageHtml = '' }) {
  return `
    <div class="screen auth-screen">
      <div class="auth-shell">
        <section class="hero-card hero-card--auth">
          <div class="eyebrow">Codex Arcanum</div>
          <h1 class="hero-title">Run your campaign vault like it matters.</h1>
          <p class="hero-copy">
            Build sheets, search the SRD compendium, and manage table access in a UI that feels more
            like a campaign desk than a raw admin panel.
          </p>
          <div class="hero-ribbon">
            <span>Sheet editing</span>
            <span>Live compendium</span>
            <span>Role-aware access</span>
          </div>
          <div class="hero-grid">
            <div class="hero-stat">
              <strong>Three stores</strong>
              SQLite for local runs, Azure SQL for relational hosting, MongoDB when you want document
              workflows.
            </div>
            <div class="hero-stat">
              <strong>Fast table flow</strong>
              Create, search, update, and curate without leaving the same screen.
            </div>
            <div class="hero-stat">
              <strong>Built for sessions</strong>
              Track combat state, equipment, spells, and notes in one place.
            </div>
          </div>
        </section>
        <section class="panel auth-card">
          <div class="auth-card__header">
            <div>
              <div class="section-title">Archive Access</div>
              <h2 class="auth-title">Enter the character manager</h2>
              <p class="muted">Use the same account to manage your roster across providers.</p>
            </div>
          </div>
          <div class="tabs">
            <button class="tab ${authMode === 'login' ? 'active' : ''}" data-action="switch-auth" data-mode="login">Sign In</button>
            <button class="tab ${authMode === 'register' ? 'active' : ''}" data-action="switch-auth" data-mode="register">Register</button>
          </div>
          ${messageHtml}
          <div class="form-grid">
            ${authMode === 'register' ? `
              <label class="field">
                <span class="label">Display Name</span>
                <input id="auth-display-name" class="input" placeholder="Dungeon Chronicler" />
              </label>
            ` : ''}
            <label class="field">
              <span class="label">Email</span>
              <input id="auth-email" class="input" type="email" placeholder="you@example.com" />
            </label>
            <label class="field">
              <span class="label">Password</span>
              <input id="auth-password" class="input" type="password" placeholder="At least 8 characters" />
            </label>
            <div class="button-row auth-actions">
              <button class="button primary" data-action="submit-auth">${escapeHtml(authMode === 'login' ? 'Open the Archive' : 'Create Account')}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
