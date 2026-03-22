# Logical ERD

The current SQLite schema is already a practical logical model. The main abstraction is the `links` table, which carries cross-table relationships between normalized records.

Common seeded relationship patterns:
- `entity_feature`: class, subclass, ancestry, and background grants
- `entity_spell`: class and subclass spell access
- `item_lookup`: item categories, properties, rarity, and damage types
- `actor_spell`: monster spellcasting
- `actor_lookup`: monster proficiencies, immunities, resistances, and vulnerabilities
- `lookup_item` and `lookup_lookup`: category membership and rule/lookup hierarchies

```mermaid
erDiagram
    SOURCES ||--o{ LOOKUPS : catalogs
    SOURCES ||--o{ ENTITIES : owns
    SOURCES ||--o{ FEATURES : owns
    SOURCES ||--o{ SPELLS : owns
    SOURCES ||--o{ ITEMS : owns
    SOURCES ||--o{ ACTORS : owns
    SOURCES ||--o{ LINKS : attributes

    LOOKUPS ||--o{ LOOKUPS : parent
    ENTITIES ||--o{ ENTITIES : parent
    ACTORS ||--o{ ACTORS : parent

    ENTITIES ||--o{ LINKS : left_or_right
    FEATURES ||--o{ LINKS : left_or_right
    SPELLS ||--o{ LINKS : left_or_right
    ITEMS ||--o{ LINKS : left_or_right
    ACTORS ||--o{ LINKS : left_or_right
    LOOKUPS ||--o{ LINKS : left_or_right
```
