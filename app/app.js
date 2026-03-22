/* global document, window */

const appRoot = document.getElementById('app');

const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ABILITY_LABELS = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
};

const state = {
  authMode: 'login',
  session: null,
  permissions: null,
  users: [],
  compendium: null,
  characters: [],
  activeCharacterId: null,
  compendiumType: 'spells',
  compendiumQuery: '',
  compendiumResults: [],
  editionFilter: 'all',
  loading: true,
  searching: false,
  message: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function abilityModifier(score) {
  const modifier = Math.floor((Number(score || 10) - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function createDefaultCharacter() {
  return {
    name: 'Unnamed Hero',
    edition: state.editionFilter,
    level: 1,
    ancestrySlug: '',
    classSlug: '',
    backgroundSlug: '',
    alignment: 'True Neutral',
    abilities: {
      STR: 15,
      DEX: 14,
      CON: 13,
      INT: 12,
      WIS: 10,
      CHA: 8,
    },
    hp: {
      max: 10,
      current: 10,
      temp: 0,
    },
    ac: 10,
    speed: 30,
    initiative: 0,
    conditions: [],
    inventory: [],
    spells: [],
    features: [],
    notes: '',
  };
}

function normalizeCharacter(character) {
  const data = {
    ...createDefaultCharacter(),
    ...(character?.data || {}),
  };

  data.name = data.name || character?.name || 'Unnamed Hero';
  data.edition = data.edition || character?.edition || state.editionFilter;
  data.level = Number(data.level || character?.level || 1);
  data.ancestrySlug = data.ancestrySlug || character?.ancestrySlug || '';
  data.classSlug = data.classSlug || character?.classSlug || '';
  data.backgroundSlug = data.backgroundSlug || character?.backgroundSlug || '';

  return {
    ...character,
    name: data.name,
    edition: data.edition,
    level: data.level,
    ancestrySlug: data.ancestrySlug,
    classSlug: data.classSlug,
    backgroundSlug: data.backgroundSlug,
    data,
  };
}

function activeCharacter() {
  return state.characters.find((character) => character.id === state.activeCharacterId) || null;
}

function setMessage(type, text) {
  state.message = text ? { type, text } : null;
  render();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : {};

  if (!response.ok) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }

  return body;
}

async function loadSession() {
  state.loading = true;
  render();

  try {
    const payload = await api('/api/auth/session', { method: 'GET' });
    state.session = payload.user;
    state.permissions = payload.permissions;
    if (payload.authenticated) {
      await loadBootstrap();
      return;
    }
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function loadBootstrap() {
  const payload = await api(`/api/bootstrap?edition=${encodeURIComponent(state.editionFilter)}`, {
    method: 'GET',
  });

  state.session = payload.user;
  state.permissions = payload.permissions;
  state.users = payload.users || [];
  state.compendium = payload.compendium;
  state.characters = (payload.characters || []).map(normalizeCharacter);
  state.activeCharacterId =
    state.characters.find((character) => character.id === state.activeCharacterId)?.id ||
    state.characters[0]?.id ||
    null;
  state.compendiumResults = [];
}

async function handleAuthSubmit() {
  const email = document.getElementById('auth-email')?.value || '';
  const password = document.getElementById('auth-password')?.value || '';
  const displayName = document.getElementById('auth-display-name')?.value || '';

  state.loading = true;
  render();

  try {
    const path = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = await api(path, {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    state.session = payload.user;
    state.permissions = payload.permissions;
    await loadBootstrap();
    setMessage('success', state.authMode === 'login' ? 'Signed in.' : 'Account created.');
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    state.loading = false;
    render();
  }
}

async function logout() {
  await api('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  state.session = null;
  state.permissions = null;
  state.users = [];
  state.compendium = null;
  state.characters = [];
  state.activeCharacterId = null;
  state.compendiumResults = [];
  setMessage('success', 'Signed out.');
}

function syncCharacter(character) {
  character.name = character.data.name;
  character.edition = character.data.edition;
  character.level = Number(character.data.level || 1);
  character.ancestrySlug = character.data.ancestrySlug;
  character.classSlug = character.data.classSlug;
  character.backgroundSlug = character.data.backgroundSlug;
}

function updateActiveCharacter(path, value) {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  const parts = path.split('.');
  let target = character.data;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }

  target[parts[0]] = value;
  syncCharacter(character);
  render();
}

function updateListEntry(listName, index, field, value) {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  character.data[listName][index][field] = value;
  render();
}

async function createCharacterRecord() {
  const payload = await api('/api/characters', {
    method: 'POST',
    body: JSON.stringify(createDefaultCharacter()),
  });

  const character = normalizeCharacter(payload.character);
  state.characters.unshift(character);
  state.activeCharacterId = character.id;
  setMessage('success', 'Character created.');
}

async function saveActiveCharacter() {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  syncCharacter(character);
  const payload = await api(`/api/characters/${encodeURIComponent(character.id)}`, {
    method: 'PUT',
    body: JSON.stringify(character.data),
  });

  const updated = normalizeCharacter(payload.character);
  state.characters = state.characters.map((entry) => (entry.id === updated.id ? updated : entry));
  state.activeCharacterId = updated.id;
  setMessage('success', 'Character saved.');
}

async function deleteActiveCharacter() {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  if (!window.confirm(`Delete ${character.name}?`)) {
    return;
  }

  await api(`/api/characters/${encodeURIComponent(character.id)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });

  state.characters = state.characters.filter((entry) => entry.id !== character.id);
  state.activeCharacterId = state.characters[0]?.id || null;
  setMessage('success', 'Character deleted.');
}

async function runCompendiumSearch() {
  state.searching = true;
  render();

  try {
    const payload = await api(
      `/api/compendium/search?type=${encodeURIComponent(state.compendiumType)}&q=${encodeURIComponent(state.compendiumQuery)}&edition=${encodeURIComponent(state.editionFilter)}&limit=24`,
      { method: 'GET' }
    );
    state.compendiumResults = payload.results || [];
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    state.searching = false;
    render();
  }
}

function addCompendiumEntry(index) {
  const result = state.compendiumResults[index];
  const character = activeCharacter();
  if (!result || !character) {
    return;
  }

  if (state.compendiumType === 'spells') {
    character.data.spells.push({
      name: result.name,
      level: result.level ?? 0,
      source: result.sourceCode || '',
      description: result.description || '',
    });
  } else if (state.compendiumType === 'items') {
    character.data.inventory.push({
      name: result.name,
      quantity: 1,
      notes: result.description || '',
    });
  } else {
    character.data.features.push({
      name: result.name,
      source: result.sourceCode || '',
      description: result.description || '',
    });
  }

  render();
}

function toggleCondition(conditionCode) {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  const hasCondition = character.data.conditions.includes(conditionCode);
  character.data.conditions = hasCondition
    ? character.data.conditions.filter((entry) => entry !== conditionCode)
    : [...character.data.conditions, conditionCode];
  render();
}

async function updateUserRoleRequest(userId, role) {
  const payload = await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  state.users = payload.users || [];
  setMessage('success', 'Role updated.');
}

function renderMessage() {
  if (!state.message) {
    return '';
  }

  return `<div class="message ${escapeHtml(state.message.type)}">${escapeHtml(state.message.text)}</div>`;
}

function renderAuth() {
  return `
    <div class="screen">
      <div class="auth-shell">
        <section class="hero-card">
          <div class="eyebrow">Codex Arcanum</div>
          <h1 class="hero-title">Character management for the SRD database you already built.</h1>
          <p class="hero-copy">This interface pulls classes, ancestries, backgrounds, conditions, spells, items, and features from the active database provider. Auth and role-based access are enforced server-side.</p>
          <div class="hero-grid">
            <div class="hero-stat"><strong>DB-backed</strong>Compendium and characters come from SQLite, Azure SQL, or MongoDB.</div>
            <div class="hero-stat"><strong>RBAC</strong>Admins manage roles, GMs see all characters, players manage their own.</div>
            <div class="hero-stat"><strong>Codex UI</strong>Styled from the supplied Codex Arcanum direction without the hardcoded demo data.</div>
          </div>
        </section>
        <section class="panel auth-card">
          <div class="tabs">
            <button class="tab ${state.authMode === 'login' ? 'active' : ''}" data-action="switch-auth" data-mode="login">Sign In</button>
            <button class="tab ${state.authMode === 'register' ? 'active' : ''}" data-action="switch-auth" data-mode="register">Register</button>
          </div>
          ${renderMessage()}
          <div class="form-grid">
            ${state.authMode === 'register' ? `
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
            <div class="button-row">
              <button class="button primary" data-action="submit-auth">${state.authMode === 'login' ? 'Enter the Archive' : 'Create Account'}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderCharacterPill(character) {
  const owner = state.permissions?.canViewAllCharacters && character.ownerDisplayName
    ? ` · ${character.ownerDisplayName}`
    : '';
  return `
    <button class="character-pill ${character.id === state.activeCharacterId ? 'active' : ''}" data-action="select-character" data-character-id="${escapeHtml(character.id)}">
      <strong>${escapeHtml(character.name)}</strong>
      <span>Lvl ${escapeHtml(character.level)} · ${escapeHtml(character.classSlug || 'Unclassed')}${owner}</span>
    </button>
  `;
}

function renderEditor(character) {
  if (!character) {
    return `<div class="editor-card"><div class="empty">No character selected yet.</div></div>`;
  }

  return `
    <div class="editor-card">
      <div class="panel-header">
        <div>
          <div class="section-title">Character Sheet</div>
          <div class="muted">${escapeHtml(character.ownerDisplayName || state.session.displayName || '')}</div>
        </div>
        <div class="button-row">
          <button class="button subtle" data-action="save-character">Save</button>
          <button class="button danger" data-action="delete-character">Delete</button>
        </div>
      </div>
      <div class="editor-grid">
        <label class="field"><span class="label">Name</span><input class="input" data-bind="name" value="${escapeHtml(character.data.name)}" /></label>
        <label class="field"><span class="label">Alignment</span><input class="input" data-bind="alignment" value="${escapeHtml(character.data.alignment)}" /></label>
        <label class="field"><span class="label">Class</span><select class="select" data-bind="classSlug"><option value="">Choose a class</option>${(state.compendium?.classes || []).map((entry) => `<option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.classSlug ? 'selected' : ''}>${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Ancestry</span><select class="select" data-bind="ancestrySlug"><option value="">Choose an ancestry</option>${(state.compendium?.ancestries || []).map((entry) => `<option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.ancestrySlug ? 'selected' : ''}>${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Background</span><select class="select" data-bind="backgroundSlug"><option value="">Choose a background</option>${(state.compendium?.backgrounds || []).map((entry) => `<option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.backgroundSlug ? 'selected' : ''}>${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Level</span><input class="input" type="number" min="1" max="20" data-bind="level" value="${escapeHtml(character.data.level)}" /></label>
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Ability Scores</div></div>
      <div class="ability-grid">
        ${ABILITY_KEYS.map((ability) => `
          <div class="ability-card">
            <strong>${escapeHtml(ability)}</strong>
            <input class="input" type="number" min="1" max="30" data-bind="abilities.${ability}" value="${escapeHtml(character.data.abilities[ability])}" />
            <div class="ability-mod">${escapeHtml(ABILITY_LABELS[ability])} ${escapeHtml(abilityModifier(character.data.abilities[ability]))}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Combat Snapshot</div></div>
      <div class="resource-grid">
        <label class="field"><span class="label">HP Max</span><input class="input" type="number" min="1" data-bind="hp.max" value="${escapeHtml(character.data.hp.max)}" /></label>
        <label class="field"><span class="label">HP Current</span><input class="input" type="number" min="0" data-bind="hp.current" value="${escapeHtml(character.data.hp.current)}" /></label>
        <label class="field"><span class="label">Armor Class</span><input class="input" type="number" min="0" data-bind="ac" value="${escapeHtml(character.data.ac)}" /></label>
        <label class="field"><span class="label">Speed</span><input class="input" type="number" min="0" data-bind="speed" value="${escapeHtml(character.data.speed)}" /></label>
      </div>
      <div class="stack" style="margin-top:16px">
        <div class="section-title">Conditions</div>
        <div class="condition-grid">
          ${(state.compendium?.conditions || []).map((condition) => `
            <button class="condition-chip ${character.data.conditions.includes(condition.code) ? 'active' : ''}" data-action="toggle-condition" data-condition="${escapeHtml(condition.code)}">${escapeHtml(condition.name)}</button>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Inventory</div><button class="button" data-action="add-entry" data-list="inventory">Add Item</button></div>
      <div class="item-list">
        ${character.data.inventory.length === 0 ? '<div class="empty">No equipment yet.</div>' : character.data.inventory.map((entry, index) => `
          <div class="entry">
            <div class="entry-top"><strong>${escapeHtml(entry.name || 'Item')}</strong><button class="button danger" data-action="remove-entry" data-list="inventory" data-index="${index}">Remove</button></div>
            <div class="editor-grid" style="margin-top:10px">
              <input class="input" data-list="inventory" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" placeholder="Name" />
              <input class="input" type="number" min="1" data-list="inventory" data-index="${index}" data-field="quantity" value="${escapeHtml(entry.quantity || 1)}" placeholder="Qty" />
            </div>
            <textarea class="textarea" data-list="inventory" data-index="${index}" data-field="notes" placeholder="Notes">${escapeHtml(entry.notes || '')}</textarea>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Spells</div><button class="button" data-action="add-entry" data-list="spells">Add Spell</button></div>
      <div class="item-list">
        ${character.data.spells.length === 0 ? '<div class="empty">No spells recorded.</div>' : character.data.spells.map((entry, index) => `
          <div class="entry">
            <div class="entry-top"><strong>${escapeHtml(entry.name || 'Spell')}</strong><button class="button danger" data-action="remove-entry" data-list="spells" data-index="${index}">Remove</button></div>
            <div class="editor-grid" style="margin-top:10px">
              <input class="input" data-list="spells" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" placeholder="Name" />
              <input class="input" type="number" min="0" max="9" data-list="spells" data-index="${index}" data-field="level" value="${escapeHtml(entry.level ?? 0)}" placeholder="Level" />
            </div>
            <textarea class="textarea" data-list="spells" data-index="${index}" data-field="description" placeholder="Description">${escapeHtml(entry.description || '')}</textarea>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Features</div><button class="button" data-action="add-entry" data-list="features">Add Feature</button></div>
      <div class="item-list">
        ${character.data.features.length === 0 ? '<div class="empty">No features recorded.</div>' : character.data.features.map((entry, index) => `
          <div class="entry">
            <div class="entry-top"><strong>${escapeHtml(entry.name || 'Feature')}</strong><button class="button danger" data-action="remove-entry" data-list="features" data-index="${index}">Remove</button></div>
            <input class="input" data-list="features" data-index="${index}" data-field="source" value="${escapeHtml(entry.source || '')}" placeholder="Source" style="margin-top:10px" />
            <textarea class="textarea" data-list="features" data-index="${index}" data-field="description" placeholder="Description">${escapeHtml(entry.description || '')}</textarea>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="editor-card">
      <div class="panel-header"><div class="section-title">Notes</div></div>
      <textarea class="textarea" data-bind="notes">${escapeHtml(character.data.notes || '')}</textarea>
    </div>
  `;
}

function renderCompendium() {
  return `
    <div class="compendium-card">
      <div class="panel-header">
        <div>
          <div class="section-title">Compendium</div>
          <div class="hint">Search live entries from the selected database.</div>
        </div>
      </div>
      <div class="compendium-toolbar">
        <div class="tabs">
          ${['spells', 'items', 'features'].map((type) => `
            <button class="tab ${state.compendiumType === type ? 'active' : ''}" data-action="switch-compendium" data-type="${type}">${type}</button>
          `).join('')}
        </div>
        <div class="search-row">
          <input class="input" id="compendium-query" placeholder="Search ${escapeHtml(state.compendiumType)}" value="${escapeHtml(state.compendiumQuery)}" />
          <button class="button primary" data-action="search-compendium">${state.searching ? 'Searching...' : 'Search'}</button>
        </div>
      </div>
      <div class="search-results">
        ${state.compendiumResults.length === 0 ? '<div class="empty">Run a search to populate this pane.</div>' : state.compendiumResults.map((result, index) => `
          <div class="entry">
            <div class="entry-top">
              <div>
                <strong>${escapeHtml(result.name)}</strong>
                <div class="muted">${escapeHtml(result.sourceCode || '')}${result.level != null ? ` · Level ${escapeHtml(result.level)}` : ''}${result.featureType ? ` · ${escapeHtml(result.featureType)}` : ''}</div>
              </div>
              <button class="button subtle" data-action="add-compendium" data-index="${index}">Add</button>
            </div>
            <div class="hint" style="margin-top:8px">${escapeHtml((result.description || 'No description available.').slice(0, 220))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAdminPanel() {
  if (state.session?.role !== 'admin') {
    return '';
  }

  return `
    <div class="panel">
      <div class="panel-header">
        <div class="section-title">User Roles</div>
        <button class="button" data-action="refresh-bootstrap">Refresh</button>
      </div>
      <div class="item-list">
        ${state.users.map((user) => `
          <div class="entry">
            <div class="entry-top">
              <div>
                <strong>${escapeHtml(user.displayName)}</strong>
                <div class="muted">${escapeHtml(user.email)}</div>
              </div>
              <select class="select" data-action="user-role" data-user-id="${escapeHtml(user.id)}" style="width:120px">
                ${['admin', 'gm', 'player'].map((role) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`).join('')}
              </select>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderApp() {
  const character = activeCharacter();

  return `
    <div class="screen">
      <div class="app-shell">
        <header class="panel topbar">
          <div>
            <div class="eyebrow">Codex Arcanum Character Manager</div>
            <div class="topbar-title">Live SRD sheets with auth, RBAC, and provider-aware data access.</div>
            <div class="topbar-meta">Signed in as ${escapeHtml(state.session.displayName)} · ${escapeHtml(state.session.email)}</div>
          </div>
          <div class="button-row">
            <span class="badge">${escapeHtml(state.session.role)}</span>
            <select class="select" data-action="edition-filter" style="width:140px">
              ${[
                ['all', 'All Sources'],
                ['2014', '2014'],
                ['2024', '2024'],
              ].map(([value, label]) => `<option value="${value}" ${state.editionFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <button class="button" data-action="logout">Sign Out</button>
          </div>
        </header>
        ${renderMessage()}
        <div class="workspace">
          <aside class="sidebar">
            <div class="panel">
              <div class="panel-header">
                <div class="section-title">Characters</div>
                <button class="button subtle" data-action="create-character">New</button>
              </div>
              <div class="character-list">
                ${state.characters.length === 0 ? '<div class="empty">No characters yet.</div>' : state.characters.map(renderCharacterPill).join('')}
              </div>
            </div>
            ${renderAdminPanel()}
          </aside>
          <main class="editor">
            ${renderEditor(character)}
          </main>
          <aside class="compendium">
            ${renderCompendium()}
          </aside>
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (state.loading) {
    appRoot.innerHTML = `<div class="screen"><div class="panel"><div class="section-title">Loading</div><div class="empty">Preparing the archive.</div></div></div>`;
    return;
  }

  appRoot.innerHTML = state.session ? renderApp() : renderAuth();
}

appRoot.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) {
    return;
  }

  try {
    switch (target.dataset.action) {
      case 'switch-auth':
        state.authMode = target.dataset.mode;
        setMessage(null, null);
        break;
      case 'submit-auth':
        await handleAuthSubmit();
        break;
      case 'logout':
        await logout();
        break;
      case 'create-character':
        await createCharacterRecord();
        break;
      case 'select-character':
        state.activeCharacterId = target.dataset.characterId;
        render();
        break;
      case 'save-character':
        await saveActiveCharacter();
        break;
      case 'delete-character':
        await deleteActiveCharacter();
        break;
      case 'search-compendium':
        state.compendiumQuery = document.getElementById('compendium-query')?.value || '';
        await runCompendiumSearch();
        break;
      case 'switch-compendium':
        state.compendiumType = target.dataset.type;
        state.compendiumResults = [];
        render();
        break;
      case 'add-compendium':
        addCompendiumEntry(Number(target.dataset.index));
        break;
      case 'toggle-condition':
        toggleCondition(target.dataset.condition);
        break;
      case 'add-entry': {
        const character = activeCharacter();
        if (!character) {
          return;
        }
        const list = target.dataset.list;
        if (list === 'inventory') {
          character.data.inventory.push({ name: '', quantity: 1, notes: '' });
        } else if (list === 'spells') {
          character.data.spells.push({ name: '', level: 0, description: '' });
        } else {
          character.data.features.push({ name: '', source: '', description: '' });
        }
        render();
        break;
      }
      case 'remove-entry': {
        const character = activeCharacter();
        if (!character) {
          return;
        }
        const list = target.dataset.list;
        const index = Number(target.dataset.index);
        character.data[list].splice(index, 1);
        render();
        break;
      }
      case 'refresh-bootstrap':
        await loadBootstrap();
        render();
        break;
      default:
        break;
    }
  } catch (error) {
    setMessage('error', error.message);
  }
});

appRoot.addEventListener('input', (event) => {
  const target = event.target;

  if (target.matches('[data-bind]')) {
    const isNumber = target.type === 'number';
    updateActiveCharacter(target.dataset.bind, isNumber ? Number(target.value || 0) : target.value);
    return;
  }

  if (target.matches('[data-list][data-field]')) {
    const isNumber = target.type === 'number';
    updateListEntry(
      target.dataset.list,
      Number(target.dataset.index),
      target.dataset.field,
      isNumber ? Number(target.value || 0) : target.value
    );
    return;
  }

  if (target.id === 'compendium-query') {
    state.compendiumQuery = target.value;
  }
});

appRoot.addEventListener('change', async (event) => {
  const target = event.target;

  try {
    if (target.dataset.action === 'edition-filter') {
      state.editionFilter = target.value;
      await loadBootstrap();
      render();
      return;
    }

    if (target.dataset.action === 'user-role') {
      await updateUserRoleRequest(target.dataset.userId, target.value);
      return;
    }

    if (target.matches('[data-bind]')) {
      updateActiveCharacter(target.dataset.bind, target.value);
    }
  } catch (error) {
    setMessage('error', error.message);
  }
});

loadSession();
