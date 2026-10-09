/**
 * The Procedural Engine view of the Cyberia Studio: it orchestrates generation and review, and
 * computes nothing. A moderator first picks one of two modes. Update mutates existing Cyberia items:
 * each target keeps its item id and gets candidate revisions. Create has no source item: it starts
 * from a Genesis Template and proposes new items. Either mode starts a persistent job on the server,
 * which runs without this page. The moderator then reviews each candidate, finishes it in the Object
 * Layer Studio, approves it and promotes it. Every mode, palette and template this view offers comes
 * from the server configuration; every generation, validation and diversity decision is the server's.
 * Every role sees the same view. Only a moderator reads the runs and changes them; another role who
 * tries a change gets a permission notification.
 *
 * @module src/client/components/cyberia/ProceduralEngineCyberia.js
 */
import { BtnIcon } from '../core/BtnIcon.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { DropDown } from '../core/DropDown.js';
import { Input } from '../core/Input.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from '../core/Router.js';
import { htmls, s } from '../core/VanillaJs.js';
import { ObjectLayerEngineElement } from '../objectlayer-studio/ObjectLayerEngine.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { OBJECT_LAYER_DIRECTION_LABELS } from '../objectlayer-studio/ObjectLayerProtocol.js';
import { framesByDirection, fromWire } from '../objectlayer-studio/RenderSource.js';
import { ProceduralGrid } from './ProceduralGridCyberia.js';
import { ProceduralPalette, swatches } from './ProceduralPaletteCyberia.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';
import { CyberiaProceduralProfileService } from '../../services/cyberia-procedural-profile/cyberia-procedural-profile.service.js';

const ROUTE = 'cyberia-procedural-engine';
/** Pixels per cell of a template preview. */
const PREVIEW_SCALE = 6;
const POLL_MS = 3000;
const SOURCES_GRID = 'procedural-sources-grid';
const JOBS_GRID = 'procedural-jobs-grid';
const ITEMS_GRID = 'procedural-items-grid';
const ACCESS_MESSAGE = 'Moderator access required to manage procedural generation.';
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
const ITEM_STATUS = Object.freeze([
  'queued',
  'running',
  'generated',
  'review',
  'editing',
  'approved',
  'promoted',
  'rejected',
  'failed',
  'cancelled',
]);
/** The statuses in which a job still has work for the server or a decision for a moderator. */
const ACTIVE = Object.freeze(['queued', 'running', 'generated', 'review', 'editing']);
/** The decisions each candidate status offers. */
const ACTIONS = Object.freeze({
  review: ['edit', 'regenerate', 'approve', 'reject'],
  editing: ['edit', 'regenerate', 'approve', 'reject'],
  approved: ['edit', 'promote', 'reject'],
  rejected: ['regenerate'],
  failed: ['regenerate'],
});
const ACTION_ICONS = Object.freeze({
  edit: 'fa-solid fa-pen-to-square',
  regenerate: 'fa-solid fa-dice',
  approve: 'fa-solid fa-check',
  reject: 'fa-solid fa-xmark',
  promote: 'fa-solid fa-cloud-arrow-up',
  open: 'fa-solid fa-folder-open',
  cancel: 'fa-solid fa-ban',
  delete: 'fa-solid fa-trash',
});
/** What each action does, and why it is off when it is. */
const ACTION_HINTS = Object.freeze({
  edit: ['Open the candidate in the Object Layer Studio.'],
  regenerate: ['Make a new candidate from a new seed.'],
  approve: ['Approve this revision.', 'Only a valid revision can be approved.'],
  reject: ['Reject this revision.'],
  promote: ['Make this revision the active definition of its item.'],
  open: ['Show the candidates of this run.'],
  cancel: ['Stop the run. Nothing is deleted.', 'The run has no active work.'],
  delete: ['Delete the run and everything it left. A run that still works stops first.'],
});
const REVISION_KINDS = Object.freeze({ generated: 'generated', regenerated: 'regenerated', edited: 'human-retouched' });

const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const shortCid = (cid) => (cid ? `${cid.slice(0, 9)}…${cid.slice(-5)}` : '—');
const stamp = (date) => (date ? new Date(date).toLocaleString() : '—');
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
const notify = (text, status = 'error') => NotificationManager.Push({ html: text, status });
const denied = () => notify(`Permission denied. ${ACCESS_MESSAGE}`);
/** Tells why a request failed: a conflict, a refusal for lack of the moderator role, or the server message. */
const refusal = (response) => {
  if (response.code === 409) return notify(`Conflict detected. ${response.message}`, 'warning');
  if (response.code === 401 || response.code === 403) return denied();
  return notify(response.message);
};

/** Notifies what changed on the server between two reads of the selected job and its candidates. */
function changesBetween(before, job, items) {
  const notes = [];
  if (before && before.jobId === job._id) {
    if (before.status === 'queued' && job.status === 'running') notes.push(['Job started.', 'info']);
    if (before.status !== 'completed' && job.status === 'completed') notes.push(['Job completed.', 'success']);
    if (before.status !== 'cancelled' && job.status === 'cancelled') notes.push(['Job cancelled.', 'warning']);
    for (const item of items) {
      const was = before.items[item._id];
      if (!was) continue;
      const revision = item.revision ?? -1;
      const changed = was.status !== item.status;
      if (revision > was.revision && ['review', 'editing', 'approved'].includes(was.status))
        notes.push([`${item.targetItemId}: revision ${revision} saved.`, 'success']);
      else if (changed && item.status === 'failed' && item.validation.problems.length > 0)
        notes.push([`${item.targetItemId}: validation failed. ${item.validation.problems.join('; ')}`, 'error']);
      else if (changed && item.status === 'failed')
        notes.push([`${item.targetItemId}: generation failed. ${item.error?.message ?? ''}`, 'error']);
      else if (changed && item.status === 'review' && was.status !== 'editing') {
        if (item.metrics?.rejectedTries > 0)
          notes.push([
            `${item.targetItemId}: ${item.metrics.rejectedTries} tries failed the diversity check.`,
            'warning',
          ]);
        notes.push(
          was.revision >= 0
            ? [`${item.targetItemId}: regenerated as revision ${revision}.`, 'success']
            : [`${item.targetItemId} is ready for review.`, 'info'],
        );
      }
    }
  }
  return notes;
}

class ProceduralEngineCyberia {
  static jobId = '';
  static timer = null;
  static canMutate = false;
  static config = null;
  static mode = '';
  static itemType = '';
  static job = null;
  static seen = null;
  /** Genesis Template id → the preview of each direction of its base item: `{ label, url }`. */
  static previews = {};

  /**
   * Opens the view, on a job when one is given. From the Object Layer Studio this is the way back
   * to the candidate under review.
   * @param {{jobId?: string}} [params]
   * @returns {boolean} Whether the host offers the view.
   */
  static open({ jobId } = {}) {
    const entry = s(`.main-btn-${ROUTE}`);
    if (!entry) return false;
    setPath(`${getProxyPath()}${ROUTE}`);
    setQueryParams({ cid: null, review: null, id: null, job: jobId ?? null }, { replace: true });
    if (s('.procedural-engine') && ProceduralEngineCyberia.config) ProceduralEngineCyberia.select(jobId ?? '');
    entry.click();
    return true;
  }

  static async render({ appStore }) {
    Object.assign(ProceduralEngineCyberia, {
      canMutate: commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest'),
      jobId: getQueryParams().job ?? '',
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

    const { dropdown } = ProceduralEngineCyberia;
    const field = async (name, label, extra) =>
      html`<div class="in" style="margin-bottom: 8px;">
        ${await Input.instance({ id: `procedural-input-${name}`, label: html`${label}`, containerClass: 'inl', ...extra })}
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
        .procedural-engine .procedural-swatch {
          display: inline-block;
          width: 16px;
          height: 16px;
          margin-right: 3px;
          border: 1px solid var(--studio-subtle-border);
          vertical-align: middle;
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
          gap: 16px;
          align-items: flex-start;
        }
      </style>
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
              fetch: (query) => ProceduralEngineCyberia.fetchPage(() => CyberiaProceduralJobService.getSources(query)),
              onSelectionChanged: () => ProceduralEngineCyberia.selectionChanged(),
            })}
            <div class="in procedural-selection-info procedural-muted" style="margin: 6px 0;"></div>
            ${await field('variants-update', 'Variants per item', { type: 'number', min: 1, max: 200, step: 1, value: 3 })}`,
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
            ${await field('variants-create', 'Variant count', { type: 'number', min: 1, max: 200, step: 1, value: 4 })}
            ${await field('prefix', 'New item ID prefix', { type: 'text', placeholder: true, value: 'skin-generated' })}`,
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
        html`<div class="in procedural-job-meta procedural-muted" style="margin-bottom: 6px;">No run selected.</div>
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
    </div>`;
  }

  /** A labeled dropdown; it keeps the label of each option, so a reset can show it again. */
  static async dropdown(id, label, data, extra = {}) {
    const rendered = await DropDown.instance({ id, label: html`${label}`, data, containerClass: 'inl', ...extra });
    DropDown.Tokens[id].labels = Object.fromEntries(data.map(({ value: key, display }) => [key, display]));
    return html`<div class="in" style="margin-bottom: 8px;">${rendered}</div>`;
  }

  /**
   * The grid answer of a moderator read as `{ data, total }`, or null when the read failed, after the
   * user is told. Another role reads nothing and sees an empty grid.
   */
  static async fetchPage(read) {
    if (!ProceduralEngineCyberia.canMutate) return { data: [], total: 0 };
    const response = await read();
    if (response.status !== 'success') {
      refusal(response);
      return null;
    }
    return response.data;
  }

  /** The candidates of the selected run; they are compared with the last read to tell what changed. */
  static async fetchCandidates(query) {
    const { jobId } = ProceduralEngineCyberia;
    if (!jobId) return { data: [], total: 0 };
    const page = await ProceduralEngineCyberia.fetchPage(() =>
      CyberiaProceduralJobService.getItems({ jobId, ...query }),
    );
    if (page) ProceduralEngineCyberia.observe(page.data);
    return page;
  }

  /** Draws the base item of each Genesis Template the server previews, one image for each direction. */
  static async loadPreviews() {
    for (const { url } of Object.values(ProceduralEngineCyberia.previews).flat()) URL.revokeObjectURL(url);
    ProceduralEngineCyberia.previews = Object.fromEntries(
      await Promise.all(
        ProceduralEngineCyberia.config.templates
          .filter(({ preview }) => preview)
          .map(async ({ id, preview }) => [
            id,
            await Promise.all(
              Object.entries(framesByDirection(fromWire(preview)))
                .filter(([, frames]) => frames.length > 0)
                .map(async ([code, [frame]]) => ({
                  label: OBJECT_LAYER_DIRECTION_LABELS[code],
                  url: URL.createObjectURL(await ObjectLayerEngineElement.matrixToBlob(frame, PREVIEW_SCALE)),
                })),
            ),
          ]),
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

  /** A chosen template shows its base item and gives its color slots to the palette editor. */
  static selectTemplate() {
    ProceduralEngineCyberia.showTemplate();
    ProceduralEngineCyberia.syncPalette();
  }

  /** Shows the base item of the chosen Genesis Template, its roles, and the regions a generation keeps. */
  static showTemplate() {
    const panel = s('.procedural-template-preview');
    if (!panel) return;
    const template = ProceduralEngineCyberia.config.templates.find(({ id }) => id === picked('procedural-template'));
    panel.replaceChildren();
    if (!template) return;
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
        'procedural-muted',
        'Each new item starts from this base item and the function of the content baseline. The palette colors it, the variation changes its shape and details, and you finish it in the Object Layer Studio.',
      ),
    );
    panel.append(facts);
  }

  /** A grid column over a server field: the field is also its id, so a filter and a sort name that field. */
  static column(field, headerName, extra = {}) {
    return { field, colId: field, headerName, minWidth: 90, ...extra };
  }

  static sourceColumns() {
    const { column } = ProceduralEngineCyberia;
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
    const { column, actionsColumn } = ProceduralEngineCyberia;
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
      actionsColumn((job) => [
        ['open', true],
        ['cancel', ProceduralEngineCyberia.canCancel(job)],
        ['delete', true],
      ]),
    ];
  }

  static itemColumns() {
    const { column, actionsColumn } = ProceduralEngineCyberia;
    const text = { sortable: true, filter: 'agTextColumnFilter' };
    return [
      {
        headerName: 'Preview',
        field: 'candidateCid',
        colId: 'preview',
        minWidth: 90,
        maxWidth: 100,
        autoHeight: true,
        cellRenderer: ({ value: cid }) => {
          const preview = element('img', 'procedural-preview');
          if (cid) preview.src = AtlasSpriteSheetService.idlePreviewUrl(cid);
          return preview;
        },
      },
      column('targetItemId', 'Item ID', { ...text, minWidth: 140 }),
      column('candidateCid', 'Candidate CID', {
        ...text,
        minWidth: 140,
        valueFormatter: ({ value: cid }) => shortCid(cid),
      }),
      column('revision', 'Revision', {
        sortable: true,
        filter: 'agNumberColumnFilter',
        minWidth: 130,
        valueFormatter: ({ data }) =>
          data.revision === null ? '—' : `${data.revision} · ${REVISION_KINDS[data.revisions.at(-1).kind]}`,
      }),
      column('templateId', 'Template', { ...text, minWidth: 130 }),
      column('paletteId', 'Palette', {
        ...text,
        minWidth: 130,
        valueFormatter: ({ data }) => ProceduralEngineCyberia.paletteOf(data).label,
      }),
      column('diversity.score', 'Diversity', {
        sortable: true,
        filter: 'agNumberColumnFilter',
        valueFormatter: ({ value: score }) => (score === null || score === undefined ? '—' : score.toFixed(3)),
      }),
      {
        headerName: 'Validation',
        minWidth: 180,
        autoHeight: true,
        cellRenderer: ({ data }) => {
          const checked = Boolean(data.validation.checkedAt);
          return element(
            'span',
            `procedural-cell-text ${!checked ? 'procedural-muted' : data.validation.ok ? 'procedural-good' : 'procedural-bad'}`,
            checked
              ? data.validation.ok
                ? 'valid'
                : data.validation.problems.join('; ')
              : data.error?.message || 'pending',
          );
        },
      },
      column('status', 'Status', text),
      column('createdAt', 'Created', {
        sortable: true,
        minWidth: 150,
        valueFormatter: ({ value: date }) => stamp(date),
      }),
      actionsColumn((item) =>
        (ACTIONS[item.status] ?? []).map((action) => [action, !(action === 'approve' && !item.validation.ok)]),
      ),
    ];
  }

  /**
   * The action buttons of a grid row: `build` answers the `[action, enabled]` pairs of the row. The
   * row grows to show every button.
   */
  static actionsColumn(build) {
    return {
      headerName: 'Actions',
      minWidth: 300,
      sortable: false,
      filter: false,
      autoHeight: true,
      cellRenderer: ({ data }) => {
        const cell = element('div', 'procedural-cell-actions');
        for (const [action, enabled] of build(data)) {
          const control = element('button', '', ` ${action}`);
          control.type = 'button';
          control.prepend(element('i', ACTION_ICONS[action]));
          control.disabled = !enabled;
          const [hint, off = hint] = ACTION_HINTS[action];
          control.title = enabled ? hint : off;
          control.onclick = (event) => {
            event.stopPropagation();
            ProceduralEngineCyberia.act(data, action);
          };
          cell.append(control);
        }
        return cell;
      },
    };
  }

  static canCancel(job) {
    return job.status !== 'cancelled' && ACTIVE.some((status) => (job.counts?.[status] ?? 0) > 0);
  }

  /** Connects the rendered view: the buttons, and the first read of the runs and of the run the URL names. */
  static async mount() {
    if (!s('.procedural-engine')) return;
    const on = (action, handler) => {
      if (s(`.procedural-btn-${action}`)) s(`.procedural-btn-${action}`).onclick = handler;
    };
    on('create', () => ProceduralEngineCyberia.create());
    on('cancel', () => ProceduralEngineCyberia.cancel());
    on('delete', () => ProceduralEngineCyberia.remove());
    on('reset', () => ProceduralEngineCyberia.reset());
    on('refresh', () => ProceduralEngineCyberia.refresh());
    on('promote', () => ProceduralEngineCyberia.promote());
    await ProceduralEngineCyberia.refresh();
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
    const { mode, config } = ProceduralEngineCyberia;
    ProceduralPalette.setContext({
      mode,
      template:
        mode === 'create-new'
          ? (config.templates.find(({ id }) => id === picked('procedural-template')) ?? null)
          : null,
    });
    if (mode === 'update-existing') ProceduralEngineCyberia.selectionChanged();
  }

  /** A new item type lists its own templates and palettes. */
  static async changeItemType(itemType) {
    ProceduralEngineCyberia.itemType = itemType;
    htmls('.procedural-template-slot', await ProceduralEngineCyberia.templateDropdown());
    ProceduralEngineCyberia.syncPalette();
  }

  /** The selected items, and a palette editor for each one. */
  static selectionChanged() {
    const rows = ProceduralGrid.selection(SOURCES_GRID);
    htmls('.procedural-selection-info', `${rows.length} item${rows.length === 1 ? '' : 's'} selected.`);
    ProceduralPalette.setItems(rows.map(({ itemId }) => itemId));
  }

  /** The request of the form for the chosen mode; null, after a warning, when the form is not valid. */
  static request() {
    const { mode, config } = ProceduralEngineCyberia;
    const warn = (text) => {
      notify(text, 'warning');
      return null;
    };
    if (!mode) return warn('Select a generation mode first.');
    const common = { mode, palette: ProceduralPalette.request(), variation: { level: Number(value('variation')) } };
    if (mode === 'update-existing') {
      const rows = ProceduralGrid.selection(SOURCES_GRID);
      if (rows.length === 0) return warn('Select at least one existing item.');
      return {
        ...common,
        source: { itemIds: rows.map(({ itemId }) => itemId) },
        output: { variantsPerItem: Number(value('variants-update')) },
      };
    }
    const template = config.templates.find(({ id }) => id === picked('procedural-template'));
    if (!template) return warn('Select a Genesis Template.');
    return {
      ...common,
      itemType: ProceduralEngineCyberia.itemType,
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
    Object.assign(ProceduralEngineCyberia, { jobId, seen: same ? ProceduralEngineCyberia.seen : null });
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
      prefix: 'skin-generated',
    }))
      if (s(`.procedural-input-${name}`)) s(`.procedural-input-${name}`).value = text;
    ProceduralEngineCyberia.changeMode('');
    Object.assign(ProceduralEngineCyberia, { jobId: '', seen: null, job: null });
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

  /** Tells what changed on the server since the last read of the selected run. */
  static observe(items) {
    const { job, seen } = ProceduralEngineCyberia;
    if (!job) return;
    for (const [text, status] of changesBetween(seen, job, items)) notify(text, status);
    ProceduralEngineCyberia.seen = {
      jobId: job._id,
      status: job.status,
      items: {
        ...(seen?.jobId === job._id ? seen.items : {}),
        ...Object.fromEntries(
          items.map(({ _id, status: state, revision }) => [_id, { status: state, revision: revision ?? -1 }]),
        ),
      },
    };
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
    if (items.length === 0) htmls('.procedural-candidate', '');
  }

  /**
   * What colored a candidate: the Palette Template its run holds for it, or the foundation palettes
   * of the item of an update, and the slots set for the run or for that item.
   * @returns {{label: string, colors: string[]}}
   */
  static paletteOf(item) {
    const { spec } = ProceduralEngineCyberia.job ?? {};
    if (!spec) return { label: '—', colors: [] };
    const update = spec.mode === 'update-existing';
    const set = update
      ? spec.palette.items.find(({ itemId }) => itemId === item.targetItemId)?.slots
      : spec.palette.slots;
    const slots = Object.values(set ?? {});
    const overrides = slots.length > 0 ? ' and slots set' : '';
    const palette = spec.palettes.find(({ id }) => id === item.paletteId);
    if (palette) return { label: `${palette.name}${overrides}`, colors: [...Object.values(palette.roles), ...slots] };
    const palettes = spec.sources.find(({ itemId }) => itemId === item.targetItemId)?.artDirection?.palettes ?? [];
    return {
      label: `${palettes.map(({ name }) => name).join(', ') || 'default colors'}${overrides}`,
      colors: [...palettes.flatMap(({ roles }) => roles.base ?? []), ...slots],
    };
  }

  /** The larger view of a candidate: what it replaces or proposes, its palette and its template. */
  static showCandidate(item) {
    const { job } = ProceduralEngineCyberia;
    if (!job) return;
    const update = job.spec.mode === 'update-existing';
    const palette = ProceduralEngineCyberia.paletteOf(item);
    const kind = item.revisions.length > 0 ? REVISION_KINDS[item.revisions.at(-1).kind] : '—';
    const lines = update
      ? [
          `Item: ${item.targetItemId}`,
          `Current: ${shortCid(item.sourceCid)}`,
          `Candidate: ${shortCid(item.candidateCid)}`,
          `Revision: ${kind}`,
          `Genesis Template: ${item.templateId}`,
        ]
      : [
          `Proposed item ID: ${item.targetItemId}`,
          `Candidate CID: ${shortCid(item.candidateCid)}`,
          `Genesis Template: ${item.templateId}`,
          `Variation: ${job.spec.variation.level}`,
        ];
    const panel = s('.procedural-candidate');
    panel.replaceChildren();
    const preview = element('img', 'procedural-preview-large');
    if (item.candidateCid) preview.src = AtlasSpriteSheetService.idlePreviewUrl(item.candidateCid);
    const details = element('div');
    for (const line of lines) details.append(element('div', '', line));
    const palettes = element('div');
    palettes.innerHTML = `Palette: ${palette.label} ${swatches(palette.colors)}`;
    details.append(palettes);
    panel.append(preview, details);
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
      `Run ${job.generationRunId} deleted: ${count(candidates, 'candidate')} and ${count(drafts, 'draft')} removed.${stopped > 0 ? ` It stopped ${count(stopped, 'active candidate')} first.` : ''}`,
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

  /** A decision on a candidate. Edit opens the Object Layer Studio on its current revision. */
  static async decide(item, action) {
    if (!ProceduralEngineCyberia.canMutate) return denied();
    const target = item.targetItemId;
    const response =
      action === 'promote'
        ? await CyberiaProceduralJobService.promote({ jobId: item.jobId, itemId: item._id })
        : await CyberiaProceduralJobService.decide({
            jobId: item.jobId,
            itemId: item._id,
            action,
            body: action === 'approve' ? { cid: item.candidateCid } : {},
          });
    if (response.status !== 'success') return refusal(response);
    if (action === 'edit') {
      const { candidateCid, jobItemId } = response.data;
      if (!ObjectLayerEngineModal.open({ cid: candidateCid, review: jobItemId }))
        notify('This host has no Object Layer Studio.', 'warning');
      else notify(`${target} opened for edit in the Object Layer Studio.`, 'info');
      return;
    }
    const update = ProceduralEngineCyberia.job?.spec.mode === 'update-existing';
    notify(
      {
        approve: `${target}: approval succeeded for revision ${item.revision}.`,
        reject: `${target} rejected.`,
        regenerate: `${target} queued for regeneration.`,
        promote: update
          ? `${target}: promotion succeeded. It runs on ${shortCid(item.candidateCid)}.`
          : `New item ${target} created.`,
      }[action],
      action === 'reject' ? 'warning' : 'success',
    );
    await ProceduralEngineCyberia.refresh();
  }
}

export { ProceduralEngineCyberia };
