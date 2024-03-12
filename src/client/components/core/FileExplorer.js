import { BucketService } from '../../services/bucket/bucket.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from './AgGrid.js';
import { BtnIcon } from './BtnIcon.js';
import { getSubpaths, uniqueArray } from './CommonJs.js';
import { EventsUI } from './EventsUI.js';
import { Input, InputFile } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { RouterEvents } from './Router.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { copyData, getQueryParams, getURI, s, setURI } from './VanillaJs.js';

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

class LoadFileRenderer {
  eGui;

  async init(params) {
    console.log('LoadFileRenderer created', params);
    // params.data._id

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`<i class="fas fa-file"></i> ${params.data.name}`;
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadFileRenderer refreshed', params);
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
  Render: async function () {
    const gridFolderId = 'folder-explorer-grid';
    const gridFileId = 'file-explorer-grid';
    let formBodyFiles;
    const query = getQueryParams();
    let location = query?.location ? this.locationFormat({ f: query }) : '/';
    let files = [];
    let folders = [];
    let bucketId = '';
    let bucketInstance = {};

    RouterEvents['file-explorer'] = ({ path, pushPath, proxyPath, route }) => {
      if (route === 'cloud') {
        const query = getQueryParams();
        location = query?.location ? this.locationFormat({ f: query }) : '/';
        s(`.file-explorer-query-nav`).value = location;
        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
        files = format.files;
        folders = format.folders;
        AgGrid.grids[gridFileId].setGridOption('rowData', files);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      }
    };

    try {
      const {
        status,
        data: [bucket],
      } = await BucketService.get();
      const format = this.bucketDataFormat({ bucket, location });
      files = format.files;
      bucketId = format.bucketId;
      folders = format.folders;
      bucketInstance = bucket;
    } catch (error) {
      console.error(error);
    }

    console.log({ location, bucketId, folders, files });

    setTimeout(async () => {
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
          const { status, data: bucket } = await BucketService.put({
            id: bucketId,
            body: {
              files: fileData.map((file) => {
                return {
                  fileId: file._id,
                  location,
                };
              }),
            },
          });
          const format = this.bucketDataFormat({ bucket, location });
          files = format.files;
          folders = format.folders;
          bucketInstance = bucket;
          AgGrid.grids[gridFileId].setGridOption('rowData', files);
          AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-file`),
            status,
          });
          if (status === 'success') s(`.btn-input-home-directory`).click();
        }
      });

      EventsUI.onClick(`.btn-input-go-explorer`, async (e) => {
        e.preventDefault();
        const newLocation = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
        if (newLocation === location) return;
        location = newLocation;
        setURI(`${getURI()}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
        files = format.files;
        folders = format.folders;
        AgGrid.grids[gridFileId].setGridOption('rowData', files);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      });
      EventsUI.onClick(`.btn-input-home-directory`, async (e) => {
        e.preventDefault();
        let newLocation = '/';
        if (s(`.file-explorer-uploader`).style.display !== 'none') {
          s(`.file-explorer-uploader`).style.display = 'none';
          s(`.file-explorer-nav`).style.display = 'block';
        } else if (newLocation === location) return;
        else location = newLocation;
        setURI(`${getURI()}?location=${location}`);
        s(`.file-explorer-query-nav`).value = location;
        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
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
    return html`
      <form>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'inl btn-input-home-directory',
            label: html`<i class="fas fa-home"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-back-explorer',
            label: html` <i class="fa-solid fa-circle-left"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-forward-explorer',
            label: html` <i class="fa-solid fa-circle-right"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-go-explorer',
            label: html`<i class="fas fa-sync-alt"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'submit',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-copy-directory',
            label: html`<i class="fas fa-copy"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-upload-file',
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
            containerClass: 'in section-mp input-container',
            placeholder: true,
            value: location,
          })}
        </div>
      </form>
      <div class="fl file-explorer-nav">
        <div class="in fll explorer-file-col">
          <div class="in explorer-file-sub-col">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFolderId,
                darkTheme: true,
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
                      // onCellClicked: (event) => {
                      //   // console.warn('onCellClicked', event);
                      //   location = event.data.location;
                      // },
                    },
                    {
                      // suppressHeaderMenuButton: true,
                      // sortable: false,
                      field: 'files',
                      headerName: '🗎',
                      width: 100,
                      // headerComponent: FolderHeaderComp,
                      // headerComponentParams: {
                      //   menuIcon: 'fa-bars',
                      //   template: `test`,
                      // },
                    },
                  ],
                  rowSelection: 'single',
                  onSelectionChanged: (event) => {
                    const selectedRows = AgGrid.grids[gridFolderId].getSelectedRows();
                    console.log('selectedRows', { event, selectedRows });
                    if (selectedRows[0]) {
                      const newLocation = selectedRows[0].location;
                      if (newLocation === location) return;
                      location = newLocation;
                      setURI(`${getURI()}?location=${location}`);
                      s(`.file-explorer-query-nav`).value = location;
                      const format = this.bucketDataFormat({ bucket: bucketInstance, location });
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
          <div class="in explorer-file-sub-col">
            <div class="in">
              ${await AgGrid.Render({
                id: gridFileId,
                darkTheme: true,
                // style: {
                //   height: '200px',
                // },
                gridOptions: {
                  rowData: files,
                  columnDefs: [
                    { field: 'name', headerName: 'Name', cellRenderer: LoadFileRenderer },
                    { field: 'mimetype', headerName: 'Type' },
                  ],
                },
              })}
            </div>
          </div>
        </div>
      </div>
      <form class="file-explorer-uploader" style="display: none">
        <div class="in">
          ${await BtnIcon.Render({
            class: 'wfa btn-input-file-explorer',
            label: html`<i class="fas fa-upload"></i> ${Translate.Render('upload')}`,
            type: 'submit',
          })}
        </div>
        ${await InputFile.Render(
          {
            id: 'file-explorer',
            multiple: true,
          },
          {
            clear: () => console.log('file explorer clear file'),
            change: (e) => {
              console.log('file explorer change file', e);
              formBodyFiles = new FormData();
              for (const keyFile of Object.keys(e.target.files)) {
                formBodyFiles.append(e.target.files[keyFile].name, e.target.files[keyFile]);
              }
            },
          },
        )}
      </form>
    `;
  },
  locationFormat: function ({ f }) {
    if (f.location[0] !== '/') f.location = `/${f.location}`;
    if (f.location !== '/' && f.location[f.location.length - 1] === '/') f.location = f.location.slice(0, -1);
    return f.location;
  },
  bucketDataFormat: function ({ bucket, location }) {
    let files = bucket.files.map((f) => {
      return {
        location: this.locationFormat({ f }),
        name: f.fileId.name,
        mimetype: f.fileId.mimetype,
      };
    });
    let bucketId = bucket._id;
    let folders = [];
    for (const folderPath of uniqueArray(files.map((f) => f.location)))
      folders = ['/'].concat(folders.concat(getSubpaths(folderPath)));
    folders = uniqueArray(folders).map((f) => {
      return {
        location: f,
      };
    });
    files = files.filter((f) => f.location === location);
    folders = folders
      .filter((f) => f.location.startsWith(location))
      .map((f) => {
        f.files = bucket.files.filter((file) => file.location === f.location).length;
        return f;
      });
    return { files, bucketId, folders };
  },
};

export { FileExplorer };
