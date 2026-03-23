"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
function up(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_sessions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      session_number INTEGER NOT NULL,
      title TEXT,
      summary TEXT,
      session_date TEXT,
      duration_mins INTEGER,
      attendance TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (campaign_id, session_number)
    );

    CREATE INDEX IF NOT EXISTS idx_campaign_sessions_campaign_id ON campaign_sessions (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_sessions_session_date ON campaign_sessions (session_date);
  `);
}
function down(db) {
    db.exec(`DROP TABLE IF EXISTS campaign_sessions;`);
}
