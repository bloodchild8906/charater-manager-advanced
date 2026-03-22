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

function loadStoreModule(overrides = {}) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  delete require.cache[require.resolve('./database')];
  delete require.cache[require.resolve('./store')];
  return require('./store');
}

afterEach(() => {
  restoreEnv();
  delete require.cache[require.resolve('./database')];
  delete require.cache[require.resolve('./store')];
});

describe('dice model bootstrap data', () => {
  it(
    'seeds and returns dice models from the app database layer',
    async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-dice-models-'));
      const sqlitePath = path.join(tempDir, '5e-database.sqlite');

      try {
        const store = loadStoreModule({
          DATABASE_PROVIDER: 'sqlite',
          SQLITE_DB_PATH: sqlitePath,
        });
        const database = require('./database');

        const diceModels = await store.listDiceModels();
        expect(diceModels.length).toBeGreaterThan(0);
        expect(diceModels[0].key).toBe('default');
        expect(diceModels[0].theme).toBe('default');
        expect(diceModels[0].assetPath).toBe('/assets/');

        const bootstrap = await store.getBootstrapData('all');
        expect(Array.isArray(bootstrap.classes)).toBe(true);
        expect(bootstrap.classes.length).toBeGreaterThan(0);
        const row = database.withSqlite((db) =>
          db.prepare('SELECT COUNT(*) AS count FROM dice_models').get()
        );
        expect(Number(row.count)).toBeGreaterThan(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
    15000
  );
});
