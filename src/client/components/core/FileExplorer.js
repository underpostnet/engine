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
import { s } from './VanillaJs.js';

const FileExplorer = {
  Render: async function () {
    const gridId = 'file-explorer-grid';
    let formBodyFiles;
    let root = '/';
    let files, folders, bucketId;

    {
      const {
        status,
        data: [bucket],
      } = await BucketService.get();
      const format = this.bucketDataFormat({ bucket });
      files = format.files;
      bucketId = format.bucketId;
      folders = format.folders;
    }

    console.log({ root, bucketId, folders, files });

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
          const format = this.bucketDataFormat({ bucket });
          files = format.files;
          folders = format.folders;
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-file`),
            status,
          });
        }
      });
    });
    return html`
      <div class="in">
        ${await AgGrid.Render({
          id: gridId,
          darkTheme: true,
          // style: {
          //   height: '200px',
          // },
          gridOptions: {
            rowData: folders,
            columnDefs: [{ field: 'folder', headerName: 'Folder' }],
          },
        })}
      </div>
      <form>
        <div class="in">
          ${await Input.Render({
            id: `file-explorer-location`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('file-path')}`,
            containerClass: 'inl section-mp container-component input-container',
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
  bucketDataFormat: ({ bucket }) => {
    let files = bucket.files.map((f) => {
      if (f.location[0] !== '/') f.location = `/${f.location}`;
      if (f.location !== '/' && f.location[f.location.length - 1] === '/') f.location = f.location.slice(0, -1);
      return f;
    });
    let bucketId = bucket._id;
    let folders = uniqueArray(['/'].concat(files.map((f) => `/${f.location.split('/')[1]}`))).map((folder) => {
      return {
        folder,
      };
    });
    return { files, bucketId, folders };
  },
};

export { FileExplorer };
