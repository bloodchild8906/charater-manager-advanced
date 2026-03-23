"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSqliteDatabase = seedSqliteDatabase;
exports.main = main;
const dbUtils_1 = require("./dbUtils");
const normalizedSchema_1 = require("./normalizedSchema");
const seedNormalizedDatabase_1 = require("./seedNormalizedDatabase");
const runCampaignMigrations_1 = require("./runCampaignMigrations");
const seedAppData_1 = require("./seedAppData");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SQLITE_APP_BASE_SCHEMA_SQL } = require('./sqliteAppBaseSchema.cjs');
function seedSqliteDatabase() {
    const sqliteDbPath = (0, dbUtils_1.getSqliteDbPath)();
    (0, dbUtils_1.resetSqliteDatabase)(sqliteDbPath);
    const db = (0, dbUtils_1.openSqliteDatabase)(sqliteDbPath);
    try {
        console.log(`Seeding normalized SQLite database at ${sqliteDbPath}`);
        (0, normalizedSchema_1.createNormalizedSchema)(db);
        db.exec(SQLITE_APP_BASE_SCHEMA_SQL);
        (0, runCampaignMigrations_1.runCampaignMigrationsUp)(db);
        (0, seedNormalizedDatabase_1.seedNormalizedDatabase)(db);
        (0, seedAppData_1.seedAppData)(db);
        console.log('Database seed completed successfully.');
    }
    catch (error) {
        console.error('Database seed failed:', error);
        process.exit(1);
    }
    finally {
        db.close();
    }
}
function main() {
    seedSqliteDatabase();
}
if (require.main === module) {
    main();
}
