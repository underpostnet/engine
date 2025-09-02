import { getCapVariableName, newInstance, random, range, uniqueArray } from './CommonJs.js';
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
import { imageShimmer, renderCssAttr } from './Css.js';
import { Translate } from './Translate.js';
import { Modal } from './Modal.js';
import { closeModalRouteChangeEvents, listenQueryPathInstance, renderTitle, setQueryPath } from './Router.js';

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
      htmlFormHeader: async () => '',
      firsUpdateEvent: async () => {},
    },
  ) {
    const { idPanel, heightTopBar, heightBottomBar, defaultUrlImage, Elements } = options;

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
        id: 'panel-fileId',
        model: 'fileId',
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
        id: 'panel-mdFileId',
        model: 'mdFileId',
        inputType: 'md',
        panel: { type: 'info-row' },
        rules: [],
        label: {
          disabled: true,
        },
      },
    ];

    const titleIcon = html`<i class="fa-solid fa-quote-left title-icon-${idPanel}"></i>`;
    const panelRender = async ({ data }) =>
      await Panel.Render({
        idPanel,
        formData,
        heightTopBar,
        heightBottomBar,
        data,
        htmlFormHeader: options.htmlFormHeader,
        parentIdModal: options.parentIdModal,
        originData: () => PanelForm.Data[idPanel].originData,
        filesData: () => PanelForm.Data[idPanel].filesData,
        scrollClassContainer: options.scrollClassContainer ? options.scrollClassContainer : 'main-body',
        titleIcon,
        route: options.route,
        formContainerClass: 'session-in-log-in',
        onClick: async function ({ payload }) {
          if (options.route) {
            setQueryPath({ path: options.route, queryPath: payload._id });
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
          if (!options.data.fileId)
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
                  src="${defaultUrlImage}"
                />
              `,
            });
          return await options.fileRender({
            file: PanelForm.Data[idPanel].filesData.find((f) => f._id === options.data._id).fileId.fileBlob,
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
              if (getQueryParams().cid === data.id) {
                setQueryPath({ path: options.route, queryPath: '' });
                if (PanelForm.Data[idPanel].updatePanel) await PanelForm.Data[idPanel].updatePanel();
              }

              return { status };
            }
            return { status: 'error' };
          },
          add: async function ({ data, editId }) {
            let mdFileId;
            const mdFileName = `${getCapVariableName(data.title)}.md`;
            const location = `${prefixTags.join('/')}`;
            const blob = new Blob([data.mdFileId], { type: 'text/markdown' });
            const md = new File([blob], mdFileName, { type: 'text/markdown' });
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
            let originObj, originFileObj, indexOriginObj;
            if (editId) {
              indexOriginObj = PanelForm.Data[idPanel].originData.findIndex((d) => d._id === editId);
              if (indexOriginObj > -1) {
                originObj = PanelForm.Data[idPanel].originData[indexOriginObj];
                originFileObj = PanelForm.Data[idPanel].filesData.find((d) => d._id === editId);
              }
            }

            const mdBlob = {
              data: {
                data: await getDataFromInputFile(md),
              },
              mimetype: md.type,
              name: md.name,
            };
            const mdPlain = await getRawContentFile(getBlobFromUint8ArrayFile(mdBlob.data.data, mdBlob.mimetype));
            const baseNewDoc = newInstance(data);
            baseNewDoc.tags = tags.filter((t) => !prefixTags.includes(t));
            baseNewDoc.mdFileId = marked.parse(data.mdFileId);
            baseNewDoc.userId = Elements.Data.user.main.model.user._id;
            baseNewDoc.tools = true;

            const documents = [];
            let message = '';
            let status = 'success';
            let indexFormDoc = -1;
            const filesData = data.fileId ? data.fileId : [null];

            for (const file of filesData) {
              indexFormDoc++;
              let fileId;

              await (async () => {
                const body = new FormData();
                body.append('md', md);
                if (file) body.append('file', file);
                const { status, data } = await FileService.post({ body });
                // await timer(3000);
                NotificationManager.Push({
                  html: Translate.Render(`${status}-upload-file`),
                  status,
                });
                if (status === 'success') {
                  mdFileId = data[0]._id;
                  if (data[1]) fileId = data[1]._id;
                }
              })();
              const body = {
                location,
                tags,
                fileId,
                mdFileId,
                title: data.title,
              };
              const {
                status: documentStatus,
                message: documentMessage,
                data: documentData,
              } = originObj && indexFormDoc === 0
                ? await DocumentService.put({ id: originObj._id, body })
                : await DocumentService.post({
                    body,
                  });

              const newDoc = {
                ...baseNewDoc,
                fileId: file ? URL.createObjectURL(file) : undefined,
                _id: documentData._id,
                id: documentData._id,
                createdAt: documentData.createdAt,
              };

              if (documentStatus === 'error') status = 'error';
              if (message) message += `${indexFormDoc === 0 ? '' : ', '}${documentMessage}`;

              const filesData = {
                id: documentData._id,
                _id: documentData._id,
                mdFileId: { mdBlob, mdPlain },
                fileId: {
                  fileBlob: file
                    ? {
                        data: {
                          data: await getDataFromInputFile(file),
                        },
                        mimetype: file.type,
                        name: file.name,
                      }
                    : undefined,
                  filePlain: undefined,
                },
              };

              if (originObj && indexFormDoc === 0) {
                PanelForm.Data[idPanel].originData[indexOriginObj] = documentData;
                PanelForm.Data[idPanel].data[indexOriginObj] = newDoc;
                PanelForm.Data[idPanel].filesData[indexOriginObj] = filesData;
              } else {
                PanelForm.Data[idPanel].originData.push(documentData);
                PanelForm.Data[idPanel].data.push(newDoc);
                PanelForm.Data[idPanel].filesData.push(filesData);
              }
              documents.push(newDoc);
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

            setQueryPath({ path: options.route, queryPath: documents.map((d) => d._id).join(',') });
            if (options.parentIdModal) Modal.Data[options.parentIdModal].query = `${window.location.search}`;

            return { data: documents, status, message };
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
        for (const documentObject of result.data) {
          let mdFileId, fileId;
          let mdBlob, fileBlob;
          let mdPlain, filePlain;

          {
            const {
              data: [file],
              status,
            } = await FileService.get({ id: documentObject.mdFileId });

            // const ext = file.name.split('.')[file.name.split('.').length - 1];
            mdBlob = file;
            mdPlain = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
            mdFileId = newInstance(mdPlain);
          }
          if (documentObject.fileId) {
            const {
              data: [file],
              status,
            } = await FileService.get({ id: documentObject.fileId._id });

            // const ext = file.name.split('.')[file.name.split('.').length - 1];
            fileBlob = file;
            filePlain = undefined;
            fileId = getSrcFromFileData(file);
          }

          PanelForm.Data[idPanel].filesData.push({
            id: documentObject._id,
            _id: documentObject._id,
            mdFileId: { mdBlob, mdPlain },
            fileId: { fileBlob, filePlain },
          });

          PanelForm.Data[idPanel].data.push({
            id: documentObject._id,
            title: documentObject.title,
            createdAt: documentObject.createdAt,
            tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
            mdFileId: marked.parse(mdFileId),
            userId: documentObject.userId._id,
            fileId,
            tools: Elements.Data.user.main.model.user._id === documentObject.userId._id,
            _id: documentObject._id,
          });
        }
      }
    };
    const renderSrrPanelData = async () =>
      await panelRender({
        data: range(0, 0).map((i) => ({
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
          mdFileId: html`<div class="fl section-mp">
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
    let firsUpdateEvent = false;
    let lastCid;
    let lastUserId;
    closeModalRouteChangeEvents[idPanel] = (newPath) => {
      if (newPath.split('?')[0] === '/' && PanelForm.Data[idPanel].data && PanelForm.Data[idPanel].data.length === 0) {
        this.Data[idPanel].updatePanel();
      }
    };
    this.Data[idPanel].updatePanel = async () => {
      const cid = getQueryParams().cid ? getQueryParams().cid : '';
      const forceUpdate = lastUserId !== Elements.Data.user.main.model.user._id;
      if (lastCid === cid && !forceUpdate) return;
      lastUserId = newInstance(Elements.Data.user.main.model.user._id);
      lastCid = cid;
      if (options.route === 'home') Modal.homeCid = newInstance(cid);
      htmls(`.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`, await renderSrrPanelData());
      await getPanelData();
      if (this.Data[idPanel].data.length === 1) renderTitle(this.Data[idPanel].data[0].title);
      htmls(
        `.${options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body'}`,
        await panelRender({ data: this.Data[idPanel].data }),
      );
      if (!firsUpdateEvent && options.firsUpdateEvent) {
        firsUpdateEvent = true;
        await options.firsUpdateEvent();
      }
    };
    if (options.route) {
      listenQueryPathInstance({
        id: options.parentIdModal ? 'html-' + options.parentIdModal : 'main-body',
        routeId: options.route,
        event: async (path) => {
          await this.Data[idPanel].updatePanel();
        },
      });
      if (!options.parentIdModal)
        Modal.Data['modal-menu'].onHome[idPanel] = async () => {
          lastCid = undefined;
          lastUserId = undefined;
          setQueryPath({ path: options.route, queryPath: '' });
          await this.Data[idPanel].updatePanel();
        };
    }

    if (options.parentIdModal) {
      htmls(`.html-${options.parentIdModal}`, await renderSrrPanelData());
      return '';
    }

    return await renderSrrPanelData();
  },
};

export { PanelForm };
