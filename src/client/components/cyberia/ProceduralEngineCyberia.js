/**
 * The Procedural Engine view of the Cyberia Studio: it orchestrates generation and review, and
 * computes nothing. It holds two workflows. Map Population ({@link ProceduralPopulation}) prepares
 * the items of one map, their runtime defaults and the map, then publishes them. Item Generation
 * works on items: in Update it mutates existing Cyberia items, each target keeps its item id and
 * gets candidate revisions; in Create it starts from a Genesis Template and proposes new items.
 * Either starts a persistent job on the server, which runs without this page. The moderator then
 * reviews each candidate, finishes it in the Object Layer Studio, approves it and promotes it.
 * Every mode, palette and template this view offers comes from the server configuration; every
 * generation, validation and diversity decision is the server's. Every role sees the same view.
 * Only a moderator reads the runs and changes them; another role who tries a change gets a
 * permission notification.
 *
 * @module src/client/components/cyberia/ProceduralEngineCyberia.js
 */
import { BtnIcon } from '../core/BtnIcon.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { DropDown } from '../core/DropDown.js';
import { Input } from '../core/Input.js';
import { Modal } from '../core/Modal.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from '../core/Router.js';
import { Tabs } from '../core/Tabs.js';
import { htmls, s } from '../core/VanillaJs.js';
import { ObjectLayerEngineElement } from '../objectlayer-studio/ObjectLayerEngine.js';
import {
  OBJECT_LAYER_DIRECTION_CODES,
  OBJECT_LAYER_DIRECTION_LABELS,
} from '../objectlayer-studio/ObjectLayerProtocol.js';
import { framesByDirection, fromWire } from '../objectlayer-studio/RenderSource.js';
import { ProceduralGrid } from './ProceduralGridCyberia.js';
import { ProceduralPalette, swatches } from './ProceduralPaletteCyberia.js';
import { ProceduralPopulation } from './ProceduralPopulationCyberia.js';
import {
  ACTIVE,
  ITEM_STATUS,
  actionsColumn,
  candidateColumns,
  column,
  decide,
  denied,
  element,
  frameSummary,
  notify,
  observe,
  readPage,
  refusal,
  shortCid,
  showCandidate,
  stamp,
} from './ProceduralReviewCyberia.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';
import { CyberiaProceduralProfileService } from '../../services/cyberia-procedural-profile/cyberia-procedural-profile.service.js';

const ROUTE = 'cyberia-procedural-engine';
/** Pixels per cell of a template preview. */
const PREVIEW_SCALE = 6;
const POLL_MS = 3000;
const SOURCES_GRID = 'procedural-sources-grid';
const JOBS_GRID = 'procedural-jobs-grid';
const ITEMS_GRID = 'procedural-items-grid';
const MODES = Object.freeze({
  'update-existing': {
    label: 'UPDATE / MUTATE EXISTING CYBERIA CONTENT',
    short: 'Update',
    help: [
      'Preserve existing itemId and semantic content.',
      'Generate candidate revisions from the art direction of Cyberia Content and a Genesis Template.',
    ],
  },
  'create-new': {
    label: 'CREATE NEW ITEM FROM TEMPLATE',
    short: 'Create',
    help: [
      'Create a new runtime item from a Genesis Template and a palette.',
      'No existing item is required: the new item takes its function from the content baseline.',
    ],
  },
});
const TABS = 'procedural-engine-tabs';
const WORKFLOWS = Object.freeze(['map', 'items']);
const value = (name) => s(`.procedural-input-${name}`)?.value.trim() ?? '';
const picked = (id) => {
  const chosen = DropDown.Tokens[id]?.value;
  return typeof chosen === 'string' ? chosen.trim() : '';
};
const setPicked = (id, chosen) => {
  if (!DropDown.Tokens[id]) return;
  DropDown.Tokens[id].value = chosen;
  if (s(`.${id}`)) s(`.${id}`).value = chosen ?? '';
  htmls(`.dropdown-current-${id}`, chosen ? (DropDown.Tokens[id].labels?.[chosen] ?? chosen) : '');
};
const show = (selector, on) => {
  if (s(selector)) s(selector).style.display = on ? '' : 'none';
};

class ProceduralEngineCyberia {
  static jobId = '';
  static timer = null;
  static canMutate = false;
  static config = null;
  static mode = '';
  static itemType = '';
  static job = null;
  static seen = null;
  /** The candidate the detail panel shows. */
  static shownId = '';
  /** Genesis Template id → the preview of each direction of its base item: `{ label, url }`. */
  static previews = {};

  /**
   * Opens the view, on a job or a map population when one is given, on a step and an item of it.
   * From the Object Layer Studio, the Map Studio and the Entity Studio this is the way back: a
   * population already open keeps its selections.
   * @param {{jobId?: string, populationId?: string, step?: string, itemId?: string}} [params]
   * @returns {boolean} Whether the host offers the view.
   */
  static open({ jobId, populationId, step, itemId } = {}) {
    const entry = s(`.main-btn-${ROUTE}`);
    if (!entry) return false;
    setPath(`${getProxyPath()}${ROUTE}`);
    setQueryParams(
      {
        cid: null,
        review: null,
        id: null,
        mapCode: null,
        job: jobId ?? null,
        population: populationId ?? null,
        ...(populationId && { workflow: 'map', step: step ?? null, item: itemId ?? null }),
      },
      { replace: true },
    );
    if (s('.procedural-engine') && ProceduralEngineCyberia.config) {
      if (populationId) {
        Tabs.select(s(`.${TABS}`), 'map');
        if (ProceduralPopulation.population?._id === populationId) ProceduralPopulation.resume(step, itemId);
        else ProceduralPopulation.select(populationId, { step, itemId });
      } else ProceduralEngineCyberia.route(jobId ?? '');
    }
    entry.click();
    return true;
  }

  /** Shows the workflow of a job: the map population of a stage job, else the item generation on it. */
  static async route(jobId) {
    const job =
      jobId && ProceduralEngineCyberia.canMutate ? await CyberiaProceduralJobService.get({ id: jobId }) : null;
    const populationId = job?.status === 'success' ? job.data.populationId : null;
    if (populationId) {
      setQueryParams({ job: null, workflow: 'map' }, { replace: true });
      Tabs.select(s(`.${TABS}`), 'map');
      return await ProceduralPopulation.select(populationId);
    }
    if (jobId) {
      setQueryParams({ workflow: 'items' }, { replace: true });
      Tabs.select(s(`.${TABS}`), 'items');
    }
    return await ProceduralEngineCyberia.select(jobId);
  }

  static async render({ appStore }) {
    Object.assign(ProceduralEngineCyberia, {
      canMutate: commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest'),
      jobId: '',
      mode: '',
      seen: null,
      job: null,
    });
    const configured = await CyberiaProceduralProfileService.getConfig();
    const config = configured.status === 'success' ? configured.data : null;
    Object.assign(ProceduralEngineCyberia, { config, itemType: config?.generators[0]?.itemType ?? '' });
    if (config) await ProceduralEngineCyberia.loadPreviews();
    const group = (title, icon, inner) =>
      html`<div class="in studio-group">
        <div class="in studio-group-title"><i class="${icon}"></i> ${title}</div>
        ${inner}
      </div>`;
    if (!config)
      return html`<div class="in section-mp studio-editor procedural-engine">
        ${group(
          'Procedural generation',
          'fa-solid fa-triangle-exclamation',
          html`<div class="in procedural-access">The engine configuration is not available.</div>`,
        )}
      </div>`;
    setTimeout(() => ProceduralEngineCyberia.mount());
    const query = getQueryParams();
    const workflow = WORKFLOWS.includes(query.workflow) ? query.workflow : query.job ? 'items' : 'map';

    const { dropdown } = ProceduralEngineCyberia;
    const field = async (name, label, extra) =>
      html`<div class="in" style="margin-bottom: 8px;">
        ${await Input.instance({
          id: `procedural-input-${name}`,
          label: html`${label}`,
          containerClass: 'inl',
          ...extra,
        })}
      </div>`;
    const button = (action, icon, label) =>
      BtnIcon.instance({
        class: `procedural-btn-${action}`,
        label: html`<i class="${icon}"></i> ${label}`,
        style: 'min-width: 6rem;',
      });

    return html`<div class="in section-mp studio-editor procedural-engine">
      <style>
        .procedural-engine .procedural-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .procedural-engine .procedural-chip {
          padding: 2px 8px;
          font-size: 12px;
          border: 1px solid var(--studio-subtle-border);
        }
        .procedural-engine .procedural-chip[data-count='0'] {
          opacity: 0.45;
        }
        .procedural-engine .procedural-muted {
          opacity: 0.7;
          font-size: 12px;
        }
        .procedural-engine .procedural-bad {
          color: var(--studio-accent-warm);
        }
        .procedural-engine .procedural-good {
          color: var(--studio-positive);
        }
        .procedural-engine .procedural-preview {
          width: 64px;
          height: 64px;
          object-fit: contain;
          image-rendering: pixelated;
        }
        .procedural-engine .procedural-template-option {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .procedural-engine .procedural-template-thumb {
          width: 32px;
          height: 32px;
          image-rendering: pixelated;
          border: 1px solid var(--studio-subtle-border);
        }
        .procedural-engine .procedural-template-preview {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .procedural-engine .procedural-template-view {
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }
        .procedural-engine .procedural-template-view img {
          width: 150px;
          height: 150px;
          image-rendering: pixelated;
          border: 1px solid var(--studio-subtle-border);
        }
        .procedural-engine .procedural-template-facts {
          flex: 1;
          min-width: 200px;
          font-size: 12px;
          line-height: 1.6;
        }
        .procedural-engine .procedural-preview-large {
          width: 160px;
          height: 160px;
          object-fit: contain;
          image-rendering: pixelated;
        }
        .procedural-engine .procedural-cell-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 6px 0;
          line-height: normal;
        }
        .procedural-engine .procedural-cell-actions button {
          padding: 3px 8px;
          font-size: 12px;
          line-height: 1.4;
          white-space: nowrap;
          cursor: pointer;
        }
        .procedural-engine .procedural-cell-actions button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .procedural-engine .procedural-cell-text {
          display: block;
          padding: 6px 0;
          line-height: 1.4;
          white-space: normal;
        }
        .procedural-engine .procedural-pager {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 6px;
        }
        .procedural-engine .procedural-candidate {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-start;
        }
        .procedural-engine .procedural-candidate-view {
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }
        .procedural-engine .procedural-candidate-facts {
          flex: 1;
          min-width: 200px;
          font-size: 13px;
          line-height: 1.6;
        }
        .procedural-engine .procedural-state {
          display: inline-block;
          padding: 1px 8px;
          border-radius: 10px;
          font-size: 12px;
          border: 1px solid var(--studio-subtle-border);
          white-space: nowrap;
        }
        .procedural-engine .procedural-state-good {
          color: var(--studio-positive);
          border-color: var(--studio-positive);
        }
        .procedural-engine .procedural-state-live {
          background: var(--studio-positive);
          border-color: var(--studio-positive);
          color: var(--studio-card, #fff);
        }
        .procedural-engine .procedural-state-bad {
          color: var(--studio-accent-warm);
          border-color: var(--studio-accent-warm);
        }
        .procedural-engine .procedural-state-pending {
          color: var(--studio-accent);
          border-color: var(--studio-accent);
        }
        .procedural-engine .procedural-state-draft {
          border-style: dashed;
        }
        .procedural-engine .procedural-state-muted {
          opacity: 0.6;
        }
      </style>
      ${Tabs.render({
        id: TABS,
        label: 'Procedural workflows',
        selected: workflow,
        tabs: [
          {
            id: 'map',
            label: 'Map Population',
            icon: 'fa-solid fa-map-location-dot',
            content: await ProceduralPopulation.render({ canMutate: ProceduralEngineCyberia.canMutate, config, group }),
          },
          {
            id: 'items',
            label: 'Item Generation',
            icon: 'fa-solid fa-wand-magic-sparkles',
            content: html`<div class="in procedural-items">
              ${group(
                'Generation mode',
                'fa-solid fa-code-branch',
                html`${await dropdown(
                    'procedural-mode',
                    'Mode',
                    Object.entries(MODES).map(([mode, { label }]) => ({
                      value: mode,
                      display: label,
                      data: mode,
                      onClick: () => ProceduralEngineCyberia.changeMode(mode),
                    })),
                    { disableSearchBox: true },
                  )}
                  <div class="in procedural-mode-help procedural-muted" style="margin-bottom: 8px;">
                    Select a generation mode to start.
                  </div>`,
              )}
              <div class="in procedural-panel-update" style="display: none;">
                ${group(
                  'Existing items to update',
                  'fa-solid fa-table-list',
                  html`${await ProceduralGrid.instance({
                      id: SOURCES_GRID,
                      height: '420px',
                      selectable: true,
                      rowId: ({ itemId }) => itemId,
                      columnDefs: ProceduralEngineCyberia.sourceColumns(),
                      fetch: (query) =>
                        ProceduralEngineCyberia.fetchPage(() => CyberiaProceduralJobService.getSources(query)),
                      onSelectionChanged: () => ProceduralEngineCyberia.selectionChanged(),
                    })}
                    <div class="in procedural-selection-info procedural-muted" style="margin: 6px 0;"></div>
                    <label class="in procedural-from-template" style="margin-bottom: 8px;">
                      <input type="checkbox" class="procedural-input-from-template" />
                      Rebuild from a Genesis Template: the candidates replace the current render. Off, they revise it.
                    </label>
                    ${await field('variants-update', 'Variants per item', {
                      type: 'number',
                      min: 1,
                      max: 200,
                      step: 1,
                      value: 3,
                    })}`,
                )}
              </div>
              <div class="in procedural-panel-create" style="display: none;">
                ${group(
                  'New item from a template',
                  'fa-solid fa-file-circle-plus',
                  html`${await dropdown(
                      'procedural-item-type',
                      'Item type',
                      [...new Set((config?.generators ?? []).map(({ itemType }) => itemType))].map((itemType) => ({
                        value: itemType,
                        display: itemType,
                        data: itemType,
                        onClick: () => ProceduralEngineCyberia.changeItemType(itemType),
                      })),
                      { value: ProceduralEngineCyberia.itemType, disableSearchBox: true },
                    )}
                    <div class="procedural-template-slot">${await ProceduralEngineCyberia.templateDropdown()}</div>
                    <div class="in procedural-template-preview"></div>
                    ${await field('variants-create', 'Variant count', {
                      type: 'number',
                      min: 1,
                      max: 200,
                      step: 1,
                      value: 4,
                    })}
                    ${await field('prefix', 'New item ID prefix', {
                      type: 'text',
                      placeholder: true,
                      value: `${ProceduralEngineCyberia.itemType}-generated`,
                    })}`,
                )}
              </div>
              <div class="in procedural-panel-shared" style="display: none;">
                ${group(
                  'Palette and variation',
                  'fa-solid fa-palette',
                  html`${ProceduralPalette.render(config)}
                  ${await field('variation', 'Variation', { type: 'number', min: 0, max: 1, step: 0.05, value: 0.5 })}`,
                )}
              </div>
              ${group(
                'Runs',
                'fa-solid fa-layer-group',
                html`<div class="fl" style="gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
                    ${await button('create', 'fa-solid fa-play', 'Generate')}
                    ${await button('cancel', 'fa-solid fa-ban', 'Cancel')}
                    ${await button('delete', 'fa-solid fa-trash', 'Delete')}
                    ${await button('reset', 'fa-solid fa-broom', 'Reset')}
                    ${await button('refresh', 'fa-solid fa-rotate', 'Refresh')}
                    ${await button('promote', 'fa-solid fa-cloud-arrow-up', 'Promote approved')}
                  </div>
                  ${await ProceduralGrid.instance({
                    id: JOBS_GRID,
                    height: '320px',
                    rowId: ({ _id }) => _id,
                    columnDefs: ProceduralEngineCyberia.jobColumns(),
                    fetch: (query) => ProceduralEngineCyberia.fetchPage(() => CyberiaProceduralJobService.get(query)),
                    onRowClicked: ({ _id }) => ProceduralEngineCyberia.select(_id),
                  })}`,
              )}
              ${group(
                'Progress',
                'fa-solid fa-bars-progress',
                html`<div class="in procedural-job-meta procedural-muted" style="margin-bottom: 6px;">
                    No run selected.
                  </div>
                  <div class="in procedural-chips procedural-progress"></div>`,
              )}
              ${group(
                'Candidates',
                'fa-solid fa-clipboard-check',
                html`${await ProceduralGrid.instance({
                    id: ITEMS_GRID,
                    height: '480px',
                    rowId: ({ _id }) => _id,
                    columnDefs: ProceduralEngineCyberia.itemColumns(),
                    fetch: (query) => ProceduralEngineCyberia.fetchCandidates(query),
                    onRowClicked: (item) => ProceduralEngineCyberia.showCandidate(item),
                  })}
                  <div class="in procedural-candidate" style="margin-top: 8px;"></div>`,
              )}
            </div>`,
          },
        ],
      })}
    </div>`;
  }

  /** A labeled dropdown; it keeps the label of each option, so a reset can show it again. */
  static async dropdown(id, label, data, extra = {}) {
    const rendered = await DropDown.instance({ id, label: html`${label}`, data, containerClass: 'inl', ...extra });
    DropDown.Tokens[id].labels = Object.fromEntries(data.map(({ value: key, display }) => [key, display]));
    return html`<div class="in" style="margin-bottom: 8px;">${rendered}</div>`;
  }

  /** A moderator read of a grid page; see {@link readPage}. */
  static fetchPage = (read) => readPage(ProceduralEngineCyberia.canMutate, read);

  /** The candidates of the selected run; they are compared with the last read to tell what changed. */
  static async fetchCandidates(query) {
    const { jobId, job } = ProceduralEngineCyberia;
    if (!jobId) return { data: [], total: 0 };
    const page = await ProceduralEngineCyberia.fetchPage(() =>
      CyberiaProceduralJobService.getItems({ jobId, ...query }),
    );
    if (page && job) ProceduralEngineCyberia.seen = observe(ProceduralEngineCyberia.seen, job, page.data);
    return page;
  }

  /** Draws the base item of each Genesis Template the server previews: every frame of every direction, in direction order. */
  static async loadPreviews() {
    for (const { url } of Object.values(ProceduralEngineCyberia.previews).flat()) URL.revokeObjectURL(url);
    ProceduralEngineCyberia.previews = Object.fromEntries(
      await Promise.all(
        ProceduralEngineCyberia.config.templates
          .filter(({ preview }) => preview)
          .map(async ({ id, preview }) => {
            const byCode = framesByDirection(fromWire(preview));
            return [
              id,
              await Promise.all(
                OBJECT_LAYER_DIRECTION_CODES.flatMap((code) =>
                  byCode[code].map(async (frame, index) => ({
                    label: `${OBJECT_LAYER_DIRECTION_LABELS[code]}${byCode[code].length > 1 ? ` ${index + 1}/${byCode[code].length}` : ''}`,
                    url: URL.createObjectURL(await ObjectLayerEngineElement.matrixToBlob(frame, PREVIEW_SCALE)),
                  })),
                ),
              ),
            ];
          }),
      ),
    );
  }

  /** The Genesis Templates of an item type that its generator can run. */
  static templatesOf(itemType) {
    return (ProceduralEngineCyberia.config?.templates ?? []).filter(
      (template) => template.itemType === itemType && template.problems.length === 0,
    );
  }

  /** The Genesis Template dropdown of the chosen item type: each template with its name, size and a thumbnail. */
  static async templateDropdown() {
    const templates = ProceduralEngineCyberia.templatesOf(ProceduralEngineCyberia.itemType);
    return await ProceduralEngineCyberia.dropdown(
      'procedural-template',
      'Genesis Template',
      templates.map(({ id, name, canvas }) => {
        const [front] = ProceduralEngineCyberia.previews[id] ?? [];
        return {
          value: id,
          display: `<span class="procedural-template-option">${front ? `<img class="procedural-template-thumb" src="${front.url}" alt="" />` : ''}${name}<span class="procedural-muted">${id} · ${canvas.width} × ${canvas.height}</span></span>`,
          data: id,
          onClick: () => ProceduralEngineCyberia.selectTemplate(),
        };
      }),
      { value: templates[0]?.id, disableSearchBox: true },
    );
  }

  /** The picked Genesis Template, only while it is one of the item type: a stale pick never counts. */
  static currentTemplate() {
    return (
      ProceduralEngineCyberia.templatesOf(ProceduralEngineCyberia.itemType).find(
        ({ id }) => id === picked('procedural-template'),
      ) ?? null
    );
  }

  /** A chosen template shows its base item and gives its color slots to the palette editor. */
  static selectTemplate() {
    ProceduralEngineCyberia.showTemplate();
    ProceduralEngineCyberia.syncPalette();
  }

  /** Shows the base item of the chosen Genesis Template, its roles, and the regions a generation keeps. */
  static showTemplate() {
    const panel = s('.procedural-template-preview');
    if (!panel) return;
    const template = ProceduralEngineCyberia.currentTemplate();
    panel.replaceChildren();
    if (!template) return panel.append(ProceduralEngineCyberia.noTemplate(ProceduralEngineCyberia.itemType));
    for (const { label, url } of ProceduralEngineCyberia.previews[template.id] ?? []) {
      const view = element('figure', 'procedural-template-view');
      view.append(Object.assign(element('img'), { src: url, alt: label }), element('figcaption', '', label));
      panel.append(view);
    }
    const words = (ids) => ids.map((id) => id.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ');
    const { profile } = ProceduralEngineCyberia.config.generators.find(
      ({ itemType }) => itemType === template.itemType,
    );
    const roles = Object.entries(template.roles);
    const facts = element('div', 'procedural-template-facts');
    facts.append(
      element(
        'div',
        '',
        `${template.name} · ${template.id} · ${template.canvas.width} × ${template.canvas.height} cells`,
      ),
      element('div', 'procedural-muted', template.description),
      element('div', '', `Roles: ${roles.map(([role, { regions }]) => `${role} (${words(regions)})`).join(', ')}`),
      element(
        'div',
        '',
        `Art direction colors: ${
          roles
            .filter(([, { artDirection }]) => artDirection)
            .map(([role]) => role)
            .join(', ') || 'none'
        }`,
      ),
      element('div', '', `Kept in shape: ${words(profile.protectedRegions) || 'none'}`),
      element(
        'div',
        '',
        `Frames: ${frameSummary(template.frames)} · baseline of a ${template.itemType}: ${frameSummary(template.baseline)}`,
      ),
      element(
        'div',
        'procedural-muted',
        'Each new item starts from this base item and the function of the content baseline. The palette colors it, the variation changes its shape and details, and you finish it in the Object Layer Studio.',
      ),
    );
    panel.append(facts);
  }

  /**
   * Why an item type has no template to run: the templates of the type the content holds with what
   * stops each, and whether the served content is behind the content checkout.
   */
  static noTemplate(itemType) {
    const { templates, content } = ProceduralEngineCyberia.config;
    const root = element('div', 'procedural-muted');
    const unusable = templates.filter((entry) => entry.itemType === itemType);
    root.append(
      element(
        'div',
        '',
        unusable.length > 0
          ? `No ${itemType} Genesis Template can run:`
          : `The served content holds no ${itemType} Genesis Template.`,
      ),
    );
    const list = element('ul');
    for (const { id, problems } of unusable)
      list.append(element('li', 'procedural-bad', `${id}: ${problems.join('; ')}`));
    if (unusable.length > 0) root.append(list);
    if (content?.stale)
      root.append(
        element(
          'div',
          '',
          `The served content is built from ${content.sourceRevision.slice(0, 7)}; the content checkout is at ${content.checkoutRevision.slice(0, 7)}. Build cyberia-content and release it to serve its latest templates.`,
        ),
      );
    return root;
  }

  static sourceColumns() {
    const text = { sortable: true, filter: 'agTextColumnFilter' };
    return [
      column('itemId', 'Item ID', { ...text, minWidth: 150 }),
      column('itemType', 'Type', text),
      column('artDirection', 'Art direction', { minWidth: 240, wrapText: true, autoHeight: true }),
      column('biome', 'Biome', { minWidth: 130, valueFormatter: ({ value: names }) => names.join(', ') }),
      column('palette', 'Palette', {
        minWidth: 130,
        cellRenderer: ({ value: colors }) => {
          const cell = element('span');
          cell.innerHTML = swatches(colors);
          return cell;
        },
      }),
      column('hasRender', 'Render', { sortable: true, valueFormatter: ({ value: has }) => (has ? 'yes' : 'no') }),
      column('currentCid', 'Current CID', {
        ...text,
        minWidth: 140,
        valueFormatter: ({ value: cid }) => shortCid(cid),
      }),
      column('updatedAt', 'Updated', {
        sortable: true,
        minWidth: 150,
        valueFormatter: ({ value: date }) => stamp(date),
      }),
    ];
  }

  static jobColumns() {
    const text = { sortable: true, filter: 'agTextColumnFilter' };
    const date = { sortable: true, minWidth: 150, valueFormatter: ({ value: at }) => stamp(at) };
    const settled = (job) =>
      ITEM_STATUS.reduce(
        (sum, status) => sum + (['queued', 'running'].includes(status) ? 0 : (job.counts?.[status] ?? 0)),
        0,
      );
    return [
      column('generationRunId', 'Run ID', { ...text, minWidth: 150 }),
      column('spec.mode', 'Mode', {
        ...text,
        valueFormatter: ({ value: mode }) => MODES[mode]?.short ?? mode,
      }),
      {
        headerName: 'Targets',
        minWidth: 80,
        valueGetter: ({ data }) =>
          data.spec.mode === 'update-existing' ? data.spec.sources.length : data.spec.candidates.length,
      },
      column('generatorId', 'Generator', text),
      column('proceduralProfileId', 'Profile', text),
      {
        headerName: 'Templates',
        minWidth: 130,
        valueGetter: ({ data }) => data.spec.templates.map(({ id }) => id).join(', '),
      },
      column('spec.variation.level', 'Variation', { sortable: true, filter: 'agNumberColumnFilter' }),
      {
        headerName: 'Progress',
        minWidth: 100,
        valueGetter: ({ data }) => `${settled(data)} / ${data.spec.candidates.length}`,
      },
      column('status', 'Status', text),
      column('createdAt', 'Created', date),
      column('updatedAt', 'Updated', date),
      actionsColumn(
        (job) => [
          ['open', true],
          ['cancel', ProceduralEngineCyberia.canCancel(job)],
          ['delete', true],
        ],
        (row, action) => ProceduralEngineCyberia.act(row, action),
      ),
    ];
  }

  static itemColumns() {
    return candidateColumns({
      jobOf: () => ProceduralEngineCyberia.job,
      act: (row, action) => ProceduralEngineCyberia.act(row, action),
    });
  }

  static canCancel(job) {
    return job.status !== 'cancelled' && ACTIVE.some((status) => (job.counts?.[status] ?? 0) > 0);
  }

  /**
   * Connects the rendered view: the workflow tabs, the buttons, the map population, and the first
   * read of the runs and of the job the URL names.
   */
  static async mount() {
    if (!s('.procedural-engine')) return;
    Tabs.bind(s(`.${TABS}`), { onChange: (workflow) => setQueryParams({ workflow }, { replace: true }) });
    const on = (action, handler) => {
      if (s(`.procedural-btn-${action}`)) s(`.procedural-btn-${action}`).onclick = handler;
    };
    on('create', () => ProceduralEngineCyberia.create());
    on('cancel', () => ProceduralEngineCyberia.cancel());
    on('delete', () => ProceduralEngineCyberia.remove());
    on('reset', () => ProceduralEngineCyberia.reset());
    on('refresh', () => ProceduralEngineCyberia.refresh());
    on('promote', () => ProceduralEngineCyberia.promote());
    s('.procedural-input-from-template').onchange = ({ target }) => ProceduralPalette.setFromTemplate(target.checked);
    await Promise.all([ProceduralPopulation.mount(), ProceduralEngineCyberia.route(getQueryParams().job ?? '')]);
  }

  /** Shows the controls of a mode and none of the other: the semantic of each mode comes first. */
  static changeMode(mode) {
    ProceduralEngineCyberia.mode = mode;
    const { label, help } = MODES[mode] ?? { label: '', help: ['Select a generation mode to start.'] };
    htmls('.procedural-mode-help', help.map((line) => `<div>${line}</div>`).join(''));
    show('.procedural-panel-update', mode === 'update-existing');
    show('.procedural-panel-create', mode === 'create-new');
    show('.procedural-panel-shared', Boolean(mode));
    ProceduralEngineCyberia.syncPalette();
    if (mode === 'update-existing') ProceduralGrid.load(SOURCES_GRID);
    if (mode) notify(`Mode: ${label}.`, 'info');
  }

  /**
   * Gives the palette panel what the run starts from: the chosen template of a create, the selected
   * items of an update.
   */
  static syncPalette() {
    const { mode } = ProceduralEngineCyberia;
    ProceduralPalette.setContext({
      mode,
      template: mode === 'create-new' ? ProceduralEngineCyberia.currentTemplate() : null,
    });
    if (mode === 'update-existing') ProceduralEngineCyberia.selectionChanged();
  }

  /** A new item type lists its own templates and palettes, and proposes ids of its own. */
  static async changeItemType(itemType) {
    ProceduralEngineCyberia.itemType = itemType;
    htmls('.procedural-template-slot', await ProceduralEngineCyberia.templateDropdown());
    setPicked('procedural-template', ProceduralEngineCyberia.templatesOf(itemType)[0]?.id);
    if (s('.procedural-input-prefix')) s('.procedural-input-prefix').value = `${itemType}-generated`;
    ProceduralEngineCyberia.selectTemplate();
  }

  /** The selected items, and a palette editor for each one. */
  static selectionChanged() {
    const rows = ProceduralGrid.selection(SOURCES_GRID);
    htmls('.procedural-selection-info', `${rows.length} item${rows.length === 1 ? '' : 's'} selected.`);
    ProceduralPalette.setItems(rows.map(({ itemId }) => itemId));
  }

  /** The request of the form for the chosen mode; null, after a warning, when the form is not valid. */
  static request() {
    const { mode, itemType } = ProceduralEngineCyberia;
    const warn = (text) => {
      notify(text, 'warning');
      return null;
    };
    if (!mode) return warn('Select a generation mode first.');
    const common = { mode, palette: ProceduralPalette.request(), variation: { level: Number(value('variation')) } };
    if (mode === 'update-existing') {
      const rows = ProceduralGrid.selection(SOURCES_GRID);
      if (rows.length === 0) return warn('Select at least one existing item.');
      const itemIds = rows.map(({ itemId }) => itemId);
      return {
        ...common,
        source: { itemIds, ...(ProceduralPalette.fromTemplate && { fromTemplate: itemIds }) },
        output: { variantsPerItem: Number(value('variants-update')) },
      };
    }
    const template = ProceduralEngineCyberia.currentTemplate();
    if (!template) return warn(`Select a ${itemType} Genesis Template.`);
    return {
      ...common,
      itemType,
      template: { id: template.id },
      output: { variants: Number(value('variants-create')), itemIdPrefix: value('prefix') },
    };
  }

  static async create() {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    const request = ProceduralEngineCyberia.request();
    if (!request) return;
    const response = await CyberiaProceduralJobService.post({ body: request });
    if (response.status !== 'success') return refusal(response);
    const run = response.data.generationRunId;
    notify(`Job ${run} created.`, 'success');
    if (response.data.status === 'queued') notify(`Job ${run} is queued. The server makes the candidates.`, 'info');
    await ProceduralEngineCyberia.select(response.data._id);
  }

  /** Selects a run and reads it. An empty id selects none. */
  static select(jobId) {
    const same = jobId === ProceduralEngineCyberia.jobId;
    Object.assign(ProceduralEngineCyberia, {
      jobId,
      seen: same ? ProceduralEngineCyberia.seen : null,
      shownId: same ? ProceduralEngineCyberia.shownId : '',
    });
    if (!same) ProceduralGrid.Tokens[ITEMS_GRID].page = 1;
    setQueryParams({ job: jobId || null }, { replace: true });
    return ProceduralEngineCyberia.refresh();
  }

  /** Clears the form and the view, whatever phase the run is in. The history of the server is not touched. */
  static async reset() {
    clearTimeout(ProceduralEngineCyberia.timer);
    const { config } = ProceduralEngineCyberia;
    setPicked('procedural-mode', undefined);
    ProceduralPalette.reset();
    setPicked('procedural-item-type', config.generators[0]?.itemType);
    await ProceduralEngineCyberia.changeItemType(config.generators[0]?.itemType ?? '');
    for (const [name, text] of Object.entries({
      'variants-update': 3,
      'variants-create': 4,
      variation: 0.5,
    }))
      if (s(`.procedural-input-${name}`)) s(`.procedural-input-${name}`).value = text;
    s('.procedural-input-from-template').checked = false;
    ProceduralEngineCyberia.changeMode('');
    Object.assign(ProceduralEngineCyberia, { jobId: '', seen: null, shownId: '', job: null });
    setQueryParams({ job: null }, { replace: true });
    await Promise.all([SOURCES_GRID, JOBS_GRID, ITEMS_GRID].map((id) => ProceduralGrid.reset(id)));
    ProceduralEngineCyberia.paint(null, []);
  }

  /** Reads the runs, and the selected run with its candidates, from the server; polls while work is active. */
  static async refresh() {
    clearTimeout(ProceduralEngineCyberia.timer);
    if (!s('.procedural-engine')) return;
    const { jobId } = ProceduralEngineCyberia;
    const [jobs, job] = await Promise.all([
      ProceduralGrid.load(JOBS_GRID),
      jobId ? CyberiaProceduralJobService.get({ id: jobId }) : null,
    ]);
    if (job && job.status !== 'success') return refusal(job);
    ProceduralEngineCyberia.job = job?.data ?? null;
    const items = await ProceduralGrid.load(ITEMS_GRID);
    ProceduralEngineCyberia.paint(job?.data ?? null, items ?? []);
    const busy = [job?.data, ...(jobs ?? [])].some((entry) => entry && ['queued', 'running'].includes(entry.status));
    if (busy) ProceduralEngineCyberia.timer = setTimeout(() => ProceduralEngineCyberia.refresh(), POLL_MS);
  }

  static paint(job, items) {
    const counts = job?.counts ?? {};
    htmls(
      '.procedural-job-meta',
      job
        ? `${job.generationRunId} · ${MODES[job.spec.mode].short} · ${job.generatorId} · ${job.proceduralProfileId} · seed ${job.rootSeed} · ${job.status}`
        : 'No run selected.',
    );
    s('.procedural-progress').replaceChildren(
      ...ITEM_STATUS.map((status) => {
        const chip = element('span', 'procedural-chip', `${status} ${counts[status] ?? 0}`);
        chip.dataset.count = counts[status] ?? 0;
        return chip;
      }),
    );
    const disable = (action, off) => {
      if (s(`.procedural-btn-${action}`)) s(`.procedural-btn-${action}`).disabled = off;
    };
    disable('cancel', !(job && ProceduralEngineCyberia.canCancel(job)));
    disable('delete', !job);
    disable('promote', !((counts.approved ?? 0) > 0));
    const shown = items.find(({ _id }) => _id === ProceduralEngineCyberia.shownId);
    if (job && shown) ProceduralEngineCyberia.showCandidate(shown);
    else htmls('.procedural-items .procedural-candidate', '');
  }

  /** The larger view of a candidate of the selected run; each read of the run shows it again as it is now. */
  static showCandidate(item) {
    ProceduralEngineCyberia.shownId = item._id;
    if (ProceduralEngineCyberia.job)
      showCandidate(s('.procedural-items .procedural-candidate'), ProceduralEngineCyberia.job, item);
  }

  /** The action of a grid row: a run or a candidate. */
  static act(row, action) {
    if (action === 'open') return ProceduralEngineCyberia.select(row._id);
    if (action === 'cancel') return ProceduralEngineCyberia.cancel(row._id);
    if (action === 'delete') return ProceduralEngineCyberia.remove(row);
    return ProceduralEngineCyberia.decide(row, action);
  }

  /** Cancels the workflow of a run after the moderator confirms: nothing generated is deleted. */
  static async cancel(jobId = ProceduralEngineCyberia.jobId) {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    if (!jobId) return notify('Select a run to cancel.', 'warning');
    const answer = await Modal.RenderConfirm({
      id: 'procedural-cancel-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Cancel this run? Waiting and undecided candidates stop. The server keeps every candidate.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const response = await CyberiaProceduralJobService.cancel({ jobId });
    if (response.status !== 'success') return refusal(response);
    await ProceduralEngineCyberia.refresh();
  }

  /**
   * Deletes a run and everything it left, after the moderator confirms. A run that still works stops
   * first; the question says so.
   */
  static async remove(job = ProceduralEngineCyberia.job) {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    if (!job) return notify('Select a run to delete.', 'warning');
    const active = ProceduralEngineCyberia.canCancel(job);
    const answer = await Modal.RenderConfirm({
      id: 'procedural-delete-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          ${active ? 'This run still has work. Delete stops it first. ' : ''}Delete run ${job.generationRunId}? Its
          candidates, their draft revisions and its audit trail go. A promoted item keeps its definition. You cannot
          undo this.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const response = await CyberiaProceduralJobService.delete({ jobId: job._id });
    if (response.status !== 'success') return refusal(response);
    const { stopped, candidates, drafts } = response.data;
    const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    notify(
      `Run ${job.generationRunId} deleted: ${count(candidates, 'candidate')} and ${count(drafts.length, 'draft')} removed.${stopped > 0 ? ` It stopped ${count(stopped, 'active candidate')} first.` : ''}`,
      'success',
    );
    if (job._id === ProceduralEngineCyberia.jobId) await ProceduralEngineCyberia.select('');
    else await ProceduralEngineCyberia.refresh();
  }

  /** Promotes the approved candidates of the selected run. */
  static async promote() {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    if (!ProceduralEngineCyberia.jobId) return notify('Select a run first.', 'warning');
    const response = await CyberiaProceduralJobService.promote({ jobId: ProceduralEngineCyberia.jobId });
    if (response.status !== 'success') return refusal(response);
    const { promoted, failed } = response.data;
    if (promoted.length > 0) notify(`Promotion succeeded: ${promoted.join(', ')}.`, 'success');
    for (const { targetItemId, message } of failed)
      notify(`${targetItemId} was not promoted. ${message}`, message.includes('changed') ? 'warning' : 'error');
    await ProceduralEngineCyberia.refresh();
  }

  /** A decision on a candidate; see {@link decide}. */
  static async decide(item, action) {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    if (await decide(item, action, ProceduralEngineCyberia.job)) await ProceduralEngineCyberia.refresh();
  }
}

export { ProceduralEngineCyberia };
