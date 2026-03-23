import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_audit_log (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      meta TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_audit_log_campaign_id ON campaign_audit_log (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_audit_log_actor_user_id ON campaign_audit_log (actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_audit_log_created_at ON campaign_audit_log (created_at);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS campaign_audit_log;`);
}
