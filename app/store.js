const sql = require('mssql');
const {
  DATABASE_PROVIDERS,
  getAzurePool,
  getMongoDb,
  getProvider,
  withSqlite,
} = require('./database');

const ROLES = ['admin', 'gm', 'player'];
const COMPENDIUM_TYPES = ['spells', 'items', 'features'];
const EDITION_CODES = ['2014', '2024', 'system'];
const DEFAULT_DICE_MODEL_TIMESTAMP = '2026-03-22T00:00:00.000Z';
const DEFAULT_DICE_MODELS = [
  {
    id: 'dice-model-default',
    key: 'default',
    name: 'Default Dice Box',
    description: 'The bundled Dice Box theme served with the app.',
    asset_path: '/assets/',
    theme: 'default',
    theme_color: null,
    external_theme_url: null,
    config_json: JSON.stringify({
      scale: 5.5,
      gravity: 1.1,
      throwForce: 6.2,
      spinForce: 7.4,
      startingHeight: 10,
      settleTimeout: 4200,
    }),
    is_default: 1,
    sort_order: 0,
    is_enabled: 1,
    created_at: DEFAULT_DICE_MODEL_TIMESTAMP,
    updated_at: DEFAULT_DICE_MODEL_TIMESTAMP,
  },
];

const SQLITE_APP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  edition TEXT NOT NULL,
  ancestry_slug TEXT,
  class_slug TEXT,
  background_slug TEXT,
  level INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_characters_owner_user_id ON characters (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters (updated_at);

CREATE TABLE IF NOT EXISTS dice_models (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  asset_path TEXT NOT NULL,
  theme TEXT NOT NULL,
  theme_color TEXT,
  external_theme_url TEXT,
  config_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dice_models_enabled_sort ON dice_models (is_enabled, sort_order, name);
`;

const AZURE_SQL_APP_SCHEMA_SQL = `
IF OBJECT_ID('dbo.[users]', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[users] (
    [id] nvarchar(64) NOT NULL PRIMARY KEY,
    [email] nvarchar(255) NOT NULL,
    [display_name] nvarchar(255) NOT NULL,
    [password_hash] nvarchar(255) NOT NULL,
    [password_salt] nvarchar(255) NOT NULL,
    [role] nvarchar(32) NOT NULL,
    [created_at] datetimeoffset(7) NOT NULL,
    [updated_at] datetimeoffset(7) NOT NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_users_email' AND object_id = OBJECT_ID('dbo.[users]'))
BEGIN
  CREATE UNIQUE INDEX [ux_users_email] ON dbo.[users] ([email]);
END;

IF OBJECT_ID('dbo.[sessions]', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[sessions] (
    [id] nvarchar(64) NOT NULL PRIMARY KEY,
    [user_id] nvarchar(64) NOT NULL,
    [expires_at] datetimeoffset(7) NOT NULL,
    [created_at] datetimeoffset(7) NOT NULL,
    [last_seen_at] datetimeoffset(7) NOT NULL,
    [user_agent] nvarchar(512) NULL,
    CONSTRAINT [fk_sessions_user] FOREIGN KEY ([user_id]) REFERENCES dbo.[users]([id]) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sessions_user_id' AND object_id = OBJECT_ID('dbo.[sessions]'))
BEGIN
  CREATE INDEX [idx_sessions_user_id] ON dbo.[sessions] ([user_id]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sessions_expires_at' AND object_id = OBJECT_ID('dbo.[sessions]'))
BEGIN
  CREATE INDEX [idx_sessions_expires_at] ON dbo.[sessions] ([expires_at]);
END;

IF OBJECT_ID('dbo.[characters]', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[characters] (
    [id] nvarchar(64) NOT NULL PRIMARY KEY,
    [owner_user_id] nvarchar(64) NOT NULL,
    [name] nvarchar(255) NOT NULL,
    [edition] nvarchar(32) NOT NULL,
    [ancestry_slug] nvarchar(255) NULL,
    [class_slug] nvarchar(255) NULL,
    [background_slug] nvarchar(255) NULL,
    [level] int NOT NULL,
    [data_json] nvarchar(max) NOT NULL,
    [created_at] datetimeoffset(7) NOT NULL,
    [updated_at] datetimeoffset(7) NOT NULL,
    CONSTRAINT [fk_characters_owner] FOREIGN KEY ([owner_user_id]) REFERENCES dbo.[users]([id]) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_characters_owner_user_id' AND object_id = OBJECT_ID('dbo.[characters]'))
BEGIN
  CREATE INDEX [idx_characters_owner_user_id] ON dbo.[characters] ([owner_user_id]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_characters_updated_at' AND object_id = OBJECT_ID('dbo.[characters]'))
BEGIN
  CREATE INDEX [idx_characters_updated_at] ON dbo.[characters] ([updated_at]);
END;

IF OBJECT_ID('dbo.[dice_models]', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[dice_models] (
    [id] nvarchar(64) NOT NULL PRIMARY KEY,
    [key] nvarchar(64) NOT NULL,
    [name] nvarchar(255) NOT NULL,
    [description] nvarchar(1000) NULL,
    [asset_path] nvarchar(512) NOT NULL,
    [theme] nvarchar(128) NOT NULL,
    [theme_color] nvarchar(32) NULL,
    [external_theme_url] nvarchar(1024) NULL,
    [config_json] nvarchar(max) NOT NULL,
    [is_default] bit NOT NULL CONSTRAINT [df_dice_models_is_default] DEFAULT 0,
    [sort_order] int NOT NULL CONSTRAINT [df_dice_models_sort_order] DEFAULT 0,
    [is_enabled] bit NOT NULL CONSTRAINT [df_dice_models_is_enabled] DEFAULT 1,
    [created_at] datetimeoffset(7) NOT NULL,
    [updated_at] datetimeoffset(7) NOT NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_dice_models_key' AND object_id = OBJECT_ID('dbo.[dice_models]'))
BEGIN
  CREATE UNIQUE INDEX [ux_dice_models_key] ON dbo.[dice_models] ([key]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_dice_models_enabled_sort' AND object_id = OBJECT_ID('dbo.[dice_models]'))
BEGIN
  CREATE INDEX [idx_dice_models_enabled_sort] ON dbo.[dice_models] ([is_enabled], [sort_order], [name]);
END;
`;

const ensuredProviders = new Map();

function normalizeEdition(edition) {
  const value = String(edition || 'all').trim();
  return EDITION_CODES.includes(value) ? value : 'all';
}

function isGlobalCharacterAccess(role) {
  return role === 'admin' || role === 'gm';
}

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function sanitizeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.displayName,
    role: row.role,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

function mapCharacter(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id || row.ownerUserId,
    ownerDisplayName: row.owner_display_name || row.ownerDisplayName || null,
    name: row.name,
    edition: row.edition,
    ancestrySlug: row.ancestry_slug || row.ancestrySlug || '',
    classSlug: row.class_slug || row.classSlug || '',
    backgroundSlug: row.background_slug || row.backgroundSlug || '',
    level: Number(row.level || 1),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    data: typeof row.data_json === 'string' ? parseJson(row.data_json, {}) : row.data_json || row.data || {},
  };
}

function mapSource(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
  };
}

function mapDiceModel(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    assetPath: row.asset_path || row.assetPath || '/assets/',
    theme: row.theme || 'default',
    themeColor: row.theme_color || row.themeColor || null,
    externalThemeUrl: row.external_theme_url || row.externalThemeUrl || null,
    config: typeof row.config_json === 'string' ? parseJson(row.config_json, {}) : row.config_json || row.config || {},
    isDefault: toBoolean(row.is_default ?? row.isDefault),
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    isEnabled: toBoolean(row.is_enabled ?? row.isEnabled ?? true),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function mapEntity(row) {
  return {
    slug: row.slug,
    code: row.code,
    name: row.name,
    description: row.description || '',
    hitDie: row.hit_die != null ? Number(row.hit_die) : null,
    sourceCode: row.source_code || row.sourceCode || null,
    sourceName: row.source_name || row.sourceName || null,
    tags: typeof row.tags_json === 'string' ? parseJson(row.tags_json, {}) : row.tags_json || row.tags || {},
  };
}

function mapCondition(row) {
  return {
    code: row.code,
    name: row.name,
    description: row.description || '',
    sourceCode: row.source_code || row.sourceCode || null,
    sourceName: row.source_name || row.sourceName || null,
  };
}

function mapSearchResult(type, row) {
  return {
    type,
    slug: row.slug,
    code: row.code,
    name: row.name,
    description: row.short_description || row.description || row.higher_level_text || '',
    level: row.level != null ? Number(row.level) : null,
    featureType: row.feature_type || row.featureType || null,
    sourceCode: row.source_code || row.sourceCode || null,
    sourceName: row.source_name || row.sourceName || null,
  };
}

function compareTextValues(left, right) {
  return String(left || '').localeCompare(String(right || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortRowsByText(rows, key) {
  return [...rows].sort((left, right) => compareTextValues(left?.[key], right?.[key]));
}

function sortDiceModels(rows) {
  return [...rows].sort((left, right) => {
    const orderDelta = Number(left?.sort_order ?? left?.sortOrder ?? 0) - Number(right?.sort_order ?? right?.sortOrder ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    if (toBoolean(left?.is_default ?? left?.isDefault) !== toBoolean(right?.is_default ?? right?.isDefault)) {
      return toBoolean(left?.is_default ?? left?.isDefault) ? -1 : 1;
    }

    return compareTextValues(left?.name, right?.name);
  });
}

function sortRowsByDate(rows, key, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = Date.parse(left?.[key] || 0);
    const rightValue = Date.parse(right?.[key] || 0);
    return (leftValue - rightValue) * multiplier;
  });
}

async function ensureDefaultDiceModels() {
  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      for (const model of DEFAULT_DICE_MODELS) {
        const request = pool.request();
        request.input('id', sql.NVarChar(64), model.id);
        request.input('key', sql.NVarChar(64), model.key);
        request.input('name', sql.NVarChar(255), model.name);
        request.input('description', sql.NVarChar(1000), model.description);
        request.input('asset_path', sql.NVarChar(512), model.asset_path);
        request.input('theme', sql.NVarChar(128), model.theme);
        request.input('theme_color', sql.NVarChar(32), model.theme_color);
        request.input('external_theme_url', sql.NVarChar(1024), model.external_theme_url);
        request.input('config_json', sql.NVarChar(sql.MAX), model.config_json);
        request.input('is_default', sql.Bit, model.is_default);
        request.input('sort_order', sql.Int, model.sort_order);
        request.input('is_enabled', sql.Bit, model.is_enabled);
        request.input('created_at', sql.DateTimeOffset, model.created_at);
        request.input('updated_at', sql.DateTimeOffset, model.updated_at);
        await request.query(
          `IF NOT EXISTS (SELECT 1 FROM dbo.[dice_models] WHERE [key] = @key)
           BEGIN
             INSERT INTO dbo.[dice_models] ([id], [key], [name], [description], [asset_path], [theme], [theme_color], [external_theme_url], [config_json], [is_default], [sort_order], [is_enabled], [created_at], [updated_at])
             VALUES (@id, @key, @name, @description, @asset_path, @theme, @theme_color, @external_theme_url, @config_json, @is_default, @sort_order, @is_enabled, @created_at, @updated_at)
           END`
        );
      }
      break;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('dice_models').createIndex({ key: 1 }, { unique: true });
      await db.collection('dice_models').createIndex({ is_enabled: 1, sort_order: 1, name: 1 });
      for (const model of DEFAULT_DICE_MODELS) {
        await db.collection('dice_models').updateOne(
          { key: model.key },
          {
            $setOnInsert: {
              _id: model.id,
              ...model,
            },
          },
          { upsert: true }
        );
      }
      break;
    }
    default:
      withSqlite((db) => {
        const statement = db.prepare(
          `INSERT OR IGNORE INTO dice_models (id, key, name, description, asset_path, theme, theme_color, external_theme_url, config_json, is_default, sort_order, is_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const model of DEFAULT_DICE_MODELS) {
          statement.run(
            model.id,
            model.key,
            model.name,
            model.description,
            model.asset_path,
            model.theme,
            model.theme_color,
            model.external_theme_url,
            model.config_json,
            model.is_default,
            model.sort_order,
            model.is_enabled,
            model.created_at,
            model.updated_at
          );
        }
      });
  }
}

async function ensureAppStorage() {
  const provider = getProvider();

  if (!ensuredProviders.has(provider)) {
    ensuredProviders.set(
      provider,
      (async () => {
        switch (provider) {
          case DATABASE_PROVIDERS.AZURE_SQL: {
            const pool = await getAzurePool();
            await pool.request().batch(AZURE_SQL_APP_SCHEMA_SQL);
            break;
          }
          case DATABASE_PROVIDERS.MONGODB: {
            const db = await getMongoDb();
            await db.collection('users').createIndex({ email: 1 }, { unique: true });
            await db.collection('sessions').createIndex({ user_id: 1 });
            await db.collection('sessions').createIndex({ expires_at: 1 });
            await db.collection('characters').createIndex({ owner_user_id: 1 });
            await db.collection('characters').createIndex({ updated_at: -1 });
            break;
          }
          default:
            withSqlite((db) => {
              db.exec(SQLITE_APP_SCHEMA_SQL);
            });
        }

        await ensureDefaultDiceModels();
      })().catch((error) => {
        ensuredProviders.delete(provider);
        throw error;
      })
    );
  }

  return ensuredProviders.get(provider);
}

async function listSources() {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const result = await pool.request().query(
        'SELECT [id], [code], [name] FROM dbo.[sources] ORDER BY [code]'
      );
      return result.recordset.map(mapSource);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const rows = await db
        .collection('sources')
        .find({}, { projection: { _id: 0, id: 1, code: 1, name: 1 } })
        .toArray();
      return sortRowsByText(rows, 'code').map(mapSource);
    }
    default:
      return withSqlite((db) =>
        db.prepare('SELECT id, code, name FROM sources ORDER BY code').all().map(mapSource)
      );
  }
}

async function listDiceModels() {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const result = await pool.request().query(
        `SELECT [id], [key], [name], [description], [asset_path], [theme], [theme_color], [external_theme_url], [config_json], [is_default], [sort_order], [is_enabled], [created_at], [updated_at]
         FROM dbo.[dice_models]
         WHERE [is_enabled] = 1
         ORDER BY [sort_order], [name]`
      );
      return sortDiceModels(result.recordset).map(mapDiceModel);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const rows = await db
        .collection('dice_models')
        .find(
          { is_enabled: { $ne: false } },
          {
            projection: {
              _id: 0,
              id: 1,
              key: 1,
              name: 1,
              description: 1,
              asset_path: 1,
              theme: 1,
              theme_color: 1,
              external_theme_url: 1,
              config_json: 1,
              is_default: 1,
              sort_order: 1,
              is_enabled: 1,
              created_at: 1,
              updated_at: 1,
            },
          }
        )
        .toArray();
      return sortDiceModels(rows).map(mapDiceModel);
    }
    default:
      return withSqlite((db) =>
        sortDiceModels(
          db
            .prepare(
              `SELECT id, key, name, description, asset_path, theme, theme_color, external_theme_url, config_json, is_default, sort_order, is_enabled, created_at, updated_at
               FROM dice_models
               WHERE is_enabled = 1
               ORDER BY sort_order, name`
            )
            .all()
        ).map(mapDiceModel)
      );
  }
}

async function getBootstrapData(edition) {
  await ensureAppStorage();
  const normalizedEdition = normalizeEdition(edition);

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const sources = (
        await pool.request().query('SELECT [id], [code], [name] FROM dbo.[sources] ORDER BY [code]')
      ).recordset.map(mapSource);
      const sourceCondition = normalizedEdition === 'all' ? '' : ' AND s.[code] = @edition';

      const buildEntityList = async (entityType) => {
        const request = pool.request();
        if (normalizedEdition !== 'all') {
          request.input('edition', sql.NVarChar(16), normalizedEdition);
        }

        const result = await request.query(
          `SELECT e.[slug], e.[code], e.[name], e.[description], e.[hit_die], e.[tags_json], s.[code] AS source_code, s.[name] AS source_name
           FROM dbo.[entities] e
           INNER JOIN dbo.[sources] s ON s.[id] = e.[source_id]
           WHERE e.[entity_type] = '${entityType}'${sourceCondition}
           ORDER BY e.[name]`
        );
        return result.recordset.map(mapEntity);
      };

      const conditionRequest = pool.request();
      if (normalizedEdition !== 'all') {
        conditionRequest.input('edition', sql.NVarChar(16), normalizedEdition);
      }

      const conditions = (
        await conditionRequest.query(
          `SELECT l.[code], l.[name], l.[description], s.[code] AS source_code, s.[name] AS source_name
           FROM dbo.[lookups] l
           INNER JOIN dbo.[sources] s ON s.[id] = l.[source_id]
           WHERE l.[lookup_type] = 'condition'${sourceCondition}
           ORDER BY l.[name]`
        )
      ).recordset.map(mapCondition);

      return {
        sources,
        classes: await buildEntityList('class'),
        backgrounds: await buildEntityList('background'),
        ancestries: await buildEntityList('ancestry'),
        conditions,
      };
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const sourceRows = await db
        .collection('sources')
        .find({}, { projection: { _id: 0, id: 1, code: 1, name: 1 } })
        .toArray();
      const sources = sortRowsByText(sourceRows, 'code');
      const sourceMap = new Map(sources.map((source) => [source.id, source]));
      const sourceId =
        normalizedEdition === 'all'
          ? null
          : sources.find((source) => source.code === normalizedEdition)?.id || null;
      const entityFilter = sourceId ? { source_id: sourceId } : {};
      const conditionFilter = sourceId ? { source_id: sourceId } : {};

      const [classes, backgrounds, ancestries, conditions] = await Promise.all([
        db.collection('entities').find({ ...entityFilter, entity_type: 'class' }).toArray(),
        db.collection('entities').find({ ...entityFilter, entity_type: 'background' }).toArray(),
        db.collection('entities').find({ ...entityFilter, entity_type: 'ancestry' }).toArray(),
        db.collection('lookups').find({ ...conditionFilter, lookup_type: 'condition' }).toArray(),
      ]);

      return {
        sources: sources.map(mapSource),
        classes: sortRowsByText(classes, 'name').map((row) =>
          mapEntity({
            ...row,
            sourceCode: sourceMap.get(row.source_id)?.code,
            sourceName: sourceMap.get(row.source_id)?.name,
          })
        ),
        backgrounds: sortRowsByText(backgrounds, 'name').map((row) =>
          mapEntity({
            ...row,
            sourceCode: sourceMap.get(row.source_id)?.code,
            sourceName: sourceMap.get(row.source_id)?.name,
          })
        ),
        ancestries: sortRowsByText(ancestries, 'name').map((row) =>
          mapEntity({
            ...row,
            sourceCode: sourceMap.get(row.source_id)?.code,
            sourceName: sourceMap.get(row.source_id)?.name,
          })
        ),
        conditions: sortRowsByText(conditions, 'name').map((row) =>
          mapCondition({
            ...row,
            sourceCode: sourceMap.get(row.source_id)?.code,
            sourceName: sourceMap.get(row.source_id)?.name,
          })
        ),
      };
    }
    default: {
      const sourceCondition = normalizedEdition === 'all' ? '' : ' AND s.code = ?';
      const editionParams = normalizedEdition === 'all' ? [] : [normalizedEdition];
      const buildEntityList = (entityType) =>
        withSqlite((db) =>
          db
            .prepare(
              `SELECT e.slug, e.code, e.name, e.description, e.hit_die, e.tags_json, s.code AS source_code, s.name AS source_name
               FROM entities e
               INNER JOIN sources s ON s.id = e.source_id
               WHERE e.entity_type = '${entityType}'${sourceCondition}
               ORDER BY e.name`
            )
            .all(...editionParams)
            .map(mapEntity)
        );

      return {
        sources: withSqlite((db) =>
          db.prepare('SELECT id, code, name FROM sources ORDER BY code').all().map(mapSource)
        ),
        classes: buildEntityList('class'),
        backgrounds: buildEntityList('background'),
        ancestries: buildEntityList('ancestry'),
        conditions: withSqlite((db) =>
          db
            .prepare(
              `SELECT l.code, l.name, l.description, s.code AS source_code, s.name AS source_name
               FROM lookups l
               INNER JOIN sources s ON s.id = l.source_id
               WHERE l.lookup_type = 'condition'${sourceCondition}
               ORDER BY l.name`
            )
            .all(...editionParams)
            .map(mapCondition)
        ),
      };
    }
  }
}

async function searchCompendium({ type, query = '', edition = 'all', limit = 20 }) {
  await ensureAppStorage();

  if (!COMPENDIUM_TYPES.includes(type)) {
    throw new Error(`Unsupported compendium type "${type}".`);
  }

  const normalizedEdition = normalizeEdition(edition);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const trimmedQuery = String(query || '').trim();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      const sourceCondition = normalizedEdition === 'all' ? '' : ' AND s.[code] = @edition';
      if (normalizedEdition !== 'all') {
        request.input('edition', sql.NVarChar(16), normalizedEdition);
      }
      if (trimmedQuery !== '') {
        request.input('query', sql.NVarChar(255), `%${trimmedQuery}%`);
      }
      request.input('limit', sql.Int, safeLimit);

      if (type === 'spells') {
        const result = await request.query(
          `SELECT TOP (@limit) sp.[slug], sp.[code], sp.[name], sp.[description], sp.[higher_level_text], sp.[level], s.[code] AS source_code, s.[name] AS source_name
           FROM dbo.[spells] sp
           INNER JOIN dbo.[sources] s ON s.[id] = sp.[source_id]
           WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (sp.[name] LIKE @query OR sp.[description] LIKE @query OR sp.[higher_level_text] LIKE @query)'}
           ORDER BY sp.[name]`
        );
        return result.recordset.map((row) => mapSearchResult(type, row));
      }

      if (type === 'items') {
        const result = await request.query(
          `SELECT TOP (@limit) i.[slug], i.[code], i.[name], i.[description], s.[code] AS source_code, s.[name] AS source_name
           FROM dbo.[items] i
           INNER JOIN dbo.[sources] s ON s.[id] = i.[source_id]
           WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (i.[name] LIKE @query OR i.[description] LIKE @query)'}
           ORDER BY i.[name]`
        );
        return result.recordset.map((row) => mapSearchResult(type, row));
      }

      const result = await request.query(
        `SELECT TOP (@limit) f.[slug], f.[code], f.[name], f.[description], f.[short_description], f.[feature_type], s.[code] AS source_code, s.[name] AS source_name
         FROM dbo.[features] f
         INNER JOIN dbo.[sources] s ON s.[id] = f.[source_id]
         WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (f.[name] LIKE @query OR f.[description] LIKE @query OR f.[short_description] LIKE @query)'}
         ORDER BY f.[name]`
      );
      return result.recordset.map((row) => mapSearchResult(type, row));
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const sourceRows = await db
        .collection('sources')
        .find({}, { projection: { _id: 0, id: 1, code: 1, name: 1 } })
        .toArray();
      const sources = sortRowsByText(sourceRows, 'code');
      const sourceMap = new Map(sources.map((source) => [source.id, source]));
      const sourceId =
        normalizedEdition === 'all'
          ? null
          : sources.find((source) => source.code === normalizedEdition)?.id || null;
      const filter = sourceId ? { source_id: sourceId } : {};
      if (trimmedQuery !== '') {
        filter.$or = [
          { name: { $regex: trimmedQuery, $options: 'i' } },
          { description: { $regex: trimmedQuery, $options: 'i' } },
          { short_description: { $regex: trimmedQuery, $options: 'i' } },
          { higher_level_text: { $regex: trimmedQuery, $options: 'i' } },
        ];
      }
      const rows = await db.collection(type).find(filter).toArray();
      return sortRowsByText(rows, 'name')
        .slice(0, safeLimit)
        .map((row) =>
        mapSearchResult(type, {
          ...row,
          sourceCode: sourceMap.get(row.source_id)?.code,
          sourceName: sourceMap.get(row.source_id)?.name,
        })
      );
    }
    default: {
      const sourceCondition = normalizedEdition === 'all' ? '' : ' AND s.code = ?';
      const sourceParams = normalizedEdition === 'all' ? [] : [normalizedEdition];

      if (type === 'spells') {
        const params =
          trimmedQuery === ''
            ? sourceParams
            : [...sourceParams, `%${trimmedQuery}%`, `%${trimmedQuery}%`, `%${trimmedQuery}%`];
        return withSqlite((db) =>
          db
            .prepare(
              `SELECT sp.slug, sp.code, sp.name, sp.description, sp.higher_level_text, sp.level, s.code AS source_code, s.name AS source_name
               FROM spells sp
               INNER JOIN sources s ON s.id = sp.source_id
               WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (sp.name LIKE ? OR sp.description LIKE ? OR sp.higher_level_text LIKE ?)'}
               ORDER BY sp.name
               LIMIT ${safeLimit}`
            )
            .all(...params)
            .map((row) => mapSearchResult(type, row))
        );
      }

      if (type === 'items') {
        const params =
          trimmedQuery === ''
            ? sourceParams
            : [...sourceParams, `%${trimmedQuery}%`, `%${trimmedQuery}%`];
        return withSqlite((db) =>
          db
            .prepare(
              `SELECT i.slug, i.code, i.name, i.description, s.code AS source_code, s.name AS source_name
               FROM items i
               INNER JOIN sources s ON s.id = i.source_id
               WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (i.name LIKE ? OR i.description LIKE ?)'}
               ORDER BY i.name
               LIMIT ${safeLimit}`
            )
            .all(...params)
            .map((row) => mapSearchResult(type, row))
        );
      }

      const params =
        trimmedQuery === ''
          ? sourceParams
          : [...sourceParams, `%${trimmedQuery}%`, `%${trimmedQuery}%`, `%${trimmedQuery}%`];
      return withSqlite((db) =>
        db
          .prepare(
            `SELECT f.slug, f.code, f.name, f.description, f.short_description, f.feature_type, s.code AS source_code, s.name AS source_name
             FROM features f
             INNER JOIN sources s ON s.id = f.source_id
             WHERE 1 = 1${sourceCondition}${trimmedQuery === '' ? '' : ' AND (f.name LIKE ? OR f.description LIKE ? OR f.short_description LIKE ?)'}
             ORDER BY f.name
             LIMIT ${safeLimit}`
          )
          .all(...params)
          .map((row) => mapSearchResult(type, row))
      );
    }
  }
}

async function countUsers() {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM dbo.[users]');
      return Number(result.recordset[0].count);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      return db.collection('users').countDocuments();
    }
    default:
      return withSqlite((db) => Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count));
  }
}

async function findUserByEmail(email) {
  await ensureAppStorage();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('email', sql.NVarChar(255), normalizedEmail);
      const result = await request.query('SELECT * FROM dbo.[users] WHERE LOWER([email]) = @email');
      return result.recordset[0] || null;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      return db.collection('users').findOne({ email: normalizedEmail });
    }
    default:
      return withSqlite((db) =>
        db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail) || null
      );
  }
}

async function findUserById(userId) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), userId);
      const result = await request.query('SELECT * FROM dbo.[users] WHERE [id] = @id');
      return result.recordset[0] || null;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      return db.collection('users').findOne({ id: userId });
    }
    default:
      return withSqlite((db) => db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null);
  }
}

async function createUser(user) {
  await ensureAppStorage();
  const record = {
    ...user,
    email: String(user.email || '').trim().toLowerCase(),
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), record.id);
      request.input('email', sql.NVarChar(255), record.email);
      request.input('display_name', sql.NVarChar(255), record.display_name);
      request.input('password_hash', sql.NVarChar(255), record.password_hash);
      request.input('password_salt', sql.NVarChar(255), record.password_salt);
      request.input('role', sql.NVarChar(32), record.role);
      request.input('created_at', sql.DateTimeOffset, record.created_at);
      request.input('updated_at', sql.DateTimeOffset, record.updated_at);
      await request.query(
        `INSERT INTO dbo.[users] ([id], [email], [display_name], [password_hash], [password_salt], [role], [created_at], [updated_at])
         VALUES (@id, @email, @display_name, @password_hash, @password_salt, @role, @created_at, @updated_at)`
      );
      return sanitizeUser(record);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('users').insertOne({ _id: record.id, ...record });
      return sanitizeUser(record);
    }
    default:
      return withSqlite((db) => {
        db.prepare(
          `INSERT INTO users (id, email, display_name, password_hash, password_salt, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          record.id,
          record.email,
          record.display_name,
          record.password_hash,
          record.password_salt,
          record.role,
          record.created_at,
          record.updated_at
        );
        return sanitizeUser(record);
      });
  }
}

async function listUsers() {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const result = await pool.request().query(
        'SELECT [id], [email], [display_name], [role], [created_at], [updated_at] FROM dbo.[users] ORDER BY [created_at]'
      );
      return result.recordset.map(sanitizeUser);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const rows = await db
        .collection('users')
        .find(
          {},
          { projection: { _id: 0, id: 1, email: 1, display_name: 1, role: 1, created_at: 1, updated_at: 1 } }
        )
        .toArray();
      return sortRowsByDate(rows, 'created_at').map(sanitizeUser);
    }
    default:
      return withSqlite((db) =>
        db
          .prepare(
            'SELECT id, email, display_name, role, created_at, updated_at FROM users ORDER BY created_at'
          )
          .all()
          .map(sanitizeUser)
      );
  }
}

async function updateUserRole(userId, role, updatedAt) {
  await ensureAppStorage();
  if (!ROLES.includes(role)) {
    throw new Error(`Unsupported role "${role}".`);
  }

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), userId);
      request.input('role', sql.NVarChar(32), role);
      request.input('updated_at', sql.DateTimeOffset, updatedAt);
      await request.query(
        'UPDATE dbo.[users] SET [role] = @role, [updated_at] = @updated_at WHERE [id] = @id'
      );
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('users').updateOne({ id: userId }, { $set: { role, updated_at: updatedAt } });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, updatedAt, userId);
      });
  }
}

async function createSession(session) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), session.id);
      request.input('user_id', sql.NVarChar(64), session.user_id);
      request.input('expires_at', sql.DateTimeOffset, session.expires_at);
      request.input('created_at', sql.DateTimeOffset, session.created_at);
      request.input('last_seen_at', sql.DateTimeOffset, session.last_seen_at);
      request.input('user_agent', sql.NVarChar(512), session.user_agent);
      await request.query(
        `INSERT INTO dbo.[sessions] ([id], [user_id], [expires_at], [created_at], [last_seen_at], [user_agent])
         VALUES (@id, @user_id, @expires_at, @created_at, @last_seen_at, @user_agent)`
      );
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('sessions').insertOne({ _id: session.id, ...session });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          session.id,
          session.user_id,
          session.expires_at,
          session.created_at,
          session.last_seen_at,
          session.user_agent
        );
      });
  }
}

async function getSessionWithUser(sessionId) {
  await ensureAppStorage();
  if (!sessionId) {
    return null;
  }

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), sessionId);
      const result = await request.query(
        `SELECT s.[id] AS session_id, s.[expires_at], s.[last_seen_at], u.*
         FROM dbo.[sessions] s
         INNER JOIN dbo.[users] u ON u.[id] = s.[user_id]
         WHERE s.[id] = @id`
      );
      if (!result.recordset[0]) {
        return null;
      }

      const row = result.recordset[0];
      return {
        sessionId: row.session_id,
        expiresAt: row.expires_at,
        lastSeenAt: row.last_seen_at,
        user: sanitizeUser(row),
      };
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const session = await db.collection('sessions').findOne({ id: sessionId });
      if (!session) {
        return null;
      }
      const user = await db.collection('users').findOne({ id: session.user_id });
      if (!user) {
        return null;
      }
      return {
        sessionId: session.id,
        expiresAt: session.expires_at,
        lastSeenAt: session.last_seen_at,
        user: sanitizeUser(user),
      };
    }
    default:
      return withSqlite((db) => {
        const row =
          db
            .prepare(
              `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.*
               FROM sessions s
               INNER JOIN users u ON u.id = s.user_id
               WHERE s.id = ?`
            )
            .get(sessionId) || null;
        if (!row) {
          return null;
        }
        return {
          sessionId: row.session_id,
          expiresAt: row.expires_at,
          lastSeenAt: row.last_seen_at,
          user: sanitizeUser(row),
        };
      });
  }
}

async function touchSession(sessionId, timestamp) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), sessionId);
      request.input('last_seen_at', sql.DateTimeOffset, timestamp);
      await request.query('UPDATE dbo.[sessions] SET [last_seen_at] = @last_seen_at WHERE [id] = @id');
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('sessions').updateOne({ id: sessionId }, { $set: { last_seen_at: timestamp } });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(timestamp, sessionId);
      });
  }
}

async function deleteSession(sessionId) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), sessionId);
      await request.query('DELETE FROM dbo.[sessions] WHERE [id] = @id');
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('sessions').deleteOne({ id: sessionId });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      });
  }
}

async function listCharacters(viewer) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      const filter = isGlobalCharacterAccess(viewer.role) ? '' : ' WHERE c.[owner_user_id] = @owner_user_id';
      if (!isGlobalCharacterAccess(viewer.role)) {
        request.input('owner_user_id', sql.NVarChar(64), viewer.id);
      }
      const result = await request.query(
        `SELECT c.*, u.[display_name] AS owner_display_name
         FROM dbo.[characters] c
         INNER JOIN dbo.[users] u ON u.[id] = c.[owner_user_id]${filter}
         ORDER BY c.[updated_at] DESC`
      );
      return result.recordset.map(mapCharacter);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const filter = isGlobalCharacterAccess(viewer.role) ? {} : { owner_user_id: viewer.id };
      const [characters, users] = await Promise.all([
        db.collection('characters').find(filter).toArray(),
        db.collection('users').find({}, { projection: { _id: 0, id: 1, display_name: 1 } }).toArray(),
      ]);
      const userMap = new Map(users.map((user) => [user.id, user.display_name]));
      return sortRowsByDate(characters, 'updated_at', 'desc').map((row) =>
        mapCharacter({ ...row, ownerDisplayName: userMap.get(row.owner_user_id) || null })
      );
    }
    default:
      return withSqlite((db) => {
        const query = isGlobalCharacterAccess(viewer.role)
          ? `SELECT c.*, u.display_name AS owner_display_name
             FROM characters c
             INNER JOIN users u ON u.id = c.owner_user_id
             ORDER BY c.updated_at DESC`
          : `SELECT c.*, u.display_name AS owner_display_name
             FROM characters c
             INNER JOIN users u ON u.id = c.owner_user_id
             WHERE c.owner_user_id = ?
             ORDER BY c.updated_at DESC`;
        const statement = db.prepare(query);
        const rows = isGlobalCharacterAccess(viewer.role) ? statement.all() : statement.all(viewer.id);
        return rows.map(mapCharacter);
      });
  }
}

async function getCharacterById(characterId) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), characterId);
      const result = await request.query(
        `SELECT c.*, u.[display_name] AS owner_display_name
         FROM dbo.[characters] c
         INNER JOIN dbo.[users] u ON u.[id] = c.[owner_user_id]
         WHERE c.[id] = @id`
      );
      return result.recordset[0] ? mapCharacter(result.recordset[0]) : null;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      const character = await db.collection('characters').findOne({ id: characterId });
      if (!character) {
        return null;
      }
      const owner = await db.collection('users').findOne(
        { id: character.owner_user_id },
        { projection: { _id: 0, display_name: 1 } }
      );
      return mapCharacter({ ...character, ownerDisplayName: owner?.display_name || null });
    }
    default:
      return withSqlite((db) => {
        const row =
          db
            .prepare(
              `SELECT c.*, u.display_name AS owner_display_name
               FROM characters c
               INNER JOIN users u ON u.id = c.owner_user_id
               WHERE c.id = ?`
            )
            .get(characterId) || null;
        return row ? mapCharacter(row) : null;
      });
  }
}

async function createCharacter(character) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), character.id);
      request.input('owner_user_id', sql.NVarChar(64), character.owner_user_id);
      request.input('name', sql.NVarChar(255), character.name);
      request.input('edition', sql.NVarChar(32), character.edition);
      request.input('ancestry_slug', sql.NVarChar(255), character.ancestry_slug || null);
      request.input('class_slug', sql.NVarChar(255), character.class_slug || null);
      request.input('background_slug', sql.NVarChar(255), character.background_slug || null);
      request.input('level', sql.Int, character.level);
      request.input('data_json', sql.NVarChar(sql.MAX), character.data_json);
      request.input('created_at', sql.DateTimeOffset, character.created_at);
      request.input('updated_at', sql.DateTimeOffset, character.updated_at);
      await request.query(
        `INSERT INTO dbo.[characters] ([id], [owner_user_id], [name], [edition], [ancestry_slug], [class_slug], [background_slug], [level], [data_json], [created_at], [updated_at])
         VALUES (@id, @owner_user_id, @name, @edition, @ancestry_slug, @class_slug, @background_slug, @level, @data_json, @created_at, @updated_at)`
      );
      return getCharacterById(character.id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('characters').insertOne({
        _id: character.id,
        ...character,
        data_json: parseJson(character.data_json, {}),
      });
      return getCharacterById(character.id);
    }
    default:
      return withSqlite((db) => {
        db.prepare(
          `INSERT INTO characters (id, owner_user_id, name, edition, ancestry_slug, class_slug, background_slug, level, data_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          character.id,
          character.owner_user_id,
          character.name,
          character.edition,
          character.ancestry_slug || null,
          character.class_slug || null,
          character.background_slug || null,
          character.level,
          character.data_json,
          character.created_at,
          character.updated_at
        );
        return getCharacterById(character.id);
      });
  }
}

async function updateCharacter(character) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), character.id);
      request.input('name', sql.NVarChar(255), character.name);
      request.input('edition', sql.NVarChar(32), character.edition);
      request.input('ancestry_slug', sql.NVarChar(255), character.ancestry_slug || null);
      request.input('class_slug', sql.NVarChar(255), character.class_slug || null);
      request.input('background_slug', sql.NVarChar(255), character.background_slug || null);
      request.input('level', sql.Int, character.level);
      request.input('data_json', sql.NVarChar(sql.MAX), character.data_json);
      request.input('updated_at', sql.DateTimeOffset, character.updated_at);
      await request.query(
        `UPDATE dbo.[characters]
         SET [name] = @name,
             [edition] = @edition,
             [ancestry_slug] = @ancestry_slug,
             [class_slug] = @class_slug,
             [background_slug] = @background_slug,
             [level] = @level,
             [data_json] = @data_json,
             [updated_at] = @updated_at
         WHERE [id] = @id`
      );
      return getCharacterById(character.id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('characters').updateOne(
        { id: character.id },
        {
          $set: {
            name: character.name,
            edition: character.edition,
            ancestry_slug: character.ancestry_slug || null,
            class_slug: character.class_slug || null,
            background_slug: character.background_slug || null,
            level: character.level,
            data_json: parseJson(character.data_json, {}),
            updated_at: character.updated_at,
          },
        }
      );
      return getCharacterById(character.id);
    }
    default:
      return withSqlite((db) => {
        db.prepare(
          `UPDATE characters
           SET name = ?,
               edition = ?,
               ancestry_slug = ?,
               class_slug = ?,
               background_slug = ?,
               level = ?,
               data_json = ?,
               updated_at = ?
           WHERE id = ?`
        ).run(
          character.name,
          character.edition,
          character.ancestry_slug || null,
          character.class_slug || null,
          character.background_slug || null,
          character.level,
          character.data_json,
          character.updated_at,
          character.id
        );
        return getCharacterById(character.id);
      });
  }
}

async function deleteCharacter(characterId) {
  await ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const request = pool.request();
      request.input('id', sql.NVarChar(64), characterId);
      await request.query('DELETE FROM dbo.[characters] WHERE [id] = @id');
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      const db = await getMongoDb();
      await db.collection('characters').deleteOne({ id: characterId });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('DELETE FROM characters WHERE id = ?').run(characterId);
      });
  }
}

module.exports = {
  COMPENDIUM_TYPES,
  ROLES,
  countUsers,
  createCharacter,
  createSession,
  createUser,
  deleteCharacter,
  deleteSession,
  ensureAppStorage,
  findUserByEmail,
  findUserById,
  getBootstrapData,
  getCharacterById,
  getSessionWithUser,
  isGlobalCharacterAccess,
  listCharacters,
  listDiceModels,
  listSources,
  listUsers,
  normalizeEdition,
  searchCompendium,
  touchSession,
  updateCharacter,
  updateUserRole,
};
