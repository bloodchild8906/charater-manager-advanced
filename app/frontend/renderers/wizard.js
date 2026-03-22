import { ABILITY_KEYS, ABILITY_LABELS, EDITION_OPTIONS } from '../constants.js';
import { escapeHtml, getAbilityModifierValue, titleize } from '../utils.js';
import { renderMarkdown } from './markdown.js';

export function buildSelectionDetailsMarkdown(entry, extraLines = []) {
  if (!entry) {
    return '';
  }

  const sections = [];
  const detailLines = [...extraLines];

  if (entry.sourceCode) {
    detailLines.unshift(`**Source:** ${entry.sourceCode}`);
  }

  if (detailLines.length > 0) {
    sections.push(detailLines.join('\n'));
  }

  const description = String(entry.description || '').trim();
  if (description) {
    sections.push(description);
  }

  return sections.join('\n\n');
}

function renderSelectionDetailCard({ label, entry, emptyCopy, extraLines = [] }) {
  const markdown = buildSelectionDetailsMarkdown(entry, extraLines);

  return `
    <article class="wizard-selection-card">
      <div class="wizard-selection-card__header">
        <div>
          <div class="wizard-review-card__label">${escapeHtml(label)}</div>
          <div class="wizard-selection-card__title">${escapeHtml(entry?.name || 'Choose')}</div>
        </div>
        ${entry?.sourceCode ? `<span class="pill-badge">${escapeHtml(entry.sourceCode)}</span>` : ''}
      </div>
      <div class="wizard-selection-card__markdown markdown-content">
        ${renderMarkdown(markdown, emptyCopy)}
      </div>
    </article>
  `;
}

export function renderWizardModal({
  wizard,
  steps,
  canAdvance,
  getCompendiumEntries,
  getCompendiumEntryBySlug,
  getClassHitDie,
  renderSummaryCards,
}) {
  if (!wizard) {
    return '';
  }

  const isLastStep = wizard.step === steps.length - 1;
  const classEntry = getCompendiumEntryBySlug('classes', wizard.draft.classSlug);
  const ancestryEntry = getCompendiumEntryBySlug('ancestries', wizard.draft.ancestrySlug);
  const backgroundEntry = getCompendiumEntryBySlug('backgrounds', wizard.draft.backgroundSlug);
  let content;

  if (wizard.mode === 'levelup') {
    content =
      wizard.step === 0
        ? `
            <div class="wizard-step">
              <div class="wizard-step__hero">
                <div class="wizard-levelup__delta">${escapeHtml(String(wizard.draft.level))} -&gt; ${escapeHtml(String(wizard.nextLevel))}</div>
                <div class="muted">${escapeHtml(titleize(wizard.draft.classSlug, 'Adventurer'))} advancement for ${escapeHtml(wizard.characterName)}.</div>
              </div>
              <div class="wizard-form-grid wizard-form-grid--two">
                <label class="field">
                  <span class="label">HP Gain</span>
                  <input class="input" id="wizard-hp-gain" type="number" min="1" value="${escapeHtml(String(wizard.hpGain))}" />
                </label>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">Recommended</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Math.max(1, Math.floor(getClassHitDie(wizard.draft.classSlug) / 2) + 1 + getAbilityModifierValue(wizard.draft.abilities.CON))))}</div>
                  <div class="muted">Average hit die gain with Constitution applied.</div>
                </div>
              </div>
            </div>
          `
        : `
            <div class="wizard-step">
              <div class="wizard-review-grid">
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">New Level</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(wizard.nextLevel))}</div>
                </div>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">HP Max</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Number(wizard.draft.hp.max) + Number(wizard.hpGain)))}</div>
                </div>
                <div class="wizard-review-card">
                  <div class="wizard-review-card__label">HP Current</div>
                  <div class="wizard-review-card__value">${escapeHtml(String(Math.min(Number(wizard.draft.hp.max) + Number(wizard.hpGain), Number(wizard.draft.hp.current) + Number(wizard.hpGain))))}</div>
                </div>
              </div>
              <p class="muted wizard-step__copy">Apply the level increase, then continue editing the live sheet directly.</p>
            </div>
          `;
  } else if (wizard.step === 0) {
    content = `
      <div class="wizard-step">
        <div class="wizard-form-grid wizard-form-grid--two">
          <label class="field">
            <span class="label">Character Name</span>
            <input class="input" data-wizard-bind="name" value="${escapeHtml(wizard.draft.name)}" placeholder="Aldric Stormveil" />
          </label>
          <label class="field">
            <span class="label">Alignment</span>
            <input class="input" data-wizard-bind="alignment" value="${escapeHtml(wizard.draft.alignment)}" />
          </label>
          <label class="field wizard-form-grid__full">
            <span class="label">Edition</span>
            <select class="select" data-wizard-bind="edition">
              ${EDITION_OPTIONS.map(([value, label]) => `<option value="${value}" ${wizard.draft.edition === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
    `;
  } else if (wizard.step === 1) {
    content = `
      <div class="wizard-step">
        <div class="wizard-form-grid wizard-form-grid--three">
          <label class="field">
            <span class="label">Class</span>
            <select class="select" data-wizard-bind="classSlug">
              ${getCompendiumEntries('classes').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.classSlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Ancestry</span>
            <select class="select" data-wizard-bind="ancestrySlug">
              ${getCompendiumEntries('ancestries').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.ancestrySlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span class="label">Background</span>
            <select class="select" data-wizard-bind="backgroundSlug">
              ${getCompendiumEntries('backgrounds').map((entry) => `<option value="${escapeHtml(entry.slug)}" ${wizard.draft.backgroundSlug === entry.slug ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="wizard-review-grid">
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Hit Die</div>
            <div class="wizard-review-card__value">d${escapeHtml(String(classEntry?.hitDie || 8))}</div>
            <div class="muted">${escapeHtml(classEntry?.name || 'Class')}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Ancestry</div>
            <div class="wizard-review-card__value">${escapeHtml(ancestryEntry?.name || 'Choose')}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Background</div>
            <div class="wizard-review-card__value">${escapeHtml(backgroundEntry?.name || 'Choose')}</div>
          </div>
        </div>
        <div class="wizard-selection-details">
          ${renderSelectionDetailCard({
            label: 'Class Details',
            entry: classEntry,
            extraLines: classEntry?.hitDie ? [`**Hit Die:** d${classEntry.hitDie}`] : [],
            emptyCopy: 'Select a class to review its rules text.',
          })}
          ${renderSelectionDetailCard({
            label: 'Ancestry Details',
            entry: ancestryEntry,
            emptyCopy: 'Select an ancestry to review its traits.',
          })}
          ${renderSelectionDetailCard({
            label: 'Background Details',
            entry: backgroundEntry,
            emptyCopy: 'Select a background to review its features.',
          })}
        </div>
      </div>
    `;
  } else if (wizard.step === 2) {
    content = `
      <div class="wizard-step">
        <div class="wizard-scores-rail">
          ${wizard.availableScores.map((score) => `<span class="wizard-score-pill">${escapeHtml(String(score))}</span>`).join('')}
          ${wizard.availableScores.length === 0 ? '<span class="muted">All standard array values assigned.</span>' : ''}
        </div>
        <div class="wizard-ability-grid">
          ${ABILITY_KEYS.map((ability) => `
            <div class="wizard-ability-card">
              <div class="wizard-ability-card__label">${escapeHtml(ABILITY_LABELS[ability])}</div>
              <div class="wizard-ability-card__value">${escapeHtml(String(wizard.assignedScores[ability] ?? '--'))}</div>
              <div class="wizard-ability-card__actions">
                ${wizard.availableScores.map((score) => `<button class="wizard-score-button" data-action="wizard-score" data-ability="${ability}" data-score="${score}">${escapeHtml(String(score))}</button>`).join('')}
                ${wizard.assignedScores[ability] != null ? `<button class="wizard-score-button wizard-score-button--clear" data-action="wizard-score-clear" data-ability="${ability}">Clear</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (wizard.step === 3) {
    content = `
      <div class="wizard-step">
        <div class="panel-header">
          <div>
            <div class="section-title">Starting Combat Profile</div>
            <div class="muted">Use the recommended class-and-ability defaults, or override them here.</div>
          </div>
          <button class="button subtle" data-action="wizard-recommend-stats">Apply Recommended</button>
        </div>
        <div class="wizard-form-grid wizard-form-grid--three">
          <label class="field"><span class="label">Level</span><input class="input" type="number" min="1" max="20" data-wizard-bind="level" value="${escapeHtml(String(wizard.draft.level))}" /></label>
          <label class="field"><span class="label">HP Max</span><input class="input" type="number" min="1" data-wizard-bind="hp.max" value="${escapeHtml(String(wizard.draft.hp.max))}" /></label>
          <label class="field"><span class="label">HP Current</span><input class="input" type="number" min="0" data-wizard-bind="hp.current" value="${escapeHtml(String(wizard.draft.hp.current))}" /></label>
          <label class="field"><span class="label">Temp HP</span><input class="input" type="number" min="0" data-wizard-bind="hp.temp" value="${escapeHtml(String(wizard.draft.hp.temp || 0))}" /></label>
          <label class="field"><span class="label">Armor Class</span><input class="input" type="number" min="0" data-wizard-bind="ac" value="${escapeHtml(String(wizard.draft.ac))}" /></label>
          <label class="field"><span class="label">Speed</span><input class="input" type="number" min="0" data-wizard-bind="speed" value="${escapeHtml(String(wizard.draft.speed))}" /></label>
          <label class="field wizard-form-grid__half"><span class="label">Initiative</span><input class="input" type="number" min="-20" max="20" data-wizard-bind="initiative" value="${escapeHtml(String(wizard.draft.initiative))}" /></label>
        </div>
      </div>
    `;
  } else {
    content = `
      <div class="wizard-step">
        <div class="wizard-review-grid">
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Name</div>
            <div class="wizard-review-card__value">${escapeHtml(wizard.draft.name)}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Lineage</div>
            <div class="wizard-review-card__value">${escapeHtml([ancestryEntry?.name || '', classEntry?.name || '', backgroundEntry?.name || ''].filter(Boolean).join(' / '))}</div>
          </div>
          <div class="wizard-review-card">
            <div class="wizard-review-card__label">Combat</div>
            <div class="wizard-review-card__value">${escapeHtml(`${wizard.draft.hp.current}/${wizard.draft.hp.max} HP / AC ${wizard.draft.ac}`)}</div>
          </div>
        </div>
        <div class="summary-grid">
          ${renderSummaryCards({ data: wizard.draft, ownerDisplayName: '', edition: wizard.draft.edition, name: wizard.draft.name, level: wizard.draft.level, ancestrySlug: wizard.draft.ancestrySlug, classSlug: wizard.draft.classSlug, backgroundSlug: wizard.draft.backgroundSlug })}
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--wizard">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">${wizard.mode === 'levelup' ? 'Level Up Wizard' : 'Character Wizard'}</div>
            <h3 class="modal-title">${wizard.mode === 'levelup' ? escapeHtml(wizard.characterName) : 'Build a character step by step'}</h3>
          </div>
          <button class="modal-close" data-action="close-wizard">&times;</button>
        </div>
        <div class="wizard-progress" style="--wizard-steps:${steps.length}">
          ${steps.map((step, index) => `<div class="wizard-progress__step ${wizard.step === index ? 'active' : wizard.step > index ? 'complete' : ''}">${escapeHtml(`${index + 1}. ${step}`)}</div>`).join('')}
        </div>
        <div class="modal-panel__body">
          ${content}
        </div>
        <div class="modal-panel__footer">
          <button class="button" data-action="close-wizard">Cancel</button>
          ${wizard.step > 0 ? '<button class="button subtle" data-action="wizard-prev">Back</button>' : ''}
          <button class="button primary" data-action="wizard-next" ${canAdvance ? '' : 'disabled'}>${isLastStep ? wizard.mode === 'levelup' ? 'Apply Level' : 'Create Character' : 'Next'}</button>
        </div>
      </section>
    </div>
  `;
}
