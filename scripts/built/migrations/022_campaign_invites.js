"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
function up(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_invites (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      token TEXT NOT NULL,
      created_by TEXT NOT NULL,
      target_email TEXT,
      character_id TEXT,
      expires_at TEXT,
      used_at TEXT,
      used_by_user_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_invites_token ON campaign_invites (token);
    CREATE INDEX IF NOT EXISTS idx_campaign_invites_campaign_id ON campaign_invites (campaign_id);
  `);
}
function down(db) {
    db.exec(`DROP TABLE IF EXISTS campaign_invites;`);
}
