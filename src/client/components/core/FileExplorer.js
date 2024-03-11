import { BucketService } from '../../services/bucket/bucket.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from './AgGrid.js';
import { BtnIcon } from './BtnIcon.js';
import { uniqueArray } from './CommonJs.js';
import { EventsUI } from './EventsUI.js';
import { Input, InputFile } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';
import { copyData, getQueryParams, s } from './VanillaJs.js';

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
        location = this.locationFormat({ f: { location: s(`.file-explorer-query-nav`).value } });
        s(`.file-explorer-query-nav`).value = location;
        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
        files = format.files;
        folders = format.folders;
        AgGrid.grids[gridFileId].setGridOption('rowData', files);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      });
      EventsUI.onClick(`.btn-input-home-directory`, async (e) => {
        e.preventDefault();
        location = '/';
        s(`.file-explorer-query-nav`).value = location;
        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
        files = format.files;
        folders = format.folders;
        AgGrid.grids[gridFileId].setGridOption('rowData', files);
        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
      });
      EventsUI.onClick(`.btn-input-copy-directory`, async (e) => {
        e.preventDefault();
        await copyData(location);
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
                  rowData: folders,
                  columnDefs: [
                    {
                      field: 'location',
                      headerName: 'Folder',
                      cellStyle: function (params) {
                        return { cursor: 'pointer' };
                      },
                      onCellClicked: (event) => {
                        // console.warn('onCellClicked', event);
                        location = event.data.location;
                        s(`.file-explorer-query-nav`).value = location;
                        const format = this.bucketDataFormat({ bucket: bucketInstance, location });
                        files = format.files;
                        folders = format.folders;
                        AgGrid.grids[gridFileId].setGridOption('rowData', files);
                        AgGrid.grids[gridFolderId].setGridOption('rowData', folders);
                      },
                    },
                  ],
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
                    { field: 'name', headerName: 'File' },
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
    let folders = uniqueArray(['/'].concat(files.map((f) => f.location))).map((folder) => {
      return {
        location: folder,
      };
    });
    folders = folders.filter((f) => f.location.startsWith(location));
    files = files.filter((f) => f.location === location);
    return { files, bucketId, folders };
  },
};

export { FileExplorer };
