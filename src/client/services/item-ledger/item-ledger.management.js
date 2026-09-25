import { DefaultManagement } from '../default/default.management.js';
import { ItemLedgerService } from './item-ledger.service.js';
import { commonUserGuard } from '../../components/core/CommonJs.js';

/** The registry: every on-chain registered asset, by the Object Layer CID it binds. */
class ItemLedgerManagement {
  static instance = async ({ appStore, idModal: rawIdModal }) => {
    const idModal = rawIdModal || 'modal-item-ledger-registry';
    const serviceId = 'item-ledger-registry';
    const { role } = appStore.Data.user.main.model.user;

    const columnDefs = [
      {
        field: 'objectLayerCid',
        headerName: 'Object Layer CID',
        flex: 1,
        editable: false,
        filter: 'agTextColumnFilter',
      },
      { field: 'itemId', headerName: 'Item ID', width: 160, editable: false, filter: 'agTextColumnFilter' },
      { field: 'chainId', headerName: 'Chain', width: 110, editable: false, filter: 'agNumberColumnFilter' },
      { field: 'contractAddress', headerName: 'Contract', width: 200, editable: false, filter: 'agTextColumnFilter' },
      { field: 'tokenId', headerName: 'Token ID', width: 200, editable: false, filter: 'agTextColumnFilter' },
      { field: 'standard', headerName: 'Standard', width: 110, editable: false, sortable: false, filter: false },
      { field: 'createdAt', headerName: 'Registered', cellDataType: 'date', width: 160, editable: false },
    ];

    return await DefaultManagement.instance({
      idModal,
      serviceId,
      entity: 'item-ledger',
      permissions: { add: false, remove: false, reload: commonUserGuard(role) },
      columnDefs,
      defaultColKeyFocus: 'objectLayerCid',
      ServiceProvider: ItemLedgerService,
      paginationOptions: { limitOptions: [10, 25, 50, 100] },
      // Open Alpha: no asset is registered on chain yet, and an empty registry is a valid state.
      gridOptions: {
        overlayNoRowsTemplate: `<span class="ag-overlay-no-rows-center">No asset is registered on chain yet. The registry lists on-chain registered assets only.</span>`,
      },
    });
  };
}

export { ItemLedgerManagement };
