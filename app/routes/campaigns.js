const { requireDM, requireCampaignMember, requireCampaignCharacterAccess } = require('../middleware/campaignAccess');
const {
  createCampaign,
  getCampaignById,
  getCampaignsByDm,
  getCampaignsByCharacter,
  getPublicCampaigns,
  updateCampaign,
  archiveCampaign,
  deleteCampaign,
  inviteMember,
  getMembersByCampaign,
  updateMemberStatus,
  updateMemberNotes,
  removeMember,
  createInviteToken,
  getInviteByToken,
  consumeInviteToken,
  getMemberByCharacter,
  getAuditLog,
  writeAuditEntry,
  createSession,
  getSessionsByCampaign,
  updateSession,
  createEvent,
  getEventsByCampaign,
  getEventById,
  applyEvent,
  searchCompendium,
  getCompendiumEntry,
  createCompendiumEntry,
  updateCompendiumEntry,
  deleteCompendiumEntry,
  XP_THRESHOLDS,
} = require('../data/campaignRepository');
const { getCharacterById, listCharacters, updateCharacter } = require('../store');
const campaignEventBus = require('../services/campaignEventBus');

function nowIso() {
  return new Date().toISOString();
}

/**
 * Campaign CRUD routes
 */

async function handleCreateCampaign(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (user.role !== 'gm' && user.role !== 'admin') {
      return res.status(403).json({ message: 'GM or admin role required to create campaigns' });
    }

    const body = req.body;
    const campaign = await createCampaign({
      name: body.name,
      description: body.description,
      worldLore: body.worldLore,
      bannerUrl: body.bannerUrl,
      dmUserId: user.id,
      visibility: body.visibility || 'invite-only',
      maxPlayers: body.maxPlayers || 6,
      houseRules: body.houseRules,
    });

    await writeAuditEntry({
      campaignId: campaign.id,
      actorUserId: user.id,
      action: 'campaign_created',
      targetType: 'campaign',
      targetId: campaign.id,
      meta: { name: campaign.name },
    });

    res.status(201).json({ campaign });
  } catch (error) {
    console.error('handleCreateCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleListCampaigns(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get campaigns where user is DM
    const dmCampaigns = await getCampaignsByDm(user.id);

    // Get all characters owned by user
    const characters = await listCharacters(user);
    const characterIds = characters.map(c => c.id);

    // Get campaigns where user's characters are members
    const memberCampaigns = [];
    for (const charId of characterIds) {
      const campaigns = await getCampaignsByCharacter(charId);
      for (const campaign of campaigns) {
        if (!memberCampaigns.find(c => c.id === campaign.id) && !dmCampaigns.find(c => c.id === campaign.id)) {
          memberCampaigns.push(campaign);
        }
      }
    }

    res.status(200).json({
      campaigns: {
        dm: dmCampaigns,
        member: memberCampaigns,
      },
    });
  } catch (error) {
    console.error('handleListCampaigns error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGetPublicCampaigns(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const campaigns = await getPublicCampaigns();
    res.status(200).json({ campaigns });
  } catch (error) {
    console.error('handleGetPublicCampaigns error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGetCampaign(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const campaignId = req.params.id;
    const campaign = await getCampaignById(campaignId);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Check access: DM, admin, or member
    const isDM = campaign.dmUserId === user.id;
    const isAdmin = user.role === 'admin';
    
    if (!isDM && !isAdmin) {
      // Check if user has any character that is a member
      const characters = await listCharacters(user);
      const characterIds = characters.map(c => c.id);
      const members = await getMembersByCampaign(campaignId);
      const isMember = members.some(m => characterIds.includes(m.characterId) && m.status === 'accepted');

      if (!isMember && campaign.visibility !== 'public') {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.status(200).json({ campaign });
  } catch (error) {
    console.error('handleGetCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateCampaign(req, res) {
  try {
    const campaignId = req.params.id;
    const body = req.body;
    const user = req.user;

    const updated = await updateCampaign(campaignId, {
      name: body.name,
      description: body.description,
      worldLore: body.worldLore,
      bannerUrl: body.bannerUrl,
      visibility: body.visibility,
      maxPlayers: body.maxPlayers,
      houseRules: body.houseRules,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'campaign_updated',
      targetType: 'campaign',
      targetId: campaignId,
      meta: {},
    });

    res.status(200).json({ campaign: updated });
  } catch (error) {
    console.error('handleUpdateCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleDeleteCampaign(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;

    await deleteCampaign(campaignId);

    res.status(200).json({ deleted: true });
  } catch (error) {
    console.error('handleDeleteCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleArchiveCampaign(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;

    const updated = await archiveCampaign(campaignId);

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'campaign_archived',
      targetType: 'campaign',
      targetId: campaignId,
      meta: {},
    });

    res.status(200).json({ campaign: updated });
  } catch (error) {
    console.error('handleArchiveCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleTransferCampaign(req, res) {
  try {
    const campaignId = req.params.id;
    const body = req.body;
    const user = req.user;

    if (!body.newDmUserId) {
      return res.status(400).json({ message: 'newDmUserId is required' });
    }

    const updated = await updateCampaign(campaignId, {
      dmUserId: body.newDmUserId,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'campaign_transferred',
      targetType: 'campaign',
      targetId: campaignId,
      meta: { newDmUserId: body.newDmUserId },
    });

    res.status(200).json({ campaign: updated });
  } catch (error) {
    console.error('handleTransferCampaign error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Member routes
 */

async function handleInviteMember(req, res) {
  try {
    const campaignId = req.params.id;
    const body = req.body;
    const user = req.user;

    if (!body.characterId) {
      return res.status(400).json({ message: 'characterId is required' });
    }

    const member = await inviteMember({
      campaignId,
      characterId: body.characterId,
      invitedByUserId: user.id,
      actorUserId: user.id,
    });

    res.status(201).json({ member });
  } catch (error) {
    console.error('handleInviteMember error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleCreateInviteLink(req, res) {
  try {
    const campaignId = req.params.id;
    const body = req.body;
    const user = req.user;

    let expiresAt = null;
    if (body.expiresIn) {
      const ms = parseDuration(body.expiresIn);
      if (ms > 0) {
        expiresAt = new Date(Date.now() + ms).toISOString();
      }
    }

    const invite = await createInviteToken({
      campaignId,
      createdByUserId: user.id,
      targetEmail: body.targetEmail || null,
      characterId: body.characterId || null,
      expiresAt,
    });

    res.status(201).json({
      token: invite.token,
      url: `/join/${invite.token}`,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error('handleCreateInviteLink error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

function parseDuration(str) {
  const match = String(str).match(/^(\d+)([dhms])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return value * (multipliers[unit] || 0);
}

async function handleGetMembers(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;

    const members = await getMembersByCampaign(campaignId);

    // Check if user is DM or admin
    const campaign = req.campaign || await getCampaignById(campaignId);
    const isDM = campaign.dmUserId === user.id;
    const isAdmin = user.role === 'admin';

    // Populate character data for each member
    const populatedMembers = await Promise.all(
      members.map(async (m) => {
        const character = await getCharacterById(m.characterId);
        
        // Get conditions for this character in this campaign
        const { withSqlite } = require('../database');
        const conditions = withSqlite((db) => {
          return db
            .prepare('SELECT * FROM character_conditions WHERE character_id = ? AND campaign_id = ?')
            .all(m.characterId, campaignId);
        });

        const memberData = {
          ...m,
          character: character ? {
            id: character.id,
            name: character.name,
            portraitUrl: character.portraitUrl,
            ownerDisplayName: character.ownerDisplayName,
            data: typeof character.dataJson === 'string' 
              ? JSON.parse(character.dataJson) 
              : character.dataJson,
          } : null,
          conditions: conditions.map(c => ({
            id: c.id,
            conditionName: c.condition_name,
            source: c.source,
            appliedBy: c.applied_by,
            expiresAt: c.expires_at,
            createdAt: c.created_at,
          })),
        };

        // Filter out dm_notes for non-DM/admin users
        if (!isDM && !isAdmin) {
          delete memberData.dmNotes;
        }

        return memberData;
      })
    );

    res.status(200).json({ members: populatedMembers });
  } catch (error) {
    console.error('handleGetMembers error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateMember(req, res) {
  try {
    const campaignId = req.params.id;
    const memberId = req.params.memberId;
    const body = req.body;
    const user = req.user;

    if (!body.status) {
      return res.status(400).json({ message: 'status is required' });
    }

    const updated = await updateMemberStatus(campaignId, memberId, body.status, user.id);

    res.status(200).json({ member: updated });
  } catch (error) {
    console.error('handleUpdateMember error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateMemberNotes(req, res) {
  try {
    const campaignId = req.params.id;
    const memberId = req.params.memberId;
    const body = req.body;
    const user = req.user;

    const updated = await updateMemberNotes(campaignId, memberId, body.dmNotes, user.id);

    res.status(200).json({ member: updated });
  } catch (error) {
    console.error('handleUpdateMemberNotes error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleRemoveMember(req, res) {
  try {
    const campaignId = req.params.id;
    const memberId = req.params.memberId;
    const user = req.user;

    const updated = await removeMember(campaignId, memberId, user.id);

    res.status(200).json({ member: updated });
  } catch (error) {
    console.error('handleRemoveMember error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Invite routes
 */

async function handleGetPendingInvites(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get all characters owned by user
    const characters = await listCharacters(user);
    const characterIds = characters.map(c => c.id);

    // Find all pending invites for these characters
    const pendingInvites = [];
    for (const charId of characterIds) {
      // We need to check all campaigns for members with this character
      // This is inefficient but works for now
      // In production, we'd add a getMembersByCharacter method
      const campaigns = await getCampaignsByCharacter(charId);
      for (const campaign of campaigns) {
        const member = await getMemberByCharacter(campaign.id, charId);
        if (member && member.status === 'pending') {
          pendingInvites.push({
            ...member,
            campaign: {
              id: campaign.id,
              name: campaign.name,
              description: campaign.description,
            },
          });
        }
      }
    }

    res.status(200).json({ invites: pendingInvites });
  } catch (error) {
    console.error('handleGetPendingInvites error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleJoinCampaign(req, res) {
  try {
    const token = req.params.token;
    const body = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!body.characterId) {
      return res.status(400).json({ message: 'characterId is required' });
    }

    // Validate token
    const invite = await getInviteByToken(token);
    if (!invite) {
      return res.status(404).json({ message: 'Invalid invite token' });
    }

    if (invite.usedAt) {
      return res.status(400).json({ message: 'Invite already used' });
    }

    if (invite.expiresAt && Date.parse(invite.expiresAt) < Date.now()) {
      return res.status(400).json({ message: 'Invite expired' });
    }

    // Check campaign status
    const campaign = await getCampaignById(invite.campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.status === 'archived') {
      return res.status(400).json({ message: 'Cannot join archived campaign' });
    }

    // Verify character belongs to user
    const character = await getCharacterById(body.characterId);
    if (!character || character.ownerUserId !== user.id) {
      return res.status(403).json({ message: 'Character does not belong to you' });
    }

    // Check if member already exists
    let member = await getMemberByCharacter(invite.campaignId, body.characterId);
    
    if (member) {
      // Update existing member to accepted
      member = await updateMemberStatus(invite.campaignId, member.id, 'accepted', user.id);
    } else {
      // Create new member
      member = await inviteMember({
        campaignId: invite.campaignId,
        characterId: body.characterId,
        invitedByUserId: invite.createdBy,
        actorUserId: user.id,
      });
      member = await updateMemberStatus(invite.campaignId, member.id, 'accepted', user.id);
    }

    // Consume token
    await consumeInviteToken(token, user.id);

    res.status(200).json({
      campaignId: invite.campaignId,
      memberId: member.id,
      campaign,
    });
  } catch (error) {
    console.error('handleJoinCampaign error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

/**
 * House rules routes
 */

async function handleGetHouseRules(req, res) {
  try {
    const campaignId = req.params.id;
    const campaign = req.campaign || await getCampaignById(campaignId);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.status(200).json({ houseRules: campaign.houseRules || '' });
  } catch (error) {
    console.error('handleGetHouseRules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateHouseRules(req, res) {
  try {
    const campaignId = req.params.id;
    const body = req.body;
    const user = req.user;

    const updated = await updateCampaign(campaignId, {
      houseRules: body.houseRules,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'house_rules_updated',
      targetType: 'campaign',
      targetId: campaignId,
      meta: {},
    });

    res.status(200).json({ houseRules: updated.houseRules });
  } catch (error) {
    console.error('handleUpdateHouseRules error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Audit log route
 */

async function handleGetAuditLog(req, res) {
  try {
    const campaignId = req.params.id;
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const result = await getAuditLog(campaignId, { limit, offset });

    res.status(200).json({
      rows: result.rows,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('handleGetAuditLog error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * DM Character Sheet Access Routes (Task 5)
 */

async function handleGetDMCharacterSheet(req, res) {
  try {
    const character = req.campaignCharacter;
    const campaign = req.campaign;

    // Check if requester is DM or admin
    const isDM = campaign.dmUserId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    // If not DM/admin, omit dm_notes from member
    let member = req.campaignMember;
    if (!isDM && !isAdmin && member) {
      // eslint-disable-next-line no-unused-vars
      const { dmNotes, ...rest } = member;
      member = rest;
    }

    res.status(200).json({ character, member });
  } catch (error) {
    console.error('handleGetDMCharacterSheet error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

function computeFieldDiff(oldData, newData) {
  const diff = {};
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  for (const key of allKeys) {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { previous: oldVal, new: newVal };
    }
  }

  return diff;
}

async function handlePatchDMCharacterSheet(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId;
    const body = req.body;

    // Get current character data
    const oldCharacter = await getCharacterById(characterId);
    if (!oldCharacter) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const oldData = typeof oldCharacter.dataJson === 'string' 
      ? JSON.parse(oldCharacter.dataJson) 
      : oldCharacter.dataJson;

    // Update character
    const updated = await updateCharacter({
      id: characterId,
      owner_user_id: oldCharacter.ownerUserId,
      name: body.name || oldCharacter.name,
      edition: body.edition || oldCharacter.edition,
      ancestry_slug: body.ancestrySlug || body.ancestry_slug || oldCharacter.ancestrySlug,
      class_slug: body.classSlug || body.class_slug || oldCharacter.classSlug,
      background_slug: body.backgroundSlug || body.background_slug || oldCharacter.backgroundSlug,
      level: body.level || oldCharacter.level,
      data_json: body.dataJson || body.data_json || oldCharacter.dataJson,
      created_at: oldCharacter.createdAt,
      updated_at: nowIso(),
    });

    const newData = typeof updated.dataJson === 'string' 
      ? JSON.parse(updated.dataJson) 
      : updated.dataJson;

    // Compute field-level diff
    const diff = computeFieldDiff(oldData, newData);

    // Write audit entry
    await writeAuditEntry({
      campaignId,
      actorUserId: req.user.id,
      action: 'sheet_edited',
      targetType: 'character',
      targetId: characterId,
      meta: { diff },
    });

    res.status(200).json({ character: updated });
  } catch (error) {
    console.error('handlePatchDMCharacterSheet error:', error);
    res.status(500).json({ message: 'Internal server error' });
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

async function handleAwardXP(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const user = req.user;
    const body = req.body;

    const amount = Number(body.amount || 0);
    if (amount <= 0) {
      return res.status(400).json({ message: 'XP amount must be positive' });
    }

    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const data = typeof character.dataJson === 'string' 
      ? JSON.parse(character.dataJson) 
      : character.dataJson;

    const oldXp = Number(data.experience || 0);
    const oldLevel = xpToLevel(oldXp);
    data.experience = oldXp + amount;
    const newLevel = xpToLevel(data.experience);

    const updated = await updateCharacter({
      id: characterId,
      owner_user_id: character.ownerUserId,
      name: character.name,
      edition: character.edition,
      ancestry_slug: character.ancestrySlug,
      class_slug: character.classSlug,
      background_slug: character.backgroundSlug,
      level: character.level,
      data_json: JSON.stringify(data),
      created_at: character.createdAt,
      updated_at: nowIso(),
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'xp_awarded',
      targetType: 'character',
      targetId: characterId,
      meta: { amount, oldXp, newXp: data.experience },
    });

    res.status(200).json({
      character: updated,
      levelUpAvailable: newLevel > oldLevel,
    });
  } catch (error) {
    console.error('handleAwardXP error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleApplyDamage(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const user = req.user;
    const body = req.body;

    const amount = Number(body.amount || 0);
    if (amount < 0) {
      return res.status(400).json({ message: 'Damage amount cannot be negative' });
    }

    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const data = typeof character.dataJson === 'string' 
      ? JSON.parse(character.dataJson) 
      : character.dataJson;

    data.hp = data.hp || { max: 10, current: 10, temp: 0 };
    const maxHp = Number(data.hp.max || 0);
    const currentHp = Number(data.hp.current ?? 0);
    data.hp.current = Math.max(0, Math.min(maxHp, currentHp - amount));

    const updated = await updateCharacter({
      id: characterId,
      owner_user_id: character.ownerUserId,
      name: character.name,
      edition: character.edition,
      ancestry_slug: character.ancestrySlug,
      class_slug: character.classSlug,
      background_slug: character.backgroundSlug,
      level: character.level,
      data_json: JSON.stringify(data),
      created_at: character.createdAt,
      updated_at: nowIso(),
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'damage_applied',
      targetType: 'character',
      targetId: characterId,
      meta: { amount, oldHp: currentHp, newHp: data.hp.current },
    });

    // Emit SSE event
    campaignEventBus.emit(campaignId, 'hp_updated', {
      characterId,
      currentHp: data.hp.current,
      maxHp: data.hp.max,
    });

    res.status(200).json({ character: updated });
  } catch (error) {
    console.error('handleApplyDamage error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleApplyHealing(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const user = req.user;
    const body = req.body;

    const amount = Number(body.amount || 0);
    if (amount < 0) {
      return res.status(400).json({ message: 'Healing amount cannot be negative' });
    }

    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const data = typeof character.dataJson === 'string' 
      ? JSON.parse(character.dataJson) 
      : character.dataJson;

    data.hp = data.hp || { max: 10, current: 10, temp: 0 };
    const maxHp = Number(data.hp.max || 0);
    const currentHp = Number(data.hp.current ?? 0);
    data.hp.current = Math.max(0, Math.min(maxHp, currentHp + amount));

    const updated = await updateCharacter({
      id: characterId,
      owner_user_id: character.ownerUserId,
      name: character.name,
      edition: character.edition,
      ancestry_slug: character.ancestrySlug,
      class_slug: character.classSlug,
      background_slug: character.backgroundSlug,
      level: character.level,
      data_json: JSON.stringify(data),
      created_at: character.createdAt,
      updated_at: nowIso(),
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'healing_applied',
      targetType: 'character',
      targetId: characterId,
      meta: { amount, oldHp: currentHp, newHp: data.hp.current },
    });

    // Emit SSE event
    campaignEventBus.emit(campaignId, 'hp_updated', {
      characterId,
      currentHp: data.hp.current,
      maxHp: data.hp.max,
    });

    res.status(200).json({ character: updated });
  } catch (error) {
    console.error('handleApplyHealing error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGrantItem(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const user = req.user;
    const body = req.body;

    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const data = typeof character.dataJson === 'string' 
      ? JSON.parse(character.dataJson) 
      : character.dataJson;

    data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
    data.inventory.push(body.item);

    const updated = await updateCharacter({
      id: characterId,
      owner_user_id: character.ownerUserId,
      name: character.name,
      edition: character.edition,
      ancestry_slug: character.ancestrySlug,
      class_slug: character.classSlug,
      background_slug: character.backgroundSlug,
      level: character.level,
      data_json: JSON.stringify(data),
      created_at: character.createdAt,
      updated_at: nowIso(),
    });

    // Create campaign event
    await createEvent({
      campaignId,
      eventType: 'item_granted',
      title: `Item granted: ${body.item?.name || 'Item'}`,
      description: `DM granted item to character`,
      payload: { item: body.item },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: user.id,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'item_granted',
      targetType: 'character',
      targetId: characterId,
      meta: { itemName: body.item?.name },
    });

    res.status(200).json({ character: updated });
  } catch (error) {
    console.error('handleGrantItem error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleApplyCondition(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const user = req.user;
    const body = req.body;

    if (!body.condition) {
      return res.status(400).json({ message: 'condition is required' });
    }

    // Create event to apply condition
    const event = await createEvent({
      campaignId,
      eventType: 'condition_applied',
      title: `Condition applied: ${body.condition}`,
      description: body.source || 'DM applied condition',
      payload: {
        conditionName: body.condition,
        source: body.source || 'DM',
        expiresAt: body.expiresAt || null,
      },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: user.id,
    });

    // Apply the event
    await applyEvent(campaignId, event.id, { actorUserId: user.id });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'condition_applied',
      targetType: 'character',
      targetId: characterId,
      meta: { condition: body.condition, source: body.source },
    });

    // Emit SSE event
    campaignEventBus.emit(campaignId, 'condition_applied', {
      characterId,
      condition: body.condition,
      source: body.source || 'DM',
    });

    res.status(200).json({ applied: true });
  } catch (error) {
    console.error('handleApplyCondition error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleRemoveCondition(req, res) {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const characterId = req.params.characterId || req.params.cId;
    const condition = req.params.condition || req.params.cond;
    const user = req.user;

    // Delete condition from character_conditions table
    // This requires a new repository method, but for now we'll use the store
    const { withSqlite } = require('../database');
    
    withSqlite((db) => {
      db.prepare(
        'DELETE FROM character_conditions WHERE character_id = ? AND condition_name = ? AND campaign_id = ?'
      ).run(characterId, condition, campaignId);
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'condition_removed',
      targetType: 'character',
      targetId: characterId,
      meta: { condition },
    });

    // Emit SSE event
    campaignEventBus.emit(campaignId, 'condition_removed', {
      characterId,
      condition,
    });

    res.status(200).json({ removed: true });
  } catch (error) {
    console.error('handleRemoveCondition error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleBulkAction(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;
    const body = req.body;

    if (!body.action) {
      return res.status(400).json({ message: 'action is required' });
    }

    if (!body.targets) {
      return res.status(400).json({ message: 'targets is required' });
    }

    // Resolve targets
    let targetIds = [];
    if (body.targets === 'all') {
      const members = await getMembersByCampaign(campaignId);
      targetIds = members
        .filter(m => m.status === 'accepted')
        .map(m => m.characterId);
    } else if (Array.isArray(body.targets)) {
      targetIds = body.targets;
    } else {
      return res.status(400).json({ message: 'targets must be "all" or an array of character IDs' });
    }

    const results = [];
    let levelUpAvailable = false;

    for (const characterId of targetIds) {
      try {
        // Set up mock request for individual handlers
        const mockReq = {
          params: { id: campaignId, characterId },
          user,
          body: body.payload || {},
        };
        const mockRes = {
          statusCode: 200,
          data: null,
          status: function(code) {
            this.statusCode = code;
            return this;
          },
          json: function(data) {
            this.data = data;
            return this;
          },
        };

        if (body.action === 'award-xp') {
          await handleAwardXP(mockReq, mockRes);
          if (mockRes.data?.levelUpAvailable) {
            levelUpAvailable = true;
          }
        } else if (body.action === 'apply-damage') {
          await handleApplyDamage(mockReq, mockRes);
        } else if (body.action === 'apply-healing') {
          await handleApplyHealing(mockReq, mockRes);
        } else if (body.action === 'apply-condition') {
          await handleApplyCondition(mockReq, mockRes);
        } else {
          results.push({ characterId, error: 'Unknown action' });
          continue;
        }

        results.push({
          characterId,
          success: mockRes.statusCode >= 200 && mockRes.statusCode < 300,
          data: mockRes.data,
        });
      } catch (error) {
        results.push({
          characterId,
          error: error.message,
        });
      }
    }

    res.status(200).json({ results, levelUpAvailable });
  } catch (error) {
    console.error('handleBulkAction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Session Routes (Task 6)
 */

async function handleCreateSession(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;
    const body = req.body;

    // Get current session count
    const sessions = await getSessionsByCampaign(campaignId);
    const sessionNumber = sessions.length + 1;

    const session = await createSession({
      campaignId,
      sessionNumber,
      title: body.title,
      summary: body.summary,
      sessionDate: body.sessionDate,
      durationMins: body.durationMins,
      attendance: body.attendance || [],
      createdByUserId: user.id,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'session_created',
      targetType: 'campaign_session',
      targetId: session.id,
      meta: { sessionNumber, title: body.title },
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error('handleCreateSession error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGetSessions(req, res) {
  try {
    const campaignId = req.params.id;
    const sessions = await getSessionsByCampaign(campaignId);
    res.status(200).json({ sessions });
  } catch (error) {
    console.error('handleGetSessions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateSession(req, res) {
  try {
    const campaignId = req.params.id;
    const sessionId = req.params.sessionId || req.params.sId;
    const user = req.user;
    const body = req.body;

    const updated = await updateSession(campaignId, sessionId, {
      title: body.title,
      summary: body.summary,
      sessionDate: body.sessionDate,
      durationMins: body.durationMins,
      attendance: body.attendance,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'session_updated',
      targetType: 'campaign_session',
      targetId: sessionId,
      meta: {},
    });

    res.status(200).json({ session: updated });
  } catch (error) {
    console.error('handleUpdateSession error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateAttendance(req, res) {
  try {
    const campaignId = req.params.id;
    const sessionId = req.params.sessionId || req.params.sId;
    const user = req.user;
    const body = req.body;

    if (!Array.isArray(body.attendance)) {
      return res.status(400).json({ message: 'attendance must be an array' });
    }

    const updated = await updateSession(campaignId, sessionId, {
      attendance: body.attendance,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'attendance_updated',
      targetType: 'campaign_session',
      targetId: sessionId,
      meta: { attendance: body.attendance },
    });

    res.status(200).json({ session: updated });
  } catch (error) {
    console.error('handleUpdateAttendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Event Routes (Task 6)
 */

async function handleCreateEvent(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;
    const body = req.body;

    if (!body.eventType) {
      return res.status(400).json({ message: 'eventType is required' });
    }

    const event = await createEvent({
      campaignId,
      sessionId: body.sessionId || null,
      title: body.title,
      description: body.description,
      eventType: body.eventType,
      payload: body.payload || {},
      appliesTo: body.appliesTo,
      createdByUserId: user.id,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'event_created',
      targetType: 'campaign_event',
      targetId: event.id,
      meta: { eventType: body.eventType, title: body.title },
    });

    res.status(201).json({ event });
  } catch (error) {
    console.error('handleCreateEvent error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGetEvents(req, res) {
  try {
    const campaignId = req.params.id;
    const type = req.query.type || req.query.eventType;
    const sessionId = req.query.sessionId;

    const events = await getEventsByCampaign(campaignId, { type, sessionId });
    res.status(200).json({ events });
  } catch (error) {
    console.error('handleGetEvents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleApplyEvent(req, res) {
  try {
    const campaignId = req.params.id;
    const eventId = req.params.eventId || req.params.eId;
    const user = req.user;
    const body = req.body;

    const result = await applyEvent(campaignId, eventId, {
      distributeToCharacterId: body.distributeToCharacterId,
      actorUserId: user.id,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'event_applied',
      targetType: 'campaign_event',
      targetId: eventId,
      meta: { distributeToCharacterId: body.distributeToCharacterId },
    });

    // Emit SSE event for loot_updated if this was a loot event
    const event = await getEventById(campaignId, eventId);
    if (event && event.eventType === 'loot' && body.distributeToCharacterId) {
      campaignEventBus.emit(campaignId, 'loot_updated', {
        eventId,
        action: 'distributed',
        characterId: body.distributeToCharacterId,
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('handleApplyEvent error:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

/**
 * Compendium Routes (Task 7)
 */

async function handleGetCompendium(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;
    const campaign = req.campaign || await getCampaignById(campaignId);

    const type = req.query.type;
    const search = req.query.search || req.query.q;
    const tag = req.query.tag;

    // Check if user is DM or admin
    const isDM = campaign.dmUserId === user.id;
    const isAdmin = user.role === 'admin';
    const includeHidden = isDM || isAdmin;

    const entries = await searchCompendium(campaignId, {
      type,
      search,
      tag,
      includeHidden,
    });

    res.status(200).json({ entries });
  } catch (error) {
    console.error('handleGetCompendium error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGetCompendiumEntry(req, res) {
  try {
    const campaignId = req.params.id;
    const entryId = req.params.entryId || req.params.eId;
    const user = req.user;
    const campaign = req.campaign || await getCampaignById(campaignId);

    const entry = await getCompendiumEntry(campaignId, entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Compendium entry not found' });
    }

    // Check if user is DM or admin
    const isDM = campaign.dmUserId === user.id;
    const isAdmin = user.role === 'admin';

    // If entry is DM-only and user is not DM/admin, return 403
    if (!entry.isPlayerVisible && !isDM && !isAdmin) {
      return res.status(403).json({ message: 'Access denied to DM-only entry' });
    }

    res.status(200).json({ entry });
  } catch (error) {
    console.error('handleGetCompendiumEntry error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleCreateCompendiumEntry(req, res) {
  try {
    const campaignId = req.params.id;
    const user = req.user;
    const body = req.body;

    if (!body.contentType) {
      return res.status(400).json({ message: 'contentType is required' });
    }

    if (!body.name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const entry = await createCompendiumEntry({
      campaignId,
      contentType: body.contentType,
      name: body.name,
      description: body.description,
      data: body.data || {},
      tags: body.tags || [],
      isPlayerVisible: body.isPlayerVisible !== false,
      createdByUserId: user.id,
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'compendium_entry_created',
      targetType: 'campaign_compendium',
      targetId: entry.id,
      meta: { contentType: body.contentType, name: body.name },
    });

    res.status(201).json({ entry });
  } catch (error) {
    console.error('handleCreateCompendiumEntry error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleUpdateCompendiumEntry(req, res) {
  try {
    const campaignId = req.params.id;
    const entryId = req.params.entryId || req.params.eId;
    const user = req.user;
    const body = req.body;

    const updated = await updateCompendiumEntry(campaignId, entryId, {
      name: body.name,
      description: body.description,
      contentType: body.contentType,
      data: body.data,
      tags: body.tags,
      isPlayerVisible: body.isPlayerVisible,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Compendium entry not found' });
    }

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'compendium_entry_updated',
      targetType: 'campaign_compendium',
      targetId: entryId,
      meta: {},
    });

    res.status(200).json({ entry: updated });
  } catch (error) {
    console.error('handleUpdateCompendiumEntry error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleDeleteCompendiumEntry(req, res) {
  try {
    const campaignId = req.params.id;
    const entryId = req.params.entryId || req.params.eId;
    const user = req.user;

    await deleteCompendiumEntry(campaignId, entryId);

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'compendium_entry_deleted',
      targetType: 'campaign_compendium',
      targetId: entryId,
      meta: {},
    });

    res.status(200).json({ deleted: true });
  } catch (error) {
    console.error('handleDeleteCompendiumEntry error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function handleGrantCompendiumEntry(req, res) {
  try {
    const campaignId = req.params.id;
    const entryId = req.params.entryId || req.params.eId;
    const user = req.user;
    const body = req.body;

    if (!body.characterId) {
      return res.status(400).json({ message: 'characterId is required' });
    }

    const entry = await getCompendiumEntry(campaignId, entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Compendium entry not found' });
    }

    const character = await getCharacterById(body.characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    const data = typeof character.dataJson === 'string' 
      ? JSON.parse(character.dataJson) 
      : character.dataJson;

    // Determine where to add the entry based on content type
    if (entry.contentType === 'item' || entry.contentType === 'weapon' || entry.contentType === 'armor') {
      data.inventory = Array.isArray(data.inventory) ? data.inventory : [];
      data.inventory.push(entry.data);
    } else if (entry.contentType === 'spell') {
      data.spells = Array.isArray(data.spells) ? data.spells : [];
      data.spells.push(entry.data);
    } else if (entry.contentType === 'feature') {
      data.features = Array.isArray(data.features) ? data.features : [];
      data.features.push(entry.data);
    } else {
      return res.status(400).json({ message: `Cannot grant content type: ${entry.contentType}` });
    }

    const updated = await updateCharacter({
      id: body.characterId,
      owner_user_id: character.ownerUserId,
      name: character.name,
      edition: character.edition,
      ancestry_slug: character.ancestrySlug,
      class_slug: character.classSlug,
      background_slug: character.backgroundSlug,
      level: character.level,
      data_json: JSON.stringify(data),
      created_at: character.createdAt,
      updated_at: nowIso(),
    });

    await writeAuditEntry({
      campaignId,
      actorUserId: user.id,
      action: 'compendium_entry_granted',
      targetType: 'character',
      targetId: body.characterId,
      meta: { entryId, entryName: entry.name, contentType: entry.contentType },
    });

    res.status(200).json({ character: updated });
  } catch (error) {
    console.error('handleGrantCompendiumEntry error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  handleCreateCampaign,
  handleListCampaigns,
  handleGetPublicCampaigns,
  handleGetCampaign,
  handleUpdateCampaign,
  handleDeleteCampaign,
  handleArchiveCampaign,
  handleTransferCampaign,
  handleInviteMember,
  handleCreateInviteLink,
  handleGetMembers,
  handleUpdateMember,
  handleUpdateMemberNotes,
  handleRemoveMember,
  handleGetPendingInvites,
  handleJoinCampaign,
  handleGetHouseRules,
  handleUpdateHouseRules,
  handleGetAuditLog,
  handleGetDMCharacterSheet,
  handlePatchDMCharacterSheet,
  handleAwardXP,
  handleApplyDamage,
  handleApplyHealing,
  handleGrantItem,
  handleApplyCondition,
  handleRemoveCondition,
  handleBulkAction,
  handleCreateSession,
  handleGetSessions,
  handleUpdateSession,
  handleUpdateAttendance,
  handleCreateEvent,
  handleGetEvents,
  handleApplyEvent,
  handleGetCompendium,
  handleGetCompendiumEntry,
  handleCreateCompendiumEntry,
  handleUpdateCompendiumEntry,
  handleDeleteCompendiumEntry,
  handleGrantCompendiumEntry,
  requireDM,
  requireCampaignMember,
  requireCampaignCharacterAccess,
};
