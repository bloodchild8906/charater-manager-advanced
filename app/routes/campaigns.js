const { requireDM, requireCampaignMember } = require('../middleware/campaignAccess');
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
} = require('../data/campaignRepository');
const { getCharacterById, listCharacters } = require('../store');

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

    // Filter out dm_notes for non-DM/admin users
    const filteredMembers = members.map(m => {
      if (isDM || isAdmin) {
        return m;
      }
      const { dmNotes, ...rest } = m;
      return rest;
    });

    res.status(200).json({ members: filteredMembers });
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
  requireDM,
  requireCampaignMember,
};
