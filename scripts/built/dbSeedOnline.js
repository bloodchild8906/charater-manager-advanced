"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const dbSeedMongo_1 = require("./dbSeedMongo");
const dbSeed_1 = require("./dbSeed");
const dbSeedAzureSql_1 = require("./dbSeedAzureSql");
const SUPPORTED_DATABASE_PROVIDERS = ['sqlite', 'azuresql', 'mongodb'];
function readEnv(name) {
    var _a;
    return ((_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) || '';
}
function hasAzureSqlConfig() {
    return Boolean(readEnv('AZURE_SQL_SERVER') && readEnv('AZURE_SQL_USERNAME') && readEnv('AZURE_SQL_PASSWORD'));
}
function hasMongoDbConfig() {
    return Boolean(readEnv('MONGODB_URI') ||
        readEnv('AZURE_COSMOS_CONNECTIONSTRING') ||
        readEnv('AZURE_COSMOS_LISTCONNECTIONSTRINGURL'));
}
function getSeedProvider() {
    const configuredProvider = readEnv('DATABASE_PROVIDER');
    if (configuredProvider) {
        if (SUPPORTED_DATABASE_PROVIDERS.includes(configuredProvider)) {
            return configuredProvider;
        }
        throw new Error(`Unsupported DATABASE_PROVIDER "${configuredProvider}". ` +
            `Expected one of: ${SUPPORTED_DATABASE_PROVIDERS.join(', ')}.`);
    }
    if (hasAzureSqlConfig()) {
        return 'azuresql';
    }
    if (hasMongoDbConfig()) {
        return 'mongodb';
    }
    return 'sqlite';
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        switch (getSeedProvider()) {
            case 'azuresql':
                yield (0, dbSeedAzureSql_1.seedAzureSqlDatabase)();
                return;
            case 'mongodb':
                yield (0, dbSeedMongo_1.seedMongoDatabase)();
                return;
            default:
                (0, dbSeed_1.seedSqliteDatabase)();
        }
    });
}
if (require.main === module) {
    main().catch((error) => {
        console.error('Database seed failed:', error);
        process.exit(1);
    });
}
