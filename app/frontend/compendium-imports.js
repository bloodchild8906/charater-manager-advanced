import {
  createDefaultAttack,
  createDefaultFeatureEntry,
  createDefaultInventoryEntry,
  createDefaultSpellEntry,
} from './character-data.js';
import { analyzeRollFormula, titleize } from './utils.js';

function getCompendiumShortDescription(result) {
  return String(result?.shortDescription || result?.description || '').trim();
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
    notes: [sourceMeta, rangeBits.join(' | '), getCompendiumDescription(result)].filter(Boolean).join('\n\n'),
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

export function getCompendiumDescription(result) {
  return String(result?.fullDescription || result?.description || buildItemProfileSummary(result) || '').trim();
}

export function getCompendiumHigherLevelText(result) {
  return String(result?.higherLevelText || '').trim();
}

export function buildCompendiumImportPlan(result) {
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

export function getCompendiumDestinationLabels(result) {
  const labels = {
    inventory: 'Inventory',
    attacks: 'Attacks',
    spells: 'Spells',
    features: 'Features',
  };

  return [
    ...new Set(
      buildCompendiumImportPlan(result).map((entry) => labels[entry.list] || titleize(entry.list, entry.list))
    ),
  ];
}

export function findInventorySourceForAttack(character, attack) {
  if (!character || !attack?.requiresEquipped) {
    return null;
  }

  return (
    character.data.inventory.find(
      (entry) =>
        (attack.sourceSlug && entry.slug === attack.sourceSlug) ||
        (attack.sourceCode && entry.code === attack.sourceCode) ||
        (attack.sourceName && entry.name === attack.sourceName)
    ) || null
  );
}

export function isAttackAvailable(character, attack) {
  if (!attack?.requiresEquipped) {
    return true;
  }

  return Boolean(findInventorySourceForAttack(character, attack)?.equipped);
}
