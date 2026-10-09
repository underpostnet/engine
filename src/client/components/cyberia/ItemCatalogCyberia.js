/**
 * The Cyberia Item Catalog view: which exact definition the runtime runs for each item, and the one
 * place a moderator changes it. The grid lists every binding with the state of its definition; a
 * row opens the definitions the item could run, its binding history and how its definition is
 * stored on IPFS. A bind names the definition the moderator saw the item run, so a concurrent bind
 * answers 409 and changes nothing.
 *
 * @module src/client/components/cyberia/ItemCatalogCyberia.js
 */
import { ValueListFilter } from '../core/AgGrid.js';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { s } from '../core/VanillaJs.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { ProceduralGrid } from './ProceduralGridCyberia.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';

const GRID = 'item-catalog-grid';
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
const statusBadge = (status) => {
  const { label, tone } = STATUSES[status] ?? { label: status, tone: 'warn' };
  return element('span', `item-catalog-status item-catalog-status-${tone}`, label);
};

class ItemCatalogCyberia {
  static canBind = false;
  /** The item the details show. */
  static itemId = '';

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
    .item-catalog .item-catalog-row button,
    .item-catalog .item-catalog-cell-actions button {
      padding: 2px 10px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .item-catalog .item-catalog-row button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .item-catalog .item-catalog-cell-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 0;
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
          for (const [label, icon, run] of [
            ['Open', 'fa-solid fa-pen', () => ItemCatalogCyberia.openStudio(data.objectLayerCid)],
            ['Change Binding', 'fa-solid fa-link', () => ItemCatalogCyberia.showItem(data.itemId)],
            ['View History', 'fa-solid fa-clock-rotate-left', () => ItemCatalogCyberia.showItem(data.itemId)],
          ]) {
            const control = element('button', '', ` ${label}`);
            control.type = 'button';
            control.prepend(element('i', icon));
            control.onclick = (event) => {
              event.stopPropagation();
              run();
            };
            cell.append(control);
          }
          return cell;
        },
      },
    ];
  }

  static async render(options = {}) {
    const role = options.appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    ItemCatalogCyberia.canBind = commonModeratorGuard(role);
    ItemCatalogCyberia.itemId = '';
    setTimeout(() => ProceduralGrid.load(GRID));
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
          ${await ProceduralGrid.instance({
            id: GRID,
            height: '420px',
            columnDefs: ItemCatalogCyberia.columns(),
            rowId: (row) => row.itemId,
            fetch: (query) => ItemCatalogCyberia.fetchPage(query),
            onRowClicked: (row) => ItemCatalogCyberia.showItem(row.itemId),
          })}
        </div>
        <div class="in studio-group">
          <div class="in studio-group-title"><i class="fa-solid fa-clock-rotate-left"></i> Item</div>
          <div class="in item-catalog-details item-catalog-muted">
            Select an item to see its definitions and history.
          </div>
        </div>
      </div>`;
  }

  static async fetchPage(query) {
    const response = await CyberiaItemCatalogService.get(query);
    if (response.status !== 'success') {
      refusal(response);
      return null;
    }
    return response.data;
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
      element('span', 'item-catalog-muted', ` runs ${shortCid(objectLayerCid)}`),
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
      const open = element('button', '', 'Open');
      open.type = 'button';
      open.onclick = () => ItemCatalogCyberia.openStudio(definition.cid);
      const bind = element('button', '', 'Bind as Runtime Version');
      bind.type = 'button';
      bind.disabled = !ItemCatalogCyberia.canBind || active || definition.archived || definition.origin === 'draft';
      bind.onclick = () => ItemCatalogCyberia.bind(itemId, definition.cid, objectLayerCid);
      const ipfs = element('button', '', 'IPFS');
      ipfs.type = 'button';
      ipfs.disabled = !ItemCatalogCyberia.canBind;
      ipfs.onclick = () => ItemCatalogCyberia.showIpfs(itemId, definition.cid, row);
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
    await Promise.all([ProceduralGrid.load(GRID), ItemCatalogCyberia.showItem(itemId)]);
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
