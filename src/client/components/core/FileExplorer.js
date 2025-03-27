import { getApiBaseUrl } from '../../services/core/core.service.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from './AgGrid.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { getSubpaths, timer, uniqueArray } from './CommonJs.js';
import { Content } from './Content.js';
import { darkTheme, renderCssAttr } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { fileFormDataFactory, Input, InputFile } from './Input.js';
import { loggerFactory } from './Logger.js';
import { Modal } from './Modal.js';
import { NotificationManager } from './NotificationManager.js';
import { RouterEvents } from './Router.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { copyData, downloadFile, getProxyPath, getQueryParams, s, setPath } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

class LoadFolderRenderer {
  eGui;

  async init(params) {
    console.log('LoadFolderRenderer created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-folder"></i> ${params.data.location}`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadFolderRenderer refreshed', params);
    return true;
  }
}

class LoadFileNameRenderer {
  eGui;

  async init(params) {
    console.log('LoadFileNameRenderer created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-file"></i> ${params.data.name}`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadFileNameRenderer refreshed', params);
    return true;
  }
}

class FolderHeaderComp {
  eGui;

  async init(params) {
    console.log('FolderHeaderComp created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-file"></i>`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('FolderHeaderComp refreshed', params);
    return true;
  }
}

const FileExplorer = {
  Api: {},
  Render: async function (options = { idModal: '' }) {
    const { idModal } = options;
    FileExplorer.Api[idModal] = options;
    const gridFolderId = 'folder-explorer-grid';
    const gridFileId = 'file-explorer-grid';
    const idDropFileInput = 'file-explorer';
    let formBodyFiles;
    const query = getQueryParams();
    let location = query?.location ? this.locationFormat({ f: query }) : '/';
    let files, folders, documentId, documentInstance;
    const cleanData = () => {
      files = [];
      folders = [];
      documentId = '';
      documentInstance = [];
    };
    cleanData();
    FileExplorer.Api[idModal].displayList = async () => {
      if (!s(`.${idModal}`)) return;
      const query = getQueryParams();
      location = query?.location ? this.locationFormat({ f: query }) : '/';
      s(`.file-explorer-query-nav`).value = location;
      const format = this.documentDataFormat({ document: documentInstance, location });
      files = format.files;
      folders = format.folders;
      AgGrid.grids[gridFileId].setGridOption('rowData', files);
      AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
    };
    FileExplorer.Api[idModal].updateData = async (optionsUpdate = { display: false }) => {
      if (!s(`.${idModal}`)) return;
      if (Auth.getToken()) {
        try {
          const { status, data: document } = await DocumentService.get();
          const format = this.documentDataFormat({ document, location });
          files = format.files;
          documentId = format.documentId;
          folders = format.folders;
          documentInstance = document;
        } catch (error) {
          logger.error(error);
          NotificationManager.Push({
            html: error.message,
            status: 'error',
          });
        }
      } else cleanData();
      setTimeout(async () => {
        if (s(`.${idModal}`) && optionsUpdate && optionsUpdate.display) await FileExplorer.Api[idModal].displayList();
      });
    };

    RouterEvents['file-explorer'] = ({ path, pushPath, route }) => {
      if (route === 'cloud')
        setTimeout(async () => {
          // await this.Api[idModal].updateData();
          await FileExplorer.Api[idModal].displayList();
        });
    };

    setTimeout(async () => {
      FileExplorer.Api[idModal].updateData({ display: true });
      const formData = [
        {
          model: 'location',
          id: `file-explorer-query-nav`,
          rules: [], // { type: 'isEmpty' }
        },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-input-file-explorer`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (!formBodyFiles)
          return NotificationManager.Push({
            html: Translate.Render(`warning-upload-no-selects-file`),
            status: 'warning',
          });
        if (errorMessage) return;
        let fileData;
        {
          const { status, data } = await FileService.post({ body: formBodyFiles });
          fileData = data;
        }
        {
          // const body = {};
          // for (const inputData of formData) {
          //   if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
          // }
          location = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
          let status = 'success';
          for (const file of fileData) {
            const result = await DocumentService.post({
              body: {
                fileId: file._id,
                location,
                title: file.name,
              },
            });
            if (result.status === 'success') documentInstance.push({ ...result.data, fileId: file });
            else if (status !== 'error') status = 'error';
          }
          const format = this.documentDataFormat({ document: documentInstance, location });
          files = format.files;
          folders = format.folders;
          AgGrid.grids[gridFileId].setGridOption('rowData', files);
          AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-file`),
            status,
          });
          if (status === 'success') {
            s(`.btn-input-home-directory`).click();
            s(`.btn-clear-input-file-${idDropFileInput}`).click();
          }
        }
      });

      EventsUI.onClick(`.btn-input-go-explorer`, async (e) => {
        e.preventDefault();
        const newLocation = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
        if (newLocation === location) return;
        location = newLocation;
        setPath(`${window.location.pathname}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        // const format = this.documentDataFormat({ document: documentInstance, location });
        await FileExplorer.Api[idModal].updateData({ display: true });
      });
      EventsUI.onClick(`.btn-input-home-directory`, async (e) => {
        e.preventDefault();
        let newLocation = '/';
        if (s(`.file-explorer-uploader`).style.display !== 'none') {
          s(`.file-explorer-uploader`).style.display = 'none';
          s(`.file-explorer-nav`).style.display = 'block';
        } else if (newLocation === location) return;
        else location = newLocation;
        setPath(`${window.location.pathname}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        const format = this.documentDataFormat({ document: documentInstance, location });
        files = format.files;
        folders = format.folders;
        AgGrid.grids[gridFileId].setGridOption('rowData', files);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      });
      EventsUI.onClick(`.btn-input-copy-directory`, async (e) => {
        e.preventDefault();
        await copyData(window.location.href);
        NotificationManager.Push({
          html: Translate.Render('success-copy-data'),
          status: 'success',
        });
      });
      EventsUI.onClick(`.btn-input-back-explorer`, async (e) => {
        e.preventDefault();
        window.history.back();
      });
      EventsUI.onClick(`.btn-input-forward-explorer`, async (e) => {
        e.preventDefault();
        window.history.forward();
      });
      EventsUI.onClick(`.btn-input-upload-file`, async (e) => {
        e.preventDefault();
        s(`.file-explorer-nav`).style.display = 'none';
        s(`.file-explorer-uploader`).style.display = 'block';
      });
    });

    class LoadFileActionsRenderer {
      eGui;

      async init(params) {
        console.log('LoadFileActionsRenderer created', params);
        // params.data._id

        this.eGui = document.createElement('div');
        this.eGui.innerHTML = html`
          <div class="fl">
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-download-${params.data._id}`,
              label: html` <i class="fas fa-download"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-delete-${params.data._id}`,
              label: html` <i class="fa-solid fa-circle-xmark"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-view-${params.data._id}`,
              label: html` <i class="fas fa-eye"></i>`,
              type: 'button',
            })}
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-file-copy-content-link-${params.data._id}`,
              label: html`<i class="fas fa-copy"></i>`,
              type: 'button',
            })}
          </div>
        `;

        setTimeout(() => {
          const uri = `${getProxyPath()}content/?cid=${params.data._id}`;
          const url = `${window.location.origin}${uri}`;

          const originObj = documentInstance.find((d) => d._id === params.data._id);
          const blobUri = originObj ? getApiBaseUrl({ id: originObj.fileId._id, endpoint: 'file/blob' }) : undefined;

          if (!originObj) {
            s(`.btn-file-view-${params.data._id}`).classList.add('hide');
            s(`.btn-file-copy-content-link-${params.data._id}`).classList.add('hide');
          }

          EventsUI.onClick(`.btn-file-view-${params.data._id}`, async (e) => {
            e.preventDefault();
            if (location.href !== url) {
              setPath(uri);
              s(`.main-btn-content`).click();
            }
          });

          EventsUI.onClick(`.btn-file-copy-content-link-${params.data._id}`, async (e) => {
            e.preventDefault();
            await copyData(blobUri);
            NotificationManager.Push({
              html: Translate.Render('success-copy-data'),
              status: 'success',
            });
          });

          EventsUI.onClick(`.btn-file-download-${params.data._id}`, async (e) => {
            e.preventDefault();
            console.log(params);
            const {
              data: [file],
              status,
            } = await FileService.get({ id: params.data.fileId });

            downloadFile(new Blob([new Uint8Array(file.data.data)], { type: params.data.mimetype }), params.data.name);
          });
          EventsUI.onClick(
            `.btn-file-delete-${params.data._id}`,
            async (e) => {
              e.preventDefault();
              {
                const confirmResult = await Modal.RenderConfirm({
                  html: async () => {
                    return html`
                      <div class="in section-mp" style="text-align: center">
                        ${Translate.Render('confirm-delete-item')}
                        <br />
                        "${params.data.title}"
                      </div>
                    `;
                  },
                  id: `delete-${params.data._id}`,
                });
                if (confirmResult.status !== 'confirm') return;

                const { data, status, message } = await FileService.delete({
                  id: params.data.fileId,
                });
                NotificationManager.Push({
                  html: status,
                  status,
                });
                if (status === 'error') return;
              }
              const { data, status, message } = await DocumentService.delete({
                id: params.data._id,
              });
              NotificationManager.Push({
                html: status,
                status,
              });
              if (status === 'error') return;

              documentInstance = documentInstance.filter((f) => f._id !== params.data._id);
              const format = FileExplorer.documentDataFormat({ document: documentInstance, location });
              files = format.files;
              folders = format.folders;
              // AgGrid.grids[gridFileId].setGridOption('rowData', files);
              // const selectedData = gridApi.getSelectedRows();
              AgGrid.grids[gridFileId].applyTransaction({ remove: [params.data] });
              AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        console.log('LoadFileActionsRenderer refreshed', params);
        return true;
      }
    }

    class LoadFolderActionsRenderer {
      eGui;

      async init(params) {
        console.log('LoadFolderActionsRenderer created', params);
        // params.data._id
        const id = params.data.locationId;

        this.eGui = document.createElement('div');
        this.eGui.innerHTML = html`
          <div class="fl">
            ${await BtnIcon.Render({
              class: `in fll management-table-btn-mini btn-folder-delete-${id}`,
              label: html` <i class="fa-solid fa-circle-xmark"></i>`,
              type: 'button',
            })}
          </div>
        `;

        setTimeout(() => {
          EventsUI.onClick(
            `.btn-folder-delete-${id}`,
            async (e) => {
              const confirmResult = await Modal.RenderConfirm({
                html: async () => {
                  return html`
                    <div class="in section-mp" style="text-align: center">
                      ${Translate.Render('confirm-delete-item')}
                      <br />
                      "${params.data.location}"
                    </div>
                  `;
                },
                id: `delete-${id}`,
              });
              if (confirmResult.status !== 'confirm') return;

              e.preventDefault();
              const idFilesDelete = [];
              for (const file of documentInstance.filter(
                (f) => FileExplorer.locationFormat({ f }) === params.data.location, // .startsWith(params.data.location),
              )) {
                {
                  const { data, status, message } = await FileService.delete({
                    id: file.fileId._id,
                  });
                }
                {
                  idFilesDelete.push(file._id);
                  const { data, status, message } = await DocumentService.delete({
                    id: file._id,
                  });
                }
              }
              NotificationManager.Push({
                html: Translate.Render('success-delete'),
                status: 'success',
              });
              documentInstance = documentInstance.filter((f) => !idFilesDelete.includes(f._id));
              const format = FileExplorer.documentDataFormat({ document: documentInstance, location });
              files = format.files;
              folders = format.folders;
              AgGrid.grids[gridFileId].setGridOption('rowData', files);
              AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
            },
            { context: 'modal' },
          );
        });
      }

      getGui() {
        return this.eGui;
      }

      refresh(params) {
        console.log('LoadFolderActionsRenderer refreshed', params);
        return true;
      }
    }

    return html`
      <form>
        <div class="fl">
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-home-directory',
            label: html`<i class="fas fa-home"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-back-explorer',
            label: html` <i class="fa-solid fa-circle-left"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-forward-explorer',
            label: html` <i class="fa-solid fa-circle-right"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-go-explorer',
            label: html`<i class="fas fa-sync-alt"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'submit',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-copy-directory',
            label: html`<i class="fas fa-copy"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'in fll management-table-btn-mini btn-input-upload-file',
            label: html`<i class="fa-solid fa-cloud-arrow-up"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
        </div>
        <div class="in">
          ${await Input.Render({
            id: `file-explorer-query-nav`,
            type: 'text',
            label: html`<i class="fab fa-wpexplorer"></i> ${Translate.Render('current-path')}`,
            containerClass: 'in section-mp input-container-width',
            placeholder: true,
            value: location,
          })}
        </div>
      </form>
      <div class="fl file-explorer-nav">
        <div class="in fll explorer-file-col">
          <div class="in explorer-file-sub-col section-mp">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFolderId,
                darkTheme,
                // style: {
                //   height: '200px',
                // },
                gridOptions: {
                  defaultColDef: {
                    editable: false,
                    minWidth: 100,
                    filter: true,
                    autoHeight: true,
                  },
                  rowData: folders,
                  columnDefs: [
                    {
                      field: 'location',
                      headerName: 'Folder',
                      minWidth: 200,
                      flex: 1,
                      cellStyle: function (params) {
                        return { cursor: 'pointer' };
                      },
                      cellRenderer: LoadFolderRenderer,
                      onCellClicked: (event) => {
                        // console.warn('onCellClicked', event);
                        const newLocation = event.data.location;
                        if (newLocation === location) return;
                        location = newLocation;
                        setPath(`${window.location.pathname}?location=${location}`);
                        s(`.file-explorer-query-nav`).value = location;
                        const format = this.documentDataFormat({ document: documentInstance, location });
                        files = format.files;
                        folders = format.folders;
                        AgGrid.grids[gridFileId].setGridOption('rowData', files);
                        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                      },
                    },
                    {
                      // suppressHeaderMenuButton: true,
                      // sortable: false,
                      field: 'fileCount',
                      headerName: '🗎',
                      width: 60,
                      cellStyle: function (params) {
                        return { cursor: 'pointer' };
                      },
                      // headerComponent: FolderHeaderComp,
                      // headerComponentParams: {
                      //   menuIcon: 'fa-bars',
                      //   template: `test`,
                      // },
                    },
                    { headerName: '', width: 60, cellRenderer: LoadFolderActionsRenderer },
                  ],
                  rowSelection: 'single',
                  onSelectionChanged: (event) => {
                    return;
                    const selectedRows = AgGrid.grids[gridFolderId].getSelectedRows();
                    console.log('selectedRows', { event, selectedRows });
                    if (selectedRows[0]) {
                      const newLocation = selectedRows[0].location;
                      if (newLocation === location) return;
                      location = newLocation;
                      setPath(`${window.location.pathname}?location=${location}`);
                      s(`.file-explorer-query-nav`).value = location;
                      const format = this.documentDataFormat({ document: documentInstance, location });
                      files = format.files;
                      folders = format.folders;
                      AgGrid.grids[gridFileId].setGridOption('rowData', files);
                      AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                    }
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="in fll explorer-file-col">
          <div class="in explorer-file-sub-col section-mp">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFileId,
                darkTheme,
                // style: {
                //   height: '200px',
                // },
                gridOptions: {
                  defaultColDef: {
                    editable: false,
                    minWidth: 100,
                    filter: true,
                    autoHeight: true,
                  },
                  // rowData: files,
                  rowData: undefined,
                  columnDefs: [
                    { field: 'name', flex: 2, headerName: 'Name', cellRenderer: LoadFileNameRenderer },
                    { field: 'mimetype', flex: 1, headerName: 'Type' },
                    { headerName: '', width: 80, cellRenderer: LoadFileActionsRenderer },
                  ],
                },
              })}
            </div>
          </div>
        </div>
      </div>
      <form class="file-explorer-uploader" style="display: none">
        ${await InputFile.Render(
          {
            id: idDropFileInput,
            multiple: true,
          },
          {
            clear: () => {
              console.log('file explorer clear file');
              formBodyFiles = undefined;
            },
            change: (e) => {
              console.log('file explorer change file', e);
              formBodyFiles = fileFormDataFactory(e);
            },
          },
        )}
        <div class="in">
          ${await BtnIcon.Render({
            class: 'wfa section-mp btn-input-file-explorer',
            style: renderCssAttr({
              style: {
                'font-size': '25px',
                'text-align': 'center',
                padding: '20px',
              },
            }),
            label: html`<i class="fa-solid fa-cloud-arrow-up"></i> ${Translate.Render('upload')}`,
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
  locationFormat: function ({ f }) {
    if (f.location[0] !== '/') f.location = `/${f.location}`;
    if (f.location !== '/' && f.location[f.location.length - 1] === '/') f.location = f.location.slice(0, -1);
    return f.location;
  },
  documentDataFormat: function ({ document, location }) {
    let files = document.map((f) => {
      if (!f.fileId)
        f.fileId = {
          name: f.title + '.md',
          mimetype: 'text/markdown',
          _id: f.mdFileId,
        };
      return {
        location: this.locationFormat({ f }),
        name: f.fileId.name,
        mimetype: f.fileId.mimetype,
        fileId: f.fileId._id,
        _id: f._id,
        title: f.title,
      };
    });
    let documentId = document._id;
    let folders = [];
    for (const folderPath of uniqueArray(files.map((f) => f.location)))
      folders = ['/'].concat(folders.concat(getSubpaths(folderPath)));
    folders = uniqueArray(folders).map((f, i) => {
      return {
        location: f,
        locationId: `loc-${i}`,
      };
    });
    files = files.filter((f) => f.location === location);
    folders = folders
      .filter((f) => f.location.startsWith(location))
      .map((f) => {
        f.fileCount = document.filter((file) => file.location === f.location).length;
        return f;
      })
      .filter((f) => f.fileCount > 0);
    return { files, documentId, folders };
  },
};

export { FileExplorer };
