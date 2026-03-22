import { getSqliteDbPath, openSqliteDatabase, resetSqliteDatabase } from './dbUtils';
import { createNormalizedSchema } from './normalizedSchema';
import { seedNormalizedDatabase } from './seedNormalizedDatabase';

function main() {
  const sqliteDbPath = getSqliteDbPath();
  resetSqliteDatabase(sqliteDbPath);
  const db = openSqliteDatabase(sqliteDbPath);

  try {
    console.log(`Rebuilding normalized SQLite database at ${sqliteDbPath}`);
    createNormalizedSchema(db);
    seedNormalizedDatabase(db);
    console.log('Database refresh completed successfully.');
  } catch (error) {
    console.error('Database refresh failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
