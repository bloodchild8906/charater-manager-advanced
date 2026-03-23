import { escapeHtml } from './utils.js';

/**
 * DM Sheet Mode State
 */
const state = {
  activeDMSheet: null, // { characterId, campaignId, character, member }
  editModeEnabled: false,
  dmNotes: '',
  dmNotesAutoSaveTimer: null,
  eventHistory: [],
  conditions: [],
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
 * Open a character sheet in DM mode
 */
export async function openAsDM(characterId, campaignId) {
  state.loading = true;
  
  try {
    // Load character data from DM route
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}`, {
      method: 'GET',
    });

    state.activeDMSheet = {
      characterId,
      campaignId,
      character: payload.character,
      member: payload.member,
    };

    state.dmNotes = payload.member?.dmNotes || '';
    state.editModeEnabled = false;

    // Load conditions
    await loadConditions(campaignId, characterId);

    // Load event history
    await loadEventHistory(campaignId, characterId);

    // Call the existing sheet loader (this would be imported from the main app controller)
    // For now, we'll emit a custom event that the app controller can listen to
    window.dispatchEvent(new CustomEvent('dm-sheet-open', {
      detail: { characterId, campaignId, character: payload.character },
    }));

    // Inject DM UI
    injectDMBanner(payload.character, payload.member);
    injectDMSidebar();

  } catch (error) {
    console.error('openAsDM error:', error);
    alert(`Failed to open DM sheet: ${error.message}`);
  } finally {
    state.loading = false;
  }
}

/**
 * Load conditions for a character
 */
async function loadConditions(campaignId, characterId) {
  try {
    // Conditions are loaded with the character data
    // For now, we'll use the member data
    state.conditions = state.activeDMSheet?.member?.conditions || [];
  } catch (error) {
    console.error('loadConditions error:', error);
    state.conditions = [];
  }
}

/**
 * Load event history for a character
 */
async function loadEventHistory(campaignId, characterId) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/events?limit=10&characterId=${characterId}`, {
      method: 'GET',
    });
    
    state.eventHistory = (payload.events || [])
      .filter(e => {
        const appliesTo = typeof e.appliesTo === 'string' ? JSON.parse(e.appliesTo) : e.appliesTo;
        return Array.isArray(appliesTo) && appliesTo.includes(characterId);
      })
      .slice(0, 10);
  } catch (error) {
    console.error('loadEventHistory error:', error);
    state.eventHistory = [];
  }
}

/**
 * Inject DM banner above the sheet
 */
function injectDMBanner(character, member) {
  const existingBanner = document.getElementById('dm-mode-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const banner = document.createElement('div');
  banner.id = 'dm-mode-banner';
  banner.className = 'dm-banner';
  banner.innerHTML = `
    <div class="dm-banner__content">
      <div class="dm-banner__info">
        <strong>DM View</strong> — ${escapeHtml(character.name || 'Character')} 
        (owned by ${escapeHtml(member?.ownerDisplayName || 'Unknown')})
      </div>
      <div class="dm-banner__controls">
        <label class="dm-banner__toggle">
          <input 
            type="checkbox" 
            id="dm-edit-mode-toggle" 
            ${state.editModeEnabled ? 'checked' : ''}
          />
          <span>Enable Edit Mode</span>
        </label>
      </div>
    </div>
  `;

  // Find the sheet container and prepend the banner
  const sheetContainer = document.querySelector('.sheet-container') || document.querySelector('.panel');
  if (sheetContainer) {
    sheetContainer.insertBefore(banner, sheetContainer.firstChild);
  }

  // Attach event listener
  const toggle = document.getElementById('dm-edit-mode-toggle');
  if (toggle) {
    toggle.addEventListener('change', handleEditModeToggle);
  }
}

/**
 * Inject DM sidebar
 */
function injectDMSidebar() {
  const existingSidebar = document.getElementById('dm-sidebar');
  if (existingSidebar) {
    existingSidebar.remove();
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'dm-sidebar';
  sidebar.className = 'dm-sidebar';
  sidebar.innerHTML = renderDMSidebar();

  // Append to body or a specific container
  document.body.appendChild(sidebar);

  // Attach event listeners
  attachDMSidebarListeners();
}

/**
 * Render DM sidebar content
 */
function renderDMSidebar() {
  const { characterId, campaignId, member } = state.activeDMSheet || {};

  return `
    <div class="dm-sidebar__header">
      <h3>DM Tools</h3>
      <button class="dm-sidebar__close" data-action="close-dm-sidebar">&times;</button>
    </div>
    
    <div class="dm-sidebar__body">
      <!-- DM Notes Section -->
      <div class="dm-sidebar__section">
        <h4>DM Notes</h4>
        <textarea 
          class="dm-notes-textarea" 
          id="dm-notes-textarea"
          placeholder="Private notes about this character..."
          rows="6"
        >${escapeHtml(state.dmNotes)}</textarea>
        <div class="dm-notes-status" id="dm-notes-status"></div>
      </div>
      
      <!-- Conditions Section -->
      <div class="dm-sidebar__section">
        <h4>Conditions</h4>
        <div class="conditions-list" id="conditions-list">
          ${renderConditionsList()}
        </div>
        <div class="add-condition-form">
          <select class="select small" id="add-condition-select">
            <option value="">Add condition...</option>
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
          <button 
            class="button small primary" 
            data-action="add-condition"
            data-campaign-id="${escapeHtml(campaignId || '')}"
            data-character-id="${escapeHtml(characterId || '')}"
          >
            Add
          </button>
        </div>
      </div>
      
      <!-- Quick Actions Section -->
      <div class="dm-sidebar__section">
        <h4>Quick Actions</h4>
        <div class="quick-actions">
          <button class="button small" data-action="dm-award-xp">Award XP</button>
          <button class="button small" data-action="dm-apply-damage">Apply Damage</button>
          <button class="button small" data-action="dm-apply-healing">Apply Healing</button>
          <button class="button small" data-action="dm-grant-item">Grant Item</button>
          <button class="button small" data-action="dm-add-feature">Add Feature</button>
        </div>
      </div>
      
      <!-- Event History Section -->
      <div class="dm-sidebar__section">
        <h4>Event History</h4>
        <div class="event-history" id="event-history">
          ${renderEventHistory()}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render conditions list
 */
function renderConditionsList() {
  if (state.conditions.length === 0) {
    return '<div class="muted small">No active conditions</div>';
  }

  return state.conditions.map(cond => `
    <div class="condition-item">
      <span class="condition-name">${escapeHtml(cond.conditionName || cond.condition_name)}</span>
      <button 
        class="button-icon small" 
        data-action="remove-condition"
        data-campaign-id="${escapeHtml(state.activeDMSheet?.campaignId || '')}"
        data-character-id="${escapeHtml(state.activeDMSheet?.characterId || '')}"
        data-condition="${escapeHtml(cond.conditionName || cond.condition_name)}"
        title="Remove condition"
      >
        &times;
      </button>
    </div>
  `).join('');
}

/**
 * Render event history
 */
function renderEventHistory() {
  if (state.eventHistory.length === 0) {
    return '<div class="muted small">No recent events</div>';
  }

  return state.eventHistory.map(event => `
    <div class="event-item">
      <div class="event-item__title">${escapeHtml(event.title || event.eventType)}</div>
      <div class="event-item__meta muted small">
        ${new Date(event.createdAt).toLocaleDateString()}
      </div>
    </div>
  `).join('');
}

/**
 * Attach event listeners to DM sidebar
 */
function attachDMSidebarListeners() {
  // DM Notes autosave
  const notesTextarea = document.getElementById('dm-notes-textarea');
  if (notesTextarea) {
    notesTextarea.addEventListener('input', handleDMNotesInput);
  }

  // Close sidebar
  const closeBtn = document.querySelector('[data-action="close-dm-sidebar"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDMSidebar);
  }

  // Add condition
  const addConditionBtn = document.querySelector('[data-action="add-condition"]');
  if (addConditionBtn) {
    addConditionBtn.addEventListener('click', handleAddCondition);
  }

  // Remove condition buttons
  document.querySelectorAll('[data-action="remove-condition"]').forEach(btn => {
    btn.addEventListener('click', handleRemoveCondition);
  });

  // Quick action buttons
  document.querySelectorAll('[data-action^="dm-"]').forEach(btn => {
    btn.addEventListener('click', handleQuickAction);
  });
}

/**
 * Handle edit mode toggle
 */
function handleEditModeToggle(event) {
  state.editModeEnabled = event.target.checked;

  // Enable/disable all sheet inputs
  const sheetInputs = document.querySelectorAll('.sheet-container input, .sheet-container textarea, .sheet-container select');
  sheetInputs.forEach(input => {
    input.disabled = !state.editModeEnabled;
  });

  // Swap save handler if edit mode is enabled
  if (state.editModeEnabled) {
    // Store original save handler and replace with DM save handler
    window.addEventListener('sheet-save', handleDMSheetSave);
  } else {
    // Revert without saving
    window.removeEventListener('sheet-save', handleDMSheetSave);
  }
}

/**
 * Handle DM sheet save
 */
async function handleDMSheetSave(event) {
  const { characterId, campaignId } = state.activeDMSheet || {};
  if (!characterId || !campaignId) return;

  try {
    const sheetData = event.detail; // Assuming the sheet emits data in the event

    await api(`/api/campaigns/${campaignId}/characters/${characterId}`, {
      method: 'PATCH',
      body: JSON.stringify(sheetData),
    });

    alert('Character sheet saved successfully');
  } catch (error) {
    console.error('handleDMSheetSave error:', error);
    alert(`Failed to save: ${error.message}`);
  }
}

/**
 * Handle DM notes input (autosave)
 */
function handleDMNotesInput(event) {
  state.dmNotes = event.target.value;

  // Clear existing timer
  if (state.dmNotesAutoSaveTimer) {
    clearTimeout(state.dmNotesAutoSaveTimer);
  }

  // Show saving status
  const statusEl = document.getElementById('dm-notes-status');
  if (statusEl) {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'dm-notes-status saving';
  }

  // Set new timer
  state.dmNotesAutoSaveTimer = setTimeout(async () => {
    await saveDMNotes();
  }, 1000);
}

/**
 * Save DM notes
 */
async function saveDMNotes() {
  const { campaignId, member } = state.activeDMSheet || {};
  if (!campaignId || !member) return;

  try {
    await api(`/api/campaigns/${campaignId}/members/${member.id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ dmNotes: state.dmNotes }),
    });

    const statusEl = document.getElementById('dm-notes-status');
    if (statusEl) {
      statusEl.textContent = 'Saved';
      statusEl.className = 'dm-notes-status saved';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  } catch (error) {
    console.error('saveDMNotes error:', error);
    const statusEl = document.getElementById('dm-notes-status');
    if (statusEl) {
      statusEl.textContent = 'Error saving';
      statusEl.className = 'dm-notes-status error';
    }
  }
}

/**
 * Handle add condition
 */
async function handleAddCondition(event) {
  const campaignId = event.target.dataset.campaignId;
  const characterId = event.target.dataset.characterId;
  const select = document.getElementById('add-condition-select');
  const condition = select?.value;

  if (!condition) return;

  try {
    await api(`/api/campaigns/${campaignId}/characters/${characterId}/apply-condition`, {
      method: 'POST',
      body: JSON.stringify({ condition, source: 'DM' }),
    });

    // Reload conditions
    await loadConditions(campaignId, characterId);
    
    // Re-render conditions list
    const conditionsList = document.getElementById('conditions-list');
    if (conditionsList) {
      conditionsList.innerHTML = renderConditionsList();
      attachDMSidebarListeners();
    }

    // Reset select
    if (select) {
      select.value = '';
    }
  } catch (error) {
    console.error('handleAddCondition error:', error);
    alert(`Failed to add condition: ${error.message}`);
  }
}

/**
 * Handle remove condition
 */
async function handleRemoveCondition(event) {
  const campaignId = event.target.dataset.campaignId;
  const characterId = event.target.dataset.characterId;
  const condition = event.target.dataset.condition;

  try {
    await api(`/api/campaigns/${campaignId}/characters/${characterId}/conditions/${condition}`, {
      method: 'DELETE',
    });

    // Reload conditions
    await loadConditions(campaignId, characterId);
    
    // Re-render conditions list
    const conditionsList = document.getElementById('conditions-list');
    if (conditionsList) {
      conditionsList.innerHTML = renderConditionsList();
      attachDMSidebarListeners();
    }
  } catch (error) {
    console.error('handleRemoveCondition error:', error);
    alert(`Failed to remove condition: ${error.message}`);
  }
}

/**
 * Handle quick actions
 */
function handleQuickAction(event) {
  const action = event.target.dataset.action;
  
  // These would open modals or prompt for input
  // For now, just alert
  alert(`Quick action: ${action} - Not yet implemented`);
}

/**
 * Close DM sidebar
 */
export function closeDMSidebar() {
  const sidebar = document.getElementById('dm-sidebar');
  if (sidebar) {
    sidebar.remove();
  }

  const banner = document.getElementById('dm-mode-banner');
  if (banner) {
    banner.remove();
  }

  state.activeDMSheet = null;
  state.editModeEnabled = false;
}

/**
 * Export state for debugging
 */
export function getDMSheetState() {
  return state;
}
