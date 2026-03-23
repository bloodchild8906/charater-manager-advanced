import { escapeHtml, renderMetaBits, titleize } from './utils.js';

/**
 * Campaign Events Tab State
 */
const state = {
  events: [],
  loading: false,
  error: null,
  showLogForm: false,
  logFormData: {
    title: '',
    description: '',
    eventType: 'world_event',
    payload: {},
    appliesTo: null,
    sessionId: null,
  },
  sessions: [],
  members: [],
  viewMode: 'timeline', // 'timeline' or 'loot'
};

/**
 * API helpers
 */
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const bodyText = await response.text();
  let body = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { message: bodyText };
    }
  }

  if (!response.ok) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }

  return body;
}

/**
 * Load events for a campaign
 */
export async function loadEvents(campaignId, filters = {}) {
  if (!campaignId) {
    state.events = [];
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const queryParams = new URLSearchParams();
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.sessionId) queryParams.append('sessionId', filters.sessionId);

    const payload = await api(`/api/campaigns/${campaignId}/events?${queryParams.toString()}`, {
      method: 'GET',
    });
    state.events = payload.events || [];
  } catch (error) {
    console.error('loadEvents error:', error);
    state.error = error.message;
    state.events = [];
  } finally {
    state.loading = false;
  }
}

/**
 * Load sessions for event form
 */
export async function loadSessions(campaignId) {
  if (!campaignId) {
    state.sessions = [];
    return;
  }

  try {
    const payload = await api(`/api/campaigns/${campaignId}/sessions`, { method: 'GET' });
    state.sessions = payload.sessions || [];
  } catch (error) {
    console.error('loadSessions error:', error);
    state.sessions = [];
  }
}

/**
 * Load members for target selection
 */
export async function loadMembers(campaignId) {
  if (!campaignId) {
    state.members = [];
    return;
  }

  try {
    const payload = await api(`/api/campaigns/${campaignId}/members`, { method: 'GET' });
    state.members = (payload.members || []).filter(m => m.status === 'accepted');
  } catch (error) {
    console.error('loadMembers error:', error);
    state.members = [];
  }
}

/**
 * Create a new event
 */
export async function createEvent(campaignId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        title: state.logFormData.title,
        description: state.logFormData.description,
        eventType: state.logFormData.eventType,
        payload: JSON.stringify(state.logFormData.payload),
        appliesTo: state.logFormData.appliesTo ? JSON.stringify(state.logFormData.appliesTo) : null,
        sessionId: state.logFormData.sessionId || null,
      }),
    });

    state.events.unshift(payload.event);
    resetLogForm();
    return payload.event;
  } catch (error) {
    console.error('createEvent error:', error);
    throw error;
  }
}

/**
 * Apply an event
 */
export async function applyEvent(campaignId, eventId, targetCharacterId = null) {
  try {
    const body = targetCharacterId ? { targetCharacterId } : {};
    const payload = await api(`/api/campaigns/${campaignId}/events/${eventId}/apply`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Update local state
    const event = state.events.find(e => e.id === eventId);
    if (event) {
      event.appliedAt = payload.event.appliedAt;
      if (targetCharacterId) {
        event.distributedTo = targetCharacterId;
        event.distributedAt = payload.event.distributedAt;
      }
    }

    return payload.event;
  } catch (error) {
    console.error('applyEvent error:', error);
    throw error;
  }
}

/**
 * Form management
 */
export function openLogForm() {
  state.showLogForm = true;
  resetLogForm();
}

export function closeLogForm() {
  state.showLogForm = false;
}

export function updateLogFormField(field, value) {
  if (field === 'eventType') {
    // Reset payload when event type changes
    state.logFormData.payload = {};
  }
  state.logFormData[field] = value;
}

export function updatePayloadField(field, value) {
  state.logFormData.payload[field] = value;
}

export function setViewMode(mode) {
  state.viewMode = mode;
}

function resetLogForm() {
  state.logFormData = {
    title: '',
    description: '',
    eventType: 'world_event',
    payload: {},
    appliesTo: null,
    sessionId: null,
  };
}

/**
 * Render functions
 */
function renderEventCard(event, campaignId, isDM) {
  const date = event.createdAt ? new Date(event.createdAt).toLocaleDateString() : 'No date';
  const isApplied = !!event.appliedAt;
  const isLoot = event.eventType === 'loot';
  const isDistributed = isLoot && !!event.distributedTo;

  let payload = {};
  try {
    payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload || {};
  } catch {
    payload = {};
  }

  return `
    <div class="event-card ${isApplied ? 'event-card--applied' : ''}" data-event-id="${escapeHtml(event.id)}">
      <div class="event-card__header">
        <div>
          <div class="event-card__type">
            <span class="badge badge--${getEventTypeBadgeClass(event.eventType)}">
              ${escapeHtml(titleize(event.eventType, ''))}
            </span>
            ${isApplied ? '<span class="badge badge--success">Applied</span>' : ''}
            ${isDistributed ? '<span class="badge badge--muted">Distributed</span>' : ''}
          </div>
          <h3 class="event-card__title">${escapeHtml(event.title || 'Untitled Event')}</h3>
        </div>
        <div class="event-card__meta">
          ${renderMetaBits([date])}
        </div>
      </div>
      
      ${event.description ? `
        <div class="event-card__description">
          <p>${escapeHtml(event.description)}</p>
        </div>
      ` : ''}
      
      ${renderEventPayload(event.eventType, payload)}
      
      ${isDM && !isApplied && !isLoot ? `
        <div class="event-card__actions">
          <button 
            class="button primary small" 
            data-action="apply-event"
            data-campaign-id="${escapeHtml(campaignId)}"
            data-event-id="${escapeHtml(event.id)}"
          >
            Apply Event
          </button>
        </div>
      ` : ''}
      
      ${isDM && isLoot && !isDistributed ? `
        <div class="event-card__actions">
          <button 
            class="button primary small" 
            data-action="distribute-loot"
            data-campaign-id="${escapeHtml(campaignId)}"
            data-event-id="${escapeHtml(event.id)}"
          >
            Distribute to Character
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function getEventTypeBadgeClass(eventType) {
  const map = {
    loot: 'primary',
    xp_award: 'success',
    damage: 'danger',
    condition_applied: 'warning',
    world_event: 'info',
  };
  return map[eventType] || 'muted';
}

function renderEventPayload(eventType, payload) {
  if (!payload || Object.keys(payload).length === 0) {
    return '';
  }

  if (eventType === 'loot') {
    return `
      <div class="event-payload">
        <div class="loot-item">
          <strong>${escapeHtml(payload.name || 'Unknown Item')}</strong>
          ${payload.quantity ? `<span class="muted">x${escapeHtml(String(payload.quantity))}</span>` : ''}
          ${payload.description ? `<p class="muted small">${escapeHtml(payload.description)}</p>` : ''}
        </div>
      </div>
    `;
  }

  if (eventType === 'xp_award') {
    return `
      <div class="event-payload">
        <strong>XP Amount:</strong> ${escapeHtml(String(payload.amount || 0))}
      </div>
    `;
  }

  if (eventType === 'damage') {
    return `
      <div class="event-payload">
        <strong>Damage:</strong> ${escapeHtml(String(payload.amount || 0))} ${payload.damageType ? `(${escapeHtml(payload.damageType)})` : ''}
      </div>
    `;
  }

  if (eventType === 'condition_applied') {
    return `
      <div class="event-payload">
        <strong>Condition:</strong> ${escapeHtml(payload.condition || 'Unknown')}
      </div>
    `;
  }

  return '';
}

function renderPayloadFields(eventType) {
  if (eventType === 'loot') {
    return `
      <label class="field">
        <span class="label">Item Name *</span>
        <input 
          class="input" 
          name="payload-name" 
          placeholder="Sword of Destiny" 
          value="${escapeHtml(state.logFormData.payload.name || '')}"
          required
        />
      </label>
      
      <label class="field">
        <span class="label">Quantity</span>
        <input 
          class="input" 
          type="number" 
          name="payload-quantity" 
          min="1" 
          value="${escapeHtml(String(state.logFormData.payload.quantity || 1))}"
        />
      </label>
      
      <label class="field">
        <span class="label">Description</span>
        <textarea 
          class="input" 
          name="payload-description" 
          rows="2"
        >${escapeHtml(state.logFormData.payload.description || '')}</textarea>
      </label>
    `;
  }

  if (eventType === 'xp_award') {
    return `
      <label class="field">
        <span class="label">XP Amount *</span>
        <input 
          class="input" 
          type="number" 
          name="payload-amount" 
          min="0" 
          value="${escapeHtml(String(state.logFormData.payload.amount || 0))}"
          required
        />
      </label>
    `;
  }

  if (eventType === 'damage') {
    return `
      <label class="field">
        <span class="label">Damage Amount *</span>
        <input 
          class="input" 
          type="number" 
          name="payload-amount" 
          min="0" 
          value="${escapeHtml(String(state.logFormData.payload.amount || 0))}"
          required
        />
      </label>
      
      <label class="field">
        <span class="label">Damage Type</span>
        <input 
          class="input" 
          name="payload-damageType" 
          placeholder="Fire, Cold, etc." 
          value="${escapeHtml(state.logFormData.payload.damageType || '')}"
        />
      </label>
    `;
  }

  if (eventType === 'condition_applied') {
    return `
      <label class="field">
        <span class="label">Condition *</span>
        <select class="select" name="payload-condition" required>
          <option value="">Select condition...</option>
          <option value="Blinded">Blinded</option>
          <option value="Charmed">Charmed</option>
          <option value="Deafened">Deafened</option>
          <option value="Frightened">Frightened</option>
          <option value="Grappled">Grappled</option>
          <option value="Incapacitated">Incapacitated</option>
          <option value="Invisible">Invisible</option>
          <option value="Paralyzed">Paralyzed</option>
          <option value="Petrified">Petrified</option>
          <option value="Poisoned">Poisoned</option>
          <option value="Prone">Prone</option>
          <option value="Restrained">Restrained</option>
          <option value="Stunned">Stunned</option>
          <option value="Unconscious">Unconscious</option>
          <option value="Exhaustion">Exhaustion</option>
        </select>
      </label>
    `;
  }

  return '';
}

function renderLogEventForm(campaignId, isDM) {
  if (!isDM || !state.showLogForm) {
    return '';
  }

  return `
    <div class="log-event-form">
      <div class="log-event-form__header">
        <h3>Log New Event</h3>
        <button class="button-icon" data-action="close-log-event-form">&times;</button>
      </div>
      
      <form id="log-event-form">
        <label class="field">
          <span class="label">Event Title *</span>
          <input 
            class="input" 
            name="title" 
            placeholder="The Dragon Attack" 
            value="${escapeHtml(state.logFormData.title)}"
            required
          />
        </label>
        
        <label class="field">
          <span class="label">Event Type *</span>
          <select 
            class="select" 
            name="eventType" 
            data-action="change-event-type"
            required
          >
            <option value="world_event" ${state.logFormData.eventType === 'world_event' ? 'selected' : ''}>World Event</option>
            <option value="loot" ${state.logFormData.eventType === 'loot' ? 'selected' : ''}>Loot</option>
            <option value="xp_award" ${state.logFormData.eventType === 'xp_award' ? 'selected' : ''}>XP Award</option>
            <option value="damage" ${state.logFormData.eventType === 'damage' ? 'selected' : ''}>Damage</option>
            <option value="condition_applied" ${state.logFormData.eventType === 'condition_applied' ? 'selected' : ''}>Condition Applied</option>
          </select>
        </label>
        
        <label class="field">
          <span class="label">Description</span>
          <textarea 
            class="input" 
            name="description" 
            rows="3" 
            placeholder="What happened..."
          >${escapeHtml(state.logFormData.description)}</textarea>
        </label>
        
        <div id="payload-fields">
          ${renderPayloadFields(state.logFormData.eventType)}
        </div>
        
        <label class="field">
          <span class="label">Session</span>
          <select class="select" name="sessionId">
            <option value="">No session</option>
            ${state.sessions.map(session => `
              <option value="${escapeHtml(session.id)}" ${state.logFormData.sessionId === session.id ? 'selected' : ''}>
                Session ${escapeHtml(String(session.sessionNumber || '?'))}: ${escapeHtml(session.title || 'Untitled')}
              </option>
            `).join('')}
          </select>
        </label>
        
        <div class="form-actions">
          <button type="button" class="button subtle" data-action="close-log-event-form">Cancel</button>
          <button 
            type="submit" 
            class="button primary" 
            data-action="submit-log-event"
            data-campaign-id="${escapeHtml(campaignId)}"
          >
            Log Event
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderLootChest(campaignId, isDM) {
  const lootEvents = state.events.filter(e => e.eventType === 'loot' && !e.distributedTo);

  return `
    <div class="loot-chest">
      <div class="loot-chest__header">
        <h3>Party Loot Chest</h3>
        <p class="muted">Undistributed items from events</p>
      </div>
      
      ${lootEvents.length === 0 ? `
        <div class="empty-card">
          <p>No loot in the party chest.</p>
        </div>
      ` : `
        <div class="loot-list">
          ${lootEvents.map(event => renderEventCard(event, campaignId, isDM)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderEventTimeline(campaignId, isDM) {
  // Group events by session
  const eventsBySession = {};
  const eventsWithoutSession = [];

  state.events.forEach(event => {
    if (event.sessionId) {
      if (!eventsBySession[event.sessionId]) {
        eventsBySession[event.sessionId] = [];
      }
      eventsBySession[event.sessionId].push(event);
    } else {
      eventsWithoutSession.push(event);
    }
  });

  return `
    <div class="event-timeline">
      ${Object.keys(eventsBySession).length === 0 && eventsWithoutSession.length === 0 ? `
        <div class="empty-card">
          <p>No events logged yet.</p>
          ${isDM ? '<p class="muted">Log events to track what happens in your campaign.</p>' : ''}
        </div>
      ` : ''}
      
      ${Object.entries(eventsBySession).map(([sessionId, events]) => {
        const session = state.sessions.find(s => s.id === sessionId);
        return `
          <div class="timeline-session">
            <h3 class="timeline-session__title">
              ${session ? `Session ${session.sessionNumber}: ${escapeHtml(session.title || 'Untitled')}` : 'Unknown Session'}
            </h3>
            <div class="timeline-events">
              ${events.map(e => renderEventCard(e, campaignId, isDM)).join('')}
            </div>
          </div>
        `;
      }).join('')}
      
      ${eventsWithoutSession.length > 0 ? `
        <div class="timeline-session">
          <h3 class="timeline-session__title">General Events</h3>
          <div class="timeline-events">
            ${eventsWithoutSession.map(e => renderEventCard(e, campaignId, isDM)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderEventsTab(campaignId, isDM = false, viewMode = 'timeline') {
  state.viewMode = viewMode;

  if (state.loading) {
    return '<div class="loading-spinner">Loading events...</div>';
  }

  if (state.error) {
    return `<div class="error-card">Error loading events: ${escapeHtml(state.error)}</div>`;
  }

  return `
    <div class="events-tab">
      <div class="events-tab__header">
        <div class="view-mode-toggle">
          <button 
            class="button ${state.viewMode === 'timeline' ? 'primary' : 'subtle'}" 
            data-action="set-events-view-mode" 
            data-mode="timeline"
          >
            Timeline
          </button>
          <button 
            class="button ${state.viewMode === 'loot' ? 'primary' : 'subtle'}" 
            data-action="set-events-view-mode" 
            data-mode="loot"
          >
            Loot Chest
          </button>
        </div>
        
        ${isDM ? `
          <button 
            class="button primary" 
            data-action="open-log-event-form"
            data-campaign-id="${escapeHtml(campaignId)}"
          >
            Log New Event
          </button>
        ` : ''}
      </div>
      
      ${renderLogEventForm(campaignId, isDM)}
      
      ${state.viewMode === 'loot' ? renderLootChest(campaignId, isDM) : renderEventTimeline(campaignId, isDM)}
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignEventsState() {
  return state;
}
