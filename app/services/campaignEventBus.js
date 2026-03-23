const crypto = require('node:crypto');

/**
 * Campaign Event Bus for SSE (Server-Sent Events)
 * 
 * Manages SSE connections per campaign and broadcasts events to all connected clients.
 */

// Map<campaignId, Set<SSEConnection>>
const connections = new Map();

/**
 * SSE Connection object
 */
class SSEConnection {
  constructor(campaignId, res) {
    this.id = crypto.randomUUID();
    this.campaignId = campaignId;
    this.res = res;
    this.createdAt = Date.now();
  }

  send(eventType, data) {
    try {
      const id = crypto.randomUUID();
      const payload = JSON.stringify(data);
      this.res.write(`id: ${id}\n`);
      this.res.write(`event: ${eventType}\n`);
      this.res.write(`data: ${payload}\n\n`);
    } catch (error) {
      console.error('SSEConnection send error:', error);
    }
  }

  sendComment(comment) {
    try {
      this.res.write(`: ${comment}\n\n`);
    } catch (error) {
      console.error('SSEConnection sendComment error:', error);
    }
  }
}

/**
 * Register a new SSE connection for a campaign
 */
function register(campaignId, res) {
  if (!connections.has(campaignId)) {
    connections.set(campaignId, new Set());
  }

  const connection = new SSEConnection(campaignId, res);
  connections.get(campaignId).add(connection);

  console.log(`SSE connection registered: ${connection.id} for campaign ${campaignId}`);
  return connection;
}

/**
 * Deregister an SSE connection
 */
function deregister(campaignId, connection) {
  const campaignConnections = connections.get(campaignId);
  if (campaignConnections) {
    campaignConnections.delete(connection);
    console.log(`SSE connection deregistered: ${connection.id} for campaign ${campaignId}`);

    // Clean up empty sets
    if (campaignConnections.size === 0) {
      connections.delete(campaignId);
    }
  }
}

/**
 * Emit an event to all connections for a campaign
 */
function emit(campaignId, eventType, payload) {
  const campaignConnections = connections.get(campaignId);
  if (!campaignConnections || campaignConnections.size === 0) {
    return;
  }

  console.log(`SSE emit: ${eventType} to ${campaignConnections.size} connections for campaign ${campaignId}`);

  for (const connection of campaignConnections) {
    connection.send(eventType, payload);
  }
}

/**
 * Get connection count for a campaign
 */
function getConnectionCount(campaignId) {
  const campaignConnections = connections.get(campaignId);
  return campaignConnections ? campaignConnections.size : 0;
}

/**
 * Get all campaign IDs with active connections
 */
function getActiveCampaigns() {
  return Array.from(connections.keys());
}

module.exports = {
  register,
  deregister,
  emit,
  getConnectionCount,
  getActiveCampaigns,
};
