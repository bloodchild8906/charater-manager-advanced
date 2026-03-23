import { escapeHtml } from './utils.js';

/**
 * Campaign HP Grid State
 */
const state = {
  isOpen: false,
  campaignId: null,
  members: [],
  loading: false,
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
 * Open HP grid
 */
export async function open(campaignId) {
  state.isOpen = true;
  state.campaignId = campaignId;
  await loadMembers();
}

/**
 * Close HP grid
 */
export function close() {
  state.isOpen = false;
  state.campaignId = null;
  state.members = [];
}

/**
 * Load members
 */
export async function loadMembers() {
  if (!state.campaignId) return;

  state.loading = true;

  try {
    const payload = await api(`/api/campaigns/${state.campaignId}/members`, { method: 'GET' });
    state.members = (payload.members || []).filter(m => m.status === 'accepted');
  } catch (error) {
    console.error('loadMembers error:', error);
    state.members = [];
  } finally {
    state.loading = false;
  }
}

/**
 * Apply damage to a character
 */
export async function applyDamage(characterId, amount) {
  if (!state.campaignId) return;

  try {
    const payload = await api(`/api/campaigns/${state.campaignId}/characters/${characterId}/apply-damage`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount) }),
    });

    // Update local state
    const member = state.members.find(m => m.characterId === characterId);
    if (member && member.character && member.character.data && member.character.data.hp) {
      member.character.data.hp.current = payload.character.data.hp.current;
    }

    return payload;
  } catch (error) {
    console.error('applyDamage error:', error);
    throw error;
  }
}

/**
 * Apply healing to a character
 */
export async function applyHealing(characterId, amount) {
  if (!state.campaignId) return;

  try {
    const payload = await api(`/api/campaigns/${state.campaignId}/characters/${characterId}/apply-healing`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount) }),
    });

    // Update local state
    const member = state.members.find(m => m.characterId === characterId);
    if (member && member.character && member.character.data && member.character.data.hp) {
      member.character.data.hp.current = payload.character.data.hp.current;
    }

    return payload;
  } catch (error) {
    console.error('applyHealing error:', error);
    throw error;
  }
}

/**
 * Update HP from SSE event
 */
export function updateHPFromSSE(characterId, currentHp, maxHp) {
  const member = state.members.find(m => m.characterId === characterId);
  if (member && member.character && member.character.data) {
    if (!member.character.data.hp) {
      member.character.data.hp = {};
    }
    member.character.data.hp.current = currentHp;
    member.character.data.hp.max = maxHp;
  }
}

/**
 * Update conditions from SSE event
 */
export function updateConditionsFromSSE(characterId, conditions) {
  const member = state.members.find(m => m.characterId === characterId);
  if (member) {
    member.conditions = conditions;
  }
}

/**
 * Render functions
 */
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
      <div class="hp-bar__label">${current} / ${max}</div>
    </div>
  `;
}

function renderConditionIcons(conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return '';
  }

  return `
    <div class="condition-icons">
      ${conditions.slice(0, 3).map(cond => `
        <span 
          class="condition-icon" 
          title="${escapeHtml(cond.conditionName || cond.condition_name || cond)}"
        >
          ${escapeHtml((cond.conditionName || cond.condition_name || cond)[0].toUpperCase())}
        </span>
      `).join('')}
      ${conditions.length > 3 ? `<span class="condition-icon">+${conditions.length - 3}</span>` : ''}
    </div>
  `;
}

function renderMemberCard(member) {
  const character = member.character || {};
  const data = character.data || {};
  const hp = data.hp || { current: 0, max: 0 };
  const conditions = member.conditions || [];

  return `
    <div class="hp-grid-card" data-character-id="${escapeHtml(member.characterId)}">
      <div class="hp-grid-card__header">
        <strong class="hp-grid-card__name">${escapeHtml(character.name || 'Unknown')}</strong>
        ${renderConditionIcons(conditions)}
      </div>
      
      ${renderHPBar(hp.current, hp.max)}
      
      <div class="hp-grid-card__controls">
        <div class="hp-control-group">
          <input 
            class="input tiny" 
            type="number" 
            id="damage-${escapeHtml(member.characterId)}" 
            placeholder="Dmg" 
            min="0"
          />
          <button 
            class="button tiny" 
            data-action="apply-damage-hp-grid"
            data-character-id="${escapeHtml(member.characterId)}"
          >
            -
          </button>
        </div>
        
        <div class="hp-control-group">
          <input 
            class="input tiny" 
            type="number" 
            id="healing-${escapeHtml(member.characterId)}" 
            placeholder="Heal" 
            min="0"
          />
          <button 
            class="button tiny primary" 
            data-action="apply-healing-hp-grid"
            data-character-id="${escapeHtml(member.characterId)}"
          >
            +
          </button>
        </div>
      </div>
    </div>
  `;
}

export function render() {
  if (!state.isOpen) {
    return '';
  }

  return `
    <div class="hp-grid-panel">
      <div class="hp-grid-panel__header">
        <h3>Party HP Grid</h3>
        <button class="button-icon" data-action="close-hp-grid">&times;</button>
      </div>
      
      <div class="hp-grid-panel__body">
        ${state.loading ? `
          <div class="loading-spinner">Loading...</div>
        ` : `
          ${state.members.length === 0 ? `
            <div class="empty-card">No party members</div>
          ` : `
            <div class="hp-grid">
              ${state.members.map(m => renderMemberCard(m)).join('')}
            </div>
          `}
        `}
      </div>
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getHPGridState() {
  return state;
}
