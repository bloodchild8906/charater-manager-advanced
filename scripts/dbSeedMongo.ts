import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import { MongoClient } from 'mongodb';
import { buildNormalizedSeedData, NormalizedSeedData } from './seedNormalizedDatabase';

const DEFAULT_AZURE_COSMOS_SCOPE = 'https://management.azure.com/.default';
const DEFAULT_MONGODB_DATABASE = '5e-database';

const COLLECTION_NAMES: Array<keyof NormalizedSeedData> = [
  'sources',
  'lookups',
  'entities',
  'features',
  'spells',
  'items',
  'actors',
  'links',
];

function readEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

function deriveMongoDatabaseNameFromConnectionString(connectionString: string): string {
  const match = /^[a-z0-9+.-]+:\/\/[^/]+\/([^?]+)/i.exec(connectionString.trim());
  if (!match) {
    return '';
  }

  return decodeURIComponent(match[1] || '').trim();
}

function getMongoDatabaseName(): string {
  return (
    readEnv('MONGODB_DATABASE') ||
    readEnv('AZURE_COSMOS_DATABASE') ||
    deriveMongoDatabaseNameFromConnectionString(readEnv('MONGODB_URI')) ||
    deriveMongoDatabaseNameFromConnectionString(readEnv('AZURE_COSMOS_CONNECTIONSTRING')) ||
    DEFAULT_MONGODB_DATABASE
  );
}

function getAzureCredential(): ClientSecretCredential | DefaultAzureCredential {
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

async function getMongoConnectionString(): Promise<string> {
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

  const payload = (await response.json()) as {
    connectionStrings?: Array<{ connectionString?: string }>;
  };
  const connectionString = payload.connectionStrings?.[0]?.connectionString?.trim();

  if (!connectionString) {
    throw new Error('Azure Cosmos DB did not return a MongoDB connection string.');
  }

  return connectionString;
}

function toMongoDocument(row: Record<string, unknown>): Record<string, unknown> {
  const id = row.id;
  if (typeof id === 'string' && id.trim() !== '') {
    return { _id: id, ...row };
  }

  return row;
}

export async function seedMongoDatabase() {
  const connectionString = await getMongoConnectionString();
  const databaseName = getMongoDatabaseName();
  const data = buildNormalizedSeedData();
  const client = new MongoClient(connectionString);

  try {
    await client.connect();
    const db = client.db(databaseName);
    console.log(`Connected to MongoDB database ${databaseName}`);

    for (const collectionName of COLLECTION_NAMES) {
      const collection = db.collection(collectionName);
      const rows = data[collectionName];

      await collection.deleteMany({});

      if (rows.length > 0) {
        await collection.insertMany(rows.map((row) => toMongoDocument(row)));
      }
    }

    console.log(
      `Seeded MongoDB database: ` +
        `${data.sources.length} sources, ` +
        `${data.lookups.length} lookups, ` +
        `${data.entities.length} entities, ` +
        `${data.features.length} features, ` +
        `${data.spells.length} spells, ` +
        `${data.items.length} items, ` +
        `${data.actors.length} actors, ` +
        `${data.links.length} links.`
    );
  } catch (error) {
    console.error('MongoDB seed failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

export async function main() {
  await seedMongoDatabase();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('MongoDB seed failed:', error);
    process.exit(1);
  });
}
