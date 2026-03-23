import { escapeHtml, renderMetaBits, titleize } from './utils.js';

/**
 * Campaign Members Tab State
 */
const state = {
  members: [],
  loading: false,
  error: null,
  dmControlsOpen: {},
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
 * Load members for a campaign
 */
export async function loadMembers(campaignId) {
  if (!campaignId) {
    state.members = [];
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const payload = await api(`/api/campaigns/${campaignId}/members`, { method: 'GET' });
    state.members = payload.members || [];
  } catch (error) {
    console.error('loadMembers error:', error);
    state.error = error.message;
    state.members = [];
  } finally {
    state.loading = false;
  }
}

/**
 * DM Actions
 */
export async function awardXP(campaignId, characterId, amount) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}/award-xp`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    return payload;
  } catch (error) {
    console.error('awardXP error:', error);
    throw error;
  }
}

export async function applyDamage(campaignId, characterId, amount) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}/apply-damage`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    return payload;
  } catch (error) {
    console.error('applyDamage error:', error);
    throw error;
  }
}

export async function applyHealing(campaignId, characterId, amount) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}/apply-healing`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    return payload;
  } catch (error) {
    console.error('applyHealing error:', error);
    throw error;
  }
}

/**
 * Toggle DM controls for a member card
 */
export function toggleDMControls(memberId) {
  state.dmControlsOpen[memberId] = !state.dmControlsOpen[memberId];
}

/**
 * Get member by ID
 */
export function getMemberById(memberId) {
  return state.members.find(m => m.id === memberId) || null;
}

/**
 * Render functions
 */
function renderStatusBadge(status) {
  const statusMap = {
    pending: { class: 'badge--warning', label: 'Pending' },
    accepted: { class: 'badge--success', label: 'Active' },
    declined: { class: 'badge--muted', label: 'Declined' },
    removed: { class: 'badge--muted', label: 'Removed' },
  };

  const config = statusMap[status] || { class: 'badge--muted', label: status };
  return `<span class="badge ${config.class}">${escapeHtml(config.label)}</span>`;
}

function renderConditionPills(conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return '';
  }

  return `
    <div class="condition-pills">
      ${conditions.map(cond => `
        <span class="condition-pill" title="${escapeHtml(cond.source || '')}">
          ${escapeHtml(cond.conditionName || cond.condition_name || cond)}
        </span>
      `).join('')}
    </div>
  `;
}

function renderHPBar(currentHp, maxHp) {
  const current = Number(currentHp) || 0;
  const max = Number(maxHp) || 1;
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));
  
  let barClass = 'hp-bar--healthy';
  if (percentage <= 25) {
    barClass = 'hp-bar--critical';
  } else if (percentage <= 50) {
    barClass = 'hp-bar--wounded';
  }

  return `
    <div class="hp-bar-container">
      <div class="hp-bar ${barClass}">
        <div class="hp-bar__fill" style="width: ${percentage}%"></div>
      </div>
      <div class="hp-bar__label">${current} / ${max} HP</div>
    </div>
  `;
}

function renderDMControls(member, campaignId, isDM) {
  if (!isDM || member.status !== 'accepted') {
    return '';
  }

  const isOpen = state.dmControlsOpen[member.id];

  return `
    <div class="member-card__dm-controls">
      <button 
        class="button subtle small" 
        data-action="toggle-dm-controls" 
        data-member-id="${escapeHtml(member.id)}"
      >
        ${isOpen ? 'Hide' : 'Show'} DM Controls
      </button>
      
      ${isOpen ? `
        <div class="dm-controls-panel">
          <button 
            class="button primary small" 
            data-action="open-dm-sheet" 
            data-campaign-id="${escapeHtml(campaignId)}"
            data-character-id="${escapeHtml(member.characterId)}"
          >
            Open Sheet
          </button>
          
          <div class="dm-quick-action">
            <label class="label">Apply Damage</label>
            <div class="input-group">
              <input 
                type="number" 
                class="input small" 
                id="damage-${escapeHtml(member.id)}" 
                placeholder="Amount" 
                min="0"
              />
              <button 
                class="button small" 
                data-action="apply-damage" 
                data-campaign-id="${escapeHtml(campaignId)}"
                data-character-id="${escapeHtml(member.characterId)}"
                data-member-id="${escapeHtml(member.id)}"
              >
                Apply
              </button>
            </div>
          </div>
          
          <div class="dm-quick-action">
            <label class="label">Apply Healing</label>
            <div class="input-group">
              <input 
                type="number" 
                class="input small" 
                id="healing-${escapeHtml(member.id)}" 
                placeholder="Amount" 
                min="0"
              />
              <button 
                class="button small" 
                data-action="apply-healing" 
                data-campaign-id="${escapeHtml(campaignId)}"
                data-character-id="${escapeHtml(member.characterId)}"
                data-member-id="${escapeHtml(member.id)}"
              >
                Apply
              </button>
            </div>
          </div>
          
          <div class="dm-quick-action">
            <label class="label">Award XP</label>
            <div class="input-group">
              <input 
                type="number" 
                class="input small" 
                id="xp-${escapeHtml(member.id)}" 
                placeholder="Amount" 
                min="0"
              />
              <button 
                class="button small" 
                data-action="award-xp" 
                data-campaign-id="${escapeHtml(campaignId)}"
                data-character-id="${escapeHtml(member.characterId)}"
                data-member-id="${escapeHtml(member.id)}"
              >
                Award
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderMemberCard(member, campaignId, isDM) {
  const character = member.character || {};
  const data = character.data || {};
  const hp = data.hp || { current: 0, max: 0 };
  const conditions = member.conditions || [];

  return `
    <div class="member-card" data-member-id="${escapeHtml(member.id)}">
      <div class="member-card__header">
        ${character.portraitUrl ? `
          <img 
            src="${escapeHtml(character.portraitUrl)}" 
            alt="${escapeHtml(character.name || 'Character')}" 
            class="member-card__portrait"
          />
        ` : `
          <div class="member-card__portrait member-card__portrait--placeholder">
            ${escapeHtml((character.name || 'C')[0].toUpperCase())}
          </div>
        `}
        
        <div class="member-card__info">
          <h3 class="member-card__name">${escapeHtml(character.name || 'Unknown Character')}</h3>
          <div class="member-card__meta">
            ${renderMetaBits([
              titleize(data.classSlug || '', 'Unclassed'),
              `Level ${data.level || 1}`,
            ])}
          </div>
          ${renderStatusBadge(member.status)}
        </div>
      </div>
      
      ${member.status === 'accepted' ? `
        <div class="member-card__body">
          ${renderHPBar(hp.current, hp.max)}
          ${renderConditionPills(conditions)}
        </div>
      ` : ''}
      
      ${renderDMControls(member, campaignId, isDM)}
    </div>
  `;
}

export function renderMembersTab(campaignId, isDM = false) {
  if (state.loading) {
    return '<div class="loading-spinner">Loading members...</div>';
  }

  if (state.error) {
    return `<div class="error-card">Error loading members: ${escapeHtml(state.error)}</div>`;
  }

  if (state.members.length === 0) {
    return `
      <div class="empty-card">
        <p>No members yet.</p>
        ${isDM ? '<p class="muted">Invite players to join your campaign.</p>' : ''}
      </div>
    `;
  }

  const acceptedMembers = state.members.filter(m => m.status === 'accepted');
  const pendingMembers = state.members.filter(m => m.status === 'pending');
  const otherMembers = state.members.filter(m => m.status !== 'accepted' && m.status !== 'pending');

  return `
    <div class="members-tab">
      ${acceptedMembers.length > 0 ? `
        <div class="members-section">
          <h3 class="section-title">Active Members (${acceptedMembers.length})</h3>
          <div class="member-grid">
            ${acceptedMembers.map(m => renderMemberCard(m, campaignId, isDM)).join('')}
          </div>
        </div>
      ` : ''}
      
      ${pendingMembers.length > 0 ? `
        <div class="members-section">
          <h3 class="section-title">Pending Invites (${pendingMembers.length})</h3>
          <div class="member-grid">
            ${pendingMembers.map(m => renderMemberCard(m, campaignId, isDM)).join('')}
          </div>
        </div>
      ` : ''}
      
      ${otherMembers.length > 0 ? `
        <div class="members-section">
          <h3 class="section-title">Other (${otherMembers.length})</h3>
          <div class="member-grid">
            ${otherMembers.map(m => renderMemberCard(m, campaignId, isDM)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignMembersState() {
  return state;
}
