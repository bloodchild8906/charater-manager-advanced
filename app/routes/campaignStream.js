const { requireCampaignMember } = require('../middleware/campaignAccess');
const { getMembersByCampaign } = require('../data/campaignRepository');
const { getCharacterById } = require('../store');
const campaignEventBus = require('../services/campaignEventBus');

/**
 * SSE Stream Route for Campaign Real-Time Updates
 * 
 * GET /api/campaigns/:id/stream
 * 
 * Opens a Server-Sent Events connection for real-time campaign updates.
 */

async function handleCampaignStream(req, res) {
  const campaignId = req.params.id;
  const user = req.user;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection': 'keep-alive',
  });

  // Register connection
  const connection = campaignEventBus.register(campaignId, res);

  // Send initial catch-up event with current state
  try {
    const members = await getMembersByCampaign(campaignId);
    const hpGrid = [];
    const conditions = [];

    for (const member of members) {
      if (member.status !== 'accepted') {
        continue;
      }

      try {
        const character = await getCharacterById(member.characterId);
        if (!character) {
          continue;
        }

        const data = typeof character.dataJson === 'string' 
          ? JSON.parse(character.dataJson) 
          : character.dataJson;

        hpGrid.push({
          characterId: character.id,
          name: data.name || character.name,
          currentHp: data.hp?.current ?? 0,
          maxHp: data.hp?.max ?? 0,
        });

        // Get conditions from character_conditions table
        // For now, we'll skip this as it requires database access
        // In a full implementation, we'd query character_conditions here
      } catch (error) {
        console.error(`Error loading character ${member.characterId}:`, error);
      }
    }

    connection.send('catch_up', {
      hpGrid,
      conditions,
      initiativeOrder: [],
    });
  } catch (error) {
    console.error('Error sending catch-up event:', error);
  }

  // Set up heartbeat
  const heartbeatInterval = setInterval(() => {
    connection.sendComment('heartbeat');
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    campaignEventBus.deregister(campaignId, connection);
  });

  req.on('error', (error) => {
    console.error('SSE connection error:', error);
    clearInterval(heartbeatInterval);
    campaignEventBus.deregister(campaignId, connection);
  });
}

module.exports = {
  handleCampaignStream,
  requireCampaignMember,
};
