# Current SQLite ERD

This ERD reflects the normalized schema currently present in `data/5e-database.sqlite`.

Notes:
- The database now contains 8 tables: `sources`, `lookups`, `entities`, `features`, `spells`, `items`, `actors`, and `links`.
- The `links` table is polymorphic. Its `left_id` and `right_id` columns intentionally do not use SQL foreign keys because they can point at multiple domain tables.
- The requested conceptual shape was kept, but some unique indexes are source-scoped in the actual SQLite schema because the SRD data contains real duplicate names across 2014 and 2024.

```mermaid
erDiagram
    SOURCES {
        uuid id PK
        varchar code UK
        varchar name
        varchar publisher
        varchar license_name
        varchar license_url
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    LOOKUPS {
        uuid id PK
        uuid source_id FK
        varchar lookup_type
        varchar code
        varchar name
        uuid parent_lookup_id FK
        int sort_order
        decimal numeric_value
        text text_value
        jsonb json_value
        text description
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    ENTITIES {
        uuid id PK
        uuid source_id FK
        varchar entity_type
        uuid parent_entity_id FK
        varchar slug
        varchar code
        varchar name
        uuid size_lookup_id FK
        uuid spellcasting_ability_lookup_id FK
        int hit_die
        int level_min
        int level_max
        jsonb primary_lookup_ids
        jsonb granted_lookup_ids
        jsonb movement_json
        jsonb prerequisite_json
        jsonb choice_rules_json
        jsonb stats_json
        jsonb tags_json
        text description
        boolean srd
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    FEATURES {
        uuid id PK
        uuid source_id FK
        varchar feature_type
        varchar slug
        varchar code
        varchar name
        int level_required
        uuid activation_lookup_id FK
        uuid rest_lookup_id FK
        boolean repeatable
        boolean requires_choice
        jsonb prerequisite_json
        jsonb choice_options_json
        jsonb uses_json
        jsonb effects_json
        jsonb tags_json
        text description
        text short_description
        boolean srd
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    SPELLS {
        uuid id PK
        uuid source_id FK
        varchar slug
        varchar code
        varchar name
        int level
        uuid school_lookup_id FK
        uuid activation_lookup_id FK
        varchar casting_time
        varchar range_text
        varchar duration_text
        uuid save_ability_lookup_id FK
        boolean ritual
        boolean concentration
        boolean verbal
        boolean somatic
        boolean material
        text material_description
        varchar attack_type
        jsonb components_json
        jsonb damage_json
        jsonb scaling_json
        jsonb tags_json
        text description
        text higher_level_text
        boolean srd
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    ITEMS {
        uuid id PK
        uuid source_id FK
        varchar slug
        varchar code
        varchar name
        uuid item_type_lookup_id FK
        uuid equipment_slot_lookup_id FK
        uuid rarity_lookup_id FK
        uuid cost_currency_lookup_id FK
        decimal weight_lb
        decimal cost_amount
        boolean is_magical
        boolean requires_attunement
        boolean stackable
        boolean consumable
        jsonb tags_json
        jsonb properties_json
        jsonb profile_json
        text description
        boolean srd
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    ACTORS {
        uuid id PK
        uuid source_id FK
        varchar slug
        varchar code
        varchar name
        varchar actor_type
        uuid parent_actor_id FK
        uuid taxonomy_lookup_id FK
        uuid size_lookup_id FK
        uuid alignment_lookup_id FK
        decimal challenge_rating
        int proficiency_bonus
        int armor_class
        int hit_points
        varchar hit_dice
        int initiative_bonus
        int passive_perception
        jsonb abilities_json
        jsonb saves_json
        jsonb skills_json
        jsonb movement_json
        jsonb senses_json
        jsonb languages_json
        jsonb immunities_json
        jsonb resistances_json
        jsonb vulnerabilities_json
        jsonb conditions_json
        jsonb traits_json
        jsonb actions_json
        jsonb spellcasting_json
        jsonb inventory_json
        text description
        boolean srd
        boolean is_homebrew
        timestamptz created_at
        timestamptz updated_at
    }

    LINKS {
        uuid id PK
        uuid source_id FK
        varchar link_type
        varchar left_table
        uuid left_id
        varchar right_table
        uuid right_id
        varchar relationship_role
        int sort_order
        int level_required
        decimal quantity
        jsonb metadata_json
        timestamptz created_at
        timestamptz updated_at
    }

    SOURCES ||--o{ LOOKUPS : source_id
    SOURCES ||--o{ ENTITIES : source_id
    SOURCES ||--o{ FEATURES : source_id
    SOURCES ||--o{ SPELLS : source_id
    SOURCES ||--o{ ITEMS : source_id
    SOURCES ||--o{ ACTORS : source_id
    SOURCES ||--o{ LINKS : source_id

    LOOKUPS ||--o{ LOOKUPS : parent_lookup_id
    ENTITIES ||--o{ ENTITIES : parent_entity_id
    ACTORS ||--o{ ACTORS : parent_actor_id

    LOOKUPS ||--o{ ENTITIES : size_lookup_id
    LOOKUPS ||--o{ ENTITIES : spellcasting_ability_lookup_id
    LOOKUPS ||--o{ FEATURES : activation_lookup_id
    LOOKUPS ||--o{ FEATURES : rest_lookup_id
    LOOKUPS ||--o{ SPELLS : school_lookup_id
    LOOKUPS ||--o{ SPELLS : activation_lookup_id
    LOOKUPS ||--o{ SPELLS : save_ability_lookup_id
    LOOKUPS ||--o{ ITEMS : item_type_lookup_id
    LOOKUPS ||--o{ ITEMS : equipment_slot_lookup_id
    LOOKUPS ||--o{ ITEMS : rarity_lookup_id
    LOOKUPS ||--o{ ITEMS : cost_currency_lookup_id
    LOOKUPS ||--o{ ACTORS : taxonomy_lookup_id
    LOOKUPS ||--o{ ACTORS : size_lookup_id
    LOOKUPS ||--o{ ACTORS : alignment_lookup_id
```
