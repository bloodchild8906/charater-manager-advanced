export function renderCreateFlowModal({ open }) {
  if (!open) {
    return '';
  }

  return `
    <div class="modal-overlay">
      <section class="modal-panel modal-panel--choice">
        <div class="modal-panel__header">
          <div>
            <div class="section-title">Create Character</div>
            <h3 class="modal-title">Choose your starting flow.</h3>
          </div>
          <button class="modal-close" data-action="close-create-flow">&times;</button>
        </div>
        <div class="create-flow-grid">
          <article class="create-flow-card">
            <div class="eyebrow">Wizard</div>
            <h3>Step-by-step creation</h3>
            <p class="muted">Walk through identity, lineage, ability scores, and starting combat values before the sheet is saved.</p>
            <button class="button primary" data-action="create-with-wizard">Launch Wizard</button>
          </article>
          <article class="create-flow-card">
            <div class="eyebrow">Direct Edit</div>
            <h3>Blank live sheet</h3>
            <p class="muted">Create a default sheet immediately and tune every field directly from the main editor.</p>
            <button class="button subtle" data-action="create-direct">Create Blank Sheet</button>
          </article>
        </div>
      </section>
    </div>
  `;
}
