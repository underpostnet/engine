import { getId, isValidDate, newInstance } from './CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Validator } from '../core/Validator.js';
import { Input } from '../core/Input.js';
import { darkTheme, ThemeEvents } from './Css.js';
import { append, getDataFromInputFile, htmls, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { DropDown } from './DropDown.js';
import { dynamicCol } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { RichText } from './RichText.js';
import { loggerFactory } from './Logger.js';
import { Badge } from './Badge.js';
import { Content } from './Content.js';

const logger = loggerFactory(import.meta);

const Panel = {
  Tokens: {},
  Render: async function (
    options = {
      idPanel: '',
      parentIdModal: '',
      scrollClassContainer: '',
      htmlFormHeader: async () => '',
      formData: [],
      data: [],
      originData: () => [],
      filesData: () => [],
      onClick: () => {},
    },
  ) {
    const idPanel = options?.idPanel ? options.idPanel : getId(this.Tokens, `${idPanel}-`);
    if (options.formData)
      options.formData = options.formData.map((formObj) => {
        formObj.id = `${idPanel}-${formObj.id}`;
        return formObj;
      });
    const { scrollClassContainer, formData, data, heightTopBar, heightBottomBar } = options;

    const titleObj = formData.find((f) => f.panel && f.panel.type === 'title');
    const titleKey = titleObj ? titleObj.model : '';

    const subTitleObj = formData.find((f) => f.panel && f.panel.type === 'subtitle');
    const subTitleKey = subTitleObj ? subTitleObj.model : '';

    const fileNameInputExtDefaultContent = html` <div class="abs center">
      <i style="font-size: 25px" class="fa-solid fa-cloud"></i>
    </div>`;

    const openPanelForm = () => {
      s(`.${idPanel}-form-body`).classList.remove('hide');
      s(`.btn-${idPanel}-add`).classList.add('hide');
      // s(`.${scrollClassContainer}`).style.overflow = 'hidden';
      if (options.customButtons) {
        let customBtnIndex = -1;
        for (const dataBtn of options.customButtons) {
          customBtnIndex++;
          const customBtnIndexFn = customBtnIndex;
          const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
          s(`.${btnSelector}`).classList.add('hide');
        }
      }
      setTimeout(() => {
        s(`.${idPanel}-form-body`).style.opacity = 1;
      });
    };

    const renderPanel = async (payload) => {
      const obj = newInstance(payload);
      if ('_id' in obj) obj.id = obj._id;
      const { id } = obj;

      setTimeout(async () => {
        if (!s(`.${idPanel}`)) return;
        LoadingAnimation.spinner.play(`.${idPanel}-img-spinner-${id}`, 'dual-ring');
        if (options && options.callBackPanelRender)
          await options.callBackPanelRender({
            data: obj,
            fileRender: async (options = { file: '', style: {}, class: '' }) => {
              await Content.RenderFile({ container: `.${idPanel}-cell-col-a-${id}`, ...options });
              s(`.${idPanel}-img-spinner-${id}`).classList.add('hide');
            },
            htmlRender: async ({ render }) => {
              htmls(`.${idPanel}-cell-col-a-${id}`, render);
            },
          });
        EventsUI.onClick(
          `.${idPanel}-btn-delete-${id}`,
          async (e) => {
            logger.warn('delete', obj);
            const { status } = await options.on.remove({ e, data: obj });
            if (status === 'error') return;
            if (s(`.${idPanel}-${id}`)) s(`.${idPanel}-${id}`).remove();
          },
          { context: 'modal' },
        );
        EventsUI.onClick(`.${idPanel}-btn-edit-${id}`, async () => {
          logger.warn('edit', obj);
          if (obj._id) Panel.Tokens[idPanel].editId = obj._id;
          else if (obj.id) Panel.Tokens[idPanel].editId = obj.id;

          s(`.btn-${idPanel}-label-edit`).classList.remove('hide');
          s(`.btn-${idPanel}-label-add`).classList.add('hide');

          openPanelForm();
          // s(`.btn-${idPanel}-add`).click();
          s(`.${scrollClassContainer}`).scrollTop = 0;
          Input.setValues(
            formData,
            obj,
            options.originData().find((d) => d._id === obj._id || d.id === obj.id),
            options.filesData().find((d) => d._id === obj._id || d.id === obj.id),
          );
        });
        s(`.a-${payload._id}`).onclick = async (e) => {
          e.preventDefault();
          if (options.onClick) await options.onClick({ payload });
        };
        s(`.container-${idPanel}-${id}`).onclick = async (e) => {
          e.preventDefault();
          // if (options.onClick) await options.onClick({ payload });
        };
      });
      if (s(`.${idPanel}-${id}`)) s(`.${idPanel}-${id}`).remove();
      return html` <div class="in box-shadow ${idPanel} ${idPanel}-${id}">
        <div class="fl ${idPanel}-tools session-fl-log-in  ${obj.tools ? '' : 'hide'}">
          ${await BtnIcon.Render({
            class: `in flr main-btn-menu action-bar-box ${idPanel}-btn-tool ${idPanel}-btn-edit-${id}`,
            label: html`<div class="abs center"><i class="fas fa-edit"></i></div>`,
            tooltipHtml: await Badge.Render({
              id: `tooltip-${idPanel}-${id}`,
              text: `${Translate.Render(`edit`)}`,
              classList: '',
              style: { top: `-22px`, left: '-5px' },
            }),
          })}
          ${await BtnIcon.Render({
            class: `in flr main-btn-menu action-bar-box ${idPanel}-btn-tool ${idPanel}-btn-delete-${id}`,
            label: html`<div class="abs center"><i class="fas fa-trash"></i></div>`,
            tooltipHtml: await Badge.Render({
              id: `tooltip-${idPanel}-${id}`,
              text: `${Translate.Render(`delete`)}`,
              classList: '',
              style: { top: `-22px`, left: '-13px' },
            }),
          })}
        </div>
        <div class="in container-${idPanel}-${id}">
          <div class="in ${idPanel}-head">
            <div class="in ${idPanel}-title">
              ${options.titleIcon}
              <a href="?cid=${payload._id}" class="a-title-${idPanel} a-${payload._id}">
                ${titleKey ? obj[titleKey] : ''}</a
              >
            </div>
            <div class="in ${idPanel}-subtitle">
              ${subTitleKey ? obj[subTitleKey] : ''} <span class="tag-render-${id}"></span>
            </div>
            <!--  <div class="in ${idPanel}-tags"></div> -->
          </div>
          <div class="fl">
            <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-a ${idPanel}-cell-col-a-${id}">
              <div class="abs center ${idPanel}-img-spinner-${id}"></div>
            </div>
            <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-b">
              ${Object.keys(obj)
                .map((infoKey) => {
                  if (infoKey === 'id') return html``;
                  const formObjData = formData.find((f) => f.model === infoKey);
                  const valueIcon = formObjData?.panel?.icon?.value ? formObjData.panel.icon.value : '';
                  const keyIcon = formObjData?.panel?.icon?.key ? formObjData.panel.icon.key : '';

                  if (formObjData && ['datetime-local'].includes(formObjData.inputType) && isValidDate(obj[infoKey])) {
                    obj[infoKey] = `${obj[infoKey]}`.replace('T', ' ').replace('.000Z', '');
                  }

                  if (formData.find((f) => f.model === infoKey && f.panel && f.panel.type === 'tags')) {
                    setTimeout(async () => {
                      let tagRender = html``;
                      for (const tag of obj[infoKey]) {
                        tagRender += await Badge.Render({
                          text: tag,
                          style: { color: 'white' },
                          classList: 'inl',
                          style: { margin: '3px', background: `#a2a2a2` },
                        });
                      }
                      if (s(`.tag-render-${id}`)) htmls(`.tag-render-${id}`, tagRender);
                    });
                    return html``;
                  }
                  {
                    const formDataObj = formData.find((f) => f.model === infoKey && f.panel && f.panel.type === 'list');
                    if (obj[infoKey] && obj[infoKey].length > 0 && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon} ${Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-value"
                          >${valueIcon} ${obj[infoKey].map((k) => Translate.Render(k)).join(', ')}</span
                        >
                      </div> `;
                  }

                  {
                    const formDataObj = formData.find(
                      (f) => f.model === infoKey && f.panel && f.panel.type === 'info-row-pin',
                    );
                    if (obj[infoKey] && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-pin-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon}
                          ${formDataObj.translateCode
                            ? Translate.Render(formDataObj.translateCode)
                            : Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-pin-value">${valueIcon} ${obj[infoKey]}</span>
                      </div> `;
                  }

                  {
                    const formDataObj = formData.find(
                      (f) => f.model === infoKey && f.panel && f.panel.type === 'info-row',
                    );
                    if (obj[infoKey] && formDataObj)
                      return html`<div class="in ${idPanel}-row">
                        <span class="${idPanel}-row-key capitalize ${formObjData.label?.disabled ? 'hide' : ''}">
                          ${keyIcon}
                          ${formDataObj.translateCode
                            ? Translate.Render(formDataObj.translateCode)
                            : Translate.Render(infoKey)}:</span
                        >
                        <span class="${idPanel}-row-value"> ${valueIcon} ${obj[infoKey]}</span>
                      </div> `;
                  }

                  return html``;
                })
                .join('')}
            </div>
          </div>
        </div>
      </div>`;
    };

    let render = '';
    let renderForm = html` <div class="in modal" style="top: 0px; z-index: 1; padding-bottom: 5px">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-${idPanel}-close`,
          label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
          type: 'button',
        })}
      </div>
      ${options?.htmlFormHeader ? await options.htmlFormHeader() : ''}`;

    for (const modelData of formData) {
      if (modelData.disableRender) continue;
      switch (modelData.inputType) {
        case 'dropdown-checkbox': {
          renderForm += html`<div class="in section-mp">
            ${await DropDown.Render({
              id: `${modelData.id}`,
              label: html`${Translate.Render(modelData.model)}`,
              type: 'checkbox',
              value: modelData.dropdown.options[0],
              resetOption: true,
              containerClass: `${idPanel}-dropdown-checkbox`,
              data: modelData.dropdown.options.map((dKey) => {
                return {
                  value: dKey,
                  data: dKey,
                  checked: false,
                  display: html`${Translate.Render(dKey)}`,
                  onClick: function () {
                    logger.info('DropDown onClick', this.checked);
                  },
                };
              }),
            })}
          </div>`;
          break;
        }
        case 'dropdown':
          renderForm += html` <div class="in section-mp">
            ${await DropDown.Render({
              id: `${modelData.id}`,
              label: html`${Translate.Render(modelData.model)}`,
              containerClass: `${idPanel}-dropdown`,
              // type: 'checkbox',
              value: modelData.dropdown.options[0].replaceAll(' ', '-').toLowerCase(),
              data: modelData.dropdown.options.map((dKey) => {
                const key = dKey.replaceAll(' ', '-').toLowerCase();
                return {
                  value: key,
                  data: dKey,
                  // checked: true,
                  display: html`${Translate.Render(dKey)}`,
                  onClick: function () {},
                };
              }),
            })}
          </div>`;
          break;
        case 'md': {
          renderForm += html`<div class="in section-mp">
            ${await RichText.Render({ id: modelData.id, parentIdModal: options.parentIdModal })}
          </div>`;
          break;
        }

        case 'checkbox-on-off':
          {
            setTimeout(() => {
              s(`.toggle-form-container-${modelData.id}`).onclick = () => {
                ToggleSwitch.Tokens[`${modelData.id}`].click();
              };
            });
            renderForm += html`<div
              class="in section-mp toggle-form-container toggle-form-container-${modelData.id} hover"
              style="height: 82px;"
            >
              <div class="fl">
                <div class="in fll" style="width: 70%">
                  <div class="in">
                    ${modelData.panel && modelData.panel.icon ? modelData.panel.icon : ''}
                    ${Translate.Render(modelData.model)}
                  </div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.Render({
                    id: `${modelData.id}`,
                    containerClass: 'inl',
                    disabledOnClick: true,
                    checked: false,
                    on: {
                      unchecked: () => {},
                      checked: () => {},
                    },
                  })}
                </div>
              </div>
            </div>`;
          }
          break;
        case 'file':
          setTimeout(() => {
            s(`.${modelData.id}`).fileNameInputExtDefaultContent = fileNameInputExtDefaultContent;
            s(`.${modelData.id}`).onchange = async (e) => {
              if (!Object.keys(e.target.files).length) return;
              s(`.${modelData.id}`).inputFiles = e.target.files;
              let htmlFileRender = '';
              for (const fileKey of Object.keys(e.target.files)) {
                const file = e.target.files[fileKey];
                htmlFileRender += html`${await Content.RenderFile({
                    url: URL.createObjectURL(file),
                    file: {
                      mimetype: file.type,
                      name: file.name,
                      data: {
                        data: await getDataFromInputFile(file),
                      },
                    },

                    raw: true,
                  })}
                  <div class="in" style="overflow: hidden">${file.name}</div>`;
              }
              htmls(`.file-name-render-${modelData.id}`, htmlFileRender);
            };
          });
          renderForm += `${await Input.Render({
            inputClass: 'hide',
            id: `${modelData.id}`,
            type: modelData.inputType,
            multiple: true,
            // autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-file-arrow-up"></i> ${Translate.Render('select')}
              ${Translate.Render('file')}`,
            containerClass: 'in section-mp width-mini-box input-container',
            placeholder: true,
            extension: () =>
              html`<div class="file-name-render-${modelData.id}" style="min-height: 50px">
                ${fileNameInputExtDefaultContent}
              </div>`,
            // disabled: true,
            // disabledEye: true,
          })}`;
          break;
        default:
          renderForm += `${await Input.Render({
            id: `${modelData.id}`,
            type: modelData.inputType,
            // autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render(modelData.model)}`,
            containerClass: 'in section-mp width-mini-box input-container',
            placeholder: true,
            // disabled: true,
            // disabledEye: true,
          })}`;
          break;
      }
    }
    let renderFormBtn = html`
      ${await BtnIcon.Render({
        class: `inl section-mp btn-custom btn-${idPanel}-submit`,
        label: html`<span class="btn-${idPanel}-label-add"><i class="fas fa-plus"></i> ${Translate.Render('add')}</span
          ><span class="btn-${idPanel}-label-edit hide"><i class="fas fa-edit"></i> ${Translate.Render('edit')}</span>`,
        type: 'submit',
      })}
      ${await BtnIcon.Render({
        class: `inl section-mp btn-custom btn-${idPanel}-clean`,
        label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
        type: 'button',
      })}
    `;

    setTimeout(async () => {
      const validators = await Validator.instance(formData);

      s(`.${idPanel}-form`).onsubmit = (e) => {
        e.preventDefault();
        s(`.btn-${idPanel}-submit`).click();
      };
      EventsUI.onClick(`.btn-${idPanel}-submit`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const obj = Input.getValues(formData);
        obj.id = `${data.length}`;
        let documents;
        if (options && options.on && options.on.add) {
          const { status, data } = await options.on.add({ data: obj, editId: Panel.Tokens[idPanel].editId });
          if (status === 'error') return;
          documents = data;
        }
        s(`.btn-${idPanel}-clean`).click();
        if (Panel.Tokens[idPanel].editId && s(`.${idPanel}-${Panel.Tokens[idPanel].editId}`))
          s(`.${idPanel}-${Panel.Tokens[idPanel].editId}`).remove();
        if (Array.isArray(documents)) {
          htmls(`.${idPanel}-render`, '');
          for (const doc of documents) {
            append(`.${idPanel}-render`, await renderPanel(doc));
          }
        } else htmls(`.${idPanel}-render`, await renderPanel({ ...obj, ...documents }));
        Input.cleanValues(formData);
        s(`.btn-${idPanel}-close`).click();
        s(`.${scrollClassContainer}`).scrollTop = 0;
        if (s(`.${scrollClassContainer}`)) s(`.${scrollClassContainer}`).style.overflow = 'auto';
      });
      s(`.btn-${idPanel}-clean`).onclick = () => {
        Input.cleanValues(formData);
      };
      s(`.btn-${idPanel}-close`).onclick = (e) => {
        e.preventDefault();
        s(`.${idPanel}-form-body`).style.opacity = 0;
        s(`.btn-${idPanel}-add`).classList.remove('hide');
        s(`.${scrollClassContainer}`).style.overflow = 'auto';
        if (options.customButtons) {
          let customBtnIndex = -1;
          for (const dataBtn of options.customButtons) {
            customBtnIndex++;
            const customBtnIndexFn = customBtnIndex;
            const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
            s(`.${btnSelector}`).classList.remove('hide');
          }
        }
        s(`.${idPanel}-form-body`).classList.add('hide');
      };
      s(`.btn-${idPanel}-add`).onclick = (e) => {
        e.preventDefault();
        // s(`.btn-${idPanel}-clean`).click();
        Panel.Tokens[idPanel].editId = undefined;
        s(`.btn-${idPanel}-label-add`).classList.remove('hide');
        s(`.btn-${idPanel}-label-edit`).classList.add('hide');
        s(`.${scrollClassContainer}`).scrollTop = 0;

        openPanelForm();
      };
      if (s(`.${scrollClassContainer}`)) s(`.${scrollClassContainer}`).style.overflow = 'auto';
    });

    if (data.length > 0) for (const obj of data) render += await renderPanel(obj);
    else
      render += html`<div class="in" style="min-height: 200px">
        <div class="abs center"><i class="fas fa-exclamation-circle"></i> ${Translate.Render(`no-result-found`)}</div>
      </div>`;

    this.Tokens[idPanel] = { idPanel, scrollClassContainer, formData, data, titleKey, subTitleKey, renderPanel };

    let customButtonsRender = '';
    if (options && options.customButtons) {
      let customBtnIndex = -1;
      for (const dataBtn of options.customButtons) {
        customBtnIndex++;
        const customBtnIndexFn = customBtnIndex;
        const btnSelector = `btn-${idPanel}-custom${customBtnIndexFn}`;
        if (dataBtn.onClick)
          setTimeout(() => {
            s(`.${btnSelector}`).onclick = () => dataBtn.onClick();
          });
        customButtonsRender += ` ${await BtnIcon.Render({
          class: `inl section-mp btn-custom ${btnSelector}`,
          label: dataBtn.label,
          type: 'button',
        })}`;
      }
    }

    // Add theme change handler
    const themeChangeHandler = () => {
      const styleElement = s(`.${idPanel}-styles`);
      if (styleElement) {
        styleElement.textContent = darkTheme
          ? getDarkStyles(idPanel, scrollClassContainer)
          : getLightStyles(idPanel, scrollClassContainer);
      }
    };

    // Add theme change listener
    ThemeEvents[`${idPanel}-theme`] = themeChangeHandler;

    // Initial styles
    setTimeout(ThemeEvents[`${idPanel}-theme`]);

    return html`
      <style>
        .${idPanel}-head {
          /* background: white; */
          margin-bottom: 10px;
        }
        .img-${idPanel} {
          width: 100%;
        }
        .${idPanel}-title {
          color: rgba(109, 104, 255, 1);
          font-size: 24px;
          padding: 5px;
        }
        .a-title-${idPanel} {
          color: rgba(109, 104, 255, 1);
        }
        .a-title-${idPanel}:hover {
          color: #e89f4c;
        }
        .${idPanel}-row {
          padding: 5px;
          margin: 5px;
          font-size: 16px;
        }
        .${idPanel}-subtitle {
          font-size: 17px;
          margin-left: 20px;
          top: -7px;
        }
        .${idPanel}-tags {
          font-size: 17px;
          margin-left: 10px;
          top: -7px;
        }
        .${idPanel}-row-key {
        }
        .${idPanel}-row-value {
        }
        .${idPanel}-row-pin-key {
        }
        .${idPanel}-row-pin-value {
          font-size: 20px;
          color: rgb(19 190 84);
        }
        .${idPanel}-form-header {
        }
        .${idPanel}-form-body {
          transition: 0.3s;
        }
        .btn-${idPanel}-add {
          padding: 10px;
          font-size: 20px;
        }
        .${idPanel}-dropdown {
          min-height: 100px;
        }
        .${idPanel}-btn-tool {
          background: none !important;
          color: #c4c4c4 !important;
        }
        .${idPanel}-btn-tool:hover {
          color: #000000 !important;
          font-size: 17px !important;
        }
      </style>
      <style class="${idPanel}-styles"></style>
      <div class="${idPanel}-container">
        <div class="in modal ${idPanel}-form-container ${options.formContainerClass ? options.formContainerClass : ''}">
          <div class="in ${idPanel}-form-header">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-${idPanel}-add ${
                options?.role?.add ? (!options.role.add() ? 'hide' : '') : ''
              }`,
              label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
              type: 'button',
            })}
            <!-- pagination component -->
            ${customButtonsRender}
          </div>
          <div class="in ${idPanel}-form-body hide" style="opacity: 0">
            <form class="in ${idPanel}-form">
              <div class="fl">${renderForm}</div>
              <div class="in">${renderFormBtn}</div>
              <br /><br />
            </form>
          </div>
        </div>
        ${dynamicCol({
          id: `${idPanel}-cell`,
          containerSelector: `${idPanel}-render`,
          limit: 500,
          type: 'a-50-b-50',
        })}
        <div class="in ${idPanel}-render">${render}</div>
      </div>
    `;
  },
};

// Function to generate base styles
function getBaseStyles(idPanel, scrollClassContainer) {
  return css`
    .${scrollClassContainer} {
      scroll-behavior: smooth;
    }
    .${idPanel}-form-container {
      padding-bottom: 20px;
      top: 0px;
      z-index: 1;
      overflow: auto;
    }
    .${idPanel}-form {
      max-width: 900px;
    }
    .${idPanel}-cell {
      min-height: 200px;
    }
    .${idPanel}-container {
    }
    .${idPanel} {
      margin: 10px;
      transition: 0.3s;
      border-radius: 10px;
      padding: 10px;
      min-height: 400px;
    }
    .${idPanel}-head {
      margin-bottom: 10px;
    }
    .img-${idPanel} {
      width: 100%;
    }
    .${idPanel}-row {
      padding: 5px;
      margin: 5px;
      font-size: 16px;
    }
    .${idPanel}-subtitle {
      font-size: 17px;
      margin-left: 20px;
      top: -7px;
    }
    .${idPanel}-tags {
      font-size: 17px;
      margin-left: 10px;
      top: -7px;
    }
    .${idPanel}-form-body {
      transition: 0.3s;
    }
    .btn-${idPanel}-add {
      padding: 10px;
      font-size: 20px;
    }
    .${idPanel}-dropdown {
      min-height: 100px;
    }
  `;
}

// Function to generate light theme styles
function getLightStyles(idPanel, scrollClassContainer) {
  return css`
    ${getBaseStyles(idPanel, scrollClassContainer)}

    .${idPanel} {
      background: #f6f6f6;
      color: black;
    }
    .${idPanel}:hover {
      background: #ffffff;
    }
    .${idPanel}-title {
      color: rgba(109, 104, 255, 1);
      font-size: 24px;
      padding: 5px;
    }
    .a-title-${idPanel} {
      color: rgba(109, 104, 255, 1);
    }
    .a-title-${idPanel}:hover {
      color: #e89f4c;
    }
    .${idPanel}-row-pin-value {
      font-size: 20px;
      color: rgb(19 190 84);
    }
    .${idPanel}-btn-tool {
      background: none !important;
      color: #c4c4c4 !important;
    }
    .${idPanel}-btn-tool:hover {
      color: #000000 !important;
      font-size: 17px !important;
    }
  `;
}

// Function to generate dark theme styles
function getDarkStyles(idPanel, scrollClassContainer) {
  return css`
    ${getBaseStyles(idPanel, scrollClassContainer)}

    .${idPanel} {
      background: #2d2d2d;
      color: #e0e0e0;
    }
    .${idPanel}:hover {
      background: #3a3a3a;
    }
    .${idPanel}-title {
      color: #8a85ff;
      font-size: 24px;
      padding: 5px;
    }
    .a-title-${idPanel} {
      color: #8a85ff;
    }
    .a-title-${idPanel}:hover {
      color: #ffb74d;
    }
    .${idPanel}-row-pin-value {
      font-size: 20px;
      color: #4caf50;
    }
    .${idPanel}-btn-tool {
      background: none !important;
      color: #666666 !important;
    }
    .${idPanel}-btn-tool:hover {
      color: #ffffff !important;
      font-size: 17px !important;
    }
  `;
}

export { Panel };
