import { AgGrid } from '../../components/core/AgGrid.js';
import { BtnIcon } from '../../components/core/BtnIcon.js';
import { getId, getValueFromJoinString, timer } from '../../components/core/CommonJs.js';
import { darkTheme } from '../../components/core/Css.js';
import { EventsUI } from '../../components/core/EventsUI.js';
import { loggerFactory } from '../../components/core/Logger.js';
import { Modal } from '../../components/core/Modal.js';
import { NotificationManager } from '../../components/core/NotificationManager.js';
import { Translate } from '../../components/core/Translate.js';
import { getQueryParams, listenQueryParamsChange, RouterEvents, setQueryParams } from '../../components/core/Router.js';
import { s } from '../../components/core/VanillaJs.js';
import { DefaultService } from './default.service.js';

const logger = loggerFactory(import.meta);

const DefaultOptions = {
  idModal: 'modal-default-management',
  serviceId: 'default-management',
  entity: 'default',
  columnDefs: [
    { field: '0', headerName: '0', cellClassRules: { 'row-new-highlight': (params) => true } },
    { field: '1', headerName: '1' },
    { field: '2', headerName: '2' },
    { field: 'createdAt', headerName: 'createdAt', cellDataType: 'date', editable: false },
    { field: 'updatedAt', headerName: 'updatedAt', cellDataType: 'date', editable: false },
  ],
  defaultColKeyFocus: '0',
  ServiceProvider: DefaultService,
  permissions: {
    add: true,
    remove: true,
    reload: true,
  },
  paginationOptions: {
    limitOptions: [10, 20, 50, 100],
  },
};

const columnDefFormatter = (obj, columnDefs, customFormat) => {
  for (const colDef of columnDefs)
    switch (colDef.cellDataType) {
      case 'date':
        obj[colDef.field] = obj[colDef.field] ? new Date(obj[colDef.field]) : new Date();
        break;
      case 'boolean':
        if (obj[colDef.field] !== true && obj[colDef.field] !== false) obj[colDef.field] = false;
      default:
        break;
    }
  return customFormat ? customFormat(obj) : obj;
};

const DefaultManagement = {
  Tokens: {},
  // Helper functions for managing serviceOptions ID filter
  setIdFilter: function (id, itemId) {
    if (!this.Tokens[id]) {
      this.Tokens[id] = {};
    }
    if (!this.Tokens[id].serviceOptions) {
      this.Tokens[id].serviceOptions = {};
    }
    if (!this.Tokens[id].serviceOptions.get) {
      this.Tokens[id].serviceOptions.get = {};
    }
    this.Tokens[id].serviceOptions.get.id = itemId;
  },
  clearIdFilter: function (id) {
    if (this.Tokens[id]?.serviceOptions?.get?.id) {
      delete this.Tokens[id].serviceOptions.get.id;
    }
  },
  getIdFilter: function (id) {
    return this.Tokens[id]?.serviceOptions?.get?.id ?? undefined;
  },
  waitGridReady: function (id) {
    return new Promise((resolve) => {
      if (this.Tokens[id]?.gridApi) {
        return resolve(this.Tokens[id].gridApi);
      }
      if (!this.Tokens[id].readyGridEvent) this.Tokens[id].readyGridEvent = {};
      this.Tokens[id].readyGridEvent['waitGridReady'] = (params) => {
        delete this.Tokens[id].readyGridEvent['waitGridReady'];
        resolve(params.api);
      };
    });
  },
  runIsolated: async function (id, callback) {
    if (!this.Tokens[id]) return await callback();
    this.Tokens[id].isProcessingQueryChange = true;
    try {
      return await callback();
    } finally {
      this.Tokens[id].isProcessingQueryChange = false;
    }
  },
  loadTable: async function (id, options = {}) {
    options = { reload: true, force: true, createHistory: false, skipUrlUpdate: false, ...options };
    try {
      if (!this.Tokens[id]) {
        logger.warn(`DefaultManagement loadTable - Token not found for id: ${id}`);
        return;
      }
      const { serviceId, columnDefs, customFormat, gridId } = this.Tokens[id];

      let _page = this.Tokens[id].page;
      let _limit = this.Tokens[id].limit;
      let _id = this.getIdFilter(id);

      let filterModel = this.Tokens[id].filterModel || {};
      let sortModel = this.Tokens[id].sortModel || [];

      const gridApi = this.Tokens[id].gridApi || AgGrid.grids[gridId];

      if (gridApi) {
        filterModel = gridApi.getFilterModel() || {};
        const columnState = gridApi.getColumnState();
        if (columnState) {
          sortModel = columnState
            .filter((col) => col.sort)
            .map((col) => ({ colId: col.colId, sort: col.sort, sortIndex: col.sortIndex }))
            .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
        }
      }

      // Clean up filterModel and sortModel for URL params
      const filterModelStr = Object.keys(filterModel).length > 0 ? JSON.stringify(filterModel) : null;
      const sortModelStr = sortModel.length > 0 ? JSON.stringify(sortModel) : null;

      // Update URL parameters to reflect current grid state
      // Use pushState (createHistory) for filter/sort changes to enable browser back/forward
      // Skip URL update when handling browser navigation to avoid interfering with history
      if (!options.skipUrlUpdate) {
        const urlParams = {
          page: _page,
          limit: _limit,
          filterModel: filterModelStr,
          sortModel: sortModelStr,
          id: _id ? _id : '',
        };
        setQueryParams(urlParams, { replace: !options.createHistory });
      }

      if (!options.force && this.Tokens[id].lastOptions) {
        const last = this.Tokens[id].lastOptions;
        if (
          _page === last.page &&
          _limit === last.limit &&
          _id === last.id &&
          JSON.stringify(filterModel) === JSON.stringify(last.filterModel) &&
          JSON.stringify(sortModel) === JSON.stringify(last.sortModel)
        ) {
          logger.warn(`DefaultManagement loadTable ${serviceId} - Skipping load, options unchanged`);
          return;
        }
      }
      this.Tokens[id].lastOptions = {
        page: _page,
        limit: _limit,
        id: _id,
        filterModel,
        sortModel,
      };

      // Update tokens with current state
      this.Tokens[id].filterModel = filterModel;
      this.Tokens[id].sortModel = sortModel;

      const queryOptions = {
        page: _page,
        limit: _limit,
      };

      if (_id) {
        queryOptions.id = _id;
      }

      if (filterModel && Object.keys(filterModel).length > 0) {
        queryOptions.filterModel = filterModel;
      }

      if (sortModel && sortModel.length > 0) {
        queryOptions.sortModel = sortModel;
        // Legacy simple sort support
        if (sortModel.length === 1) {
          queryOptions.sort = sortModel[0].colId;
          queryOptions.asc = sortModel[0].sort === 'asc' ? '1' : '0';
        }
      }

      logger.info(`Loading table ${serviceId}`, {
        id,
        idFilter: _id,
        page: _page,
        limit: _limit,
        hasFilters: Object.keys(filterModel).length > 0,
      });

      if (!this.Tokens[id] || !this.Tokens[id].ServiceProvider) {
        logger.warn(`DefaultManagement loadTable ${serviceId} - ServiceProvider not found for token ${id}`);
        return;
      }

      const result = await this.Tokens[id].ServiceProvider.get(queryOptions);
      if (result.status === 'success') {
        let data, total, page, totalPages;

        // Handle both single object (when querying by ID) and paginated array responses
        if (queryOptions.id && result.data && !Array.isArray(result.data.data)) {
          // Single object response when filtering by ID
          data = [result.data];
          total = 1;
          page = 1;
          totalPages = 1;
        } else {
          // Paginated array response
          ({ data = [], total = 0, page = 1, totalPages = 1 } = result.data || {});
        }

        this.Tokens[id].total = total;
        this.Tokens[id].page = page;
        this.Tokens[id].totalPages = totalPages;
        const rowDataScope = data.map((row) => columnDefFormatter(row, columnDefs, customFormat));
        if (options.reload) {
          const grid = AgGrid.grids[this.Tokens[id].gridId];
          if (grid && grid.setGridOption) {
            grid.setGridOption('rowData', rowDataScope);
          } else {
            logger.warn(`Grid ${gridId} not found or not ready for setGridOption`);
          }
        }
        const paginationComp = s(`#ag-pagination-${this.Tokens[id].gridId}`);
        if (paginationComp) {
          paginationComp.setAttribute('current-page', this.Tokens[id].page);
          paginationComp.setAttribute('total-pages', this.Tokens[id].totalPages);
          paginationComp.setAttribute('total-items', this.Tokens[id].total);
        } else {
          logger.warn(`Pagination component not found for grid ${gridId}`);
        }
        setTimeout(async () => {
          if (DefaultManagement.Tokens[id].readyRowDataEvent)
            for (const event of Object.keys(DefaultManagement.Tokens[id].readyRowDataEvent))
              await DefaultManagement.Tokens[id].readyRowDataEvent[event](rowDataScope);
        }, 1);
        // Update clear filter button visibility
        this.updateClearFilterButtonVisibility(id);
      } else {
        logger.error(`Failed to load table ${serviceId}:`, result);
      }
    } catch (error) {
      logger.error(`Error in loadTable for ${id}:`, error);
      throw error;
    }
  },
  hasActiveFilters: function (id) {
    const gridId = this.Tokens[id]?.gridId;
    if (!gridId) return false;

    const gridApi = AgGrid.grids[gridId];
    const filterModel = gridApi ? gridApi.getFilterModel() : {};
    const idFilter = this.getIdFilter(id);
    const sortModel = this.Tokens[id]?.sortModel || [];

    return Object.keys(filterModel).length > 0 || !!idFilter || sortModel.length > 0;
  },
  updateClearFilterButtonVisibility: function (id) {
    const clearFilterBtn = s(`.management-table-btn-clear-filter-${id}`);
    if (!clearFilterBtn) return;

    if (this.hasActiveFilters(id)) {
      clearFilterBtn.classList.remove('hide');
    } else {
      clearFilterBtn.classList.add('hide');
    }
  },
  refreshTable: async function (id) {
    const gridApi = AgGrid.grids[this.Tokens[id].gridId];
    if (gridApi) {
      // Use refreshCells with change detection for optimal performance
      // This is preferred over redrawRows() as it only updates changed cells
      gridApi.refreshCells({
        force: false, // Use change detection - only refresh cells whose values have changed
        suppressFlash: false, // Show flash animation for changed cells (requires enableCellChangeFlash)
      });
    }
  },
  RenderTable: async function (options = DefaultOptions) {
    if (!options) options = DefaultOptions;
    const { serviceId, columnDefs, entity, defaultColKeyFocus, ServiceProvider, permissions, paginationOptions } =
      options;
    logger.info('DefaultManagement RenderTable', options);
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    const queryParamsListenerId = `default-management-${id}`;
    const queryParams = getQueryParams();
    const page = parseInt(queryParams.page) || 1;
    const defaultLimit = paginationOptions?.limitOptions?.[0] || 10;
    const limit = parseInt(queryParams.limit) || defaultLimit;
    const urlId = queryParams.id || undefined;

    let filterModel = {};
    let sortModel = [];
    try {
      if (queryParams.filterModel) filterModel = JSON.parse(queryParams.filterModel);
      if (queryParams.sortModel) sortModel = JSON.parse(queryParams.sortModel);
    } catch (e) {
      logger.warn('Error parsing filter/sort model from URL', e);
    }

    // Enhance column definitions for Date filtering and ensure colId
    const enhancedColumnDefs = columnDefs.map((col) => {
      const enhancedCol = {
        ...col,
        colId: col.field, // Ensure colId matches field
      };

      if (enhancedCol.cellDataType === 'date' || enhancedCol.filter === 'agDateColumnFilter') {
        enhancedCol.filter = 'agDateColumnFilter';

        // Value getter to ensure date is properly parsed
        if (!enhancedCol.valueGetter) {
          enhancedCol.valueGetter = (params) => {
            const value = params.data?.[enhancedCol.field];
            if (!value) return null;
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
          };
        }

        // Value formatter for display
        if (!enhancedCol.valueFormatter) {
          enhancedCol.valueFormatter = (params) => {
            if (!params.value) return '';
            const date = new Date(params.value);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });
          };
        }

        enhancedCol.filterParams = {
          comparator: (filterLocalDateAtMidnight, cellValue) => {
            if (cellValue == null) return -1;
            const cellDate = new Date(cellValue);
            if (isNaN(cellDate.getTime())) return -1;
            // Compare dates (ignoring time)
            const cellTime = new Date(cellDate).setHours(0, 0, 0, 0);
            const filterTime = filterLocalDateAtMidnight.getTime();
            if (filterTime === cellTime) return 0;
            if (cellTime < filterTime) return -1;
            if (cellTime > filterTime) return 1;
            return 0;
          },
          browserDatePicker: true,
          minValidYear: 2000,
          maxValidYear: 2100,
          inRangeInclusive: true,
          debounceMs: 500,
          ...enhancedCol.filterParams,
        };
      }
      return enhancedCol;
    });

    class RemoveActionGridRenderer {
      eGui;
      tokens;

      async init(params) {
        this.eGui = document.createElement('div');
        this.tokens = {};
        const { rowIndex } = params;
        const { createdAt, updatedAt } = params.data;

        const cellRenderId = getId(this.tokens, `${serviceId}-`);
        this.tokens[cellRenderId] = {};

        this.eGui.innerHTML = html` ${await BtnIcon.Render({
          label: html`<div class="abs center">
            <i class="fas fa-times"></i>
          </div> `,
          class: `in fll section-mp management-table-btn-mini management-table-btn-remove-${id}-${cellRenderId} ${
            !params.data._id ? 'hide' : ''
          }`,
        })}`;
        setTimeout(() => {
          EventsUI.onClick(
            `.management-table-btn-remove-${id}-${cellRenderId}`,
            async () => {
              const confirmResult = await Modal.RenderConfirm({
                html: async () => {
                  return html`
                    <div class="in section-mp" style="text-align: center">
                      ${Translate.Render('confirm-delete-item')}
                      ${Object.keys(params.data).length > 0
                        ? html`<br />
                            "${options.defaultColKeyFocus
                              ? getValueFromJoinString(params.data, options.defaultColKeyFocus)
                              : params.data[Object.keys(params.data)[0]]}"`
                        : ''}
                    </div>
                  `;
                },
                id: `delete-${params.data._id}`,
              });
              if (confirmResult.status !== 'confirm') return;
              let result;
              if (params.data._id) result = await ServiceProvider.delete({ id: params.data._id });
              else result = { status: 'success' };

              NotificationManager.Push({
                html: result.status === 'error' ? result.message : Translate.Render('item-success-delete'),
                status: result.status,
              });
              if (result.status === 'success') {
                AgGrid.grids[gridId].applyTransaction({ remove: [params.data] });
                const token = DefaultManagement.Tokens[id];
                // if we are on the last page and we delete the last item, go to the previous page
                const newTotal = token.total - 1;
                const newTotalPages = Math.ceil(newTotal / token.limit);
                if (token.page > newTotalPages && newTotalPages > 0) {
                  token.page = newTotalPages;
                }

                // reload the current page
                await DefaultManagement.loadTable(id, { reload: false });
              }
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        return true;
      }
    }

    const finalColumnDefs = (enhancedColumnDefs || []).concat(
      permissions.remove
        ? [
            {
              field: 'remove-action',
              headerName: '',
              width: 100,
              cellRenderer: RemoveActionGridRenderer,
              editable: false,
            },
          ]
        : [],
    );

    this.Tokens[id] = {
      ...this.Tokens[id],
      ...options,
      columnDefs: finalColumnDefs, // Use enhanced definitions including actions
      gridId,
      page,
      limit,
      total: 0,
      totalPages: 1,
      filterModel,
      sortModel,
      isInitializing: true, // Flag to prevent double loading during grid ready
      isProcessingQueryChange: false, // Flag to prevent listener recursion
    };

    // Initialize ID filter from query params if present
    if (urlId) {
      this.setIdFilter(id, urlId);
    }

    setQueryParams({
      page,
      limit,
      id: urlId ? urlId : '',
      filterModel: Object.keys(filterModel).length > 0 ? JSON.stringify(filterModel) : null,
      sortModel: sortModel.length > 0 ? JSON.stringify(sortModel) : null,
    });

    setTimeout(async () => {
      // https://www.ag-grid.com/javascript-data-grid/data-update-transactions/

      // Initial loadTable is now called in onGridReady after grid is fully initialized
      // {
      //   const result = await ServiceProvider.get();
      //   if (result.status === 'success') {
      //     rowDataScope = result.data.map((row) => columnDefFormatter(row, columnDefs, options.customFormat));
      //     AgGrid.grids[gridId].setGridOption('rowData', rowDataScope);
      //   }
      // }
      s(`.management-table-btn-save-${id}`).onclick = () => {
        s(`.management-table-btn-save-${id}`).classList.add('hide');
        // s(`.management-table-btn-stop-${id}`).classList.add('hide');
        if (permissions.add) s(`.management-table-btn-add-${id}`).classList.remove('hide');
        if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.remove('hide');
        if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.remove('hide');
        AgGrid.grids[gridId].stopEditing();
      };
      EventsUI.onClick(`.management-table-btn-add-${id}`, async () => {
        if (options.customEvent && options.customEvent.add) return await options.customEvent.add();

        const rowObj = {};
        for (const def of columnDefs) {
          rowObj[def.field] = '';
        }
        // const result = await ServiceProvider.post({ body: rowObj });
        const result = {
          status: 'success',
          data: rowObj,
        };
        // NotificationManager.Push({
        //   html: result.status === 'error' ? result.message : `${Translate.Render('success-create-item')}`,
        //   status: result.status,
        // });
        if (result.status === 'success') {
          AgGrid.grids[gridId].applyTransaction({
            add: [columnDefFormatter(rowObj, columnDefs, options.customFormat)],
            addIndex: 0,
          });
          // AgGrid.grids[gridId].applyTransaction({
          //   add: [columnDefFormatter(result.data, columnDefs, options.customFormat)],
          //   addIndex: 0,
          // });
          // AgGrid.grids[gridId].applyColumnState({
          //   state: [
          //     // { colId: 'country', sort: 'asc', sortIndex: 1 },
          //     { colId: 'updatedAt', sort: 'desc', sortIndex: 0 },
          //   ],
          //   defaultState: { sort: null },
          // });
        } else {
          // AgGrid.grids[gridId].applyColumnState({
          //   defaultState: { sort: null },
          // });
        }

        // https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/

        const pinned = undefined;
        const key = undefined;

        // setFocusedCell = (
        //   rowIndex: number,
        //   colKey: string  |  Column,
        //   rowPinned?: RowPinnedType
        // ) => void;

        // type RowPinnedType =
        //       'top'
        //     | 'bottom'
        //     | null
        //     | undefined

        AgGrid.grids[gridId].setFocusedCell(0, '0', pinned);

        // interface StartEditingCellParams {
        //   // The row index of the row to start editing
        //   rowIndex: number;
        //   // The column key of the row to start editing
        //   colKey: string  |  Column;
        //   // Set to `'top'` or `'bottom'` to start editing a pinned row
        //   rowPinned?: RowPinnedType;
        //   // The key to pass to the cell editor
        //   key?: string;
        // }

        setTimeout(() => {
          s(`.management-table-btn-save-${id}`).classList.remove('hide');
          // s(`.management-table-btn-stop-${id}`).classList.remove('hide');
          if (permissions.add) s(`.management-table-btn-add-${id}`).classList.add('hide');
          if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.add('hide');
          if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.add('hide');
          AgGrid.grids[gridId].startEditingCell({
            rowIndex: 0,
            colKey: defaultColKeyFocus,
            rowPinned: pinned,
            key: key,
          });
        });
      });

      EventsUI.onClick(`.management-table-btn-stop-${id}`, async () => {
        s(`.management-table-btn-save-${id}`).classList.add('hide');
        // s(`.management-table-btn-stop-${id}`).classList.add('hide');
        if (permissions.add) s(`.management-table-btn-add-${id}`).classList.remove('hide');
        if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.remove('hide');
        if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.remove('hide');
        AgGrid.grids[gridId].stopEditing();
      });
      EventsUI.onClick(`.management-table-btn-clean-${id}`, async () => {
        const confirmResult = await Modal.RenderConfirm(
          {
            html: async () => {
              return html`
                <div class="in section-mp" style="text-align: center;">
                  <strong>${Translate.Render('confirm-delete-all-data')}</strong>
                </div>
              `;
            },
            id: `clean-table-${id}`,
          },
          { context: 'modal' },
        );
        if (confirmResult.status === 'cancelled') return;
        const result = await ServiceProvider.delete();
        NotificationManager.Push({
          html: result.status === 'error' ? result.message : Translate.Render('success-delete-all-items'),
          status: result.status,
        });
        if (result.status === 'success') {
          DefaultManagement.loadTable(id);
        }
      });

      // Listen to query parameter changes for browser back/forward navigation
      listenQueryParamsChange({
        id: queryParamsListenerId,
        event: (queryParams) => {
          // Prevent recursion - if we're already processing a query change, skip
          if (this.Tokens[id].isProcessingQueryChange) {
            return;
          }

          const newPage = parseInt(queryParams.page, 10) || 1;
          const newLimit = parseInt(queryParams.limit, 10) || this.Tokens[id].limit || 10;
          const newFilterModel = queryParams.filterModel;
          const newSortModel = queryParams.sortModel;
          const newId = queryParams.id || undefined;

          let shouldReload = false;

          // Check if id parameter changed
          const currentId = this.getIdFilter(id);
          if (newId !== currentId) {
            if (newId) {
              this.setIdFilter(id, newId);
            } else {
              this.clearIdFilter(id);
            }
            shouldReload = true;
          }

          // Check if page or limit changed
          if (newPage !== this.Tokens[id].page || newLimit !== this.Tokens[id].limit) {
            this.Tokens[id].page = newPage;
            this.Tokens[id].limit = newLimit;
            shouldReload = true;
          }

          // Check if filter or sort changed by comparing with actual grid state
          const gridApi = AgGrid.grids[gridId];
          let filterChanged = false;
          let sortChanged = false;

          if (gridApi) {
            // Get current grid filter state
            const currentGridFilterModel = gridApi.getFilterModel() || {};
            const currentGridFilterStr = JSON.stringify(currentGridFilterModel);
            const newFilterStr = newFilterModel || '{}';

            // Get current grid sort state
            const currentColumnState = gridApi.getColumnState() || [];
            const currentGridSortModel = currentColumnState
              .filter((col) => col.sort)
              .map((col) => ({ colId: col.colId, sort: col.sort, sortIndex: col.sortIndex }))
              .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
            const currentGridSortStr = JSON.stringify(currentGridSortModel);
            const newSortStr = newSortModel || '[]';

            filterChanged = currentGridFilterStr !== newFilterStr;
            sortChanged = currentGridSortStr !== newSortStr;
          }

          if (filterChanged || sortChanged) {
            // Parse and apply the new filter/sort models
            try {
              this.Tokens[id].filterModel = newFilterModel ? JSON.parse(newFilterModel) : {};
            } catch (e) {
              this.Tokens[id].filterModel = {};
            }
            try {
              this.Tokens[id].sortModel = newSortModel ? JSON.parse(newSortModel) : [];
            } catch (e) {
              this.Tokens[id].sortModel = [];
            }

            // Apply filters and sorts to the grid
            if (gridApi) {
              // Temporarily disable filter/sort change handlers to prevent recursion
              this.Tokens[id].isProcessingQueryChange = true;

              if (filterChanged) {
                gridApi.setFilterModel(this.Tokens[id].filterModel);
              }

              if (sortChanged) {
                // Apply sort model
                const columnState = this.Tokens[id].sortModel.map((sortItem) => ({
                  colId: sortItem.colId,
                  sort: sortItem.sort,
                  sortIndex: sortItem.sortIndex,
                }));
                if (columnState.length > 0) {
                  gridApi.applyColumnState({
                    state: columnState,
                    defaultState: { sort: null },
                  });
                } else {
                  gridApi.applyColumnState({
                    defaultState: { sort: null },
                  });
                }
              }

              // Re-enable handlers after a short delay
              setTimeout(() => {
                this.Tokens[id].isProcessingQueryChange = false;
              }, 100);
            }
            shouldReload = true;
          }

          if (shouldReload) {
            // Skip URL update since browser already changed it (back/forward navigation)
            DefaultManagement.loadTable(id, { reload: true, force: true, createHistory: false, skipUrlUpdate: true });
          }
        },
      });

      EventsUI.onClick(`.management-table-btn-clear-filter-${id}`, async () => {
        try {
          const gridApi = AgGrid.grids[gridId];

          // Clear all filters
          DefaultManagement.clearIdFilter(id);
          if (gridApi) {
            gridApi.setFilterModel({});
            gridApi.applyColumnState({ defaultState: { sort: null } });
          }

          // Clear token state
          if (DefaultManagement.Tokens[id]) {
            DefaultManagement.Tokens[id].filterModel = {};
            DefaultManagement.Tokens[id].sortModel = [];
          }

          // Update URL - keep only page and limit
          const queryParams = getQueryParams();
          setQueryParams({
            page: queryParams.page || 1,
            limit: queryParams.limit || DefaultManagement.Tokens[id]?.limit || 10,
            filterModel: null,
            sortModel: null,
            id: null,
          });

          // Reload table
          await DefaultManagement.loadTable(id, { force: true, reload: true });

          NotificationManager.Push({
            html: Translate.Render('success-clear-filter') || 'Filters cleared',
            status: 'success',
          });
        } catch (error) {
          NotificationManager.Push({
            html: error.message || 'Error clearing filters',
            status: 'error',
          });
        }
      });
      EventsUI.onClick(`.management-table-btn-reload-${id}`, async () => {
        try {
          // Reload data from server
          await DefaultManagement.loadTable(id, { force: true, reload: true });

          // Other option: Refresh cells to update UI
          // DefaultManagement.refreshTable(id);

          NotificationManager.Push({
            html: Translate.Render('success-reload-data') || 'Data reloaded successfully',
            status: 'success',
          });
        } catch (error) {
          NotificationManager.Push({
            html: error.message || 'Error reloading data',
            status: 'error',
          });
        } finally {
        }
      });
      s(`#ag-pagination-${gridId}`).addEventListener('page-change', async (event) => {
        const token = DefaultManagement.Tokens[id];
        token.page = event.detail.page;
        // Skip URL update since Pagination component already updated it
        await DefaultManagement.loadTable(id, { skipUrlUpdate: true });
      });
      s(`#ag-pagination-${gridId}`).addEventListener('limit-change', async (event) => {
        const token = DefaultManagement.Tokens[id];
        token.limit = event.detail.limit;
        token.page = 1; // Reset to first page
        // Skip URL update since Pagination component already updated it
        await DefaultManagement.loadTable(id, { skipUrlUpdate: true });
      });
      RouterEvents[id] = async (...args) => {
        const queryParams = getQueryParams();
        const page = parseInt(queryParams.page) || 1;
        const limit = parseInt(queryParams.limit) || 10;
        const urlId = queryParams.id || undefined;
        let filterModel = {};
        let sortModel = [];
        try {
          if (queryParams.filterModel) filterModel = JSON.parse(queryParams.filterModel);
          if (queryParams.sortModel) sortModel = JSON.parse(queryParams.sortModel);
        } catch (e) {}

        const token = DefaultManagement.Tokens[id];

        if (!token) {
          // Token doesn't exist yet, table hasn't been initialized
          return;
        }

        // Check if state in URL is different from current state
        const currentId = DefaultManagement.getIdFilter(id);
        const isIdChanged = currentId !== urlId;
        const isPaginationChanged = token.page !== page || token.limit !== limit;
        const isFilterChanged = JSON.stringify(token.filterModel || {}) !== JSON.stringify(filterModel);
        const isSortChanged = JSON.stringify(token.sortModel || []) !== JSON.stringify(sortModel);

        if (isPaginationChanged || isFilterChanged || isSortChanged || isIdChanged) {
          // Update ID filter from query params
          if (urlId) {
            DefaultManagement.setIdFilter(id, urlId);
          } else {
            DefaultManagement.clearIdFilter(id);
          }

          token.page = page;
          token.limit = limit;
          token.filterModel = filterModel;
          token.sortModel = sortModel;

          // If grid is active, we should update its state to match URL
          const gridApi = AgGrid.grids[gridId];
          if (gridApi && gridApi.setFilterModel && gridApi.applyColumnState) {
            // Updating filter/sort on grid will trigger onFilterChanged/onSortChanged -> loadTable
            // But we must ensure it happens.
            if (isFilterChanged) {
              try {
                gridApi.setFilterModel(filterModel);
              } catch (e) {
                console.warn('Failed to set filter model:', e);
              }
            }
            if (isSortChanged) {
              try {
                gridApi.applyColumnState({
                  state: sortModel,
                  defaultState: { sort: null },
                });
              } catch (e) {
                console.warn('Failed to apply column state:', e);
              }
            }
            // If pagination or ID changed, and no grid-level filter/sort changed, we must load manually
            if ((isPaginationChanged || isIdChanged) && !isFilterChanged && !isSortChanged) {
              await DefaultManagement.loadTable(id);
            }
          } else if (!gridApi) {
            // Grid doesn't exist yet, just load the table data when it's ready
            // The onGridReady event will handle applying the initial state
            logger.warn(`Grid not ready for ${gridId}, state will be applied on grid ready`);
          }
        }
      };
    }, 1);
    return html`<div class="fl management-table-toolbar">
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-add-${id} ${
            permissions.add ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-add-${id}-label"><i class="fa-solid fa-circle-plus"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-save-${id} hide`,
          label: html`<div class="abs center btn-save-${id}-label"><i class="fas fa-save"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-stop-${id} hide`,
          label: html`<div class="abs center btn-save-${id}-label"><i class="fa-solid fa-rectangle-xmark"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-clean-${id} ${
            permissions.remove ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-clean-${id}-label"><i class="fas fa-broom"></i></div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-clear-filter-${id} ${
            Object.keys(filterModel).length > 0 || sortModel.length > 0 || urlId ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-clear-filter-${id}-label">
            <i class="fa-solid fa-filter-circle-xmark"></i>
          </div> `,
          type: 'button',
        })}
        ${await BtnIcon.Render({
          class: `in fll section-mp management-table-btn-mini management-table-btn-reload-${id} ${
            permissions.reload ? '' : 'hide'
          }`,
          label: html`<div class="abs center btn-reload-${id}-label"><i class="fas fa-sync-alt"></i></div> `,
          type: 'button',
        })}
      </div>
      <div class="in section-mp">
        ${await AgGrid.Render({
          id: gridId,
          parentModal: options.idModal,
          usePagination: true,
          paginationOptions,
          customHeightOffset:
            options.customHeightOffset !== undefined
              ? options.customHeightOffset
              : !permissions.add && !permissions.remove && !permissions.reload
                ? 50
                : 0,
          darkTheme: typeof darkTheme !== 'undefined' ? darkTheme : false,
          gridOptions: {
            columnDefs: finalColumnDefs,
            getRowClass: (params) => {
              const idFilter = DefaultManagement.getIdFilter(id);
              if (idFilter && params.data && params.data._id === idFilter) {
                return 'row-new-highlight';
              }
            },
            defaultColDef: {
              flex: 1,
              editable: true,
              cellDataType: false,
              minWidth: 100,
              filter: true,
              autoHeight: true,
            },
            onGridReady: async (params) => {
              this.Tokens[id].gridApi = params.api;

              if (this.Tokens[id].readyGridEvent) {
                for (const key of Object.keys(this.Tokens[id].readyGridEvent)) {
                  await this.Tokens[id].readyGridEvent[key](params);
                }
              }

              params.api.setGridOption('columnDefs', finalColumnDefs);
              // Apply initial state from URL
              const { filterModel, sortModel } = this.Tokens[id];
              if (filterModel && Object.keys(filterModel).length > 0) {
                params.api.setFilterModel(filterModel);
              }
              if (sortModel && sortModel.length > 0) {
                params.api.applyColumnState({
                  state: sortModel,
                  defaultState: { sort: null },
                });
              }
              // Load initial data now that grid is ready
              // Filter/sort state has been applied, this will fetch data from server
              DefaultManagement.loadTable(id).finally(() => {
                // Mark initialization complete to allow future filter/sort events
                this.Tokens[id].isInitializing = false;
              });
            },
            onFilterChanged: () => {
              // Skip if still initializing (state being applied in onGridReady)
              if (this.Tokens[id].isInitializing) return;
              // Skip if we're processing a query change from browser navigation
              if (this.Tokens[id].isProcessingQueryChange) return;
              // Reset to page 1 on filter change
              this.Tokens[id].page = 1;

              // Update clear filter button visibility
              DefaultManagement.updateClearFilterButtonVisibility(id);

              // Create history entry for filter changes
              DefaultManagement.loadTable(id, { reload: true, force: true, createHistory: true });
            },
            onSortChanged: () => {
              // Skip if still initializing (state being applied in onGridReady)
              if (this.Tokens[id].isInitializing) return;
              // Skip if we're processing a query change from browser navigation
              if (this.Tokens[id].isProcessingQueryChange) return;
              // Update clear filter button visibility
              DefaultManagement.updateClearFilterButtonVisibility(id);
              // Create history entry for sort changes
              DefaultManagement.loadTable(id, { reload: true, force: true, createHistory: true });
            },
            editType: 'fullRow', // Keep fullRow for add new row, but cells will auto-save
            // rowData: [],
            onCellValueChanged: async (...args) => {
              const [event] = args;
              // Only auto-save for existing rows (with _id), not new rows
              if (event.data && event.data._id) {
                logger.info('onCellValueChanged - auto-saving', args);
                const body = event.data ? event.data : {};
                const result = await ServiceProvider.put({ id: event.data._id, body });
                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : `${Translate.Render('success-update-item')}`,
                  status: result.status,
                });
                if (result.status === 'success') {
                  AgGrid.grids[gridId].applyTransaction({
                    update: [event.data],
                  });
                  // Restore default buttons after save
                  s(`.management-table-btn-save-${id}`).classList.add('hide');
                  if (permissions.add) s(`.management-table-btn-add-${id}`).classList.remove('hide');
                  if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.remove('hide');
                  if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.remove('hide');
                  DefaultManagement.loadTable(id, { reload: false });
                }
              }
            },
            rowSelection: 'single',
            onSelectionChanged: async (...args) => {
              console.log('onSelectionChanged', args);
              const [event] = args;
              const selectedRows = AgGrid.grids[gridId].getSelectedRows();
              logger.info('selectedRows', selectedRows);
            },
            onCellEditingStarted: async (...args) => {
              const [event] = args;
              // Only show save button for new rows (without _id)
              if (event.data && !event.data._id) {
                s(`.management-table-btn-save-${id}`).classList.remove('hide');
                if (permissions.add) s(`.management-table-btn-add-${id}`).classList.add('hide');
                if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.add('hide');
                if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.add('hide');
              }
            },
            onRowEditingStarted: async (...args) => {
              // Show only save button when editing starts (for new rows)
              s(`.management-table-btn-save-${id}`).classList.remove('hide');
              if (permissions.add) s(`.management-table-btn-add-${id}`).classList.add('hide');
              if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.add('hide');
              if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.add('hide');
            },
            onRowValueChanged: async (...args) => {
              const [event] = args;
              logger.info('onRowValueChanged', args);
              let result;
              if (options.onRowValueChanged) {
                const { status, data, message } = await options.onRowValueChanged(...args);
                if (status === 'success' && data) event.data = data;
                else {
                  NotificationManager.Push({
                    html: message,
                    status,
                  });
                  return;
                }
              }
              if (!event.data._id) {
                result = await ServiceProvider.post({ body: event.data });
                NotificationManager.Push({
                  html: result.status === 'error' ? result.message : `${Translate.Render('success-create-item')}`,
                  status: result.status,
                });
                if (result.status === 'success') {
                  // Filter by the newly created row's ID
                  const newItemId = result.data._id;

                  // Update UI buttons first
                  s(`.management-table-btn-save-${id}`).classList.add('hide');
                  if (permissions.add) s(`.management-table-btn-add-${id}`).classList.remove('hide');
                  if (permissions.remove) s(`.management-table-btn-clean-${id}`).classList.remove('hide');
                  if (permissions.reload) s(`.management-table-btn-reload-${id}`).classList.remove('hide');

                  // Stop editing to avoid triggering other events
                  AgGrid.grids[gridId].stopEditing();

                  // Set ID filter and reload
                  this.Tokens[id].page = 1;
                  this.setIdFilter(id, newItemId);

                  setTimeout(async () => {
                    await DefaultManagement.loadTable(id, { force: true, createHistory: true });
                  });
                }
              } else {
                // Skip update here - onCellValueChanged already handles auto-save for existing rows
                // This prevents duplicate notifications and API calls
                return;
              }
            },
            ...(options.gridOptions ? options.gridOptions : undefined),
          },
        })}
      </div>`;
  },
};

export { DefaultManagement };
