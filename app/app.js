import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ATTACK_PROFICIENCY_OPTIONS,
  DAMAGE_ABILITY_OPTIONS,
  DICE_BOX_MODULE_PATH,
  DIE_OPTIONS,
  EDITION_OPTIONS,
  SHEET_TABS,
  SKILL_DEFINITIONS,
  SKILL_PROFICIENCY_OPTIONS,
  SPELL_DAMAGE_ABILITY_OPTIONS,
  SPELL_ROLL_MODE_OPTIONS,
  SPELLCASTING_ABILITY_BY_CLASS,
  STANDARD_ABILITY_ARRAY,
} from './frontend/constants.js';
import {
  createBlankAbilityAssignments,
  createDefaultAttack,
  createDefaultCharacter,
  createDefaultFeatureEntry,
  createDefaultGrantedSpellEntry,
  createDefaultInventoryEntry,
  createDefaultSpellEntry,
  normalizeCharacter,
} from './frontend/character-data.js';
import {
  ATTUNEMENT_SLOT_COUNT,
  canSpendItemResource,
  extractItemCapabilities,
  getAmmoQuantity,
  getAmmoTypeLabel,
  getAttunedItemCount,
  getItemResourceSummary,
  isItemReady,
} from './frontend/item-capabilities.js';
import { renderWizardModal as renderWizardModalView } from './frontend/renderers/wizard.js';
import {
  abilityModifier,
  analyzeRollFormula,
  buildFormulaWithModifier,
  clampNumber,
  deepClone,
  describeRollFormula,
  editionLabel,
  escapeHtml,
  formatSigned,
  getAbilityModifierValue,
  readFormControlValue,
  renderMetaBits,
  titleize,
} from './frontend/utils.js';

const appRoot = document.getElementById('app');
const floatingRoot = ensureFloatingRoot();
const compendiumRoot = ensureFloatingSurface('compendium-window-root');
const diceRoot = ensureFloatingSurface('dice-toolbar-root');

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
  sheetEntryModal: null,
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

function getStrongestAbilityKey(character) {
  return ABILITY_KEYS.reduce((bestKey, currentKey) =>
    Number(character.data.abilities[currentKey] || 0) > Number(character.data.abilities[bestKey] || 0)
      ? currentKey
      : bestKey
  );
}

function getProficiencyBonus(character) {
  const level = clampNumber(character?.data?.level ?? character?.level ?? 1, 1, 20, 1);
  return Math.floor((level - 1) / 4) + 2;
}

function getProficiencyAdjustment(rank, proficiencyBonus) {
  if (rank === 'expertise') {
    return proficiencyBonus * 2;
  }

  if (rank === 'proficient') {
    return proficiencyBonus;
  }

  if (rank === 'half') {
    return Math.floor(proficiencyBonus / 2);
  }

  return 0;
}

function getSkillDefinition(skillKey) {
  return SKILL_DEFINITIONS.find((skill) => skill.key === skillKey) || null;
}

function getSkillRank(character, skillKey) {
  return character.data.skillRanks?.[skillKey] || 'none';
}

function getSkillModifierValue(character, skillKey) {
  const skill = getSkillDefinition(skillKey);
  if (!skill) {
    return 0;
  }

  const abilityModifierValue = getAbilityModifierValue(character.data.abilities[skill.ability]);
  const proficiencyAdjustment = getProficiencyAdjustment(
    getSkillRank(character, skillKey),
    getProficiencyBonus(character)
  );
  const extraBonus = Number(character.data.skillBonuses?.[skillKey] || 0);

  return abilityModifierValue + proficiencyAdjustment + extraBonus;
}

function getAttackAbilityKey(attack = {}) {
  return ABILITY_KEYS.includes(attack.ability) ? attack.ability : 'STR';
}

function getAttackDamageAbilityKey(attack = {}) {
  if (attack.damageAbility === 'same') {
    return getAttackAbilityKey(attack);
  }

  return ABILITY_KEYS.includes(attack.damageAbility) ? attack.damageAbility : null;
}

function getAttackRollModifier(character, attack = {}) {
  const abilityModifierValue = getAbilityModifierValue(character.data.abilities[getAttackAbilityKey(attack)]);
  const proficiencyAdjustment = getProficiencyAdjustment(
    attack.proficiency || 'proficient',
    getProficiencyBonus(character)
  );

  return abilityModifierValue + proficiencyAdjustment + Number(attack.attackBonus || 0);
}

function getAttackDamageModifier(character, attack = {}) {
  const damageAbilityKey = getAttackDamageAbilityKey(attack);
  return Number(attack.damageBonus || 0) + (damageAbilityKey ? getAbilityModifierValue(character.data.abilities[damageAbilityKey]) : 0);
}

function getSpellcastingAbilityKey(character) {
  if (ABILITY_KEYS.includes(character.data.spellcasting?.ability)) {
    return character.data.spellcasting.ability;
  }

  return SPELLCASTING_ABILITY_BY_CLASS[character.data.classSlug] || getStrongestAbilityKey(character);
}

function getSpellAttackModifier(character) {
  return (
    getAbilityModifierValue(character.data.abilities[getSpellcastingAbilityKey(character)]) +
    getProficiencyBonus(character) +
    Number(character.data.spellcasting?.attackBonus || 0)
  );
}

function getSpellSaveDc(character) {
  return (
    8 +
    getAbilityModifierValue(character.data.abilities[getSpellcastingAbilityKey(character)]) +
    getProficiencyBonus(character) +
    Number(character.data.spellcasting?.saveDcBonus || 0)
  );
}

function getSpellDamageAbilityKey(character, spell = {}) {
  if (spell.damageAbility === 'spell') {
    return getSpellcastingAbilityKey(character);
  }

  return ABILITY_KEYS.includes(spell.damageAbility) ? spell.damageAbility : null;
}

function getSpellDamageModifier(character, spell = {}) {
  const damageAbilityKey = getSpellDamageAbilityKey(character, spell);
  return Number(spell.damageBonus || 0) + (damageAbilityKey ? getAbilityModifierValue(character.data.abilities[damageAbilityKey]) : 0);
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

function getCompendiumDescription(result) {
  return String(result?.fullDescription || result?.description || buildItemProfileSummary(result) || '').trim();
}

function getCompendiumShortDescription(result) {
  return String(result?.shortDescription || result?.description || '').trim();
}

function getCompendiumHigherLevelText(result) {
  return String(result?.higherLevelText || '').trim();
}

function getCompendiumTagYear(result) {
  return String(result?.tags?.year || '').trim();
}

function normalizeCompendiumDamageExpression(expression) {
  const analysis = analyzeRollFormula(expression);
  if (!analysis) {
    return { dice: '', modifier: 0 };
  }

  const diceMatch = analysis.formula.match(/^(\d+d\d+)/i);
  return {
    dice: diceMatch ? diceMatch[1] : '',
    modifier: analysis.modifier || 0,
  };
}

function pickFirstDamageExpression(result) {
  const damage = result?.damage;
  if (damage && typeof damage === 'object') {
    const slotLevels = damage.damage_at_slot_level || damage.damageAtSlotLevel;
    if (slotLevels && typeof slotLevels === 'object') {
      const key = Object.keys(slotLevels)
        .sort((left, right) => Number(left) - Number(right))
        .find((entry) => slotLevels[entry]);
      if (key) {
        return String(slotLevels[key]);
      }
    }

    const characterLevels = damage.damage_at_character_level || damage.damageAtCharacterLevel;
    if (characterLevels && typeof characterLevels === 'object') {
      const key = Object.keys(characterLevels)
        .sort((left, right) => Number(left) - Number(right))
        .find((entry) => characterLevels[entry]);
      if (key) {
        return String(characterLevels[key]);
      }
    }

    if (damage.damage_dice || damage.damageDice) {
      return String(damage.damage_dice || damage.damageDice);
    }
  }

  const description = getCompendiumDescription(result);
  const match = description.match(/\b\d+d\d+(?:\s*\+\s*\d+)?\b/i);
  return match ? match[0] : '';
}

function extractAttackBonusFromText(text) {
  const toHitMatch = String(text || '').match(/\+(\d+)\s+to hit/i);
  if (toHitMatch) {
    return Number(toHitMatch[1]) || 0;
  }

  const bonusMatch = String(text || '').match(/\+(\d+)\s+bonus to attack rolls?/i);
  return bonusMatch ? Number(bonusMatch[1]) || 0 : 0;
}

function extractDamageBonusFromText(text) {
  const bonusToBothMatch = String(text || '').match(/\+(\d+)\s+bonus to attack and damage rolls?/i);
  if (bonusToBothMatch) {
    return Number(bonusToBothMatch[1]) || 0;
  }

  const bonusMatch = String(text || '').match(/\+(\d+)\s+bonus to damage rolls?/i);
  return bonusMatch ? Number(bonusMatch[1]) || 0 : 0;
}

function buildInventoryEntryFromResult(result) {
  const capabilities = extractItemCapabilities(result);
  return {
    ...createDefaultInventoryEntry(),
    name: result.name,
    source: result.sourceCode || '',
    description: getCompendiumDescription(result),
    compendiumType: result.type || 'items',
    slug: result.slug || '',
    code: result.code || '',
    tags: result.tags || null,
    profile: result.profile || null,
    properties: result.properties || null,
    attunementRequired: capabilities.attunementRequired,
    attuned: false,
    providesAmmoType: capabilities.providesAmmoType,
    resource: capabilities.resource,
    grantedSpells: capabilities.grantedSpells.map((spell) => ({
      ...createDefaultGrantedSpellEntry(),
      ...spell,
    })),
  };
}

function buildSpellEntryFromResult(result) {
  const description = getCompendiumDescription(result);
  const damageExpression = pickFirstDamageExpression(result);
  const normalizedDamage = normalizeCompendiumDamageExpression(damageExpression);
  const rollMode = result.attackType
    ? 'attack'
    : /saving throw/i.test(description)
      ? 'save'
      : 'utility';
  const damageAbility = /spellcasting ability modifier/i.test(description) ? 'spell' : 'none';

  return {
    ...createDefaultSpellEntry(),
    name: result.name,
    level: result.level ?? 0,
    source: result.sourceCode || '',
    description,
    higherLevelText: getCompendiumHigherLevelText(result),
    rollMode,
    damageDice: normalizedDamage.dice,
    damageAbility,
    damageBonus: normalizedDamage.modifier,
    compendiumType: result.type || 'spells',
    slug: result.slug || '',
    code: result.code || '',
    attackType: result.attackType || '',
    tags: result.tags || null,
    damage: result.damage || null,
  };
}

function buildFeatureEntryFromResult(result) {
  return {
    ...createDefaultFeatureEntry(),
    name: result.name,
    source: result.sourceCode || '',
    description: getCompendiumDescription(result),
    shortDescription: getCompendiumShortDescription(result),
    featureType: result.featureType || '',
    levelRequired: result.levelRequired ?? null,
    compendiumType: result.type || 'features',
    slug: result.slug || '',
    code: result.code || '',
    effects: result.effects || null,
    tags: result.tags || null,
  };
}

function getItemProfileRaw(result) {
  return result?.profile?.raw || result?.profile || null;
}

function getItemPropertyNames(result) {
  const properties = result?.properties?.properties;
  if (!Array.isArray(properties)) {
    return [];
  }

  return properties.map((property) => property?.name || property?.index).filter(Boolean);
}

function buildItemProfileSummary(result) {
  const profile = getItemProfileRaw(result);
  if (!profile) {
    return '';
  }

  const parts = [];
  if (profile?.weapon_range) {
    parts.push(`${profile.weapon_range} weapon`);
  }
  if (profile?.damage?.damage_dice && profile?.damage?.damage_type?.name) {
    parts.push(`${profile.damage.damage_dice} ${String(profile.damage.damage_type.name).toLowerCase()} damage`);
  }
  if (profile?.range?.normal) {
    parts.push(`Range ${profile.range.normal}${profile.range.long ? `/${profile.range.long}` : ''} ft.`);
  }
  if (profile?.throw_range?.normal) {
    parts.push(`Thrown ${profile.throw_range.normal}${profile.throw_range.long ? `/${profile.throw_range.long}` : ''} ft.`);
  }
  const propertyNames = getItemPropertyNames(result);
  if (propertyNames.length > 0) {
    parts.push(`Properties: ${propertyNames.join(', ')}`);
  }

  return parts.join('. ');
}

function buildAttackFromItemProfile(result) {
  const profile = getItemProfileRaw(result);
  const damageDice = profile?.damage?.damage_dice || profile?.damage?.damageDice || '';
  if (!damageDice) {
    return null;
  }

  const propertyNames = getItemPropertyNames(result);
  const isRanged = String(profile?.weapon_range || '').toLowerCase() === 'ranged';
  const isFinesse = propertyNames.some((property) => String(property).toLowerCase() === 'finesse');
  const rangeBits = [];
  if (profile?.range?.normal) {
    rangeBits.push(`Range ${profile.range.normal}${profile.range.long ? `/${profile.range.long}` : ''} ft.`);
  }
  if (profile?.throw_range?.normal) {
    rangeBits.push(`Thrown ${profile.throw_range.normal}${profile.throw_range.long ? `/${profile.throw_range.long}` : ''} ft.`);
  }

  const text = `${result.name} ${getCompendiumDescription(result)}`;
  const attackBonus = extractAttackBonusFromText(text);
  const damageBonus = extractDamageBonusFromText(text);
  const sourceMeta = [result.sourceCode || '', getCompendiumTagYear(result) || ''].filter(Boolean).join(' ');
  const ammoType = extractItemCapabilities(result).ammoType;

  return {
    ...createDefaultAttack(),
    name: result.name,
    ability: isRanged || isFinesse ? 'DEX' : 'STR',
    proficiency: 'proficient',
    attackBonus,
    damageDice,
    damageAbility: 'same',
    damageBonus,
    sourceType: 'item',
    sourceSlug: result.slug || '',
    sourceCode: result.code || '',
    sourceName: result.name,
    requiresEquipped: true,
    ammoType,
    ammoPerUse: ammoType ? 1 : 0,
    notes: [sourceMeta, rangeBits.join(' · '), getCompendiumDescription(result)].filter(Boolean).join('\n\n'),
  };
}

function buildAttackFromDescription(result, options = {}) {
  const description = getCompendiumDescription(result);
  const damageExpression = pickFirstDamageExpression(result);
  const normalizedDamage = normalizeCompendiumDamageExpression(damageExpression);
  const attackBonus = extractAttackBonusFromText(description);
  const damageBonus = normalizedDamage.modifier + extractDamageBonusFromText(description);
  const hasAttackLanguage = /(?:melee|ranged)\s+(?:weapon|spell\s+)?attack|attack rolls?|unarmed strikes?|natural weapon|slam attack|bite attack|claw attack|breath weapon/i.test(description);

  if ((!hasAttackLanguage && attackBonus === 0) || (!normalizedDamage.dice && attackBonus === 0)) {
    return null;
  }

  let ability = options.defaultAbility || 'STR';
  if (/using dexterity/i.test(description) || /ranged attack/i.test(description)) {
    ability = 'DEX';
  } else if (/using strength/i.test(description) || /melee weapon/i.test(description) || /unarmed strike/i.test(description)) {
    ability = 'STR';
  }

  return {
    ...createDefaultAttack(),
    name: result.name,
    ability,
    proficiency: /proficient/i.test(description) ? 'proficient' : options.proficiency || 'proficient',
    attackBonus,
    damageDice: normalizedDamage.dice || '1d4',
    damageAbility: 'same',
    damageBonus,
    sourceType: result.type || '',
    sourceSlug: result.slug || '',
    sourceCode: result.code || '',
    sourceName: result.name,
    requiresEquipped: options.requiresEquipped === true,
    notes: [result.sourceCode || '', description].filter(Boolean).join('\n\n'),
  };
}

function buildCompendiumImportPlan(result) {
  if (!result) {
    return [];
  }

  if (result.type === 'items') {
    const plan = [{ list: 'inventory', entry: buildInventoryEntryFromResult(result) }];
    const attack = buildAttackFromItemProfile(result) || buildAttackFromDescription(result, { requiresEquipped: true });
    if (attack) {
      plan.push({ list: 'attacks', entry: attack });
    }
    return plan;
  }

  if (result.type === 'spells') {
    return [{ list: 'spells', entry: buildSpellEntryFromResult(result) }];
  }

  const plan = [{ list: 'features', entry: buildFeatureEntryFromResult(result) }];
  const featureAttack = buildAttackFromDescription(result, { requiresEquipped: false });
  if (featureAttack) {
    plan.push({ list: 'attacks', entry: featureAttack });
  }
  return plan;
}

function getCompendiumDestinationLabels(result) {
  const labels = {
    inventory: 'Inventory',
    attacks: 'Attacks',
    spells: 'Spells',
    features: 'Features',
  };

  return [...new Set(buildCompendiumImportPlan(result).map((entry) => labels[entry.list] || titleize(entry.list, entry.list)))];
}

function findInventorySourceForAttack(character, attack) {
  if (!character || !attack?.requiresEquipped) {
    return null;
  }

  return (
    character.data.inventory.find((entry) =>
      (attack.sourceSlug && entry.slug === attack.sourceSlug) ||
      (attack.sourceCode && entry.code === attack.sourceCode) ||
      (attack.sourceName && entry.name === attack.sourceName)
    ) || null
  );
}

function isAttackAvailable(character, attack) {
  if (!attack?.requiresEquipped) {
    return true;
  }

  return Boolean(findInventorySourceForAttack(character, attack)?.equipped);
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
    ...createDefaultCharacter(state.editionFilter),
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
  const strongestAbility = getStrongestAbilityKey(character);
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
          character.data.attacks.length +
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

function openSheetEntryModal(listName, index) {
  state.sheetEntryModal = { listName, index: Number(index) };
  render();
}

function closeSheetEntryModal() {
  state.sheetEntryModal = null;
  render();
}

function getSheetEntryModalData() {
  const character = activeCharacter();
  const modalState = state.sheetEntryModal;
  if (!character || !modalState) {
    return null;
  }

  const entry = character.data?.[modalState.listName]?.[modalState.index];
  if (!entry) {
    return null;
  }

  return {
    character,
    listName: modalState.listName,
    index: modalState.index,
    entry,
  };
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

function buildDiceRoll(values, formula, modifier = 0, label = '') {
  const subtotal = values.reduce((total, result) => total + result, 0);
  return {
    label,
    values,
    modifier,
    subtotal,
    total: subtotal + modifier,
    formula,
    timestamp: new Date().toISOString(),
  };
}

function buildDiceRollFromResults(results, formula, modifier = 0, label = '') {
  const values = (Array.isArray(results) ? results : [])
    .map((entry) => Number(entry?.value))
    .filter((value) => Number.isFinite(value));

  return buildDiceRoll(values, formula, modifier, label);
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
  await rollDiceFormula(describeRollFormula(count, sides, modifier));
}

async function rollDiceFormula(formula, label = '') {
  const analysis = analyzeRollFormula(formula);
  if (!analysis?.hasDice) {
    throw new Error('Roll formulas must use standard dice notation such as 1d20+5 or 2d6+3.');
  }

  state.dice.open = true;
  state.dice.rollId += 1;
  state.dice.rolling = true;
  state.dice.initError = null;
  renderFloatingSurfaces();

  const activeRollId = state.dice.rollId;

  try {
    const box = await ensureDiceBox();
    const roll = buildDiceRollFromResults(await box.roll(analysis.formula), analysis.formula, analysis.modifier, label);

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
  state.characters = (payload.characters || []).map((character) => normalizeCharacter(character, state.editionFilter));
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
  state.sheetEntryModal = null;
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

  const entry = character.data[listName][index];
  if (listName === 'inventory' && field === 'attuned' && value === true && !entry.attuned) {
    if (getAttunedItemCount(character) >= ATTUNEMENT_SLOT_COUNT) {
      setMessage('info', `All ${ATTUNEMENT_SLOT_COUNT} attunement slots are already occupied.`);
      return;
    }
    entry.attunementRequired = true;
  }

  if (listName === 'inventory' && field === 'attunementRequired' && value === false) {
    entry.attuned = false;
  }

  const parts = String(field || '').split('.');
  let target = entry;
  while (parts.length > 1) {
    const key = parts.shift();
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }

  target[parts[0]] = value;
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

async function createCharacterRecord(initialData = createDefaultCharacter(state.editionFilter)) {
  const payload = await api('/api/characters', {
    method: 'POST',
    body: JSON.stringify(initialData),
  });

  const character = normalizeCharacter(payload.character, state.editionFilter);
  upsertCharacterRecord(character);
  state.sheetTab = 'core';
  setMessage('success', 'Character created.');
}

async function updateCharacterRecord(characterId, data, successMessage = 'Character saved.') {
  const payload = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  const updated = normalizeCharacter(payload.character, state.editionFilter);
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

function findSpellSearchMatch(spellName, results = []) {
  const normalizedNeedle = String(spellName || '').trim().toLowerCase();
  if (!normalizedNeedle) {
    return null;
  }

  return (
    results.find((entry) => String(entry.name || '').trim().toLowerCase() === normalizedNeedle) ||
    results.find((entry) => String(entry.slug || '').trim().toLowerCase() === normalizedNeedle.replace(/\s+/g, '-')) ||
    results[0] ||
    null
  );
}

async function hydrateGrantedSpellEntry(spellSeed, itemName) {
  const fallback = {
    ...createDefaultGrantedSpellEntry(),
    ...(spellSeed || {}),
    sourceItemName: itemName || spellSeed?.sourceItemName || '',
  };
  const spellName = String(spellSeed?.name || '').trim();
  if (!spellName) {
    return fallback;
  }

  try {
    const payload = await api(
      `/api/compendium/search?type=spells&q=${encodeURIComponent(spellName)}&edition=${encodeURIComponent(state.editionFilter)}&limit=8`,
      { method: 'GET' }
    );
    const match = findSpellSearchMatch(spellName, payload.results || []);
    if (!match) {
      return fallback;
    }

    return {
      ...createDefaultGrantedSpellEntry(),
      ...buildSpellEntryFromResult(match),
      ...(spellSeed || {}),
      sourceItemName: itemName || spellSeed?.sourceItemName || '',
    };
  } catch {
    return fallback;
  }
}

async function hydrateInventoryEntry(entry) {
  if (!Array.isArray(entry?.grantedSpells) || entry.grantedSpells.length === 0) {
    return entry;
  }

  return {
    ...entry,
    grantedSpells: await Promise.all(
      entry.grantedSpells.map((spellSeed) => hydrateGrantedSpellEntry(spellSeed, entry.name))
    ),
  };
}

function getAttackAmmoType(character, attack) {
  if (attack?.ammoType) {
    return attack.ammoType;
  }

  const sourceItem =
    character?.data?.inventory?.find(
      (entry) =>
        (attack?.sourceSlug && entry.slug === attack.sourceSlug) ||
        (attack?.sourceCode && entry.code === attack.sourceCode) ||
        (attack?.sourceName && entry.name === attack.sourceName)
    ) || null;

  if (!sourceItem) {
    return '';
  }

  return extractItemCapabilities({
    name: sourceItem.name,
    code: sourceItem.code,
    description: sourceItem.description,
    fullDescription: sourceItem.description,
    profile: sourceItem.profile,
    properties: sourceItem.properties,
  }).ammoType;
}

function getAttackAmmoStatus(character, attack) {
  const ammoType = getAttackAmmoType(character, attack);
  if (!ammoType) {
    return {
      available: true,
      quantity: null,
      perUse: 0,
      label: '',
      ammoType: '',
    };
  }

  const quantity = getAmmoQuantity(character, ammoType);
  const perUse = Math.max(1, Number(attack.ammoPerUse || 1));

  return {
    available: quantity >= perUse,
    quantity,
    perUse,
    label: `${quantity} ${getAmmoTypeLabel(ammoType)}`,
    ammoType,
  };
}

function consumeAttackAmmo(character, attack) {
  const ammoStatus = getAttackAmmoStatus(character, attack);
  if (!ammoStatus.ammoType) {
    return true;
  }
  if (!ammoStatus.available) {
    return false;
  }

  let remaining = ammoStatus.perUse;
  for (const entry of character.data.inventory) {
    const matchesAmmo =
      entry.providesAmmoType === ammoStatus.ammoType ||
      entry.code === ammoStatus.ammoType ||
      entry.slug === ammoStatus.ammoType;
    if (!matchesAmmo || remaining <= 0) {
      continue;
    }

    const spendable = Math.min(remaining, Number(entry.quantity || 0));
    entry.quantity = Math.max(0, Number(entry.quantity || 0) - spendable);
    remaining -= spendable;
  }

  return remaining === 0;
}

function spendItemResource(entry, amount = 1) {
  if (!entry?.resource || (entry.resource.max == null && entry.resource.current == null)) {
    return true;
  }

  if (!canSpendItemResource(entry, amount)) {
    return false;
  }

  entry.resource.current = Math.max(0, Number(entry.resource.current ?? 0) - Number(amount || 0));
  return true;
}

async function addCompendiumEntry(index, targetList = null) {
  const result = state.compendiumResults[index];
  const character = activeCharacter();
  if (!result || !character) {
    return;
  }

  const plan = buildCompendiumImportPlan(result);
  for (const operation of plan) {
    const entry =
      operation.list === 'inventory'
        ? await hydrateInventoryEntry(operation.entry)
        : operation.entry;
    character.data[operation.list].push(entry);
  }

  if (!state.compendiumPinned) {
    state.compendiumHidden = true;
  }

  const destinations = getCompendiumDestinationLabels(result).join(', ');
  if (targetList && targetList !== 'sheet') {
    setMessage('success', `${result.name} routed to ${destinations}.`);
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

function toggleItemAttunement(index) {
  const character = activeCharacter();
  const entry = character?.data?.inventory?.[index];
  if (!entry) {
    return;
  }

  if (entry.attuned) {
    entry.attuned = false;
    render();
    return;
  }

  if (getAttunedItemCount(character) >= ATTUNEMENT_SLOT_COUNT) {
    setMessage('info', `All ${ATTUNEMENT_SLOT_COUNT} attunement slots are already occupied.`);
    return;
  }

  entry.attunementRequired = true;
  entry.attuned = true;
  render();
}

async function rollAttackFromSheet(index) {
  const character = activeCharacter();
  const attack = character?.data?.attacks?.[index];
  if (!character || !attack) {
    return;
  }

  if (!isAttackAvailable(character, attack)) {
    setMessage('info', 'Equip the source item before using this attack.');
    return;
  }

  const ammoStatus = getAttackAmmoStatus(character, attack);
  if (!ammoStatus.available) {
    setMessage('info', `${attack.name || 'This attack'} needs ${getAmmoTypeLabel(ammoStatus.ammoType)} before it can be used.`);
    return;
  }

  if (!consumeAttackAmmo(character, attack)) {
    setMessage('info', `${attack.name || 'This attack'} could not spend the required ammunition.`);
    return;
  }

  render();
  await rollDiceFormula(
    describeRollFormula(1, 20, getAttackRollModifier(character, attack)),
    `${attack.name || 'Attack'} Attack`
  );
}

async function castItemSpellFromSheet(itemIndex, spellIndex) {
  const character = activeCharacter();
  const entry = character?.data?.inventory?.[itemIndex];
  let spell = entry?.grantedSpells?.[spellIndex];
  if (!character || !entry || !spell) {
    return;
  }

  if (!spell.slug && !spell.code && !spell.description) {
    spell = await hydrateGrantedSpellEntry(spell, entry.name);
    entry.grantedSpells[spellIndex] = spell;
  }

  if (!entry.equipped) {
    setMessage('info', `${entry.name || 'This item'} must be equipped before it can cast spells.`);
    return;
  }

  if (entry.attunementRequired && !entry.attuned) {
    setMessage('info', `${entry.name || 'This item'} must be attuned before it can cast spells.`);
    return;
  }

  const cost = Math.max(1, Number(spell.chargeCost || 1));
  if (!spendItemResource(entry, cost)) {
    setMessage('info', `${entry.name || 'This item'} does not have enough ${entry.resource?.label || 'uses'} remaining.`);
    return;
  }

  render();
  const hasTrackedResource = entry.resource && (entry.resource.max != null || entry.resource.current != null);

  if ((spell.rollMode || 'utility') === 'attack') {
    await rollDiceFormula(
      describeRollFormula(1, 20, getSpellAttackModifier(character)),
      `${spell.name || 'Item Spell'} Attack`
    );
    return;
  }

  if ((spell.rollMode || 'utility') === 'save') {
    setMessage(
      'success',
      `${spell.name || 'Spell'} cast from ${entry.name || 'item'}. Save DC ${getSpellSaveDc(character)}.`
    );
    return;
  }

  setMessage(
    'success',
    `${spell.name || 'Spell'} cast from ${entry.name || 'item'}${hasTrackedResource ? ` for ${cost} ${entry.resource?.label || 'use'}.` : '.'}`
  );
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

function renderRollActionButton({ label, formula, text, classes = '', tone = 'subtle', disabled = false }) {
  const analysis = analyzeRollFormula(formula);
  const className = ['button', tone, 'roll-action', classes].filter(Boolean).join(' ');
  const isDisabled = disabled || !analysis?.hasDice;

  return `
    <button
      class="${className}"
      data-action="roll-sheet-formula"
      data-label="${escapeHtml(label)}"
      data-formula="${escapeHtml(analysis?.formula || '')}"
      ${isDisabled ? 'disabled' : ''}
    >
      ${escapeHtml(text)}
    </button>
  `;
}

function renderRouteChips(labels) {
  return labels
    .map((label) => `<span class="route-chip">${escapeHtml(label)}</span>`)
    .join('');
}

function renderAttunementSlots(character) {
  const attunedItems = character.data.inventory.filter((entry) => entry.attuned).slice(0, ATTUNEMENT_SLOT_COUNT);

  return `
    <div class="attunement-strip">
      <div>
        <div class="section-title">Attunement</div>
        <div class="muted">${escapeHtml(String(getAttunedItemCount(character)))} / ${escapeHtml(String(ATTUNEMENT_SLOT_COUNT))} slots used</div>
      </div>
      <div class="attunement-strip__slots">
        ${Array.from({ length: ATTUNEMENT_SLOT_COUNT }, (_, index) => {
          const item = attunedItems[index];
          return `
            <div class="attunement-slot ${item ? 'active' : ''}">
              <span class="attunement-slot__index">${index + 1}</span>
              <span>${escapeHtml(item?.name || 'Open')}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderItemSpellButtons(character, entry, inventoryIndex) {
  if (!Array.isArray(entry.grantedSpells) || entry.grantedSpells.length === 0) {
    return '';
  }

  const ready = isItemReady(entry);

  return `
    <div class="item-spell-strip">
      ${entry.grantedSpells
        .map((spell, spellIndex) => {
          const cost = Math.max(1, Number(spell.chargeCost || 1));
          const damageFormula = buildFormulaWithModifier(spell.damageDice, getSpellDamageModifier(character, spell));
          const primaryLabel =
            spell.rollMode === 'attack'
              ? `Cast ${formatSigned(getSpellAttackModifier(character))}`
              : spell.rollMode === 'save'
                ? `Cast DC ${getSpellSaveDc(character)}`
                : `Cast`;
          const canCast = ready && canSpendItemResource(entry, cost);

          return `
            <div class="item-spell-chip">
              <span class="item-spell-chip__name">${escapeHtml(spell.name || 'Item Spell')}</span>
              <div class="button-row button-row--tight">
                <button
                  class="button subtle button--small"
                  data-action="cast-item-spell"
                  data-index="${inventoryIndex}"
                  data-spell-index="${spellIndex}"
                  ${canCast ? '' : 'disabled'}
                >
                  ${escapeHtml(primaryLabel)}${cost > 0 ? ` (${cost})` : ''}
                </button>
                ${
                  damageFormula
                    ? renderRollActionButton({
                        label: `${spell.name || 'Item Spell'} Damage`,
                        formula: damageFormula,
                        text: `Damage ${damageFormula}`,
                        classes: 'button--small',
                        disabled: !ready,
                      })
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderInventorySection(character) {
  const equippedCount = character.data.inventory.filter((entry) => entry.equipped).length;
  return `
    <section class="editor-card editor-card--section droppable-zone" data-dropzone="inventory">
      <div class="panel-header">
        <div>
          <div class="section-title">Inventory</div>
          <div class="muted">${escapeHtml(character.data.inventory.length)} tracked item${character.data.inventory.length === 1 ? '' : 's'} · ${escapeHtml(equippedCount)} equipped</div>
        </div>
        <button class="button subtle" data-action="add-entry" data-list="inventory">Add Item</button>
      </div>
      ${renderAttunementSlots(character)}
      <div class="item-list">
        ${
          character.data.inventory.length === 0
            ? '<div class="empty-card">No equipment yet. Pull in an item from the compendium or add one manually.</div>'
            : character.data.inventory
                .map(
                  (entry, index) => `
                    <div class="entry sheet-entry-row">
                      <div class="sheet-entry-row__copy">
                        <strong>${escapeHtml(entry.name || 'Item')}</strong>
                        <div class="muted">${renderMetaBits([
                          entry.equipped ? 'Equipped' : 'Stored',
                          entry.attunementRequired ? entry.attuned ? 'Attuned' : 'Needs attunement' : '',
                          entry.quantity !== 1 ? `Qty ${entry.quantity}` : '',
                          getItemResourceSummary(entry),
                          entry.grantedSpells?.length ? `${entry.grantedSpells.length} item spell${entry.grantedSpells.length === 1 ? '' : 's'}` : '',
                          entry.providesAmmoType ? `${getAmmoTypeLabel(entry.providesAmmoType)} stock` : '',
                          entry.source || '',
                        ])}</div>
                        ${renderItemSpellButtons(character, entry, index)}
                      </div>
                      <div class="button-row button-row--tight">
                        <button class="button subtle button--small" data-action="toggle-equip" data-index="${index}">${entry.equipped ? 'Unequip' : 'Equip'}</button>
                        ${
                          entry.attunementRequired
                            ? `<button class="button subtle button--small" data-action="toggle-attunement" data-index="${index}">${entry.attuned ? 'Unattune' : 'Attune'}</button>`
                            : ''
                        }
                        <button class="button subtle button--small" data-action="open-sheet-entry" data-list="inventory" data-index="${index}">View</button>
                        <button class="button danger button--small" data-action="remove-entry" data-list="inventory" data-index="${index}">Remove</button>
                      </div>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderSkillsPanel(character) {
  return `
    <section class="editor-card sheet-card sheet-card--wide">
      <div class="panel-header">
        <div>
          <div class="section-title">Skills</div>
          <div class="muted">Every roll uses the linked ability, proficiency bonus, and any extra modifier on the sheet.</div>
        </div>
        <span class="pill-badge">Prof ${escapeHtml(formatSigned(getProficiencyBonus(character)))}</span>
      </div>
      <div class="skill-list">
        ${SKILL_DEFINITIONS.map((skill) => {
          const modifier = getSkillModifierValue(character, skill.key);
          const bonus = Number(character.data.skillBonuses?.[skill.key] || 0);

          return `
            <div class="skill-row">
              <div class="skill-row__copy">
                <strong>${escapeHtml(skill.label)}</strong>
                <div class="muted">${escapeHtml(ABILITY_LABELS[skill.ability])} (${escapeHtml(skill.ability)})</div>
              </div>
              <div class="skill-row__modifier">${escapeHtml(formatSigned(modifier))}</div>
              <label class="field field--inline">
                <span class="label">Training</span>
                <select class="select" data-bind="skillRanks.${skill.key}">
                  ${SKILL_PROFICIENCY_OPTIONS.map(([value, label]) => `
                    <option value="${value}" ${getSkillRank(character, skill.key) === value ? 'selected' : ''}>${escapeHtml(label)}</option>
                  `).join('')}
                </select>
              </label>
              <label class="field field--inline">
                <span class="label">Bonus</span>
                <input class="input" type="number" min="-20" max="20" data-bind="skillBonuses.${skill.key}" value="${escapeHtml(String(bonus))}" />
              </label>
              ${renderRollActionButton({
                label: `${skill.label} Check`,
                formula: describeRollFormula(1, 20, modifier),
                text: `Roll ${formatSigned(modifier)}`,
                classes: 'button--small roll-action--sheet',
              })}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderAttackSection(character) {
  return `
    <section class="editor-card editor-card--section sheet-card sheet-card--wide droppable-zone" data-dropzone="attacks">
      <div class="panel-header">
        <div>
          <div class="section-title">Attacks</div>
          <div class="muted">Attack and damage rolls update from the configured ability, proficiency, item bonus, and equipped state.</div>
        </div>
        <button class="button subtle" data-action="add-entry" data-list="attacks">Add Attack</button>
      </div>
      <div class="item-list">
        ${
          character.data.attacks.length === 0
            ? '<div class="empty-card">No attacks configured yet. Add a weapon or action and the sheet will calculate the roll buttons for you.</div>'
            : character.data.attacks
                .map((entry, index) => {
                  const attackModifier = getAttackRollModifier(character, entry);
                  const damageFormula = buildFormulaWithModifier(entry.damageDice, getAttackDamageModifier(character, entry));
                  const equipAvailable = isAttackAvailable(character, entry);
                  const ammoStatus = getAttackAmmoStatus(character, entry);
                  const available = equipAvailable && ammoStatus.available;
                  const sourceItem = findInventorySourceForAttack(character, entry);
                  const statusBits = [
                    `${ABILITY_LABELS[getAttackAbilityKey(entry)]} ${formatSigned(attackModifier)}`,
                    damageFormula ? `Damage ${damageFormula}` : '',
                    entry.requiresEquipped ? sourceItem?.equipped ? 'Equipped' : 'Needs equip' : '',
                    ammoStatus.label,
                  ].filter(Boolean);

                  return `
                    <div class="entry sheet-entry-row">
                      <div class="sheet-entry-row__copy">
                        <strong>${escapeHtml(entry.name || 'Attack')}</strong>
                        <div class="muted">${renderMetaBits(statusBits)}</div>
                      </div>
                      <div class="button-row button-row--tight">
                          <button
                            class="button subtle button--small"
                            data-action="roll-attack"
                            data-index="${index}"
                            ${available ? '' : 'disabled'}
                          >
                            ${escapeHtml(`Attack ${formatSigned(attackModifier)}`)}
                          </button>
                            ${
                              damageFormula
                                ? renderRollActionButton({
                                    label: `${entry.name || 'Attack'} Damage`,
                                    formula: damageFormula,
                                    text: `Damage ${damageFormula}`,
                                    classes: 'button--small',
                                    disabled: !equipAvailable,
                                  })
                                : ''
                            }
                          <button class="button subtle button--small" data-action="open-sheet-entry" data-list="attacks" data-index="${index}">View</button>
                          <button class="button danger button--small" data-action="remove-entry" data-list="attacks" data-index="${index}">Remove</button>
                        </div>
                    </div>
                  `;
                })
                .join('')
        }
      </div>
    </section>
  `;
}

function renderSpellcastingPanel(character) {
  const spellAttackModifier = getSpellAttackModifier(character);
  const saveDc = getSpellSaveDc(character);
  const spellcastingAbility = getSpellcastingAbilityKey(character);

  return `
    <section class="editor-card sheet-card sheet-card--wide">
      <div class="panel-header">
        <div>
          <div class="section-title">Spellcasting</div>
          <div class="muted">Set the casting ability and global bonuses once. Spell attack and save values update automatically.</div>
        </div>
        <div class="button-row button-row--tight">
          ${renderRollActionButton({
            label: 'Spell Attack',
            formula: describeRollFormula(1, 20, spellAttackModifier),
            text: `Attack ${formatSigned(spellAttackModifier)}`,
            classes: 'button--small',
          })}
          <span class="roll-badge">Save DC ${escapeHtml(String(saveDc))}</span>
        </div>
      </div>
      <div class="editor-grid spellcasting-grid">
        <label class="field">
          <span class="label">Casting Ability</span>
          <select class="select" data-bind="spellcasting.ability">
            <option value="">Auto (${escapeHtml(spellcastingAbility)})</option>
            ${ABILITY_KEYS.map((ability) => `
              <option value="${ability}" ${character.data.spellcasting?.ability === ability ? 'selected' : ''}>${escapeHtml(ABILITY_LABELS[ability])}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Proficiency Bonus</span>
          <input class="input" value="${escapeHtml(formatSigned(getProficiencyBonus(character)))}" disabled />
        </label>
        <label class="field">
          <span class="label">Attack Adj.</span>
          <input class="input" type="number" min="-20" max="20" data-bind="spellcasting.attackBonus" value="${escapeHtml(String(Number(character.data.spellcasting?.attackBonus || 0)))}" />
        </label>
        <label class="field">
          <span class="label">Save DC Adj.</span>
          <input class="input" type="number" min="-20" max="20" data-bind="spellcasting.saveDcBonus" value="${escapeHtml(String(Number(character.data.spellcasting?.saveDcBonus || 0)))}" />
        </label>
      </div>
    </section>
  `;
}

function renderItemCastingPanel(character) {
  const itemsWithSpells = character.data.inventory
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => Array.isArray(entry.grantedSpells) && entry.grantedSpells.length > 0);

  return `
    <section class="editor-card sheet-card sheet-card--wide">
      <div class="panel-header">
        <div>
          <div class="section-title">Item Casting</div>
          <div class="muted">Equipped item spells spend their own charges or uses. Attunement is enforced when the item requires it.</div>
        </div>
      </div>
      <div class="item-list">
        ${
          itemsWithSpells.length === 0
            ? '<div class="empty-card">No item-granted spells detected yet. Import a magical item such as a staff, wand, or charged relic.</div>'
            : itemsWithSpells
                .map(({ entry, index }) => {
                  const ready = isItemReady(entry);
                  const statusBits = [
                    entry.equipped ? 'Equipped' : 'Stored',
                    entry.attunementRequired ? entry.attuned ? 'Attuned' : 'Needs attunement' : '',
                    getItemResourceSummary(entry),
                    entry.resource?.recharge || '',
                  ].filter(Boolean);

                  return `
                    <div class="entry sheet-entry-row">
                      <div class="sheet-entry-row__copy">
                        <strong>${escapeHtml(entry.name || 'Item')}</strong>
                        <div class="muted">${renderMetaBits(statusBits)}</div>
                        ${renderItemSpellButtons(character, entry, index)}
                      </div>
                      <div class="button-row button-row--tight">
                        <button class="button subtle button--small" data-action="open-sheet-entry" data-list="inventory" data-index="${index}">View</button>
                        ${!ready ? '<span class="roll-badge">Ready item to cast</span>' : ''}
                      </div>
                    </div>
                  `;
                })
                .join('')
        }
      </div>
    </section>
  `;
}

function renderSpellSection(character) {
  const spellAttackModifier = getSpellAttackModifier(character);
  const spellSaveDc = getSpellSaveDc(character);

  return `
    <div class="sheet-panel-grid">
      ${renderSpellcastingPanel(character)}
      ${renderItemCastingPanel(character)}
      <section class="editor-card editor-card--section droppable-zone sheet-card sheet-card--wide" data-dropzone="spells">
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
                  .map((entry, index) => {
                    const damageFormula = buildFormulaWithModifier(entry.damageDice, getSpellDamageModifier(character, entry));
                    const rollMode = entry.rollMode || 'utility';
                    const primaryAction =
                      rollMode === 'attack'
                        ? renderRollActionButton({
                            label: `${entry.name || 'Spell'} Attack`,
                            formula: describeRollFormula(1, 20, spellAttackModifier),
                            text: `Attack ${formatSigned(spellAttackModifier)}`,
                            classes: 'button--small',
                          })
                        : rollMode === 'save'
                          ? `<span class="roll-badge">Save DC ${escapeHtml(String(spellSaveDc))}</span>`
                          : '';

                    return `
                      <div class="entry sheet-entry-row">
                        <div class="sheet-entry-row__copy">
                          <strong>${escapeHtml(entry.name || 'Spell')}</strong>
                          <div class="muted">${renderMetaBits([
                            `Level ${entry.level ?? 0}`,
                            entry.source || '',
                            damageFormula ? `Damage ${damageFormula}` : '',
                          ])}</div>
                        </div>
                        <div class="button-row button-row--tight">
                            ${primaryAction}
                            ${
                              damageFormula
                                ? renderRollActionButton({
                                    label: `${entry.name || 'Spell'} Damage`,
                                    formula: damageFormula,
                                    text: `Damage ${damageFormula}`,
                                    classes: 'button--small',
                                  })
                                : ''
                            }
                            <button class="button subtle button--small" data-action="open-sheet-entry" data-list="spells" data-index="${index}">View</button>
                            <button class="button danger button--small" data-action="remove-entry" data-list="spells" data-index="${index}">Remove</button>
                          </div>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>
      </section>
    </div>
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
                    <div class="entry sheet-entry-row">
                      <div class="sheet-entry-row__copy">
                        <strong>${escapeHtml(entry.name || 'Feature')}</strong>
                        <div class="muted">${renderMetaBits([
                          entry.featureType ? titleize(entry.featureType.replace(/_/g, ' '), entry.featureType) : '',
                          entry.levelRequired != null ? `Level ${entry.levelRequired}+` : '',
                          entry.source || '',
                        ])}</div>
                      </div>
                      <div class="button-row button-row--tight">
                        <button class="button subtle button--small" data-action="open-sheet-entry" data-list="features" data-index="${index}">View</button>
                        <button class="button danger button--small" data-action="remove-entry" data-list="features" data-index="${index}">Remove</button>
                      </div>
                    </div>
                  `
                )
                .join('')
        }
      </div>
    </section>
  `;
}

function renderSheetEntryModal() {
  const modalData = getSheetEntryModalData();
  if (!modalData) {
    return '';
  }

  const { listName, index, entry } = modalData;
  const modalSectionLabels = {
    inventory: 'Item',
    spells: 'Spell',
    features: 'Feature',
    attacks: 'Attack',
  };
  let title;
  let body;

  if (listName === 'inventory') {
    title = entry.name || 'Item';
    body = `
      <div class="sheet-entry-modal__grid">
        <label class="field">
          <span class="label">Name</span>
          <input class="input" data-list="inventory" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" />
        </label>
        <label class="field">
          <span class="label">Quantity</span>
          <input class="input" type="number" min="1" data-list="inventory" data-index="${index}" data-field="quantity" value="${escapeHtml(String(entry.quantity || 1))}" />
        </label>
        <label class="field field--checkbox">
          <input type="checkbox" data-list="inventory" data-index="${index}" data-field="equipped" ${entry.equipped ? 'checked' : ''} />
          <span>Equipped</span>
        </label>
        <label class="field field--checkbox">
          <input type="checkbox" data-list="inventory" data-index="${index}" data-field="attunementRequired" ${entry.attunementRequired ? 'checked' : ''} />
          <span>Requires attunement</span>
        </label>
        <label class="field field--checkbox">
          <input type="checkbox" data-list="inventory" data-index="${index}" data-field="attuned" ${entry.attuned ? 'checked' : ''} />
          <span>Attuned</span>
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Source</span>
          <input class="input" data-list="inventory" data-index="${index}" data-field="source" value="${escapeHtml(entry.source || '')}" />
        </label>
        <label class="field">
          <span class="label">Ammo Type</span>
          <input class="input" data-list="inventory" data-index="${index}" data-field="providesAmmoType" value="${escapeHtml(entry.providesAmmoType || '')}" placeholder="arrow" />
        </label>
        <label class="field">
          <span class="label">Resource Label</span>
          <input class="input" data-list="inventory" data-index="${index}" data-field="resource.label" value="${escapeHtml(entry.resource?.label || '')}" placeholder="Charges" />
        </label>
        <label class="field">
          <span class="label">Resource Max</span>
          <input class="input" type="number" min="0" data-list="inventory" data-index="${index}" data-field="resource.max" value="${escapeHtml(String(entry.resource?.max ?? ''))}" />
        </label>
        <label class="field">
          <span class="label">Resource Current</span>
          <input class="input" type="number" min="0" data-list="inventory" data-index="${index}" data-field="resource.current" value="${escapeHtml(String(entry.resource?.current ?? ''))}" />
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Recharge</span>
          <input class="input" data-list="inventory" data-index="${index}" data-field="resource.recharge" value="${escapeHtml(entry.resource?.recharge || '')}" placeholder="Regains 1d6 + 4 at dawn" />
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Description</span>
          <textarea class="textarea textarea--compact" data-list="inventory" data-index="${index}" data-field="description">${escapeHtml(entry.description || '')}</textarea>
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Notes</span>
          <textarea class="textarea textarea--compact" data-list="inventory" data-index="${index}" data-field="notes">${escapeHtml(entry.notes || '')}</textarea>
        </label>
        ${
          entry.grantedSpells?.length
            ? `
              <div class="sheet-entry-modal__full stack stack--section-gap">
                <div>
                  <div class="section-title">Item Spells</div>
                  <div class="muted">Casting uses this item's own charges or uses.</div>
                </div>
                ${renderItemSpellButtons(activeCharacter(), entry, index)}
              </div>
            `
            : ''
        }
      </div>
    `;
  } else if (listName === 'spells') {
    title = entry.name || 'Spell';
    body = `
      <div class="sheet-entry-modal__grid">
        <label class="field">
          <span class="label">Name</span>
          <input class="input" data-list="spells" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" />
        </label>
        <label class="field">
          <span class="label">Level</span>
          <input class="input" type="number" min="0" max="9" data-list="spells" data-index="${index}" data-field="level" value="${escapeHtml(String(entry.level ?? 0))}" />
        </label>
        <label class="field">
          <span class="label">Roll Type</span>
          <select class="select" data-list="spells" data-index="${index}" data-field="rollMode">
            ${SPELL_ROLL_MODE_OPTIONS.map(([value, label]) => `
              <option value="${value}" ${(entry.rollMode || 'utility') === value ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Source</span>
          <input class="input" data-list="spells" data-index="${index}" data-field="source" value="${escapeHtml(entry.source || '')}" />
        </label>
        <label class="field">
          <span class="label">Damage Dice</span>
          <input class="input" data-list="spells" data-index="${index}" data-field="damageDice" value="${escapeHtml(entry.damageDice || '')}" />
        </label>
        <label class="field">
          <span class="label">Damage Ability</span>
          <select class="select" data-list="spells" data-index="${index}" data-field="damageAbility">
            ${SPELL_DAMAGE_ABILITY_OPTIONS.map(([value, label]) => `
              <option value="${value}" ${(entry.damageAbility || 'spell') === value ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Damage Adj.</span>
          <input class="input" type="number" min="-20" max="20" data-list="spells" data-index="${index}" data-field="damageBonus" value="${escapeHtml(String(Number(entry.damageBonus || 0)))}" />
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Description</span>
          <textarea class="textarea textarea--compact" data-list="spells" data-index="${index}" data-field="description">${escapeHtml(entry.description || '')}</textarea>
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Higher Levels</span>
          <textarea class="textarea textarea--compact" data-list="spells" data-index="${index}" data-field="higherLevelText">${escapeHtml(entry.higherLevelText || '')}</textarea>
        </label>
      </div>
    `;
  } else if (listName === 'features') {
    title = entry.name || 'Feature';
    body = `
      <div class="sheet-entry-modal__grid">
        <label class="field">
          <span class="label">Name</span>
          <input class="input" data-list="features" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" />
        </label>
        <label class="field">
          <span class="label">Source</span>
          <input class="input" data-list="features" data-index="${index}" data-field="source" value="${escapeHtml(entry.source || '')}" />
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Description</span>
          <textarea class="textarea textarea--compact" data-list="features" data-index="${index}" data-field="description">${escapeHtml(entry.description || '')}</textarea>
        </label>
      </div>
    `;
  } else {
    title = entry.name || 'Attack';
    body = `
      <div class="sheet-entry-modal__grid">
        <label class="field">
          <span class="label">Name</span>
          <input class="input" data-list="attacks" data-index="${index}" data-field="name" value="${escapeHtml(entry.name || '')}" />
        </label>
        <label class="field">
          <span class="label">Ability</span>
          <select class="select" data-list="attacks" data-index="${index}" data-field="ability">
            ${ABILITY_KEYS.map((ability) => `
              <option value="${ability}" ${getAttackAbilityKey(entry) === ability ? 'selected' : ''}>${escapeHtml(ability)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Proficiency</span>
          <select class="select" data-list="attacks" data-index="${index}" data-field="proficiency">
            ${ATTACK_PROFICIENCY_OPTIONS.map(([value, label]) => `
              <option value="${value}" ${(entry.proficiency || 'proficient') === value ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Attack Adj.</span>
          <input class="input" type="number" min="-20" max="20" data-list="attacks" data-index="${index}" data-field="attackBonus" value="${escapeHtml(String(Number(entry.attackBonus || 0)))}" />
        </label>
        <label class="field">
          <span class="label">Damage Dice</span>
          <input class="input" data-list="attacks" data-index="${index}" data-field="damageDice" value="${escapeHtml(entry.damageDice || '')}" />
        </label>
        <label class="field">
          <span class="label">Damage Ability</span>
          <select class="select" data-list="attacks" data-index="${index}" data-field="damageAbility">
            ${DAMAGE_ABILITY_OPTIONS.map(([value, label]) => `
              <option value="${value}" ${(entry.damageAbility || 'same') === value ? 'selected' : ''}>${escapeHtml(label)}</option>
            `).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">Damage Adj.</span>
          <input class="input" type="number" min="-20" max="20" data-list="attacks" data-index="${index}" data-field="damageBonus" value="${escapeHtml(String(Number(entry.damageBonus || 0)))}" />
        </label>
        <label class="field field--checkbox">
          <input type="checkbox" data-list="attacks" data-index="${index}" data-field="requiresEquipped" ${entry.requiresEquipped ? 'checked' : ''} />
          <span>Requires equipped item</span>
        </label>
        <label class="field">
          <span class="label">Ammo Type</span>
          <input class="input" data-list="attacks" data-index="${index}" data-field="ammoType" value="${escapeHtml(entry.ammoType || '')}" placeholder="arrow" />
        </label>
        <label class="field">
          <span class="label">Ammo / Attack</span>
          <input class="input" type="number" min="0" data-list="attacks" data-index="${index}" data-field="ammoPerUse" value="${escapeHtml(String(Number(entry.ammoPerUse || 0)))}" />
        </label>
        <label class="field sheet-entry-modal__full">
          <span class="label">Notes</span>
          <textarea class="textarea textarea--compact" data-list="attacks" data-index="${index}" data-field="notes">${escapeHtml(entry.notes || '')}</textarea>
        </label>
      </div>
    `;
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--entry">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">${escapeHtml(modalSectionLabels[listName] || 'Entry')}</div>
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

function renderDiceHistory() {
  if (state.dice.history.length === 0) {
    return '<div class="empty-card empty-card--dice-history">No rolls yet. Pick a die and let Dice Box handle the throw.</div>';
  }

  return state.dice.history
    .map(
      (roll) => `
        <div class="dice-history__item">
          <div>
            <strong>${escapeHtml(roll.label || roll.formula)}</strong>
            ${roll.label ? `<div class="muted">${escapeHtml(roll.formula)}</div>` : ''}
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
    label: '',
    total: null,
    formula: describeRollFormula(state.dice.count, state.dice.sides, state.dice.modifier),
    values: [],
    modifier: state.dice.modifier,
  };
  const activeModel = getActiveDiceModel();

  return `
    <div class="muted">${escapeHtml(activeModel?.name || 'No dice model')}</div>
    ${activeRoll.label ? `<div class="dice-stage__label">${escapeHtml(activeRoll.label)}</div>` : ''}
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
          <div class="muted">Roll checks directly from the score cards and keep the modifier in sync with the sheet.</div>
        </div>
      </div>
      <div class="ability-grid">
        ${ABILITY_KEYS.map((ability) => {
          const modifier = getAbilityModifierValue(character.data.abilities[ability]);
          return `
            <div class="ability-card">
              <div class="ability-card__top">
                <div class="ability-card__label">${escapeHtml(ABILITY_LABELS[ability])}</div>
                ${renderRollActionButton({
                  label: `${ABILITY_LABELS[ability]} Check`,
                  formula: describeRollFormula(1, 20, modifier),
                  text: `Check ${formatSigned(modifier)}`,
                  classes: 'button--small roll-action--inline',
                })}
              </div>
              <strong>${escapeHtml(ability)}</strong>
              <input class="input ability-input" type="number" min="1" max="30" data-bind="abilities.${ability}" value="${escapeHtml(character.data.abilities[ability])}" />
              <div class="ability-mod">${escapeHtml(abilityModifier(character.data.abilities[ability]))}</div>
            </div>
          `;
        }).join('')}
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
      ${renderSkillsPanel(character)}
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
            <div class="muted">Primary combat values with direct edits and live initiative rolling.</div>
          </div>
          ${renderRollActionButton({
            label: 'Initiative',
            formula: describeRollFormula(1, 20, Number(character.data.initiative || 0)),
            text: `Initiative ${formatSigned(character.data.initiative || 0)}`,
            classes: 'button--small',
          })}
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
      ${renderAttackSection(character)}
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
              ${renderRollActionButton({
                label: 'Initiative',
                formula: describeRollFormula(1, 20, Number(character.data.initiative || 0)),
                text: 'Roll',
                classes: 'button--small roll-action--inline',
              })}
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
      <div class="sheet-content" data-dropzone="sheet">
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
  const destinations = getCompendiumDestinationLabels(result);

  return `
    <article class="result-card result-card--compact ${state.compendiumDetailIndex === index ? 'active' : ''}" data-action="select-compendium-result" data-index="${index}" draggable="true" data-compendium-index="${index}">
      <div class="result-card__header">
        <div>
          <strong>${escapeHtml(result.name)}</strong>
          <div class="muted">${renderMetaBits(metaBits)}</div>
          <div class="result-card__routes">${renderRouteChips(destinations)}</div>
        </div>
        <button class="button subtle" data-action="add-compendium" data-index="${index}">Add</button>
      </div>
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
  return renderWizardModalView({
    wizard: state.wizard,
    steps: getWizardSteps(),
    canAdvance: canAdvanceWizard(),
    getCompendiumEntries,
    getCompendiumEntryBySlug,
    getClassHitDie,
    renderSummaryCards,
  });
}

function renderCompendiumDetail() {
  const result = getSelectedCompendiumResult();
  if (!result) {
    return '<div class="compendium-detail__empty">Search the compendium and select a result to inspect it in detail.</div>';
  }

  const hasCharacter = Boolean(activeCharacter());
  const destinations = getCompendiumDestinationLabels(result);
  const description = getCompendiumDescription(result);
  const higherLevelText = getCompendiumHigherLevelText(result);

  return `
    <div class="compendium-detail__card">
      <div class="section-title">Selected Entry</div>
      <h3 class="compendium-detail__title">${escapeHtml(result.name)}</h3>
      <div class="muted">${renderMetaBits([result.sourceCode || '', result.level != null ? `Level ${result.level}` : '', result.featureType || ''])}</div>
      <div class="compendium-detail__routes">${renderRouteChips(destinations)}</div>
      <p class="compendium-detail__copy">${escapeHtml(description || 'No description available.')}</p>
      ${higherLevelText ? `<div class="compendium-detail__section"><div class="section-title">Higher Levels</div><p class="compendium-detail__copy">${escapeHtml(higherLevelText)}</p></div>` : ''}
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
      ${renderSheetEntryModal()}
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
        state.sheetEntryModal = null;
        if (!state.compendiumPinned) {
          state.compendiumHidden = true;
        }
        render();
        break;
      case 'select-character':
        state.activeCharacterId = target.dataset.characterId;
        state.sheetTab = 'core';
        state.sheetEntryModal = null;
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
        await addCompendiumEntry(Number(target.dataset.index));
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
      case 'open-sheet-entry':
        openSheetEntryModal(target.dataset.list, target.dataset.index);
        break;
      case 'close-sheet-entry':
        closeSheetEntryModal();
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
      case 'toggle-equip': {
        const character = activeCharacter();
        const entry = character?.data?.inventory?.[Number(target.dataset.index)];
        if (!entry) {
          return;
        }
        entry.equipped = !entry.equipped;
        render();
        break;
      }
      case 'toggle-attunement':
        toggleItemAttunement(Number(target.dataset.index));
        break;
      case 'roll-attack':
        await rollAttackFromSheet(Number(target.dataset.index));
        break;
      case 'cast-item-spell':
        await castItemSpellFromSheet(Number(target.dataset.index), Number(target.dataset.spellIndex));
        break;
      case 'roll-sheet-formula':
        await rollDiceFormula(target.dataset.formula, target.dataset.label || 'Sheet Roll');
        break;
      case 'add-entry': {
        const character = activeCharacter();
        if (!character) {
          return;
        }
        const list = target.dataset.list;
        if (list === 'attacks') {
          character.data.attacks.push(createDefaultAttack());
        } else if (list === 'inventory') {
          character.data.inventory.push(createDefaultInventoryEntry());
        } else if (list === 'spells') {
          character.data.spells.push(createDefaultSpellEntry());
        } else {
          character.data.features.push(createDefaultFeatureEntry());
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
        if (state.sheetEntryModal?.listName === list) {
          state.sheetEntryModal = null;
        }
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

async function handleSheetDrop(event) {
  const dropZone = event.target.closest('[data-dropzone]');
  if (!dropZone) {
    return;
  }

  event.preventDefault();

  try {
    const payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}');
    if (Number.isInteger(payload.compendiumIndex)) {
      await addCompendiumEntry(payload.compendiumIndex, dropZone.dataset.dropzone);
    }
  } catch {
    // Ignore invalid drag payloads.
  }
}

function handleInput(event) {
  const target = event.target;

  if (target.matches('[data-bind]')) {
    updateActiveCharacter(target.dataset.bind, readFormControlValue(target));
    return;
  }

  if (target.matches('[data-list][data-field]')) {
    updateListEntry(
      target.dataset.list,
      Number(target.dataset.index),
      target.dataset.field,
      readFormControlValue(target)
    );
    return;
  }

  if (target.matches('[data-wizard-bind]')) {
    updateWizardDraft(target.dataset.wizardBind, readFormControlValue(target));
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
      updateWizardDraft(target.dataset.wizardBind, readFormControlValue(target));
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

    if (target.matches('[data-list][data-field]')) {
      updateListEntry(
        target.dataset.list,
        Number(target.dataset.index),
        target.dataset.field,
        readFormControlValue(target)
      );
      return;
    }

    if (target.matches('[data-bind]')) {
      updateActiveCharacter(target.dataset.bind, readFormControlValue(target));
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
