import { seedMongoDatabase } from './dbSeedMongo';
import { seedSqliteDatabase } from './dbSeed';
import { seedAzureSqlDatabase } from './dbSeedAzureSql';

const SUPPORTED_DATABASE_PROVIDERS = ['sqlite', 'azuresql', 'mongodb'] as const;
type SupportedDatabaseProvider = (typeof SUPPORTED_DATABASE_PROVIDERS)[number];

function readEnv(name: string): string {
  return process.env[name]?.trim().toLowerCase() || '';
}

function hasAzureSqlConfig(): boolean {
  return Boolean(readEnv('AZURE_SQL_SERVER') && readEnv('AZURE_SQL_USERNAME') && readEnv('AZURE_SQL_PASSWORD'));
}

function hasMongoDbConfig(): boolean {
  return Boolean(
    readEnv('MONGODB_URI') ||
      readEnv('AZURE_COSMOS_CONNECTIONSTRING') ||
      readEnv('AZURE_COSMOS_LISTCONNECTIONSTRINGURL')
  );
}

function getSeedProvider(): SupportedDatabaseProvider {
  const configuredProvider = readEnv('DATABASE_PROVIDER');
  if (configuredProvider) {
    if (
      (SUPPORTED_DATABASE_PROVIDERS as readonly string[]).includes(configuredProvider)
    ) {
      return configuredProvider as SupportedDatabaseProvider;
    }

    throw new Error(
      `Unsupported DATABASE_PROVIDER "${configuredProvider}". ` +
        `Expected one of: ${SUPPORTED_DATABASE_PROVIDERS.join(', ')}.`
    );
  }

  if (hasAzureSqlConfig()) {
    return 'azuresql';
  }

  if (hasMongoDbConfig()) {
    return 'mongodb';
  }

  return 'sqlite';
}

export async function main() {
  switch (getSeedProvider()) {
    case 'azuresql':
      await seedAzureSqlDatabase();
      return;
    case 'mongodb':
      await seedMongoDatabase();
      return;
    default:
      seedSqliteDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Database seed failed:', error);
    process.exit(1);
  });
}
