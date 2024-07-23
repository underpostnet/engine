import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { getBlobFromUint8ArrayFile, getQueryParams, getRawContentFile, htmls } from './VanillaJs.js';
import { titleFormatted } from './CommonJs.js';
import { Translate } from './Translate.js';
import { renderViewTitle } from './Modal.js';

const Content = {
  Render: async function (options = { idModal: '', Menu: {} }) {
    const { Menu, idModal } = options;
    setTimeout(async () => {
      const queryParams = getQueryParams();
      if (queryParams.id) {
        const {
          data: [file],
          status,
        } = await FileService.get({ id: queryParams.id });

        const ext = file.name.split('.')[file.name.split('.').length - 1];
        const content = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
        switch (ext) {
          case 'md':
            htmls(
              `.title-modal-${idModal}`,
              html`${renderViewTitle({
                  icon: html`<i
                    class="inl ${queryParams.icon ? queryParams.icon : 'far fa-file'}"
                    style="top: 17px;"
                  ></i>`,
                  text: queryParams.title ? titleFormatted(queryParams.title) : Translate.Render('content'),
                })} <br />
                <span class="inl" style="left: 75px; color: gray; font-size: 14px">
                  ${queryParams.subTitle ? queryParams.subTitle : ''}</span
                >`,
            );
            htmls(`.content-render-${idModal}`, marked.parse(content));

            break;

          default:
            break;
        }
      }
    });
    return html` <div class="in content-render content-render-${idModal}"></div>`;
  },
};

export { Content };
