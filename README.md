# 5e-database

![Build Status](https://github.com/5e-bits/5e-database/workflows/5e%20Database%20CI/badge.svg?branch=main)
[![Discord](https://img.shields.io/discord/656547667601653787)](https://discord.gg/TQuYTv7)

Holds the database for the D&D 5th Edition API at http://dnd5eapi.co/

Talk to us [on Discord!](https://discord.gg/TQuYTv7)

## How to run

This project writes the SRD data into a normalized SQLite database and can also seed or read from Azure SQL and MongoDB.

By default the database is written to `data/5e-database.sqlite`.

The runtime database provider is controlled by `DATABASE_PROVIDER`:

- `sqlite`
- `azuresql`
- `mongodb`

If `DATABASE_PROVIDER` is not set, the app keeps the existing fallback behavior and auto-detects Azure SQL first, then MongoDB, then SQLite.

The schema uses these core tables:

- `sources`
- `lookups`
- `entities`
- `features`
- `spells`
- `items`
- `actors`
- `links`

You can build or rebuild it locally by running:

```bash
npm run db:refresh
```

Or seed it directly with the dedicated seed script:

```bash
npm run db:seed
```

To run the lightweight status app locally:

```bash
npm start
```

To use a custom path:

```bash
SQLITE_DB_PATH=./tmp/5e-database.sqlite npm run db:refresh
```

`db:refresh` and `db:seed` both rebuild the database from the JSON source files.

`db:update` is currently not implemented for the normalized schema:

```bash
npm run db:update
```

To seed Azure SQL instead of SQLite:

```bash
AZURE_SQL_SERVER=your-server.database.windows.net \
AZURE_SQL_USERNAME=your-user \
AZURE_SQL_PASSWORD=your-password \
AZURE_SQL_DATABASE=dnd5e_srd_minimal \
npm run db:seed:azure
```

To seed MongoDB:

```bash
DATABASE_PROVIDER=mongodb \
MONGODB_DATABASE=character-manager-advanced-database \
MONGODB_URI='mongodb://...' \
npm run db:seed:mongodb
```

If your Azure App Service uses Azure Service Connector for Cosmos DB for MongoDB, the app also supports the Service Connector environment variables:

- `AZURE_COSMOS_CONNECTIONSTRING`
- `AZURE_COSMOS_LISTCONNECTIONSTRINGURL`
- `AZURE_COSMOS_SCOPE`
- `AZURE_COSMOS_CLIENTID`
- `AZURE_COSMOS_CLIENTSECRET`
- `AZURE_COSMOS_TENANTID`

To seed whichever online provider is selected by `DATABASE_PROVIDER`:

```bash
npm run db:seed:online
```

## Deployment

The repo includes `.github/workflows/deploy-app-service.yml` for Azure App Service deployment.

What the workflow does:

- installs dependencies
- builds the TypeScript seed scripts
- runs the test suite
- reseeds the selected online database when matching credentials are available
- deploys the Node runtime app to Azure App Service

Required GitHub Secrets:

- `AZURE_CREDENTIALS`

Azure SQL deployment inputs:

- `AZURE_SQL_SERVER`
- `AZURE_SQL_USERNAME`
- `AZURE_SQL_PASSWORD`
- `AZURE_SQL_DATABASE` (optional, defaults in code to `dnd5e_srd_minimal`)

MongoDB deployment inputs:

- `MONGODB_URI` or `AZURE_COSMOS_CONNECTIONSTRING`, or the Azure Service Connector identity variables
- `MONGODB_DATABASE`

Required GitHub Variables:

- `AZURE_WEBAPP_NAME`
- `DATABASE_PROVIDER`
- `MONGODB_DATABASE` when `DATABASE_PROVIDER=mongodb`

For your Azure App Service, set `DATABASE_PROVIDER=mongodb` and `MONGODB_DATABASE=character-manager-advanced-database`. If you already attached the app to Azure Cosmos DB for MongoDB with Service Connector, the runtime can use the connector-provided variables directly.

The deployed app exposes:

- `/health`
- `/stats`

## API Issues

If you see anything wrong with the API and not the data, please open an issue or PR over [here](https://github.com/5e-bits/5e-srd-api).

## Contributing

* Fork this repository
* Create a new branch for your work
* Push up any changes to your branch, and open a pull request. Don't feel it needs to be perfect — incomplete work is totally fine. We'd love to help get it ready for merging.
* We use Semantic Release so here are the PR naming convetions:

| Commit message                                                                                                                                                                             | Release type                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| fix(pencil): stop graphite breaking when too much pressure applied                                                                                                                         | Patch Fix Release                                                                                        |
| feat(pencil): add 'graphiteWidth' option                                                                                                                                                   | Minor Feature Release                                                                                    |
| perf(pencil): remove graphiteWidth option<br><br>BREAKING CHANGE: The graphiteWidth option has been removed.<br>The default graphite width of 10mm is always used for performance reasons. | Major Breaking Release<br><br>(Note that the BREAKING CHANGE: token must be in the footer of the commit) |

## Code of Conduct

The Code of Conduct can be found [here.](https://github.com/5e-bits/5e-database/wiki/Code-of-Conduct)

## License

This project is licensed under the terms of the MIT license. The underlying material
is released using the [Open Gaming License Version 1.0a](https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f)

## Contributors

<a href="https://github.com/5e-bits/5e-database/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=5e-bits/5e-database" />
</a>
