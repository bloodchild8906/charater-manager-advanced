# Campaign Manager — Requirements

## Introduction

Add a Campaign Manager feature to the 5e Database Character Manager. A user with the `gm` or `admin` role creates a campaign and becomes its Dungeon Master (DM). The DM invites player-owned character sheets into the campaign. The DM has full read/write access to every accepted member's sheet within the campaign scope. Players retain normal access to their own characters outside the campaign context.

The feature includes: campaign CRUD, an invitation system with shareable token links, DM sheet access with audit trail, per-character DM private notes, a session log, an in-world event system, a party loot chest (via events), a GM-authored campaign compendium (items, weapons, spells, features, monsters, NPCs, locations, lore, factions), an initiative tracker, an HP grid, a condition tracker, real-time SSE sync during live sessions, and bulk DM actions.

---

## Requirements

### Requirement 1 — Campaign Creation and Management

**User Story:** As a GM, I want to create and manage campaigns, so that I can organise my game sessions and players under a named campaign with its own settings and content.

#### Acceptance Criteria

1. WHEN a `gm` or `admin` user submits a valid campaign name THEN the system SHALL create a campaign record with that user as its DM and status `active`.
2. WHEN a campaign is created THEN the system SHALL accept optional fields: description, world lore, banner URL, visibility (`private`, `invite-only`, `public`), and max players (default 6).
3. WHEN the DM updates a campaign THEN the system SHALL persist the changes and update `updated_at`.
4. WHEN the DM archives a campaign THEN the system SHALL set status to `archived` and prevent new members from joining.
5. WHEN the DM deletes a campaign THEN the system SHALL cascade-delete all members, invites, sessions, events, compendium entries, and audit log rows for that campaign.
6. WHEN a `player` user attempts to create a campaign THEN the system SHALL return a `403` error.
7. WHEN any authenticated user requests public campaigns THEN the system SHALL return all campaigns with visibility `public` regardless of membership.

---

### Requirement 2 — Campaign Invitation System

**User Story:** As a DM, I want to invite player characters into my campaign and manage membership, so that I control who participates in my game.

#### Acceptance Criteria

1. WHEN the DM invites a character by ID THEN the system SHALL create a `campaign_members` row with status `pending` for that character.
2. WHEN the DM generates an invite link THEN the system SHALL create a unique token with an optional expiry and return a join URL of the form `/join/:token`.
3. WHEN a player navigates to a valid, unexpired join URL THEN the system SHALL display the campaign preview and prompt character selection.
4. WHEN a player accepts an invite THEN the system SHALL set member status to `accepted`, record `joined_at`, and write an audit log entry.
5. WHEN a player declines an invite THEN the system SHALL set member status to `declined`.
6. WHEN the DM removes a member THEN the system SHALL set member status to `removed`; the character record SHALL remain intact.
7. WHEN a player attempts to join an archived campaign via token THEN the system SHALL return an error and SHALL NOT create a member record.
8. WHEN a token has expired THEN the system SHALL return an error and SHALL NOT allow joining.
9. WHEN a player has pending invites THEN the system SHALL display a notification badge on the Campaigns nav item.

---

### Requirement 3 — DM Sheet Access

**User Story:** As a DM, I want to view and optionally edit any accepted member's character sheet within my campaign, so that I can manage character state during and between sessions.

#### Acceptance Criteria

1. WHEN the DM opens a member's sheet THEN the system SHALL render the full character sheet with all tabs in read-only DM mode with a visible DM banner.
2. WHEN the DM enables edit mode THEN the system SHALL unlock all sheet fields for editing.
3. WHEN the DM saves an edited sheet THEN the system SHALL persist the changes and write an audit log entry with field-level diff (previous and new values).
4. WHEN a player views their own sheet THEN the system SHALL NOT expose DM notes or DM-only audit entries to the player.
5. WHEN the DM applies damage or healing to a character THEN the system SHALL update `currentHp` and write a campaign event and audit entry.
6. WHEN the DM awards XP that crosses a level threshold THEN the system SHALL return `{ levelUpAvailable: true }` in the response.
7. WHEN the DM applies a condition THEN the system SHALL store it in `character_conditions` and broadcast the change via SSE.
8. WHEN the DM grants an item THEN the system SHALL add it to the character's inventory and log a `item_granted` campaign event.

---

### Requirement 4 — DM Private Notes Per Character

**User Story:** As a DM, I want to write private notes against each player's character, so that I can track secrets, plot hooks, and observations that players should not see.

#### Acceptance Criteria

1. WHEN the DM writes or updates notes in the `dm_notes` field on a `campaign_members` row THEN the system SHALL persist them.
2. WHEN any API route returns member data to a non-DM user THEN the system SHALL omit the `dm_notes` field from the response.
3. WHEN the DM views a member's sheet THEN the DM sidebar SHALL display the DM notes for that member in an editable textarea.

---

### Requirement 5 — Session Logging

**User Story:** As a DM, I want to log game sessions with attendance and summaries, so that the campaign has a persistent record of play history.

#### Acceptance Criteria

1. WHEN the DM creates a session THEN the system SHALL accept title, session date, duration, summary, and an array of attending character IDs stored as a JSON column.
2. WHEN the DM updates attendance THEN the system SHALL replace the `attendance` array on the session row.
3. WHEN any campaign member requests sessions THEN the system SHALL return all sessions for that campaign in descending session-number order.
4. WHEN a session is deleted THEN the system SHALL set `session_id` to null on any events referencing it (ON DELETE SET NULL) rather than deleting those events.

---

### Requirement 6 — Campaign Event System and Loot

**User Story:** As a DM, I want to log in-world events including loot drops and apply their effects to characters, so that the campaign history reflects what happened and character sheets stay up to date.

#### Acceptance Criteria

1. WHEN the DM creates a `loot` event THEN the system SHALL store the item payload in `campaign_events` with `distributed_to` null, representing an item in the party chest.
2. WHEN the DM distributes a loot item to a character THEN the system SHALL set `distributed_to` and `distributed_at` on the event row and add the item to that character's inventory.
3. WHEN the DM creates an `xp_award` event and applies it THEN the system SHALL add the XP amount to each targeted character's `experience` field.
4. WHEN the DM creates a `damage` event and applies it THEN the system SHALL subtract the amount from each targeted character's `currentHp`.
5. WHEN the DM creates a `condition_applied` event and applies it THEN the system SHALL insert a row into `character_conditions` for each targeted character.
6. WHEN an event is applied THEN the system SHALL set `applied_at` to the current timestamp and SHALL NOT apply it a second time.
7. WHEN `applies_to` is null on an event THEN applying it SHALL target all accepted members of the campaign.

---

### Requirement 7 — Campaign Compendium

**User Story:** As a DM, I want to create custom items, weapons, spells, features, monsters, NPCs, locations, lore, and factions scoped to my campaign, so that homebrew content appears in the compendium for this campaign only and cannot bleed into other campaigns.

#### Acceptance Criteria

1. WHEN the DM creates a compendium entry THEN the system SHALL store it in `campaign_compendium` with the campaign ID, content type, and data payload.
2. WHEN a player searches the compendium while inside a campaign THEN the system SHALL return matching global SRD results AND matching `campaign_compendium` entries for that campaign where `is_player_visible = 1`.
3. WHEN `is_player_visible = 0` on a compendium entry THEN the system SHALL return that entry only to the DM or admin.
4. WHEN the DM toggles `is_player_visible` THEN the system SHALL update the flag immediately.
5. WHEN a player drag-drops a campaign compendium item onto their sheet THEN the system SHALL route it identically to an SRD item (inventory, spells, or features).
6. WHEN the DM clones an SRD entry into the campaign compendium THEN the system SHALL create a new `campaign_compendium` row with the SRD data as the initial payload.
7. WHEN the DM deletes a campaign compendium entry THEN the system SHALL delete the row; previously granted items on character sheets SHALL be unaffected.

---

### Requirement 8 — Initiative Tracker

**User Story:** As a DM, I want an initiative tracker for all campaign members and NPCs, so that I can manage turn order during combat.

#### Acceptance Criteria

1. WHEN the DM opens the initiative tracker THEN the system SHALL pre-populate it with all accepted campaign members using each character's initiative modifier.
2. WHEN the DM clicks Roll for All THEN the system SHALL fill each row with a d20 roll plus the character's initiative modifier.
3. WHEN the DM reorders rows THEN the tracker SHALL reflect the new order and broadcast it via SSE to all connected clients.
4. WHEN the DM clicks Next Turn THEN the system SHALL advance the highlighted row and broadcast a `turn_advanced` SSE event.
5. WHEN the DM adds an NPC row THEN the system SHALL accept a name and HP value; NPC rows SHALL be session-only (not persisted to the database).
6. WHEN the DM ends combat THEN the system SHALL close the tracker and broadcast a session state update.

---

### Requirement 9 — HP Grid and Condition Tracker

**User Story:** As a DM, I want a compact HP and condition overview for all party members, so that I can monitor the party's state at a glance and act quickly.

#### Acceptance Criteria

1. WHEN the DM opens the HP grid THEN the system SHALL display all accepted members with their current HP, max HP, an HP bar, and active condition icons.
2. WHEN the DM uses the HP grid inline controls THEN the system SHALL apply damage or healing to the selected character, update their sheet, and broadcast via SSE.
3. WHEN a condition is applied to a character THEN the system SHALL display it as a pill badge on the member card and in the HP grid.
4. WHEN a condition is removed THEN the system SHALL remove the badge and broadcast via SSE.

---

### Requirement 10 — Real-Time SSE Sync

**User Story:** As a DM or player, I want changes made during a live session to appear on all connected clients without a page refresh, so that combat and sheet updates are immediately visible to everyone.

#### Acceptance Criteria

1. WHEN a client connects to `/api/campaigns/:id/stream` THEN the system SHALL keep the SSE connection open and send a heartbeat every 30 seconds.
2. WHEN HP is updated on any member's sheet THEN the system SHALL broadcast an `hp_updated` event to all campaign connections within 500 ms.
3. WHEN a condition is applied or removed THEN the system SHALL broadcast a `condition_applied` or `condition_removed` event.
4. WHEN the initiative order changes THEN the system SHALL broadcast an `initiative_updated` event with the full new order.
5. WHEN the DM broadcasts a message THEN the system SHALL send a `dm_broadcast` event to all connected clients.
6. WHEN an SSE client disconnects and reconnects THEN the system SHALL re-send the current initiative state and party HP state as catch-up events.
7. WHEN the server restarts THEN reconnecting clients SHALL receive current state within two reconnect cycles.

---

### Requirement 11 — Audit Log

**User Story:** As a DM or admin, I want a full audit trail of all DM actions in a campaign, so that I can review what was changed, when, and by whom.

#### Acceptance Criteria

1. WHEN any DM action modifies a character sheet, member status, or campaign record THEN the system SHALL write a row to `campaign_audit_log` with actor, action, target, and meta.
2. WHEN the DM requests the audit log THEN the system SHALL return entries in descending created-at order with pagination.
3. WHEN a player requests the audit log THEN the system SHALL return `403`.
