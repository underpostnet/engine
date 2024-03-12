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
          id: `file-explorer-location`,
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
          const body = {};
          for (const inputData of formData) {
            if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
          }
          const { status, data: bucket } = await BucketService.put({
            id: bucketId,
            body: {
              files: fileData.map((file) => {
                return {
                  fileId: file._id,
                  location: body.location,
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
        const newLocation = '/';
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
      EventsUI.onClick(`.btn-input-copy-directory`, async (e) => {
        e.preventDefault();
        await copyData(window.location.href);
        NotificationManager.Push({
          html: Translate.Render('success-copy-data'),
          status: 'success',
        });
      });
    });
    return html`
      <form>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'inl btn-input-go-explorer',
            label: html`<i class="fas fa-sync-alt"></i>
              <!-- ${Translate.Render('go')} -->`,
            type: 'submit',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-home-directory',
            label: html`<i class="fas fa-home"></i>
              <!-- ${Translate.Render('home-directory')} -->`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'inl btn-input-copy-directory',
            label: html`<i class="fas fa-copy"></i>
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
      <div class="fl">
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
                      // onCellClicked: (event) => {
                      //   // console.warn('onCellClicked', event);
                      //   location = event.data.location;
                      // },
                    },
                    {
                      field: 'files',
                      headerName: '#',
                      width: 100,
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
                    { field: 'name', headerName: 'Name' },
                    { field: 'mimetype', headerName: 'Type' },
                  ],
                },
              })}
            </div>
          </div>
        </div>
      </div>
      <form>
        <div class="in">
          ${await Input.Render({
            id: `file-explorer-location`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('file-path')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'btn-input-file-explorer',
            label: Translate.Render('upload'),
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
