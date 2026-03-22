const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const sql = require('mssql');
const { MongoClient } = require('mongodb');

const DEFAULT_AZURE_SQL_DATABASE = 'dnd5e_srd_minimal';
const DEFAULT_MONGODB_DATABASE = '5e-database';
const DEFAULT_AZURE_COSMOS_SCOPE = 'https://management.azure.com/.default';

const DATABASE_PROVIDERS = {
  SQLITE: 'sqlite',
  AZURE_SQL: 'azuresql',
  MONGODB: 'mongodb',
};

const TABLES = ['sources', 'lookups', 'entities', 'features', 'spells', 'items', 'actors', 'links'];
const SUPPORTED_DATABASE_PROVIDERS = Object.values(DATABASE_PROVIDERS);

function readEnv(name) {
  return String(process.env[name] || '').trim();
}

function hasAzureSqlConfig() {
  return Boolean(
    readEnv('AZURE_SQL_SERVER') && readEnv('AZURE_SQL_USERNAME') && readEnv('AZURE_SQL_PASSWORD')
  );
}

function hasMongoDbConfig() {
  return Boolean(
    readEnv('MONGODB_URI') ||
      readEnv('AZURE_COSMOS_CONNECTIONSTRING') ||
      readEnv('AZURE_COSMOS_LISTCONNECTIONSTRINGURL')
  );
}

function getConfiguredProvider() {
  const configuredProvider = readEnv('DATABASE_PROVIDER').toLowerCase();
  if (!configuredProvider) {
    return null;
  }

  if (!SUPPORTED_DATABASE_PROVIDERS.includes(configuredProvider)) {
    throw new Error(
      `Unsupported DATABASE_PROVIDER "${configuredProvider}". ` +
        `Expected one of: ${SUPPORTED_DATABASE_PROVIDERS.join(', ')}.`
    );
  }

  return configuredProvider;
}

function getProvider() {
  const configuredProvider = getConfiguredProvider();
  if (configuredProvider) {
    return configuredProvider;
  }

  if (hasAzureSqlConfig()) {
    return DATABASE_PROVIDERS.AZURE_SQL;
  }

  if (hasMongoDbConfig()) {
    return DATABASE_PROVIDERS.MONGODB;
  }

  return DATABASE_PROVIDERS.SQLITE;
}

function getAzureSqlConfig() {
  const rawServer = readEnv('AZURE_SQL_SERVER').replace(/^tcp:/i, '');
  const [serverHost, portValue] = rawServer.split(',');
  const port = portValue ? Number(portValue) : 1433;

  return {
    server: serverHost,
    port: Number.isNaN(port) ? 1433 : port,
    user: readEnv('AZURE_SQL_USERNAME'),
    password: readEnv('AZURE_SQL_PASSWORD'),
    database: readEnv('AZURE_SQL_DATABASE') || DEFAULT_AZURE_SQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let azurePoolPromise = null;

async function getAzurePool() {
  if (!azurePoolPromise) {
    const pool = new sql.ConnectionPool(getAzureSqlConfig());
    azurePoolPromise = pool.connect();
  }

  return azurePoolPromise;
}

async function getAzureSqlCounts() {
  const pool = await getAzurePool();
  const counts = {};

  for (const table of TABLES) {
    const result = await pool.request().query(`SELECT COUNT(*) AS count FROM dbo.[${table}]`);
    counts[table] = Number(result.recordset[0].count);
  }

  return counts;
}

function getSqlitePath() {
  return path.resolve(process.env.SQLITE_DB_PATH || 'data/5e-database.sqlite');
}

function getSqliteCounts() {
  const db = new DatabaseSync(getSqlitePath());
  const counts = {};

  try {
    for (const table of TABLES) {
      const result = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      counts[table] = Number(result.count);
    }
    return counts;
  } finally {
    db.close();
  }
}

function deriveMongoDatabaseNameFromConnectionString(connectionString) {
  const match = /^[a-z0-9+.-]+:\/\/[^/]+\/([^?]+)/i.exec(String(connectionString || '').trim());
  if (!match) {
    return '';
  }

  return decodeURIComponent(match[1] || '').trim();
}

function getMongoDatabaseName() {
  const explicitDatabase =
    readEnv('MONGODB_DATABASE') ||
    readEnv('AZURE_COSMOS_DATABASE') ||
    deriveMongoDatabaseNameFromConnectionString(readEnv('MONGODB_URI')) ||
    deriveMongoDatabaseNameFromConnectionString(readEnv('AZURE_COSMOS_CONNECTIONSTRING'));

  return explicitDatabase || DEFAULT_MONGODB_DATABASE;
}

function getAzureCredential() {
  const { ClientSecretCredential, DefaultAzureCredential } = require('@azure/identity');
  const clientId = readEnv('AZURE_COSMOS_CLIENTID');
  const clientSecret = readEnv('AZURE_COSMOS_CLIENTSECRET');
  const tenantId = readEnv('AZURE_COSMOS_TENANTID');

  if (clientId && clientSecret && tenantId) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  if (clientId) {
    return new DefaultAzureCredential({ managedIdentityClientId: clientId });
  }

  return new DefaultAzureCredential();
}

async function getMongoConnectionString() {
  const directConnectionString =
    readEnv('MONGODB_URI') || readEnv('AZURE_COSMOS_CONNECTIONSTRING');
  if (directConnectionString) {
    return directConnectionString;
  }

  const listConnectionStringUrl = readEnv('AZURE_COSMOS_LISTCONNECTIONSTRINGURL');
  if (!listConnectionStringUrl) {
    throw new Error(
      'Missing MongoDB connection configuration. ' +
        'Set MONGODB_URI, AZURE_COSMOS_CONNECTIONSTRING, or Azure Service Connector settings.'
    );
  }

  const credential = getAzureCredential();
  const accessToken = await credential.getToken(
    readEnv('AZURE_COSMOS_SCOPE') || DEFAULT_AZURE_COSMOS_SCOPE
  );

  if (!accessToken?.token) {
    throw new Error('Unable to acquire an Azure access token for Azure Cosmos DB.');
  }

  const response = await fetch(listConnectionStringUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Azure Cosmos DB connection string (${response.status} ${response.statusText}).`
    );
  }

  const payload = await response.json();
  const connectionString = payload?.connectionStrings?.[0]?.connectionString;
  if (!connectionString) {
    throw new Error('Azure Cosmos DB did not return a MongoDB connection string.');
  }

  return connectionString;
}

let mongoClientPromise = null;

async function getMongoClient() {
  if (!mongoClientPromise) {
    mongoClientPromise = (async () => {
      const connectionString = await getMongoConnectionString();
      const client = new MongoClient(connectionString);
      await client.connect();
      return client;
    })();
  }

  return mongoClientPromise;
}

async function getMongoCounts() {
  const client = await getMongoClient();
  const db = client.db(getMongoDatabaseName());
  const counts = {};

  for (const table of TABLES) {
    counts[table] = await db.collection(table).countDocuments();
  }

  return counts;
}

async function getCounts() {
  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL:
      return getAzureSqlCounts();
    case DATABASE_PROVIDERS.MONGODB:
      return getMongoCounts();
    default:
      return getSqliteCounts();
  }
}

function getDatabaseTarget(provider = getProvider()) {
  switch (provider) {
    case DATABASE_PROVIDERS.AZURE_SQL:
      return getAzureSqlConfig().database;
    case DATABASE_PROVIDERS.MONGODB:
      return getMongoDatabaseName();
    default:
      return getSqlitePath();
  }
}

module.exports = {
  DATABASE_PROVIDERS,
  DEFAULT_AZURE_SQL_DATABASE,
  DEFAULT_MONGODB_DATABASE,
  SUPPORTED_DATABASE_PROVIDERS,
  TABLES,
  deriveMongoDatabaseNameFromConnectionString,
  getAzureSqlConfig,
  getConfiguredProvider,
  getCounts,
  getDatabaseTarget,
  getMongoDatabaseName,
  getProvider,
  getSqlitePath,
  hasAzureSqlConfig,
  hasMongoDbConfig,
};
