# 5e Database Character Manager

This repository now serves two roles:

1. It builds and seeds a normalized D&D 5e SRD database.
2. It ships a browser-based character manager UI on top of that data.

The app is designed to run locally with SQLite or online with Azure SQL or MongoDB/Cosmos DB for MongoDB, while keeping the same character management UI.

## What The App Does

The runtime app is a lightweight D&D 5e character manager with:

- Account registration and sign-in
- Role-based access for `admin`, `gm`, and `player`
- Character roster management
- Full-sheet editing across multiple tabs
- SRD compendium search and drag/drop import
- Integrated 3D dice rolling with Dice Box
- Support for item resources, item-granted spells, ammunition, and attunement
- Local SQLite, Azure SQL, and MongoDB runtime backends

## Feature Inventory

### Authentication And Access

- Email/password registration and login
- Cookie-based sessions
- Automatic session refresh on activity
- First registered account becomes `admin`
- Admin role management for all users
- GM/admin visibility across all characters
- Player-scoped access to owned characters

### Character Roster

- Searchable roster sidebar
- Character summary pills with lineage and quick stats
- Create flow choice between direct sheet editing and the character wizard
- Delete character support
- Save character changes back to the configured runtime database

### Character Wizard

The wizard currently supports:

- Step-by-step creation flow
- Character name, alignment, and edition selection
- Class, ancestry, and background selection
- Inline detail buttons for class, ancestry, and background markdown/details
- Standard-array ability assignment
- Starting combat profile review and overrides
- Final review before creation

Level-up is also available through a separate wizard flow:

- Advances one level at a time
- Recommends hit point gain from class hit die plus Constitution
- Applies HP and level changes back to the live sheet

### Character Sheet

The sheet is organized into tabs:

- `Core`
- `Combat`
- `Inventory`
- `Spells`
- `Features`
- `Notes`

The sheet UI includes:

- Builder-style top navigation with back-to-roster flow
- Header summary for HP, AC, and initiative
- Editable identity section for class, ancestry, background, alignment, and edition
- Summary cards for the main derived values
- Direct form editing for all major tracked fields

### Ability Scores, Skills, And Combat

- Editable STR/DEX/CON/INT/WIS/CHA scores
- Derived modifiers
- Skill proficiency selection
- Custom per-skill bonuses
- Roll buttons for ability and skill checks
- Initiative rolling from the sheet
- Attack records with:
  - ability used
  - proficiency state
  - attack bonus
  - damage dice
  - damage bonus
  - ammo type and ammo per use
  - equipped-item requirement

### Inventory And Equipment

- Manual item creation
- Compendium item import
- Equipment quantity tracking
- Equip / unequip toggles
- Attunement requirement tracking
- Attunement slot strip on the sheet
- Per-item resource pools such as charges or uses
- Ammo provider support
- Item detail modal editing

### Item-Granted Spellcasting

- Items can carry granted spells
- Granted spells can be cast from the item section when the item is ready
- Attunement is enforced for items that require it
- Item resources are spent when applicable
- Granted spell hydration can pull richer spell data from the compendium

### Spells

- Manual spell creation
- Compendium spell import
- Spellcasting ability configuration
- Spell attack bonus / save DC bonus adjustments
- Spell roll modes:
  - utility
  - attack
  - save
- Damage dice and damage modifier tracking
- Higher-level text support
- Spell detail modal editing

### Features

- Manual feature creation
- Compendium feature import
- Feature list management
- Feature detail modal editing
- Imported features can also generate attacks when the source text supports it

### Compendium Window

The compendium is a floating window rather than a fixed page section.

It supports:

- Search across `spells`, `items`, and `features`
- Detail pane for the currently selected result
- Drag-and-drop onto the live character sheet
- Type-aware routing:
  - items go to inventory
  - spells go to spells
  - features go to features
  - matching attack-capable entries can also seed attacks
- Pin / unpin
- Hide / restore
- Close / reopen
- Dock left
- Dock right
- Free-floating drag movement
- Always-on-top behavior relative to the sheet UI

### Dice System

The app uses [`@3d-dice/dice-box`](https://github.com/3d-dice/dice-box) for 3D dice.

Current dice features:

- Global dice toolbar
- Freeform formula rolling
- Quick denomination rolling (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`)
- Shared dice scene for both toolbar rolls and sheet-triggered rolls
- Click-to-remove dice from the active scene
- Hideable and movable toolbar
- Toolbar hides while a roll is actively happening
- Roll history with totals and formulas
- Dice model/theme configuration sourced from the app database layer

### Sheet-Aware Rolling

Roll actions on the sheet automatically include the current modifiers stored on the character.

This includes:

- ability checks
- skill checks
- initiative
- attacks
- spell attacks
- spell damage
- item-granted spell casting where applicable

### Ammunition, Attunement, And Resources

- Projectile attacks can require ammunition
- Ammo is consumed from matching inventory entries
- Attacks can be blocked when required ammunition is unavailable
- Attunement is capped by visible attunement slots
- Attuned/equipped state controls whether certain attacks or item spells are usable
- Resource-bearing items track current and maximum charges/uses

### Admin Features

- User list for admins
- Role changes between `admin`, `gm`, and `player`
- Admin/GM access to broader character visibility

## Data And Database Features

The normalized database schema includes:

- `sources`
- `lookups`
- `entities`
- `features`
- `spells`
- `items`
- `actors`
- `links`

The seed pipeline builds SRD data into this structure and preserves relationships used by the UI and the API layer.

## Runtime Backends

The runtime provider is selected with `DATABASE_PROVIDER`:

- `sqlite`
- `azuresql`
- `mongodb`

If `DATABASE_PROVIDER` is not set, the app auto-detects in this order:

1. Azure SQL
2. MongoDB / Cosmos DB for MongoDB
3. SQLite

### SQLite

- Default local runtime database: `data/5e-database.sqlite`
- Can be overridden with `SQLITE_DB_PATH`
- The app starts with `node --experimental-sqlite`

### Azure SQL

Supported by setting:

- `AZURE_SQL_SERVER`
- `AZURE_SQL_USERNAME`
- `AZURE_SQL_PASSWORD`
- `AZURE_SQL_DATABASE` (optional, defaults in code)

### MongoDB / Azure Cosmos DB For MongoDB

Supported by setting:

- `MONGODB_URI`
- `MONGODB_DATABASE`

Or the Azure Service Connector / Cosmos variables:

- `AZURE_COSMOS_CONNECTIONSTRING`
- `AZURE_COSMOS_LISTCONNECTIONSTRINGURL`
- `AZURE_COSMOS_SCOPE`
- `AZURE_COSMOS_CLIENTID`
- `AZURE_COSMOS_CLIENTSECRET`
- `AZURE_COSMOS_TENANTID`

## Local Development

### Requirements

- Node `24.x`
- npm

### Install

```bash
npm install
```

### Run The App

```bash
npm start
```

The local server exposes:

- `/health`
- `/stats`
- `/api/auth/*`
- `/api/bootstrap`
- `/api/compendium/search`
- `/api/characters`
- `/api/admin/users`

### Health And Stats

`/health` returns:

- `status`
- active runtime `provider`
- selected `database` target

`/stats` returns:

- `status`
- active runtime `provider`
- row counts for the normalized SRD tables

## Database Build And Seed Commands

Build or rebuild the normalized SQLite database:

```bash
npm run db:refresh
```

Seed the local database directly:

```bash
npm run db:seed
```

Use a custom SQLite path:

```bash
SQLITE_DB_PATH=./tmp/5e-database.sqlite npm run db:refresh
```

Seed Azure SQL:

```bash
AZURE_SQL_SERVER=your-server.database.windows.net \
AZURE_SQL_USERNAME=your-user \
AZURE_SQL_PASSWORD=your-password \
AZURE_SQL_DATABASE=dnd5e_srd_minimal \
npm run db:seed:azure
```

Seed MongoDB:

```bash
DATABASE_PROVIDER=mongodb \
MONGODB_DATABASE=character-manager-advanced-database \
MONGODB_URI='mongodb://...' \
npm run db:seed:mongodb
```

Seed whichever online provider is selected by `DATABASE_PROVIDER`:

```bash
npm run db:seed:online
```

`db:update` exists but the normalized schema path is still effectively rebuild/seed oriented:

```bash
npm run db:update
```

## Testing And Quality Checks

Available scripts:

- `npm run lint`
- `npm test`
- `npm run coverage`
- `npm run build:ts`

What they cover:

- ESLint across server, scripts, and frontend modules
- Vitest coverage for store logic and frontend helper/render modules
- TypeScript compilation for the seed/build scripts

## Azure App Service Deployment

The repository includes GitHub Actions workflows for Azure App Service deployment.

The deployment path is designed to:

- install exact dependency versions from `package-lock.json`
- build the TypeScript seed scripts
- run tests
- optionally seed the selected online provider
- deploy the runtime app

### Azure-Specific Notes

- The repo targets Node `24`
- Production dependencies are pinned to fixed versions
- Azure App Service workflows are intended to use lockfile-based installs
- SQLite fallback can be used in App Service when no remote database is configured

### Required GitHub Secrets / Variables

Secrets:

- `AZURE_CREDENTIALS`

Variables:

- `AZURE_WEBAPP_NAME`
- `DATABASE_PROVIDER`
- `MONGODB_DATABASE` when `DATABASE_PROVIDER=mongodb`

Provider-specific deployment inputs:

- Azure SQL:
  - `AZURE_SQL_SERVER`
  - `AZURE_SQL_USERNAME`
  - `AZURE_SQL_PASSWORD`
  - `AZURE_SQL_DATABASE`
- MongoDB:
  - `MONGODB_URI` or Cosmos connection variables
  - `MONGODB_DATABASE`

## Project Structure

- `app/`
  - runtime server
  - browser UI
  - frontend modules
  - Dice Box vendor assets
- `scripts/`
  - TypeScript database build/seed pipeline
- `data/`
  - local SQLite database
- `.github/workflows/`
  - CI and Azure deployment automation

## License

This project is licensed under the terms of the MIT license.

The underlying D&D material is released using the [Open Gaming License Version 1.0a](https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f).

## Contributing

- Fork the repository
- Create a branch for your work
- Open a pull request when ready

If you are changing product behavior, update this README when the feature surface changes. The app has moved beyond a database-only repository, so documentation needs to track both the data pipeline and the runtime UI.
