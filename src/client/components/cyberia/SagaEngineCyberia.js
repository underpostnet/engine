/**
 * The Saga Engine of the Cyberia Studio: the catalog of the sagas a host holds, and the guided
 * workflow of a saga, from its narrative context to a release-ready package.
 *
 * The catalog lists every saga of the content source, the content artifact, the workspace and the
 * workflows, with the state of each source apart. A stored saga opens without a workflow: its report,
 * its relationship graphs and its synchronization. A workflow opens a saga of the content source or
 * starts a new one. The narrative context feeds the
 * cyberia-content generator, which runs in the background one stage at a time. Each result, and each
 * save of the package editor, is a new candidate revision; a checked revision applies to the content
 * source. The completeness report names every gap with the editor that owns it: the package, the
 * Procedural Engine for renders and map populations, the Action Engine for quests, actions and
 * dialogues, the economy and market editors, the Instance Studio, and the saga synchronization for
 * providers. This view decides nothing on its own: the server answers every check and report, and
 * each domain editor keeps its own work.
 *
 * @module src/client/components/cyberia/SagaEngineCyberia.js
 */
import { commonModeratorGuard } from '../core/CommonJs.js';
import { ListPager } from '../core/ListPager.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from '../core/Router.js';
import { Tabs } from '../core/Tabs.js';
import { escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/CyberiaProceduralJobService.js';
import { CyberiaProceduralPopulationService } from '../../services/cyberia-procedural-population/CyberiaProceduralPopulationService.js';
import { CyberiaSagaService } from '../../services/cyberia-saga/CyberiaSagaService.js';
import { CyberiaSagaWorkflowService } from '../../services/cyberia-saga-workflow/CyberiaSagaWorkflowService.js';
import { ProceduralEngineCyberia } from './ProceduralEngineCyberia.js';
import { sagaBadge } from './SagaCyberia.js';
import { SagaGraph } from './SagaGraphCyberia.js';
import { SagaPackage } from './SagaPackageCyberia.js';
import { SagaReport } from './SagaReportCyberia.js';
import { SagaSync } from './SagaSyncCyberia.js';
import { STUDIO_FORM_STYLE, choiceField } from './StudioFormCyberia.js';
import { StudioCyberia } from './StudioCyberia.js';

const ROUTE = 'cyberia-saga-engine';
const TABS = 'saga-engine-tabs';
const CATALOG = 'saga-engine-catalog';
const SYNC_PANEL = 'saga-engine';
/** How often a running generation is read again. */
const POLL_MS = 2500;

/** The options the generator offers; an empty value lets it choose. */
const GENERATOR_OPTIONS = Object.freeze({
  spaceContext: ['physical', 'mixed', 'hyperspace'],
  tone: ['adventure', 'politics', 'tragic', 'comedy'],
  culturalExposure: ['cosmopolitan', 'local'],
  thinkingLevel: ['minimal', 'low', 'medium', 'high'],
});

/** What each stage of a workflow means to the moderator. */
const STAGES = Object.freeze({
  empty: ['No candidate yet', 'fa-solid fa-circle'],
  generating: ['Generating', 'fa-solid fa-spinner'],
  failed: ['Generation failed', 'fa-solid fa-circle-xmark'],
  draft: ['Draft, not checked', 'fa-solid fa-pen'],
  findings: ['Has findings', 'fa-solid fa-triangle-exclamation'],
  checked: ['Checked, not applied', 'fa-solid fa-list-check'],
  applied: ['In the content source', 'fa-solid fa-file-import'],
});

const STEP_STATES = Object.freeze({
  queued: 'fa-regular fa-circle',
  running: 'fa-solid fa-spinner',
  done: 'fa-solid fa-circle-check',
  failed: 'fa-solid fa-circle-xmark',
});

/** What the workspace record of a saga means against the artifact. */
const WORKSPACE_STATES = Object.freeze({
  'in-sync': ['Imported, as built', 'fa-solid fa-circle-check'],
  differs: ['Imported, differs from the build', 'fa-solid fa-code-compare'],
  stored: ['Imported, not in the build', 'fa-solid fa-database'],
  absent: ['Not imported', 'fa-regular fa-circle'],
});

/** The filters of the catalog: the values each one takes, as the API names them. */
const CATALOG_CHOICES = Object.freeze({
  source: [
    ['', 'Any'],
    ['present', 'In the content source'],
    ['absent', 'Not in the content source'],
  ],
  artifact: [
    ['', 'Any'],
    ['present', 'Built'],
    ['absent', 'Not built'],
  ],
  workspace: [['', 'Any'], ...Object.entries(WORKSPACE_STATES).map(([value, [label]]) => [value, label])],
  workflow: [['', 'Any'], ['none', 'No workflow'], ...Object.entries(STAGES).map(([value, [label]]) => [value, label])],
});

/** The Studio route of each editor a report link names. */
const EDITORS = Object.freeze({
  'action-engine': 'cyberia-action-engine',
  'entity-engine': 'cyberia-entity-engine',
  'item-catalog': 'cyberia-item-catalog',
  'economy-engine': 'cyberia-economy-engine',
  'market-engine': 'cyberia-market-engine',
  'instance-engine': 'cyberia-instance-engine',
});

const notify = (text, status = 'success') => NotificationManager.Push({ html: escapeHtml(text), status });
const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const shortRevision = (revision) => (revision ? revision.slice(0, 7) : '—');
const when = (date) => (date ? new Date(date).toLocaleString() : '—');
const group = (title, icon, inner) =>
  html`<div class="in studio-group">
    <div class="in studio-group-title"><i class="${icon}" aria-hidden="true"></i> ${title}</div>
    ${inner}
  </div>`;

class SagaEngineCyberia {
  static canMutate = false;
  /** The workflow view the panels show, or null. */
  static workflow = null;
  /** The saga of the served artifact the panels show without a workflow, or ''. */
  static sagaCode = '';
  static report = null;
  static reportFilter = 'open';
  /** The catalog filters, as the API names them. */
  static filters = { q: '', source: '', artifact: '', workspace: '', workflow: '', release: '', instance: '' };
  /** The newest catalog page: its drafts, releases and capabilities. */
  static catalog = null;
  static timer = null;

  static style = css`
    .saga-engine-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .saga-engine-steps {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 4px;
      margin: 6px 0;
    }
    .saga-engine-step {
      padding: 4px 6px;
      border: 1px solid var(--studio-subtle-border, #8884);
      border-radius: 6px;
      font-size: 12px;
    }
    .saga-engine-step[data-status='done'] i {
      color: #2e9d57;
    }
    .saga-engine-step[data-status='failed'] i {
      color: #e53935;
    }
    .saga-engine-step[data-status='running'] i {
      color: #d49a00;
    }
    .saga-engine-step pre,
    .saga-engine-log {
      max-height: 160px;
      margin: 4px 0 0;
      overflow: auto;
      font-size: 11px;
      white-space: pre-wrap;
    }
    .saga-engine textarea {
      width: 100%;
      min-height: 64px;
      resize: vertical;
      font: inherit;
    }
    .saga-engine-empty {
      padding: 12px;
      opacity: 0.8;
    }
    .saga-engine-filter-more {
      margin: 6px 0;
    }
    .saga-engine-filter-more summary {
      cursor: pointer;
    }
    .saga-engine-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
      gap: 8px;
      margin: 6px 0;
    }
    .saga-engine-card {
      display: grid;
      gap: 6px;
      align-content: start;
    }
    .saga-engine-card-text {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
  `;

  /**
   * Opens the view on a workflow, or on a saga of the served artifact, at a tab.
   * @param {{workflowId?:string, sagaCode?:string, tab?:string}} [params]
   * @returns {boolean} Whether the host offers the view.
   */
  static open({ workflowId, sagaCode, tab } = {}) {
    const entry = s(`.main-btn-${ROUTE}`);
    if (!entry) return false;
    setPath(`${getProxyPath()}${ROUTE}`);
    setQueryParams({ workflow: workflowId ?? null, saga: sagaCode ?? null, tab: tab ?? null }, { replace: true });
    if (s('.saga-engine')) SagaEngineCyberia.route();
    entry.click();
    return true;
  }

  static async render({ appStore }) {
    SagaEngineCyberia.canMutate = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    Object.assign(SagaEngineCyberia, { workflow: null, sagaCode: '', report: null });
    setTimeout(() => SagaEngineCyberia.mount());
    const catalogHtml = await ListPager.instance({
      id: CATALOG,
      limit: 8,
      unit: 'sagas',
      fetch: async ({ page, limit }) => {
        if (!SagaEngineCyberia.canMutate) return { data: [], total: 0 };
        const result = await CyberiaSagaService.catalog({ ...SagaEngineCyberia.filters, page, limit });
        if (result?.status !== 'success') {
          notify(result?.message ?? 'The saga catalog is not available.', 'error');
          return null;
        }
        SagaEngineCyberia.catalog = result.data;
        return result.data;
      },
      render: (rows) => SagaEngineCyberia.paintCatalog(rows),
    });
    const placeholder = (slot) =>
      html`<div class="${slot}"><div class="saga-engine-empty">Select or start a saga.</div></div>`;
    return html`<style>
        ${STUDIO_FORM_STYLE}
        ${SagaEngineCyberia.style}
      </style>
      <div class="in section-mp studio-editor studio-form saga-engine">
        <div class="studio-form-row">
          <div style="flex: 1 1 20rem;">
            <div class="saga-engine-title" role="status" aria-live="polite"></div>
            <div class="studio-form-hint">
              A saga is the narrative layer over shared content: several sagas may use one map, one item and one world.
              The Saga Engine finds what a saga still needs; each domain editor does that work.
            </div>
          </div>
        </div>
        ${Tabs.render({
          id: TABS,
          label: 'Saga workflow',
          selected: 'workspace',
          tabs: [
            {
              id: 'workspace',
              label: 'Sagas',
              icon: 'fa-solid fa-book',
              content: html`${group(
                'Sagas of this host',
                'fa-solid fa-book-open',
                html`<div class="saga-engine-filters"></div>
                  <div class="saga-engine-catalog-status studio-form-hint" role="status" aria-live="polite"></div>
                  <div class="${CATALOG}-rows saga-engine-cards"></div>
                  ${catalogHtml}
                  <div class="saga-engine-drafts"></div>`,
              )}
              ${group('New saga', 'fa-solid fa-plus', html`<div class="saga-engine-start"></div>`)}`,
            },
            {
              id: 'context',
              label: 'Narrative and generation',
              icon: 'fa-solid fa-feather',
              content: placeholder('saga-engine-context'),
            },
            {
              id: 'package',
              label: 'Semantic package',
              icon: 'fa-solid fa-file-code',
              content: html`<div class="saga-engine-package"></div>`,
            },
            {
              id: 'completeness',
              label: 'Completeness',
              icon: 'fa-solid fa-diagram-project',
              content: placeholder('saga-engine-completeness'),
            },
            {
              id: 'graphs',
              label: 'Relationships',
              icon: 'fa-solid fa-circle-nodes',
              content: placeholder('saga-engine-graphs'),
            },
            {
              id: 'integration',
              label: 'Providers and sync',
              icon: 'fa-solid fa-link',
              content: placeholder('saga-engine-integration'),
            },
            {
              id: 'audit',
              label: 'Final audit',
              icon: 'fa-solid fa-clipboard-check',
              content: placeholder('saga-engine-audit'),
            },
          ],
        })}
      </div>`;
  }

  static async mount() {
    if (!s('.saga-engine')) return;
    Tabs.bind(s(`.${TABS}`), {
      onChange: (tab) => {
        setQueryParams({ tab }, { replace: true });
        if (['completeness', 'graphs', 'audit'].includes(tab) && !SagaEngineCyberia.report)
          SagaEngineCyberia.loadReport();
      },
    });
    SagaEngineCyberia.paintFilters();
    SagaEngineCyberia.paintStart();
    await ListPager.load(CATALOG);
    await SagaEngineCyberia.route();
  }

  /** Shows what the query parameters name: a workflow, a saga of the artifact, and a tab. */
  static async route() {
    const { workflow, saga, tab } = getQueryParams();
    if (workflow && workflow !== SagaEngineCyberia.workflow?._id) await SagaEngineCyberia.select(workflow);
    else if (!workflow && saga && saga !== SagaEngineCyberia.sagaCode) await SagaEngineCyberia.selectSaga(saga);
    else SagaEngineCyberia.paintTitle();
    if (tab) Tabs.select(s(`.${TABS}`), tab);
  }

  static paintTitle() {
    const { workflow, sagaCode } = SagaEngineCyberia;
    const [label, icon] = STAGES[workflow?.stage] ?? ['', ''];
    htmls(
      '.saga-engine-title',
      workflow
        ? html`<div class="saga-engine-chips">
            <strong>${escapeHtml(workflow.package?.saga?.name || workflow.sagaCode || 'New saga')}</strong>
            ${workflow.sagaCode ? sagaBadge(workflow.sagaCode).outerHTML : ''}
            <span class="studio-form-chip"><i class="${icon}" aria-hidden="true"></i> ${escapeHtml(label)}</span>
            ${workflow.capabilities?.sources ? '' : html`<span class="studio-form-chip studio-form-bad">No content source: read only</span>`}
          </div>`
        : sagaCode
          ? html`<div class="saga-engine-chips">
              <strong>${escapeHtml(sagaCode)}</strong> ${sagaBadge(sagaCode).outerHTML}
              <span class="studio-form-chip">The served artifact, without a workflow</span>
            </div>`
          : html`<strong>Saga Engine</strong>`,
    );
  }

  /** The filter bar of the catalog: text, source, build, workspace, workflow, release and world. */
  static paintFilters() {
    const { filters } = SagaEngineCyberia;
    const choice = (key, label) =>
      choiceField({
        block: 'catalog',
        key,
        label,
        value: filters[key],
        options: CATALOG_CHOICES[key].map(([value, text]) => ({ value, label: text })),
      });
    const text = (key, label, placeholder, list = '') =>
      html`<label class="studio-form-field"
        ><span>${label}</span
        ><input
          type="search"
          data-block="catalog"
          data-key="${key}"
          value="${escapeHtml(filters[key])}"
          placeholder="${placeholder}"
          ${list ? `list="${list}"` : ''}
      /></label>`;
    const active = ['source', 'artifact', 'workspace', 'workflow', 'release', 'instance'].filter((key) => filters[key]);
    htmls(
      '.saga-engine-filters',
      html`${text('q', 'Search', 'Code or name')}
        <details class="saga-engine-filter-more" ${active.length ? 'open' : ''}>
          <summary>Filters${active.length ? ` (${active.length} on)` : ''}</summary>
          <div class="studio-form-grid">
            ${choice('source', 'Content source')} ${choice('artifact', 'Build')} ${choice('workspace', 'Workspace')}
            ${choice('workflow', 'Workflow')} ${text('release', 'In release', 'Release id', 'saga-engine-releases')}
            ${text('instance', 'In world', 'Instance code')}
          </div>
        </details>
        <datalist id="saga-engine-releases"></datalist>`,
    );
    let timer = null;
    for (const field of document.querySelectorAll('[data-block="catalog"]')) {
      const apply = () => {
        SagaEngineCyberia.filters[field.dataset.key] = field.value.trim();
        ListPager.load(CATALOG, 1);
      };
      field.onchange = apply;
      if (field.type === 'search')
        field.oninput = () => {
          clearTimeout(timer);
          timer = setTimeout(apply, 350);
        };
    }
  }

  /** One card per saga: each source, its world, counts, shared content, placement and workflow. */
  static paintCatalog(rows) {
    const { canMutate, catalog } = SagaEngineCyberia;
    const sources = catalog?.capabilities?.sources;
    const releases = s('#saga-engine-releases');
    if (releases)
      releases.innerHTML = (catalog?.releases ?? [])
        .map(({ releaseId, status }) => html`<option value="${escapeHtml(releaseId)}">${escapeHtml(status)}</option>`)
        .join('');
    htmls(
      '.saga-engine-catalog-status',
      !canMutate
        ? ''
        : `${catalog?.total ?? 0} saga(s).${sources ? '' : ' This host has no content source checkout: packages are read only.'}`,
    );
    const chip = (icon, text, bad = false) =>
      html`<span class="studio-form-chip ${bad ? 'studio-form-bad' : ''}"
        ><i class="${icon}" aria-hidden="true"></i> ${escapeHtml(text)}</span
      >`;
    const progress = ({ done, total }, label) => (total > 0 ? `${label} ${done}/${total}` : '');
    const card = (row) => {
      const [workspace, workspaceIcon] = WORKSPACE_STATES[row.workspace.status];
      const [stage, stageIcon] = row.workflow ? (STAGES[row.workflow.stage] ?? [row.workflow.stage, '']) : [];
      const { counts, placement, shared } = row;
      const world = row.instances.includes(row.code);
      const actions = [
        row.artifact.present &&
          html`<button
            type="button"
            class="studio-form-button saga-engine-catalog-open"
            data-code="${escapeHtml(row.code)}"
          >
            <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Open
          </button>`,
        row.workflow &&
          html`<button
            type="button"
            class="studio-form-button saga-engine-catalog-workflow"
            data-id="${escapeHtml(row.workflow._id)}"
          >
            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Workflow
          </button>`,
        !row.workflow &&
          row.source.present &&
          html`<button
            type="button"
            class="studio-form-button saga-engine-catalog-package"
            data-code="${escapeHtml(row.code)}"
            ${canMutate && sources ? '' : 'disabled'}
          >
            <i class="fa-solid fa-file-pen" aria-hidden="true"></i> Edit package
          </button>`,
      ].filter(Boolean);
      return html`<article
        class="studio-form-card saga-engine-card"
        aria-labelledby="saga-engine-card-${escapeHtml(row.code)}"
      >
        <div class="saga-engine-chips">
          <h4 id="saga-engine-card-${escapeHtml(row.code)}" style="margin: 0;">${escapeHtml(row.name)}</h4>
          ${sagaBadge(row.code).outerHTML}
        </div>
        ${row.description ? html`<p class="saga-engine-card-text">${escapeHtml(row.description)}</p>` : ''}
        <div class="saga-engine-chips">
          ${chip('fa-solid fa-code-branch', row.source.present ? 'In the content source' : 'Not in the content source', !row.source.present)}
          ${chip('fa-solid fa-box', row.artifact.present ? 'Built' : 'Not built', !row.artifact.present)}
          ${chip(workspaceIcon, workspace, row.workspace.status !== 'in-sync')}
          ${chip('fa-solid fa-earth-americas', world ? 'Authoring world ready' : 'No authoring world', !world)}
          ${row.release ? chip('fa-solid fa-tag', `${row.release.present ? 'In' : 'Not in'} ${row.release.releaseId}`, !row.release.present) : ''}
          ${row.workflow ? chip(stageIcon, `Workflow: ${stage}`) : chip('fa-regular fa-folder', 'No workflow')}
        </div>
        <div class="studio-form-hint">
          ${[
            `${counts.maps} maps`,
            counts.places ? `${counts.places} places` : '',
            counts.items === null ? '' : `${counts.items} items`,
            `${counts.quests} quests`,
            `${counts.actions} actions`,
            counts.dialogues === null ? '' : `${counts.dialogues} dialogues`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div class="studio-form-hint">
          ${[
            progress(placement.maps, 'Maps stored'),
            progress(placement.quests, 'Quests placed'),
            progress(placement.actions, 'Actions placed'),
            shared.maps.length || shared.items
              ? `Shares ${shared.maps.length} map(s) and ${shared.items} item(s) with other sagas`
              : '',
            row.instances.length ? `Worlds: ${row.instances.join(', ')}` : 'In no world',
            `Changed ${when(row.updatedAt)}`,
          ]
            .filter(Boolean)
            .map(escapeHtml)
            .join(' · ')}
        </div>
        ${actions.length ? html`<div class="studio-form-row" style="margin-top: 6px;">${actions.join('')}</div>` : ''}
      </article>`;
    };
    htmls(
      `.${CATALOG}-rows`,
      !canMutate
        ? html`<div class="studio-form-card">The saga catalog is for moderators.</div>`
        : rows.length === 0
          ? html`<div class="studio-form-card">No saga matches these filters.</div>`
          : rows.map(card).join(''),
    );
    const drafts = catalog?.drafts ?? [];
    htmls(
      '.saga-engine-drafts',
      drafts.length === 0
        ? ''
        : html`<h4>Drafts without a saga code</h4>
            ${drafts
              .map(
                (draft) =>
                  html`<div class="studio-form-row studio-form-card">
                    <span style="flex: 1 1 10rem;">${escapeHtml(draft.name || 'Untitled saga')}</span>
                    <span class="studio-form-hint">${escapeHtml(when(draft.updatedAt))}</span>
                    <button
                      type="button"
                      class="studio-form-button saga-engine-catalog-workflow"
                      data-id="${escapeHtml(draft._id)}"
                    >
                      <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Open
                    </button>
                  </div>`,
              )
              .join('')}`,
    );
    for (const button of document.querySelectorAll('.saga-engine-catalog-open'))
      button.onclick = () => SagaEngineCyberia.selectSaga(button.dataset.code);
    for (const button of document.querySelectorAll('.saga-engine-catalog-workflow'))
      button.onclick = async () => {
        await SagaEngineCyberia.select(button.dataset.id);
        Tabs.select(s(`.${TABS}`), 'package');
      };
    for (const button of document.querySelectorAll('.saga-engine-catalog-package'))
      button.onclick = () => SagaEngineCyberia.create({ sagaCode: button.dataset.code });
  }

  /** The start card of a new saga: its code, name and premise. */
  static paintStart() {
    const { canMutate } = SagaEngineCyberia;
    htmls(
      '.saga-engine-start',
      html`<div class="studio-form-hint">
          Name the saga, then set its narrative context and generate it. Leave the code empty to let the generator name
          it.
        </div>
        <div class="studio-form-grid">
          <label class="studio-form-field"
            ><span>Code</span><input class="saga-engine-new-code" placeholder="kebab-case"
          /></label>
          <label class="studio-form-field"><span>Name</span><input class="saga-engine-new-name" /></label>
        </div>
        <label class="studio-form-field"
          ><span>Premise</span><textarea class="saga-engine-new-prompt"></textarea>
        </label>
        <button type="button" class="studio-form-button saga-engine-new" ${canMutate ? '' : 'disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Start the saga
        </button>`,
    );
    s('.saga-engine-new').onclick = () =>
      SagaEngineCyberia.create({
        context: {
          prompt: s('.saga-engine-new-prompt').value,
          saga: { code: s('.saga-engine-new-code').value, name: s('.saga-engine-new-name').value, description: '' },
        },
      });
  }

  static async create(body) {
    const { status, data, message } = await CyberiaSagaWorkflowService.post({ body });
    if (status !== 'success') return notify(message, 'error');
    await ListPager.load(CATALOG, 1);
    await SagaEngineCyberia.select(data._id, data);
    Tabs.select(s(`.${TABS}`), body.sagaCode ? 'package' : 'context');
  }

  /** Shows a workflow in every panel. */
  static async select(id, view = null) {
    if (!view) {
      const result = await CyberiaSagaWorkflowService.get({ id });
      if (result.status !== 'success') return notify(result.message, 'error');
      view = result.data;
    }
    Object.assign(SagaEngineCyberia, { workflow: view, sagaCode: '', report: null });
    setQueryParams({ workflow: view._id, saga: null }, { replace: true });
    SagaEngineCyberia.paintAll();
    SagaEngineCyberia.watch();
  }

  /** Shows the report of a saga of the served artifact, without a workflow. */
  static async selectSaga(code) {
    Object.assign(SagaEngineCyberia, { workflow: null, sagaCode: code, report: null });
    setQueryParams({ workflow: null, saga: code }, { replace: true });
    SagaEngineCyberia.paintAll();
    Tabs.select(s(`.${TABS}`), 'completeness');
    await SagaEngineCyberia.loadReport();
  }

  /** Takes the workflow view an operation answered and repaints what it changes. */
  static async changed(view) {
    const stage = SagaEngineCyberia.workflow?.stage;
    SagaEngineCyberia.workflow = view;
    SagaEngineCyberia.report = null;
    SagaEngineCyberia.paintTitle();
    SagaEngineCyberia.paintContext();
    SagaEngineCyberia.paintAudit();
    SagaPackage.refresh(view);
    if (stage !== view.stage) await ListPager.load(CATALOG);
    SagaEngineCyberia.watch();
  }

  static paintAll() {
    SagaEngineCyberia.paintTitle();
    SagaEngineCyberia.paintContext();
    SagaEngineCyberia.paintPackage();
    SagaEngineCyberia.paintReport();
    SagaEngineCyberia.paintGraphs();
    SagaEngineCyberia.paintIntegration();
    SagaEngineCyberia.paintAudit();
  }

  /** The narrative context form and the generations. */
  static paintContext() {
    const { workflow, canMutate } = SagaEngineCyberia;
    if (!s('.saga-engine-context')) return;
    if (!workflow) {
      htmls(
        '.saga-engine-context',
        html`<div class="saga-engine-empty">
          ${SagaEngineCyberia.sagaCode ? 'A saga without a workflow has no generation: open its package first.' : 'Select or start a saga.'}
        </div>`,
      );
      return;
    }
    const context = workflow.context ?? {};
    const sources = workflow.capabilities?.sources;
    const disabled = canMutate && sources ? '' : 'disabled';
    const active = workflow.generations.some(({ status }) => ['queued', 'running'].includes(status));
    const input = (key, label, value, hint = '') =>
      html`<label class="studio-form-field"
        ><span>${label}</span><input data-context="${key}" value="${escapeHtml(value ?? '')}" ${disabled} />${
          hint ? html`<span class="studio-form-hint">${hint}</span>` : ''
        }</label
      >`;
    const select = (key, label, hint) =>
      choiceField({
        block: 'context',
        key,
        label,
        value: context[key] ?? '',
        options: [
          { value: '', label: 'Generator chooses' },
          ...GENERATOR_OPTIONS[key].map((value) => ({ value, label: value })),
        ],
        hint,
        disabled,
      });
    htmls(
      '.saga-engine-context',
      html`${group(
        'Narrative context',
        'fa-solid fa-feather',
        html`${sources ? '' : html`<div class="studio-form-dirty">This host has no cyberia-content source checkout: it cannot generate.</div>`}
          <div class="studio-form-grid">
            ${input('saga.code', 'Saga code', context.saga?.code, 'The generator keeps a code you set')}
            ${input('saga.name', 'Saga name', context.saga?.name)}
            ${select('spaceContext', 'Space', 'Physical, mixed or Hyperspace')} ${select('tone', 'Tone')}
            ${input('factionContext', 'Factions', context.factionContext, 'Foundation confederations that drive it, e.g. nova,zenith')}
            ${input('characterContext', 'Character naming pools', context.characterContext)}
            ${select('culturalExposure', 'Cultural exposure')}
            ${input('reuse', 'Definitions to reuse', (context.reuse ?? []).join(', '), 'Foundation or saga ids, comma-separated')}
            ${input('sagas', 'Related sagas', (context.sagas ?? []).join(', '), 'Sagas whose definitions it may reuse')}
          </div>
          <label class="studio-form-field"
            ><span>Description</span
            ><textarea data-context="saga.description" ${disabled}>
${escapeHtml(context.saga?.description ?? '')}</textarea>
          </label>
          <label class="studio-form-field"
            ><span>Premise</span
            ><textarea data-context="prompt" ${disabled}>${escapeHtml(context.prompt ?? '')}</textarea
            ><span class="studio-form-hint">Empty: the generator synthesizes a premise from the lore.</span></label
          >
          <label class="studio-form-field"
            ><span>Lore and source material</span
            ><textarea data-context="lore" ${disabled}>${escapeHtml(context.lore ?? '')}</textarea
            ><span class="studio-form-hint">Empty: the world foundation is the lore.</span></label
          >
          <details>
            <summary>Model settings</summary>
            <div class="studio-form-grid">
              ${input('model', 'Gemini model', context.model, 'Empty: the generator default')}
              ${select('thinkingLevel', 'Thinking level', 'Each model takes some of these levels; a level it refuses fails the generation at once')}
              ${input('temperature', 'Temperature', context.temperature ?? '', '0.0 to 2.0; empty: the generator default')}
            </div>
          </details>
          <div class="studio-form-row" style="margin-top: 6px;">
            <button type="button" class="studio-form-button saga-engine-context-save" ${disabled}>
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save context
            </button>
            <button
              type="button"
              class="studio-form-button saga-engine-generate"
              ${disabled || (active ? 'disabled' : '')}
            >
              <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Generate a new candidate
            </button>
            <span class="studio-form-hint">A generation adds a revision; it never replaces one you edited.</span>
          </div>`,
      )}
      ${group(
        'Generations',
        'fa-solid fa-gears',
        workflow.generations.length === 0
          ? html`<div class="studio-form-hint">No generation yet.</div>`
          : [...workflow.generations]
              .reverse()
              .map((generation) => SagaEngineCyberia.generationHtml(generation))
              .join(''),
      )}`,
    );
    if (s('.saga-engine-context-save')) s('.saga-engine-context-save').onclick = () => SagaEngineCyberia.saveContext();
    if (s('.saga-engine-generate')) s('.saga-engine-generate').onclick = () => SagaEngineCyberia.generate();
    for (const button of document.querySelectorAll('.saga-engine-generation-action'))
      button.onclick = () => SagaEngineCyberia.generationAction(button.dataset.action, Number(button.dataset.attempt));
    for (const details of document.querySelectorAll('.saga-engine-results'))
      details.ontoggle = () => details.open && SagaEngineCyberia.loadResults(details, Number(details.dataset.attempt));
  }

  static generationHtml(generation) {
    const { canMutate } = SagaEngineCyberia;
    const active = ['queued', 'running'].includes(generation.status);
    const steps =
      generation.steps.length > 0 ? generation.steps : [{ id: 'theme', status: 'queued', attempts: 0, log: [] }];
    const button = (action, icon, label) =>
      canMutate
        ? html`<button
            type="button"
            class="studio-form-button saga-engine-generation-action"
            data-action="${action}"
            data-attempt="${generation.attempt}"
          >
            <i class="${icon}" aria-hidden="true"></i> ${label}
          </button>`
        : '';
    return html`<div class="studio-form-card">
      <div class="saga-engine-chips">
        <strong>Generation ${generation.attempt}</strong>
        <span class="studio-form-chip ${generation.status === 'failed' ? 'studio-form-bad' : ''}"
          >${escapeHtml(generation.status)}</span
        >
        ${generation.candidate ? html`<span class="studio-form-chip">revision ${generation.candidate}</span>` : ''}
        <span class="studio-form-hint">${escapeHtml(when(generation.createdAt))}</span>
        ${active ? button('cancel', 'fa-solid fa-stop', 'Cancel') : ''}
        ${
          generation.status === 'cancelled' || (generation.status === 'failed' && generation.error?.retryable)
            ? button('retry', 'fa-solid fa-rotate-right', 'Resume')
            : ''
        }
      </div>
      ${generation.error?.message ? html`<div class="studio-form-dirty" role="alert">${escapeHtml(generation.error.message)}</div>` : ''}
      ${generation.cancelRequestedAt && active ? html`<div class="studio-form-hint">Cancel requested: the running step stops.</div>` : ''}
      <div class="saga-engine-steps">
        ${steps
          .map(
            (step) =>
              html`<details class="saga-engine-step" data-status="${step.status}">
                <summary>
                  <i class="${STEP_STATES[step.status]}" aria-hidden="true"></i> ${escapeHtml(step.id)}
                  ${step.attempts > 1 ? html`<span class="studio-form-hint">× ${step.attempts}</span>` : ''}
                </summary>
                ${step.error ? html`<div class="studio-form-hint">${escapeHtml(step.error)}</div>` : ''}
                ${step.log?.length ? html`<pre>${escapeHtml(step.log.join('\n'))}</pre>` : ''}
              </details>`,
          )
          .join('')}
      </div>
      <div class="studio-form-hint">
        Content ${escapeHtml(generation.provenance?.contentVersion || '—')} · artifact
        ${escapeHtml(shortRevision(generation.provenance?.artifactRevision))} · checkout
        ${escapeHtml(shortRevision(generation.provenance?.checkoutRevision))} · model
        ${escapeHtml(generation.provenance?.model || 'default')}
      </div>
      <details class="saga-engine-results" data-attempt="${generation.attempt}">
        <summary>Request and stage results</summary>
        <pre class="saga-engine-log">Loading…</pre>
      </details>
    </div>`;
  }

  /** Reads the frozen request and the stage results of a generation into its details. */
  static async loadResults(details, attempt) {
    const { status, data, message } = await CyberiaSagaWorkflowService.getGeneration({
      id: SagaEngineCyberia.workflow._id,
      attempt,
    });
    const definitions = data?.state?.raw?.definitions ?? [];
    details.querySelector('.saga-engine-log').textContent =
      status !== 'success'
        ? message
        : JSON.stringify(
            {
              request: data.request,
              done: data.state.done,
              theme: data.state.theme,
              definitions: definitions.map((definition) => definition.id),
              findings: data.state.findings ?? [],
            },
            null,
            2,
          );
  }

  /** The context fields the form holds. */
  static readContext() {
    const context = { saga: {} };
    for (const field of document.querySelectorAll(
      '.saga-engine-context [data-context], .saga-engine-context [data-block="context"]',
    )) {
      const key = field.dataset.context ?? field.dataset.key;
      const value = field.value.trim();
      if (key.startsWith('saga.')) context.saga[key.slice('saga.'.length)] = value;
      else if (key === 'reuse' || key === 'sagas') context[key] = list(value);
      else if (key === 'temperature') context.temperature = value === '' ? null : Number(value);
      else context[key] = value;
    }
    return context;
  }

  static async saveContext() {
    const { status, data, message } = await CyberiaSagaWorkflowService.setContext({
      id: SagaEngineCyberia.workflow._id,
      body: SagaEngineCyberia.readContext(),
    });
    if (status !== 'success') return notify(message, 'error');
    notify('Narrative context saved');
    await SagaEngineCyberia.changed(data);
  }

  static async generate() {
    const { status, data, message } = await CyberiaSagaWorkflowService.generate({
      id: SagaEngineCyberia.workflow._id,
      body: { context: SagaEngineCyberia.readContext() },
    });
    if (status !== 'success') return notify(message, 'error');
    notify('Generation queued: it runs in the background, also with this page closed');
    await SagaEngineCyberia.changed(data);
  }

  static async generationAction(action, attempt) {
    const run =
      action === 'cancel' ? CyberiaSagaWorkflowService.cancelGeneration : CyberiaSagaWorkflowService.retryGeneration;
    const { status, data, message } = await run({ id: SagaEngineCyberia.workflow._id, attempt });
    if (status !== 'success') return notify(message, 'error');
    await SagaEngineCyberia.changed(data);
  }

  /** Reads the workflow again while one of its generations waits or runs, and while the view is open. */
  static watch() {
    clearTimeout(SagaEngineCyberia.timer);
    const active = SagaEngineCyberia.workflow?.generations.some(({ status }) => ['queued', 'running'].includes(status));
    if (!active) return;
    const id = SagaEngineCyberia.workflow._id;
    SagaEngineCyberia.timer = setTimeout(async () => {
      if (!s('.saga-engine') || SagaEngineCyberia.workflow?._id !== id) return;
      const { status, data } = await CyberiaSagaWorkflowService.get({ id }).catch(() => ({}));
      if (status !== 'success' || SagaEngineCyberia.workflow?._id !== id) return SagaEngineCyberia.watch();
      const before = SagaEngineCyberia.workflow.candidates.length;
      await SagaEngineCyberia.changed(data);
      if (data.candidates.length > before) {
        notify(`Generation done: revision ${data.candidates.at(-1).revision} is in the package editor`);
        if (!SagaPackage.dirty()) SagaPackage.load({ ...data.candidates.at(-1), package: data.package });
      }
    }, POLL_MS);
  }

  static paintPackage() {
    SagaPackage.unmount();
    const { workflow } = SagaEngineCyberia;
    if (!workflow) {
      htmls('.saga-engine-package', html`<div class="saga-engine-empty">Select or start a saga.</div>`);
      return;
    }
    htmls('.saga-engine-package', SagaPackage.render());
    SagaPackage.mount({
      workflow,
      canMutate: SagaEngineCyberia.canMutate,
      onChanged: (view) => SagaEngineCyberia.changed(view),
    });
  }

  /** Reads the report of the shown candidate, or of the saga of the artifact. */
  static async loadReport() {
    const { workflow, sagaCode } = SagaEngineCyberia;
    if (!workflow && !sagaCode) return;
    const slot = s('.saga-engine-completeness');
    if (slot) slot.innerHTML = html`<div class="saga-engine-empty" role="status">Reading the report…</div>`;
    const result = workflow
      ? await CyberiaSagaWorkflowService.report({ id: workflow._id })
      : await CyberiaSagaService.report({ code: sagaCode });
    if (result.status !== 'success') {
      if (slot) slot.innerHTML = html`<div class="studio-form-dirty" role="alert">${escapeHtml(result.message)}</div>`;
      return;
    }
    SagaEngineCyberia.report = result.data;
    SagaEngineCyberia.paintReport();
    SagaEngineCyberia.paintGraphs();
    SagaEngineCyberia.paintAudit();
  }

  static paintReport() {
    const slot = s('.saga-engine-completeness');
    if (!slot) return;
    const { report, workflow, sagaCode, canMutate } = SagaEngineCyberia;
    if (!workflow && !sagaCode) {
      slot.innerHTML = html`<div class="saga-engine-empty">Select or start a saga.</div>`;
      return;
    }
    if (!report) {
      slot.innerHTML = html`<div class="saga-engine-empty">
        <button type="button" class="studio-form-button saga-engine-report-load">
          <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Read the completeness report
        </button>
      </div>`;
      s('.saga-engine-report-load').onclick = () => SagaEngineCyberia.loadReport();
      return;
    }
    slot.innerHTML = html`<div class="studio-form-row" style="margin-bottom: 6px;">
        <span class="studio-form-hint" style="flex: 1 1 14rem;">
          ${
            report.source.kind === 'candidate'
              ? `Revision ${report.source.revision} of the workflow against what this host stores`
              : 'The saga of the served artifact against what this host stores'
          }
        </span>
        <button type="button" class="studio-form-button saga-engine-report-refresh">
          <i class="fa-solid fa-rotate" aria-hidden="true"></i> Read again
        </button>
      </div>
      <div class="saga-engine-report-body"></div>`;
    s('.saga-engine-report-refresh').onclick = () => SagaEngineCyberia.loadReport();
    const params = {
      id: 'completeness',
      report: { ...report, rows: report.rows.filter((row) => row.category !== 'release') },
      filter: { level: SagaEngineCyberia.reportFilter },
      canExclude: canMutate && Boolean(workflow),
      onLink: (link) => SagaEngineCyberia.follow(link),
      onExclude: (row) => SagaEngineCyberia.exclude(row),
      onInclude: (row) => SagaEngineCyberia.exclude(row, ''),
      onFilter: (level) => {
        SagaEngineCyberia.reportFilter = level;
        SagaEngineCyberia.paintReport();
      },
    };
    SagaReport.paint(s('.saga-engine-report-body'), params);
  }

  /** The narrative and the content graphs of the report. */
  static paintGraphs() {
    const slot = s('.saga-engine-graphs');
    if (!slot) return;
    const { report, workflow, sagaCode } = SagaEngineCyberia;
    if (!workflow && !sagaCode) {
      slot.innerHTML = html`<div class="saga-engine-empty">Select or start a saga.</div>`;
      return;
    }
    if (!report) {
      slot.innerHTML = html`<button type="button" class="studio-form-button saga-engine-graphs-load">
        <i class="fa-solid fa-circle-nodes" aria-hidden="true"></i> Read the relationships
      </button>`;
      s('.saga-engine-graphs-load').onclick = () => SagaEngineCyberia.loadReport();
      return;
    }
    SagaGraph.paint(slot, {
      id: 'saga-engine',
      graphs: report.graphs,
      onLink: (link) => SagaEngineCyberia.follow(link),
    });
  }

  /** The synchronization panel of the saga, once the saga is stored. */
  static async paintIntegration() {
    const slot = s('.saga-engine-integration');
    if (!slot) return;
    SagaSync.unmount(SYNC_PANEL);
    const code = SagaEngineCyberia.workflow?.sagaCode || SagaEngineCyberia.sagaCode;
    if (!code) {
      slot.innerHTML = html`<div class="saga-engine-empty">Select or start a saga.</div>`;
      return;
    }
    const { status, data } = await CyberiaSagaService.get({
      filterModel: { code: { filterType: 'text', type: 'equals', filter: code } },
      limit: 1,
    }).catch(() => ({}));
    const saga = status === 'success' ? data.data[0] : null;
    if (!saga) {
      slot.innerHTML = html`<div class="saga-engine-empty">
        Saga ${escapeHtml(code)} is not stored on this host yet. Apply its package, then build and import the content:
        the synchronization places stored quests and actions only.
      </div>`;
      return;
    }
    slot.innerHTML = await SagaSync.render({
      id: SYNC_PANEL,
      canMutate: SagaEngineCyberia.canMutate,
      saga,
      onOpen: (kind, key) => StudioCyberia.open('cyberia-action-engine', { [`${kind}Code`]: key }),
      onSynced: async () => {
        SagaEngineCyberia.report = null;
        SagaEngineCyberia.paintReport();
      },
    });
    await SagaSync.mount(SYNC_PANEL);
  }

  /** The final audit: the gates, the release rows, the provenance and the history. */
  static paintAudit() {
    const slot = s('.saga-engine-audit');
    if (!slot) return;
    const { workflow, report, sagaCode } = SagaEngineCyberia;
    if (!workflow && !sagaCode) {
      slot.innerHTML = html`<div class="saga-engine-empty">Select or start a saga.</div>`;
      return;
    }
    const latest = workflow?.generations.at(-1);
    slot.innerHTML = html`${group(
      'Release readiness',
      'fa-solid fa-clipboard-check',
      report
        ? html`<div class="saga-engine-audit-report"></div>`
        : html`<button type="button" class="studio-form-button saga-engine-audit-load">
            <i class="fa-solid fa-diagram-project" aria-hidden="true"></i> Read the report
          </button>`,
    )}
    ${
      workflow
        ? group(
            'Provenance',
            'fa-solid fa-fingerprint',
            html`<div class="studio-form-grid">
                <div class="studio-form-field">
                  <span>Opened from</span
                  ><span class="studio-form-mono"
                    >${escapeHtml(workflow.base?.source ?? 'new')}
                    ${escapeHtml(shortRevision(workflow.base?.checkoutRevision))}</span
                  >
                </div>
                <div class="studio-form-field">
                  <span>Newest revision</span
                  ><span class="studio-form-mono"
                    >${escapeHtml(String(workflow.latest?.revision ?? '—'))}
                    ${escapeHtml(workflow.latest?.digest?.slice(0, 19) ?? '')}</span
                  >
                </div>
                <div class="studio-form-field">
                  <span>Last check</span
                  ><span class="studio-form-mono"
                    >${workflow.validation ? `revision ${workflow.validation.revision}: ${workflow.validation.ok ? 'passes' : `${workflow.validation.findings.length} findings`}` : '—'}</span
                  >
                </div>
                <div class="studio-form-field">
                  <span>Applied</span
                  ><span class="studio-form-mono"
                    >${workflow.applied ? `revision ${workflow.applied.revision} at ${escapeHtml(when(workflow.applied.at))}` : '—'}</span
                  >
                </div>
                <div class="studio-form-field">
                  <span>Newest generation</span
                  ><span class="studio-form-mono"
                    >${latest ? `${latest.attempt}: ${escapeHtml(latest.status)} · content ${escapeHtml(latest.provenance?.contentVersion || '—')}` : '—'}</span
                  >
                </div>
                <div class="studio-form-field">
                  <span>Exclusions</span><span class="studio-form-mono">${workflow.exclusions.length}</span>
                </div>
              </div>
              <div class="studio-form-hint">
                The Saga Engine never commits, builds, imports, releases or deploys. The release rows name the step and
                its command; the content release pipeline stays the only way content reaches production.
              </div>`,
          )
        : ''
    }
    ${
      workflow
        ? group(
            'History',
            'fa-solid fa-clock-rotate-left',
            html`<div class="saga-engine-log">
              ${workflow.history
                .map(
                  (entry) =>
                    `${escapeHtml(when(entry.at))} · ${escapeHtml(entry.action)} · ${escapeHtml(entry.actor)} · ${escapeHtml(entry.detail)}`,
                )
                .join('<br />')}
            </div>`,
          )
        : ''
    }`;
    if (s('.saga-engine-audit-load')) s('.saga-engine-audit-load').onclick = () => SagaEngineCyberia.loadReport();
    if (report)
      SagaReport.paint(s('.saga-engine-audit-report'), {
        id: 'audit',
        report: { ...report, rows: report.rows.filter((row) => row.category === 'release' || row.level === 'error') },
        filter: { level: 'all' },
        canExclude: false,
        onLink: (link) => SagaEngineCyberia.follow(link),
      });
  }

  static async exclude(row, reason = null) {
    if (reason === null) {
      const answer = await Modal.RenderConfirm({
        id: 'saga-engine-exclude',
        confirmLabel: 'Exclude',
        html: async () =>
          html`<div class="in section-mp">
            <p>Leave <span class="studio-form-mono">${escapeHtml(row.subject)}</span> out of this saga on purpose?</p>
            <label class="studio-form-field"
              ><span>Reason</span
              ><input class="saga-engine-exclude-reason" placeholder="Why it is not part of this saga"
            /></label>
          </div>`,
      });
      if (answer.status !== 'confirm') return;
      reason = s('.saga-engine-exclude-reason')?.value.trim() ?? '';
      if (!reason) return notify('An exclusion needs a reason.', 'warning');
    }
    const { status, data, message } = await CyberiaSagaWorkflowService.exclude({
      id: SagaEngineCyberia.workflow._id,
      key: row.key,
      reason,
    });
    if (status !== 'success') return notify(message, 'error');
    await SagaEngineCyberia.changed(data);
    await SagaEngineCyberia.loadReport();
  }

  /** Opens the editor a report link names, or starts the procedural work it asks for. */
  static async follow(link) {
    const select = (tab) => Tabs.select(s(`.${TABS}`), tab);
    if (link.view === 'package') {
      select('package');
      if (link.definition) SagaPackage.focusDefinition(link.definition);
      else if (link.path) SagaPackage.focus(link.path);
      return;
    }
    if (link.view === 'integration') return select('integration');
    if (link.view === 'release') return select('audit');
    if (link.view === 'procedural') return await SagaEngineCyberia.delegate(link);
    const route = EDITORS[link.view];
    if (!route) return;
    const params = Object.fromEntries(
      ['questCode', 'actionCode', 'dialogueCode', 'economyCode', 'marketCode', 'mapCode']
        .filter((key) => link[key])
        .map((key) => [key, link[key]]),
    );
    if (!StudioCyberia.open(route, params)) notify('This host does not offer that editor.', 'warning');
  }

  /** Hands work to the Procedural Engine: an open population or job, or a new one through its own API. */
  static async delegate(link) {
    const confirm = (text, confirmLabel) =>
      Modal.RenderConfirm({
        id: 'saga-engine-delegate',
        confirmLabel,
        html: async () => html`<div class="in section-mp" style="text-align: center">${text}</div>`,
      }).then(({ status }) => status === 'confirm');
    if (link.action === 'generate-item') {
      if (
        !(await confirm(
          `Generate two variants of ${escapeHtml(link.itemId)} in the Procedural Engine? Each one waits for your review there;
          nothing replaces its binding until you promote one.`,
          'Generate',
        ))
      )
        return;
      const { status, data, message } = await CyberiaProceduralJobService.post({
        body: { mode: 'update-existing', source: { itemIds: [link.itemId] }, output: { variantsPerItem: 2 } },
      });
      if (status !== 'success') return notify(message, 'error');
      return ProceduralEngineCyberia.open({ jobId: data._id });
    }
    if (link.action === 'start-population') {
      if (
        !(await confirm(
          `Start a map population of ${escapeHtml(link.mapCode)} in the Procedural Engine? It drafts the items, the entity
          defaults and the placements; the live map changes only when you publish it there.`,
          'Start',
        ))
      )
        return;
      const { status, data, message } = await CyberiaProceduralPopulationService.post({
        body: { mapCode: link.mapCode, seed: { mode: 'auto' } },
      });
      if (status !== 'success') return notify(message, 'error');
      return ProceduralEngineCyberia.open({ populationId: data._id });
    }
    ProceduralEngineCyberia.open({
      jobId: link.jobId,
      populationId: link.populationId,
      ...(link.populationId && link.itemId && { step: 'items', itemId: link.itemId }),
    });
  }
}

export { SagaEngineCyberia };
