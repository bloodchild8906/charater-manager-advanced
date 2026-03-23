import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_events (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      session_id TEXT,
      title TEXT,
      description TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      applies_to TEXT,
      distributed_to TEXT,
      distributed_at TEXT,
      created_by TEXT NOT NULL,
      applied_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES campaign_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_id ON campaign_events (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_events_session_id ON campaign_events (session_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_events_event_type ON campaign_events (event_type);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS campaign_events;`);
}
