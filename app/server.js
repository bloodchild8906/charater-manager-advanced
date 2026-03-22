const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const sql = require('mssql');

const DEFAULT_AZURE_SQL_DATABASE = 'dnd5e_srd_minimal';
const TABLES = ['sources', 'lookups', 'entities', 'features', 'spells', 'items', 'actors', 'links'];

function hasAzureSqlConfig() {
  return Boolean(
    process.env.AZURE_SQL_SERVER &&
      process.env.AZURE_SQL_USERNAME &&
      process.env.AZURE_SQL_PASSWORD
  );
}

function getProvider() {
  return hasAzureSqlConfig() ? 'azuresql' : 'sqlite';
}

function getAzureSqlConfig() {
  const rawServer = String(process.env.AZURE_SQL_SERVER || '').trim().replace(/^tcp:/i, '');
  const [serverHost, portValue] = rawServer.split(',');
  const port = portValue ? Number(portValue) : 1433;

  return {
    server: serverHost,
    port: Number.isNaN(port) ? 1433 : port,
    user: String(process.env.AZURE_SQL_USERNAME || '').trim(),
    password: String(process.env.AZURE_SQL_PASSWORD || '').trim(),
    database: String(process.env.AZURE_SQL_DATABASE || DEFAULT_AZURE_SQL_DATABASE).trim(),
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

async function getCounts() {
  return getProvider() === 'azuresql' ? getAzureSqlCounts() : getSqliteCounts();
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (request, response) => {
  const provider = getProvider();

  try {
    if (request.url === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        provider,
        database: provider === 'azuresql' ? getAzureSqlConfig().database : getSqlitePath(),
      });
      return;
    }

    if (request.url === '/stats') {
      const counts = await getCounts();
      writeJson(response, 200, {
        status: 'ok',
        provider,
        counts,
      });
      return;
    }

    writeJson(response, 200, {
      name: '5e-database',
      status: 'ok',
      provider,
      endpoints: ['/health', '/stats'],
    });
  } catch (error) {
    writeJson(response, 500, {
      status: 'error',
      provider,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`5e-database server listening on ${port} using ${getProvider()}`);
});

