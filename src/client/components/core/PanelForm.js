import { getCapVariableName, getId, newInstance, random, range, timer, uniqueArray } from './CommonJs.js';
import { marked } from 'marked';
import {
  getBlobFromUint8ArrayFile,
  getDataFromInputFile,
  getQueryParams,
  getRawContentFile,
  htmls,
} from './VanillaJs.js';
import { Panel } from './Panel.js';
import { NotificationManager } from './NotificationManager.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { getSrcFromFileData } from './Input.js';
import { Auth } from './Auth.js';
import { imageShimmer, renderCssAttr } from './Css.js';
import { Translate } from './Translate.js';
import { Modal } from './Modal.js';
import { listenQueryPathInstance, setQueryPath } from './Router.js';

const PanelForm = {
  Data: {},
  instance: async function (
    options = {
      idPanel: '',
      heightTopBar: 50,
      heightBottomBar: 50,
      defaultUrlImage: '',
      Elements: {},
      parentIdModal: undefined,
      route: 'home',
    },
  ) {
    const { idPanel, heightTopBar, heightBottomBar, defaultUrlImage, Elements } = options;
    let extension = `.md`;
    let prefixTags = [idPanel, 'public'];
    this.Data[idPanel] = {
      originData: [],
      data: [],
      filesData: [],
    };

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
    const panelRender = async ({ data }) =>
      await Panel.Render({
        idPanel,
        formData,
        heightTopBar,
        heightBottomBar,
        data,
        parentIdModal: options.parentIdModal,
        originData: () => PanelForm.Data[idPanel].originData,
        filesData: () => PanelForm.Data[idPanel].filesData,
        scrollClassContainer: options.scrollClassContainer ? options.scrollClassContainer : 'main-body',
        titleIcon,
        formContainerClass: 'session-in-log-in',
        onClick: async function ({ payload }) {
          if (options.route) {
            setQueryPath({ path: options.route, queryPath: payload._id }, 'cid');
            if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;
            if (PanelForm.Data[idPanel].updatePanel) await PanelForm.Data[idPanel].updatePanel();
          }
        },
        callBackPanelRender: async function (options) {
          if (options.data.ssr) {
            return await options.htmlRender({
              render: imageShimmer(),
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
                  src=${defaultUrlImage}
                />
              `,
            });
          return await options.fileRender({
            file: PanelForm.Data[idPanel].filesData.find((f) => f._id === options.data._id).imageFileId.imageBlob,
            style: {
              overflow: 'auto',
              width: '100%',
              height: 'auto',
            },
          });
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
            const fileName = `${getCapVariableName(data.title)}${extension}`;
            const location = `${prefixTags.join('/')}`;
            const blob = new Blob([data.fileId], { type: 'text/markdown' });
            const file = new File([blob], fileName, { type: 'text/markdown' });
            // -> multiple content render imageFileId: []
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
              indexOriginObj = PanelForm.Data[idPanel].originData.findIndex((d) => d._id === editId);
              if (indexOriginObj > -1) originObj = PanelForm.Data[idPanel].originData[indexOriginObj];
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
                  data: await getDataFromInputFile(file),
                },
                mimetype: file.type,
                name: file.name,
              },
              imageBlob = image
                ? {
                    data: {
                      data: await getDataFromInputFile(image),
                    },
                    mimetype: image.type,
                    name: image.name,
                  }
                : undefined;

            let filePlain = await getRawContentFile(getBlobFromUint8ArrayFile(fileBlob.data.data, fileBlob.mimetype)),
              imagePlain = null;

            data.createdAt = dateFormat(documentData.createdAt);
            if (image) data.imageFileId = URL.createObjectURL(image);
            data.tags = tags.filter((t) => !prefixTags.includes(t));
            data.fileId = marked.parse(data.fileId);
            data.userId = Elements.Data.user.main.model.user._id;
            data.tools = true;
            data._id = documentData._id;

            const filesData = {
              id: documentData._id,
              _id: documentData._id,
              fileId: { fileBlob, filePlain },
              imageFileId: { imageBlob, imagePlain },
            };
            if (originObj) {
              PanelForm.Data[idPanel].originData[indexOriginObj] = documentData;
              PanelForm.Data[idPanel].data[indexOriginObj] = data;
              PanelForm.Data[idPanel].filesData[indexOriginObj] = filesData;
            } else {
              PanelForm.Data[idPanel].originData.push(documentData);
              PanelForm.Data[idPanel].data.push(data);
              PanelForm.Data[idPanel].filesData.push(filesData);
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
      const result = await DocumentService.get({
        id: `public/?tags=${prefixTags.join(',')}${getQueryParams().cid ? `&cid=${getQueryParams().cid}` : ''}`,
      });

      NotificationManager.Push({
        html: result.status === 'success' ? Translate.Render('success-get-posts') : result.message,
        status: result.status,
      });
      if (result.status === 'success') {
        PanelForm.Data[idPanel].originData = newInstance(result.data);
        PanelForm.Data[idPanel].filesData = [];
        PanelForm.Data[idPanel].data = [];
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

          PanelForm.Data[idPanel].filesData.push({
            id: documentObject._id,
            _id: documentObject._id,
            fileId: { fileBlob, filePlain },
            imageFileId: { imageBlob, imagePlain },
          });

          PanelForm.Data[idPanel].data.push({
            id: documentObject._id,
            title: documentObject.title,
            createdAt: dateFormat(documentObject.createdAt),
            tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
            fileId: marked.parse(fileId),
            userId: documentObject.userId._id,
            imageFileId,
            tools: Elements.Data.user.main.model.user._id === documentObject.userId._id,
            _id: documentObject._id,
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

    let lastCid;
    this.Data[idPanel].updatePanel = async () => {
      const cid = getQueryParams().cid ? getQueryParams().cid : '';
      if (lastCid === cid) return;
      if (options.route === 'home') Modal.homeCid = newInstance(cid);
      lastCid = cid;
      htmls(`.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`, await renderSrrPanelData());
      await getPanelData();
      htmls(
        `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`,
        await panelRender({ data: this.Data[idPanel].data }),
      );
    };
    if (options.route)
      listenQueryPathInstance(
        {
          id: options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body',
          routeId: options.route,
          event: async (path) => {
            await this.Data[idPanel].updatePanel();
          },
        },
        'cid',
      );

    setTimeout(this.Data[idPanel].updatePanel);

    if (options.parentIdModal) {
      htmls(`.html-${options.parentIdModal}`, await renderSrrPanelData());
      return '';
    }

    return await renderSrrPanelData();
  },
};

export { PanelForm };
