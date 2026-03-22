"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dbUtils_1 = require("./dbUtils");
const normalizedSchema_1 = require("./normalizedSchema");
const seedNormalizedDatabase_1 = require("./seedNormalizedDatabase");
function main() {
    const sqliteDbPath = (0, dbUtils_1.getSqliteDbPath)();
    (0, dbUtils_1.resetSqliteDatabase)(sqliteDbPath);
    const db = (0, dbUtils_1.openSqliteDatabase)(sqliteDbPath);
    try {
        console.log(`Rebuilding normalized SQLite database at ${sqliteDbPath}`);
        (0, normalizedSchema_1.createNormalizedSchema)(db);
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
