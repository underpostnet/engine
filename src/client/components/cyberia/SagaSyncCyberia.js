/**
 * The saga synchronization panel: check what the synchronization of a stored saga assigns, choose
 * the provider of each quest and action that several entities could provide, synchronize, and read
 * the report of each link by outcome (see `src/projects/cyberia/saga/saga-sync.js`). The Action
 * Engine shows it with a saga picker; the Saga Engine shows it on the saga it authors. Each panel
 * keeps its own state under its id.
 *
 * @module src/client/components/cyberia/SagaSyncCyberia.js
 */
import { BtnIcon } from '../core/BtnIcon.js';
import { DropDown } from '../core/DropDown.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { escapeHtml, s } from '../core/VanillaJs.js';
import { CyberiaSagaService } from '../../services/cyberia-saga/CyberiaSagaService.js';
import { sagaBadge } from './SagaCyberia.js';

/** The report groups, in the order they show; `open` groups start expanded. */
const OUTCOMES = [
  { id: 'choose', label: 'Choose a provider', icon: 'fa-solid fa-hand-pointer', open: true },
  { id: 'conflict', label: 'Conflicts', icon: 'fa-solid fa-code-fork', open: true },
  { id: 'assigned', label: 'Assigned', preview: 'To assign', icon: 'fa-solid fa-circle-check', open: true },
  { id: 'failed', label: 'Failed', icon: 'fa-solid fa-circle-xmark', open: true },
  { id: 'omitted', label: 'Omitted', icon: 'fa-solid fa-circle-minus', open: true },
  { id: 'kept', label: 'Already set', icon: 'fa-solid fa-circle-dot', open: false },
];

const KIND_ICONS = {
  quest: 'fa-solid fa-scroll',
  action: 'fa-solid fa-handshake',
  dialogue: 'fa-solid fa-comments',
  skill: 'fa-solid fa-wand-sparkles',
};

const keyOf = ({ kind, code }) => `${kind}:${code}`;
const cellText = ({ mapCode, cellX, cellY }) => `${mapCode} (${cellX}, ${cellY})`;
const sameCell = (a, b) => a?.mapCode === b?.mapCode && a?.cellX === b?.cellX && a?.cellY === b?.cellY;

class SagaSync {
  /** The state of each panel by id. */
  static panels = new Map();

  static style = css`
    .saga-sync-summary {
      margin: 8px 0;
      font-size: 13px;
    }
    .saga-sync-muted {
      opacity: 0.7;
      font-size: 12px;
    }
    .saga-sync-tools,
    .saga-sync-counts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .saga-sync-counts {
      margin: 6px 0 10px;
    }
    .saga-sync-count {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 999px;
      font-size: 12px;
    }
    .saga-sync [data-outcome='assigned'] i {
      color: #2e9d57;
    }
    .saga-sync [data-outcome='failed'] i,
    .saga-sync [data-outcome='conflict'] i {
      color: #e53935;
    }
    .saga-sync [data-outcome='omitted'] i,
    .saga-sync [data-outcome='choose'] i {
      color: #d49a00;
    }
    .saga-sync-group {
      margin-bottom: 8px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
    }
    .saga-sync-group > summary {
      padding: 6px 8px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
    }
    .saga-sync-entry {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 0 8px;
      padding: 6px 8px;
      border-top: 1px solid var(--studio-subtle-border);
    }
    .saga-sync-entry > i {
      grid-row: span 3;
      padding-top: 2px;
      opacity: 0.8;
    }
    .saga-sync .saga-sync-entry-code {
      appearance: none;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font-family: monospace;
      font-size: 12px;
      text-align: left;
      text-decoration: underline dotted;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .saga-sync-choices {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 4px;
      font-size: 12px;
    }
    .saga-sync-choices label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 28px;
      cursor: pointer;
    }
  `;

  /**
   * The panel markup. Call {@link SagaSync.mount} once it is in the page.
   * @param {Object} params
   * @param {string} params.id - The panel id: its class names and its state.
   * @param {boolean} params.canMutate - Whether the session may synchronize.
   * @param {{code:string,name:string}|null} [params.saga] - A fixed saga; without one the panel shows a picker.
   * @param {(kind:string, code:string)=>void} [params.onOpen] - Opens a reported document.
   * @param {(report:Object)=>Promise<void>} [params.onSynced] - Runs after a synchronization wrote.
   * @returns {Promise<string>}
   */
  static async render({ id, canMutate, saga = null, onOpen = () => {}, onSynced = async () => {} }) {
    SagaSync.panels.set(id, {
      canMutate,
      fixed: Boolean(saga),
      saga,
      onOpen,
      onSynced,
      report: null,
      busy: false,
      selections: new Map(),
    });
    const group = (title, icon, inner) =>
      html`<div class="in studio-group">
        <div class="in studio-group-title"><i class="${icon}" aria-hidden="true"></i> ${title}</div>
        ${inner}
      </div>`;
    return html`<style>
        ${SagaSync.style}
      </style>
      <div class="saga-sync saga-sync-${id}">
        ${group(
          'Saga',
          'fa-solid fa-book-open',
          html`<div class="in saga-sync-muted">
              Synchronize places each quest and action of the saga at the cell of its provider entity, and links the
              stored dialogues to each action. Choose the provider where several entities carry its skin. A link with no
              map, entity or dialogue yet is omitted.
            </div>
            ${saga ? '' : html`<div class="in saga-sync-picker-slot"></div>`}
            <div class="in saga-sync-summary" aria-live="polite"></div>
            <div class="saga-sync-tools">
              ${await BtnIcon.instance({
                class: `btn-saga-sync-check-${id}`,
                label: html`<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Check`,
              })}
              ${
                canMutate
                  ? await BtnIcon.instance({
                      class: `btn-saga-sync-apply-${id}`,
                      label: html`<i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Synchronize`,
                    })
                  : ''
              }
            </div>`,
        )}
        ${group('Report', 'fa-solid fa-clipboard-list', html`<div class="in saga-sync-report"></div>`)}
      </div>`;
  }

  /** The panel root of an id. */
  static root(id) {
    return s(`.saga-sync-${id}`);
  }

  static async mount(id) {
    const panel = SagaSync.panels.get(id);
    const root = SagaSync.root(id);
    if (!panel || !root) return;
    s(`.btn-saga-sync-check-${id}`).onclick = () => SagaSync.run(id, false);
    if (s(`.btn-saga-sync-apply-${id}`)) s(`.btn-saga-sync-apply-${id}`).onclick = () => SagaSync.confirmApply(id);
    if (!panel.fixed)
      root.querySelector('.saga-sync-picker-slot').innerHTML = await DropDown.instance({
        id: `saga-sync-picker-${id}`,
        label: html`Saga`,
        data: [],
        containerClass: 'inl',
        serviceProvider: async (q) => {
          const { status, data } = await CyberiaSagaService.get({
            filterModel: { name: { filterType: 'text', type: 'contains', filter: q } },
          });
          if (status !== 'success') return [];
          return data.data.map((saga) => ({
            value: saga.code,
            display: `${sagaBadge(saga.code).outerHTML} ${escapeHtml(saga.name)}`,
            data: saga.code,
            onClick: () => SagaSync.select(id, saga),
          }));
        },
      });
    SagaSync.renderSummary(id);
    SagaSync.renderReport(id);
    if (panel.fixed) await SagaSync.run(id, false);
  }

  /** Selects a saga and checks it. */
  static select(id, saga) {
    const panel = SagaSync.panels.get(id);
    Object.assign(panel, { saga, report: null, selections: new Map() });
    SagaSync.renderSummary(id);
    SagaSync.renderReport(id);
    return SagaSync.run(id, false);
  }

  static renderSummary(id) {
    const panel = SagaSync.panels.get(id);
    const root = SagaSync.root(id);
    if (!panel || !root) return;
    const { saga } = panel;
    const count = (list = [], noun) => `${list.length} ${noun}${list.length === 1 ? '' : 's'}`;
    root.querySelector('.saga-sync-summary').innerHTML = saga
      ? html`<div>${escapeHtml(saga.description || saga.name || saga.code)}</div>
          ${
            saga.mapCodes
              ? html`<div class="saga-sync-muted">
                  ${count(saga.mapCodes, 'map')} · ${count(saga.itemIds, 'item')} · ${count(saga.questCodes, 'quest')} ·
                  ${count(saga.actionCodes, 'action')}
                </div>`
              : ''
          }`
      : html`<div class="saga-sync-muted">Select a saga.</div>`;
    SagaSync.renderTools(id);
  }

  static renderTools(id) {
    const panel = SagaSync.panels.get(id);
    for (const selector of [`.btn-saga-sync-check-${id}`, `.btn-saga-sync-apply-${id}`])
      if (s(selector)) s(selector).disabled = panel.busy || !panel.saga;
  }

  static async confirmApply(id) {
    const panel = SagaSync.panels.get(id);
    if (!panel?.saga) return;
    const chosen = panel.selections.size;
    const answer = await Modal.RenderConfirm({
      id: `saga-sync-confirm-${id}`,
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Synchronize the saga ${escapeHtml(panel.saga.name || panel.saga.code)}? Its quests and actions move to the
          cells of their providers${chosen > 0 ? `, ${chosen} of them by your choice` : ''}, and its actions take the
          stored dialogues. A document that changed since the check refuses the synchronization.
        </div>`,
    });
    if (answer.status === 'confirm') await SagaSync.run(id, true);
  }

  /** Checks the saga of a panel, or synchronizes it with `apply`. */
  static async run(id, apply) {
    const panel = SagaSync.panels.get(id);
    const code = panel?.saga?.code;
    if (!code || panel.busy) return;
    panel.busy = true;
    SagaSync.renderTools(id);
    const result = await CyberiaSagaService.sync({
      code,
      apply,
      selections: [...panel.selections.values()],
      reviewed: panel.report?.reviewed ?? null,
    }).catch((error) => ({ status: 'error', message: error.message }));
    panel.busy = false;
    SagaSync.renderTools(id);
    if (code !== panel.saga?.code) return;
    if (result.status !== 'success') {
      NotificationManager.Push({ html: escapeHtml(result.message), status: 'error' });
      if (apply) return await SagaSync.run(id, false);
      return;
    }
    panel.report = result.data;
    if (apply) panel.selections.clear();
    SagaSync.renderReport(id);
    if (!apply) return;
    const { assigned, failed, omitted, choose } = result.data.counts;
    NotificationManager.Push({
      html: `${assigned} assigned · ${choose} to choose · ${failed} failed · ${omitted} omitted`,
      status: failed + choose > 0 ? 'warning' : 'success',
    });
    await panel.onSynced(result.data);
  }

  /** The provider choices of an entry: one radio per candidate cell, the chosen or the current one checked. */
  static choices(id, entry) {
    const panel = SagaSync.panels.get(id);
    if ((entry.candidates?.length ?? 0) < 2 || !panel.canMutate) return '';
    const picked = panel.selections.get(keyOf(entry)) ?? entry.chosen;
    const name = `saga-sync-choice-${id}-${keyOf(entry)}`;
    return html`<div
      class="saga-sync-choices"
      role="radiogroup"
      aria-label="Provider of ${escapeHtml(entry.kind)} ${escapeHtml(entry.code)}"
    >
      ${entry.candidates
        .map(
          (cell, index) =>
            html`<label
              ><input
                type="radio"
                name="${escapeHtml(name)}"
                data-entry="${escapeHtml(keyOf(entry))}"
                data-index="${index}"
                ${sameCell(cell, picked) ? 'checked' : ''}
              />${escapeHtml(cellText(cell))} <span class="saga-sync-muted">rev ${cell.mapRevision}</span></label
            >`,
        )
        .join('')}
    </div>`;
  }

  static renderReport(id) {
    const panel = SagaSync.panels.get(id);
    const root = SagaSync.root(id);
    if (!panel || !root) return;
    const { report } = panel;
    const slot = root.querySelector('.saga-sync-report');
    if (!report) {
      slot.innerHTML = html`<div class="saga-sync-muted">
        ${panel.saga ? 'Checking…' : 'Select a saga to see what a synchronization does.'}
      </div>`;
      return;
    }
    const label = (outcome) => (report.applied ? outcome.label : (outcome.preview ?? outcome.label));
    const groups = OUTCOMES.map((outcome) => ({
      ...outcome,
      entries: report.entries.filter((entry) => entry.outcome === outcome.id),
    })).filter(({ entries }) => entries.length > 0);
    const entryHtml = (entry) => {
      const chosen = panel.selections.get(keyOf(entry));
      return html`<div class="saga-sync-entry" data-kind="${entry.kind}">
        <i class="${KIND_ICONS[entry.kind]}" aria-hidden="true"></i>
        <button
          type="button"
          class="saga-sync-entry-code"
          data-kind="${entry.kind}"
          data-code="${escapeHtml(entry.code)}"
          title="Open the ${entry.kind}"
        >
          ${escapeHtml(entry.code)}
        </button>
        <span class="saga-sync-muted"
          >${escapeHtml(entry.detail)}${chosen ? ` · chosen: ${escapeHtml(cellText(chosen))}` : ''}</span
        >
        ${
          entry.conflicts?.length
            ? html`<span class="saga-sync-muted"
                >Each saga that links it must name the same provider skin and map. Edit the saga package that
                disagrees.</span
              >`
            : SagaSync.choices(id, entry)
        }
      </div>`;
    };
    slot.innerHTML = html`<div class="saga-sync-muted">
        ${report.applied ? 'Synchronized. The assignments are stored.' : 'Check only. Nothing is stored yet.'}
      </div>
      <div class="saga-sync-counts">
        ${OUTCOMES.map(
          (outcome) =>
            html`<span class="saga-sync-count" data-outcome="${outcome.id}">
              <i class="${outcome.icon}" aria-hidden="true"></i>${label(outcome)} · ${report.counts[outcome.id] ?? 0}
            </span>`,
        ).join('')}
      </div>
      ${
        groups.length === 0
          ? html`<div class="saga-sync-muted">The saga links no quest, action or skill.</div>`
          : groups
              .map(
                (outcome) =>
                  html`<details class="saga-sync-group" data-outcome="${outcome.id}" ${outcome.open ? 'open' : ''}>
                    <summary>
                      <i class="${outcome.icon}" aria-hidden="true"></i> ${label(outcome)} · ${outcome.entries.length}
                    </summary>
                    ${outcome.entries.map(entryHtml).join('')}
                  </details>`,
              )
              .join('')
      }`;
    for (const button of slot.querySelectorAll('.saga-sync-entry-code'))
      button.onclick = () => panel.onOpen(button.dataset.kind, button.dataset.code);
    for (const radio of slot.querySelectorAll('.saga-sync-choices input[type="radio"]'))
      radio.onchange = () => {
        const entry = report.entries.find((candidate) => keyOf(candidate) === radio.dataset.entry);
        const cell = entry.candidates[Number(radio.dataset.index)];
        panel.selections.set(keyOf(entry), { kind: entry.kind, code: entry.code, ...cell });
        SagaSync.renderReport(id);
      };
  }

  /** Drops the state of a panel that left the page. */
  static unmount(id) {
    SagaSync.panels.delete(id);
  }
}

export { SagaSync };
