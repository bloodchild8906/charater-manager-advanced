/**
 * Campaign SSE Stream Client
 * Handles real-time event streaming from the server
 */

const state = {
  eventSource: null,
  campaignId: null,
  connected: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000, // Start at 1 second
  maxReconnectDelay: 30000, // Max 30 seconds
  eventHandlers: {},
};

/**
 * Connect to SSE stream
 */
export function connect(campaignId) {
  if (state.connected && state.campaignId === campaignId) {
    console.log('Already connected to campaign stream');
    return;
  }

  disconnect();

  state.campaignId = campaignId;
  
  try {
    state.eventSource = new EventSource(`/api/campaigns/${campaignId}/stream`);

    state.eventSource.onopen = () => {
      console.log('Campaign stream connected');
      state.connected = true;
      state.reconnectAttempts = 0;
      state.reconnectDelay = 1000;
    };

    state.eventSource.onerror = (error) => {
      console.error('Campaign stream error:', error);
      state.connected = false;

      // Auto-reconnect with exponential backoff
      if (state.reconnectAttempts < state.maxReconnectAttempts) {
        state.reconnectAttempts += 1;
        const delay = Math.min(
          state.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1),
          state.maxReconnectDelay
        );

        console.log(`Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts})`);

        setTimeout(() => {
          if (state.campaignId) {
            connect(state.campaignId);
          }
        }, delay);
      } else {
        console.error('Max reconnect attempts reached');
      }
    };

    // Register event listeners for specific event types
    registerEventListeners();

  } catch (error) {
    console.error('Failed to connect to campaign stream:', error);
    state.connected = false;
  }
}

/**
 * Disconnect from SSE stream
 */
export function disconnect() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  state.connected = false;
  state.campaignId = null;
  state.reconnectAttempts = 0;
}

/**
 * Register event listeners for SSE events
 */
function registerEventListeners() {
  if (!state.eventSource) return;

  // HP Updated
  state.eventSource.addEventListener('hp_updated', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('hp_updated', data);
    } catch (error) {
      console.error('Error parsing hp_updated event:', error);
    }
  });

  // Condition Applied
  state.eventSource.addEventListener('condition_applied', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('condition_applied', data);
    } catch (error) {
      console.error('Error parsing condition_applied event:', error);
    }
  });

  // Condition Removed
  state.eventSource.addEventListener('condition_removed', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('condition_removed', data);
    } catch (error) {
      console.error('Error parsing condition_removed event:', error);
    }
  });

  // Initiative Updated
  state.eventSource.addEventListener('initiative_updated', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('initiative_updated', data);
    } catch (error) {
      console.error('Error parsing initiative_updated event:', error);
    }
  });

  // Turn Advanced
  state.eventSource.addEventListener('turn_advanced', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('turn_advanced', data);
    } catch (error) {
      console.error('Error parsing turn_advanced event:', error);
    }
  });

  // Dice Roll Broadcast
  state.eventSource.addEventListener('dice_roll_broadcast', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('dice_roll_broadcast', data);
    } catch (error) {
      console.error('Error parsing dice_roll_broadcast event:', error);
    }
  });

  // DM Broadcast
  state.eventSource.addEventListener('dm_broadcast', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('dm_broadcast', data);
    } catch (error) {
      console.error('Error parsing dm_broadcast event:', error);
    }
  });

  // Loot Updated
  state.eventSource.addEventListener('loot_updated', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('loot_updated', data);
    } catch (error) {
      console.error('Error parsing loot_updated event:', error);
    }
  });

  // Session Started
  state.eventSource.addEventListener('session_started', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('session_started', data);
    } catch (error) {
      console.error('Error parsing session_started event:', error);
    }
  });

  // Session Ended
  state.eventSource.addEventListener('session_ended', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('session_ended', data);
    } catch (error) {
      console.error('Error parsing session_ended event:', error);
    }
  });

  // Member Joined
  state.eventSource.addEventListener('member_joined', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('member_joined', data);
    } catch (error) {
      console.error('Error parsing member_joined event:', error);
    }
  });

  // Catch Up (state sync)
  state.eventSource.addEventListener('catch_up', (event) => {
    try {
      const data = JSON.parse(event.data);
      dispatchEvent('catch_up', data);
    } catch (error) {
      console.error('Error parsing catch_up event:', error);
    }
  });
}

/**
 * Register a handler for a specific event type
 */
export function on(eventType, handler) {
  if (!state.eventHandlers[eventType]) {
    state.eventHandlers[eventType] = [];
  }

  state.eventHandlers[eventType].push(handler);
}

/**
 * Unregister a handler for a specific event type
 */
export function off(eventType, handler) {
  if (!state.eventHandlers[eventType]) return;

  state.eventHandlers[eventType] = state.eventHandlers[eventType].filter(h => h !== handler);
}

/**
 * Dispatch an event to all registered handlers
 */
function dispatchEvent(eventType, data) {
  const handlers = state.eventHandlers[eventType] || [];

  handlers.forEach(handler => {
    try {
      handler(data);
    } catch (error) {
      console.error(`Error in ${eventType} handler:`, error);
    }
  });
}

/**
 * Check if connected
 */
export function isConnected() {
  return state.connected;
}

/**
 * Get current campaign ID
 */
export function getCurrentCampaignId() {
  return state.campaignId;
}

/**
 * Export state for debugging
 */
export function getCampaignStreamState() {
  return {
    connected: state.connected,
    campaignId: state.campaignId,
    reconnectAttempts: state.reconnectAttempts,
    eventHandlerCounts: Object.keys(state.eventHandlers).reduce((acc, key) => {
      acc[key] = state.eventHandlers[key].length;
      return acc;
    }, {}),
  };
}
