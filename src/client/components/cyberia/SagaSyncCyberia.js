/**
 * The saga integration tab of the Action engine: pick a stored saga, check what its
 * synchronization assigns, synchronize it, and read the report of each link by outcome (see
 * `src/projects/cyberia/saga/saga-sync.js`).
 *
 * @module src/client/components/cyberia/SagaSyncCyberia.js
 */
import { BtnIcon } from '../core/BtnIcon.js';
import { DropDown } from '../core/DropDown.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaSagaService } from '../../services/cyberia-saga/cyberia-saga.service.js';
import { sagaBadge } from './SagaCyberia.js';

const PICKER = 'saga-sync-picker';

/** The report groups, in the order they show; `open` groups start expanded. */
const OUTCOMES = [
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

class SagaSync {
  /** The stored sagas, by name. */
  static sagas = [];
  static code = '';
  /** The last report of the selected saga, or null. */
  static report = null;
  static busy = false;
  static canMutate = false;
  /** Opens a reported document: `(kind, code) => void`. */
  static onOpen = () => {};
  /** Runs after a synchronization wrote. */
  static onSynced = async () => {};

  static style = css`
    .saga-sync-summary {
      margin: 8px 0;
      font-size: 13px;
    }
    .saga-sync-muted {
      opacity: 0.7;
      font-size: 12px;
    }
    .saga-sync-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .saga-sync-counts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
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
    .saga-sync-count[data-outcome='assigned'] i {
      color: #2e9d57;
    }
    .saga-sync-count[data-outcome='failed'] i,
    .saga-sync-group[data-outcome='failed'] > summary i {
      color: #e53935;
    }
    .saga-sync-count[data-outcome='omitted'] i,
    .saga-sync-group[data-outcome='omitted'] > summary i {
      color: #d49a00;
    }
    .saga-sync-group[data-outcome='assigned'] > summary i {
      color: #2e9d57;
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
      width: 100%;
      padding: 6px 8px;
      border: 0;
      border-top: 1px solid var(--studio-subtle-border);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .saga-sync-entry:hover {
      background: #8882;
    }
    .saga-sync-entry > i {
      grid-row: span 2;
      padding-top: 2px;
      opacity: 0.8;
    }
    .saga-sync-entry-code {
      font-family: monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
  `;

  /** The tab content. Call {@link SagaSync.mount} once it is in the page. */
  static async render({ canMutate, onOpen, onSynced }) {
    Object.assign(SagaSync, { canMutate, onOpen, onSynced, code: '', report: null, busy: false });
    const group = (title, icon, inner) =>
      html`<div class="in studio-group">
        <div class="in studio-group-title"><i class="${icon}"></i> ${title}</div>
        ${inner}
      </div>`;
    return html`<style>
        ${SagaSync.style}
      </style>
      ${group(
        'Saga',
        'fa-solid fa-book-open',
        html`<div class="in saga-sync-muted">
            Synchronize places each quest and action of the saga at the cell of its provider entity. It links the stored
            dialogues to each action. It omits the links that have no map, entity or dialogue yet.
          </div>
          <div class="in saga-sync-picker-slot"></div>
          <div class="in saga-sync-summary"></div>
          <div class="saga-sync-tools">
            ${await BtnIcon.instance({
              class: 'btn-saga-sync-check',
              label: html`<i class="fa-solid fa-magnifying-glass"></i> Check`,
            })}
            ${
              canMutate
                ? await BtnIcon.instance({
                    class: 'btn-saga-sync-apply',
                    label: html`<i class="fa-solid fa-arrows-rotate"></i> Synchronize`,
                  })
                : ''
            }
          </div>`,
      )}
      ${group('Report', 'fa-solid fa-clipboard-list', html`<div class="in saga-sync-report"></div>`)}`;
  }

  static async mount() {
    s('.btn-saga-sync-check').onclick = () => SagaSync.run(false);
    if (s('.btn-saga-sync-apply')) s('.btn-saga-sync-apply').onclick = () => SagaSync.confirmApply();
    const { status, data } = await CyberiaSagaService.get({ limit: 500 }).catch(() => ({}));
    SagaSync.sagas = status === 'success' ? [...data.data].sort((a, b) => a.name.localeCompare(b.name)) : [];
    htmls(
      '.saga-sync-picker-slot',
      await DropDown.instance({
        id: PICKER,
        label: html`Saga`,
        data: SagaSync.sagas.map((saga) => ({
          value: saga.code,
          display: `${sagaBadge(saga.code).outerHTML} ${escapeHtml(saga.name)}`,
          data: saga.code,
          onClick: () => SagaSync.select(saga.code),
        })),
        containerClass: 'inl',
      }),
    );
    SagaSync.renderSummary();
    SagaSync.renderReport();
  }

  /** Selects a saga and checks it. */
  static select(code) {
    Object.assign(SagaSync, { code, report: null });
    SagaSync.renderSummary();
    SagaSync.renderReport();
    return SagaSync.run(false);
  }

  static saga() {
    return SagaSync.sagas.find(({ code }) => code === SagaSync.code);
  }

  static renderSummary() {
    const saga = SagaSync.saga();
    const count = (list, noun) => `${list.length} ${noun}${list.length === 1 ? '' : 's'}`;
    htmls(
      '.saga-sync-summary',
      saga
        ? html`<div>${escapeHtml(saga.description || saga.name)}</div>
            <div class="saga-sync-muted">
              ${count(saga.mapCodes, 'map')} · ${count(saga.itemIds, 'item')} · ${count(saga.questCodes, 'quest')} ·
              ${count(saga.actionCodes, 'action')}
            </div>`
        : html`<div class="saga-sync-muted">
            ${SagaSync.sagas.length > 0 ? 'Select a saga.' : 'No saga is stored.'}
          </div>`,
    );
    SagaSync.renderTools();
  }

  static renderTools() {
    for (const selector of ['.btn-saga-sync-check', '.btn-saga-sync-apply'])
      if (s(selector)) s(selector).disabled = SagaSync.busy || !SagaSync.code;
  }

  static async confirmApply() {
    const saga = SagaSync.saga();
    if (!saga) return;
    const answer = await Modal.RenderConfirm({
      id: 'saga-sync-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Synchronize the saga ${escapeHtml(saga.name)}? Its quests and actions move to the cells of their provider
          entities, and its actions take the stored dialogues.
        </div>`,
    });
    if (answer.status === 'confirm') await SagaSync.run(true);
  }

  /** Checks the selected saga, or synchronizes it with `apply`. */
  static async run(apply) {
    const code = SagaSync.code;
    if (!code || SagaSync.busy) return;
    SagaSync.busy = true;
    SagaSync.renderTools();
    const result = await CyberiaSagaService.sync({ code, apply }).catch((error) => ({
      status: 'error',
      message: error.message,
    }));
    SagaSync.busy = false;
    SagaSync.renderTools();
    if (code !== SagaSync.code) return;
    if (result.status !== 'success') return NotificationManager.Push({ html: result.message, status: 'error' });
    SagaSync.report = result.data;
    SagaSync.renderReport();
    if (!apply) return;
    const { assigned, failed, omitted } = result.data.counts;
    NotificationManager.Push({
      html: `${assigned} assigned · ${failed} failed · ${omitted} omitted`,
      status: failed > 0 ? 'warning' : 'success',
    });
    await SagaSync.onSynced();
  }

  static renderReport() {
    const report = SagaSync.report;
    if (!report) {
      htmls(
        '.saga-sync-report',
        html`<div class="saga-sync-muted">
          ${SagaSync.code ? 'Checking…' : 'Select a saga to see what a synchronization does.'}
        </div>`,
      );
      return;
    }
    const label = (outcome) => (report.applied ? outcome.label : (outcome.preview ?? outcome.label));
    const groups = OUTCOMES.map((outcome) => ({
      ...outcome,
      entries: report.entries.filter((entry) => entry.outcome === outcome.id),
    })).filter(({ entries }) => entries.length > 0);
    htmls(
      '.saga-sync-report',
      html`<div class="saga-sync-muted">
          ${report.applied ? 'Synchronized. The assignments are stored.' : 'Check only. Nothing is stored yet.'}
        </div>
        <div class="saga-sync-counts">
          ${OUTCOMES.map(
            (outcome) =>
              html`<span class="saga-sync-count" data-outcome="${outcome.id}">
                <i class="${outcome.icon}"></i>${label(outcome)} · ${report.counts[outcome.id]}
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
                      <summary><i class="${outcome.icon}"></i> ${label(outcome)} · ${outcome.entries.length}</summary>
                      ${outcome.entries
                      .map(
                        ({ kind, code, detail }) =>
                          html`<button
                            type="button"
                            class="saga-sync-entry"
                            data-kind="${kind}"
                            data-code="${escapeHtml(code)}"
                            title="Open the ${kind}"
                          >
                            <i class="${KIND_ICONS[kind]}" aria-hidden="true"></i>
                            <span class="saga-sync-entry-code">${escapeHtml(code)}</span>
                            <span class="saga-sync-muted">${escapeHtml(detail)}</span>
                          </button>`,
                      )
                      .join('')}
                    </details>`,
                )
                .join('')
        }`,
    );
    for (const entry of document.querySelectorAll('.saga-sync-report .saga-sync-entry'))
      entry.onclick = () => SagaSync.onOpen(entry.dataset.kind, entry.dataset.code);
  }
}

export { SagaSync };
