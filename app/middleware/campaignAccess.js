const { getCampaignById, getMemberByCharacter, getMembersByCampaign } = require('../data/campaignRepository');
const { getCharacterById } = require('../store');

/**
 * Middleware that loads a campaign and verifies the user is the DM or an admin.
 * Attaches the campaign to `req.campaign`.
 * Returns 403 if user is not DM/admin.
 * Caches the campaign on `req.campaign` to avoid duplicate DB queries.
 */
async function requireDM(req, res, next) {
  try {
    const campaignId = req.params.campaignId || req.params.id;
    if (!campaignId) {
      return res.status(400).json({ message: 'Campaign ID required' });
    }

    // Load campaign if not already cached
    if (!req.campaign) {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      req.campaign = campaign;
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user is DM or admin
    if (user.id !== req.campaign.dmUserId && user.role !== 'admin') {
      return res.status(403).json({ message: 'DM or admin access required' });
    }

    next();
  } catch (error) {
    console.error('requireDM error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Middleware that loads a campaign and verifies the user is an accepted member,
 * the DM, or an admin. Attaches the campaign to `req.campaign` and the member
 * record to `req.campaignMember`. Returns 403 if user is not a member.
 * 
 * If a characterId is provided in params or body, it will verify that specific
 * character is an accepted member. Otherwise, it checks if the user has ANY
 * accepted member record in the campaign.
 */
async function requireCampaignMember(req, res, next) {
  try {
    const campaignId = req.params.campaignId || req.params.id;
    if (!campaignId) {
      return res.status(400).json({ message: 'Campaign ID required' });
    }

    // Load campaign if not already cached
    if (!req.campaign) {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      req.campaign = campaign;
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user is DM or admin - they have automatic access
    if (user.id === req.campaign.dmUserId || user.role === 'admin') {
      // DM/admin don't need a member record
      req.campaignMember = null;
      return next();
    }

    const characterId = req.params.characterId || req.body.characterId;
    
    if (characterId) {
      // Verify specific character is an accepted member
      const member = await getMemberByCharacter(campaignId, characterId);
      if (!member || member.status !== 'accepted') {
        return res.status(403).json({ message: 'Not an accepted member of this campaign' });
      }

      // Verify the character belongs to the user
      const character = await getCharacterById(characterId);
      if (!character || character.ownerUserId !== user.id) {
        return res.status(403).json({ message: 'Character does not belong to you' });
      }

      req.campaignMember = member;
    } else {
      // Check if user has any accepted member record in this campaign
      const members = await getMembersByCampaign(campaignId);
      const userMember = members.find(m => 
        m.userId === user.id && m.status === 'accepted'
      );
      
      if (!userMember) {
        return res.status(403).json({ message: 'Not an accepted member of this campaign' });
      }

      req.campaignMember = userMember;
    }

    next();
  } catch (error) {
    console.error('requireCampaignMember error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Middleware that verifies a character belongs to an accepted member of the campaign
 * and that the requesting user has access to that character (owner, DM, or admin).
 * Attaches campaign, member, and character to req.
 * Returns 403 if access denied.
 */
async function requireCampaignCharacterAccess(req, res, next) {
  try {
    const campaignId = req.params.campaignId || req.params.id;
    const characterId = req.params.characterId;
    
    if (!campaignId || !characterId) {
      return res.status(400).json({ message: 'Campaign ID and Character ID required' });
    }

    // Load campaign if not already cached
    if (!req.campaign) {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      req.campaign = campaign;
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if character is an accepted member of this campaign
    const member = await getMemberByCharacter(campaignId, characterId);
    if (!member || member.status !== 'accepted') {
      return res.status(403).json({ message: 'Character is not an accepted member of this campaign' });
    }

    // Get character details
    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }

    // Check access: user is character owner, DM, or admin
    const isOwner = character.ownerUserId === user.id;
    const isDM = user.id === req.campaign.dmUserId;
    const isAdmin = user.role === 'admin';

    if (!isOwner && !isDM && !isAdmin) {
      return res.status(403).json({ message: 'Access denied to this character' });
    }

    req.campaignMember = member;
    req.campaignCharacter = character;
    next();
  } catch (error) {
    console.error('requireCampaignCharacterAccess error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  requireDM,
  requireCampaignMember,
  requireCampaignCharacterAccess,
};