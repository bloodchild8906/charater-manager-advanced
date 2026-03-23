# Character Sheet Enhancement Spec

## Requirements

Enhance the character sheet to match the provided HTML template with the following features:

### New Tabs Required
1. Wild Shape/Forms - Track alternate forms for druids
2. Familiar - Track familiar stats and abilities
3. Companions & Pets - Track animal companions
4. Followers & Retainers - Track NPCs following the character

### New Features for Existing Tabs

#### Core Tab Enhancements
- Exhaustion tracking (levels 1-6 with visual indicators)
- Personality section:
  - Trait
  - Ideal
  - Bond
  - Flaw
  - Obsession
- Connections system (relationships with NPCs/organizations)

#### Combat Tab Enhancements
- Death saves tracking (3 successes, 3 failures)
- Hit dice tracking (current/max by class)
- Sorcery points tracking (for sorcerers)

#### Spells Tab Enhancements
- Enhanced spell slot visualization
- Spell slots by level (Cantrips, 1st-9th level)
- Visual indicators for used/available slots

### Styling Requirements
- Use the same visual theme as the improved platform UI
- Match glassmorphism effects from base.css
- Consistent color palette (#0a0605 backgrounds, #f3d393 accents)
- Smooth animations and transitions

## Design

### Data Structure Changes

Add to character data model:
```javascript
{
  exhaustion: 0, // 0-6
  personality: {
    trait: '',
    ideal: '',
    bond: '',
    flaw: '',
    obsession: ''
  },
  connections: [
    { name: '', relationship: '', notes: '' }
  ],
  deathSaves: {
    successes: 0,
    failures: 0
  },
  hitDice: {
    current: 0,
    max: 0
  },
  sorceryPoints: {
    current: 0,
    max: 0
  },
  wildShapes: [
    { name: '', stats: {}, abilities: '', notes: '' }
  ],
  familiar: {
    name: '',
    type: '',
    hp: { current: 0, max: 0 },
    ac: 0,
    abilities: '',
    notes: ''
  },
  companions: [
    { name: '', type: '', hp: { current: 0, max: 0 }, ac: 0, notes: '' }
  ],
  followers: [
    { name: '', role: '', notes: '' }
  ]
}
```

### Implementation Tasks

1. Update character data model in character-data.js
2. Add new tabs to SHEET_TABS constant
3. Create render functions for new tabs
4. Add exhaustion tracking UI to Core tab
5. Add personality section to Core tab
6. Add connections system to Core tab
7. Add death saves to Combat tab
8. Add hit dice tracking to Combat tab
9. Add sorcery points to Combat tab
10. Enhance spell slots visualization
11. Style all new components to match theme
12. Update character normalization function
13. Test all new features

## Tasks

- [x] Task 1: Update character data model
- [x] Task 2: Add exhaustion tracking
- [x] Task 3: Add personality section
- [x] Task 4: Add connections system
- [x] Task 5: Add death saves tracking
- [x] Task 6: Add hit dice tracking
- [x] Task 7: Add sorcery points tracking
- [x] Task 8: Create Wild Shape tab
- [x] Task 9: Create Familiar tab
- [x] Task 10: Create Companions tab
- [x] Task 11: Create Followers tab
- [x] Task 12: Enhance spell slots UI
- [x] Task 13: Style all components

## Summary

All character sheet enhancements have been implemented:

### New Features Added
- Exhaustion tracking (0-6 levels with visual indicators)
- Personality traits (Trait, Ideal, Bond, Flaw, Obsession)
- Connections system for tracking relationships
- Death saves tracking (3 successes, 3 failures)
- Hit dice tracking
- Sorcery points tracking (for sorcerers)
- Spell slots visualization with interactive tracking
- Wild Shape tab for druid forms
- Familiar tab for magical companions
- Companions & Pets tab
- Followers & Retainers tab

### Technical Implementation
- Updated character data model with all new fields
- Added normalization for backward compatibility
- Created render functions for all new UI components
- Implemented event handlers for all interactions
- Styled components to match the improved platform theme
- All components use glassmorphism effects and consistent color palette
