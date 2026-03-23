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
exports.seedMongoDatabase = seedMongoDatabase;
exports.main = main;
const identity_1 = require("@azure/identity");
const mongodb_1 = require("mongodb");
const seedNormalizedDatabase_1 = require("./seedNormalizedDatabase");
const DEFAULT_AZURE_COSMOS_SCOPE = 'https://management.azure.com/.default';
const DEFAULT_MONGODB_DATABASE = '5e-database';
const COLLECTION_NAMES = [
    'sources',
    'lookups',
    'entities',
    'features',
    'spells',
    'items',
    'actors',
    'links',
];
function readEnv(name) {
    var _a;
    return ((_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
}
function deriveMongoDatabaseNameFromConnectionString(connectionString) {
    const match = /^[a-z0-9+.-]+:\/\/[^/]+\/([^?]+)/i.exec(connectionString.trim());
    if (!match) {
        return '';
    }
    return decodeURIComponent(match[1] || '').trim();
}
function getMongoDatabaseName() {
    return (readEnv('MONGODB_DATABASE') ||
        readEnv('AZURE_COSMOS_DATABASE') ||
        deriveMongoDatabaseNameFromConnectionString(readEnv('MONGODB_URI')) ||
        deriveMongoDatabaseNameFromConnectionString(readEnv('AZURE_COSMOS_CONNECTIONSTRING')) ||
        DEFAULT_MONGODB_DATABASE);
}
function getAzureCredential() {
    const clientId = readEnv('AZURE_COSMOS_CLIENTID');
    const clientSecret = readEnv('AZURE_COSMOS_CLIENTSECRET');
    const tenantId = readEnv('AZURE_COSMOS_TENANTID');
    if (clientId && clientSecret && tenantId) {
        return new identity_1.ClientSecretCredential(tenantId, clientId, clientSecret);
    }
    if (clientId) {
        return new identity_1.DefaultAzureCredential({ managedIdentityClientId: clientId });
    }
    return new identity_1.DefaultAzureCredential();
}
function getMongoConnectionString() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const directConnectionString = readEnv('MONGODB_URI') || readEnv('AZURE_COSMOS_CONNECTIONSTRING');
        if (directConnectionString) {
            return directConnectionString;
        }
        const listConnectionStringUrl = readEnv('AZURE_COSMOS_LISTCONNECTIONSTRINGURL');
        if (!listConnectionStringUrl) {
            throw new Error('Missing MongoDB connection configuration. ' +
                'Set MONGODB_URI, AZURE_COSMOS_CONNECTIONSTRING, or Azure Service Connector settings.');
        }
        const credential = getAzureCredential();
        const accessToken = yield credential.getToken(readEnv('AZURE_COSMOS_SCOPE') || DEFAULT_AZURE_COSMOS_SCOPE);
        if (!(accessToken === null || accessToken === void 0 ? void 0 : accessToken.token)) {
            throw new Error('Unable to acquire an Azure access token for Azure Cosmos DB.');
        }
        const response = yield fetch(listConnectionStringUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken.token}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch Azure Cosmos DB connection string (${response.status} ${response.statusText}).`);
        }
        const payload = (yield response.json());
        const connectionString = (_c = (_b = (_a = payload.connectionStrings) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.connectionString) === null || _c === void 0 ? void 0 : _c.trim();
        if (!connectionString) {
            throw new Error('Azure Cosmos DB did not return a MongoDB connection string.');
        }
        return connectionString;
    });
}
function toMongoDocument(row) {
    const id = row.id;
    if (typeof id === 'string' && id.trim() !== '') {
        return Object.assign({ _id: id }, row);
    }
    return row;
}
function seedMongoDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionString = yield getMongoConnectionString();
        const databaseName = getMongoDatabaseName();
        const data = (0, seedNormalizedDatabase_1.buildNormalizedSeedData)();
        const client = new mongodb_1.MongoClient(connectionString);
        try {
            yield client.connect();
            const db = client.db(databaseName);
            console.log(`Connected to MongoDB database ${databaseName}`);
            for (const collectionName of COLLECTION_NAMES) {
                const collection = db.collection(collectionName);
                const rows = data[collectionName];
                yield collection.deleteMany({});
                if (rows.length > 0) {
                    yield collection.insertMany(rows.map((row) => toMongoDocument(row)));
                }
            }
            console.log(`Seeded MongoDB database: ` +
                `${data.sources.length} sources, ` +
                `${data.lookups.length} lookups, ` +
                `${data.entities.length} entities, ` +
                `${data.features.length} features, ` +
                `${data.spells.length} spells, ` +
                `${data.items.length} items, ` +
                `${data.actors.length} actors, ` +
                `${data.links.length} links.`);
        }
        catch (error) {
            console.error('MongoDB seed failed:', error);
            process.exit(1);
        }
        finally {
            yield client.close();
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield seedMongoDatabase();
    });
}
if (require.main === module) {
    main().catch((error) => {
        console.error('MongoDB seed failed:', error);
        process.exit(1);
    });
}
