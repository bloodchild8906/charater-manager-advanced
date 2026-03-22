import { titleize } from './utils.js';

export const ATTUNEMENT_SLOT_COUNT = 3;

const AMMO_LABELS = {
  arrow: 'Arrows',
  'crossbow-bolt': 'Bolts',
  'blowgun-needle': 'Needles',
  'sling-bullet': 'Bullets',
};

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpellSeedName(value) {
  const normalized = normalizeText(value)
    .replace(/^the\s+/i, '')
    .replace(/^(?:or|and)\s+/i, '')
    .replace(/\s+spell$/i, '')
    .replace(/\s+from it$/i, '')
    .trim();

  return titleize(normalized, normalized);
}

function splitSpellList(listText) {
  return listText
    .replace(/,\s*or\s+/gi, ', ')
    .replace(/,\s*and\s+/gi, ', ')
    .split(',')
    .map((entry) => normalizeSpellSeedName(entry))
    .filter(Boolean);
}

function parseItemResource(description) {
  const normalizedDescription = normalizeText(description);
  const chargeMatch = normalizedDescription.match(/\b(?:has|with)\s+(\d+)\s+charges?\b/i);
  if (chargeMatch) {
    const max = Number(chargeMatch[1]) || 0;
    const rechargeMatch = normalizedDescription.match(/\bregains?\s+([^.]+?)\s+(?:daily at dawn|at dawn)\b/i);
    return {
      label: 'Charges',
      current: max,
      max,
      recharge: rechargeMatch ? `Regains ${rechargeMatch[1]} at dawn` : '',
    };
  }

  if (/can't be used this way again until (?:the )?next dawn/i.test(normalizedDescription)) {
    return {
      label: 'Uses',
      current: 1,
      max: 1,
      recharge: 'Refreshes at dawn',
    };
  }

  return {
    label: '',
    current: null,
    max: null,
    recharge: '',
  };
}

function parseItemGrantedSpells(description) {
  const text = String(description || '');
  const seeds = [];

  const followingSpellsMatch = text.match(/following spells from it[^:]*:\s*([^.]*)\./i);
  if (followingSpellsMatch) {
    for (const match of followingSpellsMatch[1].matchAll(/([a-z][a-z' -]+?)\s*\((\d+)\s+charges?\)/gi)) {
      seeds.push({
        name: normalizeSpellSeedName(match[1]),
        chargeCost: Number(match[2]) || 1,
      });
    }
  }

  const groupedCastMatch = text.match(/expend\s+(\d+)(?:\s+or more)?[^.]*?\bto cast\s+(.+?)\s+from it/iu);
  if (groupedCastMatch && !/following spells/i.test(groupedCastMatch[2])) {
    for (const name of splitSpellList(groupedCastMatch[2])) {
      if (!seeds.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
        seeds.push({
          name,
          chargeCost: Number(groupedCastMatch[1]) || 1,
        });
      }
    }
  }

  const spellLikeMatch = text.match(/as if you had cast the\s+([a-z][a-z' -]+?)\s+spell/iu);
  if (spellLikeMatch) {
    const name = normalizeSpellSeedName(spellLikeMatch[1]);
    if (!seeds.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      seeds.push({ name, chargeCost: 1 });
    }
  }

  const singleSpellMatch = text.match(/cast the\s+([a-z][a-z' -]+?)\s+spell from it/iu);
  if (singleSpellMatch) {
    const name = normalizeSpellSeedName(singleSpellMatch[1]);
    if (!seeds.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      seeds.push({ name, chargeCost: 1 });
    }
  }

  return seeds;
}

function getItemPropertyNames(result) {
  const properties = result?.properties?.properties;
  if (!Array.isArray(properties)) {
    return [];
  }

  return properties.map((property) => String(property?.name || property?.index || '').toLowerCase()).filter(Boolean);
}

export function inferAmmoTypeFromResult(result) {
  const profile = result?.profile?.raw || result?.profile || {};
  const propertyNames = getItemPropertyNames(result);
  const name = String(result?.name || '').toLowerCase();
  const code = String(result?.code || '').toLowerCase();

  if (!propertyNames.includes('ammunition')) {
    return '';
  }

  if (name.includes('crossbow') || code.includes('crossbow')) {
    return 'crossbow-bolt';
  }
  if (name.includes('blowgun') || code.includes('blowgun')) {
    return 'blowgun-needle';
  }
  if (name.includes('sling') || code.includes('sling')) {
    return 'sling-bullet';
  }
  if (String(profile?.weapon_range || '').toLowerCase() === 'ranged' || name.includes('bow') || code.includes('bow')) {
    return 'arrow';
  }

  return '';
}

function inferProvidedAmmoType(result) {
  const name = String(result?.name || '').toLowerCase();
  const code = String(result?.code || '').toLowerCase();
  const gearCategory = String(result?.profile?.raw?.gear_category?.index || '').toLowerCase();
  const equipmentCategory = String(result?.profile?.raw?.equipment_category?.index || '').toLowerCase();

  if (code === 'arrow' || name.includes('arrow')) {
    return 'arrow';
  }
  if (code === 'crossbow-bolt' || name.includes('crossbow bolt') || name.includes('bolts')) {
    return 'crossbow-bolt';
  }
  if (code === 'blowgun-needle' || name.includes('blowgun needle') || name === 'needles') {
    return 'blowgun-needle';
  }
  if (code === 'sling-bullet' || name.includes('sling bullet') || name.includes('bullets, sling')) {
    return 'sling-bullet';
  }
  if (gearCategory === 'ammunition' || equipmentCategory === 'ammunition') {
    return code || '';
  }

  return '';
}

export function extractItemCapabilities(result) {
  const description = String(result?.fullDescription || result?.description || '').trim();

  return {
    attunementRequired: /\brequires attunement\b/i.test(description),
    resource: parseItemResource(description),
    grantedSpells: parseItemGrantedSpells(description).map((spell) => ({
      ...spell,
      sourceItemName: result?.name || '',
    })),
    ammoType: inferAmmoTypeFromResult(result),
    providesAmmoType: inferProvidedAmmoType(result),
  };
}

export function getAttunedItemCount(character) {
  return (character?.data?.inventory || []).filter((entry) => entry.attuned).length;
}

export function getAmmoTypeLabel(ammoType) {
  return AMMO_LABELS[ammoType] || titleize(ammoType.replace(/-/g, ' '), 'Ammo');
}

export function getAmmoQuantity(character, ammoType) {
  if (!character || !ammoType) {
    return 0;
  }

  return (character.data.inventory || [])
    .filter((entry) =>
      entry.providesAmmoType === ammoType ||
      entry.code === ammoType ||
      entry.slug === ammoType
    )
    .reduce((total, entry) => total + Number(entry.quantity || 0), 0);
}

export function getItemResourceSummary(entry) {
  const resource = entry?.resource || {};
  if (resource.max == null && resource.current == null) {
    return '';
  }

  const label = resource.label || 'Uses';
  return `${Number(resource.current ?? 0)}/${Number(resource.max ?? 0)} ${label}`;
}

export function canSpendItemResource(entry, cost = 1) {
  const resource = entry?.resource || {};
  if (resource.max == null && resource.current == null) {
    return true;
  }

  return Number(resource.current ?? 0) >= Number(cost || 0);
}

export function isItemReady(entry) {
  return Boolean(entry?.equipped) && (!entry?.attunementRequired || Boolean(entry?.attuned));
}
