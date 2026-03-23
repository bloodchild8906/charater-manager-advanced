const crypto = require('node:crypto');
const sql = require('mssql');

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

function xpToLevel(totalXp, XP_THRESHOLDS) {
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

async function createCampaign(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('name', sql.NVarChar(255), row.name);
  request.input('description', sql.NVarChar(sql.MAX), row.description);
  request.input('world_lore', sql.NVarChar(sql.MAX), row.world_lore);
  request.input('banner_url', sql.NVarChar(1024), row.banner_url);
  request.input('dm_user_id', sql.NVarChar(64), row.dm_user_id);
  request.input('status', sql.NVarChar(32), row.status);
  request.input('visibility', sql.NVarChar(32), row.visibility);
  request.input('house_rules', sql.NVarChar(sql.MAX), row.house_rules);
  request.input('session_count', sql.Int, row.session_count);
  request.input('max_players', sql.Int, row.max_players);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  request.input('updated_at', sql.DateTimeOffset, new Date(row.updated_at));
  await request.query(
    `INSERT INTO dbo.[campaigns] ([id], [name], [description], [world_lore], [banner_url], [dm_user_id], [status], [visibility], [house_rules], [session_count], [max_players], [created_at], [updated_at])
     VALUES (@id, @name, @description, @world_lore, @banner_url, @dm_user_id, @status, @visibility, @house_rules, @session_count, @max_players, @created_at, @updated_at)`,
  );
}

async function getCampaignById(pool, campaignId) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), campaignId);
  const result = await request.query('SELECT * FROM dbo.[campaigns] WHERE [id] = @id');
  return result.recordset[0] || null;
}

async function getCampaignsByDm(pool, dmUserId) {
  const request = pool.request();
  request.input('dm_user_id', sql.NVarChar(64), dmUserId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaigns] WHERE [dm_user_id] = @dm_user_id ORDER BY [updated_at] DESC`,
  );
  return result.recordset;
}

async function getPublicCampaigns(pool) {
  const result = await pool.request().query(
    `SELECT * FROM dbo.[campaigns] WHERE [visibility] = N'public' AND [status] = N'active' ORDER BY [name] ASC`,
  );
  return result.recordset;
}

async function updateCampaign(pool, campaignId, next, ts) {
  const request = pool.request();
  request.input('name', sql.NVarChar(255), next.name);
  request.input('description', sql.NVarChar(sql.MAX), next.description);
  request.input('world_lore', sql.NVarChar(sql.MAX), next.worldLore);
  request.input('banner_url', sql.NVarChar(1024), next.bannerUrl);
  request.input('visibility', sql.NVarChar(32), next.visibility);
  request.input('house_rules', sql.NVarChar(sql.MAX), next.houseRules);
  request.input('max_players', sql.Int, next.maxPlayers);
  request.input('session_count', sql.Int, next.sessionCount);
  request.input('status', sql.NVarChar(32), next.status);
  request.input('dm_user_id', sql.NVarChar(64), next.dmUserId);
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('id', sql.NVarChar(64), campaignId);
  await request.query(
    `UPDATE dbo.[campaigns] SET
      [name] = @name,
      [description] = @description,
      [world_lore] = @world_lore,
      [banner_url] = @banner_url,
      [visibility] = @visibility,
      [house_rules] = @house_rules,
      [max_players] = @max_players,
      [session_count] = @session_count,
      [status] = @status,
      [dm_user_id] = @dm_user_id,
      [updated_at] = @updated_at
    WHERE [id] = @id`,
  );
}

async function deleteCampaign(pool, campaignId) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), campaignId);
  await request.query('DELETE FROM dbo.[campaigns] WHERE [id] = @id');
}

async function writeAuditEntry(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('actor_user_id', sql.NVarChar(64), row.actor_user_id);
  request.input('action', sql.NVarChar(128), row.action);
  request.input('target_type', sql.NVarChar(64), row.target_type);
  request.input('target_id', sql.NVarChar(64), row.target_id);
  request.input('meta', sql.NVarChar(sql.MAX), row.meta);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  await request.query(
    `INSERT INTO dbo.[campaign_audit_log] ([id], [campaign_id], [actor_user_id], [action], [target_type], [target_id], [meta], [created_at])
     VALUES (@id, @campaign_id, @actor_user_id, @action, @target_type, @target_id, @meta, @created_at)`,
  );
}

async function getAuditLog(pool, campaignId, limit, offset) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  request.input('limit', sql.Int, limit);
  request.input('offset', sql.Int, offset);
  const totalResult = await pool
    .request()
    .input('campaign_id', sql.NVarChar(64), campaignId)
    .query('SELECT COUNT(*) AS c FROM dbo.[campaign_audit_log] WHERE [campaign_id] = @campaign_id');
  const total = Number(totalResult.recordset[0].c);
  const rowsResult = await request.query(
    `SELECT * FROM dbo.[campaign_audit_log] WHERE [campaign_id] = @campaign_id
     ORDER BY [created_at] DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );
  return { rows: rowsResult.recordset, total };
}

async function insertMember(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('character_id', sql.NVarChar(64), row.character_id);
  request.input('user_id', sql.NVarChar(64), row.user_id);
  request.input('invited_by_user_id', sql.NVarChar(64), row.invited_by_user_id);
  request.input('status', sql.NVarChar(32), row.status);
  request.input('player_notes', sql.NVarChar(sql.MAX), row.player_notes);
  request.input('dm_notes', sql.NVarChar(sql.MAX), row.dm_notes);
  request.input('joined_at', sql.DateTimeOffset, row.joined_at ? new Date(row.joined_at) : null);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  request.input('updated_at', sql.DateTimeOffset, new Date(row.updated_at));
  await request.query(
    `INSERT INTO dbo.[campaign_members] ([id], [campaign_id], [character_id], [user_id], [invited_by_user_id], [status], [player_notes], [dm_notes], [joined_at], [created_at], [updated_at])
     VALUES (@id, @campaign_id, @character_id, @user_id, @invited_by_user_id, @status, @player_notes, @dm_notes, @joined_at, @created_at, @updated_at)`,
  );
}

async function getMemberById(pool, memberId) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), memberId);
  const result = await request.query('SELECT * FROM dbo.[campaign_members] WHERE [id] = @id');
  return result.recordset[0] || null;
}

async function getMembersByCampaign(pool, campaignId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  const result = await request.query('SELECT * FROM dbo.[campaign_members] WHERE [campaign_id] = @campaign_id');
  return result.recordset;
}

async function getMemberByCharacter(pool, campaignId, characterId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  request.input('character_id', sql.NVarChar(64), characterId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaign_members] WHERE [campaign_id] = @campaign_id AND [character_id] = @character_id`,
  );
  return result.recordset[0] || null;
}

async function updateMemberStatus(pool, campaignId, memberId, status, ts, joinedAt) {
  const request = pool.request();
  request.input('status', sql.NVarChar(32), status);
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('joined_at', sql.DateTimeOffset, joinedAt ? new Date(joinedAt) : null);
  request.input('id', sql.NVarChar(64), memberId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  if (joinedAt) {
    await request.query(
      `UPDATE dbo.[campaign_members] SET [status] = @status, [updated_at] = @updated_at, [joined_at] = COALESCE([joined_at], @joined_at) WHERE [id] = @id AND [campaign_id] = @campaign_id`,
    );
  } else {
    await request.query(
      `UPDATE dbo.[campaign_members] SET [status] = @status, [updated_at] = @updated_at WHERE [id] = @id AND [campaign_id] = @campaign_id`,
    );
  }
}

async function updateMemberNotes(pool, campaignId, memberId, dmNotes, ts) {
  const request = pool.request();
  request.input('dm_notes', sql.NVarChar(sql.MAX), dmNotes);
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('id', sql.NVarChar(64), memberId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  await request.query(
    `UPDATE dbo.[campaign_members] SET [dm_notes] = @dm_notes, [updated_at] = @updated_at WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
}

async function removeMember(pool, campaignId, memberId, ts) {
  const request = pool.request();
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('id', sql.NVarChar(64), memberId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  await request.query(
    `UPDATE dbo.[campaign_members] SET [status] = N'removed', [updated_at] = @updated_at WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
}

async function getCampaignsByCharacter(pool, characterId) {
  const request = pool.request();
  request.input('character_id', sql.NVarChar(64), characterId);
  const result = await request.query(
    `SELECT c.* FROM dbo.[campaigns] c
     INNER JOIN dbo.[campaign_members] m ON m.[campaign_id] = c.[id]
     WHERE m.[character_id] = @character_id`,
  );
  return result.recordset;
}

async function insertInvite(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('token', sql.NVarChar(128), row.token);
  request.input('created_by', sql.NVarChar(64), row.created_by);
  request.input('target_email', sql.NVarChar(255), row.target_email);
  request.input('character_id', sql.NVarChar(64), row.character_id);
  request.input('expires_at', sql.DateTimeOffset, row.expires_at ? new Date(row.expires_at) : null);
  request.input('used_at', sql.DateTimeOffset, row.used_at ? new Date(row.used_at) : null);
  request.input('used_by_user_id', sql.NVarChar(64), row.used_by_user_id);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  await request.query(
    `INSERT INTO dbo.[campaign_invites] ([id], [campaign_id], [token], [created_by], [target_email], [character_id], [expires_at], [used_at], [used_by_user_id], [created_at])
     VALUES (@id, @campaign_id, @token, @created_by, @target_email, @character_id, @expires_at, @used_at, @used_by_user_id, @created_at)`,
  );
}

async function getInviteByToken(pool, token) {
  const request = pool.request();
  request.input('token', sql.NVarChar(128), String(token));
  const result = await request.query('SELECT * FROM dbo.[campaign_invites] WHERE [token] = @token');
  return result.recordset[0] || null;
}

async function consumeInviteToken(pool, inviteId, usedByUserId, ts) {
  const request = pool.request();
  request.input('used_at', sql.DateTimeOffset, new Date(ts));
  request.input('used_by_user_id', sql.NVarChar(64), usedByUserId);
  request.input('id', sql.NVarChar(64), inviteId);
  await request.query(
    `UPDATE dbo.[campaign_invites] SET [used_at] = @used_at, [used_by_user_id] = @used_by_user_id WHERE [id] = @id AND [used_at] IS NULL`,
  );
}

async function listInvitesByCampaign(pool, campaignId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  const result = await request.query('SELECT * FROM dbo.[campaign_invites] WHERE [campaign_id] = @campaign_id');
  return result.recordset;
}

async function insertSession(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('session_number', sql.Int, row.session_number);
  request.input('title', sql.NVarChar(512), row.title);
  request.input('summary', sql.NVarChar(sql.MAX), row.summary);
  request.input('session_date', sql.NVarChar(64), row.session_date);
  request.input('duration_mins', sql.Int, row.duration_mins);
  request.input('attendance', sql.NVarChar(sql.MAX), row.attendance);
  request.input('created_by', sql.NVarChar(64), row.created_by);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  request.input('updated_at', sql.DateTimeOffset, new Date(row.updated_at));
  await request.query(
    `INSERT INTO dbo.[campaign_sessions] ([id], [campaign_id], [session_number], [title], [summary], [session_date], [duration_mins], [attendance], [created_by], [created_at], [updated_at])
     VALUES (@id, @campaign_id, @session_number, @title, @summary, @session_date, @duration_mins, @attendance, @created_by, @created_at, @updated_at)`,
  );
}

async function updateSession(pool, campaignId, sessionId, patch, attendanceJson, ts) {
  const request = pool.request();
  request.input('title', sql.NVarChar(512), patch.title !== undefined ? patch.title : null);
  request.input('summary', sql.NVarChar(sql.MAX), patch.summary !== undefined ? patch.summary : null);
  request.input('session_date', sql.NVarChar(64), patch.sessionDate !== undefined ? patch.sessionDate : null);
  request.input('duration_mins', sql.Int, patch.durationMins !== undefined ? patch.durationMins : null);
  request.input('attendance', sql.NVarChar(sql.MAX), attendanceJson !== undefined ? attendanceJson : null);
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('id', sql.NVarChar(64), sessionId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);

  if (attendanceJson !== undefined) {
    await request.query(
      `UPDATE dbo.[campaign_sessions] SET
        [title] = COALESCE(@title, [title]),
        [summary] = COALESCE(@summary, [summary]),
        [session_date] = COALESCE(@session_date, [session_date]),
        [duration_mins] = COALESCE(@duration_mins, [duration_mins]),
        [attendance] = @attendance,
        [updated_at] = @updated_at
      WHERE [id] = @id AND [campaign_id] = @campaign_id`,
    );
  } else {
    await request.query(
      `UPDATE dbo.[campaign_sessions] SET
        [title] = COALESCE(@title, [title]),
        [summary] = COALESCE(@summary, [summary]),
        [session_date] = COALESCE(@session_date, [session_date]),
        [duration_mins] = COALESCE(@duration_mins, [duration_mins]),
        [updated_at] = @updated_at
      WHERE [id] = @id AND [campaign_id] = @campaign_id`,
    );
  }
}

async function getSessionsByCampaign(pool, campaignId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaign_sessions] WHERE [campaign_id] = @campaign_id ORDER BY [session_number] DESC`,
  );
  return result.recordset;
}

async function getSessionById(pool, campaignId, sessionId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  request.input('id', sql.NVarChar(64), sessionId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaign_sessions] WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
  return result.recordset[0] || null;
}

async function insertEvent(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('session_id', sql.NVarChar(64), row.session_id);
  request.input('title', sql.NVarChar(512), row.title);
  request.input('description', sql.NVarChar(sql.MAX), row.description);
  request.input('event_type', sql.NVarChar(64), row.event_type);
  request.input('payload', sql.NVarChar(sql.MAX), row.payload);
  request.input('applies_to', sql.NVarChar(sql.MAX), row.applies_to);
  request.input('distributed_to', sql.NVarChar(64), row.distributed_to);
  request.input('distributed_at', sql.DateTimeOffset, row.distributed_at ? new Date(row.distributed_at) : null);
  request.input('created_by', sql.NVarChar(64), row.created_by);
  request.input('applied_at', sql.DateTimeOffset, row.applied_at ? new Date(row.applied_at) : null);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  await request.query(
    `INSERT INTO dbo.[campaign_events] ([id], [campaign_id], [session_id], [title], [description], [event_type], [payload], [applies_to], [distributed_to], [distributed_at], [created_by], [applied_at], [created_at])
     VALUES (@id, @campaign_id, @session_id, @title, @description, @event_type, @payload, @applies_to, @distributed_to, @distributed_at, @created_by, @applied_at, @created_at)`,
  );
}

async function getEventById(pool, campaignId, eventId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  request.input('id', sql.NVarChar(64), eventId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaign_events] WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
  return result.recordset[0] || null;
}

async function getEventsByCampaign(pool, campaignId, type, sessionId) {
  let q = `SELECT * FROM dbo.[campaign_events] WHERE [campaign_id] = @campaign_id`;
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  if (type) {
    q += ` AND [event_type] = @event_type`;
    request.input('event_type', sql.NVarChar(64), String(type));
  }

  if (sessionId) {
    q += ` AND [session_id] = @session_id`;
    request.input('session_id', sql.NVarChar(64), String(sessionId));
  }

  q += ` ORDER BY [created_at] DESC`;
  const result = await request.query(q);
  return result.recordset;
}

async function applyEvent(pool, campaignId, eventId, options, xpThresholds) {
  const distributeToCharacterId = options?.distributeToCharacterId || null;
  const appliedByUserId = options?.actorUserId || null;

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const req0 = new sql.Request(transaction);
    req0.input('campaign_id', sql.NVarChar(64), campaignId);
    req0.input('id', sql.NVarChar(64), eventId);
    const evResult = await req0.query(
      `SELECT * FROM dbo.[campaign_events] WHERE [id] = @id AND [campaign_id] = @campaign_id`,
    );
    const event = evResult.recordset[0];
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.applied_at) {
      throw new Error('Event already applied');
    }

    const type = String(event.event_type || '');
    const payload = parseJson(event.payload, {});
    const appliesTo = event.applies_to;

    async function resolveTargets() {
      const parsed = appliesTo ? parseJson(appliesTo, null) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((id) => typeof id === 'string');
      }

      const reqM = new sql.Request(transaction);
      reqM.input('campaign_id', sql.NVarChar(64), campaignId);
      const members = await reqM.query(
        `SELECT [character_id] FROM dbo.[campaign_members] WHERE [campaign_id] = @campaign_id AND [status] = N'accepted'`,
      );
      return members.recordset.map((r) => r.character_id);
    }

    const targets = await resolveTargets();
    let levelUpAvailable = false;

    if (type === 'world_event') {
      const reqW = new sql.Request(transaction);
      reqW.input('applied_at', sql.DateTimeOffset, new Date(nowIso()));
      reqW.input('id', sql.NVarChar(64), eventId);
      await reqW.query(`UPDATE dbo.[campaign_events] SET [applied_at] = @applied_at WHERE [id] = @id`);
      await transaction.commit();
      return { applied: true, levelUpAvailable: false };
    }

    if (type === 'loot') {
      if (!distributeToCharacterId) {
        throw new Error('loot apply requires distributeToCharacterId');
      }

      const reqMem = new sql.Request(transaction);
      reqMem.input('campaign_id', sql.NVarChar(64), campaignId);
      reqMem.input('character_id', sql.NVarChar(64), distributeToCharacterId);
      const memResult = await reqMem.query(
        `SELECT [id] FROM dbo.[campaign_members] WHERE [campaign_id] = @campaign_id AND [character_id] = @character_id AND [status] = N'accepted'`,
      );
      if (!memResult.recordset[0]) {
        throw new Error('Target is not an accepted member of this campaign');
      }

      const data = await readCharacterDataJsonInTransaction(transaction, distributeToCharacterId);
      const item = defaultInventoryItem(payload.item || payload);
      data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
      data.inventory.push(item);
      await writeCharacterDataJsonInTransaction(transaction, distributeToCharacterId, data);

      const reqL = new sql.Request(transaction);
      const ts = nowIso();
      reqL.input('distributed_to', sql.NVarChar(64), distributeToCharacterId);
      reqL.input('distributed_at', sql.DateTimeOffset, new Date(ts));
      reqL.input('applied_at', sql.DateTimeOffset, new Date(ts));
      reqL.input('applies_to', sql.NVarChar(sql.MAX), JSON.stringify([distributeToCharacterId]));
      reqL.input('id', sql.NVarChar(64), eventId);
      await reqL.query(
        `UPDATE dbo.[campaign_events] SET [distributed_to] = @distributed_to, [distributed_at] = @distributed_at, [applied_at] = @applied_at, [applies_to] = @applies_to WHERE [id] = @id`,
      );
      await transaction.commit();
      return { applied: true, levelUpAvailable: false };
    }

    if (targets.length === 0) {
      throw new Error('No target characters for this event');
    }

    if (type === 'xp_award') {
      const amount = Number(payload.amount || 0);
      for (const cid of targets) {
        const data = await readCharacterDataJsonInTransaction(transaction, cid);
        const oldXp = Number(data.experience || 0);
        const oldLevel = xpToLevel(oldXp, xpThresholds);
        data.experience = oldXp + amount;
        const newLevel = xpToLevel(data.experience, xpThresholds);
        if (newLevel > oldLevel) {
          levelUpAvailable = true;
        }

        await writeCharacterDataJsonInTransaction(transaction, cid, data);
      }
    } else if (type === 'damage') {
      const amount = Number(payload.amount || 0);
      for (const cid of targets) {
        const data = await readCharacterDataJsonInTransaction(transaction, cid);
        data.hp = data.hp || { max: 10, current: 10, temp: 0 };
        const maxHp = Number(data.hp.max || 0);
        const cur = Number(data.hp.current ?? 0);
        data.hp.current = Math.max(0, Math.min(maxHp, cur - amount));
        await writeCharacterDataJsonInTransaction(transaction, cid, data);
      }
    } else if (type === 'healing') {
      const amount = Number(payload.amount || 0);
      for (const cid of targets) {
        const data = await readCharacterDataJsonInTransaction(transaction, cid);
        data.hp = data.hp || { max: 10, current: 10, temp: 0 };
        const maxHp = Number(data.hp.max || 0);
        const cur = Number(data.hp.current ?? 0);
        data.hp.current = Math.max(0, Math.min(maxHp, cur + amount));
        await writeCharacterDataJsonInTransaction(transaction, cid, data);
      }
    } else if (type === 'condition_applied') {
      const conditionName = String(payload.conditionName || payload.condition || 'condition');
      const source = String(payload.source || '');
      for (const cid of targets) {
        const condId = crypto.randomUUID();
        const reqC = new sql.Request(transaction);
        reqC.input('id', sql.NVarChar(64), condId);
        reqC.input('character_id', sql.NVarChar(64), cid);
        reqC.input('condition_name', sql.NVarChar(255), conditionName);
        reqC.input('source', sql.NVarChar(512), source);
        reqC.input('applied_by', sql.NVarChar(64), appliedByUserId || event.created_by);
        reqC.input('campaign_id', sql.NVarChar(64), campaignId);
        reqC.input('expires_at', sql.DateTimeOffset, payload.expiresAt ? new Date(payload.expiresAt) : null);
        reqC.input('created_at', sql.DateTimeOffset, new Date(nowIso()));
        await reqC.query(
          `INSERT INTO dbo.[character_conditions] ([id], [character_id], [condition_name], [source], [applied_by], [campaign_id], [expires_at], [created_at])
           VALUES (@id, @character_id, @condition_name, @source, @applied_by, @campaign_id, @expires_at, @created_at)`,
        );
      }
    } else if (type === 'item_granted') {
      const item = defaultInventoryItem(payload.item || payload);
      for (const cid of targets) {
        const data = await readCharacterDataJsonInTransaction(transaction, cid);
        data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
        data.inventory.push(item);
        await writeCharacterDataJsonInTransaction(transaction, cid, data);
      }
    } else {
      throw new Error(`Unsupported event_type for apply: ${type}`);
    }

    const reqA = new sql.Request(transaction);
    reqA.input('applied_at', sql.DateTimeOffset, new Date(nowIso()));
    reqA.input('id', sql.NVarChar(64), eventId);
    await reqA.query(`UPDATE dbo.[campaign_events] SET [applied_at] = @applied_at WHERE [id] = @id`);
    await transaction.commit();
    return { applied: true, levelUpAvailable };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function readCharacterDataJsonInTransaction(transaction, characterId) {
  const request = new sql.Request(transaction);
  request.input('id', sql.NVarChar(64), characterId);
  const result = await request.query('SELECT [data_json] FROM dbo.[characters] WHERE [id] = @id');
  const row = result.recordset[0];
  if (!row) {
    throw new Error(`Character not found: ${characterId}`);
  }

  return parseJson(row.data_json, {});
}

async function writeCharacterDataJsonInTransaction(transaction, characterId, data) {
  const request = new sql.Request(transaction);
  request.input('data_json', sql.NVarChar(sql.MAX), JSON.stringify(data));
  request.input('updated_at', sql.DateTimeOffset, new Date(nowIso()));
  request.input('id', sql.NVarChar(64), characterId);
  await request.query(
    `UPDATE dbo.[characters] SET [data_json] = @data_json, [updated_at] = @updated_at WHERE [id] = @id`,
  );
}

async function searchCompendium(pool, campaignId, { type, search, tag, includeHidden }) {
  let q = `SELECT * FROM dbo.[campaign_compendium] WHERE [campaign_id] = @campaign_id`;
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  if (type) {
    q += ` AND [content_type] = @content_type`;
    request.input('content_type', sql.NVarChar(64), String(type));
  }

  if (!includeHidden) {
    q += ` AND [is_player_visible] = 1`;
  }

  if (search) {
    q += ` AND ([name] LIKE @search OR [description] LIKE @search)`;
    request.input('search', sql.NVarChar(512), `%${String(search)}%`);
  }

  if (tag) {
    q += ` AND [tags] LIKE @tag`;
    request.input('tag', sql.NVarChar(512), `%${String(tag)}%`);
  }

  q += ` ORDER BY [name] ASC`;
  const result = await request.query(q);
  return result.recordset;
}

async function getCompendiumEntry(pool, campaignId, entryId) {
  const request = pool.request();
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  request.input('id', sql.NVarChar(64), entryId);
  const result = await request.query(
    `SELECT * FROM dbo.[campaign_compendium] WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
  return result.recordset[0] || null;
}

async function insertCompendium(pool, row) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), row.id);
  request.input('campaign_id', sql.NVarChar(64), row.campaign_id);
  request.input('content_type', sql.NVarChar(64), row.content_type);
  request.input('name', sql.NVarChar(512), row.name);
  request.input('description', sql.NVarChar(sql.MAX), row.description);
  request.input('data', sql.NVarChar(sql.MAX), row.data);
  request.input('tags', sql.NVarChar(sql.MAX), row.tags);
  request.input('is_player_visible', sql.Bit, row.is_player_visible === 1 || row.is_player_visible === true);
  request.input('created_by', sql.NVarChar(64), row.created_by);
  request.input('created_at', sql.DateTimeOffset, new Date(row.created_at));
  request.input('updated_at', sql.DateTimeOffset, new Date(row.updated_at));
  await request.query(
    `INSERT INTO dbo.[campaign_compendium] ([id], [campaign_id], [content_type], [name], [description], [data], [tags], [is_player_visible], [created_by], [created_at], [updated_at])
     VALUES (@id, @campaign_id, @content_type, @name, @description, @data, @tags, @is_player_visible, @created_by, @created_at, @updated_at)`,
  );
}

async function updateCompendium(pool, campaignId, entryId, name, description, contentType, data, tags, vis, ts) {
  const request = pool.request();
  request.input('name', sql.NVarChar(512), name);
  request.input('description', sql.NVarChar(sql.MAX), description);
  request.input('content_type', sql.NVarChar(64), contentType);
  request.input('data', sql.NVarChar(sql.MAX), data);
  request.input('tags', sql.NVarChar(sql.MAX), tags);
  request.input('is_player_visible', sql.Bit, vis === 1 || vis === true);
  request.input('updated_at', sql.DateTimeOffset, new Date(ts));
  request.input('id', sql.NVarChar(64), entryId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  await request.query(
    `UPDATE dbo.[campaign_compendium] SET [name] = @name, [description] = @description, [content_type] = @content_type, [data] = @data, [tags] = @tags, [is_player_visible] = @is_player_visible, [updated_at] = @updated_at WHERE [id] = @id AND [campaign_id] = @campaign_id`,
  );
}

async function deleteCompendium(pool, campaignId, entryId) {
  const request = pool.request();
  request.input('id', sql.NVarChar(64), entryId);
  request.input('campaign_id', sql.NVarChar(64), campaignId);
  await request.query(`DELETE FROM dbo.[campaign_compendium] WHERE [id] = @id AND [campaign_id] = @campaign_id`);
}

module.exports = {
  applyEvent,
  consumeInviteToken,
  createCampaign,
  deleteCampaign,
  deleteCompendium,
  getAuditLog,
  getCampaignById,
  getCampaignsByCharacter,
  getCampaignsByDm,
  getCompendiumEntry,
  getEventById,
  getEventsByCampaign,
  getInviteByToken,
  getMemberByCharacter,
  getMemberById,
  getMembersByCampaign,
  getPublicCampaigns,
  getSessionById,
  getSessionsByCampaign,
  insertCompendium,
  insertEvent,
  insertInvite,
  insertMember,
  insertSession,
  listInvitesByCampaign,
  removeMember,
  searchCompendium,
  updateCampaign,
  updateCompendium,
  updateMemberNotes,
  updateMemberStatus,
  updateSession,
  writeAuditEntry,
};
