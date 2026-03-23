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
- **Campaign Manager** for GMs to run multi-player campaigns with real-time session tools

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

### Campaign Manager

The Campaign Manager allows GMs to create and run multi-player campaigns with real-time session tools.

#### Campaign Features

- **Campaign CRUD**: Create, update, archive, and delete campaigns
- **Visibility Settings**: Private, invite-only, or public campaigns
- **Member Management**: Invite players, manage member status, track attendance
- **Invitation System**: Generate shareable invite links with expiration
- **DM Sheet Access**: View and edit any member's character sheet with audit trail
- **DM Private Notes**: Per-character notes visible only to the DM

#### Session Management

- **Session Logging**: Record session date, duration, summary, and attendance
- **Event Timeline**: Log in-world events tied to sessions
- **Loot System**: Party loot chest with distribution to characters
- **XP Awards**: Bulk or individual XP grants with level-up detection
- **Damage/Healing**: Apply HP changes to characters with SSE broadcast

#### Campaign Compendium

- **Custom Content**: Create campaign-specific items, spells, features, monsters, NPCs, locations, lore, and factions
- **DM-Only Entries**: Toggle visibility to hide content from players
- **Grant to Character**: Directly add compendium entries to character sheets
- **SRD Cloning**: Import SRD entries into campaign compendium for customization

#### Live Session Tools

- **Initiative Tracker**: Floating panel with drag-to-reorder, NPC support, and turn tracking
- **HP Grid**: Compact party HP overview with inline damage/healing controls
- **Condition Tracker**: Apply and remove conditions with visual indicators
- **Real-Time SSE**: Server-sent events broadcast HP, conditions, and initiative changes to all connected clients

#### API Routes

All campaign routes are under `/api/campaigns`:

| Route                                                 | Method | Description                 |
| ----------------------------------------------------- | ------ | --------------------------- |
| `/api/campaigns`                                      | POST   | Create campaign             |
| `/api/campaigns`                                      | GET    | List own + joined campaigns |
| `/api/campaigns/public`                               | GET    | Browse public campaigns     |
| `/api/campaigns/:id`                                  | GET    | Campaign detail             |
| `/api/campaigns/:id`                                  | PATCH  | Update campaign             |
| `/api/campaigns/:id`                                  | DELETE | Delete campaign             |
| `/api/campaigns/:id/archive`                          | POST   | Archive/unarchive campaign  |
| `/api/campaigns/:id/transfer`                         | POST   | Transfer DM role            |
| `/api/campaigns/:id/invite`                           | POST   | Invite character by ID      |
| `/api/campaigns/:id/invite-link`                      | POST   | Generate invite token       |
| `/api/campaigns/:id/members`                          | GET    | List members                |
| `/api/campaigns/:id/members/:mId`                     | PATCH  | Update member status        |
| `/api/campaigns/:id/members/:mId/notes`               | PATCH  | Update DM notes             |
| `/api/campaigns/:id/members/:mId`                     | DELETE | Remove member               |
| `/api/campaigns/invites/pending`                      | GET    | Pending invites for user    |
| `/api/campaigns/join/:token`                          | GET    | Preview campaign from token |
| `/api/campaigns/join/:token`                          | POST   | Join campaign via token     |
| `/api/campaigns/:id/characters/:cId`                  | GET    | DM view of character        |
| `/api/campaigns/:id/characters/:cId`                  | PATCH  | DM edit character           |
| `/api/campaigns/:id/characters/:cId/award-xp`         | POST   | Award XP                    |
| `/api/campaigns/:id/characters/:cId/apply-damage`     | POST   | Apply damage                |
| `/api/campaigns/:id/characters/:cId/apply-healing`    | POST   | Apply healing               |
| `/api/campaigns/:id/characters/:cId/grant-item`       | POST   | Grant item                  |
| `/api/campaigns/:id/characters/:cId/apply-condition`  | POST   | Apply condition             |
| `/api/campaigns/:id/characters/:cId/conditions/:cond` | DELETE | Remove condition            |
| `/api/campaigns/:id/bulk-action`                      | POST   | Bulk DM action              |
| `/api/campaigns/:id/sessions`                         | POST   | Create session              |
| `/api/campaigns/:id/sessions`                         | GET    | List sessions               |
| `/api/campaigns/:id/sessions/:sId`                    | PATCH  | Update session              |
| `/api/campaigns/:id/sessions/:sId/attendance`         | POST   | Update attendance           |
| `/api/campaigns/:id/events`                           | POST   | Create event                |
| `/api/campaigns/:id/events`                           | GET    | List events                 |
| `/api/campaigns/:id/events/:eId/apply`                | POST   | Apply event                 |
| `/api/campaigns/:id/compendium`                       | GET    | Search compendium           |
| `/api/campaigns/:id/compendium/:eId`                  | GET    | Get entry                   |
| `/api/campaigns/:id/compendium`                       | POST   | Create entry                |
| `/api/campaigns/:id/compendium/:eId`                  | PATCH  | Update entry                |
| `/api/campaigns/:id/compendium/:eId`                  | DELETE | Delete entry                |
| `/api/campaigns/:id/compendium/:eId/grant`            | POST   | Grant to character          |
| `/api/campaigns/:id/houserules`                       | GET    | Get house rules             |
| `/api/campaigns/:id/houserules`                       | PUT    | Update house rules          |
| `/api/campaigns/:id/audit`                            | GET    | Audit log (DM only)         |
| `/api/campaigns/:id/stream`                           | GET    | SSE event stream            |

#### SSE Event Types

| Event                 | Payload                                   | Description              |
| --------------------- | ----------------------------------------- | ------------------------ |
| `hp_updated`          | `{ characterId, currentHp, maxHp }`       | Character HP changed     |
| `condition_applied`   | `{ characterId, condition, source }`      | Condition added          |
| `condition_removed`   | `{ characterId, condition }`              | Condition removed        |
| `initiative_updated`  | `{ order: [...] }`                        | Initiative order changed |
| `turn_advanced`       | `{ currentCharacterId, round }`           | Combat turn advanced     |
| `dice_roll_broadcast` | `{ characterId, formula, result, total }` | Dice roll shared         |
| `dm_broadcast`        | `{ message, severity }`                   | DM announcement          |
| `loot_updated`        | `{ eventId, action, item }`               | Loot distributed         |
| `session_started`     | `{ sessionId, dmName }`                   | Session began            |
| `session_ended`       | `{ sessionId }`                           | Session ended            |
| `member_joined`       | `{ characterId, characterName }`          | Member joined campaign   |
| `catch_up`            | `{ hpGrid, conditions, initiativeOrder }` | State sync on reconnect  |

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
- `npm run test:campaign`
- `npm run coverage`
- `npm run build:ts`

What they cover:

- ESLint across server, scripts, and frontend modules
- Vitest coverage for store logic and frontend helper/render modules
- Campaign integration tests for all campaign routes and SSE functionality
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
