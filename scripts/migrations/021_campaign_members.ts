import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_members (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invited_by_user_id TEXT,
      status TEXT NOT NULL,
      player_notes TEXT,
      dm_notes TEXT,
      joined_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (campaign_id, character_id)
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign_id ON campaign_members (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_members_character_id ON campaign_members (character_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON campaign_members (user_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_members_status ON campaign_members (status);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS campaign_members;`);
}
