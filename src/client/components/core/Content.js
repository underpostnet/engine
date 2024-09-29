import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { append, getBlobFromUint8ArrayFile, getQueryParams, getRawContentFile, htmls, s } from './VanillaJs.js';
import { titleFormatted } from './CommonJs.js';
import { Translate } from './Translate.js';
import { Modal, renderViewTitle } from './Modal.js';
import { DocumentService } from '../../services/document/document.service.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { loggerFactory } from './Logger.js';
import { imageShimmer, renderCssAttr } from './Css.js';

const logger = loggerFactory(import.meta);

const Content = {
  Render: async function (options = { idModal: '' }) {
    const { idModal } = options;
    setTimeout(async () => {
      try {
        Modal.Data[idModal].onObserverListener[`main-content-observer`] = () => {
          const height = s(`.${idModal}`).offsetHeight - Modal.headerTitleHeight - 1;
          if (s(`.iframe-${idModal}`)) s(`.iframe-${idModal}`).style.height = `${height}px`;

          if (s(`.ssr-shimmer-content-${idModal}`)) s(`.ssr-shimmer-content-${idModal}`).style.height = `${height}px`;
        };
        Modal.Data[idModal].onObserverListener[`main-content-observer`]();
        s(`.error-${idModal}`).classList.add('hide');
        s(`.ssr-shimmer-content-${idModal}`).classList.remove('hide');
        const queryParams = getQueryParams();
        let documentObj, file, image;

        if (!queryParams.cid) throw new Error(`no-result-found`);

        {
          const { data, status, message } = await DocumentService.get({ id: queryParams.cid });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            throw new Error(`no-result-found`);
          }
          documentObj = data[0];
        }
        {
          const { data, status, message } = await FileService.get({ id: documentObj.fileId._id });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            throw new Error(`no-preview-available`);
          }
          file = data[0];
        }
        if (documentObj.imageFileId) {
          const { data, status, message } = await FileService.get({ id: documentObj.imageFileId });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            // throw new Error(`no-preview-available`);
          } else image = data[0];
        }

        htmls(
          `.title-modal-${idModal}`,
          html`${renderViewTitle({
            icon: html`<i class="inl far fa-file"></i>`,
            text: `${documentObj.title ? documentObj.title : documentObj.location}`,
          })} `,
        );
        htmls(`.content-render-${idModal}`, ``);
        if (image) await this.RenderFile({ idModal, file: image, id: image._id });
        await this.RenderFile({ idModal, file, id: file._id });
        Modal.Data[idModal].onObserverListener[`main-content-observer`]();
      } catch (error) {
        logger.error(error);
        htmls(`.content-render-${idModal}`, '');
        htmls(`.error-${idModal}`, html`<i class="fas fa-exclamation-circle"></i> ${Translate.Render(error.message)}`);
        s(`.error-${idModal}`).classList.remove('hide');
      }
      s(`.ssr-shimmer-content-${idModal}`).classList.add('hide');
    });
    return html` <div class="in content-render content-render-${idModal}" style="min-height: 500px"></div>
      <div
        class="abs ssr-shimmer-content-${idModal}"
        style="${renderCssAttr({
          style: {
            top: '0px',
            left: '0px',
            width: '100%',
          },
        })}"
      >
        ${imageShimmer()}
      </div>
      <div class="abs center error-${idModal} hide"></div>`;
  },
  RenderFile: async function ({ file, idModal }) {
    const ext = file.name.split('.')[file.name.split('.').length - 1];

    switch (ext) {
      case 'md':
        {
          const content = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
          append(`.content-render-${idModal}`, marked.parse(content));
        }

        break;

      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
      case 'png': {
        const url = getApiBaseUrl({ id: file._id, endpoint: 'file/blob' });
        append(
          `.content-render-${idModal}`,
          html`<a href="${url}" target="_top"><img class="in" src="${url}" style="width: 100%; height: auto;" /></a>`,
        );
        break;
      }
      case 'pdf': {
        const url = getApiBaseUrl({ id: file._id, endpoint: 'file/blob' });
        append(
          `.content-render-${idModal}`,
          html`<iframe class="in iframe-${idModal}" src="${url}" style="width: 100%; border: none"></iframe>`,
        );
        break;
      }

      case 'json':
        append(
          `.content-render-${idModal}`,
          html`<pre class="in section-mp">
${JSON.stringify(
              JSON.parse(await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype))),
              null,
              4,
            )}</pre
          >`,
        );
        break;

      default:
        append(
          `.content-render-${idModal}`,
          html`<div class="in section-mp">
            ${await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype))}
          </div>`,
        );
        break;
    }
  },
};

export { Content };
