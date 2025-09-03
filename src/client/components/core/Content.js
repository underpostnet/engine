import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { append, getBlobFromUint8ArrayFile, getQueryParams, getRawContentFile, htmls, s } from './VanillaJs.js';
import { titleFormatted } from './CommonJs.js';
import { Translate } from './Translate.js';
import { Modal, renderViewTitle } from './Modal.js';
import { DocumentService } from '../../services/document/document.service.js';
import { CoreService, getApiBaseUrl } from '../../services/core/core.service.js';
import { loggerFactory } from './Logger.js';
import { imageShimmer, renderChessPattern, renderCssAttr, styleFactory } from './Css.js';

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
        let documentObj, file, md;

        if (!queryParams.cid) throw new Error(`no-result-found`);

        {
          const { data, status, message } = await DocumentService.get({ id: queryParams.cid });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            throw new Error(`no-result-found`);
          }
          documentObj = data[0];
        }
        if (documentObj.fileId) {
          const { data, status, message } = await FileService.get({ id: documentObj.fileId._id });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            // throw new Error(`no-preview-available`);
          }
          file = data[0];
        }
        if (documentObj.mdFileId) {
          const { data, status, message } = await FileService.get({ id: documentObj.mdFileId });
          if (status !== 'success' || !data || !data[0]) {
            logger.error(message);
            throw new Error(`no-preview-available`);
          } else md = data[0];
        }

        htmls(
          `.title-modal-${idModal}`,
          html`${renderViewTitle({
            icon: html`<i class="inl far fa-file"></i>`,
            text: `${documentObj.title ? documentObj.title : documentObj.location}`,
          })} `,
        );
        htmls(`.content-render-${idModal}`, ``);
        if (md) await this.RenderFile({ idModal, file: md, id: md._id });
        if (file) await this.RenderFile({ idModal, file, id: file._id });
        Modal.Data[idModal].onObserverListener[`main-content-observer`]();
      } catch (error) {
        logger.error(error);
        htmls(`.content-render-${idModal}`, '');
        htmls(`.error-${idModal}`, html`<i class="fas fa-exclamation-circle"></i> ${Translate.Render(error.message)}`);
        s(`.error-${idModal}`).classList.remove('hide');
      }
      s(`.ssr-shimmer-content-${idModal}`).classList.add('hide');
    });
    return html` <div class="in content-render content-render-${idModal}" style="min-height: 200px"></div>
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
  RenderFile: async function (
    options = {
      file: {
        _id: '',
        data: {
          data: [0],
        },
        mimetype: '',
        url: '',
        name: '',
        cid: '', // TODO: IPFS env
      },
      idModal: '',
      style: {},
      class: '',
      container: '',
      url: '',
      raw: false,
    },
  ) {
    if (!options.container) options.container = `.content-render-${options.idModal}`;
    if (!options.style)
      options.style = {
        width: '100%',
        border: 'none',
      };
    if (!options.class) options.class = ``;
    const { container, file } = options;
    const ext = file.name.split('.')[file.name.split('.').length - 1];
    let render = '';

    switch (ext) {
      case 'md':
        {
          const content = options.url
            ? await CoreService.getRaw({ url: options.url })
            : await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
          render += html`<div class="${options.class}" ${styleFactory(options.style)}>${marked.parse(content)}</div>`;
        }

        break;

      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'svg':
      case 'gif':
      case 'png': {
        const url = options.url
          ? options.url
          : file._id
          ? getApiBaseUrl({ id: file._id, endpoint: 'file/blob' })
          : URL.createObjectURL(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
        const imgRender = html`<img
          class="in ${options.class}"
          ${styleFactory(options.style, `${renderChessPattern(50)}`)}
          src="${url}"
        />`;
        render += imgRender;
        break;
      }
      case 'pdf': {
        const url = options.url
          ? options.url
          : file._id
          ? getApiBaseUrl({ id: file._id, endpoint: 'file/blob' })
          : URL.createObjectURL(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
        render += html`<iframe
          class="in ${options.class} iframe-${options.idModal}"
          ${styleFactory(options.style)}
          src="${url}"
        ></iframe>`;
        break;
      }

      case 'json':
        render += html`<pre class="in ${options.class}" ${styleFactory(options.style)}>
        ${JSON.stringify(
            JSON.parse(
              options.url
                ? await CoreService.getRaw({ url: options.url })
                : await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype)),
            ),
            null,
            4,
          )}</pre
        >`;
        break;

      default:
        render += html`<div class="in ${options.class}" ${styleFactory(options.style)}>
          ${options.url
            ? await CoreService.getRaw({ url: options.url })
            : await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype))}
        </div>`;
        break;
    }
    if (options.raw) return render;
    append(container, render);
  },
};

export { Content };
