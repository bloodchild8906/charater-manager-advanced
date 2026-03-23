import { escapeHtml, titleize } from './utils.js';

/**
 * Campaign Compendium Tab State
 */
const state = {
  entries: [],
  loading: false,
  error: null,
  filters: {
    type: '',
    search: '',
    tag: '',
    includeHidden: false,
  },
  showCreateModal: false,
  createFormData: {
    contentType: 'item',
    name: '',
    description: '',
    data: {},
    tags: '',
    isPlayerVisible: true,
  },
  editingEntry: null,
  selectedEntry: null,
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
 * Load compendium entries
 */
export async function loadEntries(campaignId) {
  if (!campaignId) {
    state.entries = [];
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const queryParams = new URLSearchParams();
    if (state.filters.type) queryParams.append('type', state.filters.type);
    if (state.filters.search) queryParams.append('search', state.filters.search);
    if (state.filters.tag) queryParams.append('tag', state.filters.tag);
    if (state.filters.includeHidden) queryParams.append('includeHidden', 'true');

    const payload = await api(`/api/campaigns/${campaignId}/compendium?${queryParams.toString()}`, {
      method: 'GET',
    });
    state.entries = payload.entries || [];
  } catch (error) {
    console.error('loadEntries error:', error);
    state.error = error.message;
    state.entries = [];
  } finally {
    state.loading = false;
  }
}

/**
 * Create a new compendium entry
 */
export async function createEntry(campaignId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/compendium`, {
      method: 'POST',
      body: JSON.stringify({
        contentType: state.createFormData.contentType,
        name: state.createFormData.name,
        description: state.createFormData.description,
        data: JSON.stringify(state.createFormData.data),
        tags: state.createFormData.tags,
        isPlayerVisible: state.createFormData.isPlayerVisible ? 1 : 0,
      }),
    });

    state.entries.unshift(payload.entry);
    closeCreateModal();
    return payload.entry;
  } catch (error) {
    console.error('createEntry error:', error);
    throw error;
  }
}

/**
 * Update an existing entry
 */
export async function updateEntry(campaignId, entryId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/compendium/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: state.createFormData.name,
        description: state.createFormData.description,
        data: JSON.stringify(state.createFormData.data),
        tags: state.createFormData.tags,
        isPlayerVisible: state.createFormData.isPlayerVisible ? 1 : 0,
      }),
    });

    // Update local state
    const index = state.entries.findIndex(e => e.id === entryId);
    if (index > -1) {
      state.entries[index] = payload.entry;
    }

    closeCreateModal();
    return payload.entry;
  } catch (error) {
    console.error('updateEntry error:', error);
    throw error;
  }
}

/**
 * Delete an entry
 */
export async function deleteEntry(campaignId, entryId) {
  try {
    await api(`/api/campaigns/${campaignId}/compendium/${entryId}`, {
      method: 'DELETE',
    });

    // Remove from local state
    state.entries = state.entries.filter(e => e.id !== entryId);
    state.selectedEntry = null;
  } catch (error) {
    console.error('deleteEntry error:', error);
    throw error;
  }
}

/**
 * Grant entry to character
 */
export async function grantToCharacter(campaignId, entryId, characterId) {
  try {
    await api(`/api/campaigns/${campaignId}/compendium/${entryId}/grant`, {
      method: 'POST',
      body: JSON.stringify({ characterId }),
    });
  } catch (error) {
    console.error('grantToCharacter error:', error);
    throw error;
  }
}

/**
 * Filter management
 */
export function setFilter(field, value) {
  state.filters[field] = value;
}

export function clearFilters() {
  state.filters = {
    type: '',
    search: '',
    tag: '',
    includeHidden: false,
  };
}

/**
 * Modal management
 */
export function openCreateModal() {
  state.showCreateModal = true;
  state.editingEntry = null;
  resetCreateForm();
}

export function openEditModal(entry) {
  state.showCreateModal = true;
  state.editingEntry = entry;
  
  let data = {};
  try {
    data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data || {};
  } catch {
    data = {};
  }

  state.createFormData = {
    contentType: entry.contentType,
    name: entry.name,
    description: entry.description || '',
    data: data,
    tags: entry.tags || '',
    isPlayerVisible: entry.isPlayerVisible === 1,
  };
}

export function closeCreateModal() {
  state.showCreateModal = false;
  state.editingEntry = null;
}

export function updateCreateFormField(field, value) {
  if (field === 'contentType') {
    // Reset data when content type changes
    state.createFormData.data = {};
  }
  state.createFormData[field] = value;
}

export function updateDataField(field, value) {
  state.createFormData.data[field] = value;
}

function resetCreateForm() {
  state.createFormData = {
    contentType: 'item',
    name: '',
    description: '',
    data: {},
    tags: '',
    isPlayerVisible: true,
  };
}

/**
 * Entry selection
 */
export function selectEntry(entry) {
  state.selectedEntry = entry;
}

export function deselectEntry() {
  state.selectedEntry = null;
}

/**
 * Render functions
 */
function renderEntryCard(entry, isDM) {
  const isHidden = entry.isPlayerVisible === 0;

  return `
    <div 
      class="compendium-entry-card ${state.selectedEntry?.id === entry.id ? 'selected' : ''}" 
      data-entry-id="${escapeHtml(entry.id)}"
      data-action="select-compendium-entry"
    >
      <div class="compendium-entry-card__header">
        <div class="compendium-entry-card__badges">
          <span class="badge badge--${getContentTypeBadgeClass(entry.contentType)}">
            ${escapeHtml(titleize(entry.contentType, ''))}
          </span>
          ${isHidden ? '<span class="badge badge--muted">DM Only</span>' : ''}
        </div>
        <h3 class="compendium-entry-card__name">${escapeHtml(entry.name)}</h3>
      </div>
      
      ${entry.description ? `
        <p class="compendium-entry-card__description">${escapeHtml(entry.description.substring(0, 100))}${entry.description.length > 100 ? '...' : ''}</p>
      ` : ''}
      
      ${entry.tags ? `
        <div class="compendium-entry-card__tags">
          ${entry.tags.split(',').map(tag => `
            <span class="tag">${escapeHtml(tag.trim())}</span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function getContentTypeBadgeClass(contentType) {
  const map = {
    item: 'primary',
    weapon: 'danger',
    armor: 'info',
    spell: 'warning',
    feature: 'success',
    monster: 'danger',
    npc: 'info',
    location: 'primary',
    lore: 'muted',
    faction: 'warning',
  };
  return map[contentType] || 'muted';
}

function renderDataFields(contentType) {
  if (contentType === 'item' || contentType === 'weapon' || contentType === 'armor') {
    return `
      <label class="field">
        <span class="label">Rarity</span>
        <select class="select" name="data-rarity">
          <option value="common" ${state.createFormData.data.rarity === 'common' ? 'selected' : ''}>Common</option>
          <option value="uncommon" ${state.createFormData.data.rarity === 'uncommon' ? 'selected' : ''}>Uncommon</option>
          <option value="rare" ${state.createFormData.data.rarity === 'rare' ? 'selected' : ''}>Rare</option>
          <option value="very rare" ${state.createFormData.data.rarity === 'very rare' ? 'selected' : ''}>Very Rare</option>
          <option value="legendary" ${state.createFormData.data.rarity === 'legendary' ? 'selected' : ''}>Legendary</option>
        </select>
      </label>
      
      <label class="field">
        <span class="label">Weight (lbs)</span>
        <input 
          class="input" 
          type="number" 
          name="data-weight" 
          step="0.1" 
          value="${escapeHtml(String(state.createFormData.data.weight || ''))}"
        />
      </label>
      
      <label class="field">
        <span class="label">Value (gp)</span>
        <input 
          class="input" 
          type="number" 
          name="data-value" 
          step="0.01" 
          value="${escapeHtml(String(state.createFormData.data.value || ''))}"
        />
      </label>
    `;
  }

  if (contentType === 'spell') {
    return `
      <label class="field">
        <span class="label">Level</span>
        <input 
          class="input" 
          type="number" 
          name="data-level" 
          min="0" 
          max="9" 
          value="${escapeHtml(String(state.createFormData.data.level || 0))}"
        />
      </label>
      
      <label class="field">
        <span class="label">School</span>
        <input 
          class="input" 
          name="data-school" 
          placeholder="Evocation, Abjuration, etc." 
          value="${escapeHtml(state.createFormData.data.school || '')}"
        />
      </label>
      
      <label class="field">
        <span class="label">Casting Time</span>
        <input 
          class="input" 
          name="data-castingTime" 
          placeholder="1 action" 
          value="${escapeHtml(state.createFormData.data.castingTime || '')}"
        />
      </label>
      
      <label class="field">
        <span class="label">Range</span>
        <input 
          class="input" 
          name="data-range" 
          placeholder="60 feet" 
          value="${escapeHtml(state.createFormData.data.range || '')}"
        />
      </label>
    `;
  }

  if (contentType === 'monster' || contentType === 'npc') {
    return `
      <label class="field">
        <span class="label">Challenge Rating</span>
        <input 
          class="input" 
          name="data-cr" 
          placeholder="1/4, 1, 5, etc." 
          value="${escapeHtml(state.createFormData.data.cr || '')}"
        />
      </label>
      
      <label class="field">
        <span class="label">Hit Points</span>
        <input 
          class="input" 
          type="number" 
          name="data-hp" 
          value="${escapeHtml(String(state.createFormData.data.hp || ''))}"
        />
      </label>
      
      <label class="field">
        <span class="label">Armor Class</span>
        <input 
          class="input" 
          type="number" 
          name="data-ac" 
          value="${escapeHtml(String(state.createFormData.data.ac || ''))}"
        />
      </label>
    `;
  }

  return '';
}

function renderCreateModal(campaignId, isDM) {
  if (!isDM || !state.showCreateModal) {
    return '';
  }

  const isEditing = !!state.editingEntry;
  const title = isEditing ? 'Edit Entry' : 'Create Entry';

  return `
    <div class="modal-overlay">
      <section class="modal-panel">
        <div class="modal-panel__header">
          <h3 class="modal-title">${escapeHtml(title)}</h3>
          <button class="modal-close" data-action="close-compendium-modal">&times;</button>
        </div>
        
        <div class="modal-panel__body">
          <form id="compendium-entry-form">
            <label class="field">
              <span class="label">Content Type *</span>
              <select 
                class="select" 
                name="contentType" 
                data-action="change-content-type"
                ${isEditing ? 'disabled' : ''}
                required
              >
                <option value="item" ${state.createFormData.contentType === 'item' ? 'selected' : ''}>Item</option>
                <option value="weapon" ${state.createFormData.contentType === 'weapon' ? 'selected' : ''}>Weapon</option>
                <option value="armor" ${state.createFormData.contentType === 'armor' ? 'selected' : ''}>Armor</option>
                <option value="spell" ${state.createFormData.contentType === 'spell' ? 'selected' : ''}>Spell</option>
                <option value="feature" ${state.createFormData.contentType === 'feature' ? 'selected' : ''}>Feature</option>
                <option value="monster" ${state.createFormData.contentType === 'monster' ? 'selected' : ''}>Monster</option>
                <option value="npc" ${state.createFormData.contentType === 'npc' ? 'selected' : ''}>NPC</option>
                <option value="location" ${state.createFormData.contentType === 'location' ? 'selected' : ''}>Location</option>
                <option value="lore" ${state.createFormData.contentType === 'lore' ? 'selected' : ''}>Lore</option>
                <option value="faction" ${state.createFormData.contentType === 'faction' ? 'selected' : ''}>Faction</option>
              </select>
            </label>
            
            <label class="field">
              <span class="label">Name *</span>
              <input 
                class="input" 
                name="name" 
                placeholder="Entry name" 
                value="${escapeHtml(state.createFormData.name)}"
                required
              />
            </label>
            
            <label class="field">
              <span class="label">Description</span>
              <textarea 
                class="input" 
                name="description" 
                rows="4" 
                placeholder="Detailed description..."
              >${escapeHtml(state.createFormData.description)}</textarea>
            </label>
            
            <div id="data-fields">
              ${renderDataFields(state.createFormData.contentType)}
            </div>
            
            <label class="field">
              <span class="label">Tags (comma-separated)</span>
              <input 
                class="input" 
                name="tags" 
                placeholder="magic, homebrew, quest" 
                value="${escapeHtml(state.createFormData.tags)}"
              />
            </label>
            
            <label class="field checkbox-field">
              <input 
                type="checkbox" 
                name="isPlayerVisible" 
                ${state.createFormData.isPlayerVisible ? 'checked' : ''}
              />
              <span>Visible to players</span>
            </label>
          </form>
        </div>
        
        <div class="modal-panel__footer">
          <button class="button subtle" data-action="close-compendium-modal">Cancel</button>
          <button 
            class="button primary" 
            data-action="submit-compendium-entry"
            data-campaign-id="${escapeHtml(campaignId)}"
            data-entry-id="${isEditing ? escapeHtml(state.editingEntry.id) : ''}"
          >
            ${isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderEntryDetail(campaignId, isDM, members) {
  if (!state.selectedEntry) {
    return `<div class="empty-card">Select an entry to view details</div>`;
  }

  const entry = state.selectedEntry;
  const isHidden = entry.isPlayerVisible === 0;

  let data = {};
  try {
    data = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data || {};
  } catch {
    data = {};
  }

  return `
    <div class="compendium-detail">
      <div class="compendium-detail__header">
        <div>
          <div class="compendium-detail__badges">
            <span class="badge badge--${getContentTypeBadgeClass(entry.contentType)}">
              ${escapeHtml(titleize(entry.contentType, ''))}
            </span>
            ${isHidden ? '<span class="badge badge--muted">DM Only</span>' : ''}
          </div>
          <h2>${escapeHtml(entry.name)}</h2>
        </div>
        
        ${isDM ? `
          <div class="compendium-detail__actions">
            <button 
              class="button subtle" 
              data-action="edit-compendium-entry"
              data-entry-id="${escapeHtml(entry.id)}"
            >
              Edit
            </button>
            <button 
              class="button" 
              data-action="delete-compendium-entry"
              data-campaign-id="${escapeHtml(campaignId)}"
              data-entry-id="${escapeHtml(entry.id)}"
            >
              Delete
            </button>
          </div>
        ` : ''}
      </div>
      
      ${entry.description ? `
        <div class="compendium-detail__section">
          <h3>Description</h3>
          <p>${escapeHtml(entry.description)}</p>
        </div>
      ` : ''}
      
      ${Object.keys(data).length > 0 ? `
        <div class="compendium-detail__section">
          <h3>Properties</h3>
          <dl class="property-list">
            ${Object.entries(data).map(([key, value]) => `
              <div class="property-item">
                <dt>${escapeHtml(titleize(key, ''))}</dt>
                <dd>${escapeHtml(String(value))}</dd>
              </div>
            `).join('')}
          </dl>
        </div>
      ` : ''}
      
      ${entry.tags ? `
        <div class="compendium-detail__section">
          <h3>Tags</h3>
          <div class="tag-list">
            ${entry.tags.split(',').map(tag => `
              <span class="tag">${escapeHtml(tag.trim())}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${isDM && members.length > 0 ? `
        <div class="compendium-detail__section">
          <h3>Grant to Character</h3>
          <div class="grant-controls">
            <select class="select" id="grant-character-select">
              <option value="">Select character...</option>
              ${members.map(member => {
                const character = member.character || {};
                return `
                  <option value="${escapeHtml(member.characterId)}">
                    ${escapeHtml(character.name || 'Unknown')}
                  </option>
                `;
              }).join('')}
            </select>
            <button 
              class="button primary" 
              data-action="grant-compendium-entry"
              data-campaign-id="${escapeHtml(campaignId)}"
              data-entry-id="${escapeHtml(entry.id)}"
            >
              Grant
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderCompendiumTab(campaignId, isDM = false, members = []) {
  if (state.loading) {
    return '<div class="loading-spinner">Loading compendium...</div>';
  }

  if (state.error) {
    return `<div class="error-card">Error loading compendium: ${escapeHtml(state.error)}</div>`;
  }

  return `
    <div class="compendium-tab">
      ${renderCreateModal(campaignId, isDM)}
      
      <div class="compendium-tab__layout">
        <div class="compendium-tab__sidebar">
          <div class="compendium-filters">
            <div class="compendium-filters__header">
              <h3>Filters</h3>
              ${isDM ? `
                <button 
                  class="button primary small" 
                  data-action="open-compendium-create-modal"
                >
                  Create Entry
                </button>
              ` : ''}
            </div>
            
            <label class="field">
              <span class="label">Search</span>
              <input 
                class="input" 
                type="search" 
                placeholder="Search entries..." 
                value="${escapeHtml(state.filters.search)}"
                data-action="filter-compendium"
                data-field="search"
              />
            </label>
            
            <label class="field">
              <span class="label">Type</span>
              <select 
                class="select" 
                data-action="filter-compendium"
                data-field="type"
              >
                <option value="">All Types</option>
                <option value="item" ${state.filters.type === 'item' ? 'selected' : ''}>Item</option>
                <option value="weapon" ${state.filters.type === 'weapon' ? 'selected' : ''}>Weapon</option>
                <option value="armor" ${state.filters.type === 'armor' ? 'selected' : ''}>Armor</option>
                <option value="spell" ${state.filters.type === 'spell' ? 'selected' : ''}>Spell</option>
                <option value="feature" ${state.filters.type === 'feature' ? 'selected' : ''}>Feature</option>
                <option value="monster" ${state.filters.type === 'monster' ? 'selected' : ''}>Monster</option>
                <option value="npc" ${state.filters.type === 'npc' ? 'selected' : ''}>NPC</option>
                <option value="location" ${state.filters.type === 'location' ? 'selected' : ''}>Location</option>
                <option value="lore" ${state.filters.type === 'lore' ? 'selected' : ''}>Lore</option>
                <option value="faction" ${state.filters.type === 'faction' ? 'selected' : ''}>Faction</option>
              </select>
            </label>
            
            <label class="field">
              <span class="label">Tag</span>
              <input 
                class="input" 
                placeholder="Filter by tag..." 
                value="${escapeHtml(state.filters.tag)}"
                data-action="filter-compendium"
                data-field="tag"
              />
            </label>
            
            ${isDM ? `
              <label class="field checkbox-field">
                <input 
                  type="checkbox" 
                  data-action="filter-compendium"
                  data-field="includeHidden"
                  ${state.filters.includeHidden ? 'checked' : ''}
                />
                <span>Show DM-only entries</span>
              </label>
            ` : ''}
            
            <button 
              class="button subtle small" 
              data-action="clear-compendium-filters"
              data-campaign-id="${escapeHtml(campaignId)}"
            >
              Clear Filters
            </button>
          </div>
          
          <div class="compendium-entries">
            ${state.entries.length === 0 ? `
              <div class="empty-card">
                <p>No entries found.</p>
                ${isDM ? '<p class="muted">Create custom content for your campaign.</p>' : ''}
              </div>
            ` : `
              ${state.entries.map(e => renderEntryCard(e, isDM)).join('')}
            `}
          </div>
        </div>
        
        <div class="compendium-tab__detail">
          ${renderEntryDetail(campaignId, isDM, members)}
        </div>
      </div>
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignCompendiumState() {
  return state;
}
