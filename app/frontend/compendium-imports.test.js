import { describe, expect, it } from 'vitest';

import { createDefaultCharacter } from './character-data.js';
import {
  buildCompendiumImportPlan,
  getCompendiumDestinationLabels,
  isAttackAvailable,
} from './compendium-imports.js';

describe('compendium-imports', () => {
  it('routes structured items into inventory and attacks', () => {
    const result = {
      type: 'items',
      name: 'Longsword',
      slug: 'longsword',
      code: 'longsword',
      sourceCode: '2014',
      tags: { year: '2014' },
      description: 'Martial melee weapon.',
      profile: {
        raw: {
          weapon_range: 'Melee',
          damage: {
            damage_dice: '1d8',
            damage_type: { name: 'Slashing' },
          },
        },
      },
      properties: {
        properties: [{ name: 'Versatile' }],
      },
    };

    const plan = buildCompendiumImportPlan(result);

    expect(plan).toHaveLength(2);
    expect(plan.map((entry) => entry.list)).toEqual(['inventory', 'attacks']);
    expect(plan[0].entry.name).toBe('Longsword');
    expect(plan[1].entry.damageDice).toBe('1d8');
    expect(plan[1].entry.requiresEquipped).toBe(true);
    expect(getCompendiumDestinationLabels(result)).toEqual(['Inventory', 'Attacks']);
  });

  it('keeps passive features out of the attacks list', () => {
    const result = {
      type: 'features',
      name: 'Rage',
      slug: 'rage',
      description: 'You can enter a rage as a bonus action.',
      shortDescription: 'Combat focus.',
    };

    const plan = buildCompendiumImportPlan(result);

    expect(plan).toHaveLength(1);
    expect(plan[0].list).toBe('features');
    expect(plan[0].entry.name).toBe('Rage');
  });

  it('requires equipped source items before enabling derived attacks', () => {
    const character = {
      data: {
        ...createDefaultCharacter(),
        inventory: [
          {
            name: 'Longsword',
            slug: 'longsword',
            code: 'longsword',
            equipped: false,
          },
        ],
      },
    };
    const attack = {
      requiresEquipped: true,
      sourceSlug: 'longsword',
      sourceCode: 'longsword',
      sourceName: 'Longsword',
    };

    expect(isAttackAvailable(character, attack)).toBe(false);
    character.data.inventory[0].equipped = true;
    expect(isAttackAvailable(character, attack)).toBe(true);
  });
});
