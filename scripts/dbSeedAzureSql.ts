import * as sql from 'mssql';
import {
  ACTOR_COLUMNS,
  buildNormalizedSeedData,
  ENTITY_COLUMNS,
  FEATURE_COLUMNS,
  InsertRow,
  ITEM_COLUMNS,
  LINK_COLUMNS,
  LOOKUP_COLUMNS,
  SOURCE_COLUMNS,
  SPELL_COLUMNS,
} from './seedNormalizedDatabase';

const DEFAULT_AZURE_SQL_DATABASE = 'dnd5e_srd_minimal';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAzureSqlConfig(): sql.config {
  const rawServer = requireEnv('AZURE_SQL_SERVER');
  const serverWithoutProtocol = rawServer.replace(/^tcp:/i, '');
  const [serverHost, portValue] = serverWithoutProtocol.split(',');
  const port = portValue ? Number(portValue) : 1433;

  return {
    server: serverHost,
    port: Number.isNaN(port) ? 1433 : port,
    user: requireEnv('AZURE_SQL_USERNAME'),
    password: requireEnv('AZURE_SQL_PASSWORD'),
    database: process.env.AZURE_SQL_DATABASE?.trim() || DEFAULT_AZURE_SQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

const AZURE_SQL_SCHEMA_SQL = `
DROP TABLE IF EXISTS dbo.[links];
DROP TABLE IF EXISTS dbo.[actors];
DROP TABLE IF EXISTS dbo.[items];
DROP TABLE IF EXISTS dbo.[spells];
DROP TABLE IF EXISTS dbo.[features];
DROP TABLE IF EXISTS dbo.[entities];
DROP TABLE IF EXISTS dbo.[lookups];
DROP TABLE IF EXISTS dbo.[sources];

CREATE TABLE dbo.[sources] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [code] nvarchar(100) NOT NULL UNIQUE,
  [name] nvarchar(255) NOT NULL,
  [publisher] nvarchar(255) NULL,
  [license_name] nvarchar(255) NULL,
  [license_url] nvarchar(1024) NULL,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_sources_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL
);

CREATE TABLE dbo.[lookups] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [lookup_type] nvarchar(100) NOT NULL,
  [code] nvarchar(255) NOT NULL,
  [name] nvarchar(255) NOT NULL,
  [parent_lookup_id] uniqueidentifier NULL,
  [sort_order] int NULL,
  [numeric_value] decimal(12,4) NULL,
  [text_value] nvarchar(max) NULL,
  [json_value] nvarchar(max) NULL,
  [description] nvarchar(max) NULL,
  [is_active] bit NOT NULL CONSTRAINT [df_lookups_is_active] DEFAULT 1,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_lookups_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_lookups_parent] FOREIGN KEY ([parent_lookup_id]) REFERENCES dbo.[lookups]([id])
);

CREATE TABLE dbo.[entities] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [entity_type] nvarchar(100) NOT NULL,
  [parent_entity_id] uniqueidentifier NULL,
  [slug] nvarchar(255) NULL,
  [code] nvarchar(255) NULL,
  [name] nvarchar(255) NOT NULL,
  [size_lookup_id] uniqueidentifier NULL,
  [spellcasting_ability_lookup_id] uniqueidentifier NULL,
  [hit_die] int NULL,
  [level_min] int NULL,
  [level_max] int NULL,
  [primary_lookup_ids] nvarchar(max) NULL,
  [granted_lookup_ids] nvarchar(max) NULL,
  [movement_json] nvarchar(max) NULL,
  [prerequisite_json] nvarchar(max) NULL,
  [choice_rules_json] nvarchar(max) NULL,
  [stats_json] nvarchar(max) NULL,
  [tags_json] nvarchar(max) NULL,
  [description] nvarchar(max) NULL,
  [srd] bit NOT NULL CONSTRAINT [df_entities_srd] DEFAULT 1,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_entities_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_entities_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_entities_parent] FOREIGN KEY ([parent_entity_id]) REFERENCES dbo.[entities]([id]),
  CONSTRAINT [fk_entities_size_lookup] FOREIGN KEY ([size_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_entities_spellcasting_lookup] FOREIGN KEY ([spellcasting_ability_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [uq_entities_slug] UNIQUE ([slug])
);

CREATE TABLE dbo.[features] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [feature_type] nvarchar(100) NOT NULL,
  [slug] nvarchar(255) NULL,
  [code] nvarchar(255) NULL,
  [name] nvarchar(255) NOT NULL,
  [level_required] int NULL,
  [activation_lookup_id] uniqueidentifier NULL,
  [rest_lookup_id] uniqueidentifier NULL,
  [repeatable] bit NOT NULL CONSTRAINT [df_features_repeatable] DEFAULT 0,
  [requires_choice] bit NOT NULL CONSTRAINT [df_features_requires_choice] DEFAULT 0,
  [prerequisite_json] nvarchar(max) NULL,
  [choice_options_json] nvarchar(max) NULL,
  [uses_json] nvarchar(max) NULL,
  [effects_json] nvarchar(max) NULL,
  [tags_json] nvarchar(max) NULL,
  [description] nvarchar(max) NOT NULL,
  [short_description] nvarchar(max) NULL,
  [srd] bit NOT NULL CONSTRAINT [df_features_srd] DEFAULT 1,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_features_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_features_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_features_activation_lookup] FOREIGN KEY ([activation_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_features_rest_lookup] FOREIGN KEY ([rest_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [uq_features_slug] UNIQUE ([slug])
);

CREATE TABLE dbo.[spells] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [slug] nvarchar(255) NULL,
  [code] nvarchar(255) NULL,
  [name] nvarchar(255) NOT NULL,
  [level] int NOT NULL,
  [school_lookup_id] uniqueidentifier NOT NULL,
  [activation_lookup_id] uniqueidentifier NULL,
  [casting_time] nvarchar(255) NOT NULL,
  [range_text] nvarchar(255) NOT NULL,
  [duration_text] nvarchar(255) NOT NULL,
  [save_ability_lookup_id] uniqueidentifier NULL,
  [ritual] bit NOT NULL CONSTRAINT [df_spells_ritual] DEFAULT 0,
  [concentration] bit NOT NULL CONSTRAINT [df_spells_concentration] DEFAULT 0,
  [verbal] bit NOT NULL CONSTRAINT [df_spells_verbal] DEFAULT 0,
  [somatic] bit NOT NULL CONSTRAINT [df_spells_somatic] DEFAULT 0,
  [material] bit NOT NULL CONSTRAINT [df_spells_material] DEFAULT 0,
  [material_description] nvarchar(max) NULL,
  [attack_type] nvarchar(100) NULL,
  [components_json] nvarchar(max) NULL,
  [damage_json] nvarchar(max) NULL,
  [scaling_json] nvarchar(max) NULL,
  [tags_json] nvarchar(max) NULL,
  [description] nvarchar(max) NOT NULL,
  [higher_level_text] nvarchar(max) NULL,
  [srd] bit NOT NULL CONSTRAINT [df_spells_srd] DEFAULT 1,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_spells_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_spells_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_spells_school_lookup] FOREIGN KEY ([school_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_spells_activation_lookup] FOREIGN KEY ([activation_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_spells_save_lookup] FOREIGN KEY ([save_ability_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [uq_spells_slug] UNIQUE ([slug])
);

CREATE TABLE dbo.[items] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [slug] nvarchar(255) NULL,
  [code] nvarchar(255) NULL,
  [name] nvarchar(255) NOT NULL,
  [item_type_lookup_id] uniqueidentifier NOT NULL,
  [equipment_slot_lookup_id] uniqueidentifier NULL,
  [rarity_lookup_id] uniqueidentifier NULL,
  [cost_currency_lookup_id] uniqueidentifier NULL,
  [weight_lb] decimal(10,2) NULL,
  [cost_amount] decimal(12,2) NULL,
  [is_magical] bit NOT NULL CONSTRAINT [df_items_is_magical] DEFAULT 0,
  [requires_attunement] bit NOT NULL CONSTRAINT [df_items_requires_attunement] DEFAULT 0,
  [stackable] bit NOT NULL CONSTRAINT [df_items_stackable] DEFAULT 1,
  [consumable] bit NOT NULL CONSTRAINT [df_items_consumable] DEFAULT 0,
  [tags_json] nvarchar(max) NULL,
  [properties_json] nvarchar(max) NULL,
  [profile_json] nvarchar(max) NULL,
  [description] nvarchar(max) NULL,
  [srd] bit NOT NULL CONSTRAINT [df_items_srd] DEFAULT 1,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_items_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_items_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_items_type_lookup] FOREIGN KEY ([item_type_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_items_slot_lookup] FOREIGN KEY ([equipment_slot_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_items_rarity_lookup] FOREIGN KEY ([rarity_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_items_currency_lookup] FOREIGN KEY ([cost_currency_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [uq_items_slug] UNIQUE ([slug])
);

CREATE TABLE dbo.[actors] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [slug] nvarchar(255) NULL,
  [code] nvarchar(255) NULL,
  [name] nvarchar(255) NOT NULL,
  [actor_type] nvarchar(100) NOT NULL,
  [parent_actor_id] uniqueidentifier NULL,
  [taxonomy_lookup_id] uniqueidentifier NULL,
  [size_lookup_id] uniqueidentifier NULL,
  [alignment_lookup_id] uniqueidentifier NULL,
  [challenge_rating] decimal(6,3) NULL,
  [proficiency_bonus] int NULL,
  [armor_class] int NULL,
  [hit_points] int NULL,
  [hit_dice] nvarchar(100) NULL,
  [initiative_bonus] int NULL,
  [passive_perception] int NULL,
  [abilities_json] nvarchar(max) NULL,
  [saves_json] nvarchar(max) NULL,
  [skills_json] nvarchar(max) NULL,
  [movement_json] nvarchar(max) NULL,
  [senses_json] nvarchar(max) NULL,
  [languages_json] nvarchar(max) NULL,
  [immunities_json] nvarchar(max) NULL,
  [resistances_json] nvarchar(max) NULL,
  [vulnerabilities_json] nvarchar(max) NULL,
  [conditions_json] nvarchar(max) NULL,
  [traits_json] nvarchar(max) NULL,
  [actions_json] nvarchar(max) NULL,
  [spellcasting_json] nvarchar(max) NULL,
  [inventory_json] nvarchar(max) NULL,
  [description] nvarchar(max) NULL,
  [srd] bit NOT NULL CONSTRAINT [df_actors_srd] DEFAULT 1,
  [is_homebrew] bit NOT NULL CONSTRAINT [df_actors_is_homebrew] DEFAULT 0,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_actors_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id]),
  CONSTRAINT [fk_actors_parent] FOREIGN KEY ([parent_actor_id]) REFERENCES dbo.[actors]([id]),
  CONSTRAINT [fk_actors_taxonomy_lookup] FOREIGN KEY ([taxonomy_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_actors_size_lookup] FOREIGN KEY ([size_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [fk_actors_alignment_lookup] FOREIGN KEY ([alignment_lookup_id]) REFERENCES dbo.[lookups]([id]),
  CONSTRAINT [uq_actors_slug] UNIQUE ([slug])
);

CREATE TABLE dbo.[links] (
  [id] uniqueidentifier NOT NULL PRIMARY KEY,
  [source_id] uniqueidentifier NOT NULL,
  [link_type] nvarchar(100) NOT NULL,
  [left_table] nvarchar(50) NOT NULL,
  [left_id] uniqueidentifier NOT NULL,
  [right_table] nvarchar(50) NOT NULL,
  [right_id] uniqueidentifier NOT NULL,
  [relationship_role] nvarchar(100) NULL,
  [sort_order] int NULL,
  [level_required] int NULL,
  [quantity] decimal(12,2) NULL,
  [metadata_json] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL,
  [updated_at] datetimeoffset(7) NOT NULL,
  CONSTRAINT [fk_links_source] FOREIGN KEY ([source_id]) REFERENCES dbo.[sources]([id])
);

CREATE UNIQUE INDEX [idx_lookups_lookup_type_code_unique] ON dbo.[lookups] ([lookup_type], [code]);
CREATE INDEX [idx_lookups_lookup_type_name] ON dbo.[lookups] ([lookup_type], [name]);
CREATE INDEX [idx_lookups_parent_lookup_id] ON dbo.[lookups] ([parent_lookup_id]);

CREATE UNIQUE INDEX [idx_entities_source_type_code_unique] ON dbo.[entities] ([source_id], [entity_type], [code]);
CREATE INDEX [idx_entities_type_name] ON dbo.[entities] ([entity_type], [name]);
CREATE INDEX [idx_entities_source_id] ON dbo.[entities] ([source_id]);
CREATE INDEX [idx_entities_parent_entity_id] ON dbo.[entities] ([parent_entity_id]);

CREATE UNIQUE INDEX [idx_features_source_type_code_unique] ON dbo.[features] ([source_id], [feature_type], [code]);
CREATE INDEX [idx_features_type_name] ON dbo.[features] ([feature_type], [name]);
CREATE INDEX [idx_features_source_id] ON dbo.[features] ([source_id]);

CREATE UNIQUE INDEX [idx_spells_source_code_unique] ON dbo.[spells] ([source_id], [code]);
CREATE INDEX [idx_spells_name] ON dbo.[spells] ([name]);
CREATE INDEX [idx_spells_level_school_lookup_id] ON dbo.[spells] ([level], [school_lookup_id]);
CREATE INDEX [idx_spells_source_id] ON dbo.[spells] ([source_id]);

CREATE UNIQUE INDEX [idx_items_source_code_unique] ON dbo.[items] ([source_id], [code]);
CREATE INDEX [idx_items_name] ON dbo.[items] ([name]);
CREATE INDEX [idx_items_item_type_lookup_id] ON dbo.[items] ([item_type_lookup_id]);
CREATE INDEX [idx_items_source_id] ON dbo.[items] ([source_id]);

CREATE UNIQUE INDEX [idx_actors_source_code_unique] ON dbo.[actors] ([source_id], [code]);
CREATE INDEX [idx_actors_name] ON dbo.[actors] ([name]);
CREATE INDEX [idx_actors_actor_type] ON dbo.[actors] ([actor_type]);
CREATE INDEX [idx_actors_taxonomy_lookup_id] ON dbo.[actors] ([taxonomy_lookup_id]);
CREATE INDEX [idx_actors_source_id] ON dbo.[actors] ([source_id]);

CREATE INDEX [idx_links_link_type_left] ON dbo.[links] ([link_type], [left_table], [left_id]);
CREATE INDEX [idx_links_link_type_right] ON dbo.[links] ([link_type], [right_table], [right_id]);
CREATE UNIQUE INDEX [idx_links_pair_role_unique]
  ON dbo.[links] ([left_table], [left_id], [right_table], [right_id], [relationship_role], [link_type]);
`;

function normalizeSqlValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  return String(value);
}

function bindInput(request: sql.Request, name: string, value: unknown): void {
  const normalized = normalizeSqlValue(value);
  if (normalized === null) {
    request.input(name, null);
    return;
  }

  if (typeof normalized === 'boolean') {
    request.input(name, sql.Bit, normalized);
    return;
  }

  if (typeof normalized === 'number') {
    if (Number.isInteger(normalized)) {
      request.input(name, sql.Int, normalized);
      return;
    }
    request.input(name, sql.Decimal(18, 4), normalized);
    return;
  }

  request.input(name, sql.NVarChar(sql.MAX), normalized);
}

async function insertRows(
  pool: sql.ConnectionPool,
  tableName: string,
  columns: string[],
  rows: InsertRow[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const quotedColumns = columns.map((column) => `[${column}]`).join(', ');
  const placeholders = columns.map((_, index) => `@p${index}`).join(', ');
  const query = `INSERT INTO dbo.[${tableName}] (${quotedColumns}) VALUES (${placeholders})`;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const row of rows) {
      const request = new sql.Request(transaction);
      columns.forEach((column, index) => {
        bindInput(request, `p${index}`, column in row ? row[column] : null);
      });
      await request.query(query);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function main() {
  const config = getAzureSqlConfig();
  const data = buildNormalizedSeedData();
  const pool = new sql.ConnectionPool(config);

  try {
    await pool.connect();
    console.log(`Connected to Azure SQL database ${config.database} on ${config.server}`);

    await pool.request().batch(AZURE_SQL_SCHEMA_SQL);

    await insertRows(pool, 'sources', SOURCE_COLUMNS, data.sources);
    await insertRows(pool, 'lookups', LOOKUP_COLUMNS, data.lookups);
    await insertRows(pool, 'entities', ENTITY_COLUMNS, data.entities);
    await insertRows(pool, 'features', FEATURE_COLUMNS, data.features);
    await insertRows(pool, 'spells', SPELL_COLUMNS, data.spells);
    await insertRows(pool, 'items', ITEM_COLUMNS, data.items);
    await insertRows(pool, 'actors', ACTOR_COLUMNS, data.actors);
    await insertRows(pool, 'links', LINK_COLUMNS, data.links);

    console.log(
      `Seeded Azure SQL database: ` +
        `${data.sources.length} sources, ` +
        `${data.lookups.length} lookups, ` +
        `${data.entities.length} entities, ` +
        `${data.features.length} features, ` +
        `${data.spells.length} spells, ` +
        `${data.items.length} items, ` +
        `${data.actors.length} actors, ` +
        `${data.links.length} links.`
    );
  } catch (error) {
    console.error('Azure SQL seed failed:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
