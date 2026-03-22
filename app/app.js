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
const EDITION_OPTIONS = [
  ['all', 'All Sources'],
  ['2014', '2014 SRD'],
  ['2024', '2024 SRD'],
];
const DIE_OPTIONS = [4, 6, 8, 10, 12, 20];

const state = {
  authMode: 'login',
  session: null,
  permissions: null,
  users: [],
  compendium: null,
  characters: [],
  activeCharacterId: null,
  rosterQuery: '',
  compendiumType: 'spells',
  compendiumQuery: '',
  compendiumResults: [],
  editionFilter: 'all',
  loading: true,
  searching: false,
  message: null,
  dice: {
    count: 1,
    sides: 20,
    modifier: 0,
    rolling: false,
    rollId: 0,
    timeoutId: null,
    lastRoll: null,
    history: [],
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function titleize(value, fallback = 'Unassigned') {
  const normalized = String(value || '')
    .trim()
    .replaceAll(/[-_]+/g, ' ');

  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function editionLabel(value) {
  return EDITION_OPTIONS.find(([code]) => code === value)?.[1] || titleize(value, 'All Sources');
}

function renderMetaBits(bits) {
  const filteredBits = bits.filter(Boolean);
  if (filteredBits.length === 0) {
    return '';
  }

  return filteredBits
    .map((bit) => `<span>${escapeHtml(bit)}</span>`)
    .join('<span class="meta-sep">&middot;</span>');
}

function abilityModifier(score) {
  const modifier = Math.floor((Number(score || 10) - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function clampNumber(value, minimum, maximum, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numericValue));
}

function formatSigned(value) {
  const numericValue = Number(value || 0);
  return numericValue >= 0 ? `+${numericValue}` : String(numericValue);
}

function describeRollFormula(count, sides, modifier = 0) {
  return `${count}d${sides}${Number(modifier) === 0 ? '' : formatSigned(modifier)}`;
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

function getVisibleCharacters() {
  const query = state.rosterQuery.trim().toLowerCase();
  if (!query) {
    return state.characters;
  }

  return state.characters.filter((character) => {
    const haystack = [
      character.name,
      character.ownerDisplayName,
      character.classSlug,
      character.ancestrySlug,
      character.backgroundSlug,
      character.edition,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getCharacterOverview(character) {
  const strongestAbility = ABILITY_KEYS.reduce((bestKey, currentKey) =>
    Number(character.data.abilities[currentKey] || 0) > Number(character.data.abilities[bestKey] || 0)
      ? currentKey
      : bestKey
  );
  const lineageBits = [
    titleize(character.data.ancestrySlug, ''),
    titleize(character.data.classSlug, 'Unclassed'),
    titleize(character.data.backgroundSlug, ''),
  ].filter(Boolean);
  const detailBits = [
    character.ownerDisplayName || '',
    editionLabel(character.data.edition),
    character.data.alignment || '',
  ].filter(Boolean);

  return {
    lineage: lineageBits.join(' / ') || 'An untethered adventurer waiting for a story.',
    detailBits,
    cards: [
      {
        label: 'Level',
        value: character.data.level,
        note: titleize(character.data.classSlug, 'Unclassed'),
      },
      {
        label: 'Hit Points',
        value: `${character.data.hp.current}/${character.data.hp.max}`,
        note: character.data.hp.temp > 0 ? `${character.data.hp.temp} temp` : 'steady',
      },
      {
        label: 'Armor',
        value: character.data.ac,
        note: 'AC',
      },
      {
        label: 'Strongest',
        value: strongestAbility,
        note: abilityModifier(character.data.abilities[strongestAbility]),
      },
      {
        label: 'Loadout',
        value:
          character.data.inventory.length +
          character.data.spells.length +
          character.data.features.length,
        note: 'tracked entries',
      },
    ],
  };
}

function clearDiceTimeout() {
  if (state.dice.timeoutId) {
    window.clearTimeout(state.dice.timeoutId);
    state.dice.timeoutId = null;
  }
}

function setDiceSetting(key, value) {
  if (key === 'count') {
    state.dice.count = clampNumber(value, 1, 6, 1);
    return;
  }

  if (key === 'modifier') {
    state.dice.modifier = clampNumber(value, -50, 50, 0);
    return;
  }

  if (key === 'sides') {
    const numericValue = Number(value);
    state.dice.sides = DIE_OPTIONS.includes(numericValue) ? numericValue : 20;
  }
}

function buildDiceRoll(values, sides, modifier) {
  const subtotal = values.reduce((total, result) => total + result, 0);
  return {
    values,
    sides,
    modifier,
    subtotal,
    total: subtotal + modifier,
    formula: describeRollFormula(values.length, sides, modifier),
    timestamp: new Date().toISOString(),
  };
}

function finishDiceAnimation() {
  state.dice.rolling = false;
  state.dice.timeoutId = null;
  render();
}

function rollDice() {
  const count = clampNumber(state.dice.count, 1, 6, 1);
  const sides = DIE_OPTIONS.includes(Number(state.dice.sides)) ? Number(state.dice.sides) : 20;
  const modifier = clampNumber(state.dice.modifier, -50, 50, 0);
  const values = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const roll = buildDiceRoll(values, sides, modifier);

  clearDiceTimeout();
  state.dice.count = count;
  state.dice.sides = sides;
  state.dice.modifier = modifier;
  state.dice.rollId += 1;
  state.dice.rolling = true;
  state.dice.lastRoll = roll;
  state.dice.history = [roll, ...state.dice.history].slice(0, 5);
  state.dice.timeoutId = window.setTimeout(finishDiceAnimation, 1100);
  render();
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
  let body = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { message: bodyText };
    }
  }

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

  clearDiceTimeout();
  state.session = null;
  state.permissions = null;
  state.users = [];
  state.compendium = null;
  state.characters = [];
  state.activeCharacterId = null;
  state.compendiumResults = [];
  state.rosterQuery = '';
  state.dice = {
    count: 1,
    sides: 20,
    modifier: 0,
    rolling: false,
    rollId: 0,
    timeoutId: null,
    lastRoll: null,
    history: [],
  };
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
  if (!character || !character.data[listName]?.[index]) {
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

  const labels = {
    info: 'Archive Note',
    success: 'Saved to Ledger',
    error: 'Something Broke',
  };

  return `
    <div class="message ${escapeHtml(state.message.type)}">
      <div class="message__label">${escapeHtml(labels[state.message.type] || 'Status')}</div>
      <div class="message__body">${escapeHtml(state.message.text)}</div>
    </div>
  `;
}

function renderAuth() {
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
            <div class="button-row auth-actions">
              <button class="button primary" data-action="submit-auth">${state.authMode === 'login' ? 'Open the Archive' : 'Create Account'}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderCharacterPill(character) {
  const metaBits = [
    titleize(character.classSlug, 'Unclassed'),
    titleize(character.ancestrySlug, ''),
    state.permissions?.canViewAllCharacters ? character.ownerDisplayName : '',
  ];
  return `
    <button class="character-pill ${character.id === state.activeCharacterId ? 'active' : ''}" data-action="select-character" data-character-id="${escapeHtml(character.id)}">
      <div class="character-pill__top">
        <strong>${escapeHtml(character.name)}</strong>
        <span class="pill-badge">Lvl ${escapeHtml(character.level)}</span>
      </div>
      <div class="character-pill__meta">${renderMetaBits(metaBits)}</div>
      <div class="character-pill__footer">
        <span>${escapeHtml(editionLabel(character.edition))}</span>
        <span>${escapeHtml(character.data.alignment || 'True Neutral')}</span>
      </div>
    </button>
  `;
}

function renderSummaryCards(character) {
  const overview = getCharacterOverview(character);
  return overview.cards
    .map(
      (card) => `
        <div class="summary-card">
          <div class="summary-card__label">${escapeHtml(card.label)}</div>
          <div class="summary-card__value">${escapeHtml(card.value)}</div>
          <div class="summary-card__note">${escapeHtml(card.note)}</div>
        </div>
      `
    )
    .join('');
}

function renderInventorySection(character) {
  return `
    <section class="editor-card editor-card--half">
      <div class="panel-header">
        <div>
          <div class="section-title">Inventory</div>
          <div class="muted">${escapeHtml(character.data.inventory.length)} tracked item${character.data.inventory.length === 1 ? '' : 's'}</div>
        </div>
        <button class="button subtle" data-action="add-entry" data-list="inventory">Add Item</button>
      </div>
      <div class="item-list">
        ${
          character.data.inventory.length === 0
            ? '<div class="empty-card">No equipment yet. Pull in an item from the compendium or add one manually.</div>'
            : character.data.inventory
                .map(
                  (entry, index) => `
                    <div class="entry">
                      <div class="entry-top">
                        <strong>${escapeHtml(entry.name || 'Item')}</strong>
                        <button class="button danger" data-action="remove-entry" data-list="inventory" data-index="${index}">Remove</button>
                      </div>
                      <div class="editor-grid editor-grid--tight">
                        <input class="input" data-list="inventory" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" placeholder="Name" />
                        <input class="input" type="number" min="1" data-list="inventory" data-index="${index}" data-field="quantity" value="${escapeHtml(entry.quantity || 1)}" placeholder="Qty" />
                      </div>
                      <textarea class="textarea textarea--compact" data-list="inventory" data-index="${index}" data-field="notes" placeholder="Notes">${escapeHtml(entry.notes || '')}</textarea>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderSpellSection(character) {
  return `
    <section class="editor-card editor-card--half">
      <div class="panel-header">
        <div>
          <div class="section-title">Spellbook</div>
          <div class="muted">${escapeHtml(character.data.spells.length)} spell${character.data.spells.length === 1 ? '' : 's'} prepared</div>
        </div>
        <button class="button subtle" data-action="add-entry" data-list="spells">Add Spell</button>
      </div>
      <div class="item-list">
        ${
          character.data.spells.length === 0
            ? '<div class="empty-card">No spells recorded yet. Search the compendium to seed the list.</div>'
            : character.data.spells
                .map(
                  (entry, index) => `
                    <div class="entry">
                      <div class="entry-top">
                        <strong>${escapeHtml(entry.name || 'Spell')}</strong>
                        <button class="button danger" data-action="remove-entry" data-list="spells" data-index="${index}">Remove</button>
                      </div>
                      <div class="editor-grid editor-grid--tight">
                        <input class="input" data-list="spells" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" placeholder="Name" />
                        <input class="input" type="number" min="0" max="9" data-list="spells" data-index="${index}" data-field="level" value="${escapeHtml(entry.level ?? 0)}" placeholder="Level" />
                      </div>
                      <textarea class="textarea textarea--compact" data-list="spells" data-index="${index}" data-field="description" placeholder="Description">${escapeHtml(entry.description || '')}</textarea>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderFeatureSection(character) {
  return `
    <section class="editor-card editor-card--half">
      <div class="panel-header">
        <div>
          <div class="section-title">Features</div>
          <div class="muted">${escapeHtml(character.data.features.length)} recorded feature${character.data.features.length === 1 ? '' : 's'}</div>
        </div>
        <button class="button subtle" data-action="add-entry" data-list="features">Add Feature</button>
      </div>
      <div class="item-list">
        ${
          character.data.features.length === 0
            ? '<div class="empty-card">No features tracked yet. Pull class or ancestry features in as you build the sheet.</div>'
            : character.data.features
                .map(
                  (entry, index) => `
                    <div class="entry">
                      <div class="entry-top">
                        <strong>${escapeHtml(entry.name || 'Feature')}</strong>
                        <button class="button danger" data-action="remove-entry" data-list="features" data-index="${index}">Remove</button>
                      </div>
                      <input class="input input--compact-gap" data-list="features" data-index="${index}" data-field="source" value="${escapeHtml(entry.source || '')}" placeholder="Source" />
                      <textarea class="textarea textarea--compact" data-list="features" data-index="${index}" data-field="description" placeholder="Description">${escapeHtml(entry.description || '')}</textarea>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderDie(value, sides, index) {
  const rollSeed = state.dice.rollId + index + 1;
  const rollX = 720 + rollSeed * 67;
  const rollY = 900 + rollSeed * 83;
  const drift = ((index % 3) - 1) * 10;
  const displayValue = value == null ? '?' : value;

  return `
    <div
      class="die die--d${sides} ${state.dice.rolling ? 'is-rolling' : ''} ${value == null ? 'die--placeholder' : ''}"
      style="--roll-x:${rollX}deg; --roll-y:${rollY}deg; --drift:${drift}px; --delay:${index * 90}ms"
    >
      <div class="die__shadow"></div>
      <div class="die__body">
        <div class="die__face die__face--front">${escapeHtml(displayValue)}</div>
        <div class="die__face die__face--top">d${escapeHtml(sides)}</div>
        <div class="die__face die__face--side">${escapeHtml(displayValue)}</div>
      </div>
    </div>
  `;
}

function renderDiceHistory() {
  if (state.dice.history.length === 0) {
    return '<div class="empty-card empty-card--dice-history">No rolls yet. Pick a die and throw it.</div>';
  }

  return state.dice.history
    .map(
      (roll) => `
        <div class="dice-history__item">
          <div>
            <strong>${escapeHtml(roll.formula)}</strong>
            <div class="muted">${escapeHtml(roll.values.join(', '))}${roll.modifier === 0 ? '' : ` ${escapeHtml(formatSigned(roll.modifier))}`}</div>
          </div>
          <div class="dice-history__total">${escapeHtml(String(roll.total))}</div>
        </div>
      `
    )
    .join('');
}

function renderDiceTray() {
  const activeRoll = state.dice.lastRoll || {
    values: Array.from({ length: state.dice.count }, () => null),
    sides: state.dice.sides,
    modifier: state.dice.modifier,
    total: null,
    formula: describeRollFormula(state.dice.count, state.dice.sides, state.dice.modifier),
  };
  const diceMarkup = activeRoll.values.map((value, index) => renderDie(value, activeRoll.sides, index)).join('');

  return `
    <section class="editor-card dice-panel">
      <div class="panel-header">
        <div>
          <div class="section-title">Dice Sanctum</div>
          <div class="muted">Roll animated 3D dice in the denomination you pick, with live totals and a short history.</div>
        </div>
        <button class="button primary" data-action="roll-dice">Roll ${escapeHtml(describeRollFormula(state.dice.count, state.dice.sides, state.dice.modifier))}</button>
      </div>
      <div class="dice-panel__controls">
        <label class="field">
          <span class="label">Dice Count</span>
          <input class="input" id="dice-count" type="number" min="1" max="6" value="${escapeHtml(String(state.dice.count))}" />
        </label>
        <label class="field">
          <span class="label">Modifier</span>
          <input class="input" id="dice-modifier" type="number" min="-50" max="50" value="${escapeHtml(String(state.dice.modifier))}" />
        </label>
      </div>
      <div class="dice-denominations">
        ${DIE_OPTIONS.map((sides) => `
          <button class="die-chip ${state.dice.sides === sides ? 'active' : ''}" data-action="pick-die" data-sides="${sides}">
            d${sides}
          </button>
        `).join('')}
      </div>
      <div class="dice-stage ${state.dice.rolling ? 'is-rolling' : ''}">
        <div class="dice-stage__dice">
          ${diceMarkup}
        </div>
        <div class="dice-stage__summary">
          <div class="dice-stage__formula">${escapeHtml(activeRoll.formula)}</div>
          <div class="dice-stage__total">${escapeHtml(activeRoll.total == null ? '--' : String(activeRoll.total))}</div>
          <div class="muted">
            ${state.dice.lastRoll
              ? `Individual dice: ${escapeHtml(activeRoll.values.join(', '))}`
              : 'Pick a denomination, set a count, and roll to throw the dice into the tray.'}
          </div>
        </div>
      </div>
      <div class="dice-history">
        ${renderDiceHistory()}
      </div>
    </section>
  `;
}

function renderEditor(character) {
  if (!character) {
    return `
      <div class="editor-card empty-sheet">
        <div class="eyebrow">No Active Sheet</div>
        <h2 class="empty-sheet__title">Start by creating a character.</h2>
        <p class="empty-sheet__copy">The roster will pin it immediately so you can shape the sheet, search the compendium, and save progress in place.</p>
        <div class="button-row">
          <button class="button primary" data-action="create-character">Create Character</button>
        </div>
      </div>
    `;
  }

  const overview = getCharacterOverview(character);

  return `
    <div class="sheet-grid">
      <section class="editor-card editor-card--hero">
        <div class="character-hero">
          <div class="character-hero__copy">
            <div class="eyebrow">Active Character</div>
            <h2 class="character-title">${escapeHtml(character.data.name)}</h2>
            <div class="character-lineage">${escapeHtml(overview.lineage)}</div>
            <div class="meta-row">${renderMetaBits(overview.detailBits)}</div>
          </div>
          <div class="button-row">
            <button class="button subtle" data-action="save-character">Save Sheet</button>
            <button class="button danger" data-action="delete-character">Delete</button>
          </div>
        </div>
        <div class="summary-grid">
          ${renderSummaryCards(character)}
        </div>
      </section>

      <section class="editor-card editor-card--identity">
        <div class="panel-header">
          <div>
            <div class="section-title">Identity</div>
            <div class="muted">Core sheet setup and source alignment.</div>
          </div>
        </div>
        <div class="editor-grid editor-grid--three">
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
              ${EDITION_OPTIONS.map(([value, label]) => `<option value="${value}" ${character.data.edition === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Class</span>
            <select class="select" data-bind="classSlug">
              <option value="">Choose a class</option>
              ${(state.compendium?.classes || [])
                .map(
                  (entry) => `
                    <option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.classSlug ? 'selected' : ''}>
                      ${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}
                    </option>
                  `
                )
                .join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Ancestry</span>
            <select class="select" data-bind="ancestrySlug">
              <option value="">Choose an ancestry</option>
              ${(state.compendium?.ancestries || [])
                .map(
                  (entry) => `
                    <option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.ancestrySlug ? 'selected' : ''}>
                      ${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}
                    </option>
                  `
                )
                .join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Background</span>
            <select class="select" data-bind="backgroundSlug">
              <option value="">Choose a background</option>
              ${(state.compendium?.backgrounds || [])
                .map(
                  (entry) => `
                    <option value="${escapeHtml(entry.slug)}" ${entry.slug === character.data.backgroundSlug ? 'selected' : ''}>
                      ${escapeHtml(entry.name)}${entry.sourceCode ? ` (${escapeHtml(entry.sourceCode)})` : ''}
                    </option>
                  `
                )
                .join('')}
            </select>
          </label>
        </div>
      </section>

      <section class="editor-card editor-card--combat">
        <div class="panel-header">
          <div>
            <div class="section-title">Combat Snapshot</div>
            <div class="muted">Keep the live state visible and quick to update.</div>
          </div>
        </div>
        <div class="resource-grid">
          <label class="field"><span class="label">Level</span><input class="input" type="number" min="1" max="20" data-bind="level" value="${escapeHtml(character.data.level)}" /></label>
          <label class="field"><span class="label">HP Max</span><input class="input" type="number" min="1" data-bind="hp.max" value="${escapeHtml(character.data.hp.max)}" /></label>
          <label class="field"><span class="label">HP Current</span><input class="input" type="number" min="0" data-bind="hp.current" value="${escapeHtml(character.data.hp.current)}" /></label>
          <label class="field"><span class="label">Temp HP</span><input class="input" type="number" min="0" data-bind="hp.temp" value="${escapeHtml(character.data.hp.temp || 0)}" /></label>
          <label class="field"><span class="label">Armor Class</span><input class="input" type="number" min="0" data-bind="ac" value="${escapeHtml(character.data.ac)}" /></label>
          <label class="field"><span class="label">Speed</span><input class="input" type="number" min="0" data-bind="speed" value="${escapeHtml(character.data.speed)}" /></label>
          <label class="field"><span class="label">Initiative</span><input class="input" type="number" min="-20" max="20" data-bind="initiative" value="${escapeHtml(character.data.initiative)}" /></label>
        </div>
        <div class="stack stack--section-gap">
          <div class="section-title">Conditions</div>
          <div class="condition-grid">
            ${(state.compendium?.conditions || [])
              .map(
                (condition) => `
                  <button class="condition-chip ${character.data.conditions.includes(condition.code) ? 'active' : ''}" data-action="toggle-condition" data-condition="${escapeHtml(condition.code)}">${escapeHtml(condition.name)}</button>
                `
              )
              .join('')}
          </div>
        </div>
      </section>

      <section class="editor-card editor-card--abilities">
        <div class="panel-header">
          <div>
            <div class="section-title">Ability Scores</div>
            <div class="muted">Modifiers stay visible while you tune the sheet.</div>
          </div>
        </div>
        <div class="ability-grid">
          ${ABILITY_KEYS.map((ability) => `
            <div class="ability-card">
              <div class="ability-card__label">${escapeHtml(ABILITY_LABELS[ability])}</div>
              <strong>${escapeHtml(ability)}</strong>
              <input class="input ability-input" type="number" min="1" max="30" data-bind="abilities.${ability}" value="${escapeHtml(character.data.abilities[ability])}" />
              <div class="ability-mod">${escapeHtml(abilityModifier(character.data.abilities[ability]))}</div>
            </div>
          `).join('')}
        </div>
      </section>

      ${renderInventorySection(character)}
      ${renderSpellSection(character)}
      ${renderFeatureSection(character)}

      <section class="editor-card editor-card--notes">
        <div class="panel-header">
          <div>
            <div class="section-title">Notes</div>
            <div class="muted">Session notes, reminders, and build context.</div>
          </div>
        </div>
        <textarea class="textarea textarea--notes" data-bind="notes">${escapeHtml(character.data.notes || '')}</textarea>
      </section>
    </div>
  `;
}

function renderCompendiumResult(result, index) {
  const metaBits = [
    result.sourceCode || '',
    result.level != null ? `Level ${result.level}` : '',
    result.featureType || '',
  ];

  return `
    <article class="result-card">
      <div class="result-card__header">
        <div>
          <strong>${escapeHtml(result.name)}</strong>
          <div class="muted">${renderMetaBits(metaBits)}</div>
        </div>
        <button class="button subtle" data-action="add-compendium" data-index="${index}">Add</button>
      </div>
      <div class="result-card__body">${escapeHtml((result.description || 'No description available.').slice(0, 260))}</div>
    </article>
  `;
}

function renderCompendium() {
  return `
    <div class="compendium-card">
      <div class="panel-header">
        <div>
          <div class="section-title">Compendium</div>
          <div class="muted">Search the selected source set and push entries straight onto the active sheet.</div>
        </div>
        <div class="mini-badge">${escapeHtml(String(state.compendiumResults.length))} results</div>
      </div>
      <div class="compendium-toolbar">
        <div class="tabs tabs--stretch">
          ${['spells', 'items', 'features']
            .map(
              (type) => `
                <button class="tab ${state.compendiumType === type ? 'active' : ''}" data-action="switch-compendium" data-type="${type}">${escapeHtml(titleize(type.slice(0, -1), type))}</button>
              `
            )
            .join('')}
        </div>
        <div class="search-row">
          <input class="input" id="compendium-query" placeholder="Search ${escapeHtml(state.compendiumType)} by name or keyword" value="${escapeHtml(state.compendiumQuery)}" />
          <button class="button primary" data-action="search-compendium">${state.searching ? 'Searching...' : 'Search'}</button>
        </div>
      </div>
      <div class="search-results">
        ${
          state.compendiumResults.length === 0
            ? `<div class="empty-card empty-card--compendium">Search ${escapeHtml(state.compendiumType)} by name or keyword. Results land here with quick add actions for the active character.</div>`
            : state.compendiumResults.map(renderCompendiumResult).join('')
        }
      </div>
    </div>
  `;
}

function renderAdminPanel() {
  if (state.session?.role !== 'admin') {
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
        ${state.users
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

function renderSidebar() {
  const visibleCharacters = getVisibleCharacters();

  return `
    <section class="panel roster-panel">
      <div class="panel-header">
        <div>
          <div class="section-title">Roster</div>
          <div class="muted">${escapeHtml(String(visibleCharacters.length))} shown of ${escapeHtml(String(state.characters.length))}</div>
        </div>
        <button class="button primary" data-action="create-character">New Character</button>
      </div>
      <label class="field">
        <span class="label">Search Roster</span>
        <input class="input" id="roster-query" placeholder="Name, class, ancestry, owner" value="${escapeHtml(state.rosterQuery)}" />
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

function renderApp() {
  const character = activeCharacter();

  return `
    <div class="screen app-screen">
      <div class="app-shell">
        <header class="panel topbar">
          <div class="topbar__copy">
            <div class="eyebrow">Codex Arcanum Character Manager</div>
            <div class="topbar-title">A sharper campaign workspace for building, tracking, and curating characters.</div>
            <div class="topbar-meta">${renderMetaBits([`Signed in as ${state.session.displayName}`, state.session.email])}</div>
          </div>
          <div class="topbar__actions">
            <div class="topbar__badges">
              <span class="badge">${escapeHtml(titleize(state.session.role, state.session.role))}</span>
              <span class="badge badge--muted">${escapeHtml(String(state.characters.length))} characters</span>
            </div>
            <select class="select" data-action="edition-filter">
              ${EDITION_OPTIONS.map(([value, label]) => `<option value="${value}" ${state.editionFilter === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
            <button class="button" data-action="logout">Sign Out</button>
          </div>
        </header>
        ${renderMessage()}
        <div class="workspace">
          <aside class="sidebar">
            ${renderSidebar()}
            ${renderAdminPanel()}
          </aside>
          <main class="editor">
            ${renderDiceTray()}
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
    appRoot.innerHTML = `
      <div class="screen loading-screen">
        <div class="panel loading-card">
          <div class="eyebrow">Preparing the Archive</div>
          <h1 class="loading-title">Loading the character workspace.</h1>
          <p class="muted">Pulling session state, roster data, and the live compendium.</p>
        </div>
      </div>
    `;
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
      case 'pick-die':
        setDiceSetting('sides', Number(target.dataset.sides));
        render();
        break;
      case 'roll-dice':
        rollDice();
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
    return;
  }

  if (target.id === 'roster-query') {
    state.rosterQuery = target.value;
    render();
  }
});

appRoot.addEventListener('change', async (event) => {
  const target = event.target;

  try {
    if (target.id === 'dice-count') {
      setDiceSetting('count', target.value);
      render();
      return;
    }

    if (target.id === 'dice-modifier') {
      setDiceSetting('modifier', target.value);
      render();
      return;
    }

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
