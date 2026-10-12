/**
 * The Cyberia Item Catalog view: which exact definition the runtime runs for each item, and the one
 * place a moderator changes it. The grid lists every binding with the state of its definition, a
 * page at a time from the `page` and `limit` query parameters; a row opens the definitions the item
 * could run, its binding history and how its definition is stored on IPFS. Add binding opens the same view for an item with no binding. A bind names the
 * definition the moderator saw the item run, so a concurrent bind answers 409 and changes nothing.
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
      margin-bottom: 8px;
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
    const historyRows = history.map(({ objectLayerCid: cid, previousCid, source, by, at }) => {
      const row = element('div', 'item-catalog-row');
      row.append(
        element('span', '', stamp(at)),
        element('code', '', `${shortCid(previousCid)} → ${shortCid(cid)}`),
        element('span', 'item-catalog-muted', `${ORIGINS[source] ?? source}${by ? ` by ${by}` : ''}`),
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
