import { getCapVariableName, getId, newInstance, random, range, timer, uniqueArray } from '../core/CommonJs.js';
import { marked } from 'marked';
import { getBlobFromUint8ArrayFile, getProxyPath, getRawContentFile, htmls, s } from '../core/VanillaJs.js';
import { Panel } from '../core/Panel.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { getSrcFromFileData } from '../core/Input.js';
import { Auth } from '../core/Auth.js';
import { renderCssAttr } from '../core/Css.js';
import { Translate } from '../core/Translate.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import { Modal } from '../core/Modal.js';

const PanelUnderpost = {
  Data: {
    data: [],
    originData: [],
    filesData: [],
  },
  instance: async function ({ heightTopBar, heightBottomBar }) {
    const idPanel = 'underpost-panel';
    const prefixTags = [idPanel, 'public'];
    const extension = `.md`;

    const formData = [
      {
        id: 'panel-title',
        model: 'title',
        inputType: 'text',
        rules: [{ type: 'isEmpty' }],
        panel: { type: 'title' },
      },
      {
        id: 'panel-createdAt',
        model: 'createdAt',
        inputType: 'datetime-local',
        panel: { type: 'subtitle' },
        rules: [{ type: 'isEmpty' }],
        disableRender: true,
      },
      {
        id: 'panel-imageFileId',
        model: 'imageFileId',
        inputType: 'file',
        rules: [],
        panel: {},
      },
      {
        id: 'panel-tags',
        model: 'tags',
        label: {
          disabled: true,
        },
        inputType: 'text',
        panel: { type: 'tags' },
        // panel: {
        //   type: 'info-row-pin',
        //   icon: {
        //     value: html``,
        //   },
        //   newIcon: {
        //     key: html``,
        //   },
        // },
        rules: [{ type: 'isEmpty' }],
      },
      {
        id: 'panel-fileId',
        model: 'fileId',
        inputType: 'md',
        panel: { type: 'info-row' },
        rules: [],
        label: {
          disabled: true,
        },
      },
    ];
    const dateFormat = (date) =>
      html`<span
        style="${renderCssAttr({
          style: {
            'font-size': '14px',
            color: '#888',
          },
        })}"
        >${new Date(date).toLocaleString().replaceAll(',', '')}</span
      >`;
    const titleIcon = html`<i class="fa-solid fa-quote-left"></i>`;
    const newRender = html` <span class="bold" style="color: #ff533ecf;"> ${titleIcon} NEW ! </span>`;
    const newRenderMsLimit = 1000 * 60 * 60 * 24 * 2;
    const panelRender = async ({ data }) =>
      await Panel.Render({
        idPanel,
        formData,
        heightTopBar,
        heightBottomBar,
        data,
        originData: () => PanelUnderpost.Data.originData,
        filesData: () => PanelUnderpost.Data.filesData,
        scrollClassContainer: 'main-body',
        titleIcon,
        newRender,
        formContainerClass: 'session-in-log-in',
        callBackPanelRender: async function (
          options = { data, imgRender: async ({ imageUrl }) => null, htmlRender: async ({ render }) => null },
        ) {
          if (options.data.ssr) {
            return await options.htmlRender({
              render: html`<div
                class="abs center ssr-shimmer-search-box"
                style="${renderCssAttr({
                  style: {
                    width: '95%',
                    height: '95%',
                    'border-radius': '10px',
                    overflow: 'hidden',
                  },
                })}"
              >
                <div
                  class="abs center"
                  style="${renderCssAttr({
                    style: {
                      'font-size': '70px',
                      color: `#bababa`,
                    },
                  })}"
                >
                  <i class="fa-solid fa-photo-film"></i>
                </div>
              </div>`,
            });
          }
          if (!options.data.imageFileId)
            return await options.htmlRender({
              render: html`
                <img
                  class="abs center"
                  style="${renderCssAttr({
                    style: {
                      width: '100px',
                      height: '100px',
                      opacity: 0.2,
                    },
                  })}"
                  src="https://underpost.net/assets/splash/apple-touch-icon-precomposed.png"
                />
              `,
            });

          return await options.imgRender({ imageUrl: options.data.imageFileId });
        },
        on: {
          remove: async function ({ e, data }) {
            e.preventDefault();
            const confirmResult = await Modal.RenderConfirm({
              html: async () => {
                return html`
                  <div class="in section-mp" style="text-align: center">
                    ${Translate.Render('confirm-delete-item')}
                    <br />
                    "${data.title}"
                  </div>
                `;
              },
              id: `delete-${idPanel}`,
            });
            if (confirmResult.status === 'confirm') {
              const { status, message } = await DocumentService.delete({
                id: data._id,
              });
              NotificationManager.Push({
                html: status,
                status,
              });

              return { status };
            }
            return { status: 'error' };
          },
          add: async function ({ data, editId }) {
            let fileId;
            let imageFileId;
            const location = `${prefixTags.join('/')}/${getCapVariableName(data.title)}${extension}`;
            const blob = new Blob([data.fileId], { type: 'text/markdown' });
            const file = new File([blob], location, { type: 'text/markdown' });
            const image = data.imageFileId?.[0] ? data.imageFileId[0] : undefined;
            const tags = uniqueArray(
              data.tags
                .replaceAll('/', ',')
                .replaceAll('-', ',')
                .replaceAll(' ', ',')
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t)
                .concat(prefixTags),
            );

            let originObj, indexOriginObj;
            if (editId) {
              indexOriginObj = PanelUnderpost.Data.originData.findIndex((d) => d._id === editId);
              if (indexOriginObj > -1) originObj = PanelUnderpost.Data.originData[indexOriginObj];
            }

            await (async () => {
              const body = new FormData();
              body.append('file', file);
              body.append('image', image);
              const { status, data } = await FileService.post({ body });
              // await timer(3000);
              NotificationManager.Push({
                html: Translate.Render(`${status}-upload-file`),
                status,
              });
              if (status === 'success') {
                fileId = data[0]._id;
                if (data[1]) imageFileId = data[1]._id;
              }
            })();
            const body = {
              location,
              tags,
              fileId,
              imageFileId,
              title: data.title,
            };
            const {
              status,
              message,
              data: documentData,
            } = originObj
              ? await DocumentService.put({ id: originObj._id, body })
              : await DocumentService.post({
                  body,
                });

            let fileBlob = {
                data: {
                  data: Array.from(new Uint8Array(await file.arrayBuffer())),
                },
                mimeType: file.type,
                name: file.name,
              },
              imageBlob = image
                ? {
                    data: {
                      data: Array.from(new Uint8Array(await image.arrayBuffer())),
                    },
                    mimeType: image.type,
                    name: image.name,
                  }
                : undefined;

            let filePlain = await getRawContentFile(getBlobFromUint8ArrayFile(fileBlob.data.data, fileBlob.mimetype)),
              imagePlain = null;

            data.createdAt = dateFormat(documentData.createdAt);
            if (image) data.imageFileId = URL.createObjectURL(image);
            data.tags = tags.filter((t) => !prefixTags.includes(t));
            data.fileId = marked.parse(data.fileId);
            data.userId = ElementsUnderpost.Data.user.main.model.user._id;
            data.tools = true;
            data._id = documentData._id;

            const filesData = {
              id: documentData._id,
              _id: documentData._id,
              fileId: { fileBlob, filePlain },
              imageFileId: { imageBlob, imagePlain },
            };
            if (originObj) {
              PanelUnderpost.Data.originData[indexOriginObj] = documentData;
              PanelUnderpost.Data.data[indexOriginObj] = data;
              PanelUnderpost.Data.filesData[indexOriginObj] = filesData;
            } else {
              PanelUnderpost.Data.originData.push(documentData);
              PanelUnderpost.Data.data.push(data);
              PanelUnderpost.Data.filesData.push(filesData);
            }

            NotificationManager.Push({
              html:
                status === 'success'
                  ? originObj
                    ? Translate.Render('success-edit-post')
                    : Translate.Render('success-add-post')
                  : message,
              status: status,
            });
            return { data, status, message };
          },
        },
      });

    const getPanelData = async () => {
      const result = await DocumentService.get({ id: `public/?tags=${prefixTags.join(',')}` });

      NotificationManager.Push({
        html: result.status === 'success' ? Translate.Render('success-get-posts') : result.message,
        status: result.status,
      });
      if (result.status === 'success') {
        PanelUnderpost.Data.originData = newInstance(result.data);
        PanelUnderpost.Data.filesData = [];
        PanelUnderpost.Data.data = [];
        for (const documentObject of result.data.reverse()) {
          let fileId, imageFileId;
          let fileBlob, imageBlob;
          let filePlain, imagePlain;

          {
            const {
              data: [file],
              status,
            } = await FileService.get({ id: documentObject.fileId._id });

            // const ext = file.name.split('.')[file.name.split('.').length - 1];
            fileBlob = file;
            filePlain = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
            fileId = newInstance(filePlain);
          }
          if (documentObject.imageFileId) {
            const {
              data: [file],
              status,
            } = await FileService.get({ id: documentObject.imageFileId });

            // const ext = file.name.split('.')[file.name.split('.').length - 1];
            imageBlob = file;
            imagePlain = null;
            imageFileId = getSrcFromFileData(file);
          }

          PanelUnderpost.Data.filesData.push({
            id: documentObject._id,
            _id: documentObject._id,
            fileId: { fileBlob, filePlain },
            imageFileId: { imageBlob, imagePlain },
          });

          PanelUnderpost.Data.data.push({
            id: documentObject._id,
            title: documentObject.title,
            createdAt: dateFormat(documentObject.createdAt),
            tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
            fileId: marked.parse(fileId),
            userId: documentObject.userId._id,
            imageFileId,
            tools: ElementsUnderpost.Data.user.main.model.user._id === documentObject.userId._id,
            _id: documentObject._id,
            new:
              documentObject.createdAt &&
              new Date().getTime() - new Date(documentObject.createdAt).getTime() < newRenderMsLimit
                ? newRender
                : undefined,
          });
        }
      }
    };
    const renderSrrPanelData = async () =>
      await panelRender({
        data: range(0, 5).map((i) => ({
          id: i,
          title: html`<div class="fl">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '80%',
                  height: '30px',
                  top: '-13px',
                  left: '10px',
                },
              })}"
            ></div>
          </div>`,
          createdAt: html`<div class="fl">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '50%',
                  height: '30px',
                  left: '-5px',
                },
              })}"
            ></div>
          </div>`,
          fileId: html`<div class="fl section-mp">
            <div
              class="in fll ssr-shimmer-search-box"
              style="${renderCssAttr({
                style: {
                  width: '80%',
                  height: '30px',
                },
              })}"
            ></div>
          </div>`.repeat(random(2, 4)),
          ssr: true,
        })),
      });
    this.updatePanel = async () => {
      htmls(`.html-main-body`, await renderSrrPanelData());
      await getPanelData();
      htmls(`.html-main-body`, await panelRender({ data: this.Data.data }));
    };
    if (!Auth.getToken()) setTimeout(this.updatePanel);

    return await renderSrrPanelData();
  },
  updatePanel: () => null,
};

export { PanelUnderpost };
