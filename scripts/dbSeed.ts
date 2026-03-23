import { getSqliteDbPath, openSqliteDatabase, resetSqliteDatabase } from './dbUtils';
import { createNormalizedSchema } from './normalizedSchema';
import { seedNormalizedDatabase } from './seedNormalizedDatabase';
import { runCampaignMigrationsUp } from './runCampaignMigrations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SQLITE_APP_BASE_SCHEMA_SQL } = require('./sqliteAppBaseSchema.cjs');

export function seedSqliteDatabase() {
  const sqliteDbPath = getSqliteDbPath();
  resetSqliteDatabase(sqliteDbPath);
  const db = openSqliteDatabase(sqliteDbPath);

  try {
    console.log(`Seeding normalized SQLite database at ${sqliteDbPath}`);
    createNormalizedSchema(db);
    db.exec(SQLITE_APP_BASE_SCHEMA_SQL);
    runCampaignMigrationsUp(db);
    seedNormalizedDatabase(db);
    console.log('Database seed completed successfully.');
  } catch (error) {
    console.error('Database seed failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

export function main() {
  seedSqliteDatabase();
}

if (require.main === module) {
  main();
}
