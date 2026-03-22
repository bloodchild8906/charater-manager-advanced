import { describe, expect, it } from 'vitest';

import { buildSelectionDetailsMarkdown, renderWizardModal } from './wizard.js';

function createEntryMap() {
  return {
    classes: [
      {
        slug: 'wizard',
        name: 'Wizard',
        sourceCode: '2024',
        hitDie: 6,
        description: '**Arcane** scholar.\n\n- Spellcasting\n- Ritual Casting',
      },
    ],
    ancestries: [
      {
        slug: 'elf',
        name: 'Elf',
        sourceCode: '2024',
        description: 'Graceful wanderer with _keen senses_.',
      },
    ],
    backgrounds: [
      {
        slug: 'sage',
        name: 'Sage',
        sourceCode: '2014',
        description: 'You spent years studying lore.',
      },
    ],
  };
}

describe('wizard renderer', () => {
  it('builds markdown details from a selection entry', () => {
    const markdown = buildSelectionDetailsMarkdown(
      {
        sourceCode: '2024',
        description: 'A careful student of ancient magic.',
      },
      ['**Hit Die:** d6']
    );

    expect(markdown).toContain('**Source:** 2024');
    expect(markdown).toContain('**Hit Die:** d6');
    expect(markdown).toContain('ancient magic');
  });

  it('renders markdown-backed detail cards for lineage selections', () => {
    const entryMap = createEntryMap();
    const getCompendiumEntries = (type) => entryMap[type] || [];
    const getCompendiumEntryBySlug = (type, slug) =>
      getCompendiumEntries(type).find((entry) => entry.slug === slug) || null;

    const html = renderWizardModal({
      wizard: {
        mode: 'create',
        step: 1,
        draft: {
          name: 'Aldric Stormveil',
          alignment: 'Neutral Good',
          edition: '2024',
          classSlug: 'wizard',
          ancestrySlug: 'elf',
          backgroundSlug: 'sage',
          level: 1,
          hp: { max: 8, current: 8, temp: 0 },
          abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
          ac: 12,
          speed: 30,
          initiative: 2,
        },
        assignedScores: {},
        availableScores: [15, 14, 13, 12, 10, 8],
      },
      steps: ['Identity', 'Lineage', 'Abilities', 'Combat', 'Review'],
      canAdvance: true,
      getCompendiumEntries,
      getCompendiumEntryBySlug,
      getClassHitDie: () => 6,
      renderSummaryCards: () => '<div>summary</div>',
    });

    expect(html).toContain('wizard-selection-details');
    expect(html).toContain('<strong>Arcane</strong> scholar.');
    expect(html).toContain('<ul><li>Spellcasting</li><li>Ritual Casting</li></ul>');
    expect(html).toContain('<em>keen senses</em>');
    expect(html).toContain('Class Details');
    expect(html).toContain('Background Details');
  });
});
