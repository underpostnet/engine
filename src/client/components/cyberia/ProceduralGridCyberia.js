/**
 * A server-paged AG Grid of a Studio view. The page, the filter and the sort belong to
 * the server: the grid sends them with each read and shows the rows that come back, so a list of any
 * size costs one page. A multi-select grid keeps the rows a moderator ticked across pages.
 *
 * @module src/client/components/cyberia/ProceduralGridCyberia.js
 */
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { darkTheme } from '../core/Css.js';
import { htmls, s } from '../core/VanillaJs.js';

const PAGE_SIZE = 10;

class ProceduralGrid {
  static Tokens = {};

  /**
   * Renders a grid and its pager. Call {@link ProceduralGrid.load} once the markup is in the page.
   * @param {Object} options
   * @param {string} options.id
   * @param {string} options.height - CSS height of the grid.
   * @param {Object[]} options.columnDefs - AG Grid columns; the field of a filtered or sorted column is the server field.
   * @param {(row:Object)=>string} options.rowId - The stable id of a row.
   * @param {(query:{page:number,limit:number,filterModel:Object,sortModel:Object[]})=>Promise<{data:Object[],total:number}|null>} options.fetch
   * @param {boolean} [options.selectable] - Whether a moderator ticks rows.
   * @param {(row:Object)=>void} [options.onRowClicked]
   * @param {()=>void} [options.onSelectionChanged] - Runs when the ticked rows change.
   * @returns {Promise<string>}
   */
  static async instance(options) {
    const { id, height, columnDefs, rowId, selectable = false, onRowClicked } = options;
    ProceduralGrid.Tokens[id] = { ...options, page: 1, total: 0, filterModel: {}, sortModel: [], selected: new Map() };
    const grid = ProceduralGrid.Tokens[id];
    const refetch = () => {
      if (grid.quiet) return;
      const api = AgGrid.grids[id];
      grid.filterModel = api.getFilterModel() ?? {};
      grid.sortModel = api
        .getColumnState()
        .filter(({ sort }) => sort)
        .map(({ colId, sort }) => ({ colId, sort }));
      grid.page = 1;
      return ProceduralGrid.load(id);
    };
    const pager = async (action, icon, label) =>
      await BtnIcon.instance({
        class: `procedural-grid-${id}-${action}`,
        label: html`<i class="${icon}"></i> ${label}`,
        style: 'min-width: 6rem;',
      });
    return html`${await AgGrid.instance({
        id,
        darkTheme,
        style: { width: '100%', 'max-width': '100%', height },
        gridOptions: {
          rowData: [],
          columnDefs,
          defaultColDef: { flex: 1, minWidth: 90, resizable: true, sortable: false, filter: false },
          getRowId: ({ data }) => rowId(data),
          suppressColumnVirtualisation: true,
          onFilterChanged: refetch,
          onSortChanged: refetch,
          onRowClicked: ({ data }) => onRowClicked?.(data),
          ...(selectable && {
            rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: false, enableClickSelection: false },
            onSelectionChanged: ({ source }) => ProceduralGrid.ticked(id, source),
            onRowDataUpdated: () => ProceduralGrid.restore(id),
          }),
        },
      })}
      <div class="procedural-pager">
        ${await pager('prev', 'fa-solid fa-chevron-left', 'Prev')}
        <span class="procedural-grid-${id}-page procedural-muted"></span>
        ${await pager('next', 'fa-solid fa-chevron-right', 'Next')}
      </div>`;
  }

  /** Reads the current page from the server and shows it. Resolves with the rows, or null when the read failed. */
  static async load(id) {
    const grid = ProceduralGrid.Tokens[id];
    const { page, filterModel, sortModel } = grid;
    const result = await grid.fetch({ page, limit: PAGE_SIZE, filterModel, sortModel });
    if (!result) return null;
    grid.total = result.total;
    AgGrid.grids[id]?.setGridOption('rowData', result.data);
    const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
    htmls(`.procedural-grid-${id}-page`, `${page} / ${pages} · ${result.total}`);
    for (const [action, step, off] of [
      ['prev', -1, page <= 1],
      ['next', 1, page >= pages],
    ]) {
      const button = s(`.procedural-grid-${id}-${action}`);
      if (!button) continue;
      button.onclick = () => ProceduralGrid.turn(id, step);
      button.disabled = off;
    }
    return result.data;
  }

  static turn(id, step) {
    const grid = ProceduralGrid.Tokens[id];
    grid.page = Math.max(1, grid.page + step);
    return ProceduralGrid.load(id);
  }

  /** Records the rows the moderator ticks or clears; a selection the grid itself restores is not one. */
  static ticked(id, source) {
    const grid = ProceduralGrid.Tokens[id];
    if (grid.restoring || source === 'api') return;
    AgGrid.grids[id].forEachNode((node) => {
      if (node.isSelected()) grid.selected.set(grid.rowId(node.data), node.data);
      else grid.selected.delete(grid.rowId(node.data));
    });
    grid.onSelectionChanged?.();
  }

  /** Ticks again the rows of the page that were ticked before, after the page changed. */
  static restore(id) {
    const grid = ProceduralGrid.Tokens[id];
    grid.restoring = true;
    AgGrid.grids[id].forEachNode((node) => node.setSelected(grid.selected.has(grid.rowId(node.data))));
    grid.restoring = false;
  }

  /** The rows ticked, over every page. */
  static selection(id) {
    return [...ProceduralGrid.Tokens[id].selected.values()];
  }

  /** Back to the first page with no filter, no sort and nothing ticked. */
  static async reset(id) {
    const grid = ProceduralGrid.Tokens[id];
    Object.assign(grid, { page: 1, filterModel: {}, sortModel: [] });
    grid.selected.clear();
    const api = AgGrid.grids[id];
    grid.quiet = true;
    api?.setFilterModel(null);
    api?.applyColumnState({ defaultState: { sort: null } });
    api?.deselectAll();
    grid.quiet = false;
    grid.onSelectionChanged?.();
    return await ProceduralGrid.load(id);
  }
}

export { ProceduralGrid };
