/**
 * The completeness report view of the Saga Engine: the seven gates, then one row per dependency by
 * category, with its status, what resolves it, the sagas and worlds that share it, and the editor
 * that owns it. The server builds the report; this view shows it, filters it, and sends the links and
 * exclusions the moderator picks.
 *
 * @module src/client/components/cyberia/SagaReportCyberia.js
 */
import { escapeHtml } from '../core/VanillaJs.js';

/** The categories of a report, in the order a moderator works through them. */
const CATEGORIES = Object.freeze([
  { id: 'semantic', label: 'Package', icon: 'fa-solid fa-file-code' },
  { id: 'maps', label: 'Maps', icon: 'fa-solid fa-map' },
  { id: 'items', label: 'Items', icon: 'fa-solid fa-cube' },
  { id: 'providers', label: 'Characters and providers', icon: 'fa-solid fa-user-tag' },
  { id: 'quests', label: 'Quests', icon: 'fa-solid fa-scroll' },
  { id: 'actions', label: 'Actions', icon: 'fa-solid fa-handshake' },
  { id: 'dialogues', label: 'Dialogues', icon: 'fa-solid fa-comments' },
  { id: 'skills', label: 'Skills', icon: 'fa-solid fa-wand-sparkles' },
  { id: 'release', label: 'Release', icon: 'fa-solid fa-box-archive' },
  { id: 'definitions', label: 'Definitions and sources', icon: 'fa-solid fa-sitemap' },
]);

const LEVELS = Object.freeze({
  error: { label: 'Blocking', icon: 'fa-solid fa-circle-xmark' },
  warning: { label: 'Warning', icon: 'fa-solid fa-triangle-exclamation' },
  excluded: { label: 'Excluded', icon: 'fa-solid fa-ban' },
  ok: { label: 'OK', icon: 'fa-solid fa-circle-check' },
});

const GATE_STATES = Object.freeze({
  pass: { label: 'Passes', icon: 'fa-solid fa-circle-check' },
  warning: { label: 'Warnings', icon: 'fa-solid fa-triangle-exclamation' },
  blocked: { label: 'Blocked', icon: 'fa-solid fa-circle-xmark' },
});

/** What each remedy asks of the moderator. */
const REMEDIES = Object.freeze({
  generate: 'Generate or place it',
  decide: 'Decide',
  broken: 'Broken reference',
  import: 'Build and import',
  apply: 'Apply the candidate',
  sync: 'Synchronize',
  shared: 'Shared',
  excluded: 'Excluded',
  none: '',
});

/** The label of the action a link opens. */
const linkLabel = ({ view, action }) =>
  action === 'generate-item'
    ? 'Generate variants'
    : action === 'start-population'
      ? 'Start a map population'
      : ({
          package: 'Open in the package',
          procedural: 'Open in the Procedural Engine',
          'action-engine': 'Open in the Action Engine',
          'entity-engine': 'Open in the Entity Engine',
          'item-catalog': 'Open the item catalog',
          'economy-engine': 'Open the economy',
          'market-engine': 'Open the market',
          'instance-engine': 'Open the Instance Studio',
          integration: 'Resolve the provider',
          release: 'Release steps',
        }[view] ?? 'Open');

class SagaReport {
  static style = css`
    .saga-report-gates {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 6px;
      margin-bottom: 10px;
    }
    .saga-report-gate {
      padding: 8px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-left-width: 4px;
      border-radius: 6px;
      font-size: 12px;
    }
    .saga-report-gate strong {
      display: block;
      font-size: 13px;
    }
    .saga-report [data-level='error'],
    .saga-report-gate[data-state='blocked'] {
      border-left-color: #e53935;
    }
    .saga-report [data-level='warning'],
    .saga-report-gate[data-state='warning'] {
      border-left-color: #d49a00;
    }
    .saga-report [data-level='ok'],
    .saga-report-gate[data-state='pass'] {
      border-left-color: #2e9d57;
    }
    .saga-report [data-level='excluded'] {
      border-left-color: #888;
    }
    .saga-report [data-level='error'] > .saga-report-row-head i,
    .saga-report-gate[data-state='blocked'] i {
      color: #e53935;
    }
    .saga-report [data-level='warning'] > .saga-report-row-head i,
    .saga-report-gate[data-state='warning'] i {
      color: #d49a00;
    }
    .saga-report [data-level='ok'] > .saga-report-row-head i,
    .saga-report-gate[data-state='pass'] i {
      color: #2e9d57;
    }
    .saga-report-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0 10px;
    }
    .saga-report-group {
      margin-bottom: 8px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 6px;
    }
    .saga-report-group > summary {
      padding: 6px 8px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
    }
    .saga-report-row {
      display: grid;
      gap: 2px;
      padding: 6px 8px;
      border-top: 1px solid var(--studio-subtle-border, #8884);
      border-left: 4px solid transparent;
      font-size: 12px;
    }
    .saga-report-row-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .saga-report-row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }
  `;

  /**
   * The report markup. Call {@link SagaReport.bind} once it is in the page.
   * @param {Object} params
   * @param {string} params.id - The class of the view.
   * @param {Object|null} params.report - The report the server answered.
   * @param {Object} [params.filter] - `{ level, categories }`: the levels and categories it shows.
   * @param {boolean} [params.canExclude] - Whether rows offer an exclusion.
   * @returns {string}
   */
  static render({ id, report, filter = {}, canExclude = false }) {
    if (!report) return html`<div class="studio-form-hint">No report yet.</div>`;
    const { level = 'open', categories = CATEGORIES.map((category) => category.id) } = filter;
    const shown = (row) =>
      level === 'all' || (level === 'open' ? row.level === 'error' || row.level === 'warning' : row.level === level);
    const order = ['error', 'warning', 'excluded', 'ok'];
    const rowHtml = (row) =>
      html`<div class="saga-report-row" data-level="${row.level}">
        <div class="saga-report-row-head">
          <i class="${LEVELS[row.level].icon}" aria-hidden="true"></i>
          <span class="studio-form-chip" title="${escapeHtml(LEVELS[row.level].label)}"
            >${escapeHtml(report.statuses?.[row.status] ?? row.status)}</span
          >
          <span class="studio-form-mono">${escapeHtml(row.subject)}</span>
          ${row.field ? html`<span class="studio-form-hint">${escapeHtml(row.field)}</span>` : ''}
          ${REMEDIES[row.remedy] ? html`<span class="studio-form-chip">${escapeHtml(REMEDIES[row.remedy])}</span>` : ''}
        </div>
        <div>${escapeHtml(row.message ?? '')}</div>
        ${
          row.sagas?.length || row.instances?.length
            ? html`<div class="studio-form-hint">
                ${row.sagas?.length ? `Sagas: ${escapeHtml(row.sagas.join(', '))}` : ''}
                ${row.instances?.length ? ` · Worlds: ${escapeHtml(row.instances.join(', '))}` : ''}
              </div>`
            : ''
        }
        ${row.exclusion ? html`<div class="studio-form-hint">Excluded: ${escapeHtml(row.exclusion.reason)}</div>` : ''}
        ${row.link?.command ? html`<div class="studio-form-hint">Run <code>${escapeHtml(row.link.command)}</code></div>` : ''}
        <div class="saga-report-row-actions">
          ${
            row.link && !row.link.command
              ? html`<button
                  type="button"
                  class="studio-form-button saga-report-link"
                  data-key="${escapeHtml(row.key)}"
                >
                  ${escapeHtml(linkLabel(row.link))}
                </button>`
              : ''
          }
          ${
            canExclude && (row.level === 'error' || row.level === 'warning')
              ? html`<button
                  type="button"
                  class="studio-form-button saga-report-exclude"
                  data-key="${escapeHtml(row.key)}"
                >
                  <i class="fa-solid fa-ban" aria-hidden="true"></i> Exclude…
                </button>`
              : ''
          }
          ${
            canExclude && row.level === 'excluded'
              ? html`<button
                  type="button"
                  class="studio-form-button saga-report-include"
                  data-key="${escapeHtml(row.key)}"
                >
                  <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Include again
                </button>`
              : ''
          }
        </div>
      </div>`;
    const groups = CATEGORIES.filter((category) => categories.includes(category.id))
      .map((category) => {
        const rows = report.rows.filter((row) => row.category === category.id);
        const visible = rows.filter(shown).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
        if (rows.length === 0) return '';
        const errors = rows.filter((row) => row.level === 'error').length;
        const warnings = rows.filter((row) => row.level === 'warning').length;
        return html`<details class="saga-report-group" ${errors + warnings > 0 ? 'open' : ''}>
          <summary>
            <i class="${category.icon}" aria-hidden="true"></i> ${escapeHtml(category.label)} · ${rows.length}
            ${errors ? html`<span class="studio-form-chip studio-form-bad">${errors} blocking</span>` : ''}
            ${warnings ? html`<span class="studio-form-chip">${warnings} warnings</span>` : ''}
          </summary>
          ${visible.length > 0 ? visible.map(rowHtml).join('') : html`<div class="saga-report-row">Nothing to show here with this filter.</div>`}
        </details>`;
      })
      .join('');
    const levelButton = (value, label) =>
      html`<button
        type="button"
        class="studio-form-toggle saga-report-level"
        data-level-filter="${value}"
        aria-pressed="${level === value}"
        style="${level === value ? 'background: var(--studio-tag, #8883);' : ''}"
      >
        ${escapeHtml(label)}
      </button>`;
    return html`<style>
        ${SagaReport.style}
      </style>
      <div class="saga-report saga-report-${escapeHtml(id)}">
        <div class="saga-report-gates" role="list" aria-label="Gates">
          ${report.gates
            .map(
              (gate) =>
                html`<div class="saga-report-gate" role="listitem" data-state="${gate.status}">
                  <strong
                    ><i class="${GATE_STATES[gate.status].icon}" aria-hidden="true"></i>
                    ${escapeHtml(gate.label)}</strong
                  >
                  ${escapeHtml(GATE_STATES[gate.status].label)} · ${gate.errors} blocking · ${gate.warnings}
                  warnings${gate.excluded ? ` · ${gate.excluded} excluded` : ''}
                </div>`,
            )
            .join('')}
        </div>
        <div class="studio-form-hint" role="status">
          ${report.counts.error ?? 0} blocking · ${report.counts.warning ?? 0} warnings · ${report.counts.excluded ?? 0}
          excluded · ${report.counts.ok ?? 0} ready · read ${escapeHtml(new Date(report.generatedAt).toLocaleString())}
        </div>
        <div class="saga-report-filters" role="group" aria-label="Show rows">
          ${levelButton('open', 'Open work')} ${levelButton('error', 'Blocking')} ${levelButton('warning', 'Warnings')}
          ${levelButton('excluded', 'Excluded')} ${levelButton('all', 'All')}
        </div>
        ${groups}
      </div>`;
  }

  /**
   * Connects the buttons of a rendered report.
   * @param {HTMLElement} root - The element that holds the report.
   * @param {Object} params
   * @param {Object} params.report
   * @param {(link:Object, row:Object)=>void} params.onLink
   * @param {(row:Object)=>void} [params.onExclude]
   * @param {(row:Object)=>void} [params.onInclude]
   * @param {(level:string)=>void} [params.onFilter]
   */
  static bind(root, { report, onLink, onExclude = () => {}, onInclude = () => {}, onFilter = () => {} }) {
    if (!root || !report) return;
    const rowOf = (button) => report.rows.find((row) => row.key === button.dataset.key);
    for (const button of root.querySelectorAll('.saga-report-link'))
      button.onclick = () => onLink(rowOf(button).link, rowOf(button));
    for (const button of root.querySelectorAll('.saga-report-exclude')) button.onclick = () => onExclude(rowOf(button));
    for (const button of root.querySelectorAll('.saga-report-include')) button.onclick = () => onInclude(rowOf(button));
    for (const button of root.querySelectorAll('.saga-report-level'))
      button.onclick = () => onFilter(button.dataset.levelFilter);
  }

  /**
   * Renders a report into an element and connects it.
   * @param {HTMLElement} root
   * @param {Object} params - {@link SagaReport.render} and {@link SagaReport.bind} parameters.
   */
  static paint(root, params) {
    if (!root) return;
    root.innerHTML = SagaReport.render(params);
    SagaReport.bind(root, params);
  }
}

export { SagaReport };
