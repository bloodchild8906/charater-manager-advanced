import { ABILITY_KEYS } from './constants.js';
import { extractItemCapabilities } from './item-capabilities.js';

export function createDefaultAttack() {
  return {
    name: '',
    ability: 'STR',
    proficiency: 'proficient',
    attackBonus: 0,
    damageDice: '1d8',
    damageAbility: 'same',
    damageBonus: 0,
    sourceType: '',
    sourceSlug: '',
    sourceCode: '',
    sourceName: '',
    requiresEquipped: false,
    ammoType: '',
    ammoPerUse: 0,
    notes: '',
  };
}

export function createDefaultGrantedSpellEntry() {
  return {
    ...createDefaultSpellEntry(),
    chargeCost: 1,
    sourceItemName: '',
  };
}

export function createDefaultInventoryEntry() {
  return {
    name: '',
    quantity: 1,
    equipped: false,
    attunementRequired: false,
    attuned: false,
    source: '',
    description: '',
    notes: '',
    compendiumType: 'items',
    slug: '',
    code: '',
    tags: null,
    profile: null,
    properties: null,
    providesAmmoType: '',
    resource: {
      label: '',
      current: null,
      max: null,
      recharge: '',
    },
    grantedSpells: [],
  };
}

export function createDefaultSpellEntry() {
  return {
    name: '',
    level: 0,
    source: '',
    description: '',
    higherLevelText: '',
    rollMode: 'utility',
    damageDice: '',
    damageAbility: 'spell',
    damageBonus: 0,
    compendiumType: 'spells',
    slug: '',
    code: '',
    attackType: '',
    tags: null,
    damage: null,
  };
}

export function createDefaultFeatureEntry() {
  return {
    name: '',
    source: '',
    description: '',
    shortDescription: '',
    featureType: '',
    levelRequired: null,
    compendiumType: 'features',
    slug: '',
    code: '',
    effects: null,
    tags: null,
  };
}

export function createDefaultCharacter(edition = 'all') {
  return {
    name: 'Unnamed Hero',
    edition,
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
    skillRanks: {},
    skillBonuses: {},
    conditions: [],
    exhaustion: 0,
    personality: {
      trait: '',
      ideal: '',
      bond: '',
      flaw: '',
      obsession: '',
    },
    connections: [],
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    hitDice: {
      current: 0,
      max: 0,
    },
    sorceryPoints: {
      current: 0,
      max: 0,
    },
    attacks: [],
    inventory: [],
    spells: [],
    spellcasting: {
      ability: '',
      attackBonus: 0,
      saveDcBonus: 0,
    },
    spellSlots: {
      1: { current: 0, max: 0 },
      2: { current: 0, max: 0 },
      3: { current: 0, max: 0 },
      4: { current: 0, max: 0 },
      5: { current: 0, max: 0 },
      6: { current: 0, max: 0 },
      7: { current: 0, max: 0 },
      8: { current: 0, max: 0 },
      9: { current: 0, max: 0 },
    },
    features: [],
    wildShapes: [],
    familiar: {
      name: '',
      type: '',
      hp: { current: 0, max: 0 },
      ac: 0,
      abilities: '',
      notes: '',
    },
    companions: [],
    followers: [],
    notes: '',
  };
}

export function createBlankAbilityAssignments() {
  return Object.fromEntries(ABILITY_KEYS.map((ability) => [ability, null]));
}

export function normalizeCharacter(character, editionFallback = 'all') {
  const defaults = createDefaultCharacter(editionFallback);
  const data = {
    ...defaults,
    ...(character?.data || {}),
  };

  data.abilities = {
    ...defaults.abilities,
    ...(data.abilities || {}),
  };
  data.hp = {
    ...defaults.hp,
    ...(data.hp || {}),
  };
  data.skillRanks = {
    ...defaults.skillRanks,
    ...(data.skillRanks || {}),
  };
  data.skillBonuses = {
    ...defaults.skillBonuses,
    ...(data.skillBonuses || {}),
  };
  data.spellcasting = {
    ...defaults.spellcasting,
    ...(data.spellcasting || {}),
  };
  data.spellSlots = {
    ...defaults.spellSlots,
    ...(data.spellSlots || {}),
  };
  Object.keys(defaults.spellSlots).forEach((level) => {
    data.spellSlots[level] = {
      ...defaults.spellSlots[level],
      ...(data.spellSlots?.[level] || {}),
    };
  });
  data.personality = {
    ...defaults.personality,
    ...(data.personality || {}),
  };
  data.deathSaves = {
    ...defaults.deathSaves,
    ...(data.deathSaves || {}),
  };
  data.hitDice = {
    ...defaults.hitDice,
    ...(data.hitDice || {}),
  };
  data.sorceryPoints = {
    ...defaults.sorceryPoints,
    ...(data.sorceryPoints || {}),
  };
  data.familiar = {
    ...defaults.familiar,
    ...(data.familiar || {}),
  };
  data.familiar.hp = {
    ...defaults.familiar.hp,
    ...(data.familiar?.hp || {}),
  };
  data.conditions = Array.isArray(data.conditions) ? data.conditions : [];
  data.connections = Array.isArray(data.connections) ? data.connections : [];
  data.wildShapes = Array.isArray(data.wildShapes) ? data.wildShapes : [];
  data.companions = Array.isArray(data.companions) ? data.companions : [];
  data.followers = Array.isArray(data.followers) ? data.followers : [];
  data.exhaustion = Number(data.exhaustion || 0);
  data.attacks = Array.isArray(data.attacks)
    ? data.attacks.map((entry) => ({ ...createDefaultAttack(), ...(entry || {}) }))
    : [];
  data.inventory = Array.isArray(data.inventory)
    ? data.inventory.map((entry) => {
        const detectedCapabilities = extractItemCapabilities({
          name: entry?.name,
          code: entry?.code,
          description: entry?.description,
          fullDescription: entry?.description,
          profile: entry?.profile,
          properties: entry?.properties,
        });
        const normalizedEntry = {
          ...createDefaultInventoryEntry(),
          ...(entry || {}),
        };
        normalizedEntry.resource = {
          ...createDefaultInventoryEntry().resource,
          ...(detectedCapabilities.resource || {}),
          ...(normalizedEntry.resource || {}),
        };
        normalizedEntry.attunementRequired =
          Boolean(normalizedEntry.attunementRequired) || Boolean(detectedCapabilities.attunementRequired);
        normalizedEntry.providesAmmoType = normalizedEntry.providesAmmoType || detectedCapabilities.providesAmmoType;
        const spellSource =
          Array.isArray(entry?.grantedSpells) && entry.grantedSpells.length > 0
            ? entry.grantedSpells
            : detectedCapabilities.grantedSpells;
        normalizedEntry.grantedSpells = Array.isArray(spellSource)
          ? spellSource.map((spell) => ({
              ...createDefaultGrantedSpellEntry(),
              ...(spell || {}),
            }))
          : [];
        return normalizedEntry;
      })
    : [];
  data.spells = Array.isArray(data.spells)
    ? data.spells.map((entry) => ({ ...createDefaultSpellEntry(), ...(entry || {}) }))
    : [];
  data.features = Array.isArray(data.features)
    ? data.features.map((entry) => ({ ...createDefaultFeatureEntry(), ...(entry || {}) }))
    : [];
  data.name = data.name || character?.name || 'Unnamed Hero';
  data.edition = data.edition || character?.edition || editionFallback;
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
