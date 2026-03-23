import { escapeHtml, titleize } from './utils.js';

/**
 * Campaign Invites State
 */
const state = {
  pendingInvites: [],
  loading: false,
  error: null,
  showInvitesModal: false,
  joinToken: null,
  joinCampaignPreview: null,
  showJoinModal: false,
  selectedCharacterId: null,
  userCharacters: [],
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
 * Load pending invites
 */
export async function loadPendingInvites() {
  state.loading = true;
  state.error = null;

  try {
    const payload = await api('/api/campaigns/invites/pending', { method: 'GET' });
    state.pendingInvites = payload.invites || [];
    return state.pendingInvites;
  } catch (error) {
    console.error('loadPendingInvites error:', error);
    state.error = error.message;
    state.pendingInvites = [];
    return [];
  } finally {
    state.loading = false;
  }
}

/**
 * Accept an invite
 */
export async function acceptInvite(campaignId, memberId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'accepted' }),
    });

    // Remove from pending invites
    state.pendingInvites = state.pendingInvites.filter(inv => inv.id !== memberId);

    return payload;
  } catch (error) {
    console.error('acceptInvite error:', error);
    throw error;
  }
}

/**
 * Decline an invite
 */
export async function declineInvite(campaignId, memberId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'declined' }),
    });

    // Remove from pending invites
    state.pendingInvites = state.pendingInvites.filter(inv => inv.id !== memberId);

    return payload;
  } catch (error) {
    console.error('declineInvite error:', error);
    throw error;
  }
}

/**
 * Load campaign preview from join token
 */
export async function loadJoinPreview(token) {
  state.joinToken = token;
  state.loading = true;
  state.error = null;

  try {
    const payload = await api(`/api/campaigns/join/${token}`, { method: 'GET' });
    state.joinCampaignPreview = payload.campaign || null;
    return payload.campaign;
  } catch (error) {
    console.error('loadJoinPreview error:', error);
    state.error = error.message;
    state.joinCampaignPreview = null;
    throw error;
  } finally {
    state.loading = false;
  }
}

/**
 * Join campaign via token
 */
export async function joinViaToken(token, characterId) {
  try {
    const payload = await api(`/api/campaigns/join/${token}`, {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    });

    return payload;
  } catch (error) {
    console.error('joinViaToken error:', error);
    throw error;
  }
}

/**
 * Load user characters for join flow
 */
export async function loadUserCharacters() {
  try {
    // This would call the characters API endpoint
    // For now, we'll assume it's available from the app state
    // In a real implementation, this would be:
    // const payload = await api('/api/characters', { method: 'GET' });
    // state.userCharacters = payload.characters || [];
    
    // Placeholder - would be populated from app state
    state.userCharacters = [];
  } catch (error) {
    console.error('loadUserCharacters error:', error);
    state.userCharacters = [];
  }
}

/**
 * Modal management
 */
export function openInvitesModal() {
  state.showInvitesModal = true;
}

export function closeInvitesModal() {
  state.showInvitesModal = false;
}

export function openJoinModal() {
  state.showJoinModal = true;
}

export function closeJoinModal() {
  state.showJoinModal = false;
  state.joinToken = null;
  state.joinCampaignPreview = null;
  state.selectedCharacterId = null;
}

export function selectCharacter(characterId) {
  state.selectedCharacterId = characterId;
}

/**
 * Get pending invite count
 */
export function getPendingInviteCount() {
  return state.pendingInvites.length;
}

/**
 * Render functions
 */
function renderInviteCard(invite) {
  const campaign = invite.campaign || {};

  return `
    <div class="invite-card" data-invite-id="${escapeHtml(invite.id)}">
      <div class="invite-card__header">
        <div>
          <h3 class="invite-card__campaign-name">${escapeHtml(campaign.name || 'Unknown Campaign')}</h3>
          <div class="invite-card__meta">
            <span class="muted">DM: ${escapeHtml(invite.dmName || 'Unknown')}</span>
            <span class="muted">${escapeHtml(String(campaign.memberCount || 0))} members</span>
          </div>
        </div>
        <span class="badge badge--warning">Pending</span>
      </div>
      
      ${campaign.description ? `
        <p class="invite-card__description">${escapeHtml(campaign.description)}</p>
      ` : ''}
      
      <div class="invite-card__actions">
        <button 
          class="button primary" 
          data-action="accept-invite"
          data-campaign-id="${escapeHtml(invite.campaignId)}"
          data-member-id="${escapeHtml(invite.id)}"
        >
          Accept
        </button>
        <button 
          class="button subtle" 
          data-action="decline-invite"
          data-campaign-id="${escapeHtml(invite.campaignId)}"
          data-member-id="${escapeHtml(invite.id)}"
        >
          Decline
        </button>
      </div>
    </div>
  `;
}

export function renderInvitesModal() {
  if (!state.showInvitesModal) {
    return '';
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel">
        <div class="modal-panel__header">
          <h3 class="modal-title">Campaign Invites</h3>
          <button class="modal-close" data-action="close-invites-modal">&times;</button>
        </div>
        
        <div class="modal-panel__body">
          ${state.loading ? `
            <div class="loading-spinner">Loading invites...</div>
          ` : state.error ? `
            <div class="error-card">Error: ${escapeHtml(state.error)}</div>
          ` : state.pendingInvites.length === 0 ? `
            <div class="empty-card">
              <p>No pending invites.</p>
              <p class="muted">When a DM invites you to a campaign, it will appear here.</p>
            </div>
          ` : `
            <div class="invites-list">
              ${state.pendingInvites.map(inv => renderInviteCard(inv)).join('')}
            </div>
          `}
        </div>
      </section>
    </div>
  `;
}

function renderCharacterOption(character) {
  const data = character.data || {};
  
  return `
    <label class="character-option ${state.selectedCharacterId === character.id ? 'selected' : ''}">
      <input 
        type="radio" 
        name="character" 
        value="${escapeHtml(character.id)}"
        data-action="select-join-character"
        ${state.selectedCharacterId === character.id ? 'checked' : ''}
      />
      <div class="character-option__content">
        ${character.portraitUrl ? `
          <img 
            src="${escapeHtml(character.portraitUrl)}" 
            alt="${escapeHtml(character.name || 'Character')}" 
            class="character-option__portrait"
          />
        ` : `
          <div class="character-option__portrait character-option__portrait--placeholder">
            ${escapeHtml((character.name || 'C')[0].toUpperCase())}
          </div>
        `}
        <div class="character-option__info">
          <strong>${escapeHtml(character.name || 'Unknown')}</strong>
          <div class="muted small">
            ${escapeHtml(titleize(data.classSlug || '', 'Unclassed'))} ${escapeHtml(String(data.level || 1))}
          </div>
        </div>
      </div>
    </label>
  `;
}

export function renderJoinModal() {
  if (!state.showJoinModal || !state.joinCampaignPreview) {
    return '';
  }

  const campaign = state.joinCampaignPreview;

  return `
    <div class="modal-overlay">
      <section class="modal-panel">
        <div class="modal-panel__header">
          <h3 class="modal-title">Join Campaign</h3>
          <button class="modal-close" data-action="close-join-modal">&times;</button>
        </div>
        
        <div class="modal-panel__body">
          <div class="join-campaign-preview">
            <h2>${escapeHtml(campaign.name || 'Unknown Campaign')}</h2>
            
            <div class="join-campaign-preview__meta">
              <span class="muted">DM: ${escapeHtml(campaign.dmName || 'Unknown')}</span>
              <span class="muted">${escapeHtml(String(campaign.memberCount || 0))} members</span>
              <span class="badge badge--${campaign.visibility === 'public' ? 'success' : 'info'}">
                ${escapeHtml(titleize(campaign.visibility || '', ''))}
              </span>
            </div>
            
            ${campaign.description ? `
              <p class="join-campaign-preview__description">${escapeHtml(campaign.description)}</p>
            ` : ''}
          </div>
          
          <div class="join-character-selection">
            <h3>Select a Character</h3>
            <p class="muted">Choose which character will join this campaign.</p>
            
            ${state.userCharacters.length === 0 ? `
              <div class="empty-card">
                <p>You don't have any characters yet.</p>
                <p class="muted">Create a character first to join this campaign.</p>
              </div>
            ` : `
              <div class="character-options">
                ${state.userCharacters.map(char => renderCharacterOption(char)).join('')}
              </div>
            `}
          </div>
        </div>
        
        <div class="modal-panel__footer">
          <button class="button subtle" data-action="close-join-modal">Cancel</button>
          <button 
            class="button primary" 
            data-action="submit-join-campaign"
            data-token="${escapeHtml(state.joinToken || '')}"
            ${!state.selectedCharacterId || state.userCharacters.length === 0 ? 'disabled' : ''}
          >
            Join Campaign
          </button>
        </div>
      </section>
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignInvitesState() {
  return state;
}
