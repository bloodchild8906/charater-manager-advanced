"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dbUtils_1 = require("./dbUtils");
function main() {
    const sqliteDbPath = (0, dbUtils_1.getSqliteDbPath)();
    const db = (0, dbUtils_1.openSqliteDatabase)(sqliteDbPath);
    try {
        console.log('Verifying seed data...\n');
        // Check users
        const users = db.prepare('SELECT id, email, display_name, role FROM users').all();
        console.log(`✓ Users: ${users.length}`);
        users.forEach((user) => {
            console.log(`  - ${user.display_name} (${user.email}) [${user.role}]`);
        });
        // Check characters
        const characters = db
            .prepare('SELECT id, name, class_slug, level, owner_user_id FROM characters')
            .all();
        console.log(`\n✓ Characters: ${characters.length}`);
        characters.forEach((char) => {
            console.log(`  - ${char.name} (Level ${char.level} ${char.class_slug})`);
        });
        // Check campaigns
        const campaigns = db
            .prepare('SELECT id, name, visibility, status, dm_user_id FROM campaigns')
            .all();
        console.log(`\n✓ Campaigns: ${campaigns.length}`);
        campaigns.forEach((campaign) => {
            console.log(`  - ${campaign.name} [${campaign.visibility}, ${campaign.status}]`);
        });
        // Check campaign members
        const members = db
            .prepare(`SELECT cm.id, c.name as character_name, cm.status 
         FROM campaign_members cm 
         JOIN characters c ON cm.character_id = c.id`)
            .all();
        console.log(`\n✓ Campaign Members: ${members.length}`);
        members.forEach((member) => {
            console.log(`  - ${member.character_name} [${member.status}]`);
        });
        // Check sessions
        const sessions = db
            .prepare('SELECT id, session_number, title FROM campaign_sessions ORDER BY session_number')
            .all();
        console.log(`\n✓ Campaign Sessions: ${sessions.length}`);
        sessions.forEach((session) => {
            console.log(`  - Session ${session.session_number}: ${session.title}`);
        });
        // Check events
        const events = db
            .prepare('SELECT id, title, event_type, applied_at FROM campaign_events')
            .all();
        console.log(`\n✓ Campaign Events: ${events.length}`);
        events.forEach((event) => {
            const status = event.applied_at ? 'applied' : 'pending';
            console.log(`  - ${event.title} [${event.event_type}, ${status}]`);
        });
        // Check compendium
        const compendium = db
            .prepare('SELECT id, name, content_type, is_player_visible FROM campaign_compendium')
            .all();
        console.log(`\n✓ Campaign Compendium Entries: ${compendium.length}`);
        compendium.forEach((entry) => {
            const visibility = entry.is_player_visible ? 'player-visible' : 'DM-only';
            console.log(`  - ${entry.name} [${entry.content_type}, ${visibility}]`);
        });
        console.log('\n✅ All seed data verified successfully!');
    }
    catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
    finally {
        db.close();
    }
}
main();
