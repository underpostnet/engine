import { CoreService } from '../../services/core/core.service.js';
import { BtnIcon } from './BtnIcon.js';
import { borderChar, dynamicCol } from './Css.js';
import { DropDown } from './DropDown.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { getProxyPath, s, append, hexToRgbA } from './VanillaJs.js';
import { s4 } from './CommonJs.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';

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
    let selectItemType = itemTypes[0];
    let itemActivable = false;
    let renderIsStateless = false;
    let renderFrameDuration = 100;

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

        EventsUI.onClick(`.ol-btn-save`, async () => {
          const objectLayer = {
            data: {
              render: {
                frames: {},
                color: [],
                frame_duration: 0,
                is_stateless: false,
              },
              stats: {},
              item: {},
            },
          };
          for (const directionCode of directionCodes) {
            const directions = ObjectLayerEngineModal.getDirectionsFromDirectionCode(directionCode);
            for (const direction of directions) {
              if (!objectLayer.data.render.frames[direction]) objectLayer.data.render.frames[direction] = [];

              if (!(directionCode in ObjectLayerEngineModal.ObjectLayerData)) {
                console.warn('No set directionCodeBarFrameData for directionCode', directionCode);
                continue;
              }

              for (const frameData of ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
                const { matrix } = JSON.parse(frameData.json);
                const frameIndexColorMatrix = [];
                let indexRow = -1;
                for (const row of matrix) {
                  indexRow++;
                  frameIndexColorMatrix[indexRow] = [];
                  let indexCol = -1;
                  for (const value of row) {
                    indexCol++;
                    let colorIndex = objectLayer.data.render.color.findIndex(
                      (color) =>
                        color[0] === value[0] &&
                        color[1] === value[1] &&
                        color[2] === value[2] &&
                        color[3] === value[3],
                    );
                    if (colorIndex === -1) {
                      objectLayer.data.render.color.push(value);
                      colorIndex = objectLayer.data.render.color.length - 1;
                    }
                    frameIndexColorMatrix[indexRow][indexCol] = colorIndex;
                  }
                }
                objectLayer.data.render.frames[direction].push(frameIndexColorMatrix);
              }
            }
          }
          objectLayer.data.render.frame_duration = parseInt(s(`.ol-input-render-frame-duration`).value);
          objectLayer.data.render.is_stateless = renderIsStateless;
          objectLayer.data.stats = {
            effect: parseInt(s(`.ol-input-item-stats-effect`).value),
            resistance: parseInt(s(`.ol-input-item-stats-resistance`).value),
            agility: parseInt(s(`.ol-input-item-stats-agility`).value),
            range: parseInt(s(`.ol-input-item-stats-range`).value),
            intelligence: parseInt(s(`.ol-input-item-stats-intelligence`).value),
            utility: parseInt(s(`.ol-input-item-stats-utility`).value),
          };
          objectLayer.data.item = {
            type: selectItemType,
            activable: itemActivable,
            id: s(`.ol-input-item-id`).value,
            description: s(`.ol-input-item-description`).value,
          };
          console.warn('objectLayer', objectLayer);

          // Upload images
          {
            for (const directionCode of Object.keys(ObjectLayerEngineModal.ObjectLayerData)) {
              let frameIndex = -1;
              for (const frame of ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
                frameIndex++;
                const pngBlob = frame.image;

                const form = new FormData();
                form.append(directionCode, pngBlob, `${frameIndex}.png`);

                const { status, data } = await ObjectLayerService.post({
                  id: `frame-image/${objectLayer.data.item.type}/${objectLayer.data.item.id}/${directionCode}`,
                  body: form,
                  headerId: 'file',
                });
              }
            }
          }

          // Upload metadata
          {
            delete objectLayer.data.render.frames;
            delete objectLayer.data.render.color;
            const { status, data } = await ObjectLayerService.post({
              id: `metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
              body: objectLayer,
            });
          }
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
        .ol-number-label {
          width: 120px;
          font-size: 16px;
          overflow: hidden;
          font-family: 'retro-font';
        }
        .sub-title-modal {
          color: #ffcc00;
        }
      </style>
      ${borderChar(2, 'black', ['.sub-title-modal'])}

      <div class="in section-mp section-mp-border">
        <div class="in sub-title-modal"><i class="fa-solid fa-table-cells-large"></i> Frame editor</div>

        <object-layer-engine id="ole" width="${cells}" height="${cells}" pixel-size="${pixelSize}">
        </object-layer-engine>
      </div>

      <div class="in section-mp section-mp-border">
        <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Render data</div>
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
            <div class="in section-mp-border" style="width: 135px;">
              ${await Input.Render({
                id: `ol-input-render-frame-duration`,
                label: html`<div class="inl ol-number-label">
                  <i class="fa-solid fa-chart-simple"></i> Frame duration
                </div>`,
                containerClass: 'inl',
                type: 'number',
                min: 100,
                max: 1000,
                placeholder: true,
                value: renderFrameDuration,
              })}
            </div>
            <div class="in section-mp">
              ${await ToggleSwitch.Render({
                id: 'ol-toggle-render-is-stateless',
                wrapper: true,
                wrapperLabel: html`${Translate.Render('is-stateless')}`,
                disabledOnClick: true,
                checked: renderIsStateless,
                on: {
                  unchecked: () => {
                    renderIsStateless = false;
                    console.warn('renderIsStateless', renderIsStateless);
                  },
                  checked: () => {
                    renderIsStateless = true;
                    console.warn('renderIsStateless', renderIsStateless);
                  },
                },
              })}
            </div>
          </div>
        </div>
        ${directionsCodeBarRender}
      </div>
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
                      selectItemType = itemType;
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
          class: `in flr ol-btn-save`,
        })}
      </div>
    `;
  },
  getDirectionsFromDirectionCode(directionCode = '08') {
    let objectLayerFrameDirections = [];

    switch (directionCode) {
      case '08':
        objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
        break;
      case '18':
        objectLayerFrameDirections = ['down_walking'];
        break;
      case '02':
        objectLayerFrameDirections = ['up_idle'];
        break;
      case '12':
        objectLayerFrameDirections = ['up_walking'];
        break;
      case '04':
        objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
        break;
      case '14':
        objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
        break;
      case '06':
        objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
        break;
      case '16':
        objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
        break;
    }

    return objectLayerFrameDirections;
  },
};

export { ObjectLayerEngineModal };
