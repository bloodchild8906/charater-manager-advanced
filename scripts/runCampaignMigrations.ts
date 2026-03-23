import { DatabaseSync } from 'node:sqlite';

import { up as up020 } from './migrations/020_campaigns';
import { up as up021 } from './migrations/021_campaign_members';
import { up as up022 } from './migrations/022_campaign_invites';
import { up as up023 } from './migrations/023_campaign_sessions';
import { up as up024 } from './migrations/024_campaign_events';
import { up as up025 } from './migrations/025_campaign_audit_log';
import { up as up026 } from './migrations/026_campaign_compendium';
import { up as up027 } from './migrations/027_character_conditions';

import { down as down020 } from './migrations/020_campaigns';
import { down as down021 } from './migrations/021_campaign_members';
import { down as down022 } from './migrations/022_campaign_invites';
import { down as down023 } from './migrations/023_campaign_sessions';
import { down as down024 } from './migrations/024_campaign_events';
import { down as down025 } from './migrations/025_campaign_audit_log';
import { down as down026 } from './migrations/026_campaign_compendium';
import { down as down027 } from './migrations/027_character_conditions';

const UPS = [up020, up021, up022, up023, up024, up025, up026, up027];

const DOWNS = [down027, down026, down025, down024, down023, down022, down021, down020];

export function runCampaignMigrationsUp(db: DatabaseSync): void {
  for (const step of UPS) {
    step(db);
  }
}

/** Reverse order for teardown / tests. */
export function runCampaignMigrationsDown(db: DatabaseSync): void {
  for (const step of DOWNS) {
    step(db);
  }
}
