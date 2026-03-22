import { describe, expect, it } from 'vitest';

import {
  ATTUNEMENT_SLOT_COUNT,
  canSpendItemResource,
  extractItemCapabilities,
  getAmmoQuantity,
  getAmmoTypeLabel,
  getAttunedItemCount,
  getItemResourceSummary,
  inferAmmoTypeFromResult,
  isItemReady,
} from './item-capabilities.js';

describe('item capabilities', () => {
  it('extracts charges, attunement, and spells from charged items', () => {
    const capabilities = extractItemCapabilities({
      name: 'Staff of Fire',
      code: 'staff-of-fire',
      description:
        "Staff, very rare (requires attunement by a druid, sorcerer, warlock, or wizard)\n\nThe staff has 10 charges. While holding it, you can use an action to expend 1 or more of its charges to cast one of the following spells from it, using your spell save DC: burning hands (1 charge), fireball (3 charges), or wall of fire (4 charges).\n\nThe staff regains 1d6 + 4 expended charges daily at dawn.",
    });

    expect(capabilities.attunementRequired).toBe(true);
    expect(capabilities.resource).toEqual({
      label: 'Charges',
      current: 10,
      max: 10,
      recharge: 'Regains 1d6 + 4 expended charges at dawn',
    });
    expect(capabilities.grantedSpells).toEqual([
      { name: 'Burning Hands', chargeCost: 1, sourceItemName: 'Staff of Fire' },
      { name: 'Fireball', chargeCost: 3, sourceItemName: 'Staff of Fire' },
      { name: 'Wall Of Fire', chargeCost: 4, sourceItemName: 'Staff of Fire' },
    ]);
  });

  it('extracts once-per-day spell casting from non-charge items', () => {
    const capabilities = extractItemCapabilities({
      name: 'Bowl of Commanding Water Elementals',
      code: 'bowl-of-commanding-water-elementals',
      description:
        "Wondrous item, rare\n\nWhile this bowl is filled with water, you can use an action to speak the bowl's command word and summon a water elemental, as if you had cast the conjure elemental spell. The bowl can't be used this way again until the next dawn.",
    });

    expect(capabilities.resource).toEqual({
      label: 'Uses',
      current: 1,
      max: 1,
      recharge: 'Refreshes at dawn',
    });
    expect(capabilities.grantedSpells).toEqual([
      { name: 'Conjure Elemental', chargeCost: 1, sourceItemName: 'Bowl of Commanding Water Elementals' },
    ]);
  });

  it('detects required ammunition for ranged weapons', () => {
    const ammoType = inferAmmoTypeFromResult({
      name: 'Longbow',
      code: 'longbow',
      profile: {
        raw: {
          weapon_range: 'Ranged',
        },
      },
      properties: {
        properties: [{ name: 'Ammunition' }, { name: 'Heavy' }],
      },
    });

    expect(ammoType).toBe('arrow');
    expect(getAmmoTypeLabel(ammoType)).toBe('Arrows');
  });

  it('tracks ammo and attunement utility state from inventory', () => {
    const character = {
      data: {
        inventory: [
          { name: 'Arrow', providesAmmoType: 'arrow', quantity: 12, attuned: true },
          { name: 'Wand of Magic Missiles', attuned: true },
          { name: 'Staff of Fire', attuned: false },
        ],
      },
    };

    expect(getAmmoQuantity(character, 'arrow')).toBe(12);
    expect(getAttunedItemCount(character)).toBe(2);
    expect(ATTUNEMENT_SLOT_COUNT).toBe(3);
  });

  it('reports item readiness and resource summaries', () => {
    const item = {
      equipped: true,
      attunementRequired: true,
      attuned: true,
      resource: {
        label: 'Charges',
        current: 3,
        max: 7,
        recharge: 'Regains 1d6 + 1 at dawn',
      },
    };

    expect(isItemReady(item)).toBe(true);
    expect(getItemResourceSummary(item)).toBe('3/7 Charges');
    expect(canSpendItemResource(item, 2)).toBe(true);
    expect(canSpendItemResource(item, 4)).toBe(false);
  });
});
