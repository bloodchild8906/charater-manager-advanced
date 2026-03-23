import { escapeHtml, renderMetaBits, titleize } from './utils.js';
import * as CampaignMembers from './campaign-members.js';
import * as CampaignDMSheet from './campaign-dm-sheet.js';
import * as CampaignSessions from './campaign-sessions.js';
import * as CampaignEvents from './campaign-events.js';
import * as CampaignCompendiumTab from './campaign-compendium-tab.js';

/**
 * Campaign Dashboard State
 */
const state = {
  campaigns: { dm: [], member: [] },
  activeCampaignId: null,
  activeTab: 'overview',
  pendingInviteCount: 0,
  createModalOpen: false,
  createWizardStep: 0,
  createDraft: {
    name: '',
    visibility: 'invite-only',
    maxPlayers: 6,
    description: '',
    worldLore: '',
    bannerUrl: '',
  },
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
 * Data loading
 */
export async function loadCampaigns() {
  try {
    const payload = await api('/api/campaigns', { method: 'GET' });
    state.campaigns = payload.campaigns || { dm: [], member: [] };
    
    // Auto-select first campaign if none selected
    if (!state.activeCampaignId) {
      const allCampaigns = [...state.campaigns.dm, ...state.campaigns.member];
      if (allCampaigns.length > 0) {
        state.activeCampaignId = allCampaigns[0].id;
      }
    }
    
    return state.campaigns;
  } catch (error) {
    console.error('loadCampaigns error:', error);
    throw error;
  }
}

export async function loadPendingInvites() {
  try {
    const payload = await api('/api/campaigns/invites/pending', { method: 'GET' });
    state.pendingInviteCount = (payload.invites || []).length;
    return payload.invites || [];
  } catch (error) {
    console.error('loadPendingInvites error:', error);
    return [];
  }
}

/**
 * Campaign actions
 */
export function selectCampaign(campaignId) {
  state.activeCampaignId = campaignId;
  state.activeTab = 'overview';
}

export function setActiveTab(tab) {
  state.activeTab = tab;
  
  // Load data for specific tabs
  if (tab === 'members' && state.activeCampaignId) {
    CampaignMembers.loadMembers(state.activeCampaignId);
  }
  
  if (tab === 'sessions' && state.activeCampaignId) {
    CampaignSessions.loadSessions(state.activeCampaignId);
    CampaignSessions.loadMembers(state.activeCampaignId);
  }
  
  if ((tab === 'events' || tab === 'loot') && state.activeCampaignId) {
    CampaignEvents.loadEvents(state.activeCampaignId);
    CampaignEvents.loadSessions(state.activeCampaignId);
    CampaignEvents.loadMembers(state.activeCampaignId);
  }
  
  if (tab === 'compendium' && state.activeCampaignId) {
    CampaignCompendiumTab.loadEntries(state.activeCampaignId);
  }
}

export function openCreateModal() {
  state.createModalOpen = true;
  state.createWizardStep = 0;
  state.createDraft = {
    name: '',
    visibility: 'invite-only',
    maxPlayers: 6,
    description: '',
    worldLore: '',
    bannerUrl: '',
  };
}

export function closeCreateModal() {
  state.createModalOpen = false;
  state.createWizardStep = 0;
}

export function updateCreateDraft(field, value) {
  state.createDraft[field] = value;
}

export function nextWizardStep() {
  if (state.createWizardStep < 2) {
    state.createWizardStep += 1;
  }
}

export function prevWizardStep() {
  if (state.createWizardStep > 0) {
    state.createWizardStep -= 1;
  }
}

export async function submitCreateCampaign() {
  try {
    const payload = await api('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(state.createDraft),
    });
    
    const newCampaign = payload.campaign;
    state.campaigns.dm.unshift(newCampaign);
    state.activeCampaignId = newCampaign.id;
    state.activeTab = 'overview';
    closeCreateModal();
    
    return newCampaign;
  } catch (error) {
    console.error('submitCreateCampaign error:', error);
    throw error;
  }
}

/**
 * Getters
 */
export function getActiveCampaign() {
  const allCampaigns = [...state.campaigns.dm, ...state.campaigns.member];
  return allCampaigns.find(c => c.id === state.activeCampaignId) || null;
}

export function getPendingInviteCount() {
  return state.pendingInviteCount;
}

export function getActiveTab() {
  return state.activeTab;
}

/**
 * Render functions
 */
export function renderCampaignNavLink() {
  const count = state.pendingInviteCount;
  const badge = count > 0 ? `<span class="badge badge--alert">${escapeHtml(String(count))}</span>` : '';
  
  return `
    <button class="button subtle" data-action="open-campaigns">
      Campaigns ${badge}
    </button>
  `;
}

function renderCampaignPill(campaign, isDM = false) {
  const statusBadge = campaign.status === 'archived' 
    ? '<span class="pill-badge pill-badge--muted">Archived</span>' 
    : '';
  const dmBadge = isDM ? '<span class="pill-badge pill-badge--primary">DM</span>' : '';
  
  return `
    <button 
      class="character-pill ${campaign.id === state.activeCampaignId ? 'active' : ''}" 
      data-action="select-campaign" 
      data-campaign-id="${escapeHtml(campaign.id)}"
    >
      <div class="character-pill__top">
        <strong>${escapeHtml(campaign.name)}</strong>
        ${dmBadge}${statusBadge}
      </div>
      <div class="character-pill__meta">
        ${renderMetaBits([
          titleize(campaign.visibility, ''),
          `${campaign.sessionCount || 0} sessions`,
        ])}
      </div>
    </button>
  `;
}

export function renderCampaignSidebar() {
  const dmCampaigns = state.campaigns.dm || [];
  const memberCampaigns = state.campaigns.member || [];
  const totalCount = dmCampaigns.length + memberCampaigns.length;
  
  return `
    <section class="panel roster-panel">
      <div class="panel-header">
        <div>
          <div class="section-title">Campaigns</div>
          <div class="muted">${escapeHtml(String(totalCount))} total</div>
        </div>
        <button class="button primary" data-action="create-campaign">New Campaign</button>
      </div>
      
      ${dmCampaigns.length > 0 ? `
        <div class="campaign-section">
          <div class="label">Dungeon Master</div>
          <div class="character-list">
            ${dmCampaigns.map(c => renderCampaignPill(c, true)).join('')}
          </div>
        </div>
      ` : ''}
      
      ${memberCampaigns.length > 0 ? `
        <div class="campaign-section">
          <div class="label">Player</div>
          <div class="character-list">
            ${memberCampaigns.map(c => renderCampaignPill(c, false)).join('')}
          </div>
        </div>
      ` : ''}
      
      ${totalCount === 0 ? `
        <div class="empty-card">No campaigns yet. Create one to get started.</div>
      ` : ''}
    </section>
  `;
}

function renderWizardStep1() {
  return `
    <div class="wizard-step">
      <h3>Campaign Basics</h3>
      <label class="field">
        <span class="label">Campaign Name *</span>
        <input 
          class="input" 
          id="campaign-name" 
          placeholder="The Shattered Realm" 
          value="${escapeHtml(state.createDraft.name)}"
          data-field="name"
        />
      </label>
      
      <label class="field">
        <span class="label">Visibility</span>
        <select class="select" id="campaign-visibility" data-field="visibility">
          <option value="private" ${state.createDraft.visibility === 'private' ? 'selected' : ''}>Private</option>
          <option value="invite-only" ${state.createDraft.visibility === 'invite-only' ? 'selected' : ''}>Invite Only</option>
          <option value="public" ${state.createDraft.visibility === 'public' ? 'selected' : ''}>Public</option>
        </select>
      </label>
      
      <label class="field">
        <span class="label">Max Players</span>
        <input 
          class="input" 
          type="number" 
          id="campaign-max-players" 
          min="1" 
          max="20" 
          value="${escapeHtml(String(state.createDraft.maxPlayers))}"
          data-field="maxPlayers"
        />
      </label>
    </div>
  `;
}

function renderWizardStep2() {
  return `
    <div class="wizard-step">
      <h3>Campaign Details</h3>
      <label class="field">
        <span class="label">Description</span>
        <textarea 
          class="input" 
          id="campaign-description" 
          rows="3" 
          placeholder="A brief overview of your campaign..."
          data-field="description"
        >${escapeHtml(state.createDraft.description)}</textarea>
      </label>
      
      <label class="field">
        <span class="label">World Lore</span>
        <textarea 
          class="input" 
          id="campaign-world-lore" 
          rows="4" 
          placeholder="The history and setting of your world..."
          data-field="worldLore"
        >${escapeHtml(state.createDraft.worldLore)}</textarea>
      </label>
      
      <label class="field">
        <span class="label">Banner Image URL</span>
        <input 
          class="input" 
          id="campaign-banner-url" 
          placeholder="https://example.com/banner.jpg"
          value="${escapeHtml(state.createDraft.bannerUrl)}"
          data-field="bannerUrl"
        />
      </label>
    </div>
  `;
}

function renderWizardStep3() {
  return `
    <div class="wizard-step">
      <h3>Confirm Campaign</h3>
      <div class="summary-card">
        <div class="summary-card__row">
          <span class="label">Name:</span>
          <strong>${escapeHtml(state.createDraft.name)}</strong>
        </div>
        <div class="summary-card__row">
          <span class="label">Visibility:</span>
          <span>${escapeHtml(titleize(state.createDraft.visibility, ''))}</span>
        </div>
        <div class="summary-card__row">
          <span class="label">Max Players:</span>
          <span>${escapeHtml(String(state.createDraft.maxPlayers))}</span>
        </div>
        ${state.createDraft.description ? `
          <div class="summary-card__row">
            <span class="label">Description:</span>
            <p class="muted">${escapeHtml(state.createDraft.description)}</p>
          </div>
        ` : ''}
      </div>
      <p class="muted">Click Create to finalize your campaign.</p>
    </div>
  `;
}

export function renderCreateCampaignModal() {
  if (!state.createModalOpen) {
    return '';
  }
  
  const steps = ['Basics', 'Details', 'Confirm'];
  const canAdvance = state.createWizardStep === 0 
    ? state.createDraft.name.trim().length > 0 
    : true;
  
  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--wizard">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">Create Campaign</div>
            <h3 class="modal-title">Step ${state.createWizardStep + 1} of ${steps.length}: ${steps[state.createWizardStep]}</h3>
          </div>
          <button class="modal-close" data-action="close-create-campaign-modal">&times;</button>
        </div>
        
        <div class="wizard-progress">
          ${steps.map((step, i) => `
            <div class="wizard-progress__step ${i === state.createWizardStep ? 'active' : ''} ${i < state.createWizardStep ? 'complete' : ''}">
              <div class="wizard-progress__dot">${i + 1}</div>
              <div class="wizard-progress__label">${escapeHtml(step)}</div>
            </div>
          `).join('')}
        </div>
        
        <div class="modal-panel__body">
          ${state.createWizardStep === 0 ? renderWizardStep1() : ''}
          ${state.createWizardStep === 1 ? renderWizardStep2() : ''}
          ${state.createWizardStep === 2 ? renderWizardStep3() : ''}
        </div>
        
        <div class="modal-panel__footer">
          ${state.createWizardStep > 0 ? `
            <button class="button subtle" data-action="prev-wizard-step">Back</button>
          ` : ''}
          ${state.createWizardStep < 2 ? `
            <button class="button primary" data-action="next-wizard-step" ${!canAdvance ? 'disabled' : ''}>Next</button>
          ` : `
            <button class="button primary" data-action="submit-create-campaign">Create Campaign</button>
          `}
        </div>
      </section>
    </div>
  `;
}

function renderTabButton(tab, label) {
  const isActive = state.activeTab === tab;
  return `
    <button 
      class="tab-button ${isActive ? 'active' : ''}" 
      data-action="set-campaign-tab" 
      data-tab="${escapeHtml(tab)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

export function renderCampaignDetail() {
  const campaign = getActiveCampaign();
  
  if (!campaign) {
    return `
      <div class="panel">
        <div class="empty-card">Select a campaign from the sidebar to view details.</div>
      </div>
    `;
  }
  
  return `
    <div class="panel campaign-detail">
      <div class="campaign-detail__header">
        <div>
          <div class="eyebrow">Campaign</div>
          <h2>${escapeHtml(campaign.name)}</h2>
        </div>
      </div>
      
      <div class="tab-bar">
        ${renderTabButton('overview', 'Overview')}
        ${renderTabButton('members', 'Members')}
        ${renderTabButton('sessions', 'Sessions')}
        ${renderTabButton('events', 'Events')}
        ${renderTabButton('loot', 'Loot')}
        ${renderTabButton('compendium', 'Compendium')}
        ${renderTabButton('houserules', 'House Rules')}
        ${renderTabButton('settings', 'Settings')}
      </div>
      
      <div class="tab-content" id="campaign-tab-content">
        ${renderTabContent()}
      </div>
    </div>
  `;
}

function renderTabContent() {
  const tab = state.activeTab;
  const campaign = getActiveCampaign();
  const isDM = campaign ? state.campaigns.dm.some(c => c.id === campaign.id) : false;
  
  if (tab === 'overview') {
    return renderOverviewTab();
  }
  
  if (tab === 'members') {
    return CampaignMembers.renderMembersTab(state.activeCampaignId, isDM);
  }
  
  if (tab === 'sessions') {
    return CampaignSessions.renderSessionsTab(state.activeCampaignId, isDM);
  }
  
  if (tab === 'events') {
    return CampaignEvents.renderEventsTab(state.activeCampaignId, isDM, 'timeline');
  }
  
  if (tab === 'loot') {
    return CampaignEvents.renderEventsTab(state.activeCampaignId, isDM, 'loot');
  }
  
  if (tab === 'compendium') {
    // Load members for grant functionality
    const members = CampaignMembers.getCampaignMembersState().members || [];
    return CampaignCompendiumTab.renderCompendiumTab(state.activeCampaignId, isDM, members);
  }
  
  if (tab === 'settings') {
    return renderSettingsTab();
  }
  
  // Placeholder for other tabs
  return `<div class="empty-card">The ${escapeHtml(tab)} tab is not yet implemented.</div>`;
}

function renderOverviewTab() {
  const campaign = getActiveCampaign();
  if (!campaign) return '';
  
  return `
    <div class="campaign-overview">
      ${campaign.bannerUrl ? `
        <div class="campaign-banner">
          <img src="${escapeHtml(campaign.bannerUrl)}" alt="${escapeHtml(campaign.name)} banner" />
        </div>
      ` : ''}
      
      <div class="campaign-overview__stats">
        <div class="summary-card">
          <div class="label">Sessions</div>
          <div class="value">${escapeHtml(String(campaign.sessionCount || 0))}</div>
        </div>
        <div class="summary-card">
          <div class="label">Members</div>
          <div class="value">${escapeHtml(String(campaign.memberCount || 0))}</div>
        </div>
        <div class="summary-card">
          <div class="label">Status</div>
          <div class="value">
            <span class="badge ${campaign.status === 'active' ? 'badge--success' : 'badge--muted'}">
              ${escapeHtml(titleize(campaign.status || 'active', 'Active'))}
            </span>
          </div>
        </div>
      </div>
      
      ${campaign.description ? `
        <div class="campaign-section">
          <h3>Description</h3>
          <p>${escapeHtml(campaign.description)}</p>
        </div>
      ` : ''}
      
      ${campaign.worldLore ? `
        <div class="campaign-section">
          <h3>World Lore</h3>
          <p>${escapeHtml(campaign.worldLore)}</p>
        </div>
      ` : ''}
      
      <div class="campaign-section">
        <h3>Dungeon Master</h3>
        <p class="muted">DM User ID: ${escapeHtml(campaign.dmUserId)}</p>
      </div>
    </div>
  `;
}

function renderSettingsTab() {
  const campaign = getActiveCampaign();
  if (!campaign) return '';
  
  const isDM = state.campaigns.dm.some(c => c.id === campaign.id);
  
  if (!isDM) {
    return `<div class="empty-card">Only the Dungeon Master can access campaign settings.</div>`;
  }
  
  return `
    <div class="campaign-settings">
      <form id="campaign-settings-form">
        <label class="field">
          <span class="label">Campaign Name</span>
          <input 
            class="input" 
            name="name" 
            value="${escapeHtml(campaign.name)}"
          />
        </label>
        
        <label class="field">
          <span class="label">Description</span>
          <textarea 
            class="input" 
            name="description" 
            rows="3"
          >${escapeHtml(campaign.description || '')}</textarea>
        </label>
        
        <label class="field">
          <span class="label">Banner URL</span>
          <input 
            class="input" 
            name="bannerUrl" 
            value="${escapeHtml(campaign.bannerUrl || '')}"
          />
        </label>
        
        <label class="field">
          <span class="label">Visibility</span>
          <select class="select" name="visibility">
            <option value="private" ${campaign.visibility === 'private' ? 'selected' : ''}>Private</option>
            <option value="invite-only" ${campaign.visibility === 'invite-only' ? 'selected' : ''}>Invite Only</option>
            <option value="public" ${campaign.visibility === 'public' ? 'selected' : ''}>Public</option>
          </select>
        </label>
        
        <button type="submit" class="button primary" data-action="save-campaign-settings">Save Changes</button>
      </form>
      
      <hr class="divider" />
      
      <div class="campaign-danger-zone">
        <h3>Danger Zone</h3>
        
        <div class="field">
          <button class="button subtle" data-action="archive-campaign">
            ${campaign.status === 'archived' ? 'Unarchive Campaign' : 'Archive Campaign'}
          </button>
          <p class="muted">Archived campaigns prevent new members from joining.</p>
        </div>
        
        <div class="field">
          <button class="button" data-action="delete-campaign">Delete Campaign</button>
          <p class="muted">Permanently delete this campaign and all associated data.</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Export state for debugging
 */
export function getCampaignDashboardState() {
  return state;
}

/**
 * Export campaign members module
 */
export { CampaignMembers, CampaignDMSheet, CampaignSessions, CampaignEvents, CampaignCompendiumTab };
