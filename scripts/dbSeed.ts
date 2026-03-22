import { getSqliteDbPath, openSqliteDatabase, resetSqliteDatabase } from './dbUtils';
import { createNormalizedSchema } from './normalizedSchema';
import { seedNormalizedDatabase } from './seedNormalizedDatabase';

export function seedSqliteDatabase() {
  const sqliteDbPath = getSqliteDbPath();
  resetSqliteDatabase(sqliteDbPath);
  const db = openSqliteDatabase(sqliteDbPath);

  try {
    console.log(`Seeding normalized SQLite database at ${sqliteDbPath}`);
    createNormalizedSchema(db);
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
