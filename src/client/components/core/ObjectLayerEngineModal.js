import { CoreService } from '../../services/core/core.service.js';
import { BtnIcon } from './BtnIcon.js';
import { dynamicCol } from './Css.js';
import { DropDown } from './DropDown.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { getProxyPath, s, append, hexToRgbA } from './VanillaJs.js';
import { s4 } from './CommonJs.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';

const ObjectLayerEngineModal = {
  templates: [
    {
      label: 'empty',
      id: 'empty',
      data: [],
    },
  ],
  RenderTemplate: (colorTemplate) => {
    const ole = s('object-layer-engine');
    if (!ole) {
      return;
    }

    if (colorTemplate.length === 0) {
      ole.clear();
      return;
    }

    const matrix = colorTemplate.map((row) => row.map((hex) => [...hexToRgbA(hex), 255]));
    ole.loadMatrix(matrix);
  },
  ObjectLayerData: {},
  Render: async (options = { idModal: '' }) => {
    await import(`${getProxyPath()}components/core/ObjectLayerEngine.js`);
    // await import(`${getProxyPath()}components/core/WebComponent.js`);
    const directionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];
    const itemTypes = ['skin', 'weapon', 'armor', 'artifact', 'floor'];
    const statTypes = ['effect', 'resistance', 'agility', 'range', 'intelligence', 'utility'];
    let itemActivable = false;

    for (const url of [
      `${getProxyPath()}assets/templates/item-skin-08.json`,
      `${getProxyPath()}assets/templates/item-skin-06.json`,
    ]) {
      const id = url.split('/').pop().replace('.json', '');
      ObjectLayerEngineModal.templates.push({
        label: id,
        id,
        data: JSON.parse(await CoreService.getRaw({ url })).color,
      });
    }

    const cells = 26;
    const pixelSize = parseInt(320 / cells);
    const idSectionA = 'template-section-a';
    const idSectionB = 'template-section-b';

    let directionsCodeBarRender = '';

    for (const directionCode of directionCodes) {
      setTimeout(() => {
        EventsUI.onClick(`.direction-code-bar-frames-btn-${directionCode}`, async () => {
          const image = await s('object-layer-engine').toBlob();
          const json = s('object-layer-engine').exportMatrixJSON();
          const id = `frame-capture-${s4()}-${s4()}`;

          if (!ObjectLayerEngineModal.ObjectLayerData[directionCode])
            ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
          ObjectLayerEngineModal.ObjectLayerData[directionCode].push({ id, image, json });

          append(
            `.frames-${directionCode}`,
            html`
              <div class="in fll ${id}">
                <img class="in fll direction-code-bar-frames-img" src="${URL.createObjectURL(image)}" />
                ${await BtnIcon.Render({
                  label: html`<i class="fa-solid fa-trash"></i>`,
                  class: `abs direction-code-bar-trash-btn direction-code-bar-trash-btn-${id}`,
                })}
              </div>
            `,
          );

          EventsUI.onClick(`.direction-code-bar-trash-btn-${id}`, async () => {
            s(`.${id}`).remove();
            ObjectLayerEngineModal.ObjectLayerData[directionCode] = ObjectLayerEngineModal.ObjectLayerData[
              directionCode
            ].filter((frame) => frame.id !== id);
          });
        });
      });
      directionsCodeBarRender += html`
        <div class="in section-mp-border">
          <div class="fl">
            <div class="in fll">
              <div class="in direction-code-bar-frames-title">${directionCode}</div>
              <div class="in direction-code-bar-frames-btn">
                ${await BtnIcon.Render({
                  label: html`<i class="fa-solid fa-plus"></i>`,
                  class: `direction-code-bar-frames-btn-${directionCode}`,
                })}
              </div>
            </div>
            <div class="frames-${directionCode}"></div>
          </div>
        </div>
      `;
    }

    let statsInputsRender = '';
    for (const statType of statTypes) {
      statsInputsRender += html`
        ${await Input.Render({
          id: `ol-input-item-stats-${statType}`,
          label: html`<div class="inl" style="width: 120px; font-size: 16px; overflow: hidden">
            <i class="fa-solid fa-chart-simple"></i> ${statType}
          </div>`,
          containerClass: 'inl',
          type: 'number',
          min: 0,
          max: 10,
          placeholder: true,
          value: 0,
        })}
      `;
    }

    return html`
      <style>
        .direction-code-bar-frames-title {
          font-weight: bold;
          font-size: 1.2rem;
          padding: 0.5rem;
        }
        .direction-code-bar-frames-img {
          width: 100px;
          height: auto;
          margin: 3px;
        }
        .direction-code-bar-trash-btn {
          top: 3px;
          left: 3px;
          background: red;
          color: white;
        }
        .ol-btn-save {
          padding: 0.5rem;
          font-size: 30px;
          font-weight: bold;
        }
      </style>
      ${dynamicCol({ containerSelector: options.idModal, id: idSectionA })}
      <div class="fl">
        <div class="in fll ${idSectionA}-col-a">
          <div class="in section-mp">
            ${await DropDown.Render({
              value: ObjectLayerEngineModal.templates[0].id,
              label: html`${Translate.Render('select-template')}`,
              data: ObjectLayerEngineModal.templates.map((template) => {
                return {
                  value: template.id,
                  display: html`<i class="fa-solid fa-paint-roller"></i> ${template.label}`,
                  onClick: async () => {
                    ObjectLayerEngineModal.RenderTemplate(template.data);
                  },
                };
              }),
            })}
          </div>
        </div>
        <div class="in fll ${idSectionA}-col-b">
          <object-layer-engine id="ole" width="${cells}" height="${cells}" pixel-size="${pixelSize}">
          </object-layer-engine>
        </div>
      </div>
      ${directionsCodeBarRender}
      ${dynamicCol({ containerSelector: options.idModal, id: idSectionB, type: 'a-50-b-50' })}

      <div class="fl">
        <div class="in fll ${idSectionB}-col-a">
          <div class="in section-mp section-mp-border">
            <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Item data</div>
            ${await Input.Render({
              id: `ol-input-item-id`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-id')}`,
              containerClass: '',
              placeholder: true,
            })}
            ${await Input.Render({
              id: `ol-input-item-description`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-description')}`,
              containerClass: '',
              placeholder: true,
            })}
            <div class="in section-mp">
              ${await DropDown.Render({
                value: itemTypes[0],
                label: html`${Translate.Render('select-item-type')}`,
                data: itemTypes.map((itemType) => {
                  return {
                    value: itemType,
                    display: html`${itemType}`,
                    onClick: async () => {
                      console.warn('itemType click', itemType);
                    },
                  };
                }),
              })}
            </div>
            <div class="in section-mp">
              ${await ToggleSwitch.Render({
                id: 'ol-toggle-item-activable',
                wrapper: true,
                wrapperLabel: html`${Translate.Render('item-activable')}`,
                disabledOnClick: true,
                checked: itemActivable,
                on: {
                  unchecked: () => {
                    itemActivable = false;
                    console.warn('itemActivable', itemActivable);
                  },
                  checked: () => {
                    itemActivable = true;
                    console.warn('itemActivable', itemActivable);
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="in fll ${idSectionB}-col-b">
          <div class="in section-mp section-mp-border">
            <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Stats data</div>
            ${statsInputsRender}
          </div>
        </div>
      </div>

      <div class="in section-mp">
        ${await BtnIcon.Render({
          label: html`<i class="fa-solid fa-save"></i> ${Translate.Render('save')}`,
          class: `in ol-btn-save`,
        })}
      </div>
    `;
  },
};

export { ObjectLayerEngineModal };
