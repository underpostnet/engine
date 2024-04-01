import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { getBlobFromJsonFile, getQueryParams, getRawContentFile, htmls } from './VanillaJs.js';
import { Menu } from '../nexodev/Menu.js';
import { titleFormatted } from './CommonJs.js';

const Content = {
  Render: async function (options = { location: '' }) {
    setTimeout(async () => {
      const queryParams = getQueryParams();
      if (queryParams.id) {
        const {
          data: [file],
          status,
        } = await FileService.get({ id: queryParams.id });

        const ext = file.name.split('.')[file.name.split('.').length - 1];
        const content = await getRawContentFile(getBlobFromJsonFile(file));
        switch (ext) {
          case 'md':
            htmls(
              `.title-modal-modal-content`,
              html`${Menu.renderViewTitle({
                  icon: html`<i class="inl ${queryParams.icon}" style="top: 17px;"></i>`,
                  text: titleFormatted(queryParams.title),
                })} <br />
                <span class="inl" style="left: 75px; color: gray; font-size: 14px"> ${queryParams.subTitle}</span>`,
            );
            htmls(`.content-render`, marked.parse(content));

            break;

          default:
            break;
        }
      }
    });
    return html` <div class="in content-render"></div>`;
  },
};

export { Content };
