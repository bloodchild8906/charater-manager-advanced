import { escapeHtml, renderMetaBits } from './utils.js';

/**
 * Campaign Sessions Tab State
 */
const state = {
  sessions: [],
  loading: false,
  error: null,
  showLogForm: false,
  logFormData: {
    title: '',
    sessionDate: new Date().toISOString().split('T')[0],
    durationMins: 180,
    summary: '',
    attendance: [],
  },
  members: [],
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
 * Load sessions for a campaign
 */
export async function loadSessions(campaignId) {
  if (!campaignId) {
    state.sessions = [];
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const payload = await api(`/api/campaigns/${campaignId}/sessions`, { method: 'GET' });
    state.sessions = payload.sessions || [];
  } catch (error) {
    console.error('loadSessions error:', error);
    state.error = error.message;
    state.sessions = [];
  } finally {
    state.loading = false;
  }
}

/**
 * Load members for attendance selection
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
 * Create a new session
 */
export async function createSession(campaignId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        title: state.logFormData.title,
        sessionDate: state.logFormData.sessionDate,
        durationMins: Number(state.logFormData.durationMins),
        summary: state.logFormData.summary,
        attendance: state.logFormData.attendance,
      }),
    });

    state.sessions.unshift(payload.session);
    resetLogForm();
    return payload.session;
  } catch (error) {
    console.error('createSession error:', error);
    throw error;
  }
}

/**
 * Update session attendance
 */
export async function updateAttendance(campaignId, sessionId, attendance) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ attendance }),
    });

    // Update local state
    const session = state.sessions.find(s => s.id === sessionId);
    if (session) {
      session.attendance = attendance;
    }

    return payload.session;
  } catch (error) {
    console.error('updateAttendance error:', error);
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
  state.logFormData[field] = value;
}

export function toggleAttendance(characterId) {
  const index = state.logFormData.attendance.indexOf(characterId);
  if (index > -1) {
    state.logFormData.attendance.splice(index, 1);
  } else {
    state.logFormData.attendance.push(characterId);
  }
}

function resetLogForm() {
  state.logFormData = {
    title: '',
    sessionDate: new Date().toISOString().split('T')[0],
    durationMins: 180,
    summary: '',
    attendance: [],
  };
}

/**
 * Render functions
 */
function renderSessionCard(session) {
  const date = session.sessionDate ? new Date(session.sessionDate).toLocaleDateString() : 'No date';
  const duration = session.durationMins ? `${Math.floor(session.durationMins / 60)}h ${session.durationMins % 60}m` : '';
  const attendance = typeof session.attendance === 'string' ? JSON.parse(session.attendance) : session.attendance || [];

  return `
    <div class="session-card" data-session-id="${escapeHtml(session.id)}">
      <div class="session-card__header">
        <div>
          <div class="session-card__number">Session ${escapeHtml(String(session.sessionNumber || '?'))}</div>
          <h3 class="session-card__title">${escapeHtml(session.title || 'Untitled Session')}</h3>
        </div>
        <div class="session-card__meta">
          ${renderMetaBits([date, duration])}
        </div>
      </div>
      
      ${session.summary ? `
        <div class="session-card__summary">
          <p>${escapeHtml(session.summary)}</p>
        </div>
      ` : ''}
      
      <div class="session-card__footer">
        <div class="session-card__attendance">
          <span class="label">Attendance:</span>
          <span class="muted">${attendance.length} ${attendance.length === 1 ? 'player' : 'players'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderLogSessionForm(campaignId, isDM) {
  if (!isDM || !state.showLogForm) {
    return '';
  }

  return `
    <div class="log-session-form">
      <div class="log-session-form__header">
        <h3>Log New Session</h3>
        <button class="button-icon" data-action="close-log-session-form">&times;</button>
      </div>
      
      <form id="log-session-form">
        <label class="field">
          <span class="label">Session Title *</span>
          <input 
            class="input" 
            name="title" 
            placeholder="The Dragon's Lair" 
            value="${escapeHtml(state.logFormData.title)}"
            required
          />
        </label>
        
        <div class="field-row">
          <label class="field">
            <span class="label">Date</span>
            <input 
              class="input" 
              type="date" 
              name="sessionDate" 
              value="${escapeHtml(state.logFormData.sessionDate)}"
            />
          </label>
          
          <label class="field">
            <span class="label">Duration (minutes)</span>
            <input 
              class="input" 
              type="number" 
              name="durationMins" 
              min="0" 
              value="${escapeHtml(String(state.logFormData.durationMins))}"
            />
          </label>
        </div>
        
        <label class="field">
          <span class="label">Summary</span>
          <textarea 
            class="input" 
            name="summary" 
            rows="4" 
            placeholder="What happened in this session..."
          >${escapeHtml(state.logFormData.summary)}</textarea>
        </label>
        
        <div class="field">
          <span class="label">Attendance</span>
          <div class="attendance-checkboxes">
            ${state.members.map(member => {
              const character = member.character || {};
              const isChecked = state.logFormData.attendance.includes(member.characterId);
              return `
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    name="attendance" 
                    value="${escapeHtml(member.characterId)}"
                    ${isChecked ? 'checked' : ''}
                    data-action="toggle-attendance"
                    data-character-id="${escapeHtml(member.characterId)}"
                  />
                  <span>${escapeHtml(character.name || 'Unknown')}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="form-actions">
          <button type="button" class="button subtle" data-action="close-log-session-form">Cancel</button>
          <button 
            type="submit" 
            class="button primary" 
            data-action="submit-log-session"
            data-campaign-id="${escapeHtml(campaignId)}"
          >
            Log Session
          </button>
        </div>
      </form>
    </div>
  `;
}

export function renderSessionsTab(campaignId, isDM = false) {
  if (state.loading) {
    return '<div class="loading-spinner">Loading sessions...</div>';
  }

  if (state.error) {
    return `<div class="error-card">Error loading sessions: ${escapeHtml(state.error)}</div>`;
  }

  return `
    <div class="sessions-tab">
      ${isDM ? `
        <div class="sessions-tab__header">
          <button 
            class="button primary" 
            data-action="open-log-session-form"
            data-campaign-id="${escapeHtml(campaignId)}"
          >
            Log New Session
          </button>
        </div>
      ` : ''}
      
      ${renderLogSessionForm(campaignId, isDM)}
      
      ${state.sessions.length === 0 ? `
        <div class="empty-card">
          <p>No sessions logged yet.</p>
          ${isDM ? '<p class="muted">Log your first session to start tracking your campaign history.</p>' : ''}
        </div>
      ` : `
        <div class="sessions-list">
          ${state.sessions.map(s => renderSessionCard(s)).join('')}
        </div>
      `}
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignSessionsState() {
  return state;
}
