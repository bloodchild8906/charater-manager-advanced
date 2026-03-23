"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAppData = seedAppData;
const crypto_1 = require("crypto");
/**
 * Seed app-level data (users, characters, campaigns) for development and testing.
 * This runs after the normalized SRD data and campaign migrations are complete.
 */
function stableUuid(value) {
    const hash = (0, crypto_1.createHash)('sha1').update(value).digest('hex').slice(0, 32);
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        hash.slice(12, 16),
        hash.slice(16, 20),
        hash.slice(20, 32),
    ].join('-');
}
function nowIso() {
    return new Date().toISOString();
}
function hashPassword(password, salt) {
    return (0, crypto_1.createHash)('sha256').update(password + salt).digest('hex');
}
function seedAppData(db) {
    const now = nowIso();
    // Create test users
    const gmUserId = stableUuid('user:gm');
    const gmSalt = (0, crypto_1.randomBytes)(16).toString('hex');
    const gmPasswordHash = hashPassword('password123', gmSalt);
    const player1UserId = stableUuid('user:player1');
    const player1Salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const player1PasswordHash = hashPassword('password123', player1Salt);
    const player2UserId = stableUuid('user:player2');
    const player2Salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const player2PasswordHash = hashPassword('password123', player2Salt);
    const player3UserId = stableUuid('user:player3');
    const player3Salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const player3PasswordHash = hashPassword('password123', player3Salt);
    // Insert users
    const insertUser = db.prepare(`INSERT INTO users (id, email, display_name, password_hash, password_salt, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insertUser.run(gmUserId, 'gm@example.com', 'Game Master', gmPasswordHash, gmSalt, 'gm', now, now);
    insertUser.run(player1UserId, 'player1@example.com', 'Player One', player1PasswordHash, player1Salt, 'player', now, now);
    insertUser.run(player2UserId, 'player2@example.com', 'Player Two', player2PasswordHash, player2Salt, 'player', now, now);
    insertUser.run(player3UserId, 'player3@example.com', 'Player Three', player3PasswordHash, player3Salt, 'player', now, now);
    // Create test characters
    const char1Id = stableUuid('character:theron');
    const char2Id = stableUuid('character:lyra');
    const char3Id = stableUuid('character:grimm');
    const insertCharacter = db.prepare(`INSERT INTO characters (id, owner_user_id, name, edition, ancestry_slug, class_slug, background_slug, level, data_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertCharacter.run(char1Id, player1UserId, 'Theron Brightblade', '2014', 'human', 'fighter', 'soldier', 5, JSON.stringify({
        name: 'Theron Brightblade',
        level: 5,
        experience: 6500,
        currentHp: 42,
        maxHp: 42,
        abilities: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        inventory: [],
        spells: [],
        features: [],
    }), now, now);
    insertCharacter.run(char2Id, player2UserId, 'Lyra Moonshadow', '2014', 'elf', 'wizard', 'sage', 5, JSON.stringify({
        name: 'Lyra Moonshadow',
        level: 5,
        experience: 6500,
        currentHp: 28,
        maxHp: 28,
        abilities: { str: 8, dex: 14, con: 13, int: 18, wis: 14, cha: 10 },
        inventory: [],
        spells: [],
        features: [],
    }), now, now);
    insertCharacter.run(char3Id, player3UserId, 'Grimm Ironforge', '2014', 'dwarf', 'cleric', 'acolyte', 5, JSON.stringify({
        name: 'Grimm Ironforge',
        level: 5,
        experience: 6500,
        currentHp: 38,
        maxHp: 38,
        abilities: { str: 14, dex: 10, con: 16, int: 12, wis: 17, cha: 11 },
        inventory: [],
        spells: [],
        features: [],
    }), now, now);
    console.log('Seeded 4 users and 3 characters.');
    // Create campaign
    const campaignId = stableUuid('campaign:shattered-realm');
    db.prepare(`INSERT INTO campaigns (id, name, description, world_lore, banner_url, dm_user_id, status, visibility, house_rules, session_count, max_players, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(campaignId, 'The Shattered Realm', 'A dark fantasy campaign set in a world torn apart by ancient magic.', 'Long ago, the Archmages of the Seven Towers attempted to reshape reality itself. Their hubris shattered the world into floating islands, each with its own twisted laws of nature. Now, centuries later, brave adventurers seek to reunite the fragments and restore balance.', null, gmUserId, 'active', 'invite-only', null, 3, 6, now, now);
    // Add campaign members
    const member1Id = stableUuid('member:theron');
    const member2Id = stableUuid('member:lyra');
    const member3Id = stableUuid('member:grimm');
    const insertMember = db.prepare(`INSERT INTO campaign_members (id, campaign_id, character_id, user_id, invited_by_user_id, status, player_notes, dm_notes, joined_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertMember.run(member1Id, campaignId, char1Id, player1UserId, gmUserId, 'accepted', null, 'Natural leader, tends to charge in first', now, now, now);
    insertMember.run(member2Id, campaignId, char2Id, player2UserId, gmUserId, 'accepted', null, 'Curious about ancient magic, may be key to the plot', now, now, now);
    insertMember.run(member3Id, campaignId, char3Id, player3UserId, gmUserId, 'accepted', null, 'Seeking redemption for a past failure', now, now, now);
    console.log('Created campaign "The Shattered Realm" with 3 members.');
    // Create campaign sessions
    const session1Id = stableUuid('session:1');
    const session2Id = stableUuid('session:2');
    const session3Id = stableUuid('session:3');
    const insertSession = db.prepare(`INSERT INTO campaign_sessions (id, campaign_id, session_number, title, summary, session_date, duration_mins, attendance, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertSession.run(session1Id, campaignId, 1, 'The Floating Citadel', 'The party arrived at the Floating Citadel of Aethermoor and discovered the first fragment of the Sundering Stone. They fought through corrupted guardians and learned of the Seven Towers conspiracy.', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
    240, JSON.stringify([char1Id, char2Id, char3Id]), gmUserId, now, now);
    insertSession.run(session2Id, campaignId, 2, 'Shadows in the Deep', 'Descending into the Underdark beneath the citadel, the party encountered a cult worshipping the Void Between Worlds. They rescued a captured scholar who revealed the location of the second fragment.', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    210, JSON.stringify([char1Id, char2Id, char3Id]), gmUserId, now, now);
    insertSession.run(session3Id, campaignId, 3, 'The Crimson Wastes', 'The party traveled to the Crimson Wastes, a desert island where time flows strangely. They battled sand wraiths and discovered an ancient temple containing the second fragment, but triggered a trap that alerted the enemy.', new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    180, JSON.stringify([char1Id, char2Id]), gmUserId, now, now);
    console.log('Created 3 campaign sessions.');
    // Create campaign events
    const lootEventId = stableUuid('event:loot-sword');
    const xpEventId = stableUuid('event:xp-session3');
    const worldEventId = stableUuid('event:world-alert');
    const conditionEventId = stableUuid('event:condition-exhaustion');
    const insertEvent = db.prepare(`INSERT INTO campaign_events (id, campaign_id, session_id, title, description, event_type, payload, applies_to, distributed_to, distributed_at, created_by, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // Loot event (undistributed)
    insertEvent.run(lootEventId, campaignId, session3Id, 'Sunblade Longsword', 'A magical longsword found in the temple treasury', 'loot', JSON.stringify({
        name: 'Sunblade',
        type: 'weapon',
        rarity: 'rare',
        description: 'This longsword glows with radiant energy. +2 to attack and damage rolls.',
        properties: { damage: '1d8+2 slashing', magical: true },
    }), null, null, null, gmUserId, null, now);
    // XP award (applied)
    insertEvent.run(xpEventId, campaignId, session3Id, 'Session 3 XP Award', 'Experience points for completing the Crimson Wastes quest', 'xp_award', JSON.stringify({ amount: 1200 }), JSON.stringify([char1Id, char2Id]), null, null, gmUserId, now, now);
    // World event
    insertEvent.run(worldEventId, campaignId, session3Id, 'The Enemy Awakens', 'The trap triggered in the temple has alerted the Shadow Council to the party\'s progress. Dark agents are now hunting them.', 'world_event', JSON.stringify({ severity: 'high', consequences: 'Increased enemy encounters' }), null, null, null, gmUserId, null, now);
    // Condition applied (applied)
    insertEvent.run(conditionEventId, campaignId, session3Id, 'Desert Exhaustion', 'The harsh conditions of the Crimson Wastes have taken their toll', 'condition_applied', JSON.stringify({ condition: 'exhaustion', level: 1 }), JSON.stringify([char1Id, char2Id]), null, null, gmUserId, now, now);
    console.log('Created 4 campaign events (1 loot, 1 xp_award, 1 world_event, 1 condition_applied).');
    // Create campaign compendium entries
    const compendium1Id = stableUuid('compendium:void-cult');
    const compendium2Id = stableUuid('compendium:sundering-stone');
    const compendium3Id = stableUuid('compendium:shadow-council');
    const compendium4Id = stableUuid('compendium:aethermoor');
    const compendium5Id = stableUuid('compendium:void-bolt');
    const insertCompendium = db.prepare(`INSERT INTO campaign_compendium (id, campaign_id, content_type, name, description, data, tags, is_player_visible, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // Faction (player visible)
    insertCompendium.run(compendium1Id, campaignId, 'faction', 'Cult of the Void', 'A mysterious cult that worships the darkness between worlds', JSON.stringify({
        alignment: 'Chaotic Evil',
        goals: 'Prevent the reunification of the Shattered Realm',
        members: 'Corrupted mages, void-touched creatures',
        headquarters: 'The Underdark beneath Aethermoor',
    }), JSON.stringify(['enemy', 'cult', 'void']), 1, gmUserId, now, now);
    // Item (player visible)
    insertCompendium.run(compendium2Id, campaignId, 'item', 'Fragment of the Sundering Stone', 'A crystalline shard that pulses with reality-warping energy', JSON.stringify({
        type: 'quest_item',
        rarity: 'artifact',
        properties: {
            magical: true,
            attunement: false,
            description: 'One of seven fragments needed to restore the Shattered Realm',
        },
    }), JSON.stringify(['artifact', 'quest', 'magical']), 1, gmUserId, now, now);
    // Faction (DM only)
    insertCompendium.run(compendium3Id, campaignId, 'faction', 'The Shadow Council', 'Secret organization manipulating events behind the scenes', JSON.stringify({
        alignment: 'Lawful Evil',
        goals: 'Maintain the Shattered Realm to preserve their power',
        members: 'Corrupt nobles, dark mages, ancient liches',
        headquarters: 'Unknown',
        secrets: 'They were the original Archmages who caused the Sundering',
    }), JSON.stringify(['enemy', 'secret', 'bbeg']), 0, gmUserId, now, now);
    // Location (player visible)
    insertCompendium.run(compendium4Id, campaignId, 'location', 'Aethermoor Citadel', 'A massive fortress floating in the sky, home to ancient guardians', JSON.stringify({
        region: 'The Skylands',
        population: 'Abandoned (formerly 10,000)',
        features: 'Floating architecture, magical wards, corrupted guardians',
        history: 'Once the seat of power for the Archmage of Air',
    }), JSON.stringify(['location', 'dungeon', 'skylands']), 1, gmUserId, now, now);
    // Spell (player visible)
    insertCompendium.run(compendium5Id, campaignId, 'spell', 'Void Bolt', 'A spell developed by the Cult of the Void', JSON.stringify({
        level: 2,
        school: 'Evocation',
        casting_time: '1 action',
        range: '120 feet',
        components: 'V, S',
        duration: 'Instantaneous',
        description: 'You hurl a bolt of void energy at a creature within range. Make a ranged spell attack. On a hit, the target takes 3d10 necrotic damage and must succeed on a Wisdom saving throw or be frightened until the end of your next turn.',
        higher_levels: 'When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d10 for each slot level above 2nd.',
    }), JSON.stringify(['spell', 'necrotic', 'void']), 1, gmUserId, now, now);
    console.log('Created 5 campaign compendium entries (1 DM-only).');
    console.log('App data seeding completed successfully.');
}
