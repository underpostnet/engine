/**
 * The Cyberia Item Catalog view: which exact definition the runtime runs for each item, and the one
 * place a moderator changes it. The grid lists every binding with the state of its definition, a
 * page at a time from the `page` and `limit` query parameters; a row opens the definitions the item
 * could run, its binding history and how its definition is stored on IPFS. Add binding opens the same view for an item with no binding. A bind names the
 * definition the moderator saw the item run, so a concurrent bind answers 409 and changes nothing.
 * Import from Object Layer takes a definition found at the Object Layer authority or given as a
 * document, shows what the server checked and stores, and imports it into the live content once the
 * moderator confirms its warnings. A bind is optional and decides any replacement.
 *
 * @module src/client/components/cyberia/ItemCatalogCyberia.js
 */
import { AgGrid, ValueListFilter } from '../core/AgGrid.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { darkTheme } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { firstPage, pageQuery } from '../core/Pagination.js';
import { isCurrentRoute, listenQueryParamsChange } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { fromWire, rgbaFrame } from '../objectlayer-studio/RenderSource.js';
import {
  CyberiaObjectLayerProfile,
  DEFINITION_DOCUMENT_BYTES,
  definitionDocumentProblems,
} from './ObjectLayerProfileCyberia.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';

const GRID = 'item-catalog-grid';
const ROUTE = 'cyberia-item-catalog';
const STATUSES = Object.freeze({
  bound: { label: 'bound', tone: 'ok' },
  unrendered: { label: 'no render', tone: 'warn' },
  draft: { label: 'draft', tone: 'bad' },
  archived: { label: 'archived', tone: 'bad' },
  missing: { label: 'not stored', tone: 'bad' },
});
/** Where a binding comes from: the release content, or a change made while the release runs. */
const ORIGINS = Object.freeze({
  content: 'release content',
  snapshot: 'release snapshot',
  studio: 'live: Studio bind',
  procedural: 'live: promotion',
  revise: 'live: revision',
  seed: 'live: first binding',
  import: 'live: Object Layer import',
});

const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const shortCid = (cid) => (cid ? `${cid.slice(0, 9)}…${cid.slice(-5)}` : '—');
const stamp = (date) => (date ? new Date(date).toLocaleString() : '—');
const notify = (text, status = 'error') => NotificationManager.Push({ html: text, status });
const refusal = (response) =>
  notify(response.code === 409 ? `Conflict detected. ${response.message}` : response.message, 'warning');
const button = (label, run, icon) => {
  const node = element('button', 'item-catalog-button', label);
  node.type = 'button';
  if (icon) node.prepend(element('i', icon), ' ');
  node.onclick = (event) => {
    event.stopPropagation();
    run();
  };
  return node;
};
const spinner = () => {
  const icon = element('i', 'fa-solid fa-spinner fa-spin');
  icon.setAttribute('aria-hidden', 'true');
  return icon;
};
/** A note that a request runs. */
const pending = (text) => {
  const note = element('div', 'item-catalog-muted');
  note.setAttribute('role', 'status');
  note.append(spinner(), ` ${text}…`);
  return note;
};
/** Runs a request with its button busy: disabled, with a spinner, until the request settles. */
const busy = async (node, label, work) => {
  const content = [...node.childNodes];
  node.disabled = true;
  node.setAttribute('aria-busy', 'true');
  node.replaceChildren(spinner(), ` ${label}…`);
  try {
    return await work();
  } finally {
    node.replaceChildren(...content);
    node.disabled = false;
    node.removeAttribute('aria-busy');
  }
};
/** The format of a definition document, as the document field shows it. */
const DOCUMENT_EXAMPLE = JSON.stringify(
  {
    item: { id: 'item-id', type: 'skin', description: '', activable: false },
    stats: Object.fromEntries(CyberiaObjectLayerProfile.statTypes.map((key) => [key, 0])),
    render: { cid: 'bafkrei…', metadataCid: 'bafkrei…' },
  },
  null,
  2,
);
const statusBadge = (status) => {
  const { label, tone } = STATUSES[status] ?? { label: status, tone: 'warn' };
  return element('span', `item-catalog-status item-catalog-status-${tone}`, label);
};

class ItemCatalogCyberia {
  static canBind = false;
  /** The item the details show. */
  static itemId = '';
  /** The page the grid shows, as `{ page, limit }`; null until the first read. */
  static loadedPage = null;
  /** The definition the import panel previews: `{ cid }` or `{ document }`. */
  static importRequest = null;
  /** Whether the moderator asks the import to bind an item. */
  static importBind = false;

  static style = css`
    .item-catalog .item-catalog-muted {
      opacity: 0.7;
      font-size: 12px;
    }
    .item-catalog .item-catalog-status {
      display: inline-block;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 20px;
      color: #fff;
    }
    .item-catalog .item-catalog-status-ok {
      background: #2e7d32;
    }
    .item-catalog .item-catalog-status-warn {
      background: #b26a00;
    }
    .item-catalog .item-catalog-status-bad {
      background: #c62828;
    }
    .item-catalog .item-catalog-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: center;
      padding: 6px 0;
      border-top: 1px solid var(--studio-subtle-border);
      font-size: 13px;
    }
    .item-catalog .item-catalog-row code {
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .item-catalog .item-catalog-button {
      padding: 2px 10px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .item-catalog .item-catalog-button:hover:not(:disabled) {
      border-color: var(--studio-accent);
      background: var(--studio-accent);
      color: var(--studio-card);
    }
    .item-catalog .item-catalog-button:focus-visible {
      outline: 2px solid var(--studio-accent);
      outline-offset: 2px;
    }
    .item-catalog .item-catalog-button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .item-catalog .item-catalog-cell-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 0;
    }
    .item-catalog .item-catalog-preview {
      display: block;
      width: 48px;
      height: 48px;
      padding: 2px 0;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .item-catalog .item-catalog-add {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .item-catalog .item-catalog-import-frame {
      width: 96px;
      height: 96px;
      image-rendering: pixelated;
      background: #0004;
      border-radius: 4px;
    }
    .item-catalog .item-catalog-import-card {
      display: grid;
      gap: 6px;
      padding: 8px 0;
    }
    .item-catalog .item-catalog-import-facts {
      display: grid;
      gap: 2px;
      flex: 1 1 16rem;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .item-catalog .item-catalog-bad {
      color: #ef5350;
    }
    .item-catalog .item-catalog-warn {
      color: #ffb74d;
    }
    .item-catalog .item-catalog-check {
      display: flex;
      gap: 6px;
      align-items: flex-start;
    }
    .item-catalog .item-catalog-import-heading {
      margin: 12px 0 4px;
      font-size: 13px;
      font-weight: 600;
    }
    .item-catalog .item-catalog-import-document,
    .item-catalog .item-catalog-import-bind,
    .item-catalog .item-catalog-import-problems {
      display: grid;
      gap: 6px;
    }
    .item-catalog .item-catalog-import-text {
      box-sizing: border-box;
      width: 100%;
      min-height: 12rem;
      padding: 8px;
      resize: vertical;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font:
        12px/1.5 ui-monospace,
        SFMono-Regular,
        Menlo,
        Consolas,
        monospace;
    }
    .item-catalog .item-catalog-import-text:focus-visible,
    .item-catalog input:focus-visible {
      outline: 2px solid var(--studio-accent);
      outline-offset: 2px;
    }
    .item-catalog .item-catalog-import-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .item-catalog .item-catalog-import-run {
      justify-self: start;
      padding: 6px 16px;
      font-size: 13px;
    }
    .item-catalog [hidden] {
      display: none !important;
    }
  `;

  /** A grid column over a server field: the field is also its id, so a filter and a sort name it. */
  static column(field, headerName, extra = {}) {
    return { field, colId: field, headerName, minWidth: 90, ...extra };
  }

  static columns() {
    const { column } = ItemCatalogCyberia;
    const text = { sortable: true, filter: 'agTextColumnFilter' };
    return [
      {
        headerName: 'Preview',
        colId: 'preview',
        minWidth: 70,
        maxWidth: 80,
        sortable: false,
        filter: false,
        autoHeight: true,
        // The idle frame of the render the bound definition names.
        cellRenderer: ({ data }) => {
          if (!data.render) return element('span', 'item-catalog-muted', '—');
          const preview = element('img', 'item-catalog-preview');
          preview.alt = data.itemId;
          preview.onerror = () => preview.replaceWith(element('span', 'item-catalog-muted', '—'));
          preview.src = AtlasSpriteSheetService.idlePreviewUrl(data.objectLayerCid);
          return preview;
        },
      },
      column('itemId', 'Item ID', { ...text, minWidth: 160 }),
      column('itemType', 'Item Type', text),
      column('objectLayerCid', 'Active CID', {
        ...text,
        minWidth: 150,
        valueFormatter: ({ value }) => shortCid(value),
      }),
      column('render', 'Render', {
        minWidth: 150,
        valueFormatter: ({ value, data }) => (value ? `${shortCid(value)}${data.atlas ? '' : ' (no atlas)'}` : '—'),
      }),
      column('source', 'Content Release', {
        ...text,
        minWidth: 150,
        valueFormatter: ({ value }) => ORIGINS[value] ?? '—',
      }),
      column('updatedAt', 'Updated', { sortable: true, minWidth: 150, valueFormatter: ({ value }) => stamp(value) }),
      column('bindingStatus', 'Binding Status', {
        sortable: true,
        filter: ValueListFilter,
        filterParams: { values: Object.keys(STATUSES) },
        cellRenderer: ({ value }) => statusBadge(value),
      }),
      {
        headerName: 'Actions',
        minWidth: 270,
        sortable: false,
        filter: false,
        autoHeight: true,
        cellRenderer: ({ data }) => {
          const cell = element('div', 'item-catalog-cell-actions');
          cell.append(
            button('Open', () => ItemCatalogCyberia.openStudio(data.objectLayerCid), 'fa-solid fa-pen'),
            button('Change Binding', () => ItemCatalogCyberia.showItem(data.itemId), 'fa-solid fa-link'),
            button('View History', () => ItemCatalogCyberia.showItem(data.itemId), 'fa-solid fa-clock-rotate-left'),
          );
          return cell;
        },
      },
    ];
  }

  static async render(options = {}) {
    const role = options.appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    ItemCatalogCyberia.canBind = commonModeratorGuard(role);
    ItemCatalogCyberia.itemId = '';
    ItemCatalogCyberia.loadedPage = null;
    const addBinding = ItemCatalogCyberia.canBind
      ? html`<div class="in item-catalog-add">
          ${await DropDown.instance({
            id: 'item-catalog-add-item',
            label: html`<i class="fa-solid fa-plus"></i> Add binding`,
            data: [],
            containerClass: 'inl',
            serviceProvider: (q) => ItemCatalogCyberia.unboundOptions(q),
          })}
          <button type="button" class="item-catalog-button item-catalog-import-open">
            <i class="fa-solid fa-cloud-arrow-down"></i> Import from Object Layer
          </button>
        </div>`
      : '';
    const grid = await AgGrid.instance({
      id: GRID,
      ownerRoute: ROUTE,
      usePagination: true,
      paginationOptions: { limitOptions: [10, 25, 50, 100] },
      darkTheme,
      style: { width: '100%', height: '50vh' },
      gridOptions: {
        rowData: [],
        columnDefs: ItemCatalogCyberia.columns(),
        defaultColDef: { flex: 1, minWidth: 90, resizable: true, sortable: false, filter: false },
        getRowId: ({ data }) => data.itemId,
        suppressColumnVirtualisation: true,
        rowSelection: 'single',
        onFilterChanged: () => ItemCatalogCyberia.queryChanged(),
        onSortChanged: () => ItemCatalogCyberia.queryChanged(),
        onRowClicked: ({ data }) => ItemCatalogCyberia.showItem(data.itemId),
      },
    });
    setTimeout(async () => {
      s('.item-catalog-import-open')?.addEventListener('click', () => ItemCatalogCyberia.openImport());
      await ItemCatalogCyberia.refreshList();
      listenQueryParamsChange({ id: 'item-catalog-page', event: () => ItemCatalogCyberia.followPageQuery() });
    });
    return html`<style>
        ${ItemCatalogCyberia.style}
      </style>
      <div class="in section-mp studio-editor item-catalog">
        <div class="in studio-group">
          <div class="in studio-group-title"><i class="fa-solid fa-link"></i> Runtime bindings</div>
          <div class="in item-catalog-muted" style="margin-bottom: 8px;">
            The catalog says which exact definition the runtime runs for each item. A save in the Studio and a
            procedural candidate make new definitions; only a bind here, or a promotion, moves an item to one.
          </div>
          ${addBinding} ${grid}
        </div>
        <div class="in studio-group item-catalog-import" hidden></div>
        <div class="in studio-group">
          <div class="in studio-group-title"><i class="fa-solid fa-clock-rotate-left"></i> Item</div>
          <div class="in item-catalog-details item-catalog-muted">
            Select an item to see its definitions and history.
          </div>
        </div>
      </div>`;
  }

  /** Reads the page the query parameters name, filtered and sorted as the grid shows, with its pager. */
  static async refreshList() {
    const { page, limit } = pageQuery();
    const api = AgGrid.grids[GRID];
    const response = await CyberiaItemCatalogService.get({ page, limit, ...AgGrid.query(GRID) });
    if (response.status !== 'success') return refusal(response);
    const { data, total, totalPages } = response.data;
    ItemCatalogCyberia.loadedPage = { page, limit };
    api.setGridOption('rowData', data);
    s(`#ag-pagination-${GRID}`)?.showPage({ page, limit, total, totalPages });
  }

  /** Reads the list again when the query parameters of its route name another page. */
  static followPageQuery() {
    if (!isCurrentRoute(ROUTE) || !s('.item-catalog')) return;
    const { page, limit } = pageQuery();
    const loaded = ItemCatalogCyberia.loadedPage;
    if (!loaded || loaded.page !== page || loaded.limit !== limit) ItemCatalogCyberia.refreshList();
  }

  /** A new filter or sort reads from the first page. */
  static queryChanged() {
    firstPage(() => ItemCatalogCyberia.refreshList());
  }

  /** The items Add binding offers: a published definition and no binding. A pick shows the item. */
  static async unboundOptions(q) {
    const response = await CyberiaItemCatalogService.getUnbound({ q });
    if (response.status !== 'success') {
      refusal(response);
      return [];
    }
    return response.data.items.map(({ itemId }) => ({
      value: itemId,
      display: itemId,
      data: itemId,
      onClick: () => ItemCatalogCyberia.showItem(itemId),
    }));
  }

  static openStudio(cid) {
    if (!ObjectLayerEngineModal.open({ cid })) notify('This host has no Object Layer Studio.', 'warning');
  }

  /** Shows the definitions an item could run, each with its bind, and its binding history. */
  static async showItem(itemId) {
    ItemCatalogCyberia.itemId = itemId;
    const response = await CyberiaItemCatalogService.getHistory({ itemId });
    if (response.status !== 'success') return refusal(response);
    if (itemId !== ItemCatalogCyberia.itemId) return;
    const { objectLayerCid, history, definitions } = response.data;
    const details = s('.item-catalog-details');
    if (!details) return;
    details.classList.remove('item-catalog-muted');
    const title = element('div', '', '');
    title.append(
      element('strong', '', itemId),
      element('span', 'item-catalog-muted', objectLayerCid ? ` runs ${shortCid(objectLayerCid)}` : ' is not bound'),
    );
    const definitionRows = definitions.map((definition) => {
      const row = element('div', 'item-catalog-row');
      const active = definition.cid === objectLayerCid;
      row.append(
        element('code', '', definition.cid),
        element('span', 'item-catalog-muted', `${definition.origin}${definition.archived ? ', archived' : ''}`),
        element('span', 'item-catalog-muted', definition.render ? 'render' : 'no render'),
        element('span', 'item-catalog-muted', stamp(definition.createdAt)),
      );
      if (active) row.append(statusBadge('bound'));
      const open = button('Open', () => ItemCatalogCyberia.openStudio(definition.cid));
      const bind = button('Bind as Runtime Version', () =>
        ItemCatalogCyberia.bind(itemId, definition.cid, objectLayerCid),
      );
      bind.disabled = !ItemCatalogCyberia.canBind || active || definition.archived || definition.origin === 'draft';
      const ipfs = button('IPFS', () => ItemCatalogCyberia.showIpfs(itemId, definition.cid, row));
      ipfs.disabled = !ItemCatalogCyberia.canBind;
      row.append(open, bind, ipfs);
      return row;
    });
    const historyRows = history.map(({ objectLayerCid: cid, previousCid, source, by, at, provenance }) => {
      const row = element('div', 'item-catalog-row');
      row.append(
        element('span', '', stamp(at)),
        element('code', '', `${shortCid(previousCid)} → ${shortCid(cid)}`),
        element('span', 'item-catalog-muted', `${ORIGINS[source] ?? source}${by ? ` by ${by}` : ''}`),
      );
      if (provenance)
        row.append(
          element(
            'span',
            'item-catalog-muted',
            `From ${provenance.domain}${provenance.createdBy ? `, stored there by ${provenance.createdBy}` : ''}. Confirmed: ${provenance.warnings.join('; ') || 'nothing to confirm'}`,
          ),
        );
      return row;
    });
    details.replaceChildren(
      title,
      element('div', 'studio-group-title', 'Definitions'),
      ...(definitionRows.length ? definitionRows : [element('div', 'item-catalog-muted', 'No stored definition.')]),
      element('div', 'studio-group-title', 'Binding history'),
      ...(historyRows.length ? historyRows : [element('div', 'item-catalog-muted', 'Never bound.')]),
    );
  }

  /** Binds an item to a definition once the moderator confirms, while it still runs `expectedCid`. */
  static async bind(itemId, objectLayerCid, expectedCid) {
    const answer = await Modal.RenderConfirm({
      id: 'item-catalog-bind-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Bind ${itemId} to ${shortCid(objectLayerCid)}? Every world that names ${itemId} runs this definition after its
          next reload.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const response = await CyberiaItemCatalogService.bind({ itemId, objectLayerCid, expectedCid });
    if (response.status !== 'success') refusal(response);
    else notify(`${itemId} runs ${shortCid(objectLayerCid)}.`, 'success');
    await Promise.all([ItemCatalogCyberia.refreshList(), ItemCatalogCyberia.showItem(itemId)]);
  }

  /**
   * Opens the import panel: a search of the Object Layer authority, a definition document to paste
   * or attach, and the preview of the definition either names.
   */
  static openImport() {
    const panel = s('.item-catalog-import');
    if (!panel) return;
    panel.hidden = false;
    const search = element('form', 'item-catalog-row');
    const query = Object.assign(element('input', 'item-catalog-import-q'), {
      placeholder: 'Item id or CID',
      maxLength: 128,
    });
    query.setAttribute('aria-label', 'Search the Object Layer authority by item id or CID');
    const find = element('button', 'item-catalog-button', ' Search');
    find.type = 'submit';
    find.prepend(element('i', 'fa-solid fa-magnifying-glass'));
    search.append(query, find);
    search.onsubmit = (event) => {
      event.preventDefault();
      busy(find, 'Searching', () => ItemCatalogCyberia.searchImport(query.value.trim()));
    };

    const preview = element('div', 'item-catalog-import-preview');
    preview.setAttribute('aria-live', 'polite');
    panel.replaceChildren(
      element('div', 'studio-group-title', 'Import from Object Layer'),
      element(
        'div',
        'item-catalog-muted',
        'Find a definition at the Object Layer authority, or give its document. The server checks it and rebuilds its render frames and atlas from the render it names. The import adds it to the live content here; a bind is optional.',
      ),
      element('h3', 'item-catalog-import-heading', 'Search the authority'),
      search,
      element('div', 'item-catalog-import-results'),
      ...ItemCatalogCyberia.documentForm(),
      preview,
    );
    query.focus();
  }

  /** The definition document form and its heading: a field to paste it in, a JSON file to attach, and its check. */
  static documentForm() {
    const form = element('form', 'item-catalog-import-document');
    const field = Object.assign(element('textarea', 'item-catalog-import-text'), {
      id: 'item-catalog-import-text',
      rows: 10,
      spellcheck: false,
      placeholder: DOCUMENT_EXAMPLE,
    });
    const heading = Object.assign(element('h3', 'item-catalog-import-heading', 'Or give its document'), {
      id: 'item-catalog-import-document-heading',
    });
    field.setAttribute('aria-labelledby', heading.id);
    const hint = element(
      'div',
      'item-catalog-muted',
      'The data of one definition: exactly { item, stats, render }, every field and no other. Its render names the primary render and the layout on IPFS by CID.',
    );
    hint.id = 'item-catalog-import-hint';
    field.setAttribute('aria-describedby', hint.id);
    const problems = element('div', 'item-catalog-import-problems');
    problems.setAttribute('role', 'alert');
    const show = (lines) => problems.replaceChildren(...lines.map((line) => element('span', 'item-catalog-bad', line)));

    const check = element('button', 'item-catalog-button', ' Check document');
    check.type = 'submit';
    check.prepend(element('i', 'fa-solid fa-file-circle-check'));
    const file = Object.assign(element('input'), { type: 'file', accept: '.json,application/json', hidden: true });
    file.setAttribute('aria-label', 'JSON file of a definition document');
    const attach = button('Attach JSON file', () => file.click(), 'fa-solid fa-paperclip');
    file.onchange = async () => {
      const [chosen] = file.files;
      file.value = '';
      if (!chosen) return;
      if (chosen.size > DEFINITION_DOCUMENT_BYTES)
        return show([
          `${chosen.name} is over ${DEFINITION_DOCUMENT_BYTES / 1024} KB: it holds no definition document.`,
        ]);
      field.value = await chosen.text();
      form.requestSubmit(check);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const local = ItemCatalogCyberia.documentProblems(field.value);
      show(local);
      if (local.length === 0)
        busy(check, 'Checking', () => ItemCatalogCyberia.previewImport({ document: field.value }, ''));
    };
    const actions = element('div', 'item-catalog-import-actions');
    actions.append(attach, check, file);
    form.append(field, hint, actions, problems);
    return [heading, form];
  }

  /** What the browser finds wrong with a document before the server checks it. */
  static documentProblems(text) {
    if (!text.trim()) return ['Paste a definition document, or attach its JSON file.'];
    if (new TextEncoder().encode(text).length > DEFINITION_DOCUMENT_BYTES)
      return [`A definition document holds at most ${DEFINITION_DOCUMENT_BYTES / 1024} KB.`];
    try {
      return definitionDocumentProblems(JSON.parse(text));
    } catch (error) {
      return [`The document is not JSON: ${error.message}`];
    }
  }

  /** Lists the canonical definitions of the authority a search names. */
  static async searchImport(q) {
    const results = s('.item-catalog-import-results');
    if (!q || !results) return;
    results.replaceChildren(pending('Searching the authority'));
    const response = await CyberiaItemCatalogService.importSearch({ q });
    if (response.status !== 'success')
      return results.replaceChildren(element('div', 'item-catalog-bad', response.message));
    const rows = response.data.data.map((row) => {
      const line = element('div', 'item-catalog-row');
      line.append(
        element('strong', '', row.itemId),
        element('span', 'item-catalog-muted', `${row.itemType} · ${row.profile}`),
        element('code', '', shortCid(row.cid)),
        element('span', 'item-catalog-muted', stamp(row.createdAt)),
        ...(row.archived ? [statusBadge('archived')] : []),
        button('Preview', () => ItemCatalogCyberia.previewImport({ cid: row.cid }, ''), 'fa-solid fa-eye'),
      );
      return line;
    });
    results.replaceChildren(
      ...(rows.length ? rows : [element('div', 'item-catalog-muted', 'No canonical definition matches.')]),
    );
  }

  /**
   * Reads what an import would do for an item id, and shows it.
   * @param {{cid:string}|{document:string}} request - The definition, by its CID or by its document.
   * @param {string} itemId - Empty for the item id of the definition.
   */
  static async previewImport(request, itemId) {
    const holder = s('.item-catalog-import-preview');
    if (!holder) return;
    ItemCatalogCyberia.importRequest = request;
    holder.replaceChildren(pending('Reading the definition and rebuilding its render'));
    const response =
      request.document === undefined
        ? await CyberiaItemCatalogService.importPreview({ cid: request.cid, itemId })
        : await CyberiaItemCatalogService.importDocumentPreview({ document: request.document, itemId });
    if (response.status !== 'success')
      return holder.replaceChildren(element('div', 'item-catalog-bad', response.message));
    ItemCatalogCyberia.showImportPreview(response.data);
  }

  /** One frame of a render, drawn as the game draws its pixels; a note when there is none. */
  static frameCanvas(frame) {
    if (!frame) return element('span', 'item-catalog-muted', 'No render');
    try {
      const source = fromWire(frame);
      const canvas = element('canvas', 'item-catalog-import-frame');
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `The ${frame.keyframe} frame`);
      const context = canvas.getContext('2d');
      const image = context.createImageData(source.width, source.height);
      image.data.set(rgbaFrame(source, source.frames[frame.keyframe][0]).flat(2));
      context.putImageData(image, 0, 0);
      return canvas;
    } catch {
      return element('span', 'item-catalog-bad', 'The frame does not decode');
    }
  }

  /**
   * The preview of an import: the frame, the source and identity, what the import stores here, what
   * the server checked, and the optional binding. Import stays off until the warnings are confirmed,
   * there is something to do, and a replacement is decided.
   */
  static showImportPreview(preview) {
    const holder = s('.item-catalog-import-preview');
    if (!holder) return;
    const { cid, source, item, profile, render, stores, validation, target } = preview;
    const frames = render ? Object.values(render.frames).reduce((sum, value) => sum + value, 0) : 0;
    const added = [
      stores.definition && 'its definition',
      stores.frames && 'its render frames',
      stores.atlas && 'its atlas',
    ]
      .filter(Boolean)
      .join(', ');
    const facts = element('div', 'item-catalog-import-facts');
    facts.append(
      element('strong', '', `${item.id} · ${item.type}`),
      element('span', 'item-catalog-muted', item.description || 'No description'),
      element('code', '', cid),
      element(
        'span',
        'item-catalog-muted',
        source.at === 'document'
          ? `From the document: ${source.domain} does not hold it yet, so the import publishes it there.`
          : `From ${source.domain}${source.createdBy ? `, stored there by ${source.createdBy}` : ''} · ${stamp(source.createdAt)}`,
      ),
      element('span', 'item-catalog-muted', `Profile ${profile.id} v${profile.version}`),
      element(
        'span',
        'item-catalog-muted',
        render
          ? `${render.width} × ${render.height} px · ${frames} frames in ${Object.keys(render.frames).length} keyframes · ${render.colors} colors`
          : 'No render frames',
      ),
      element(
        'span',
        'item-catalog-muted',
        added ? `The import stores ${added} here.` : 'This host stores all of it already.',
      ),
    );
    const head = element('div', 'item-catalog-row');
    head.append(ItemCatalogCyberia.frameCanvas(render?.preview), facts);

    const checks = element('div', 'item-catalog-import-facts');
    for (const problem of validation.problems) checks.append(element('span', 'item-catalog-bad', problem));
    const confirm = Object.assign(element('input'), { type: 'checkbox', disabled: !validation.ok });
    const confirmLabel = element('label', 'item-catalog-check');
    confirmLabel.append(confirm, element('span', 'item-catalog-warn', `I confirm: ${validation.warnings.join('; ')}`));
    checks.append(validation.ok ? confirmLabel : element('span', 'item-catalog-bad', 'It does not import.'));

    const bind = Object.assign(element('input'), { type: 'checkbox', checked: ItemCatalogCyberia.importBind });
    const bindLabel = element('label', 'item-catalog-check');
    bindLabel.append(bind, element('span', '', 'Bind an item to it now'));
    const bindHint = element(
      'span',
      'item-catalog-muted',
      'Without a bind, the import only adds it to the live content: no item runs it until a bind.',
    );

    const targetRow = element('form', 'item-catalog-row');
    const targetInput = Object.assign(element('input'), { value: target.itemId, maxLength: 128 });
    targetInput.setAttribute('aria-label', 'Item id the definition binds to');
    const check = element('button', 'item-catalog-button', 'Check item id');
    check.type = 'submit';
    targetRow.append(element('span', '', 'Bind to'), targetInput, check);
    targetRow.onsubmit = (event) => {
      event.preventDefault();
      ItemCatalogCyberia.previewImport(ItemCatalogCyberia.importRequest, targetInput.value.trim());
    };

    const binding = element('div', 'item-catalog-import-facts');
    const replace = Object.assign(element('input'), { type: 'checkbox' });
    if (target.unchanged)
      binding.append(element('span', 'item-catalog-muted', `${target.itemId} runs this definition already.`));
    else if (target.replaces) {
      const replaceLabel = element('label', 'item-catalog-check');
      replaceLabel.append(
        replace,
        element(
          'span',
          'item-catalog-warn',
          `Replace the binding of ${target.itemId}: it runs ${shortCid(target.boundCid)} at binding revision ${target.revision}. That definition stays stored, and the history keeps it.`,
        ),
      );
      const current = element('img', 'item-catalog-preview');
      current.alt = `What ${target.itemId} runs now`;
      current.onerror = () =>
        current.replaceWith(element('span', 'item-catalog-muted', 'No preview of what it runs now'));
      current.src = AtlasSpriteSheetService.idlePreviewUrl(target.boundCid);
      binding.append(current, replaceLabel);
    } else
      binding.append(
        element('span', 'item-catalog-muted', `${target.itemId} runs no definition now: the import binds it.`),
      );
    const bindPanel = element('div', 'item-catalog-import-bind');
    bindPanel.append(targetRow, binding);

    const run = element('button', 'item-catalog-button item-catalog-import-run');
    run.type = 'button';
    run.onclick = () => ItemCatalogCyberia.runImport(preview, { bind: bind.checked, replace: replace.checked }, run);
    const sync = () => {
      const binds = bind.checked && !target.unchanged;
      bindPanel.hidden = !bind.checked;
      bindHint.hidden = bind.checked;
      run.disabled = !validation.ok || !confirm.checked || (binds ? target.replaces && !replace.checked : !added);
      run.replaceChildren(element('i', 'fa-solid fa-cloud-arrow-down'), binds ? ' Import and bind' : ' Import');
    };
    confirm.onchange = sync;
    replace.onchange = sync;
    bind.onchange = () => {
      ItemCatalogCyberia.importBind = bind.checked;
      sync();
    };
    sync();
    const card = element('div', 'item-catalog-import-card');
    card.append(head, checks, bindLabel, bindHint, bindPanel, run);
    holder.replaceChildren(card);
  }

  /** Imports the previewed definition once the moderator confirms, binds the item when asked, and shows the result. */
  static async runImport(preview, { bind, replace }, run) {
    const { cid, target } = preview;
    const binds = bind && !target.unchanged;
    const answer = await Modal.RenderConfirm({
      id: 'item-catalog-import-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          ${
            binds
              ? `Import ${shortCid(cid)} and bind ${target.itemId} to it? Every world that names ${target.itemId} runs it after its next reload.`
              : `Import ${shortCid(cid)} into the live content? No item binding changes.`
          }
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const request = ItemCatalogCyberia.importRequest;
    const response = await busy(run, 'Importing', () =>
      CyberiaItemCatalogService.importDefinition({
        ...request,
        itemId: target.itemId,
        bind,
        ...(bind ? { expectedCid: target.boundCid, replace } : {}),
        acknowledged: true,
      }),
    );
    if (response.status !== 'success') {
      refusal(response);
      return await ItemCatalogCyberia.previewImport(request, target.itemId);
    }
    const { binding } = response.data;
    notify(
      binding === 'bound' || binding === 'replaced'
        ? `${target.itemId} runs ${shortCid(cid)}, imported into the live content.`
        : `${shortCid(cid)} is in the live content${binding === 'unchanged' ? `, and ${target.itemId} runs it` : ''}.`,
      'success',
    );
    await Promise.all([
      ItemCatalogCyberia.refreshList(),
      ...(binding === 'none' ? [] : [ItemCatalogCyberia.showItem(target.itemId)]),
      ItemCatalogCyberia.previewImport(request, target.itemId),
    ]);
  }

  /** Shows how a definition is stored on IPFS, below its row: one line for each file. */
  static async showIpfs(itemId, cid, row) {
    const response = await CyberiaItemCatalogService.getDiagnostics({ itemId, cid });
    if (response.status !== 'success') return refusal(response);
    const yes = (value) => (value === null ? 'unknown' : value ? 'yes' : 'no');
    const lines = response.data.files.map((file) => {
      const line = element('div', 'item-catalog-row item-catalog-muted');
      line.append(
        element('code', '', file.path),
        element('span', '', `cid ${shortCid(file.cid)}`),
        element('span', '', `recorded ${yes(file.registered)}`),
        element('span', '', `pinned ${yes(file.pinned)}`),
        element('span', '', `cluster ${yes(file.cluster)}`),
        element(
          'span',
          '',
          file.listedCid === file.cid ? 'listed' : file.listedCid ? `lists ${shortCid(file.listedCid)}` : 'not listed',
        ),
      );
      return line;
    });
    row.after(...lines);
  }
}

export { ItemCatalogCyberia };
