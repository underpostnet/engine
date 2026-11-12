/**
 * The Content Lifecycle Monitor of the Cyberia Studio. It reads the source the engine names and
 * decides nothing: hosts record every stage with the CLI.
 *
 * The engine names one of three sources: the central cycles of the deployment, the one cycle a
 * control node shares with this workstation, or the rehearsal cycles of a local development database.
 * A workstation engine also reports its Development Sandbox, apart from the cycle. A stage shows its
 * state for the target this engine observes, and every other target keeps its own state.
 *
 * The developer view leads with the next step, its commands and the editors of the cycle scope. The
 * operator view adds the node, the evidence, the shares and the journal detail.
 *
 * @module src/client/components/cyberia/ContentLifecycleCyberia.js
 */
import { commonModeratorGuard } from '../core/CommonJs.js';
import { ListPager } from '../core/ListPager.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from '../core/Router.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaContentLifecycleService } from '../../services/cyberia-content-lifecycle/CyberiaContentLifecycleService.js';
import { CyberiaContentLifecycleEventService } from '../../services/cyberia-content-lifecycle-event/CyberiaContentLifecycleEventService.js';
import { SagaEngineCyberia } from './SagaEngineCyberia.js';
import { STUDIO_FORM_STYLE } from './StudioFormCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';

const ROUTE = 'cyberia-content-lifecycle';
const CYCLES = 'content-lifecycle-cycles';
const EVENTS = 'content-lifecycle-events';

/** What each stage state means, with an icon that does not rely on color. */
const STATES = Object.freeze({
  completed: ['Completed', 'fa-solid fa-circle-check'],
  stale: ['Stale: run it again', 'fa-solid fa-rotate'],
  failed: ['Failed', 'fa-solid fa-circle-xmark'],
  blocked: ['Blocked', 'fa-solid fa-ban'],
  pending: ['Pending', 'fa-regular fa-circle'],
});

const STATUSES = Object.freeze({
  'in-progress': ['In progress', 'fa-solid fa-spinner'],
  blocked: ['Blocked', 'fa-solid fa-ban'],
  failed: ['Failed', 'fa-solid fa-circle-xmark'],
  completed: ['Completed', 'fa-solid fa-flag-checkered'],
  cancelled: ['Cancelled', 'fa-solid fa-xmark'],
  superseded: ['Superseded: cancel it and start a new cycle', 'fa-solid fa-clock-rotate-left'],
});

/** What a cycle that takes no next stage says, by status. */
const CLOSED = Object.freeze({
  cancelled: 'This cycle is cancelled.',
  superseded: 'This cycle started under an earlier stage order: cancel it and start a new cycle.',
});

/** The sources of the cycles, as the engine names them. */
const SOURCES = Object.freeze({
  central: ['Central lifecycle', 'fa-solid fa-building-columns'],
  share: ['Shared cycle from the control node', 'fa-solid fa-link'],
  local: ['Local development database', 'fa-solid fa-laptop-code'],
});

/** What a share state tells the operator; `connected` shows no warning. */
const SHARE_STATES = Object.freeze({
  connected: ['Connected', 'fa-solid fa-link'],
  invalid: ['Share not configured correctly', 'fa-solid fa-triangle-exclamation'],
  expired: ['Share expired', 'fa-solid fa-hourglass-end'],
  revoked: ['Share revoked', 'fa-solid fa-ban'],
  closed: ['Share closed', 'fa-solid fa-link-slash'],
  refused: ['Authorization refused', 'fa-solid fa-lock'],
  unreachable: ['Control node unreachable', 'fa-solid fa-plug-circle-xmark'],
  'tunnel-down': ['WireGuard tunnel down', 'fa-solid fa-network-wired'],
});

/** The kinds of execution target. */
const TARGETS = Object.freeze({
  deployment: 'Production deployment',
  sandbox: 'Development Sandbox',
  source: 'Source checkout',
});

/** The records of a cycle, in the order the stages set them. */
const PROVENANCE = Object.freeze([
  ['backupId', 'Infrastructure backup'],
  ['baselineId', 'Production baseline'],
  ['baselineReleaseId', 'Baseline release'],
  ['contentRevision', 'Reviewed source revision'],
  ['lockDigest', 'Source lock'],
  ['contentDigest', 'Content artifact'],
  ['releaseId', 'Production content release'],
]);

const notify = (text, status = 'success') => NotificationManager.Push({ html: escapeHtml(text), status });
const when = (date) => (date ? new Date(date).toLocaleString() : '—');
const short = (value, length = 19) =>
  typeof value === 'string' && value.length > length ? `${value.slice(0, length)}…` : value || '—';
const chip = ([label, icon], state = '') =>
  html`<span class="studio-form-chip" data-state="${escapeHtml(state)}"
    ><i class="${icon}" aria-hidden="true"></i> ${escapeHtml(label)}</span
  >`;
const table = (rows) =>
  html`<div class="content-lifecycle-table">
    <table>
      <tbody>
        ${rows
          .map(
            ([label, value]) =>
              html`<tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td class="studio-form-mono">${value}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;

class ContentLifecycleCyberia {
  static canRead = false;
  /** The plan of the cycle the view shows, or null. */
  static plan = null;
  /** The monitor context the engine reports, or null before it answers. */
  static runtime = null;
  /** `developer` or `operator`. */
  static mode = 'developer';

  static style = css`
    .content-lifecycle-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    @media (min-width: 980px) {
      .content-lifecycle-layout {
        grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
        align-items: start;
      }
    }
    .content-lifecycle section {
      min-width: 0;
    }
    .content-lifecycle-source {
      display: grid;
      gap: 6px;
    }
    .content-lifecycle-source[data-warning='true'] {
      border-left: 4px solid #d49a00;
    }
    .content-lifecycle-cycle {
      display: grid;
      gap: 4px;
      width: 100%;
      text-align: left;
    }
    .content-lifecycle-cycle[aria-current='true'] {
      outline: 2px solid currentColor;
    }
    .content-lifecycle-stages {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .content-lifecycle-stage {
      display: grid;
      gap: 4px;
      padding: 8px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-left-width: 4px;
      border-radius: 6px;
      overflow-wrap: anywhere;
    }
    .content-lifecycle-stage[data-state='completed'] {
      border-left-color: #2e9d57;
    }
    .content-lifecycle-stage[data-state='stale'],
    .content-lifecycle-stage[data-state='blocked'] {
      border-left-color: #d49a00;
    }
    .content-lifecycle-stage[data-state='failed'] {
      border-left-color: #e53935;
    }
    .content-lifecycle-stage[data-next='true'] {
      border-style: dashed;
    }
    .content-lifecycle-stage summary {
      cursor: pointer;
    }
    .content-lifecycle-command {
      display: flex;
      gap: 6px;
      align-items: flex-start;
    }
    .content-lifecycle-done {
      display: grid;
      gap: 4px;
      margin: 6px 0;
      padding: 0;
      list-style: none;
    }
    .content-lifecycle-done .content-lifecycle-command {
      align-items: center;
    }
    .content-lifecycle-done i {
      color: #2e9d57;
    }
    .content-lifecycle-command code {
      flex: 1 1 auto;
      min-width: 0;
      padding: 4px 6px;
      border-radius: 4px;
      background: var(--studio-tag, #8883);
      font-size: 12px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .content-lifecycle pre {
      max-height: 220px;
      margin: 4px 0 0;
      overflow: auto;
      font-size: 11px;
      white-space: pre-wrap;
    }
    .content-lifecycle table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .content-lifecycle th,
    .content-lifecycle td {
      padding: 4px 6px;
      border-bottom: 1px solid var(--studio-subtle-border, #8884);
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .content-lifecycle th {
      overflow-wrap: break-word;
    }
    .content-lifecycle-table {
      overflow-x: auto;
    }
    .${EVENTS}-rows table,
    .content-lifecycle-services table {
      min-width: 36rem;
    }
  `;

  /**
   * Opens the view on a cycle.
   * @param {{cycleId?:string}} [params]
   * @returns {boolean} Whether the host offers the view.
   */
  static open({ cycleId } = {}) {
    const entry = s(`.main-btn-${ROUTE}`);
    if (!entry) return false;
    setPath(`${getProxyPath()}${ROUTE}`);
    setQueryParams({ cycle: cycleId ?? null }, { replace: true });
    if (s('.content-lifecycle')) ContentLifecycleCyberia.route();
    entry.click();
    return true;
  }

  static async render({ appStore }) {
    ContentLifecycleCyberia.canRead = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    ContentLifecycleCyberia.plan = null;
    ContentLifecycleCyberia.runtime = null;
    setTimeout(() => ContentLifecycleCyberia.mount());
    const cyclesHtml = await ListPager.instance({
      id: CYCLES,
      limit: 8,
      unit: 'cycles',
      fetch: async ({ page, limit }) => {
        if (!ContentLifecycleCyberia.canRead) return { data: [], total: 0 };
        const result = await CyberiaContentLifecycleService.get({ page, limit });
        if (result?.status !== 'success') {
          ContentLifecycleCyberia.paintUnavailable(result?.message ?? 'The content lifecycles are not available.');
          return null;
        }
        return result.data;
      },
      render: (rows) => ContentLifecycleCyberia.paintCycles(rows),
    });
    const eventsHtml = await ListPager.instance({
      id: EVENTS,
      limit: 15,
      unit: 'events',
      fetch: async ({ page, limit }) => {
        const cycleId = ContentLifecycleCyberia.plan?.cycleId;
        if (!cycleId) return { data: [], total: 0 };
        const result = await CyberiaContentLifecycleEventService.get({ cycleId, page, limit });
        return result?.status === 'success' ? result.data : null;
      },
      render: (rows) => ContentLifecycleCyberia.paintEvents(rows),
    });
    return html`<style>
        ${STUDIO_FORM_STYLE}
        ${ContentLifecycleCyberia.style}
      </style>
      <div class="in section-mp studio-editor studio-form content-lifecycle">
        <div class="studio-form-hint">
          One content cycle runs from the infrastructure backup to the runtime convergence. Each host records the stages
          its node role and environment allow, with the CLI; this view shows where each cycle stands for each target.
        </div>
        <section
          class="studio-form-card content-lifecycle-source"
          aria-labelledby="content-lifecycle-source-title"
          aria-live="polite"
        >
          <h3 id="content-lifecycle-source-title" style="margin: 0;">Source of the cycles</h3>
          <div class="content-lifecycle-source-body studio-form-hint">Reading the engine…</div>
        </section>
        <div class="content-lifecycle-layout">
          <section aria-labelledby="content-lifecycle-cycles-title">
            <h3 id="content-lifecycle-cycles-title">Cycles</h3>
            <div class="${CYCLES}-rows" style="display: grid; gap: 6px;"></div>
            ${cyclesHtml}
          </section>
          <section aria-labelledby="content-lifecycle-detail-title">
            <h3 id="content-lifecycle-detail-title" class="content-lifecycle-title">Select a cycle</h3>
            <div class="content-lifecycle-detail" aria-live="polite"></div>
            <div class="content-lifecycle-journal" hidden>
              <h4>Operation journal</h4>
              <div class="content-lifecycle-table ${EVENTS}-rows"></div>
              ${eventsHtml}
            </div>
          </section>
        </div>
        <section class="content-lifecycle-sandbox" aria-labelledby="content-lifecycle-sandbox-title" hidden>
          <h3 id="content-lifecycle-sandbox-title">Development Sandbox: local sandbox state</h3>
          <div class="content-lifecycle-sandbox-body"></div>
        </section>
      </div>`;
  }

  static async mount() {
    if (!s('.content-lifecycle')) return;
    await Promise.all([ContentLifecycleCyberia.loadRuntime(), ListPager.load(CYCLES)]);
    await ContentLifecycleCyberia.route();
  }

  /** Reads the monitor context: the source of the cycles, the share and the Development Sandbox. */
  static async loadRuntime() {
    if (!ContentLifecycleCyberia.canRead) return ContentLifecycleCyberia.paintSource();
    const result = await CyberiaContentLifecycleService.runtime().catch(() => null);
    ContentLifecycleCyberia.runtime = result?.status === 'success' ? result.data : null;
    ContentLifecycleCyberia.paintSource(
      result?.status === 'success' ? '' : (result?.message ?? 'The engine does not answer.'),
    );
    ContentLifecycleCyberia.paintSandbox();
  }

  /** Shows the cycle the query parameters name. */
  static async route() {
    const { cycle } = getQueryParams();
    if (cycle && cycle !== ContentLifecycleCyberia.plan?.cycleId) await ContentLifecycleCyberia.select(cycle);
  }

  static paintSource(error = '') {
    const { runtime, canRead } = ContentLifecycleCyberia;
    const body = '.content-lifecycle-source-body';
    if (!s(body)) return;
    if (!canRead) return htmls(body, 'Content lifecycles are for moderators.');
    if (!runtime) return htmls(body, html`<span role="alert">${escapeHtml(error)}</span>`);
    const { source, node, share } = runtime;
    const warning = share && share.state !== 'connected';
    s('.content-lifecycle-source').dataset.warning = String(Boolean(warning || source.kind === 'local'));
    htmls(
      body,
      html`<div class="studio-form-row">
          ${chip(SOURCES[source.kind] ?? [source.kind, ''], source.kind)}
          ${share ? chip(SHARE_STATES[share.state] ?? [share.state, ''], share.state) : ''}
          <span class="studio-form-chip"
            ><i class="fa-solid fa-server" aria-hidden="true"></i> ${escapeHtml(node.nodeName || node.hostname)}
            (${escapeHtml(node.role || 'no node role')})</span
          >
        </div>
        <div>${escapeHtml(source.description)}</div>
        ${
          share
            ? html`<div>
                ${share.cycleId ? `Cycle ${escapeHtml(share.cycleId)} · ` : ''}control node
                <span class="studio-form-mono">${escapeHtml(share.address || '—')}</span>
              </div>`
            : ''
        }
        ${warning ? html`<div class="studio-form-dirty" role="alert">${escapeHtml(share.message)}</div>` : ''}
        ${
          source.kind === 'local'
            ? html`<div class="studio-form-dirty">
                These are not the central cycles. To follow a production cycle here, run
                <code>cyberia content lifecycle share &lt;cycle-id&gt;</code> on the control node, then set the value it
                prints in the environment of this engine.
              </div>`
            : ''
        }`,
    );
  }

  /** Shows why the cycles are not available: never an empty list. */
  static paintUnavailable(message) {
    htmls(
      `.${CYCLES}-rows`,
      html`<div class="studio-form-card studio-form-dirty" role="alert">
        The cycles are not available: ${escapeHtml(message)}
      </div>`,
    );
  }

  static paintCycles(rows) {
    const selected = ContentLifecycleCyberia.plan?.cycleId;
    htmls(
      `.${CYCLES}-rows`,
      !ContentLifecycleCyberia.canRead
        ? html`<div class="studio-form-card">Content lifecycles are for moderators.</div>`
        : rows.length === 0
          ? html`<div class="studio-form-card">
              No cycle in this source yet. Start one on the control node with
              <code>cyberia content lifecycle start</code>.
            </div>`
          : rows
              .map(
                (row) =>
                  html`<button
                    type="button"
                    class="studio-form-card content-lifecycle-cycle"
                    data-cycle="${escapeHtml(row.cycleId)}"
                    aria-current="${row.cycleId === selected}"
                  >
                    <span class="studio-form-mono">${escapeHtml(row.cycleId)}</span>
                    <span>
                      ${chip(STATUSES[row.status] ?? [row.status, ''], row.status)}
                      <span class="studio-form-chip">${row.completed}/${row.stages} stages</span>
                      <span class="studio-form-chip">${escapeHtml(row.environment)}</span>
                    </span>
                    <span class="studio-form-hint">
                      ${row.next ? `Next: ${escapeHtml(row.next.label)}` : 'Every stage is complete'} ·
                      ${escapeHtml(when(row.updatedAt))}
                    </span>
                  </button>`,
              )
              .join(''),
    );
    for (const button of document.querySelectorAll('.content-lifecycle-cycle'))
      button.onclick = () => ContentLifecycleCyberia.select(button.dataset.cycle);
  }

  /** Shows one cycle: its plan, then the first page of its journal. */
  static async select(cycleId) {
    const result = await CyberiaContentLifecycleService.get({ id: cycleId });
    if (result?.status !== 'success') return notify(result?.message ?? `No content lifecycle ${cycleId}`, 'error');
    ContentLifecycleCyberia.plan = result.data;
    setQueryParams({ cycle: cycleId }, { replace: true });
    for (const button of document.querySelectorAll('.content-lifecycle-cycle'))
      button.setAttribute('aria-current', String(button.dataset.cycle === cycleId));
    ContentLifecycleCyberia.paintDetail();
    s('.content-lifecycle-journal').hidden = false;
    await ListPager.load(EVENTS, 1);
  }

  /** The label of a target: its kind and id, and whether this engine observes it. */
  static targetLabel(targetId, kind) {
    const observed = ContentLifecycleCyberia.plan?.targets?.[kind]?.id === targetId;
    return `${TARGETS[kind] ?? kind} ${targetId || '—'}${observed && kind !== 'deployment' ? ' (this host)' : ''}`;
  }

  static paintDetail() {
    const { plan, mode } = ContentLifecycleCyberia;
    if (!plan) return;
    const operator = mode === 'operator';
    htmls('.content-lifecycle-title', `Cycle ${escapeHtml(plan.cycleId)}`);
    const toggle = (value, label, icon) =>
      html`<button
        type="button"
        class="studio-form-button content-lifecycle-mode"
        data-mode="${value}"
        aria-pressed="${mode === value}"
      >
        <i class="${icon}" aria-hidden="true"></i> ${label}
      </button>`;
    const scope = Object.entries(plan.scope ?? {}).filter(([, values]) => values?.length);
    const next = plan.next;
    const stage = (entry) => {
      const [label, icon] = STATES[entry.state] ?? [entry.state, ''];
      const isNext = next?.id === entry.id;
      const unobserved = entry.target !== 'deployment' && !plan.targets?.[entry.target];
      return html`<li class="content-lifecycle-stage" data-state="${entry.state}" data-next="${isNext}">
        <div class="studio-form-row">
          <strong style="flex: 1 1 12rem;">${escapeHtml(entry.label)}</strong>
          ${chip([label, icon], entry.state)}
        </div>
        <div class="studio-form-hint">
          ${escapeHtml(ContentLifecycleCyberia.targetLabel(entry.targetId, entry.target))}
          ${entry.at ? ` · recorded ${escapeHtml(when(entry.at))}` : ''}
          ${entry.attempts > 1 ? ` · attempt ${entry.attempts}` : ''}
          ${operator && entry.node ? ` · node ${escapeHtml(entry.node.nodeName || 'unknown')} (${escapeHtml(entry.node.role || 'no role')})` : ''}
        </div>
        ${
          unobserved
            ? html`<div class="studio-form-hint">
                This host observes no ${escapeHtml(TARGETS[entry.target].toLowerCase())}: the state above belongs to
                another host.${plan.unobserved?.[entry.target] ? ` ${escapeHtml(plan.unobserved[entry.target])}` : ''}
              </div>`
            : ''
        }
        ${entry.error ? html`<div class="studio-form-dirty" role="alert">${escapeHtml(entry.error)}</div>` : ''}
        ${
          entry.executions.length > (entry.eventId ? 1 : 0) || (operator && entry.executions.length)
            ? html`<details>
                <summary>${entry.executions.length} execution(s) by target</summary>
                <div class="content-lifecycle-table">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Target</th>
                        <th scope="col">State</th>
                        <th scope="col">Recorded</th>
                        <th scope="col">Node</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entry.executions
                        .map(
                          (execution) =>
                            html`<tr>
                                <td class="studio-form-mono">${escapeHtml(execution.targetId)}</td>
                                <td>
                                  ${escapeHtml((STATES[execution.state] ?? [execution.state])[0])}${execution.attempts > 1 ? ` (attempt ${execution.attempts})` : ''}${execution.error ? html`<br /><span class="studio-form-hint">${escapeHtml(execution.error)}</span>` : ''}
                                </td>
                                <td>${escapeHtml(when(execution.at))}</td>
                                <td>${escapeHtml(execution.node?.nodeName || '—')}</td>
                              </tr>
                              ${
                                operator
                                  ? html`<tr>
                                      <td colspan="4">
                                        <pre>
${escapeHtml(JSON.stringify({ target: execution.target, evidence: execution.evidence }, null, 2))}</pre>
                                      </td>
                                    </tr>`
                                  : ''
                              }`,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              </details>`
            : ''
        }
      </li>`;
    };
    const editors = [
      ...(plan.scope?.sagas ?? []).map((code) => ({
        label: `Saga ${code}`,
        open: () => SagaEngineCyberia.open({ sagaCode: code }),
      })),
      ...(plan.scope?.maps ?? []).map((code) => ({
        label: `Map ${code}`,
        open: () => StudioCyberia.open('cyberia-instance-engine', { mapCode: code }),
      })),
      ...((plan.scope?.instances ?? []).length
        ? [{ label: 'Instance Studio', open: () => StudioCyberia.open('cyberia-instance-engine', {}) }]
        : []),
      ...((plan.scope?.items ?? []).length
        ? [{ label: 'Item catalog', open: () => StudioCyberia.open('cyberia-item-catalog', {}) }]
        : []),
      { label: 'Procedural Engine', open: () => StudioCyberia.open('cyberia-procedural-engine', {}) },
      { label: 'Action Engine', open: () => StudioCyberia.open('cyberia-action-engine', {}) },
    ];
    const targetIds = [
      ...new Map(
        [
          ...Object.values(plan.targets ?? {}),
          ...plan.stages.flatMap(({ executions }) =>
            executions.map(({ targetId, targetKind, at }) => ({ id: targetId, kind: targetKind, at })),
          ),
        ].map((target) => [target.id, target]),
      ).values(),
    ];
    htmls(
      '.content-lifecycle-detail',
      html`<div class="studio-form-row" role="toolbar" aria-label="View">
          ${toggle('developer', 'Developer', 'fa-solid fa-code')}
          ${toggle('operator', 'Operator', 'fa-solid fa-server')}
        </div>
        <section aria-label="Lifecycle overview" class="studio-form-row" style="margin: 6px 0;">
          ${chip(STATUSES[plan.status] ?? [plan.status, ''], plan.status)}
          <span class="studio-form-chip">${escapeHtml(plan.deployId)}</span>
          <span class="studio-form-chip">${escapeHtml(plan.environment)}</span>
          ${next ? html`<span class="studio-form-chip">Current stage: ${escapeHtml(next.label)}</span>` : ''}
          ${scope.map(([key, values]) => html`<span class="studio-form-chip">${escapeHtml(key)}: ${escapeHtml(values.join(', '))}</span>`).join('')}
        </section>
        ${
          next
            ? html`<section class="studio-form-card" aria-labelledby="content-lifecycle-next-title">
                <h4 id="content-lifecycle-next-title" style="margin-top: 0;">Next action: ${escapeHtml(next.label)}</h4>
                <div class="studio-form-hint">
                  For ${escapeHtml(ContentLifecycleCyberia.targetLabel(next.targetId, next.target))}.
                  ${next.requirements.length ? `Needs ${escapeHtml(next.requirements.join('; and '))}.` : 'Any host may run it.'}
                  ${next.needs.length ? ` Also needs ${escapeHtml(next.needs.join('; '))}.` : ''}
                </div>
                ${next.error ? html`<div class="studio-form-dirty" role="alert">Last attempt: ${escapeHtml(next.error)}</div>` : ''}
                ${
                  next.done.length
                    ? html`<ul class="content-lifecycle-done" aria-label="Commands that already ran">
                        ${next.done
                          .map(
                            (command) =>
                              html`<li class="content-lifecycle-command">
                                <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                                <code>${escapeHtml(command)}</code>
                                <span class="studio-form-hint">Done</span>
                              </li>`,
                          )
                          .join('')}
                      </ul>`
                    : ''
                }
                ${next.commands
                  .map(
                    (command, index) =>
                      html`<div class="content-lifecycle-command">
                        <code>${escapeHtml(command)}</code>
                        <button
                          type="button"
                          class="studio-form-button content-lifecycle-copy"
                          data-index="${index}"
                          aria-label="Copy the command ${escapeHtml(command)}"
                        >
                          <i class="fa-solid fa-copy" aria-hidden="true"></i>
                        </button>
                      </div>`,
                  )
                  .join('')}
              </section>`
            : html`<div class="studio-form-card">${CLOSED[plan.status] ?? 'Every stage is complete.'}</div>`
        }
        <h4>Stage timeline</h4>
        <ol class="content-lifecycle-stages">
          ${plan.stages.map(stage).join('')}
        </ol>
        <h4>Content provenance</h4>
        ${table(
          PROVENANCE.map(([key, label]) => [
            label,
            plan.references?.[key] ? escapeHtml(String(plan.references[key])) : '—',
          ]),
        )}
        <h4>Execution targets</h4>
        ${table(
          targetIds.map(({ id, kind }) => [
            TARGETS[kind] ?? kind ?? 'Target',
            `${escapeHtml(id)}${plan.targets?.[kind]?.id === id && kind !== 'deployment' ? ' · this host' : ''}`,
          ]),
        )}
        ${
          operator
            ? html`<h4>Shares</h4>
                ${
                  plan.shares?.length
                    ? table(
                        plan.shares.map((share) => [
                          `${share.peerId} (${share.nodeName})`,
                          `${escapeHtml(share.state)} · opened ${escapeHtml(when(share.openedAt))} · ${share.closedAt ? `ended ${escapeHtml(when(share.closedAt))}` : `expires ${escapeHtml(when(share.expiresAt))}`} · ${escapeHtml(short(share.shareId, 8))}`,
                        ]),
                      )
                    : html`<div class="studio-form-hint">No share of this cycle.</div>`
                }`
            : html`<h4>Editors</h4>
                <div class="studio-form-row">
                  ${editors
                    .map(
                      ({ label }, index) =>
                        html`<button
                          type="button"
                          class="studio-form-button content-lifecycle-editor"
                          data-index="${index}"
                        >
                          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${escapeHtml(label)}
                        </button>`,
                    )
                    .join('')}
                </div>`
        }`,
    );
    for (const button of document.querySelectorAll('.content-lifecycle-mode'))
      button.onclick = async () => {
        ContentLifecycleCyberia.mode = button.dataset.mode;
        ContentLifecycleCyberia.paintDetail();
        ContentLifecycleCyberia.paintSandbox();
        await ListPager.load(EVENTS);
      };
    for (const button of document.querySelectorAll('.content-lifecycle-copy'))
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(next.commands[Number(button.dataset.index)]);
          notify('Command copied.');
        } catch {
          notify('The browser refused the copy: select the command and copy it.', 'warning');
        }
      };
    for (const button of document.querySelectorAll('.content-lifecycle-editor'))
      button.onclick = () => {
        if (!editors[Number(button.dataset.index)].open()) notify('This host does not offer that editor.', 'warning');
      };
  }

  /** Shows the Development Sandbox of this engine, apart from the cycle: a container has none. */
  static paintSandbox() {
    const sandbox = ContentLifecycleCyberia.runtime?.sandbox;
    const section = s('.content-lifecycle-sandbox');
    if (!section) return;
    section.hidden = !sandbox;
    if (!sandbox) return;
    const operator = ContentLifecycleCyberia.mode === 'operator';
    const identity = sandbox.target?.identity ?? {};
    htmls(
      '.content-lifecycle-sandbox-body',
      html`${
          sandbox.state === 'ready'
            ? ''
            : html`<div class="studio-form-card studio-form-dirty" role="alert">
                Local sandbox unavailable: ${escapeHtml(sandbox.message)}
              </div>`
        }
        ${
          sandbox.target
            ? table([
                ['Target', escapeHtml(sandbox.target.id)],
                ['Kubernetes context', escapeHtml(sandbox.session?.kubeContext ?? identity.kubeContext ?? '—')],
                ['Namespace', escapeHtml(sandbox.session?.namespace ?? identity.namespace ?? '—')],
                ['Replica set', escapeHtml(identity.replicaSetId ?? '—')],
                ['Runtime database', escapeHtml(identity.database ?? '—')],
                [
                  'Content workspace',
                  `${escapeHtml(identity.contentDatabase ?? '—')} · ${escapeHtml(sandbox.workspace)}`,
                ],
                [
                  'Restored releases',
                  sandbox.releases.length ? escapeHtml(sandbox.releases.join(', ')) : 'none: no baseline is restored',
                ],
                ...(operator
                  ? [
                      ['Target fingerprint', escapeHtml(sandbox.target.fingerprint)],
                      ['Session started', escapeHtml(when(sandbox.session?.startedAt))],
                    ]
                  : []),
              ])
            : ''
        }
        ${
          sandbox.services.length
            ? html`<h4>Services</h4>
                <div class="content-lifecycle-table content-lifecycle-services">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Service</th>
                        <th scope="col">State</th>
                        <th scope="col">Endpoint</th>
                        <th scope="col">Kubernetes resource</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${sandbox.services
                        .map(
                          (service) =>
                            html`<tr>
                              <td>${escapeHtml(service.label)}</td>
                              <td>
                                ${chip(
                                  service.ready
                                    ? ['Ready', 'fa-solid fa-circle-check']
                                    : ['Not ready', 'fa-solid fa-circle-xmark'],
                                  service.ready ? 'completed' : 'failed',
                                )}
                                <span class="studio-form-hint">${escapeHtml(service.detail)}</span>
                              </td>
                              <td class="studio-form-mono">${escapeHtml(service.endpoint)}</td>
                              <td class="studio-form-mono">${escapeHtml(service.resource)}</td>
                            </tr>`,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
            : ''
        }
        <h4>Source checkout state</h4>
        ${
          sandbox.source.id
            ? table([
                ['Checkout', escapeHtml(sandbox.source.id)],
                ['Branch', escapeHtml(sandbox.source.branch || '—')],
                [
                  'Revision',
                  `${escapeHtml(short(sandbox.source.revision, 12))} ${escapeHtml(sandbox.source.head ?? '')}`,
                ],
                ['Working tree', sandbox.source.changed ? 'modified: changes are not committed' : 'clean'],
              ])
            : html`<div class="studio-form-hint">${escapeHtml(sandbox.source.message)}</div>`
        }
        <h4>Content artifact</h4>
        ${
          sandbox.artifact
            ? table([
                ['Version', escapeHtml(sandbox.artifact.version)],
                ['Digest', escapeHtml(sandbox.artifact.digest)],
                ['Source revision', escapeHtml(short(sandbox.artifact.sourceRevision, 12))],
              ])
            : html`<div class="studio-form-hint">No content artifact on this host.</div>`
        }`,
    );
  }

  static paintEvents(rows) {
    const operator = ContentLifecycleCyberia.mode === 'operator';
    htmls(
      `.${EVENTS}-rows`,
      rows.length === 0
        ? html`<div class="studio-form-hint">No event yet.</div>`
        : html`<table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">When</th>
                <th scope="col">Operation</th>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
                <th scope="col">Host</th>
                ${operator ? html`<th scope="col">Detail</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (event) =>
                    html`<tr>
                      <td>${event.seq}</td>
                      <td>${escapeHtml(when(event.completedAt))}</td>
                      <td>${escapeHtml(event.stage ? `${event.operation} ${event.stage}` : event.operation)}</td>
                      <td class="studio-form-mono">${escapeHtml(event.executionTargetId || '—')}</td>
                      <td>
                        ${escapeHtml(event.status)}${event.attempt > 1 ? ` (attempt ${event.attempt})` : ''}${event.error ? html`<br /><span class="studio-form-hint">${escapeHtml(event.error)}</span>` : ''}
                      </td>
                      <td>
                        ${escapeHtml(event.node?.nodeName || '—')} ·
                        ${escapeHtml(event.actor || '—')}${event.shareId ? ' · via share' : ''}
                      </td>
                      ${operator ? html`<td><pre>${escapeHtml(JSON.stringify({ result: event.resultSummary, references: event.references }, null, 2))}</pre></td>` : ''}
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>`,
    );
  }
}

export { ContentLifecycleCyberia };
