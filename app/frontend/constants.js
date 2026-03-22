export const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const ABILITY_LABELS = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
};

export const SKILL_DEFINITIONS = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'DEX' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'WIS' },
  { key: 'arcana', label: 'Arcana', ability: 'INT' },
  { key: 'athletics', label: 'Athletics', ability: 'STR' },
  { key: 'deception', label: 'Deception', ability: 'CHA' },
  { key: 'history', label: 'History', ability: 'INT' },
  { key: 'insight', label: 'Insight', ability: 'WIS' },
  { key: 'intimidation', label: 'Intimidation', ability: 'CHA' },
  { key: 'investigation', label: 'Investigation', ability: 'INT' },
  { key: 'medicine', label: 'Medicine', ability: 'WIS' },
  { key: 'nature', label: 'Nature', ability: 'INT' },
  { key: 'perception', label: 'Perception', ability: 'WIS' },
  { key: 'performance', label: 'Performance', ability: 'CHA' },
  { key: 'persuasion', label: 'Persuasion', ability: 'CHA' },
  { key: 'religion', label: 'Religion', ability: 'INT' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'DEX' },
  { key: 'stealth', label: 'Stealth', ability: 'DEX' },
  { key: 'survival', label: 'Survival', ability: 'WIS' },
];

export const SKILL_PROFICIENCY_OPTIONS = [
  ['none', 'None'],
  ['proficient', 'Proficient'],
  ['expertise', 'Expertise'],
];

export const ATTACK_PROFICIENCY_OPTIONS = [
  ['none', 'None'],
  ['proficient', 'Proficient'],
];

export const DAMAGE_ABILITY_OPTIONS = [
  ['none', 'No Ability'],
  ['same', 'Attack Ability'],
  ...ABILITY_KEYS.map((ability) => [ability, ABILITY_LABELS[ability]]),
];

export const SPELL_DAMAGE_ABILITY_OPTIONS = [
  ['none', 'No Ability'],
  ['spell', 'Spell Ability'],
  ...ABILITY_KEYS.map((ability) => [ability, ABILITY_LABELS[ability]]),
];

export const SPELL_ROLL_MODE_OPTIONS = [
  ['utility', 'Utility'],
  ['attack', 'Attack Roll'],
  ['save', 'Saving Throw'],
];

export const SPELLCASTING_ABILITY_BY_CLASS = {
  artificer: 'INT',
  bard: 'CHA',
  cleric: 'WIS',
  druid: 'WIS',
  paladin: 'CHA',
  ranger: 'WIS',
  sorcerer: 'CHA',
  warlock: 'CHA',
  wizard: 'INT',
};

export const EDITION_OPTIONS = [
  ['all', 'All Sources'],
  ['2014', '2014 SRD'],
  ['2024', '2024 SRD'],
];

export const DIE_OPTIONS = [4, 6, 8, 10, 12, 20];

export const STANDARD_ABILITY_ARRAY = [15, 14, 13, 12, 10, 8];

export const SHEET_TABS = [
  ['core', 'Core'],
  ['combat', 'Combat'],
  ['inventory', 'Inventory'],
  ['spells', 'Spells'],
  ['features', 'Features'],
  ['notes', 'Notes'],
];

export const DICE_BOX_MODULE_PATH = '/vendor/dice-box/dice-box.es.js';
