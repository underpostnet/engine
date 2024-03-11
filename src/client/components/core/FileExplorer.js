import { BucketService } from '../../services/bucket/bucket.service.js';
import { FileService } from '../../services/file/file.service.js';
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
    let formBodyFiles;
    setTimeout(async () => {
      let root = '/';
      let files = [];
      let folders = [];
      let bucketId;

      {
        const {
          status,
          data: [bucket],
        } = await BucketService.get();
        files = bucket.files.map((f) => {
          if (f.location[0] !== '/') f.location = `/${f.location}`;
          if (f.location !== '/' && f.location[f.location.length - 1] === '/') f.location = f.location.slice(0, -1);
          return f;
        });
        bucketId = bucket._id;
      }

      folders = uniqueArray(files.map((f) => f.location));

      console.log({ root, bucketId, folders, files });

      const formData = [
        {
          model: 'location',
          id: `file-explorer-location`,
          rules: [{ type: 'isEmpty' }],
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
          const { status, data } = await BucketService.put({
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
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-file`),
            status,
          });
        }
      });
    });
    return html`
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
};

export { FileExplorer };
