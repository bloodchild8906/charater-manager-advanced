"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCampaignMigrationsUp = runCampaignMigrationsUp;
exports.runCampaignMigrationsDown = runCampaignMigrationsDown;
const _020_campaigns_1 = require("./migrations/020_campaigns");
const _021_campaign_members_1 = require("./migrations/021_campaign_members");
const _022_campaign_invites_1 = require("./migrations/022_campaign_invites");
const _023_campaign_sessions_1 = require("./migrations/023_campaign_sessions");
const _024_campaign_events_1 = require("./migrations/024_campaign_events");
const _025_campaign_audit_log_1 = require("./migrations/025_campaign_audit_log");
const _026_campaign_compendium_1 = require("./migrations/026_campaign_compendium");
const _027_character_conditions_1 = require("./migrations/027_character_conditions");
const _020_campaigns_2 = require("./migrations/020_campaigns");
const _021_campaign_members_2 = require("./migrations/021_campaign_members");
const _022_campaign_invites_2 = require("./migrations/022_campaign_invites");
const _023_campaign_sessions_2 = require("./migrations/023_campaign_sessions");
const _024_campaign_events_2 = require("./migrations/024_campaign_events");
const _025_campaign_audit_log_2 = require("./migrations/025_campaign_audit_log");
const _026_campaign_compendium_2 = require("./migrations/026_campaign_compendium");
const _027_character_conditions_2 = require("./migrations/027_character_conditions");
const UPS = [_020_campaigns_1.up, _021_campaign_members_1.up, _022_campaign_invites_1.up, _023_campaign_sessions_1.up, _024_campaign_events_1.up, _025_campaign_audit_log_1.up, _026_campaign_compendium_1.up, _027_character_conditions_1.up];
const DOWNS = [_027_character_conditions_2.down, _026_campaign_compendium_2.down, _025_campaign_audit_log_2.down, _024_campaign_events_2.down, _023_campaign_sessions_2.down, _022_campaign_invites_2.down, _021_campaign_members_2.down, _020_campaigns_2.down];
function runCampaignMigrationsUp(db) {
    for (const step of UPS) {
        step(db);
    }
}
/** Reverse order for teardown / tests. */
function runCampaignMigrationsDown(db) {
    for (const step of DOWNS) {
        step(db);
    }
}
