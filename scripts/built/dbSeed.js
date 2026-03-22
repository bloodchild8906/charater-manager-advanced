"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSqliteDatabase = seedSqliteDatabase;
exports.main = main;
const dbUtils_1 = require("./dbUtils");
const normalizedSchema_1 = require("./normalizedSchema");
const seedNormalizedDatabase_1 = require("./seedNormalizedDatabase");
function seedSqliteDatabase() {
    const sqliteDbPath = (0, dbUtils_1.getSqliteDbPath)();
    (0, dbUtils_1.resetSqliteDatabase)(sqliteDbPath);
    const db = (0, dbUtils_1.openSqliteDatabase)(sqliteDbPath);
    try {
        console.log(`Seeding normalized SQLite database at ${sqliteDbPath}`);
        (0, normalizedSchema_1.createNormalizedSchema)(db);
        (0, seedNormalizedDatabase_1.seedNormalizedDatabase)(db);
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
