import { getSqliteDbPath, openSqliteDatabase, resetSqliteDatabase } from './dbUtils';
import { createNormalizedSchema } from './normalizedSchema';
import { seedNormalizedDatabase } from './seedNormalizedDatabase';
import { runCampaignMigrationsUp } from './runCampaignMigrations';
import { seedAppData } from './seedAppData';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SQLITE_APP_BASE_SCHEMA_SQL } = require('./sqliteAppBaseSchema.cjs');

function main() {
  const sqliteDbPath = getSqliteDbPath();
  resetSqliteDatabase(sqliteDbPath);
  const db = openSqliteDatabase(sqliteDbPath);

  try {
    console.log(`Rebuilding normalized SQLite database at ${sqliteDbPath}`);
    createNormalizedSchema(db);
    db.exec(SQLITE_APP_BASE_SCHEMA_SQL);
    runCampaignMigrationsUp(db);
    seedNormalizedDatabase(db);
    seedAppData(db);
    console.log('Database refresh completed successfully.');
  } catch (error) {
    console.error('Database refresh failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
