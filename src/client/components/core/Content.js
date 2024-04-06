import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { getBlobFromUint8ArrayFile, getQueryParams, getRawContentFile, htmls } from './VanillaJs.js';
import { titleFormatted } from './CommonJs.js';
import { darkTheme } from './Css.js';
import { Translate } from './Translate.js';

const Content = {
  Render: async function (options = { location: '', Menu: {} }) {
    const { Menu } = options;
    setTimeout(async () => {
      const queryParams = getQueryParams();
      if (queryParams.id) {
        const {
          data: [file],
          status,
        } = await FileService.get({ id: queryParams.id });

        const ext = file.name.split('.')[file.name.split('.').length - 1];
        const content = await getRawContentFile(getBlobFromUint8ArrayFile(file));
        switch (ext) {
          case 'md':
            htmls(
              `.title-modal-modal-content`,
              html`${Menu.renderViewTitle({
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
            htmls(`.content-render`, marked.parse(content));

            break;

          default:
            break;
        }
      }
    });
    return html` <style>
        a {
          color: ${darkTheme ? `#b1a7a7` : `rgba(109, 104, 255, 1)`};
        }
        a:hover {
          color: ${darkTheme ? `#ffffff` : `rgba(232, 159, 76, 1)`};
        }
        .content-render {
          font-size: 16px;
          font-family: monospace;
        }
      </style>
      <div class="in content-render"></div>`;
  },
};

export { Content };
