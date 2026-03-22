const http = require('node:http');
const { getCounts, getDatabaseTarget, getProvider } = require('./database');

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
        database: getDatabaseTarget(provider),
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
