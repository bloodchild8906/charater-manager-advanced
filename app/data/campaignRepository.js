const crypto = require('node:crypto');
const {
  DATABASE_PROVIDERS,
  getAzurePool,
  getMongoDb,
  getProvider,
  withSqlite,
} = require('../database');
const store = require('../store');
const azureCampaign = require('./campaignRepository.azure');

/** Cumulative XP totals to reach character levels 1–20 (D&D 5e). Index i = minimum XP to be level i + 1. */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000,
  225000, 265000, 305000, 355000,
];

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function xpToLevel(totalXp) {
  const xp = Number(totalXp) || 0;
  let level = 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(Math.max(level, 1), 20);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapCampaignRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    worldLore: row.world_lore,
    bannerUrl: row.banner_url,
    dmUserId: row.dm_user_id,
    status: row.status,
    visibility: row.visibility,
    houseRules: row.house_rules,
    sessionCount: Number(row.session_count ?? 0),
    maxPlayers: Number(row.max_players ?? 6),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMemberRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    characterId: row.character_id,
    userId: row.user_id,
    invitedByUserId: row.invited_by_user_id,
    status: row.status,
    playerNotes: row.player_notes,
    dmNotes: row.dm_notes,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInviteRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    token: row.token,
    createdBy: row.created_by,
    targetEmail: row.target_email,
    characterId: row.character_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedByUserId: row.used_by_user_id,
    createdAt: row.created_at,
  };
}

function mapSessionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionNumber: Number(row.session_number),
    title: row.title,
    summary: row.summary,
    sessionDate: row.session_date,
    durationMins: row.duration_mins != null ? Number(row.duration_mins) : null,
    attendance: parseJson(row.attendance, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    payload: parseJson(row.payload, {}),
    appliesTo: row.applies_to,
    distributedTo: row.distributed_to,
    distributedAt: row.distributed_at,
    createdBy: row.created_by,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
  };
}

function mapCompendiumRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    contentType: row.content_type,
    name: row.name,
    description: row.description,
    data: parseJson(row.data, {}),
    tags: parseJson(row.tags, []),
    isPlayerVisible: row.is_player_visible === 1 || row.is_player_visible === true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    meta: parseJson(row.meta, {}),
    createdAt: row.created_at,
  };
}

async function ensureMongoCampaignIndexes() {
  const db = await getMongoDb();
  await Promise.all([
    db.collection('campaigns').createIndex({ dm_user_id: 1 }),
    db.collection('campaigns').createIndex({ visibility: 1, status: 1 }),
    db.collection('campaign_members').createIndex({ campaign_id: 1 }),
    db.collection('campaign_members').createIndex({ character_id: 1 }),
    db.collection('campaign_members').createIndex({ user_id: 1 }),
    db.collection('campaign_invites').createIndex({ token: 1 }, { unique: true }),
    db.collection('campaign_invites').createIndex({ campaign_id: 1 }),
    db.collection('campaign_sessions').createIndex({ campaign_id: 1, session_number: 1 }, { unique: true }),
    db.collection('campaign_events').createIndex({ campaign_id: 1 }),
    db.collection('campaign_audit_log').createIndex({ campaign_id: 1, created_at: -1 }),
    db.collection('campaign_compendium').createIndex({ campaign_id: 1 }),
    db.collection('character_conditions').createIndex({ character_id: 1 }),
    db.collection('character_conditions').createIndex({ campaign_id: 1 }),
  ]);
}

let mongoIndexesPromise = null;

async function ensureMongoReady() {
  await store.ensureAppStorage();
  if (!mongoIndexesPromise) {
    mongoIndexesPromise = ensureMongoCampaignIndexes().catch((error) => {
      mongoIndexesPromise = null;
      throw error;
    });
  }

  return mongoIndexesPromise;
}

// --- SQLite helpers ---

function resolveTargetCharacterIdsSqlite(db, campaignId, appliesToJson) {
  const parsed = appliesToJson ? parseJson(appliesToJson, null) : null;
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.filter((id) => typeof id === 'string');
  }

  const rows = db
    .prepare(`SELECT character_id FROM campaign_members WHERE campaign_id = ? AND status = 'accepted'`)
    .all(campaignId);
  return rows.map((r) => r.character_id);
}

function readCharacterDataJson(db, characterId) {
  const row = db.prepare('SELECT data_json FROM characters WHERE id = ?').get(characterId);
  if (!row) {
    throw new Error(`Character not found: ${characterId}`);
  }

  return parseJson(row.data_json, {});
}

function writeCharacterDataJson(db, characterId, data) {
  const updatedAt = nowIso();
  db.prepare('UPDATE characters SET data_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(data),
    updatedAt,
    characterId,
  );
}

function defaultInventoryItem(payloadItem) {
  return {
    name: String(payloadItem?.name || 'Item'),
    quantity: Number(payloadItem?.quantity || 1),
    equipped: Boolean(payloadItem?.equipped),
    attunementRequired: Boolean(payloadItem?.attunementRequired),
    attuned: Boolean(payloadItem?.attuned),
    source: String(payloadItem?.source || ''),
    description: String(payloadItem?.description || ''),
    notes: String(payloadItem?.notes || ''),
    compendiumType: payloadItem?.compendiumType || 'items',
    slug: payloadItem?.slug || '',
    code: payloadItem?.code || '',
    tags: payloadItem?.tags ?? null,
    profile: payloadItem?.profile ?? null,
    properties: payloadItem?.properties ?? null,
    providesAmmoType: payloadItem?.providesAmmoType || '',
    resource: payloadItem?.resource || { label: '', current: null, max: null, recharge: '' },
    grantedSpells: Array.isArray(payloadItem?.grantedSpells) ? payloadItem.grantedSpells : [],
  };
}

function applyEventSqlite(campaignId, eventId, options) {
  const distributeToCharacterId = options?.distributeToCharacterId || null;
  const appliedByUserId = options?.actorUserId || null;

  return withSqlite((db) => {
    const event = db
      .prepare('SELECT * FROM campaign_events WHERE id = ? AND campaign_id = ?')
      .get(eventId, campaignId);
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.applied_at) {
      throw new Error('Event already applied');
    }

    const type = String(event.event_type || '');
    const payload = parseJson(event.payload, {});
    const targets = resolveTargetCharacterIdsSqlite(db, campaignId, event.applies_to);
    let levelUpAvailable = false;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (type === 'world_event') {
        db.prepare('UPDATE campaign_events SET applied_at = ? WHERE id = ?').run(nowIso(), eventId);
        db.exec('COMMIT');
        return { applied: true, levelUpAvailable: false };
      }

      if (type === 'loot') {
        if (!distributeToCharacterId) {
          throw new Error('loot apply requires distributeToCharacterId');
        }

        const member = db
          .prepare(
            `SELECT id FROM campaign_members WHERE campaign_id = ? AND character_id = ? AND status = 'accepted'`,
          )
          .get(campaignId, distributeToCharacterId);
        if (!member) {
          throw new Error('Target is not an accepted member of this campaign');
        }

        const item = defaultInventoryItem(payload.item || payload);
        const data = readCharacterDataJson(db, distributeToCharacterId);
        data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
        data.inventory.push(item);

        writeCharacterDataJson(db, distributeToCharacterId, data);
        db.prepare(
          `UPDATE campaign_events SET distributed_to = ?, distributed_at = ?, applied_at = ?, applies_to = ? WHERE id = ?`,
        ).run(distributeToCharacterId, nowIso(), nowIso(), JSON.stringify([distributeToCharacterId]), eventId);
        db.exec('COMMIT');
        return { applied: true, levelUpAvailable: false };
      }

      if (targets.length === 0) {
        throw new Error('No target characters for this event');
      }

      if (type === 'xp_award') {
        const amount = Number(payload.amount || 0);
        for (const cid of targets) {
          const data = readCharacterDataJson(db, cid);
          const oldXp = Number(data.experience || 0);
          const oldLevel = xpToLevel(oldXp);
          data.experience = oldXp + amount;
          const newLevel = xpToLevel(data.experience);
          if (newLevel > oldLevel) {
            levelUpAvailable = true;
          }

          writeCharacterDataJson(db, cid, data);
        }
      } else if (type === 'damage') {
        const amount = Number(payload.amount || 0);
        for (const cid of targets) {
          const data = readCharacterDataJson(db, cid);
          data.hp = data.hp || { max: 10, current: 10, temp: 0 };
          const maxHp = Number(data.hp.max || 0);
          const cur = Number(data.hp.current ?? 0);
          data.hp.current = Math.max(0, Math.min(maxHp, cur - amount));
          writeCharacterDataJson(db, cid, data);
        }
      } else if (type === 'healing') {
        const amount = Number(payload.amount || 0);
        for (const cid of targets) {
          const data = readCharacterDataJson(db, cid);
          data.hp = data.hp || { max: 10, current: 10, temp: 0 };
          const maxHp = Number(data.hp.max || 0);
          const cur = Number(data.hp.current ?? 0);
          data.hp.current = Math.max(0, Math.min(maxHp, cur + amount));
          writeCharacterDataJson(db, cid, data);
        }
      } else if (type === 'condition_applied') {
        const conditionName = String(payload.conditionName || payload.condition || 'condition');
        const source = String(payload.source || '');
        for (const cid of targets) {
          const id = crypto.randomUUID();
          db.prepare(
            `INSERT INTO character_conditions (id, character_id, condition_name, source, applied_by, campaign_id, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            id,
            cid,
            conditionName,
            source,
            appliedByUserId || event.created_by,
            campaignId,
            payload.expiresAt || null,
            nowIso(),
          );
        }
      } else if (type === 'item_granted') {
        const item = defaultInventoryItem(payload.item || payload);
        for (const cid of targets) {
          const data = readCharacterDataJson(db, cid);
          data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
          data.inventory.push(item);
          writeCharacterDataJson(db, cid, data);
        }
      } else {
        throw new Error(`Unsupported event_type for apply: ${type}`);
      }

      db.prepare('UPDATE campaign_events SET applied_at = ? WHERE id = ?').run(nowIso(), eventId);
      db.exec('COMMIT');
      return { applied: true, levelUpAvailable };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

// --- Public API (dispatch) ---

async function createCampaign(input) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const row = {
    id,
    name: String(input.name || '').trim(),
    description: input.description != null ? String(input.description) : null,
    world_lore: input.worldLore != null ? String(input.worldLore) : null,
    banner_url: input.bannerUrl != null ? String(input.bannerUrl) : null,
    dm_user_id: String(input.dmUserId),
    status: input.status != null ? String(input.status) : 'active',
    visibility: input.visibility != null ? String(input.visibility) : 'invite-only',
    house_rules: input.houseRules != null ? String(input.houseRules) : null,
    session_count: Number(input.sessionCount ?? 0),
    max_players: Number(input.maxPlayers ?? 6),
    created_at: ts,
    updated_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.createCampaign(pool, row);
      return getCampaignById(id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaigns').insertOne(row);
      return getCampaignById(id);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaigns (id, name, description, world_lore, banner_url, dm_user_id, status, visibility, house_rules, session_count, max_players, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.name,
          row.description,
          row.world_lore,
          row.banner_url,
          row.dm_user_id,
          row.status,
          row.visibility,
          row.house_rules,
          row.session_count,
          row.max_players,
          row.created_at,
          row.updated_at,
        );
      });
      return getCampaignById(id);
  }
}

async function getCampaignById(campaignId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getCampaignById(pool, campaignId);
      return mapCampaignRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaigns').findOne({ id: campaignId });
      return mapCampaignRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
        return mapCampaignRow(row);
      });
  }
}

async function getCampaignsByDm(dmUserId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getCampaignsByDm(pool, dmUserId);
      return rows.map(mapCampaignRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const rows = await db
        .collection('campaigns')
        .find({ dm_user_id: dmUserId })
        .sort({ updated_at: -1 })
        .toArray();
      return rows.map(mapCampaignRow);
    }
    default:
      return withSqlite((db) => {
        const rows = db
          .prepare('SELECT * FROM campaigns WHERE dm_user_id = ? ORDER BY updated_at DESC')
          .all(dmUserId);
        return rows.map(mapCampaignRow);
      });
  }
}

async function getPublicCampaigns() {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getPublicCampaigns(pool);
      return rows.map(mapCampaignRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const rows = await db
        .collection('campaigns')
        .find({ visibility: 'public', status: 'active' })
        .sort({ name: 1 })
        .toArray();
      return rows.map(mapCampaignRow);
    }
    default:
      return withSqlite((db) => {
        const rows = db
          .prepare(`SELECT * FROM campaigns WHERE visibility = 'public' AND status = 'active' ORDER BY name ASC`)
          .all();
        return rows.map(mapCampaignRow);
      });
  }
}

async function updateCampaign(campaignId, patch) {
  await store.ensureAppStorage();
  const existing = await getCampaignById(campaignId);
  if (!existing) {
    return null;
  }

  const next = {
    name: patch.name != null ? String(patch.name) : existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    worldLore: patch.worldLore !== undefined ? patch.worldLore : existing.worldLore,
    bannerUrl: patch.bannerUrl !== undefined ? patch.bannerUrl : existing.bannerUrl,
    visibility: patch.visibility != null ? String(patch.visibility) : existing.visibility,
    houseRules: patch.houseRules !== undefined ? patch.houseRules : existing.houseRules,
    maxPlayers: patch.maxPlayers != null ? Number(patch.maxPlayers) : existing.maxPlayers,
    sessionCount: patch.sessionCount != null ? Number(patch.sessionCount) : existing.sessionCount,
    status: patch.status != null ? String(patch.status) : existing.status,
    dmUserId: patch.dmUserId != null ? String(patch.dmUserId) : existing.dmUserId,
  };

  const ts = nowIso();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.updateCampaign(pool, campaignId, next, ts);
      return getCampaignById(campaignId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaigns').updateOne(
        { id: campaignId },
        {
          $set: {
            name: next.name,
            description: next.description,
            world_lore: next.worldLore,
            banner_url: next.bannerUrl,
            visibility: next.visibility,
            house_rules: next.houseRules,
            max_players: next.maxPlayers,
            session_count: next.sessionCount,
            status: next.status,
            dm_user_id: next.dmUserId,
            updated_at: ts,
          },
        },
      );
      return getCampaignById(campaignId);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `UPDATE campaigns SET
            name = ?,
            description = ?,
            world_lore = ?,
            banner_url = ?,
            visibility = ?,
            house_rules = ?,
            max_players = ?,
            session_count = ?,
            status = ?,
            dm_user_id = ?,
            updated_at = ?
          WHERE id = ?`,
        ).run(
          next.name,
          next.description,
          next.worldLore,
          next.bannerUrl,
          next.visibility,
          next.houseRules,
          next.maxPlayers,
          next.sessionCount,
          next.status,
          next.dmUserId,
          ts,
          campaignId,
        );
      });
      return getCampaignById(campaignId);
  }
}

async function archiveCampaign(campaignId) {
  return updateCampaign(campaignId, { status: 'archived' });
}

async function deleteCampaign(campaignId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.deleteCampaign(pool, campaignId);
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_audit_log').deleteMany({ campaign_id: campaignId });
      await db.collection('character_conditions').deleteMany({ campaign_id: campaignId });
      await db.collection('campaign_compendium').deleteMany({ campaign_id: campaignId });
      await db.collection('campaign_events').deleteMany({ campaign_id: campaignId });
      await db.collection('campaign_sessions').deleteMany({ campaign_id: campaignId });
      await db.collection('campaign_invites').deleteMany({ campaign_id: campaignId });
      await db.collection('campaign_members').deleteMany({ campaign_id: campaignId });
      await db.collection('campaigns').deleteOne({ id: campaignId });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
      });
  }
}

async function writeAuditEntry(entry) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const row = {
    id,
    campaign_id: String(entry.campaignId),
    actor_user_id: String(entry.actorUserId),
    action: String(entry.action),
    target_type: entry.targetType != null ? String(entry.targetType) : null,
    target_id: entry.targetId != null ? String(entry.targetId) : null,
    meta: entry.meta != null ? JSON.stringify(entry.meta) : null,
    created_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.writeAuditEntry(pool, row);
      return mapAuditRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_audit_log').insertOne(row);
      return mapAuditRow(row);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_audit_log (id, campaign_id, actor_user_id, action, target_type, target_id, meta, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.campaign_id,
          row.actor_user_id,
          row.action,
          row.target_type,
          row.target_id,
          row.meta,
          row.created_at,
        );
      });
      return mapAuditRow(row);
  }
}

async function getAuditLog(campaignId, { limit = 50, offset = 0 } = {}) {
  await store.ensureAppStorage();
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const { rows, total } = await azureCampaign.getAuditLog(pool, campaignId, lim, off);
      return { rows: rows.map(mapAuditRow), total };
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const filter = { campaign_id: campaignId };
      const total = await db.collection('campaign_audit_log').countDocuments(filter);
      const rows = await db
        .collection('campaign_audit_log')
        .find(filter)
        .sort({ created_at: -1 })
        .skip(off)
        .limit(lim)
        .toArray();
      return { rows: rows.map(mapAuditRow), total };
    }
    default:
      return withSqlite((db) => {
        const totalRow = db
          .prepare('SELECT COUNT(*) AS c FROM campaign_audit_log WHERE campaign_id = ?')
          .get(campaignId);
        const total = Number(totalRow.c);
        const rows = db
          .prepare(
            `SELECT * FROM campaign_audit_log WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          )
          .all(campaignId, lim, off);
        return { rows: rows.map(mapAuditRow), total };
      });
  }
}

async function inviteMember({ campaignId, characterId, invitedByUserId, actorUserId }) {
  await store.ensureAppStorage();
  const character = await store.getCharacterById(characterId);
  if (!character) {
    throw new Error('Character not found');
  }

  const id = crypto.randomUUID();
  const ts = nowIso();
  const userId = character.ownerUserId;
  const row = {
    id,
    campaign_id: campaignId,
    character_id: characterId,
    user_id: userId,
    invited_by_user_id: invitedByUserId,
    status: 'pending',
    player_notes: null,
    dm_notes: null,
    joined_at: null,
    created_at: ts,
    updated_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.insertMember(pool, row);
      await writeAuditEntry({
        campaignId,
        actorUserId: actorUserId || invitedByUserId,
        action: 'member_invited',
        targetType: 'campaign_member',
        targetId: id,
        meta: { characterId },
      });
      return getMemberById(id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_members').insertOne(row);
      const member = mapMemberRow(row);
      await writeAuditEntry({
        campaignId,
        actorUserId: actorUserId || invitedByUserId,
        action: 'member_invited',
        targetType: 'campaign_member',
        targetId: id,
        meta: { characterId },
      });
      return member;
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_members (id, campaign_id, character_id, user_id, invited_by_user_id, status, player_notes, dm_notes, joined_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.campaign_id,
          row.character_id,
          row.user_id,
          row.invited_by_user_id,
          row.status,
          row.player_notes,
          row.dm_notes,
          row.joined_at,
          row.created_at,
          row.updated_at,
        );
      });
      await writeAuditEntry({
        campaignId,
        actorUserId: actorUserId || invitedByUserId,
        action: 'member_invited',
        targetType: 'campaign_member',
        targetId: id,
        meta: { characterId },
      });
      return getMemberById(id);
  }
}

async function getMemberById(memberId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getMemberById(pool, memberId);
      return mapMemberRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaign_members').findOne({ id: memberId });
      return mapMemberRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db.prepare('SELECT * FROM campaign_members WHERE id = ?').get(memberId);
        return mapMemberRow(row);
      });
  }
}

async function getMembersByCampaign(campaignId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getMembersByCampaign(pool, campaignId);
      return rows.map(mapMemberRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const rows = await db.collection('campaign_members').find({ campaign_id: campaignId }).toArray();
      return rows.map(mapMemberRow);
    }
    default:
      return withSqlite((db) => {
        const rows = db.prepare('SELECT * FROM campaign_members WHERE campaign_id = ?').all(campaignId);
        return rows.map(mapMemberRow);
      });
  }
}

async function getMemberByCharacter(campaignId, characterId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getMemberByCharacter(pool, campaignId, characterId);
      return mapMemberRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db
        .collection('campaign_members')
        .findOne({ campaign_id: campaignId, character_id: characterId });
      return mapMemberRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db
          .prepare('SELECT * FROM campaign_members WHERE campaign_id = ? AND character_id = ?')
          .get(campaignId, characterId);
        return mapMemberRow(row);
      });
  }
}

async function updateMemberStatus(campaignId, memberId, status, actorUserId) {
  await store.ensureAppStorage();
  const ts = nowIso();
  const joinedAt = status === 'accepted' ? ts : null;

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.updateMemberStatus(pool, campaignId, memberId, status, ts, joinedAt);
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_status_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: { status },
      });
      return getMemberById(memberId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_members').updateOne(
        { id: memberId, campaign_id: campaignId },
        { $set: { status, updated_at: ts, joined_at: joinedAt } },
      );
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_status_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: { status },
      });
      return getMemberById(memberId);
    }
    default:
      withSqlite((db) => {
        if (joinedAt) {
          db.prepare(
            `UPDATE campaign_members SET status = ?, updated_at = ?, joined_at = COALESCE(joined_at, ?) WHERE id = ? AND campaign_id = ?`,
          ).run(status, ts, joinedAt, memberId, campaignId);
        } else {
          db.prepare(`UPDATE campaign_members SET status = ?, updated_at = ? WHERE id = ? AND campaign_id = ?`).run(
            status,
            ts,
            memberId,
            campaignId,
          );
        }
      });
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_status_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: { status },
      });
      return getMemberById(memberId);
  }
}

async function updateMemberNotes(campaignId, memberId, dmNotes, actorUserId) {
  await store.ensureAppStorage();
  const ts = nowIso();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.updateMemberNotes(pool, campaignId, memberId, dmNotes, ts);
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_notes_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_members').updateOne(
        { id: memberId, campaign_id: campaignId },
        { $set: { dm_notes: dmNotes, updated_at: ts } },
      );
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_notes_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
    }
    default:
      withSqlite((db) => {
        db.prepare(`UPDATE campaign_members SET dm_notes = ?, updated_at = ? WHERE id = ? AND campaign_id = ?`).run(
          dmNotes,
          ts,
          memberId,
          campaignId,
        );
      });
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_notes_updated',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
  }
}

async function removeMember(campaignId, memberId, actorUserId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const tsRemoved = nowIso();
      await azureCampaign.removeMember(pool, campaignId, memberId, tsRemoved);
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_removed',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_members').updateOne(
        { id: memberId, campaign_id: campaignId },
        { $set: { status: 'removed', updated_at: nowIso() } },
      );
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_removed',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
    }
    default:
      withSqlite((db) => {
        db.prepare(`UPDATE campaign_members SET status = 'removed', updated_at = ? WHERE id = ? AND campaign_id = ?`).run(
          nowIso(),
          memberId,
          campaignId,
        );
      });
      await writeAuditEntry({
        campaignId,
        actorUserId,
        action: 'member_removed',
        targetType: 'campaign_member',
        targetId: memberId,
        meta: {},
      });
      return getMemberById(memberId);
  }
}

async function getCampaignsByCharacter(characterId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getCampaignsByCharacter(pool, characterId);
      return rows.map(mapCampaignRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const members = await db.collection('campaign_members').find({ character_id: characterId }).toArray();
      const ids = members.map((m) => m.campaign_id);
      if (ids.length === 0) {
        return [];
      }

      const campaigns = await db
        .collection('campaigns')
        .find({ id: { $in: ids } })
        .toArray();
      return campaigns.map(mapCampaignRow);
    }
    default:
      return withSqlite((db) => {
        const rows = db
          .prepare(
            `SELECT c.* FROM campaigns c
             INNER JOIN campaign_members m ON m.campaign_id = c.id
             WHERE m.character_id = ?`,
          )
          .all(characterId);
        return rows.map(mapCampaignRow);
      });
  }
}

async function createInviteToken({ campaignId, createdByUserId, targetEmail, characterId, expiresAt }) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const ts = nowIso();
  const row = {
    id,
    campaign_id: campaignId,
    token,
    created_by: createdByUserId,
    target_email: targetEmail || null,
    character_id: characterId || null,
    expires_at: expiresAt || null,
    used_at: null,
    used_by_user_id: null,
    created_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.insertInvite(pool, row);
      return getInviteByToken(token);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_invites').insertOne(row);
      return mapInviteRow(row);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_invites (id, campaign_id, token, created_by, target_email, character_id, expires_at, used_at, used_by_user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.campaign_id,
          row.token,
          row.created_by,
          row.target_email,
          row.character_id,
          row.expires_at,
          row.used_at,
          row.used_by_user_id,
          row.created_at,
        );
      });
      return getInviteByToken(token);
  }
}

async function getInviteByToken(token) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getInviteByToken(pool, token);
      return mapInviteRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaign_invites').findOne({ token: String(token) });
      return mapInviteRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db.prepare('SELECT * FROM campaign_invites WHERE token = ?').get(String(token));
        return mapInviteRow(row);
      });
  }
}

async function consumeInviteToken(token, usedByUserId) {
  await store.ensureAppStorage();
  const invite = await getInviteByToken(token);
  if (!invite) {
    throw new Error('Invite not found');
  }

  if (invite.usedAt) {
    throw new Error('Invite already used');
  }

  if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) {
    throw new Error('Invite expired');
  }

  const ts = nowIso();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.consumeInviteToken(pool, invite.id, usedByUserId, ts);
      return getInviteByToken(token);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_invites').updateOne(
        { id: invite.id },
        { $set: { used_at: ts, used_by_user_id: usedByUserId } },
      );
      return getInviteByToken(token);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `UPDATE campaign_invites SET used_at = ?, used_by_user_id = ? WHERE id = ? AND used_at IS NULL`,
        ).run(ts, usedByUserId, invite.id);
      });
      return getInviteByToken(token);
  }
}

async function listInvitesByCampaign(campaignId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.listInvitesByCampaign(pool, campaignId);
      return rows.map(mapInviteRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const rows = await db.collection('campaign_invites').find({ campaign_id: campaignId }).toArray();
      return rows.map(mapInviteRow);
    }
    default:
      return withSqlite((db) => {
        const rows = db.prepare('SELECT * FROM campaign_invites WHERE campaign_id = ?').all(campaignId);
        return rows.map(mapInviteRow);
      });
  }
}

async function createSession(input) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const attendanceJson = JSON.stringify(Array.isArray(input.attendance) ? input.attendance : []);

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = {
        id,
        campaign_id: input.campaignId,
        session_number: Number(input.sessionNumber),
        title: input.title != null ? String(input.title) : null,
        summary: input.summary != null ? String(input.summary) : null,
        session_date: input.sessionDate != null ? String(input.sessionDate) : null,
        duration_mins: input.durationMins != null ? Number(input.durationMins) : null,
        attendance: attendanceJson,
        created_by: input.createdByUserId,
        created_at: ts,
        updated_at: ts,
      };
      await azureCampaign.insertSession(pool, row);
      return getSessionById(input.campaignId, id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = {
        id,
        campaign_id: input.campaignId,
        session_number: Number(input.sessionNumber),
        title: input.title != null ? String(input.title) : null,
        summary: input.summary != null ? String(input.summary) : null,
        session_date: input.sessionDate != null ? String(input.sessionDate) : null,
        duration_mins: input.durationMins != null ? Number(input.durationMins) : null,
        attendance: attendanceJson,
        created_by: input.createdByUserId,
        created_at: ts,
        updated_at: ts,
      };
      await db.collection('campaign_sessions').insertOne(row);
      return getSessionById(input.campaignId, id);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_sessions (id, campaign_id, session_number, title, summary, session_date, duration_mins, attendance, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.campaignId,
          Number(input.sessionNumber),
          input.title != null ? String(input.title) : null,
          input.summary != null ? String(input.summary) : null,
          input.sessionDate != null ? String(input.sessionDate) : null,
          input.durationMins != null ? Number(input.durationMins) : null,
          attendanceJson,
          input.createdByUserId,
          ts,
          ts,
        );
      });
      return getSessionById(input.campaignId, id);
  }
}

async function updateSession(campaignId, sessionId, patch) {
  await store.ensureAppStorage();
  const ts = nowIso();
  const attendanceJson =
    patch.attendance !== undefined ? JSON.stringify(patch.attendance) : undefined;

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.updateSession(pool, campaignId, sessionId, patch, attendanceJson, ts);
      return getSessionById(campaignId, sessionId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const $set = { updated_at: ts };
      if (patch.title !== undefined) {
        $set.title = patch.title;
      }

      if (patch.summary !== undefined) {
        $set.summary = patch.summary;
      }

      if (patch.sessionDate !== undefined) {
        $set.session_date = patch.sessionDate;
      }

      if (patch.durationMins !== undefined) {
        $set.duration_mins = patch.durationMins;
      }

      if (attendanceJson !== undefined) {
        $set.attendance = attendanceJson;
      }

      await db.collection('campaign_sessions').updateOne({ id: sessionId, campaign_id: campaignId }, { $set });
      return getSessionById(campaignId, sessionId);
    }
    default:
      withSqlite((db) => {
        if (attendanceJson !== undefined) {
          db.prepare(
            `UPDATE campaign_sessions SET title = COALESCE(?, title), summary = COALESCE(?, summary), session_date = COALESCE(?, session_date), duration_mins = COALESCE(?, duration_mins), attendance = ?, updated_at = ? WHERE id = ? AND campaign_id = ?`,
          ).run(
            patch.title !== undefined ? patch.title : null,
            patch.summary !== undefined ? patch.summary : null,
            patch.sessionDate !== undefined ? patch.sessionDate : null,
            patch.durationMins !== undefined ? patch.durationMins : null,
            attendanceJson,
            ts,
            sessionId,
            campaignId,
          );
        } else {
          db.prepare(
            `UPDATE campaign_sessions SET title = COALESCE(?, title), summary = COALESCE(?, summary), session_date = COALESCE(?, session_date), duration_mins = COALESCE(?, duration_mins), updated_at = ? WHERE id = ? AND campaign_id = ?`,
          ).run(
            patch.title !== undefined ? patch.title : null,
            patch.summary !== undefined ? patch.summary : null,
            patch.sessionDate !== undefined ? patch.sessionDate : null,
            patch.durationMins !== undefined ? patch.durationMins : null,
            ts,
            sessionId,
            campaignId,
          );
        }
      });
      return getSessionById(campaignId, sessionId);
  }
}

async function getSessionsByCampaign(campaignId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getSessionsByCampaign(pool, campaignId);
      return rows.map(mapSessionRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const rows = await db
        .collection('campaign_sessions')
        .find({ campaign_id: campaignId })
        .sort({ session_number: -1 })
        .toArray();
      return rows.map((row) => mapSessionRow({ ...row, attendance: row.attendance }));
    }
    default:
      return withSqlite((db) => {
        const rows = db
          .prepare('SELECT * FROM campaign_sessions WHERE campaign_id = ? ORDER BY session_number DESC')
          .all(campaignId);
        return rows.map(mapSessionRow);
      });
  }
}

async function getSessionById(campaignId, sessionId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getSessionById(pool, campaignId, sessionId);
      return mapSessionRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaign_sessions').findOne({ id: sessionId, campaign_id: campaignId });
      return mapSessionRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db
          .prepare('SELECT * FROM campaign_sessions WHERE id = ? AND campaign_id = ?')
          .get(sessionId, campaignId);
        return mapSessionRow(row);
      });
  }
}

async function createEvent(input) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const payloadJson = input.payload != null ? JSON.stringify(input.payload) : null;
  const appliesTo =
    input.appliesTo !== undefined ? (typeof input.appliesTo === 'string' ? input.appliesTo : JSON.stringify(input.appliesTo)) : null;

  const row = {
    id,
    campaign_id: input.campaignId,
    session_id: input.sessionId || null,
    title: input.title != null ? String(input.title) : null,
    description: input.description != null ? String(input.description) : null,
    event_type: String(input.eventType),
    payload: payloadJson,
    applies_to: appliesTo,
    distributed_to: input.distributedTo || null,
    distributed_at: input.distributedAt || null,
    created_by: input.createdByUserId,
    applied_at: null,
    created_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.insertEvent(pool, row);
      return getEventById(input.campaignId, id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_events').insertOne(row);
      return getEventById(input.campaignId, id);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_events (id, campaign_id, session_id, title, description, event_type, payload, applies_to, distributed_to, distributed_at, created_by, applied_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.campaign_id,
          row.session_id,
          row.title,
          row.description,
          row.event_type,
          row.payload,
          row.applies_to,
          row.distributed_to,
          row.distributed_at,
          row.created_by,
          row.applied_at,
          row.created_at,
        );
      });
      return getEventById(input.campaignId, id);
  }
}

async function getEventById(campaignId, eventId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getEventById(pool, campaignId, eventId);
      return mapEventRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaign_events').findOne({ id: eventId, campaign_id: campaignId });
      return mapEventRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db
          .prepare('SELECT * FROM campaign_events WHERE id = ? AND campaign_id = ?')
          .get(eventId, campaignId);
        return mapEventRow(row);
      });
  }
}

async function getEventsByCampaign(campaignId, filters = {}) {
  await store.ensureAppStorage();
  const type = filters.type || filters.eventType;
  const sessionId = filters.sessionId;

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.getEventsByCampaign(pool, campaignId, type, sessionId);
      return rows.map(mapEventRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const q = { campaign_id: campaignId };
      if (type) {
        q.event_type = String(type);
      }

      if (sessionId) {
        q.session_id = sessionId;
      }

      const rows = await db.collection('campaign_events').find(q).sort({ created_at: -1 }).toArray();
      return rows.map(mapEventRow);
    }
    default:
      return withSqlite((db) => {
        let sql = 'SELECT * FROM campaign_events WHERE campaign_id = ?';
        const params = [campaignId];
        if (type) {
          sql += ' AND event_type = ?';
          params.push(String(type));
        }

        if (sessionId) {
          sql += ' AND session_id = ?';
          params.push(String(sessionId));
        }

        sql += ' ORDER BY created_at DESC';
        const rows = db.prepare(sql).all(...params);
        return rows.map(mapEventRow);
      });
  }
}

async function applyEvent(campaignId, eventId, options = {}) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      return azureCampaign.applyEvent(pool, campaignId, eventId, options, XP_THRESHOLDS);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      return applyEventMongo(campaignId, eventId, options);
    }
    default:
      return applyEventSqlite(campaignId, eventId, options);
  }
}

async function applyEventMongo(campaignId, eventId, options) {
  await ensureMongoReady();
  const db = await getMongoDb();
  const distributeToCharacterId = options?.distributeToCharacterId || null;
  const actorUserId = options?.actorUserId || null;

  const event = await db.collection('campaign_events').findOne({ id: eventId, campaign_id: campaignId });
  if (!event) {
    throw new Error('Event not found');
  }

  if (event.applied_at) {
    throw new Error('Event already applied');
  }

  const type = String(event.event_type || '');
  const payload = typeof event.payload === 'string' ? parseJson(event.payload, {}) : event.payload || {};
  const appliesTo = event.applies_to;

  async function resolveTargets() {
    const parsed = appliesTo ? (typeof appliesTo === 'string' ? parseJson(appliesTo, null) : appliesTo) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((id) => typeof id === 'string');
    }

    const members = await db
      .collection('campaign_members')
      .find({ campaign_id: campaignId, status: 'accepted' })
      .toArray();
    return members.map((m) => m.character_id);
  }

  const targets = await resolveTargets();
  let levelUpAvailable = false;

  if (type === 'world_event') {
    await db.collection('campaign_events').updateOne({ id: eventId }, { $set: { applied_at: nowIso() } });
    return { applied: true, levelUpAvailable: false };
  }

  if (type === 'loot') {
    if (!distributeToCharacterId) {
      throw new Error('loot apply requires distributeToCharacterId');
    }

    const member = await db.collection('campaign_members').findOne({
      campaign_id: campaignId,
      character_id: distributeToCharacterId,
      status: 'accepted',
    });
    if (!member) {
      throw new Error('Target is not an accepted member of this campaign');
    }

    const char = await db.collection('characters').findOne({ id: distributeToCharacterId });
    if (!char) {
      throw new Error('Character not found');
    }

    const data = typeof char.data_json === 'object' && char.data_json ? char.data_json : parseJson(char.data_json, {});
    const item = defaultInventoryItem(payload.item || payload);
    data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
    data.inventory.push(item);

    await db.collection('characters').updateOne(
      { id: distributeToCharacterId },
      { $set: { data_json: data, updated_at: nowIso() } },
    );
    await db.collection('campaign_events').updateOne(
      { id: eventId },
      {
        $set: {
          distributed_to: distributeToCharacterId,
          distributed_at: nowIso(),
          applied_at: nowIso(),
          applies_to: JSON.stringify([distributeToCharacterId]),
        },
      },
    );
    return { applied: true, levelUpAvailable: false };
  }

  if (targets.length === 0) {
    throw new Error('No target characters for this event');
  }

  if (type === 'xp_award') {
    const amount = Number(payload.amount || 0);
    for (const cid of targets) {
      const char = await db.collection('characters').findOne({ id: cid });
      const data = typeof char.data_json === 'object' && char.data_json ? char.data_json : parseJson(char.data_json, {});
      const oldXp = Number(data.experience || 0);
      const oldLevel = xpToLevel(oldXp);
      data.experience = oldXp + amount;
      const newLevel = xpToLevel(data.experience);
      if (newLevel > oldLevel) {
        levelUpAvailable = true;
      }

      await db.collection('characters').updateOne({ id: cid }, { $set: { data_json: data, updated_at: nowIso() } });
    }
  } else if (type === 'damage') {
    const amount = Number(payload.amount || 0);
    for (const cid of targets) {
      const char = await db.collection('characters').findOne({ id: cid });
      const data = typeof char.data_json === 'object' && char.data_json ? char.data_json : parseJson(char.data_json, {});
      data.hp = data.hp || { max: 10, current: 10, temp: 0 };
      const maxHp = Number(data.hp.max || 0);
      const cur = Number(data.hp.current ?? 0);
      data.hp.current = Math.max(0, Math.min(maxHp, cur - amount));
      await db.collection('characters').updateOne({ id: cid }, { $set: { data_json: data, updated_at: nowIso() } });
    }
  } else if (type === 'healing') {
    const amount = Number(payload.amount || 0);
    for (const cid of targets) {
      const char = await db.collection('characters').findOne({ id: cid });
      const data = typeof char.data_json === 'object' && char.data_json ? char.data_json : parseJson(char.data_json, {});
      data.hp = data.hp || { max: 10, current: 10, temp: 0 };
      const maxHp = Number(data.hp.max || 0);
      const cur = Number(data.hp.current ?? 0);
      data.hp.current = Math.max(0, Math.min(maxHp, cur + amount));
      await db.collection('characters').updateOne({ id: cid }, { $set: { data_json: data, updated_at: nowIso() } });
    }
  } else if (type === 'condition_applied') {
    const conditionName = String(payload.conditionName || payload.condition || 'condition');
    const source = String(payload.source || '');
    for (const cid of targets) {
      await db.collection('character_conditions').insertOne({
        id: crypto.randomUUID(),
        character_id: cid,
        condition_name: conditionName,
        source,
        applied_by: actorUserId || event.created_by,
        campaign_id: campaignId,
        expires_at: payload.expiresAt || null,
        created_at: nowIso(),
      });
    }
  } else if (type === 'item_granted') {
    const item = defaultInventoryItem(payload.item || payload);
    for (const cid of targets) {
      const char = await db.collection('characters').findOne({ id: cid });
      const data = typeof char.data_json === 'object' && char.data_json ? char.data_json : parseJson(char.data_json, {});
      data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
      data.inventory.push(item);
      await db.collection('characters').updateOne({ id: cid }, { $set: { data_json: data, updated_at: nowIso() } });
    }
  } else {
    throw new Error(`Unsupported event_type for apply: ${type}`);
  }

  await db.collection('campaign_events').updateOne({ id: eventId }, { $set: { applied_at: nowIso() } });
  return { applied: true, levelUpAvailable };
}

async function searchCompendium(campaignId, { type, search, tag, includeHidden = false } = {}) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const rows = await azureCampaign.searchCompendium(pool, campaignId, { type, search, tag, includeHidden });
      return rows.map(mapCompendiumRow);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const filter = { campaign_id: campaignId };
      if (type) {
        filter.content_type = String(type);
      }

      if (!includeHidden) {
        filter.is_player_visible = 1;
      }

      if (tag) {
        filter.tags = { $regex: escapeRegex(String(tag)), $options: 'i' };
      }

      if (search) {
        const s = escapeRegex(String(search));
        filter.$or = [
          { name: { $regex: s, $options: 'i' } },
          { description: { $regex: s, $options: 'i' } },
        ];
      }

      const rows = await db.collection('campaign_compendium').find(filter).sort({ name: 1 }).toArray();
      return rows.map(mapCompendiumRow);
    }
    default:
      return withSqlite((db) => {
        let sql = 'SELECT * FROM campaign_compendium WHERE campaign_id = ?';
        const params = [campaignId];
        if (type) {
          sql += ' AND content_type = ?';
          params.push(String(type));
        }

        if (!includeHidden) {
          sql += ' AND is_player_visible = 1';
        }

        if (search) {
          sql += ' AND (name LIKE ? OR description LIKE ?)';
          const like = `%${String(search).replace(/%/g, '\\%')}%`;
          params.push(like, like);
        }

        if (tag) {
          sql += ' AND tags LIKE ?';
          params.push(`%${String(tag)}%`);
        }

        sql += ' ORDER BY name ASC';
        const rows = db.prepare(sql).all(...params);
        return rows.map(mapCompendiumRow);
      });
  }
}

async function getCompendiumEntry(campaignId, entryId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const row = await azureCampaign.getCompendiumEntry(pool, campaignId, entryId);
      return mapCompendiumRow(row);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const row = await db.collection('campaign_compendium').findOne({ id: entryId, campaign_id: campaignId });
      return mapCompendiumRow(row);
    }
    default:
      return withSqlite((db) => {
        const row = db
          .prepare('SELECT * FROM campaign_compendium WHERE id = ? AND campaign_id = ?')
          .get(entryId, campaignId);
        return mapCompendiumRow(row);
      });
  }
}

async function createCompendiumEntry(input) {
  await store.ensureAppStorage();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const tagsJson = input.tags != null ? JSON.stringify(input.tags) : null;
  const dataJson = input.data != null ? JSON.stringify(input.data) : null;

  const row = {
    id,
    campaign_id: input.campaignId,
    content_type: String(input.contentType),
    name: String(input.name || ''),
    description: input.description != null ? String(input.description) : null,
    data: dataJson,
    tags: tagsJson,
    is_player_visible: input.isPlayerVisible === false ? 0 : 1,
    created_by: input.createdByUserId,
    created_at: ts,
    updated_at: ts,
  };

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.insertCompendium(pool, row);
      return getCompendiumEntry(input.campaignId, id);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_compendium').insertOne(row);
      return getCompendiumEntry(input.campaignId, id);
    }
    default:
      withSqlite((db) => {
        db.prepare(
          `INSERT INTO campaign_compendium (id, campaign_id, content_type, name, description, data, tags, is_player_visible, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          row.id,
          row.campaign_id,
          row.content_type,
          row.name,
          row.description,
          row.data,
          row.tags,
          row.is_player_visible,
          row.created_by,
          row.created_at,
          row.updated_at,
        );
      });
      return getCompendiumEntry(input.campaignId, id);
  }
}

async function updateCompendiumEntry(campaignId, entryId, patch) {
  await store.ensureAppStorage();
  const ts = nowIso();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      const existing = await getCompendiumEntry(campaignId, entryId);
      if (!existing) {
        return null;
      }

      const name = patch.name !== undefined ? String(patch.name) : existing.name;
      const description = patch.description !== undefined ? patch.description : existing.description;
      const contentType = patch.contentType != null ? String(patch.contentType) : existing.contentType;
      const data = patch.data !== undefined ? JSON.stringify(patch.data) : JSON.stringify(existing.data);
      const tags = patch.tags !== undefined ? JSON.stringify(patch.tags) : JSON.stringify(existing.tags);
      const vis = patch.isPlayerVisible !== undefined ? (patch.isPlayerVisible ? 1 : 0) : (existing.isPlayerVisible ? 1 : 0);
      await azureCampaign.updateCompendium(pool, campaignId, entryId, name, description, contentType, data, tags, vis, ts);
      return getCompendiumEntry(campaignId, entryId);
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      const $set = { updated_at: ts };
      if (patch.name !== undefined) {
        $set.name = patch.name;
      }

      if (patch.description !== undefined) {
        $set.description = patch.description;
      }

      if (patch.contentType !== undefined) {
        $set.content_type = patch.contentType;
      }

      if (patch.data !== undefined) {
        $set.data = JSON.stringify(patch.data);
      }

      if (patch.tags !== undefined) {
        $set.tags = JSON.stringify(patch.tags);
      }

      if (patch.isPlayerVisible !== undefined) {
        $set.is_player_visible = patch.isPlayerVisible ? 1 : 0;
      }

      await db.collection('campaign_compendium').updateOne({ id: entryId, campaign_id: campaignId }, { $set });
      return getCompendiumEntry(campaignId, entryId);
    }
    default:
      withSqlite((db) => {
        const existing = db.prepare('SELECT * FROM campaign_compendium WHERE id = ? AND campaign_id = ?').get(entryId, campaignId);
        if (!existing) {
          return;
        }

        const name = patch.name !== undefined ? String(patch.name) : existing.name;
        const description = patch.description !== undefined ? patch.description : existing.description;
        const contentType = patch.contentType != null ? String(patch.contentType) : existing.content_type;
        const data = patch.data !== undefined ? JSON.stringify(patch.data) : existing.data;
        const tags = patch.tags !== undefined ? JSON.stringify(patch.tags) : existing.tags;
        const vis =
          patch.isPlayerVisible !== undefined ? (patch.isPlayerVisible ? 1 : 0) : existing.is_player_visible;
        db.prepare(
          `UPDATE campaign_compendium SET name = ?, description = ?, content_type = ?, data = ?, tags = ?, is_player_visible = ?, updated_at = ? WHERE id = ? AND campaign_id = ?`,
        ).run(name, description, contentType, data, tags, vis, ts, entryId, campaignId);
      });
      return getCompendiumEntry(campaignId, entryId);
  }
}

async function deleteCompendiumEntry(campaignId, entryId) {
  await store.ensureAppStorage();

  switch (getProvider()) {
    case DATABASE_PROVIDERS.AZURE_SQL: {
      const pool = await getAzurePool();
      await azureCampaign.deleteCompendium(pool, campaignId, entryId);
      return;
    }
    case DATABASE_PROVIDERS.MONGODB: {
      await ensureMongoReady();
      const db = await getMongoDb();
      await db.collection('campaign_compendium').deleteOne({ id: entryId, campaign_id: campaignId });
      return;
    }
    default:
      withSqlite((db) => {
        db.prepare('DELETE FROM campaign_compendium WHERE id = ? AND campaign_id = ?').run(entryId, campaignId);
      });
  }
}

module.exports = {
  XP_THRESHOLDS,
  applyEvent,
  archiveCampaign,
  consumeInviteToken,
  createCampaign,
  createCompendiumEntry,
  createEvent,
  createInviteToken,
  createSession,
  deleteCampaign,
  deleteCompendiumEntry,
  getAuditLog,
  getCampaignById,
  getCampaignsByCharacter,
  getCampaignsByDm,
  getCompendiumEntry,
  getEventById,
  getEventsByCampaign,
  getInviteByToken,
  getMemberById,
  getMemberByCharacter,
  getMembersByCampaign,
  getPublicCampaigns,
  getSessionById,
  getSessionsByCampaign,
  inviteMember,
  listInvitesByCampaign,
  removeMember,
  searchCompendium,
  updateCampaign,
  updateCompendiumEntry,
  updateMemberNotes,
  updateMemberStatus,
  updateSession,
  writeAuditEntry,
};
