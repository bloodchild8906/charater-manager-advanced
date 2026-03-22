/* global document, window */

const appRoot = document.getElementById('app');
const floatingRoot = ensureFloatingRoot();
const compendiumRoot = ensureFloatingSurface('compendium-window-root');
const diceRoot = ensureFloatingSurface('dice-toolbar-root');

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
const STANDARD_ABILITY_ARRAY = [15, 14, 13, 12, 10, 8];
const SHEET_TABS = [
  ['core', 'Core'],
  ['combat', 'Combat'],
  ['inventory', 'Inventory'],
  ['spells', 'Spells'],
  ['features', 'Features'],
  ['notes', 'Notes'],
];
const DICE_BOX_MODULE_PATH = '/vendor/dice-box/dice-box.es.js';

const state = {
  authMode: 'login',
  session: null,
  permissions: null,
  users: [],
  compendium: null,
  characters: [],
  activeCharacterId: null,
  rosterQuery: '',
  sheetTab: 'core',
  compendiumType: 'spells',
  compendiumQuery: '',
  compendiumResults: [],
  compendiumOpen: false,
  compendiumHidden: false,
  compendiumPinned: true,
  compendiumDock: 'right',
  compendiumPosition: {
    x: null,
    y: null,
  },
  compendiumSize: {
    width: 680,
    height: 720,
  },
  compendiumDetailIndex: null,
  editionFilter: 'all',
  loading: true,
  searching: false,
  message: null,
  createFlowOpen: false,
  wizard: null,
  dice: {
    open: false,
    count: 1,
    sides: 20,
    modifier: 0,
    models: [],
    activeModelKey: null,
    rolling: false,
    ready: false,
    initPending: false,
    initError: null,
    rollId: 0,
    lastRoll: null,
    history: [],
  },
};

let diceBoxImportPromise = null;
let diceBoxInitPromise = null;
let diceBoxInstance = null;
let compendiumDragState = null;

function ensureFloatingRoot() {
  let root = document.getElementById('floating-overlay-root');
  if (root) {
    return root;
  }

  root = document.createElement('div');
  root.id = 'floating-overlay-root';
  document.body.append(root);
  return root;
}

function ensureFloatingSurface(id) {
  let surface = document.getElementById(id);
  if (surface) {
    return surface;
  }

  surface = document.createElement('div');
  surface.id = id;
  surface.className = 'floating-surface';
  floatingRoot.append(surface);
  return surface;
}

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

function getAbilityModifierValue(score) {
  return Math.floor((Number(score || 10) - 10) / 2);
}

function abilityModifier(score) {
  const modifier = getAbilityModifierValue(score);
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

function getDefaultDiceModel(models = state.dice.models) {
  if (!Array.isArray(models) || models.length === 0) {
    return null;
  }

  return models.find((model) => model.isDefault) || models[0] || null;
}

function getActiveDiceModel() {
  return (
    state.dice.models.find((model) => model.key === state.dice.activeModelKey) ||
    getDefaultDiceModel() ||
    null
  );
}

function buildDiceBoxConfig(model = getActiveDiceModel()) {
  const baseConfig = model?.config && typeof model.config === 'object' ? model.config : {};
  const theme = model?.theme || 'default';

  return {
    ...baseConfig,
    assetPath: model?.assetPath || '/assets/',
    theme,
    ...(model?.themeColor ? { themeColor: model.themeColor } : {}),
    ...(model?.externalThemeUrl ? { externalThemes: { [theme]: model.externalThemeUrl } } : {}),
  };
}

function clampCompendiumPosition(position = state.compendiumPosition) {
  const width = Math.min(state.compendiumSize.width, Math.max(360, window.innerWidth - 32));
  const height = Math.min(state.compendiumSize.height, Math.max(420, window.innerHeight - 32));
  const maxX = Math.max(16, window.innerWidth - width - 16);
  const maxY = Math.max(16, window.innerHeight - height - 16);

  return {
    x: clampNumber(position.x, 16, maxX, maxX),
    y: clampNumber(position.y, 16, maxY, 112),
  };
}

function ensureCompendiumPosition() {
  if (state.compendiumDock) {
    return;
  }

  state.compendiumPosition = clampCompendiumPosition({
    x: state.compendiumPosition.x,
    y: state.compendiumPosition.y,
  });
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBlankAbilityAssignments() {
  return Object.fromEntries(ABILITY_KEYS.map((ability) => [ability, null]));
}

function getCompendiumEntries(type) {
  if (!state.compendium) {
    return [];
  }

  return state.compendium[type] || [];
}

function getCompendiumEntryBySlug(type, slug) {
  return getCompendiumEntries(type).find((entry) => entry.slug === slug) || null;
}

function getClassHitDie(classSlug) {
  return Number(getCompendiumEntryBySlug('classes', classSlug)?.hitDie || 8);
}

function buildStartingCombatProfile(draft) {
  const conModifier = getAbilityModifierValue(draft.abilities.CON);
  const dexModifier = getAbilityModifierValue(draft.abilities.DEX);
  const hitDie = getClassHitDie(draft.classSlug);
  const hpMax = Math.max(1, hitDie + conModifier);

  return {
    hp: {
      max: hpMax,
      current: hpMax,
      temp: 0,
    },
    ac: Math.max(10, 10 + dexModifier),
    speed: draft.speed || 30,
    initiative: dexModifier,
  };
}

function createWizardState(mode, character = null) {
  if (mode === 'levelup' && character) {
    const draft = deepClone(character.data);
    return {
      mode,
      step: 0,
      characterId: character.id,
      characterName: character.data.name || character.name,
      nextLevel: Math.min(20, Number(character.data.level || 1) + 1),
      hpGain: Math.max(
        1,
        Math.floor(getClassHitDie(character.data.classSlug) / 2) +
          1 +
          getAbilityModifierValue(character.data.abilities.CON)
      ),
      draft,
    };
  }

  const firstClass = getCompendiumEntries('classes')[0]?.slug || '';
  const firstAncestry = getCompendiumEntries('ancestries')[0]?.slug || '';
  const firstBackground = getCompendiumEntries('backgrounds')[0]?.slug || '';
  const draft = {
    ...createDefaultCharacter(),
    classSlug: firstClass,
    ancestrySlug: firstAncestry,
    backgroundSlug: firstBackground,
  };
  Object.assign(draft, buildStartingCombatProfile(draft));

  return {
    mode: 'create',
    step: 0,
    draft,
    assignedScores: createBlankAbilityAssignments(),
    availableScores: [...STANDARD_ABILITY_ARRAY],
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

function openCreateFlow() {
  state.createFlowOpen = true;
  render();
}

function closeCreateFlow() {
  state.createFlowOpen = false;
  render();
}

function openWizard(mode, character = null) {
  state.createFlowOpen = false;
  state.wizard = createWizardState(mode, character);
  render();
}

function closeWizard() {
  state.wizard = null;
  render();
}

function setSheetTab(tab) {
  if (!SHEET_TABS.find(([value]) => value === tab)) {
    return;
  }

  state.sheetTab = tab;
  render();
}

function setCompendiumOpen(open) {
  state.compendiumOpen = open;
  state.compendiumHidden = false;
  if (open && state.compendiumResults.length > 0 && state.compendiumDetailIndex == null) {
    state.compendiumDetailIndex = 0;
  } else if (!open) {
    state.compendiumDetailIndex = null;
  }
  render();
}

function hideCompendiumWindow() {
  if (!state.compendiumOpen) {
    return;
  }

  state.compendiumHidden = true;
  renderFloatingSurfaces();
}

function restoreCompendiumWindow() {
  state.compendiumOpen = true;
  state.compendiumHidden = false;
  renderFloatingSurfaces();
}

function toggleCompendiumPin() {
  state.compendiumPinned = !state.compendiumPinned;
  renderFloatingSurfaces();
}

function setCompendiumDock(side) {
  if (state.compendiumDock === side) {
    state.compendiumDock = null;
    ensureCompendiumPosition();
  } else {
    state.compendiumDock = side;
    state.compendiumHidden = false;
  }

  renderFloatingSurfaces();
}

function updateWizardDraft(path, value) {
  if (!state.wizard?.draft) {
    return;
  }

  const parts = path.split('.');
  let target = state.wizard.draft;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  target[parts[0]] = value;

  if (path === 'classSlug' || path === 'abilities.CON' || path === 'abilities.DEX') {
    const startingProfile = buildStartingCombatProfile(state.wizard.draft);
    if (state.wizard.mode === 'create') {
      state.wizard.draft.hp.max = startingProfile.hp.max;
      state.wizard.draft.hp.current = startingProfile.hp.current;
    }
    state.wizard.draft.ac = startingProfile.ac;
    state.wizard.draft.initiative = startingProfile.initiative;
  }
}

function setWizardScore(ability, score) {
  const wizard = state.wizard;
  if (!wizard || wizard.mode !== 'create') {
    return;
  }

  const current = wizard.assignedScores[ability];
  if (current != null) {
    wizard.availableScores.push(current);
  }

  if (score == null) {
    wizard.assignedScores[ability] = null;
    wizard.availableScores.sort((left, right) => right - left);
    render();
    return;
  }

  const scoreIndex = wizard.availableScores.indexOf(score);
  if (scoreIndex === -1) {
    return;
  }

  wizard.availableScores.splice(scoreIndex, 1);
  wizard.assignedScores[ability] = score;
  wizard.draft.abilities[ability] = score;
  const startingProfile = buildStartingCombatProfile(wizard.draft);
  wizard.draft.ac = startingProfile.ac;
  wizard.draft.initiative = startingProfile.initiative;
  wizard.availableScores.sort((left, right) => right - left);
  render();
}

function getWizardSteps() {
  if (!state.wizard) {
    return [];
  }

  return state.wizard.mode === 'levelup'
    ? ['Advance', 'Review']
    : ['Identity', 'Lineage', 'Abilities', 'Combat', 'Review'];
}

function canAdvanceWizard() {
  const wizard = state.wizard;
  if (!wizard) {
    return false;
  }

  if (wizard.mode === 'levelup') {
    return wizard.nextLevel <= 20 && Number(wizard.hpGain) > 0;
  }

  if (wizard.step === 0) {
    return wizard.draft.name.trim().length > 0;
  }

  if (wizard.step === 1) {
    return Boolean(wizard.draft.classSlug && wizard.draft.ancestrySlug && wizard.draft.backgroundSlug);
  }

  if (wizard.step === 2) {
    return ABILITY_KEYS.every((ability) => wizard.assignedScores[ability] != null);
  }

  return true;
}

function applyRecommendedWizardStats() {
  if (!state.wizard?.draft) {
    return;
  }

  Object.assign(state.wizard.draft, buildStartingCombatProfile(state.wizard.draft));
  render();
}

async function advanceWizard() {
  const wizard = state.wizard;
  if (!wizard) {
    return;
  }

  const steps = getWizardSteps();
  if (wizard.step < steps.length - 1) {
    wizard.step += 1;
    render();
    return;
  }

  if (wizard.mode === 'levelup') {
    const updatedData = deepClone(wizard.draft);
    updatedData.level = wizard.nextLevel;
    updatedData.hp.max = Number(updatedData.hp.max) + Number(wizard.hpGain);
    updatedData.hp.current = Math.min(updatedData.hp.max, Number(updatedData.hp.current) + Number(wizard.hpGain));
    await updateCharacterRecord(wizard.characterId, updatedData, 'Character leveled up.');
    state.wizard = null;
    render();
    return;
  }

  await createCharacterRecord(deepClone(wizard.draft));
  state.wizard = null;
  render();
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

function buildDiceRollFromResults(results, sides, modifier) {
  const values = (Array.isArray(results) ? results : [])
    .map((entry) => Number(entry?.value))
    .filter((value) => Number.isFinite(value));

  return buildDiceRoll(values, sides, modifier);
}

function syncDiceModels(models) {
  const nextModels = Array.isArray(models) ? models : [];
  const currentModelStillExists = nextModels.some((model) => model.key === state.dice.activeModelKey);
  const defaultModel = getDefaultDiceModel(nextModels);

  state.dice.models = nextModels;
  state.dice.activeModelKey = currentModelStillExists ? state.dice.activeModelKey : defaultModel?.key || null;
}

async function applyDiceModelToBox() {
  if (!diceBoxInstance) {
    return;
  }

  const model = getActiveDiceModel();
  if (!model) {
    state.dice.initError = 'No dice model is available from the database.';
    state.dice.ready = false;
    renderFloatingSurfaces();
    return;
  }

  state.dice.initPending = true;
  state.dice.initError = null;
  renderFloatingSurfaces();

  try {
    await diceBoxInstance.updateConfig(buildDiceBoxConfig(model));
    state.dice.ready = true;
    window.dispatchEvent(new Event('resize'));
  } catch (error) {
    state.dice.ready = false;
    state.dice.initError = error.message;
    throw error;
  } finally {
    state.dice.initPending = false;
    renderFloatingSurfaces();
  }
}

async function setDiceModel(modelKey) {
  const nextModel =
    state.dice.models.find((model) => model.key === modelKey) ||
    getDefaultDiceModel();

  if (!nextModel) {
    return;
  }

  state.dice.activeModelKey = nextModel.key;
  renderFloatingSurfaces();

  if (diceBoxInstance) {
    await applyDiceModelToBox();
  }
}

async function ensureDiceBox() {
  ensureDiceToolbarChrome();
  if (diceBoxInstance) {
    state.dice.ready = true;
    return diceBoxInstance;
  }

  if (diceBoxInitPromise) {
    return diceBoxInitPromise;
  }

  state.dice.initPending = true;
  state.dice.initError = null;
  renderFloatingSurfaces();

  diceBoxInitPromise = (async () => {
    if (!diceBoxImportPromise) {
      diceBoxImportPromise = import(DICE_BOX_MODULE_PATH);
    }

    const { default: DiceBox } = await diceBoxImportPromise;
    const activeModel = getActiveDiceModel();
    if (!activeModel) {
      throw new Error('No dice model is available from the database.');
    }
    diceBoxInstance = new DiceBox({
      id: 'codex-dice-box',
      container: '#dice-box-host',
      ...buildDiceBoxConfig(activeModel),
    });
    await diceBoxInstance.init();
    state.dice.ready = true;
    state.dice.initError = null;
    window.dispatchEvent(new Event('resize'));
    return diceBoxInstance;
  })()
    .catch((error) => {
      diceBoxInstance = null;
      state.dice.ready = false;
      state.dice.initError = error.message;
      throw error;
    })
    .finally(() => {
      state.dice.initPending = false;
      diceBoxInitPromise = null;
      renderFloatingSurfaces();
    });

  return diceBoxInitPromise;
}

async function rollDice() {
  const count = clampNumber(state.dice.count, 1, 6, 1);
  const sides = DIE_OPTIONS.includes(Number(state.dice.sides)) ? Number(state.dice.sides) : 20;
  const modifier = clampNumber(state.dice.modifier, -50, 50, 0);
  state.dice.count = count;
  state.dice.sides = sides;
  state.dice.modifier = modifier;
  state.dice.open = true;
  state.dice.rollId += 1;
  state.dice.rolling = true;
  state.dice.initError = null;
  renderFloatingSurfaces();

  const activeRollId = state.dice.rollId;

  try {
    const box = await ensureDiceBox();
    const roll = buildDiceRollFromResults(
      await box.roll(describeRollFormula(count, sides, modifier)),
      sides,
      modifier
    );

    if (state.dice.rollId !== activeRollId) {
      return;
    }

    state.dice.lastRoll = roll;
    state.dice.history = [roll, ...state.dice.history].slice(0, 5);
  } catch (error) {
    if (state.dice.rollId === activeRollId) {
      state.dice.initError = error.message;
    }
    setMessage('error', error.message);
  } finally {
    if (state.dice.rollId === activeRollId) {
      state.dice.rolling = false;
      renderFloatingSurfaces();
    }
  }
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
  syncDiceModels(payload.diceModels || []);
  state.characters = (payload.characters || []).map(normalizeCharacter);
  state.activeCharacterId =
    state.characters.find((character) => character.id === state.activeCharacterId)?.id ||
    state.characters[0]?.id ||
    null;
  state.compendiumResults = [];

  if (diceBoxInstance) {
    try {
      await applyDiceModelToBox();
    } catch (error) {
      setMessage('error', error.message);
    }
  }
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
  state.sheetTab = 'core';
  state.compendiumResults = [];
  state.compendiumOpen = false;
  state.compendiumHidden = false;
  state.compendiumPinned = true;
  state.compendiumDock = 'right';
  state.compendiumPosition = {
    x: null,
    y: null,
  };
  state.compendiumDetailIndex = null;
  state.rosterQuery = '';
  state.createFlowOpen = false;
  state.wizard = null;
  state.dice = {
    open: false,
    count: 1,
    sides: 20,
    modifier: 0,
    models: [],
    activeModelKey: null,
    rolling: false,
    ready: false,
    initPending: false,
    initError: null,
    rollId: 0,
    lastRoll: null,
    history: [],
  };
  diceBoxInstance = null;
  diceBoxInitPromise = null;
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

function upsertCharacterRecord(updatedCharacter) {
  const existingIndex = state.characters.findIndex((entry) => entry.id === updatedCharacter.id);
  if (existingIndex === -1) {
    state.characters.unshift(updatedCharacter);
  } else {
    state.characters = state.characters.map((entry) => (entry.id === updatedCharacter.id ? updatedCharacter : entry));
  }

  state.activeCharacterId = updatedCharacter.id;
}

async function createCharacterRecord(initialData = createDefaultCharacter()) {
  const payload = await api('/api/characters', {
    method: 'POST',
    body: JSON.stringify(initialData),
  });

  const character = normalizeCharacter(payload.character);
  upsertCharacterRecord(character);
  state.sheetTab = 'core';
  setMessage('success', 'Character created.');
}

async function updateCharacterRecord(characterId, data, successMessage = 'Character saved.') {
  const payload = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  const updated = normalizeCharacter(payload.character);
  upsertCharacterRecord(updated);
  state.sheetTab = 'core';
  setMessage('success', successMessage);
  return updated;
}

async function saveActiveCharacter() {
  const character = activeCharacter();
  if (!character) {
    return;
  }

  syncCharacter(character);
  await updateCharacterRecord(character.id, character.data);
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
    state.compendiumDetailIndex = state.compendiumResults.length > 0 ? 0 : null;
  } catch (error) {
    setMessage('error', error.message);
  } finally {
    state.searching = false;
    render();
  }
}

function addCompendiumEntry(index, targetList = null) {
  const result = state.compendiumResults[index];
  const character = activeCharacter();
  if (!result || !character) {
    return;
  }

  const resolvedList =
    targetList ||
    (state.compendiumType === 'spells'
      ? 'spells'
      : state.compendiumType === 'items'
        ? 'inventory'
        : 'features');
  const preferredList =
    state.compendiumType === 'spells'
      ? 'spells'
      : state.compendiumType === 'items'
        ? 'inventory'
        : 'features';

  if (targetList && resolvedList !== preferredList) {
    setMessage('info', `${titleize(state.compendiumType, 'Compendium')} entries should be dropped onto ${preferredList}.`);
    return;
  }

  if (resolvedList === 'spells') {
    character.data.spells.push({
      name: result.name,
      level: result.level ?? 0,
      source: result.sourceCode || '',
      description: result.description || '',
    });
  } else if (resolvedList === 'inventory') {
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

  if (!state.compendiumPinned) {
    state.compendiumHidden = true;
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
    <section class="editor-card editor-card--section droppable-zone" data-dropzone="inventory">
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
    <section class="editor-card editor-card--section droppable-zone" data-dropzone="spells">
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
    <section class="editor-card editor-card--section droppable-zone" data-dropzone="features">
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

function renderDiceHistory() {
  if (state.dice.history.length === 0) {
    return '<div class="empty-card empty-card--dice-history">No rolls yet. Pick a die and let Dice Box handle the throw.</div>';
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

function getSelectedCompendiumResult() {
  return state.compendiumResults[state.compendiumDetailIndex] || null;
}

function renderDiceSummary() {
  const activeRoll = state.dice.lastRoll || {
    total: null,
    formula: describeRollFormula(state.dice.count, state.dice.sides, state.dice.modifier),
    values: [],
    modifier: state.dice.modifier,
  };
  const activeModel = getActiveDiceModel();

  return `
    <div class="muted">${escapeHtml(activeModel?.name || 'No dice model')}</div>
    <div class="dice-stage__formula">${escapeHtml(activeRoll.formula)}</div>
    <div class="dice-stage__total">${escapeHtml(activeRoll.total == null ? '--' : String(activeRoll.total))}</div>
    <div class="muted">
      ${
        state.dice.initError
          ? escapeHtml(state.dice.initError)
          : state.dice.rolling
            ? 'Rolling through Dice Box...'
            : state.dice.lastRoll
              ? `Individual dice: ${escapeHtml(activeRoll.values.join(', '))}${activeRoll.modifier === 0 ? '' : ` ${escapeHtml(formatSigned(activeRoll.modifier))}`}`
              : 'Pick a denomination, set the quantity, and roll a real Dice Box scene.'
      }
    </div>
  `;
}

function renderDiceToolbarRail() {
  return `
    <button class="dice-toolbar__toggle" data-action="toggle-dice-toolbar">${state.dice.open ? 'Hide Dice' : 'Dice Toolbar'}</button>
    ${DIE_OPTIONS.map((sides) => `
      <button class="dice-toolbar__quick ${state.dice.sides === sides ? 'active' : ''}" data-action="quick-roll-die" data-sides="${sides}">d${sides}</button>
    `).join('')}
    <button class="button primary dice-toolbar__roll" data-action="roll-dice" ${state.dice.initPending ? 'disabled' : ''}>Roll ${escapeHtml(describeRollFormula(state.dice.count, state.dice.sides, state.dice.modifier))}</button>
  `;
}

function renderDiceToolbarControls() {
  const activeModel = getActiveDiceModel();

  return `
    <div class="dice-toolbar__panel-copy">
      <div>
        <div class="section-title">Dice Box</div>
        <div class="muted">Real 3D dice driven by the dice-model records in the database.</div>
      </div>
      <div class="dice-panel__controls">
        <label class="field">
          <span class="label">Model</span>
          <select class="select" id="dice-model" ${state.dice.models.length === 0 ? 'disabled' : ''}>
            ${
              state.dice.models.length === 0
                ? '<option value="">No models available</option>'
                : state.dice.models
                    .map(
                      (model) => `
                        <option value="${escapeHtml(model.key)}" ${activeModel?.key === model.key ? 'selected' : ''}>
                          ${escapeHtml(model.name)}
                        </option>
                      `
                    )
                    .join('')
            }
          </select>
        </label>
        <label class="field">
          <span class="label">Dice Count</span>
          <input class="input" id="dice-count" type="number" min="1" max="6" value="${escapeHtml(String(state.dice.count))}" />
        </label>
        <label class="field">
          <span class="label">Modifier</span>
          <input class="input" id="dice-modifier" type="number" min="-50" max="50" value="${escapeHtml(String(state.dice.modifier))}" />
        </label>
      </div>
    </div>
  `;
}

function renderDiceStageStatus() {
  if (state.dice.initError) {
    return `<div class="dice-stage__status-copy">Dice Box failed to load.<br />${escapeHtml(state.dice.initError)}</div>`;
  }

  if (state.dice.initPending) {
    return '<div class="dice-stage__status-copy">Loading Dice Box assets...</div>';
  }

  if (!state.dice.ready) {
    return '<div class="dice-stage__status-copy">Open the tray and roll to initialize the 3D scene.</div>';
  }

  return '';
}

function ensureDiceToolbarChrome() {
  if (diceRoot.dataset.ready === 'true') {
    return;
  }

  diceRoot.innerHTML = `
    <section class="dice-toolbar-shell">
      <div class="dice-toolbar__rail" data-dice-rail></div>
      <div class="dice-toolbar__panel">
        <div data-dice-controls></div>
        <div class="dice-stage">
          <div class="dice-stage__viewport">
            <div class="dice-box-host" id="dice-box-host"></div>
            <div class="dice-stage__status" data-dice-stage-status></div>
          </div>
          <div class="dice-stage__summary" data-dice-summary></div>
        </div>
        <div class="dice-history" data-dice-history></div>
      </div>
    </section>
  `;
  diceRoot.dataset.ready = 'true';
}

function syncDiceToolbarState() {
  if (!state.session) {
    diceRoot.innerHTML = '';
    delete diceRoot.dataset.ready;
    return;
  }

  ensureDiceToolbarChrome();
  const shell = diceRoot.querySelector('.dice-toolbar-shell');
  shell.classList.toggle('is-open', state.dice.open);
  shell.querySelector('[data-dice-rail]').innerHTML = renderDiceToolbarRail();
  shell.querySelector('[data-dice-controls]').innerHTML = renderDiceToolbarControls();
  shell.querySelector('[data-dice-summary]').innerHTML = renderDiceSummary();
  shell.querySelector('[data-dice-history]').innerHTML = renderDiceHistory();
  shell.querySelector('[data-dice-stage-status]').innerHTML = renderDiceStageStatus();
}

function renderSheetTabs() {
  return `
    <nav class="sheet-tabs">
      ${SHEET_TABS.map(([tab, label]) => `
        <button class="sheet-tab ${state.sheetTab === tab ? 'active' : ''}" data-action="sheet-tab" data-tab="${tab}">
          ${escapeHtml(label)}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderConditionsPanel(character) {
  return `
    <section class="editor-card sheet-card">
      <div class="panel-header">
        <div>
          <div class="section-title">Conditions</div>
          <div class="muted">Quick toggles for live encounter state.</div>
        </div>
      </div>
      <div class="condition-grid">
        ${(state.compendium?.conditions || [])
          .map(
            (condition) => `
              <button class="condition-chip ${character.data.conditions.includes(condition.code) ? 'active' : ''}" data-action="toggle-condition" data-condition="${escapeHtml(condition.code)}">${escapeHtml(condition.name)}</button>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderAbilitiesPanel(character) {
  return `
    <section class="editor-card sheet-card">
      <div class="panel-header">
        <div>
          <div class="section-title">Ability Scores</div>
          <div class="muted">Direct edits with visible modifiers.</div>
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
  `;
}

function renderOverviewTab(character) {
  const overview = getCharacterOverview(character);
  return `
    <div class="sheet-panel-grid">
      <section class="editor-card editor-card--hero sheet-card sheet-card--hero">
        <div class="character-hero">
          <div class="character-hero__copy">
            <div class="eyebrow">Active Character</div>
            <h2 class="character-title">${escapeHtml(character.data.name)}</h2>
            <div class="character-lineage">${escapeHtml(overview.lineage)}</div>
            <div class="meta-row">${renderMetaBits(overview.detailBits)}</div>
          </div>
        </div>
        <div class="summary-grid">
          ${renderSummaryCards(character)}
        </div>
      </section>
      ${renderAbilitiesPanel(character)}
      ${renderConditionsPanel(character)}
    </div>
  `;
}

function renderCombatTab(character) {
  return `
    <div class="sheet-panel-grid">
      <section class="editor-card sheet-card">
        <div class="panel-header">
          <div>
            <div class="section-title">Combat Snapshot</div>
            <div class="muted">Primary combat values with direct edits.</div>
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
      </section>
      ${renderConditionsPanel(character)}
    </div>
  `;
}

function renderNotesPanel(character) {
  return `
    <section class="editor-card sheet-card sheet-card--notes">
      <div class="panel-header">
        <div>
          <div class="section-title">Notes</div>
          <div class="muted">Backstory, session notes, quest context, and reminders.</div>
        </div>
      </div>
      <textarea class="textarea textarea--notes" data-bind="notes">${escapeHtml(character.data.notes || '')}</textarea>
    </section>
  `;
}

function renderEditor(character) {
  if (!character) {
    const hasCharacters = state.characters.length > 0;
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

  const overview = getCharacterOverview(character);
  let sheetContent = renderOverviewTab(character);
  if (state.sheetTab === 'combat') {
    sheetContent = renderCombatTab(character);
  } else if (state.sheetTab === 'inventory') {
    sheetContent = renderInventorySection(character);
  } else if (state.sheetTab === 'spells') {
    sheetContent = renderSpellSection(character);
  } else if (state.sheetTab === 'features') {
    sheetContent = renderFeatureSection(character);
  } else if (state.sheetTab === 'notes') {
    sheetContent = renderNotesPanel(character);
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
              <span class="pill-badge">Level ${escapeHtml(character.data.level)}</span>
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
              <strong>${escapeHtml(formatSigned(character.data.initiative))}</strong>
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
        ${renderSheetTabs()}
      </header>
      <div class="sheet-content">
        ${sheetContent}
      </div>
    </section>
  `;
}

function renderCompendiumResult(result, index) {
  const metaBits = [
    result.sourceCode || '',
    result.level != null ? `Level ${result.level}` : '',
    result.featureType || '',
  ];

  return `
    <article class="result-card ${state.compendiumDetailIndex === index ? 'active' : ''}" data-action="select-compendium-result" data-index="${index}" draggable="true" data-compendium-index="${index}">
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

function renderCreateFlowModal() {
  if (!state.createFlowOpen) {
    return '';
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--choice">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">Create Character</div>
            <h3 class="modal-title">Choose your starting flow.</h3>
          </div>
          <button class="modal-close" data-action="close-create-flow">&times;</button>
        </div>
        <div class="create-flow-grid">
          <article class="create-flow-card">
            <div class="eyebrow">Wizard</div>
            <h3>Step-by-step creation</h3>
            <p class="muted">Walk through identity, lineage, ability scores, and starting combat values before the sheet is saved.</p>
            <button class="button primary" data-action="create-with-wizard">Launch Wizard</button>
          </article>
          <article class="create-flow-card">
            <div class="eyebrow">Direct Edit</div>
            <h3>Blank live sheet</h3>
            <p class="muted">Create a default sheet immediately and tune every field directly from the main editor.</p>
            <button class="button subtle" data-action="create-direct">Create Blank Sheet</button>
          </article>
        </div>
      </section>
    </div>
  `;
}

function renderWizardModal() {
  const wizard = state.wizard;
  if (!wizard) {
    return '';
  }

  const steps = getWizardSteps();
  const isLastStep = wizard.step === steps.length - 1;
  const classEntry = getCompendiumEntryBySlug('classes', wizard.draft.classSlug);
  const ancestryEntry = getCompendiumEntryBySlug('ancestries', wizard.draft.ancestrySlug);
  const backgroundEntry = getCompendiumEntryBySlug('backgrounds', wizard.draft.backgroundSlug);
  let content;

  if (wizard.mode === 'levelup') {
    content =
      wizard.step === 0
        ? `
            <div class="wizard-step">
              <div class="wizard-step__hero">
                <div class="wizard-levelup__delta">${escapeHtml(String(wizard.draft.level))} -&gt; ${escapeHtml(String(wizard.nextLevel))}</div>
                <div class="muted">${escapeHtml(titleize(wizard.draft.classSlug, 'Adventurer'))} advancement for ${escapeHtml(wizard.characterName)}.</div>
              </div>
              <div class="wizard-form-grid wizard-form-grid--two">
                <label class="field">
                  <span class="label">HP Gain</span>
                  <input class="input" id="wizard-hp-gain" type="number" min="1" value="${escapeHtml(String(wizard.hpGain))}" />
                </label>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">Recommended</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Math.max(1, Math.floor(getClassHitDie(wizard.draft.classSlug) / 2) + 1 + getAbilityModifierValue(wizard.draft.abilities.CON))))}</div>
                  <div class="muted">Average hit die gain with Constitution applied.</div>
                </div>
              </div>
            </div>
          `
        : `
            <div class="wizard-step">
              <div class="wizard-review-grid">
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">New Level</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(wizard.nextLevel))}</div>
                </div>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">HP Max</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Number(wizard.draft.hp.max) + Number(wizard.hpGain)))}</div>
                </div>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">HP Current</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Math.min(Number(wizard.draft.hp.max) + Number(wizard.hpGain), Number(wizard.draft.hp.current) + Number(wizard.hpGain))))}</div>
                </div>
              </div>
              <p class="muted wizard-step__copy">Apply the level increase, then continue editing the live sheet directly.</p>
            </div>
          `;
  } else if (wizard.step === 0) {
    content = `
      <div class="wizard-step">
        <div class="wizard-form-grid wizard-form-grid--two">
          <label class="field">
            <span class="label">Character Name</span>
            <input class="input" data-wizard-bind="name" value="${escapeHtml(wizard.draft.name)}" placeholder="Aldric Stormveil" />
          </label>
          <label class="field">
            <span class="label">Alignment</span>
            <input class="input" data-wizard-bind="alignment" value="${escapeHtml(wizard.draft.alignment)}" />
          </label>
          <label class="field wizard-form-grid__full">
            <span class="label">Edition</span>
            <select class="select" data-wizard-bind="edition">
              ${EDITION_OPTIONS.map(([value, label]) => `<option value="${value}" ${wizard.draft.edition === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
    `;
  } else if (wizard.step === 1) {
    content = `
      <div class="wizard-step">
        <div class="wizard-form-grid wizard-form-grid--three">
          <label class="field">
            <span class="label">Class</span>
            <select class="select" data-wizard-bind="classSlug">
              ${getCompendiumEntries('classes').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.classSlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Ancestry</span>
            <select class="select" data-wizard-bind="ancestrySlug">
              ${getCompendiumEntries('ancestries').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.ancestrySlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Background</span>
            <select class="select" data-wizard-bind="backgroundSlug">
              ${getCompendiumEntries('backgrounds').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.backgroundSlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="wizard-review-grid">
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Hit Die</div>
            <div class="wizard-review-card__value">d${escapeHtml(String(classEntry?.hitDie || 8))}</div>
            <div class="muted">${escapeHtml(classEntry?.name || 'Class')}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Ancestry</div>
            <div class="wizard-review-card__value">${escapeHtml(ancestryEntry?.name || 'Choose')}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Background</div>
            <div class="wizard-review-card__value">${escapeHtml(backgroundEntry?.name || 'Choose')}</div>
          </div>
        </div>
      </div>
    `;
  } else if (wizard.step === 2) {
    content = `
      <div class="wizard-step">
        <div class="wizard-scores-rail">
          ${wizard.availableScores.map((score) => `<span class="wizard-score-pill">${escapeHtml(String(score))}</span>`).join('')}
          ${wizard.availableScores.length === 0 ? '<span class="muted">All standard array values assigned.</span>' : ''}
        </div>
        <div class="wizard-ability-grid">
          ${ABILITY_KEYS.map((ability) => `
            <div class="wizard-ability-card">
              <div class="wizard-ability-card__label">${escapeHtml(ABILITY_LABELS[ability])}</div>
              <div class="wizard-ability-card__value">${escapeHtml(String(wizard.assignedScores[ability] ?? '--'))}</div>
              <div class="wizard-ability-card__actions">
                ${wizard.availableScores.map((score) => `<button class="wizard-score-button" data-action="wizard-score" data-ability="${ability}" data-score="${score}">${escapeHtml(String(score))}</button>`).join('')}
                ${wizard.assignedScores[ability] != null ? `<button class="wizard-score-button wizard-score-button--clear" data-action="wizard-score-clear" data-ability="${ability}">Clear</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (wizard.step === 3) {
    content = `
      <div class="wizard-step">
        <div class="panel-header">
          <div>
            <div class="section-title">Starting Combat Profile</div>
            <div class="muted">Use the recommended class-and-ability defaults, or override them here.</div>
          </div>
          <button class="button subtle" data-action="wizard-recommend-stats">Apply Recommended</button>
        </div>
        <div class="wizard-form-grid wizard-form-grid--three">
          <label class="field"><span class="label">Level</span><input class="input" type="number" min="1" max="20" data-wizard-bind="level" value="${escapeHtml(String(wizard.draft.level))}" /></label>
          <label class="field"><span class="label">HP Max</span><input class="input" type="number" min="1" data-wizard-bind="hp.max" value="${escapeHtml(String(wizard.draft.hp.max))}" /></label>
          <label class="field"><span class="label">HP Current</span><input class="input" type="number" min="0" data-wizard-bind="hp.current" value="${escapeHtml(String(wizard.draft.hp.current))}" /></label>
          <label class="field"><span class="label">Temp HP</span><input class="input" type="number" min="0" data-wizard-bind="hp.temp" value="${escapeHtml(String(wizard.draft.hp.temp || 0))}" /></label>
          <label class="field"><span class="label">Armor Class</span><input class="input" type="number" min="0" data-wizard-bind="ac" value="${escapeHtml(String(wizard.draft.ac))}" /></label>
          <label class="field"><span class="label">Speed</span><input class="input" type="number" min="0" data-wizard-bind="speed" value="${escapeHtml(String(wizard.draft.speed))}" /></label>
          <label class="field wizard-form-grid__half"><span class="label">Initiative</span><input class="input" type="number" min="-20" max="20" data-wizard-bind="initiative" value="${escapeHtml(String(wizard.draft.initiative))}" /></label>
        </div>
      </div>
    `;
  } else {
    content = `
      <div class="wizard-step">
        <div class="wizard-review-grid">
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Name</div>
            <div class="wizard-review-card__value">${escapeHtml(wizard.draft.name)}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Lineage</div>
            <div class="wizard-review-card__value">${escapeHtml([ancestryEntry?.name || '', classEntry?.name || '', backgroundEntry?.name || ''].filter(Boolean).join(' / '))}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Combat</div>
            <div class="wizard-review-card__value">${escapeHtml(`${wizard.draft.hp.current}/${wizard.draft.hp.max} HP / AC ${wizard.draft.ac}`)}</div>
          </div>
        </div>
        <div class="summary-grid">
          ${renderSummaryCards({ data: wizard.draft, ownerDisplayName: '', edition: wizard.draft.edition, name: wizard.draft.name, level: wizard.draft.level, ancestrySlug: wizard.draft.ancestrySlug, classSlug: wizard.draft.classSlug, backgroundSlug: wizard.draft.backgroundSlug })}
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--wizard">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">${wizard.mode === 'levelup' ? 'Level Up Wizard' : 'Character Wizard'}</div>
            <h3 class="modal-title">${wizard.mode === 'levelup' ? escapeHtml(wizard.characterName) : 'Build a character step by step'}</h3>
          </div>
          <button class="modal-close" data-action="close-wizard">&times;</button>
        </div>
        <div class="wizard-progress" style="--wizard-steps:${steps.length}">
          ${steps.map((step, index) => `<div class="wizard-progress__step ${wizard.step === index ? 'active' : wizard.step > index ? 'complete' : ''}">${escapeHtml(`${index + 1}. ${step}`)}</div>`).join('')}
        </div>
        <div class="modal-panel__body">
          ${content}
        </div>
        <div class="modal-panel__footer">
          <button class="button" data-action="close-wizard">Cancel</button>
          ${wizard.step > 0 ? '<button class="button subtle" data-action="wizard-prev">Back</button>' : ''}
          <button class="button primary" data-action="wizard-next" ${canAdvanceWizard() ? '' : 'disabled'}>${isLastStep ? wizard.mode === 'levelup' ? 'Apply Level' : 'Create Character' : 'Next'}</button>
        </div>
      </section>
    </div>
  `;
}

function renderCompendiumDetail() {
  const result = getSelectedCompendiumResult();
  if (!result) {
    return '<div class="compendium-detail__empty">Search the compendium and select a result to inspect it in detail.</div>';
  }

  const hasCharacter = Boolean(activeCharacter());

  return `
    <div class="compendium-detail__card">
      <div class="section-title">Selected Entry</div>
      <h3 class="compendium-detail__title">${escapeHtml(result.name)}</h3>
      <div class="muted">${renderMetaBits([result.sourceCode || '', result.level != null ? `Level ${result.level}` : '', result.featureType || ''])}</div>
      <p class="compendium-detail__copy">${escapeHtml(result.description || 'No description available.')}</p>
      <div class="button-row">
        <button class="button primary" data-action="add-compendium" data-index="${escapeHtml(String(state.compendiumDetailIndex))}" ${hasCharacter ? '' : 'disabled'}>${hasCharacter ? 'Add to Sheet' : 'Select a Character'}</button>
      </div>
    </div>
  `;
}

function renderCompendiumWindow() {
  if (!state.compendiumOpen) {
    return '';
  }

  if (state.compendiumHidden) {
    return `
      <button class="compendium-peek ${state.compendiumPinned ? 'is-pinned' : ''}" data-action="restore-compendium">
        <span>Compendium</span>
        <strong>${escapeHtml(titleize(state.compendiumType.slice(0, -1), state.compendiumType))}</strong>
      </button>
    `;
  }

  const activeCharacterLabel = activeCharacter()?.data.name || 'No character selected';
  const floatingPosition = state.compendiumDock ? null : clampCompendiumPosition(state.compendiumPosition);
  if (floatingPosition) {
    state.compendiumPosition = floatingPosition;
  }

  return `
    <section
      class="compendium-window ${state.compendiumDock ? `is-docked is-docked--${state.compendiumDock}` : 'is-floating'} ${state.compendiumPinned ? 'is-pinned' : ''}"
      ${floatingPosition ? `style="left:${floatingPosition.x}px; top:${floatingPosition.y}px; width:min(${state.compendiumSize.width}px, calc(100vw - 32px)); height:min(${state.compendiumSize.height}px, calc(100vh - 32px));"` : ''}
    >
      <header class="compendium-window__header" data-compendium-drag-handle="true">
        <div>
          <div class="section-title">Compendium</div>
          <h3 class="compendium-window__title">Search, inspect, and drag to the sheet</h3>
          <div class="muted">${escapeHtml(activeCharacterLabel)}${state.compendiumPinned ? ' · pinned' : ' · auto-hide after add'}</div>
        </div>
        <div class="compendium-window__controls">
          <button class="button subtle ${state.compendiumDock === 'left' ? 'active' : ''}" data-action="dock-compendium" data-side="left">Dock Left</button>
          <button class="button subtle ${state.compendiumDock === 'right' ? 'active' : ''}" data-action="dock-compendium" data-side="right">Dock Right</button>
          <button class="button subtle" data-action="toggle-compendium-pin">${state.compendiumPinned ? 'Unpin' : 'Pin'}</button>
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
          <div class="compendium-modal__layout">
            <div class="search-results">
              ${
                state.compendiumResults.length === 0
                  ? `<div class="empty-card empty-card--compendium">Search ${escapeHtml(state.compendiumType)} by name or keyword. Add entries directly or drag them onto the matching sheet section.</div>`
                  : state.compendiumResults.map(renderCompendiumResult).join('')
              }
            </div>
            <aside class="compendium-detail">
              ${renderCompendiumDetail()}
            </aside>
          </div>
        </div>
      </div>
    </section>
  `;
}

function syncCompendiumWindowState() {
  if (!state.session) {
    compendiumRoot.innerHTML = '';
    return;
  }

  compendiumRoot.innerHTML = renderCompendiumWindow();
}

function renderFloatingSurfaces() {
  syncCompendiumWindowState();
  syncDiceToolbarState();
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
          <div class="muted">${escapeHtml(String(visibleCharacters.length))} shown of ${escapeHtml(String(state.characters.length))} total</div>
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
  const focusMode = Boolean(character);

  return `
    <div class="screen app-screen">
      <div class="app-shell">
        <header class="panel topbar topbar--campaign ${focusMode ? 'topbar--sheet-focus' : ''}">
          <div class="topbar__copy">
            <div class="eyebrow">Codex Arcanum Character Manager</div>
            <div class="topbar-title">${focusMode ? 'Character Builder Navigation' : 'Roster and builder workspace.'}</div>
            <div class="topbar-meta">${renderMetaBits([`Signed in as ${state.session.displayName}`, state.session.email, focusMode ? character.data.name : ''])}</div>
          </div>
          <div class="topbar__actions">
            <div class="topbar__badges">
              <span class="badge">${escapeHtml(titleize(state.session.role, state.session.role))}</span>
              <span class="badge badge--muted">${escapeHtml(String(state.characters.length))} characters</span>
            </div>
            <select class="select" data-action="edition-filter">
              ${EDITION_OPTIONS.map(([value, label]) => `<option value="${value}" ${state.editionFilter === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
            ${focusMode ? '<button class="button subtle" data-action="back-to-roster">Characters</button>' : ''}
            <button class="button subtle" data-action="open-compendium">Compendium</button>
            <button class="button" data-action="logout">Sign Out</button>
          </div>
        </header>
        ${renderMessage()}
        <div class="workspace ${focusMode ? 'workspace--sheet-focus' : ''}">
          ${
            focusMode
              ? ''
              : `
                  <aside class="sidebar">
                    ${renderSidebar()}
                    ${renderAdminPanel()}
                  </aside>
                `
          }
          <main class="editor ${focusMode ? 'editor--sheet-focus' : ''}">
            ${renderEditor(character)}
          </main>
        </div>
      </div>
      ${renderCreateFlowModal()}
      ${renderWizardModal()}
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
    renderFloatingSurfaces();
    return;
  }

  appRoot.innerHTML = state.session ? renderApp() : renderAuth();
  renderFloatingSurfaces();
}

async function handleActionClick(event) {
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
        openCreateFlow();
        break;
      case 'close-create-flow':
        closeCreateFlow();
        break;
      case 'create-with-wizard':
        openWizard('create');
        break;
      case 'create-direct':
        closeCreateFlow();
        await createCharacterRecord();
        break;
      case 'back-to-roster':
        state.activeCharacterId = null;
        state.sheetTab = 'core';
        if (!state.compendiumPinned) {
          state.compendiumHidden = true;
        }
        render();
        break;
      case 'select-character':
        state.activeCharacterId = target.dataset.characterId;
        state.sheetTab = 'core';
        if (!state.compendiumPinned) {
          state.compendiumHidden = true;
        }
        render();
        break;
      case 'sheet-tab':
        setSheetTab(target.dataset.tab);
        break;
      case 'save-character':
        await saveActiveCharacter();
        break;
      case 'delete-character':
        await deleteActiveCharacter();
        break;
      case 'open-compendium':
        setCompendiumOpen(true);
        if (state.compendiumResults.length === 0) {
          await runCompendiumSearch();
        }
        break;
      case 'restore-compendium':
        restoreCompendiumWindow();
        break;
      case 'hide-compendium':
        hideCompendiumWindow();
        break;
      case 'close-compendium':
        setCompendiumOpen(false);
        break;
      case 'toggle-compendium-pin':
        toggleCompendiumPin();
        break;
      case 'dock-compendium':
        setCompendiumDock(target.dataset.side);
        break;
      case 'search-compendium':
        state.compendiumQuery = document.getElementById('compendium-query')?.value || '';
        await runCompendiumSearch();
        break;
      case 'switch-compendium':
        state.compendiumType = target.dataset.type;
        state.compendiumResults = [];
        state.compendiumDetailIndex = null;
        await runCompendiumSearch();
        break;
      case 'select-compendium-result':
        state.compendiumDetailIndex = Number(target.dataset.index);
        render();
        break;
      case 'add-compendium':
        addCompendiumEntry(Number(target.dataset.index));
        break;
      case 'toggle-condition':
        toggleCondition(target.dataset.condition);
        break;
      case 'open-levelup-wizard': {
        const character = activeCharacter();
        if (!character) {
          return;
        }
        if (Number(character.data.level || 1) >= 20) {
          setMessage('info', 'This character is already at level 20.');
          return;
        }
        openWizard('levelup', character);
        break;
      }
      case 'close-wizard':
        closeWizard();
        break;
      case 'wizard-prev':
        if (state.wizard) {
          state.wizard.step = Math.max(0, state.wizard.step - 1);
          render();
        }
        break;
      case 'wizard-next':
        await advanceWizard();
        break;
      case 'wizard-score':
        setWizardScore(target.dataset.ability, Number(target.dataset.score));
        break;
      case 'wizard-score-clear':
        setWizardScore(target.dataset.ability, null);
        break;
      case 'wizard-recommend-stats':
        applyRecommendedWizardStats();
        break;
      case 'toggle-dice-toolbar':
        state.dice.open = !state.dice.open;
        renderFloatingSurfaces();
        if (state.dice.open) {
          try {
            await ensureDiceBox();
          } catch (error) {
            setMessage('error', error.message);
          }
        }
        break;
      case 'quick-roll-die':
        setDiceSetting('sides', Number(target.dataset.sides));
        renderFloatingSurfaces();
        await rollDice();
        break;
      case 'roll-dice':
        await rollDice();
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
}

function handleCompendiumDragStart(event) {
  const target = event.target.closest('[data-compendium-index]');
  if (!target) {
    return;
  }

  event.dataTransfer.setData(
    'text/plain',
    JSON.stringify({
      compendiumIndex: Number(target.dataset.compendiumIndex),
    })
  );
  event.dataTransfer.effectAllowed = 'copy';
}

function handleSheetDragOver(event) {
  const dropZone = event.target.closest('[data-dropzone]');
  if (!dropZone) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

function handleSheetDrop(event) {
  const dropZone = event.target.closest('[data-dropzone]');
  if (!dropZone) {
    return;
  }

  event.preventDefault();

  try {
    const payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}');
    if (Number.isInteger(payload.compendiumIndex)) {
      addCompendiumEntry(payload.compendiumIndex, dropZone.dataset.dropzone);
    }
  } catch {
    // Ignore invalid drag payloads.
  }
}

function handleInput(event) {
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

  if (target.matches('[data-wizard-bind]')) {
    const isNumber = target.type === 'number';
    updateWizardDraft(target.dataset.wizardBind, isNumber ? Number(target.value || 0) : target.value);
    render();
    return;
  }

  if (target.id === 'wizard-hp-gain') {
    if (state.wizard) {
      state.wizard.hpGain = clampNumber(target.value, 1, 999, 1);
      render();
    }
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
}

async function handleChange(event) {
  const target = event.target;

  try {
    if (target.id === 'dice-model') {
      await setDiceModel(target.value);
      return;
    }

    if (target.id === 'dice-count') {
      setDiceSetting('count', target.value);
      renderFloatingSurfaces();
      return;
    }

    if (target.id === 'dice-modifier') {
      setDiceSetting('modifier', target.value);
      renderFloatingSurfaces();
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

    if (target.matches('[data-wizard-bind]')) {
      const isNumber = target.type === 'number';
      updateWizardDraft(target.dataset.wizardBind, isNumber ? Number(target.value || 0) : target.value);
      render();
      return;
    }

    if (target.id === 'wizard-hp-gain') {
      if (state.wizard) {
        state.wizard.hpGain = clampNumber(target.value, 1, 999, 1);
        render();
      }
      return;
    }

    if (target.matches('[data-bind]')) {
      const isNumber = target.type === 'number';
      updateActiveCharacter(target.dataset.bind, isNumber ? Number(target.value || 0) : target.value);
    }
  } catch (error) {
    setMessage('error', error.message);
  }
}

function startCompendiumDrag(event) {
  const handle = event.target.closest('[data-compendium-drag-handle]');
  if (!handle || event.button !== 0) {
    return;
  }

  if (event.target.closest('button, input, select, textarea')) {
    return;
  }

  const windowElement = handle.closest('.compendium-window');
  if (!windowElement) {
    return;
  }

  const rect = windowElement.getBoundingClientRect();
  state.compendiumDock = null;
  state.compendiumPosition = clampCompendiumPosition({
    x: rect.left,
    y: rect.top,
  });
  compendiumDragState = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  event.preventDefault();
  renderFloatingSurfaces();
}

function handleCompendiumPointerMove(event) {
  if (!compendiumDragState || state.compendiumDock) {
    return;
  }

  state.compendiumPosition = clampCompendiumPosition({
    x: event.clientX - compendiumDragState.offsetX,
    y: event.clientY - compendiumDragState.offsetY,
  });

  const windowElement = compendiumRoot.querySelector('.compendium-window.is-floating');
  if (!windowElement) {
    return;
  }

  windowElement.style.left = `${state.compendiumPosition.x}px`;
  windowElement.style.top = `${state.compendiumPosition.y}px`;
}

function stopCompendiumDrag() {
  compendiumDragState = null;
}

function bindInteractiveRoot(root) {
  root.addEventListener('click', handleActionClick);
  root.addEventListener('dragstart', handleCompendiumDragStart);
  root.addEventListener('dragover', handleSheetDragOver);
  root.addEventListener('drop', handleSheetDrop);
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
}

bindInteractiveRoot(appRoot);
bindInteractiveRoot(floatingRoot);
floatingRoot.addEventListener('pointerdown', startCompendiumDrag);
window.addEventListener('pointermove', handleCompendiumPointerMove);
window.addEventListener('pointerup', stopCompendiumDrag);
window.addEventListener('resize', () => {
  if (!state.compendiumDock) {
    state.compendiumPosition = clampCompendiumPosition(state.compendiumPosition);
  }
  renderFloatingSurfaces();
});

loadSession();
