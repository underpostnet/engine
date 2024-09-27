import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { getBlobFromUint8ArrayFile, getQueryParams, getRawContentFile, htmls, s } from './VanillaJs.js';
import { titleFormatted } from './CommonJs.js';
import { Translate } from './Translate.js';
import { Modal, renderViewTitle } from './Modal.js';
import { DocumentService } from '../../services/document/document.service.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';

const Content = {
  allowedExtensions: ['.md', '.jpg', '.webp', '.png', '.pdf'],
  Render: async function (options = { idModal: '', Menu: {} }) {
    const { Menu, idModal } = options;
    setTimeout(async () => {
      const queryParams = getQueryParams();
      if (queryParams.cid) {
        const {
          data: [documentObj],
          status: statusDoc,
        } = await DocumentService.get({ id: queryParams.cid });

        const {
          data: [file],
          status: statusFile,
        } = await FileService.get({ id: documentObj.fileId._id });

        const ext = file.name.split('.')[file.name.split('.').length - 1];
        htmls(
          `.title-modal-${idModal}`,
          html`${renderViewTitle({
            icon: html`<i class="inl far fa-file"></i>`,
            text: `${documentObj.title ? documentObj.title : documentObj.location}`,
          })} `,
        );
        switch (ext) {
          case 'md':
            {
              const content = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
              htmls(`.content-render-${idModal}`, marked.parse(content));
            }

            break;

          case 'jpg':
          case 'webp':
          case 'png': {
            const url = getApiBaseUrl({ id: documentObj.fileId._id, endpoint: 'file/blob' });
            htmls(
              `.content-render-${idModal}`,
              html`<a href="${url}" target="_top"
                ><img class="in" src="${url}" style="width: 100%; height: auto;"
              /></a>`,
            );
            break;
          }
          case 'pdf': {
            const url = getApiBaseUrl({ id: documentObj.fileId._id, endpoint: 'file/blob' });
            htmls(
              `.content-render-${idModal}`,
              html`<iframe class="in iframe-${idModal}" src="${url}" style="width: 100%; border: none"></iframe>`,
            );
            Modal.Data[idModal].onObserverListener[idModal] = () => {
              if (s(`.iframe-${idModal}`))
                s(`.iframe-${idModal}`).style.height = `${
                  s(`.${idModal}`).offsetHeight - Modal.headerTitleHeight - 1
                }px`;
            };
            Modal.Data[idModal].onObserverListener[idModal]();
            break;
          }

          default:
            break;
        }
        s(`.no-result-${idModal}`).classList.add('hide');
      } else {
        s(`.no-result-${idModal}`).classList.remove('hide');
      }
      s(`.spinner-${idModal}`).classList.add('hide');
    });
    return html` <div class="in content-render content-render-${idModal}" style="min-height: 500px"></div>
      <div class="abs center spinner-${idModal}"><div class="lds-dual-ring"></div></div>
      <div class="abs center no-result-${idModal} hide">
        <i class="fas fa-exclamation-circle"></i> ${Translate.Render('no-result-found')}
      </div>`;
  },
};

export { Content };
