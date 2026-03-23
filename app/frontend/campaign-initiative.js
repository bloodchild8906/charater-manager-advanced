import { escapeHtml } from './utils.js';

/**
 * Campaign Initiative Tracker State
 */
const state = {
  isOpen: false,
  campaignId: null,
  initiativeOrder: [],
  currentTurnIndex: 0,
  round: 1,
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
 * Open initiative tracker
 */
export async function open(campaignId) {
  state.isOpen = true;
  state.campaignId = campaignId;
  state.loading = true;

  try {
    // Load campaign members
    const payload = await api(`/api/campaigns/${campaignId}/members`, { method: 'GET' });
    const members = (payload.members || []).filter(m => m.status === 'accepted');

    // Initialize initiative order from members
    state.initiativeOrder = members.map(member => {
      const character = member.character || {};
      const data = character.data || {};
      const hp = data.hp || { current: 0, max: 0 };
      const initiativeBonus = calculateInitiativeBonus(data);

      return {
        id: member.characterId,
        name: character.name || 'Unknown',
        initiative: 0,
        initiativeBonus,
        currentHp: hp.current,
        maxHp: hp.max,
        isNPC: false,
      };
    });

    state.currentTurnIndex = 0;
    state.round = 1;
  } catch (error) {
    console.error('open initiative tracker error:', error);
  } finally {
    state.loading = false;
  }
}

/**
 * Close initiative tracker
 */
export function close() {
  state.isOpen = false;
  state.campaignId = null;
  state.initiativeOrder = [];
  state.currentTurnIndex = 0;
  state.round = 1;
}

/**
 * Calculate initiative bonus from character data
 */
function calculateInitiativeBonus(data) {
  const dexterity = data.dexterity || 10;
  const dexModifier = Math.floor((dexterity - 10) / 2);
  return dexModifier;
}

/**
 * Roll initiative for all
 */
export function rollForAll() {
  state.initiativeOrder = state.initiativeOrder.map(entry => ({
    ...entry,
    initiative: rollD20() + entry.initiativeBonus,
  }));

  // Sort by initiative (descending)
  sortInitiativeOrder();
}

/**
 * Roll d20
 */
function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Sort initiative order
 */
function sortInitiativeOrder() {
  state.initiativeOrder.sort((a, b) => b.initiative - a.initiative);
  state.currentTurnIndex = 0;
}

/**
 * Update initiative for a specific entry
 */
export function updateInitiative(id, value) {
  const entry = state.initiativeOrder.find(e => e.id === id);
  if (entry) {
    entry.initiative = Number(value) || 0;
  }
}

/**
 * Move entry up in order
 */
export function moveUp(index) {
  if (index > 0) {
    const temp = state.initiativeOrder[index];
    state.initiativeOrder[index] = state.initiativeOrder[index - 1];
    state.initiativeOrder[index - 1] = temp;
  }
}

/**
 * Move entry down in order
 */
export function moveDown(index) {
  if (index < state.initiativeOrder.length - 1) {
    const temp = state.initiativeOrder[index];
    state.initiativeOrder[index] = state.initiativeOrder[index + 1];
    state.initiativeOrder[index + 1] = temp;
  }
}

/**
 * Add NPC to initiative
 */
export function addNPC(name, hp, initiativeBonus = 0) {
  const npcId = `npc-${Date.now()}`;
  state.initiativeOrder.push({
    id: npcId,
    name: name || 'NPC',
    initiative: 0,
    initiativeBonus: Number(initiativeBonus) || 0,
    currentHp: Number(hp) || 10,
    maxHp: Number(hp) || 10,
    isNPC: true,
  });
}

/**
 * Remove entry from initiative
 */
export function removeEntry(id) {
  state.initiativeOrder = state.initiativeOrder.filter(e => e.id !== id);
}

/**
 * Next turn
 */
export function nextTurn() {
  state.currentTurnIndex += 1;

  if (state.currentTurnIndex >= state.initiativeOrder.length) {
    state.currentTurnIndex = 0;
    state.round += 1;
  }

  // Broadcast turn advanced event via SSE (would be implemented in integration)
  broadcastTurnAdvanced();
}

/**
 * Broadcast turn advanced (placeholder for SSE integration)
 */
function broadcastTurnAdvanced() {
  if (!state.campaignId) return;

  const currentEntry = state.initiativeOrder[state.currentTurnIndex];
  if (!currentEntry) return;

  // This would emit an SSE event in the real implementation
  console.log('Turn advanced:', {
    currentCharacterId: currentEntry.id,
    round: state.round,
  });
}

/**
 * Broadcast initiative updated (placeholder for SSE integration)
 */
export function broadcastInitiativeOrder() {
  if (!state.campaignId) return;

  // This would emit an SSE event in the real implementation
  console.log('Initiative order updated:', state.initiativeOrder);
}

/**
 * Render functions
 */
function renderInitiativeRow(entry, index) {
  const isCurrent = index === state.currentTurnIndex;

  return `
    <div class="initiative-row ${isCurrent ? 'initiative-row--current' : ''}" data-entry-id="${escapeHtml(entry.id)}">
      <div class="initiative-row__order">
        <button 
          class="button-icon small" 
          data-action="move-initiative-up" 
          data-index="${index}"
          ${index === 0 ? 'disabled' : ''}
        >
          ▲
        </button>
        <button 
          class="button-icon small" 
          data-action="move-initiative-down" 
          data-index="${index}"
          ${index === state.initiativeOrder.length - 1 ? 'disabled' : ''}
        >
          ▼
        </button>
      </div>
      
      <div class="initiative-row__initiative">
        <input 
          class="input small initiative-input" 
          type="number" 
          value="${escapeHtml(String(entry.initiative))}"
          data-action="update-initiative"
          data-entry-id="${escapeHtml(entry.id)}"
        />
      </div>
      
      <div class="initiative-row__name">
        <strong>${escapeHtml(entry.name)}</strong>
        ${entry.isNPC ? '<span class="badge badge--muted small">NPC</span>' : ''}
      </div>
      
      <div class="initiative-row__hp">
        <span class="hp-display">${escapeHtml(String(entry.currentHp))} / ${escapeHtml(String(entry.maxHp))}</span>
      </div>
      
      <div class="initiative-row__actions">
        ${entry.isNPC ? `
          <button 
            class="button-icon small" 
            data-action="remove-initiative-entry" 
            data-entry-id="${escapeHtml(entry.id)}"
            title="Remove"
          >
            &times;
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

export function render() {
  if (!state.isOpen) {
    return '';
  }

  return `
    <div class="initiative-tracker-panel">
      <div class="initiative-tracker-panel__header">
        <div>
          <h3>Initiative Tracker</h3>
          <div class="initiative-tracker-panel__round">Round ${escapeHtml(String(state.round))}</div>
        </div>
        <button class="button-icon" data-action="close-initiative-tracker">&times;</button>
      </div>
      
      <div class="initiative-tracker-panel__controls">
        <button class="button primary small" data-action="roll-initiative-all">Roll for All</button>
        <button class="button small" data-action="sort-initiative">Sort by Initiative</button>
        <button class="button small" data-action="next-turn">Next Turn</button>
        <button class="button subtle small" data-action="end-combat">End Combat</button>
      </div>
      
      <div class="initiative-tracker-panel__body">
        ${state.loading ? `
          <div class="loading-spinner">Loading...</div>
        ` : `
          ${state.initiativeOrder.length === 0 ? `
            <div class="empty-card">No combatants</div>
          ` : `
            <div class="initiative-list">
              ${state.initiativeOrder.map((entry, index) => renderInitiativeRow(entry, index)).join('')}
            </div>
          `}
        `}
      </div>
      
      <div class="initiative-tracker-panel__footer">
        <div class="add-npc-form">
          <input 
            class="input small" 
            id="npc-name-input" 
            placeholder="NPC Name" 
          />
          <input 
            class="input small" 
            type="number" 
            id="npc-hp-input" 
            placeholder="HP" 
            min="1"
          />
          <input 
            class="input small" 
            type="number" 
            id="npc-init-bonus-input" 
            placeholder="+Init" 
          />
          <button class="button primary small" data-action="add-npc">Add NPC</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getInitiativeState() {
  return state;
}
