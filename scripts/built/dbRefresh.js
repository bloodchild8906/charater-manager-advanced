"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dbUtils_1 = require("./dbUtils");
const normalizedSchema_1 = require("./normalizedSchema");
const seedNormalizedDatabase_1 = require("./seedNormalizedDatabase");
const runCampaignMigrations_1 = require("./runCampaignMigrations");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SQLITE_APP_BASE_SCHEMA_SQL } = require('./sqliteAppBaseSchema.cjs');
function main() {
    const sqliteDbPath = (0, dbUtils_1.getSqliteDbPath)();
    (0, dbUtils_1.resetSqliteDatabase)(sqliteDbPath);
    const db = (0, dbUtils_1.openSqliteDatabase)(sqliteDbPath);
    try {
        console.log(`Rebuilding normalized SQLite database at ${sqliteDbPath}`);
        (0, normalizedSchema_1.createNormalizedSchema)(db);
        db.exec(SQLITE_APP_BASE_SCHEMA_SQL);
        (0, runCampaignMigrations_1.runCampaignMigrationsUp)(db);
        (0, seedNormalizedDatabase_1.seedNormalizedDatabase)(db);
        console.log('Database refresh completed successfully.');
    }
    catch (error) {
        console.error('Database refresh failed:', error);
        process.exit(1);
    }
    finally {
        db.close();
    }
}
main();
