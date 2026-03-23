import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_compendium (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      data TEXT,
      tags TEXT,
      is_player_visible INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_compendium_campaign_id ON campaign_compendium (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_compendium_content_type ON campaign_compendium (content_type);
    CREATE INDEX IF NOT EXISTS idx_campaign_compendium_name ON campaign_compendium (name);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS campaign_compendium;`);
}
