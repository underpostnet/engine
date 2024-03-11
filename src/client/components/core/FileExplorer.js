import { FileService } from '../../services/file/file.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';
import { Input, InputFile } from './Input.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { Validator } from './Validator.js';

const FileExplorer = {
  Render: async function () {
    let formBodyFiles;
    setTimeout(async () => {
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

        {
          const { status, data } = await FileService.post({ body: formBodyFiles });
        }
        // {
        //   const body = {};
        //   for (const inputData of formData) {
        //     if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        //   }
        // }

        // NotificationManager.Push({
        //   html: typeof result.data === 'string' ? result.data : Translate.Render(`${result.status}-upload-user`),
        //   status: result.status,
        // });
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
