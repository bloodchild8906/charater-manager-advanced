"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
function up(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS character_conditions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      condition_name TEXT NOT NULL,
      source TEXT,
      applied_by TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (applied_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_character_conditions_character_id ON character_conditions (character_id);
    CREATE INDEX IF NOT EXISTS idx_character_conditions_campaign_id ON character_conditions (campaign_id);
  `);
}
function down(db) {
    db.exec(`DROP TABLE IF EXISTS character_conditions;`);
}
