const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

function loadDatabaseModule(overrides = {}) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  delete require.cache[require.resolve('./database')];
  return require('./database');
}

afterEach(() => {
  restoreEnv();
  delete require.cache[require.resolve('./database')];
});

describe('database provider selection', () => {
  it(
    'prefers DATABASE_PROVIDER when it is explicitly set',
    () => {
      const database = loadDatabaseModule({
        DATABASE_PROVIDER: 'mongodb',
        AZURE_SQL_SERVER: 'server.database.windows.net',
        AZURE_SQL_USERNAME: 'user',
        AZURE_SQL_PASSWORD: 'password',
      });

      expect(database.getProvider()).toBe('mongodb');
    },
    15000
  );

  it('keeps Azure SQL as the default higher-priority auto-detected provider', () => {
    const database = loadDatabaseModule({
      AZURE_SQL_SERVER: 'server.database.windows.net',
      AZURE_SQL_USERNAME: 'user',
      AZURE_SQL_PASSWORD: 'password',
      AZURE_COSMOS_CONNECTIONSTRING: 'mongodb://user:pass@host/appdb?ssl=true',
    });

    expect(database.getProvider()).toBe('azuresql');
  });

  it('uses mongodb when mongo configuration is present without Azure SQL', () => {
    const database = loadDatabaseModule({
      AZURE_COSMOS_CONNECTIONSTRING: 'mongodb://user:pass@host/appdb?ssl=true',
    });

    expect(database.getProvider()).toBe('mongodb');
  });

  it('rejects unsupported DATABASE_PROVIDER values', () => {
    const database = loadDatabaseModule({
      DATABASE_PROVIDER: 'postgres',
    });

    expect(() => database.getProvider()).toThrow(/Unsupported DATABASE_PROVIDER/);
  });
});

describe('mongo database naming', () => {
  it('uses the explicit mongo database name when provided', () => {
    const database = loadDatabaseModule({
      MONGODB_DATABASE: 'character-manager-advanced-database',
      AZURE_COSMOS_CONNECTIONSTRING: 'mongodb://user:pass@host/appdb?ssl=true',
    });

    expect(database.getMongoDatabaseName()).toBe('character-manager-advanced-database');
  });

  it('derives the database name from the MongoDB connection string when possible', () => {
    const database = loadDatabaseModule();

    expect(
      database.deriveMongoDatabaseNameFromConnectionString(
        'mongodb+srv://user:pass@cluster.example.com/character-manager-advanced-database?retryWrites=true&w=majority'
      )
    ).toBe('character-manager-advanced-database');
  });
});

describe('sqlite path selection', () => {
  it('uses App Service writable storage and seeds it from the bundled database', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), '5e-database-'));

    try {
      const database = loadDatabaseModule({
        WEBSITE_SITE_NAME: 'character-manager-advanced',
        HOME: tempHome,
      });

      const sqlitePath = database.getSqlitePath();
      expect(sqlitePath).toBe(path.join(tempHome, 'site', 'data', '5e-database.sqlite'));
      expect(fs.existsSync(sqlitePath)).toBe(false);

      const db = database.openSqliteDatabase();
      const row = db.prepare('SELECT COUNT(*) AS count FROM sources').get();
      db.close();

      expect(Number(row.count)).toBeGreaterThan(0);
      expect(fs.existsSync(sqlitePath)).toBe(true);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
