import { getId } from './CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Validator } from '../core/Validator.js';
import { Input } from '../core/Input.js';
import { Responsive } from '../core/Responsive.js';
import { append, htmls, prepend, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { DropDown } from './DropDown.js';
import { dynamicCol } from './Css.js';
import { EventsUI } from './EventsUI.js';

const Panel = {
  Tokens: {},
  Render: async function (
    options = { idPanel: '', scrollClassContainer: '', formData: [], data: [], heightTopBar: 50 },
  ) {
    const idPanel = options?.idPanel ? options.idPanel : getId(this.Tokens, `${idPanel}-`);
    const { scrollClassContainer, formData, data, heightTopBar } = options;

    const titleKey = formData.find((f) => f.panel.type === 'title').model;
    const subTitleKey = formData.find((f) => f.panel.type === 'subtitle').model;
    const renderPanel = (obj) => {
      const { id } = obj;

      const src = 'https://api.api-ninjas.com/v1/randomimage?category=city';
      const options = {
        headers: { 'X-Api-Key': 'FyITmcxRXkCaUehbX6K0/g==uxZcFKL0dZUUg48G', Accept: 'image/jpg' },
      };

      fetch(src, options)
        .then((res) => res.blob())
        .then((blob) => {
          obj.imageUrl = URL.createObjectURL(blob);
          htmls(`.${idPanel}-cell-col-a-${id}`, html`<img class="in img-${idPanel}" src="${obj.imageUrl}" />`);
        });
      setTimeout(async () => {
        LoadingAnimation.spinner.play(`.${idPanel}-img-spinner-${id}`, 'dual-ring');
      });
      return html` <div class="in box-shadow ${idPanel}">
        <div class="in ${idPanel}-head">
          <div class="in ${idPanel}-title">
            ${obj.new ? obj.new : html`<i class="fas fa-tag"></i>`} &nbsp ${obj[titleKey]}
          </div>
          <div class="in ${idPanel}-subtitle">${obj[subTitleKey]}</div>
        </div>
        <div class="fl">
          <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-a ${idPanel}-cell-col-a-${id}">
            <div class="abs center ${idPanel}-img-spinner-${id}"></div>
          </div>
          <div class="in fll ${idPanel}-cell ${idPanel}-cell-col-b">
            ${Object.keys(obj)
              .map((infoKey) => {
                const formObjData = formData.find((f) => f.model === infoKey);
                const valueIcon = formObjData?.panel?.icon?.value ? formObjData.panel.icon.value : '';
                const keyIcon = formObjData?.panel?.icon?.key ? formObjData.panel.icon.key : '';

                const valueNewIcon =
                  obj.new && formObjData?.panel?.newIcon?.value ? formObjData.panel.newIcon.value : '';
                const keyNewIcon = obj.new && formObjData?.panel?.newIcon?.key ? formObjData.panel.newIcon.key : '';

                if (formData.find((f) => f.model === infoKey && f.panel.type === 'info-row-pin'))
                  return html`<div class="in ${idPanel}-row">
                    <span class="${idPanel}-row-pin-key capitalize">${keyNewIcon} ${keyIcon} ${infoKey}:</span>
                    <span class="${idPanel}-row-pin-value">${valueNewIcon} ${valueIcon} ${obj[infoKey]}</span>
                  </div> `;

                if (formData.find((f) => f.model === infoKey && f.panel.type === 'info-row'))
                  return html`<div class="in ${idPanel}-row">
                    <span class="${idPanel}-row-key capitalize">${keyNewIcon} ${keyIcon} ${infoKey}:</span>
                    <span class="${idPanel}-row-value">${valueNewIcon} ${valueIcon} ${obj[infoKey]}</span>
                  </div> `;

                return html``;
              })
              .join('')}
          </div>
        </div>
      </div>`;
    };

    let render = '';
    let renderForm = html` <div class="in modal stq" style="top: 0px; z-index: 1; padding-bottom: 5px">
      ${await BtnIcon.Render({
        class: `section-mp btn-custom btn-${idPanel}-close`,
        label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
        type: 'button',
      })}
    </div>`;

    for (const modelData of formData) {
      if (modelData.disableRender) continue;
      switch (modelData.inputType) {
        case 'dropdown':
          renderForm += html` <div class="inl section-mp">
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

        default:
          renderForm += `${await Input.Render({
            id: `${modelData.id}`,
            type: modelData.inputType,
            // autocomplete: 'new-password',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render(modelData.model)}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            // disabled: true,
            // disabledEye: true,
          })}`;
          break;
      }
    }
    renderForm += html` <div class="in">
      ${await BtnIcon.Render({
        class: `section-mp btn-custom btn-${idPanel}-submit`,
        label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
        type: 'button',
      })}
      ${await BtnIcon.Render({
        class: `section-mp btn-custom btn-${idPanel}-clean`,
        label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
        type: 'button',
      })}
    </div>`;

    setTimeout(async () => {
      Responsive.Event[`${idPanel}-responsive`] = () => {
        if (s(`.${idPanel}-form-container`))
          s(`.${idPanel}-form-container`).style.maxHeight = `${window.innerHeight - heightTopBar}px`;
      };
      Responsive.Event[`${idPanel}-responsive`]();
      const validators = await Validator.instance(formData);
      EventsUI.onClick(`.btn-${idPanel}-submit`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const obj = Input.getValues(formData);
        obj.id = `${data.length}`;
        obj.new = html`<span class="bold" style="color: #ff533ecf;"> <i class="fa-solid fa-tag"></i> NEW ! </span>`;
        data.push(obj);
        prepend(`.${idPanel}-render`, renderPanel(obj));
        Input.cleanValues(formData);
        s(`.btn-${idPanel}-close`).click();
        s(`.${scrollClassContainer}`).scrollTop = 0;
      });
      s(`.btn-${idPanel}-clean`).onclick = () => {
        Input.cleanValues(formData);
      };
      s(`.btn-${idPanel}-close`).onclick = () => {
        s(`.${idPanel}-form-body`).style.opacity = 0;
        s(`.btn-${idPanel}-add`).classList.remove('hide');
        s(`.${scrollClassContainer}`).style.overflow = 'auto';
        setTimeout(() => {
          s(`.${idPanel}-form-body`).classList.add('hide');
        });
      };
      s(`.btn-${idPanel}-add`).onclick = () => {
        s(`.${idPanel}-form-body`).classList.remove('hide');
        s(`.btn-${idPanel}-add`).classList.add('hide');
        s(`.${scrollClassContainer}`).style.overflow = 'hidden';
        setTimeout(() => {
          s(`.${idPanel}-form-body`).style.opacity = 1;
        });
      };
    });

    for (const obj of data) render += renderPanel(obj);

    this.Tokens[idPanel] = { idPanel, scrollClassContainer, formData, data, titleKey, subTitleKey, renderPanel };

    return html`
      <style>
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
          cursor: default;
          border-radius: 10px;
          background: white;
          color: black;
          padding: 10px;
        }
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
          padding: 15px;
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
      </style>
      <div class="${idPanel}-container">
        <div class="stq modal ${idPanel}-form-container session-in-log-in">
          <div class="in ${idPanel}-form-header">
            ${await BtnIcon.Render({
              class: `section-mp wfa btn-${idPanel}-add`,
              label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
              type: 'button',
            })}
          </div>
          <div class="in ${idPanel}-form-body hide" style="opacity: 0">
            <form class="in ${idPanel}-form">${renderForm}</form>
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

export { Panel };
