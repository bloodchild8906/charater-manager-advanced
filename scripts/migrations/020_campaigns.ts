import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      world_lore TEXT,
      banner_url TEXT,
      dm_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      visibility TEXT NOT NULL,
      house_rules TEXT,
      session_count INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER NOT NULL DEFAULT 6,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (dm_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_dm_user_id ON campaigns (dm_user_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_visibility ON campaigns (visibility);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
  `);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS campaigns;`);
}
