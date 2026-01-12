import { marked } from 'marked';
import { FileService } from '../../services/file/file.service.js';
import { append, getBlobFromUint8ArrayFile, getRawContentFile, htmls, s } from './VanillaJs.js';
import { s4 } from './CommonJs.js';
import { Translate } from './Translate.js';
import { Modal, renderViewTitle } from './Modal.js';
import { DocumentService } from '../../services/document/document.service.js';
import { CoreService, getApiBaseUrl, headersFactory } from '../../services/core/core.service.js';
import { loggerFactory } from './Logger.js';
import { imageShimmer, renderChessPattern, renderCssAttr, styleFactory } from './Css.js';
import { getQueryParams } from './Router.js';

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

        // Get file metadata (does not include buffer data)
        if (documentObj.fileId && documentObj.fileId._id) {
          const { data, status, message } = await FileService.get({ id: documentObj.fileId._id });
          if (status !== 'success' || !data || !data[0]) {
            logger.warn('File metadata not found:', message);
            // Continue without file - not fatal
          } else {
            file = data[0];
          }
        }

        // Get markdown file metadata (optional)
        if (documentObj.mdFileId && documentObj.mdFileId._id) {
          const { data, status, message } = await FileService.get({ id: documentObj.mdFileId._id });
          if (status !== 'success' || !data || !data[0]) {
            logger.warn('Markdown file metadata not found:', message);
            // Continue without markdown - try to render file instead
          } else {
            md = data[0];
          }
        }

        // Check if we have at least one file to render
        if (!md && !file) {
          throw new Error(`no-preview-available`);
        }

        htmls(
          `.title-modal-${idModal}`,
          html`${renderViewTitle({
            icon: html`<i class="inl far fa-file"></i>`,
            text: `${documentObj.title ? documentObj.title : documentObj.location}`,
          })} `,
        );
        htmls(`.content-render-${idModal}`, ``);

        // Pass file IDs to RenderFile - it will fetch blobs as needed
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

  /**
   * Helper function to get file content
   * Supports both legacy format (with buffer data) and new format (metadata only)
   * For new format, fetches content from blob endpoint
   */
  getFileContent: async function (file, options = {}) {
    // If custom URL provided, use it
    if (options.url) {
      return await CoreService.getRaw({ url: options.url });
    }

    // If buffer data exists in file object (legacy format), use it
    if (file.data?.data) {
      return await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
    }

    // Otherwise, fetch from blob endpoint (new metadata-only format)
    if (file._id) {
      try {
        const { data: blobArray, status } = await FileService.get({ id: `blob/${file._id}` });
        if (status === 'success' && blobArray && blobArray[0]) {
          return await blobArray[0].text();
        }
        throw new Error('Failed to fetch file content');
      } catch (error) {
        logger.error('Error fetching file content from blob endpoint:', error);
        throw new Error('Could not load file content');
      }
    }

    throw new Error('No file content available');
  },

  RenderFile: async function (
    options = {
      file: {
        _id: '',
        mimetype: '',
        url: '',
        name: '',
        cid: '',
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
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    let render = '';

    try {
      switch (ext) {
        case 'md':
          {
            const content = await Content.getFileContent(file, options);
            render += html`<div class="${options.class}" ${styleFactory(options.style)}>${marked.parse(content)}</div>`;
          }
          break;

        case 'jpg':
        case 'jpeg':
        case 'webp':
        case 'svg':
        case 'gif':
        case 'png': {
          const url = await Content.urlFactory(options);
          if (url) {
            const imgRender = html`<img
              alt="${file.name ? file.name : `file ${s4()}`}"
              class="in ${options.class}"
              ${styleFactory(options.style, `${renderChessPattern(50)}`)}
              src="${url}"
            />`;
            render += imgRender;
          } else {
            render = html`<div class="in ${options.class}" ${styleFactory(options.style)}>
              <p style="color: red;">Error loading image</p>
            </div>`;
          }
          break;
        }

        case 'pdf': {
          const url = await Content.urlFactory(options);
          if (url) {
            render += html`<iframe
              class="in ${options.class} iframe-${options.idModal}"
              ${styleFactory(options.style)}
              src="${url}"
            ></iframe>`;
          } else {
            render = html`<div class="in ${options.class}" ${styleFactory(options.style)}>
              <p style="color: red;">Error loading PDF</p>
            </div>`;
          }
          break;
        }

        case 'json':
          {
            const content = await Content.getFileContent(file, options);
            render += html`<pre class="in ${options.class}" ${styleFactory(options.style)}>
${JSON.stringify(JSON.parse(content), null, 4)}</pre
            >`;
          }
          break;

        default:
          {
            const content = await Content.getFileContent(file, options);
            render += html`<div class="in ${options.class}" ${styleFactory(options.style)}>${content}</div>`;
          }
          break;
      }
    } catch (error) {
      logger.error('Error rendering file:', error);
      render = html`<div class="in ${options.class}" ${styleFactory(options.style)}>
        <p style="color: red;">Error loading file: ${error.message}</p>
      </div>`;
    }

    if (options.raw) return render;
    append(container, render);
  },

  /**
   * Generate appropriate URL for file display
   * Prefers blob endpoint for new metadata-only format
   */
  urlFactory: async function (options) {
    // If custom URL provided, use it
    if (options.url) {
      return options.url;
    }

    // If buffer data exists (legacy), create object URL
    if (options.file?.data?.data) {
      return URL.createObjectURL(getBlobFromUint8ArrayFile(options.file.data.data, options.file.mimetype));
    }

    // Use blob endpoint for metadata-only format with proper authentication
    if (options.file?._id) {
      try {
        const { data: blobArray, status } = await FileService.get({ id: `blob/${options.file._id}` });
        if (status === 'success' && blobArray && blobArray[0]) {
          return URL.createObjectURL(blobArray[0]);
        }
        throw new Error('Failed to fetch file blob');
      } catch (error) {
        logger.error('Error fetching file blob:', error);
        return null;
      }
    }

    return null;
  },
};

export { Content };
