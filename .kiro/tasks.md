# Campaign Manager — Tasks

## Implementation Plan

> Each task builds directly on the previous. No task leaves orphaned code. Run `npm test` after every top-level task before starting the next.

---

- [x] 1. Write and wire database migrations
  - [x] 1.1 Create `scripts/migrations/020_campaigns.ts` exporting `up(db)` that creates the `campaigns` table with all columns, constraints, and indexes as defined in design.md, and `down(db)` that drops it
  - [x] 1.2 Create `scripts/migrations/021_campaign_members.ts` for the `campaign_members` table with UNIQUE constraint on `(campaign_id, character_id)` and all four indexes
  - [x] 1.3 Create `scripts/migrations/022_campaign_invites.ts` for the `campaign_invites` table with unique index on `token`
  - [x] 1.4 Create `scripts/migrations/023_campaign_sessions.ts` for the `campaign_sessions` table with `attendance TEXT NOT NULL DEFAULT '[]'` and UNIQUE on `(campaign_id, session_number)`
  - [x] 1.5 Create `scripts/migrations/024_campaign_events.ts` for the `campaign_events` table including the `distributed_to` and `distributed_at` columns and all three indexes
  - [x] 1.6 Create `scripts/migrations/025_campaign_audit_log.ts` for the `campaign_audit_log` table
  - [x] 1.7 Create `scripts/migrations/026_campaign_compendium.ts` for the `campaign_compendium` table with `is_player_visible INTEGER NOT NULL DEFAULT 1`
  - [x] 1.8 Create `scripts/migrations/027_character_conditions.ts` for the `character_conditions` table referencing both `characters(id)` and `campaigns(id)`
  - [x] 1.9 Import and call all 8 migrations in order inside the existing migration runner in `scripts/seed.ts` (or equivalent entry point); verify `npm run db:refresh` completes without error and all tables exist in the SQLite output

- [x] 2. Implement `CampaignRepository` and wire to providers
  - [x] 2.1 Create `app/data/campaignRepository.js` with `createCampaign`, `getCampaignById`, `getCampaignsByDm`, `getPublicCampaigns`, `updateCampaign`, `archiveCampaign`, `deleteCampaign` using the existing provider-dispatch pattern
  - [x] 2.2 Add member methods: `inviteMember`, `getMembersByCampaign`, `getMemberByCharacter`, `updateMemberStatus`, `updateMemberNotes`, `removeMember`, `getCampaignsByCharacter` — each method must also call `writeAuditEntry` for write operations
  - [x] 2.3 Add invite token methods: `createInviteToken` using `crypto.randomBytes(32).toString('hex')`, `getInviteByToken`, `consumeInviteToken` (sets `used_at` and `used_by_user_id`, throws if already used or expired), `listInvitesByCampaign`
  - [x] 2.4 Add session methods: `createSession`, `updateSession`, `getSessionsByCampaign`, `getSessionById` — `updateSession` replaces the `attendance` JSON array atomically
  - [x] 2.5 Add event methods: `createEvent`, `getEventsByCampaign`, `applyEvent` — `applyEvent` checks `applied_at` is null before proceeding, sets it on completion, and executes the correct side-effect based on `event_type` (XP to character, HP delta to character, condition row insert, item to inventory, `distributed_to` set for loot)
  - [x] 2.6 Add compendium methods: `searchCompendium(campaignId, { type, search, tag, includeHidden })`, `getCompendiumEntry`, `createCompendiumEntry`, `updateCompendiumEntry`, `deleteCompendiumEntry`
  - [x] 2.7 Add `writeAuditEntry` and `getAuditLog` methods
  - [x] 2.8 Write unit tests in `tests/unit/campaignRepository.test.js` covering every method above using an in-memory SQLite database seeded fresh per test; all tests must pass with `npm test`

- [x] 3. Implement access control middleware
  - [x] 3.1 Create `app/middleware/campaignAccess.js` with `requireDM` that loads the campaign from the DB, attaches it to `req.campaign`, and returns `403` if `req.user.id !== campaign.dm_user_id` and role is not `admin`
  - [x] 3.2 Add `requireCampaignMember` that additionally checks for an accepted `campaign_members` row and attaches it to `req.campaignMember`
  - [x] 3.3 Add `requireCampaignCharacterAccess` that verifies the `character_id` param belongs to an accepted member of this campaign and that `req.user` is either the character owner, the DM, or an admin; attaches `req.campaignCharacter`
  - [x] 3.4 Write unit tests in `tests/unit/campaignAccess.middleware.test.ts` for all three middleware functions covering allow and deny cases; all tests must pass

- [-] 4. Implement campaign CRUD and member API routes
  - [ ] 4.1 Create `app/routes/campaigns.js` and mount it at `/api/campaigns` in `app/app.js`
  - [ ] 4.2 Implement `POST /api/campaigns`, `GET /api/campaigns`, `GET /api/campaigns/public`, `GET /api/campaigns/:id`, `PATCH /api/campaigns/:id`, `DELETE /api/campaigns/:id`, `POST /api/campaigns/:id/archive`, `POST /api/campaigns/:id/transfer` using `requireDM` where appropriate
  - [ ] 4.3 Implement member routes: `POST /api/campaigns/:id/invite`, `POST /api/campaigns/:id/invite-link`, `GET /api/campaigns/:id/members`, `PATCH /api/campaigns/:id/members/:memberId`, `PATCH /api/campaigns/:id/members/:memberId/notes`, `DELETE /api/campaigns/:id/members/:memberId`
  - [ ] 4.4 Implement invite routes: `GET /api/campaigns/invites/pending` (returns pending invites for all characters owned by `req.user`), `POST /api/campaigns/join/:token` (validates token, creates member row with status `accepted`, consumes token)
  - [ ] 4.5 Implement house rules routes: `GET /api/campaigns/:id/houserules`, `PUT /api/campaigns/:id/houserules`
  - [ ] 4.6 Implement audit log route: `GET /api/campaigns/:id/audit` (DM/admin only, paginated)
  - [ ] 4.7 Write integration tests in `tests/integration/campaigns.routes.test.ts` and `tests/integration/campaign-members.routes.test.ts` using supertest; cover the full invite → accept lifecycle; all tests must pass

- [ ] 5. Implement DM character sheet access routes
  - [ ] 5.1 Implement `GET /api/campaigns/:id/characters/:characterId` using `requireCampaignCharacterAccess`; response must omit `dm_notes` when the requester is not DM/admin
  - [ ] 5.2 Implement `PATCH /api/campaigns/:id/characters/:characterId` using `requireDM`; write a `sheet_edited` audit log entry with field-level diff (compare incoming body to current character, record previous and new values in `meta`)
  - [ ] 5.3 Implement `POST /:id/characters/:cId/award-xp`; add XP to character, check against `XP_THRESHOLDS` array, return `{ levelUpAvailable: true }` if threshold crossed
  - [ ] 5.4 Implement `POST /:id/characters/:cId/apply-damage` and `POST /:id/characters/:cId/apply-healing`; clamp `currentHp` to `[0, maxHp]`; emit `hp_updated` SSE event via `campaignEventBus`
  - [ ] 5.5 Implement `POST /:id/characters/:cId/grant-item`; add item to character inventory; create `item_granted` campaign event
  - [ ] 5.6 Implement `POST /:id/characters/:cId/apply-condition` and `DELETE /:id/characters/:cId/conditions/:condition`; insert/delete from `character_conditions`; emit `condition_applied` / `condition_removed` SSE events
  - [ ] 5.7 Implement `POST /:id/bulk-action` with body `{ action, targets, payload }` where targets is an array of characterIds or `'all'`; supported actions: `award-xp`, `apply-damage`, `apply-healing`, `apply-condition`
  - [ ] 5.8 Write integration tests in `tests/integration/campaign-dm-sheet.routes.test.ts`; verify audit entries are written, `dm_notes` is stripped from player responses, HP is clamped, and SSE events are emitted; all tests must pass

- [ ] 6. Implement session and event routes
  - [ ] 6.1 Implement `POST /api/campaigns/:id/sessions`, `GET /api/campaigns/:id/sessions`, `PATCH /api/campaigns/:id/sessions/:sessionId`, `POST /api/campaigns/:id/sessions/:sessionId/attendance` (replaces attendance array)
  - [ ] 6.2 Implement `POST /api/campaigns/:id/events`, `GET /api/campaigns/:id/events` (supports `?type=&sessionId=` filters), `POST /api/campaigns/:id/events/:eventId/apply`
  - [ ] 6.3 In the `apply` handler, call `CampaignRepository.applyEvent` which dispatches to the correct side-effect; for `loot` events with `applies_to`, set `distributed_to` and add item to the target character's inventory; emit `loot_updated` SSE event
  - [ ] 6.4 Write integration tests in `tests/integration/campaign-sessions.routes.test.ts` and `tests/integration/campaign-events.routes.test.ts`; verify `applied_at` prevents double-application and loot distribution adds to inventory; all tests must pass

- [ ] 7. Implement campaign compendium routes
  - [ ] 7.1 Implement `GET /api/campaigns/:id/compendium` with query params `type`, `search`, `tag`; filter by `is_player_visible = 1` for non-DM users
  - [ ] 7.2 Implement `GET /api/campaigns/:id/compendium/:entryId`; return `403` if player requests a DM-only entry
  - [ ] 7.3 Implement `POST /api/campaigns/:id/compendium`, `PATCH /api/campaigns/:id/compendium/:entryId`, `DELETE /api/campaigns/:id/compendium/:entryId` (DM/admin only)
  - [ ] 7.4 Implement `POST /api/campaigns/:id/compendium/:entryId/grant`; resolve the entry's data, determine type, and call the appropriate grant handler (item → inventory, spell → spells, feature → features)
  - [ ] 7.5 Write integration tests in `tests/integration/campaign-compendium.routes.test.ts`; verify DM-only entries are invisible to players, grant routes correctly modify the character sheet; all tests must pass

- [ ] 8. Implement SSE streaming endpoint and event bus
  - [ ] 8.1 Create `app/services/campaignEventBus.js` exporting a module-level `Map<campaignId, Set<res>>` with `register(campaignId, res)`, `deregister(campaignId, res)`, and `emit(campaignId, eventType, payload)` functions; `emit` serialises payload as `id: <uuid>\nevent: <eventType>\ndata: <JSON>\n\n`
  - [ ] 8.2 Create `app/routes/campaignStream.js` with `GET /api/campaigns/:id/stream`; verify membership via `requireCampaignMember`; set headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`; register connection; send heartbeat comment `:\n\n` every 30 seconds; on client disconnect deregister; send `catch_up` event immediately on connect with current HP grid and initiative state
  - [ ] 8.3 Mount the stream route in `app/app.js` at `/api/campaigns/:id/stream`
  - [ ] 8.4 Import `campaignEventBus` in the DM character routes (step 5) and emit `hp_updated`, `condition_applied`, `condition_removed` after each write
  - [ ] 8.5 Write unit tests in `tests/unit/campaignEventBus.test.ts`; mock `res` objects, verify `emit` writes correct SSE frame format to all registered connections for a campaign and does not write to other campaigns; all tests must pass

- [ ] 9. Add campaign seed data
  - [ ] 9.1 In `scripts/seed.ts`, after all existing seed steps, create a sample campaign named `"The Shattered Realm"` with `visibility: 'invite-only'` and the seeded GM user as DM
  - [ ] 9.2 Invite all seeded player characters into the campaign with status `accepted` and `joined_at` set
  - [ ] 9.3 Create 3 campaign sessions with attendance arrays referencing the seeded characters; add a session summary to each
  - [ ] 9.4 Create 4 campaign events: one `loot` (undistributed), one `xp_award` (applied), one `world_event`, one `condition_applied` (applied)
  - [ ] 9.5 Create 5 campaign compendium entries of mixed content types including at least one with `is_player_visible = 0`
  - [ ] 9.6 Run `npm run db:refresh` and verify all seed data is present without errors

- [ ] 10. Build the campaign dashboard frontend
  - [ ] 10.1 Create `app/campaign-dashboard.js`; add a `Campaigns` link to the main nav bar with a pending-invite badge counter; render the campaign list sidebar using the same pattern as the character roster sidebar
  - [ ] 10.2 Implement the Create Campaign modal wizard: step 1 (name, visibility, max players), step 2 (description, world lore, banner URL), step 3 (confirm); submit to `POST /api/campaigns`; on success select the new campaign in the sidebar
  - [ ] 10.3 Implement campaign detail tab routing: Overview, Members, Sessions, Events, Loot, Compendium, House Rules, Settings tabs; each tab is a separate module loaded on demand
  - [ ] 10.4 Implement the Overview tab: banner image, description, world lore, DM info, quick stats (session count, member count, status badge)
  - [ ] 10.5 Implement the Settings tab: edit name/description/banner/visibility form, Archive button with confirm dialog, Delete button with confirm dialog, Transfer DM role picker

- [ ] 11. Build the members tab and DM sheet mode
  - [ ] 11.1 Create `app/campaign-members.js`; render all campaign members as cards showing portrait, name, class, level, HP bar, invite status badge, and active condition pills; fetch from `GET /api/campaigns/:id/members`
  - [ ] 11.2 Add DM-only controls to each accepted member card: Open Sheet, Apply Damage, Apply Healing, Award XP (each as an inline input + confirm); wire to the corresponding DM routes
  - [ ] 11.3 Create `app/campaign-dm-sheet.js`; implement `openAsDM(characterId, campaignId)` that calls the existing sheet loader and then injects the amber DM banner and right-docked DM sidebar
  - [ ] 11.4 Implement the DM sidebar sections: DM Notes (autosaving textarea → `PATCH /api/campaigns/:id/members/:memberId/notes`), Conditions (list with remove buttons + add dropdown), Quick Actions (Award XP, Apply Damage, Apply Healing, Grant Item via compendium picker, Add Feature), Event History (last 10 events targeting this character)
  - [ ] 11.5 Implement the Enable Edit Mode toggle; on enable set all sheet inputs to enabled and swap the save handler to the DM PATCH route; on disable revert without saving

- [ ] 12. Build the sessions, events, and loot tabs
  - [ ] 12.1 Create `app/campaign-sessions.js`; render session list in descending order; implement Log New Session form (title, date, duration, summary, character attendance multi-select); wire to `POST /api/campaigns/:id/sessions` and the attendance endpoint
  - [ ] 12.2 Create `app/campaign-events.js`; render event timeline grouped by session; implement Log Event form with `event_type` dropdown that shows the correct payload fields per type; wire to `POST /api/campaigns/:id/events`
  - [ ] 12.3 Implement the loot chest view inside `campaign-events.js` as a filtered view of `event_type = 'loot'` events where `distributed_to` is null; add Distribute button per item opening a character picker; wire to `POST /api/campaigns/:id/events/:eventId/apply` with a target character
  - [ ] 12.4 Implement Apply Event button on pending events that calls `POST /api/campaigns/:id/events/:eventId/apply`; after apply, update the event card to show the applied badge

- [ ] 13. Build the campaign compendium tab
  - [ ] 13.1 Create `app/campaign-compendium-tab.js`; render the content type filter pills, search input, tag filter, and DM-only toggle; fetch from `GET /api/campaigns/:id/compendium` on filter change
  - [ ] 13.2 Implement the Create Entry modal with a `content_type` dropdown that shows the correct dynamic field group per type (matching the data payload shapes in design.md); wire to `POST /api/campaigns/:id/compendium`
  - [ ] 13.3 Implement the entry detail pane with Edit and Grant to Character buttons; Edit opens a pre-filled version of the Create Entry modal; Grant opens a character picker then calls `POST /api/campaigns/:id/compendium/:entryId/grant`
  - [ ] 13.4 Extend the existing compendium window (`compendium.js`) to inject campaign entries alongside SRD results when `activeCampaignId` is set; tag campaign entries with a badge; add `Add to Campaign` button on SRD entry detail panes (DM only) that clones the entry to `campaign_compendium`

- [ ] 14. Build the initiative tracker and HP grid panels
  - [ ] 14.1 Create `app/campaign-initiative.js`; render as a floating panel; pre-populate from `GET /api/campaigns/:id/members`; implement Roll for All (d20 + initiative modifier per character); implement drag-to-reorder; emit `initiative_updated` via `POST /api/campaigns/:id/stream` payload through the DM broadcast route; implement Next Turn and End Combat
  - [ ] 14.2 Create `app/campaign-hp-grid.js`; render all accepted members in a compact grid with HP bar and condition icons; implement inline `+` and `-` HP controls that call the DM apply-damage/healing routes; subscribe to `hp_updated` and `condition_applied` / `condition_removed` SSE events to update without reload
  - [ ] 14.3 Create `app/campaign-conditions.js` with a shared `addCondition(characterId, condition)` and `removeCondition(characterId, condition)` that call the correct DM routes; import and use this module from `campaign-members.js`, `campaign-dm-sheet.js`, and `campaign-hp-grid.js`

- [ ] 15. Build the invite notification and join flow
  - [ ] 15.1 Create `app/campaign-invites.js`; on app load fetch `GET /api/campaigns/invites/pending` and update the badge count on the Campaigns nav link
  - [ ] 15.2 Render pending invite cards with campaign name, DM name, description, member count; implement Accept button that opens a character picker showing the user's characters then calls `PATCH /api/campaigns/:id/members/:memberId` with status `accepted`; implement Decline button
  - [ ] 15.3 Implement the `/join/:token` client-side route; fetch the campaign preview via `GET /api/campaigns/join/:token`; if unauthenticated redirect to login then redirect back; if authenticated show the campaign card and character picker then call `POST /api/campaigns/join/:token`

- [ ] 16. Implement the SSE client listener
  - [ ] 16.1 Create `app/campaign-stream.js` exporting `CampaignStream` with `connect(campaignId)`, `disconnect()`, `on(eventType, handler)`, `off(eventType, handler)`; connect opens an `EventSource` to `/api/campaigns/:id/stream`
  - [ ] 16.2 Implement auto-reconnect with exponential backoff starting at 1 second, doubling to a maximum of 30 seconds
  - [ ] 16.3 On `catch_up` event, dispatch HP and condition data to `campaign-hp-grid.js` and `campaign-conditions.js` to restore state
  - [ ] 16.4 Wire `hp_updated` to update HP bars in `campaign-members.js` and `campaign-hp-grid.js`; wire `condition_applied` / `condition_removed` to update condition pills; wire `initiative_updated` to `campaign-initiative.js`; wire `dm_broadcast` to display a toast notification

- [ ] 17. Final integration, CI update, and README
  - [ ] 17.1 Add `"test:campaign": "vitest run tests/integration/campaign*"` to `package.json`
  - [ ] 17.2 Add a campaign integration test step to `.github/workflows/deploy-app-service.yml` after the existing test step (run `npm run test:campaign`)
  - [ ] 17.3 Extend the `/stats` route to include campaign, member, and session counts from `CampaignRepository`
  - [ ] 17.4 Run the full test suite (`npm test` and `npm run test:campaign`) and confirm all tests pass
  - [ ] 17.5 Update `README.md` with: Campaign Manager feature section, all new API routes in a reference table, SSE event types, invite link URL format, and new npm scripts
