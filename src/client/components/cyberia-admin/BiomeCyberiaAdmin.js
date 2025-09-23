import { JSONmatrix, newInstance, random, randomHexColor, range, round10 } from '../core/CommonJs.js';
import { Css, Themes, darkTheme, dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { WorldCyberiaType } from '../cyberia/CommonCyberia.js';
import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';
import { copyData, downloadFile, htmls, s } from '../core/VanillaJs.js';
import { Validator } from '../core/Validator.js';
import { Input } from '../core/Input.js';
import { Modal } from '../core/Modal.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { BiomeCyberiaManagement, BiomeCyberiaScope } from '../cyberia/BiomeCyberia.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { EventsUI } from '../core/EventsUI.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { SeedCityCyberiaBiome } from '../cyberia-biome/SeedCityCyberiaBiome.js';
import { CityCyberiaBiome } from '../cyberia-biome/CityCyberiaBiome.js';
import { ForestCyberiaBiome } from '../cyberia-biome/ForestCyberiaBiome.js';
import { SpaceCyberiaBiome } from '../cyberia-biome/SpaceCyberiaBiome.js';
import { ColorChaosCyberiaBiome } from '../cyberia-biome/ColorChaosCyberiaBiome.js';
import { CityInteriorCyberiaBiome } from '../cyberia-biome/CityInteriorCyberiaBiome.js';
import { ShopCyberiaBiome } from '../cyberia-biome/ShopCyberiaBiome.js';
import { GridBaseCyberiaBiome } from '../cyberia-biome/GridBaseCyberiaBiome.js';
import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { loggerFactory } from '../core/Logger.js';
import { FileService } from '../../services/file/file.service.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

const BiomeCyberiaParamsScope = {
  dim: 16,
  dimPaintByCell: 3,
  dimAmplitude: 1, // 8,
};

const cut = {
  enable: false,
  x1: 4,
  y1: 2,
  x2: 5,
  y2: 3,
};

const transportDataScope = {};

const getCurrentTransportData = (id, transportsTargets) => {
  if (!transportDataScope[id]) transportDataScope[id] = { currentIndexPathTransport: 0, currentIndexPathFace: 0 };

  const target = transportsTargets[transportDataScope[id].currentIndexPathTransport];
  const faces = WorldCyberiaType[target.type].worldFaces;
  const face = faces[transportDataScope[id].currentIndexPathFace];
  transportDataScope[id].currentIndexPathFace++;
  if (transportDataScope[id].currentIndexPathFace >= faces.length) {
    transportDataScope[id].currentIndexPathFace = 0;
    transportDataScope[id].currentIndexPathTransport++;
    if (transportDataScope[id].currentIndexPathTransport >= transportsTargets.length)
      transportDataScope[id].currentIndexPathTransport = 0;
  }
  const transportTarget = newInstance({
    ...target,
    face,
  });
  console.warn({ transportTarget });
  return transportTarget;
};

const BiomeCyberia = {
  [GridBaseCyberiaBiome.id]: GridBaseCyberiaBiome.render,
  [ShopCyberiaBiome.id]: ShopCyberiaBiome.render,
  [CityInteriorCyberiaBiome.id]: CityInteriorCyberiaBiome.render,
  [SeedCityCyberiaBiome.id]: SeedCityCyberiaBiome.render,
  [CityCyberiaBiome.id]: CityCyberiaBiome.render,
  [ForestCyberiaBiome.id]: ForestCyberiaBiome.render,
  [SpaceCyberiaBiome.id]: SpaceCyberiaBiome.render,
  [ColorChaosCyberiaBiome.id]: ColorChaosCyberiaBiome.render,
};

const BiomeCyberiaEngine = {
  CurrentKey: Object.keys(BiomeCyberia)[0],
  PixiCyberiaBiomeCyberiaDim: 0,
  PixiCyberiaBiomeCyberia: Application,
  PixiCyberiaBiomeCyberiaTopLevelColor: Application,
  Render: async function (options) {
    const resultBiomeCyberia = await CyberiaBiomeService.get({ id: 'all-name' });
    NotificationManager.Push({
      html: resultBiomeCyberia.status,
      status: resultBiomeCyberia.status,
    });
    if (resultBiomeCyberia.status === 'success') BiomeCyberiaScope.Grid = resultBiomeCyberia.data;

    let configBiomeCyberiaFormRender = html`
      <div class="in section-mp">
        ${await DropDown.Render({
          value: BiomeCyberiaEngine.CurrentKey,
          label: html`${Translate.Render('select-biome')}`,
          data: Object.keys(BiomeCyberia).map((biomeKey) => {
            return {
              value: biomeKey,
              display: html`<i class="fa-solid fa-mountain-city"></i> ${Translate.Render(biomeKey)}`,
              onClick: async () => {
                logger.info('DropDown BiomeCyberia onClick', biomeKey);
                BiomeCyberiaEngine.CurrentKey = biomeKey;
                htmls('.biome-custom-options', html``);
                for (const biome of Object.keys(BiomeCyberia)) {
                  s(`.row-${biome}`).style.display = biomeKey === biome ? 'block' : 'none';
                  if (biomeKey === biome && BiomeCyberiaEngine.CustomBiomeOptions[biome])
                    htmls('.biome-custom-options', html`${await BiomeCyberiaEngine.CustomBiomeOptions[biome]()}`);
                }
              },
            };
          }),
        })}
      </div>
      <div class="biome-custom-options"></div>
    `;
    // let render = '';
    for (const biome of Object.keys(BiomeCyberia)) {
      configBiomeCyberiaFormRender += html`
        <div class="in row-${biome}" style="display: none">
          ${await Input.Render({
            id: `input-name-${biome}`,
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-generate-biome-${biome}`,
              label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-download-biome-${biome}-png`,
              label: html`<i class="fa-solid fa-download"></i> ${Translate.Render(`download`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-upload-biome-${biome}`,
              label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-image-biome-${biome}`,
              label: html`<i class="fa-regular fa-image"></i> ${Translate.Render(`biome-image`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-solid-biome-${biome}`,
              label: html`<i class="fa-solid fa-table-cells"></i> ${Translate.Render(`biome-solid`)}`,
            })}
          </div>
        </div>
      `;
    }

    BiomeCyberiaEngine.transportsJsonEditorContent = {
      json: [
        {
          path: 'world-name',
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          face: 1,
          dim: 1,
        },
      ],
    };

    BiomeCyberiaEngine.resourcesJsonEditorContent = {
      json: [
        {
          id: '',
          x: 0,
          y: 0,
        },
      ],
    };

    setTimeout(async () => {
      this.PixiCyberiaBiomeCyberiaDim = 1600;
      this.PixiCyberiaBiomeCyberia = new Application({
        width: this.PixiCyberiaBiomeCyberiaDim,
        height: this.PixiCyberiaBiomeCyberiaDim,
        background: 'gray',
      });

      this.PixiCyberiaBiomeCyberia.view.classList.add('in');
      this.PixiCyberiaBiomeCyberia.view.classList.add('pixi-canvas-biome');

      s('.biome-pixi-container').appendChild(this.PixiCyberiaBiomeCyberia.view);

      this.PixiCyberiaBiomeCyberiaTopLevelColor = new Application({
        width: this.PixiCyberiaBiomeCyberiaDim,
        height: this.PixiCyberiaBiomeCyberiaDim,
        backgroundAlpha: 0,
      });

      this.PixiCyberiaBiomeCyberiaTopLevelColor.view.classList.add('in');
      this.PixiCyberiaBiomeCyberiaTopLevelColor.view.classList.add('pixi-canvas-biome');

      s('.biome-top-level-pixi-container').appendChild(this.PixiCyberiaBiomeCyberiaTopLevelColor.view);
    });
    setTimeout(() =>
      Object.keys(BiomeCyberia).map(async (biome) => {
        const validators = await Validator.instance([{ id: `input-name-${biome}`, rules: [{ type: 'isEmpty' }] }]);

        EventsUI.onClick(`.btn-generate-biome-${biome}`, async () => {
          await this.generateBiomeCyberia(biome);
        });
        EventsUI.onClick(`.btn-download-biome-${biome}-png`, async () =>
          downloadFile(BiomeCyberiaScope.Keys[biome].imageFile, `${biome}.png`),
        );
        EventsUI.onClick(`.btn-upload-biome-${biome}`, async () => {
          const { errorMessage } = await validators();
          if (errorMessage) return;

          if (!BiomeCyberiaScope.Keys[biome])
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });

          let { solid, color, topLevelColor, resources, transports } = BiomeCyberiaScope.Keys[biome];
          if (!solid)
            return NotificationManager.Push({
              html: Translate.Render('invalid-data'),
              status: 'error',
            });
          // https://www.iana.org/assignments/media-types/media-types.xhtml
          let fileId;
          let topLevelColorFileId;
          await (async () => {
            const body = new FormData();
            body.append('file', BiomeCyberiaScope.Keys[biome].imageFile);
            const { status, data } = await FileService.post({ body });
            // await timer(3000);
            NotificationManager.Push({
              html: Translate.Render(`${status}-upload-file`),
              status,
            });
            if (status === 'success') fileId = data[0]._id;
          })();
          await (async () => {
            const body = new FormData();
            body.append('file', BiomeCyberiaScope.Keys[biome].imageTopLevelColorFile);
            const { status, data } = await FileService.post({ body });
            // await timer(3000);
            NotificationManager.Push({
              html: Translate.Render(`${status}-upload-file`),
              status,
            });
            if (status === 'success') topLevelColorFileId = data[0]._id;
          })();
          if (fileId && topLevelColorFileId)
            await (async () => {
              if (color) color = Object.values(color).map((row) => Object.values(row));
              if (topLevelColor) topLevelColor = Object.values(topLevelColor).map((row) => Object.values(row));
              solid = Object.values(solid).map((row) => Object.values(row));
              const { status, data } = await CyberiaBiomeService.post({
                body: {
                  fileId,
                  topLevelColorFileId,
                  solid,
                  color,
                  topLevelColor,
                  name: s(`.input-name-${biome}`).value,
                  biome,
                  dim: s(`.biome-dim`).value,
                  dimPaintByCell: s(`.biome-dimPaintByCell`).value,
                  dimAmplitude: s(`.biome-dimAmplitude`).value,
                  resources:
                    BiomeCyberiaEngine.resourcesJsonEditorContent.json &&
                    BiomeCyberiaEngine.resourcesJsonEditorContent.json.length > 0
                      ? BiomeCyberiaEngine.resourcesJsonEditorContent.json
                      : resources,
                  transports:
                    BiomeCyberiaEngine.transportsJsonEditorContent.json &&
                    BiomeCyberiaEngine.transportsJsonEditorContent.json.length > 0
                      ? BiomeCyberiaEngine.transportsJsonEditorContent.json
                      : transports,
                },
              });
              NotificationManager.Push({
                html: Translate.Render(`${status}-upload-biome`),
                status,
              });
              BiomeCyberiaScope.Grid.push(data);
              AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeCyberiaScope.Grid);
              // AgGrid.grids[`ag-grid-biome-files`].refreshCells({
              //   force: true,
              //   suppressFlash: false,
              // });
            })();
        });

        EventsUI.onClick(`.btn-image-biome-${biome}`, async () => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            id: `modal-image-biome-${biome}`,
            barConfig,
            title: ` ${Translate.Render(`biome-image`)} - ${biome}`,
            html: html`<div class="in section-mp">
              <img class="in" style="width: 100%" src="${BiomeCyberiaScope.Keys[biome].imageSrc}" />
              <img
                class="abs"
                style="top: 0%; left: 0%; width: 100%; height: 100%"
                src="${BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc}"
              />
            </div>`,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        });
        EventsUI.onClick(`.btn-solid-biome-${biome}`, async () => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            id: `modal-solid-biome-${biome}`,
            barConfig,
            title: ` ${Translate.Render(`biome-solid`)} - ${biome}`,
            html: html`<pre style="font-size: 10px">
            ${JSONmatrix(BiomeCyberiaScope.Keys[biome].solid)
                .replaceAll('1', html`<span style="color: yellow">1</span>`)
                .replaceAll('2', html`<span style="color: red">1</span>`)
                .replaceAll('3', html`<span style="color: purple">1</span>`)
                .replaceAll('4', html`<span style="color: blue">1</span>`)}</pre
            >`,
            mode: 'view',
            slideMenu: 'modal-menu',
          });
        });
      }),
    );

    setTimeout(() => {
      const updateDim = () => (BiomeCyberiaParamsScope.dim = parseInt(s(`.biome-dim`).value));
      const updateDimPaintByCell = () =>
        (BiomeCyberiaParamsScope.dimPaintByCell = parseInt(s(`.biome-dimPaintByCell`).value));
      s(`.biome-dim`).oninput = updateDim;
      s(`.biome-dim`).onblur = updateDim;
      s(`.biome-dimPaintByCell`).oninput = updateDimPaintByCell;
      s(`.biome-dimPaintByCell`).onblur = updateDimPaintByCell;
      updateDim();
      BiomeCyberiaEngine.instanceJsonTransportEditor = () => {
        if (BiomeCyberiaEngine.jsonEditorTransports) BiomeCyberiaEngine.jsonEditorTransports.destroy();
        BiomeCyberiaEngine.jsonEditorTransports = createJSONEditor({
          target: s('.jsoneditor-biome-transports'),
          props: {
            content: BiomeCyberiaEngine.transportsJsonEditorContent,
            onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
              // content is an object { json: JSONData } | { text: string }
              console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
              BiomeCyberiaEngine.transportsJsonEditorContent.json = JSON.parse(updatedContent.text);
            },
          },
        });
      };
      BiomeCyberiaEngine.instanceJsonTransportEditor();
      BiomeCyberiaEngine.instanceJsonResourcesEditor = () => {
        if (BiomeCyberiaEngine.jsonEditorResources) BiomeCyberiaEngine.jsonEditorResources.destroy();
        BiomeCyberiaEngine.jsonEditorResources = createJSONEditor({
          target: s('.jsoneditor-biome-resources'),
          props: {
            content: BiomeCyberiaEngine.resourcesJsonEditorContent,
            onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
              // content is an object { json: JSONData } | { text: string }
              console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
              BiomeCyberiaEngine.resourcesJsonEditorContent.json = JSON.parse(updatedContent.text);
            },
          },
        });
      };
      BiomeCyberiaEngine.instanceJsonResourcesEditor();

      {
        const containers = [
          '.biome-grid-render-main-container',
          '.biome-transports-container',
          '.biome-resources-container',
          '.ag-grid-biome-container',
          '.biome-grid-render-main-options',
        ];

        const cleanContainers = (open) => {
          for (const containerId of containers) {
            s(containerId).classList[open ? 'remove' : 'add']('hide');
          }
        };

        EventsUI.onClick(`.btn-biome-resources`, async () => {
          cleanContainers();
          s(`.btn-biome-open-editor`).classList.remove('hide');
          s('.biome-resources-container').classList.remove('hide');
        });
        EventsUI.onClick(`.btn-biome-transports`, async () => {
          cleanContainers();
          s(`.btn-biome-open-editor`).classList.remove('hide');
          s('.biome-transports-container').classList.remove('hide');
        });
        EventsUI.onClick(`.btn-biome-open-editor`, async () => {
          s(`.btn-biome-open-editor`).classList.add('hide');
          cleanContainers(true);
          s('.biome-resources-container').classList.add('hide');
          s('.biome-transports-container').classList.add('hide');
        });
      }
    });

    const jsonIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M9 16v-1m3 1v-1m3 1v-1M6.835 4q-.747.022-1.297.242a1.86 1.86 0 0 0-.857.66q-.285.438-.285 1.164V9.23q0 1.12-.594 1.802q-.593.66-1.802.88v.131q1.23.22 1.802.901q.594.66.594 1.78v3.231q0 .704.285 1.143q.286.461.835.66q.55.219 1.32.241M17.164 4q.747.022 1.297.242q.55.219.857.66q.285.438.285 1.164V9.23q0 1.12.594 1.802q.593.66 1.802.88v.131q-1.23.22-1.802.901q-.594.66-.594 1.78v3.231q0 .704-.285 1.143q-.286.461-.835.66q-.55.219-1.32.241"
      />
    </svg>`;

    return html`
      <style>
        .biome-solid-matrix-preview {
          font-size: 8px;
        }
        .biome-grid-container {
          top: 0px;
          left: 0px;
          width: 100%;
        }
        .cyberia-instance-cords {
          color: gray;
          font-size: 10px;
        }
        .biome-cell {
          /* border: 1px solid gray; */
          box-sizing: border-box;
          cursor: pointer;
        }
        .biome-cell:hover {
          border: 1px solid yellow;
        }
      </style>
      <div class="style-cyberia-instance-cords">
        <style>
          .cyberia-instance-cords {
            display: none;
          }
        </style>
      </div>
      ${dynamicCol({ containerSelector: options.idModal, id: 'biome' })}
      <div class="fl">
        <div class="in fll biome-col-a">
          <div class="in biome-grid-render-main-options">
            <div class="in section-mp">
              <div class="in sub-title-modal">
                <i class="fa-solid fa-sliders"></i> ${Translate.Render('config-biome')}
              </div>
            </div>
            ${configBiomeCyberiaFormRender}

            <div class="in section-mp toggle-form-container hover">
              <div class="fl ">
                <div class="in fll" style="width: 70%">
                  <div class="in"><i class="fa-solid fa-expand"></i> ${Translate.Render('coordinates')}</div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.Render({
                    id: 'toggle-cyberia-instance-coordinates',
                    checked: false,
                    on: {
                      unchecked: () => {
                        htmls(
                          `.style-cyberia-instance-cords`,
                          html` <style>
                            .cyberia-instance-cords {
                              display: none;
                            }
                          </style>`,
                        );
                        htmls(`.biome-grid-container`, '');
                      },
                      checked: () => {
                        htmls(
                          `.biome-grid-container`,
                          html`
                            ${range(0, BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1)
                              .map(
                                (y) =>
                                  html`
                                    <div class="fl">
                                      ${range(
                                        0,
                                        BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell - 1,
                                      )
                                        .map((x) => {
                                          setTimeout(() => {
                                            if (!s(`.biome-cell-${x}-${y}`)) return;

                                            s(`.biome-cell-${x}-${y}`).onclick = async () => {
                                              await copyData([x, y]);
                                              NotificationManager.Push({
                                                html: Translate.Render('success-copy-data'),
                                                status: 'success',
                                              });
                                            };
                                          });
                                          return html`<div class="in fll biome-cell biome-cell-${x}-${y}">
                                            <!-- <div class="abs center cyberia-instance-cords">${x}<br />${y}</div> -->
                                          </div>`;
                                        })
                                        .join('')}
                                    </div>
                                  `,
                              )
                              .join('')}
                          `,
                        );
                        htmls(
                          `.style-cyberia-instance-cords`,
                          html`<style>
                            .biome-cell {
                              width: ${s(`.pixi-canvas-biome`).offsetWidth /
                              (BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell)}px;
                              height: ${s(`.pixi-canvas-biome`).offsetWidth /
                              (BiomeCyberiaParamsScope.dim * BiomeCyberiaParamsScope.dimPaintByCell)}px;
                            }
                          </style>`,
                        );
                      },
                    },
                  })}
                </div>
              </div>
            </div>

            ${await Input.Render({
              id: `biome-dim`,
              label: html`<i class="fa-solid fa-ruler"></i> dim`,
              containerClass: 'in section-mp width-mini-box input-container',
              type: 'number',
              min: 0,
              placeholder: true,
              value: 16,
            })}
            ${await Input.Render({
              id: `biome-dimPaintByCell`,
              label: html`<i class="fa-solid fa-ruler"></i> dimPaintByCell`,
              containerClass: 'in section-mp width-mini-box input-container',
              type: 'number',
              min: 0,
              placeholder: true,
              value: 3,
            })}
            ${await Input.Render({
              id: `biome-dimAmplitude`,
              label: html`<i class="fa-solid fa-ruler"></i> dimAmplitude`,
              containerClass: 'in section-mp width-mini-box input-container',
              type: 'number',
              min: 0,
              placeholder: true,
              value: 3,
            })}
          </div>
          ${await BtnIcon.Render({
            class: `in section-mp btn-custom btn-biome-open-editor hide`,
            label: html`<i class="fa-solid fa-vector-square"></i> Biome Render Editor`,
          })}
          ${await BtnIcon.Render({
            class: `in section-mp btn-custom btn-biome-resources`,
            label: html`${jsonIcon} Resources Config`,
          })}
          ${await BtnIcon.Render({
            class: `in section-mp btn-custom btn-biome-transports`,
            label: html`${jsonIcon} Transports Config`,
          })}
        </div>
        <div class="in fll biome-col-b">
          <div class="in biome-grid-render-main-container">
            <div class="in section-mp">
              <div class="in sub-title-modal"><i class="fa-solid fa-vector-square"></i> Render</div>
            </div>
            <div class="in section-mp">
              <div class="in biome-pixi-container"></div>
              <div class="abs biome-grid-container"></div>
            </div>
            <div class="in section-mp">
              <div class="in biome-top-level-pixi-container"></div>
            </div>
          </div>
          <div class="in biome-transports-container hide">
            <div class="in section-mp"><div class="in sub-title-modal">${jsonIcon} Transports Config</div></div>
            <div class="in section-mp"><div class="jsoneditor-biome-transports"></div></div>
          </div>
          <div class="in biome-resources-container hide">
            <div class="in section-mp"><div class="in sub-title-modal">${jsonIcon} Resources Config</div></div>
            <div class="in section-mp"><div class="jsoneditor-biome-resources"></div></div>
          </div>
          <div class="in ag-grid-biome-container">
            <div class="in section-mp">
              <div class="in sub-title-modal"><i class="far fa-list-alt"></i> ${Translate.Render('biomes')}</div>
            </div>
            <div class="in section-mp">
              ${await AgGrid.Render({
                id: `ag-grid-biome-files`,
                darkTheme,
                gridOptions: {
                  rowData: BiomeCyberiaScope.Grid,
                  columnDefs: [
                    { field: '_id', headerName: 'ID' },
                    { field: 'biome', headerName: 'BiomeCyberia' },
                    { field: 'name', headerName: 'Name' },
                    { headerName: '', cellRenderer: LoadBiomeCyberiaRenderer },
                  ],
                },
              })}
            </div>
          </div>
        </div>
      </div>
      <!--
      <div class="in biome-img-matrix-preview"></div>
      <pre class="in biome-solid-matrix-preview"></pre>
      -->
    `;
  },
  CustomBiomeOptions: {
    'seed-city': async () => {
      const id = 'seed-city-cut-toggle';
      setTimeout(() => {
        s(`.toggle-form-container-${id}`).onclick = () => ToggleSwitch.Tokens[id].click();

        const inputX1 = () => {
          cut.x1 = s(`.${id}-cut-dim-x1`).value;
        };
        const inputY1 = () => {
          cut.y1 = s(`.${id}-cut-dim-y1`).value;
        };
        const inputX2 = () => {
          cut.x2 = s(`.${id}-cut-dim-x2`).value;
        };
        const inputY2 = () => {
          cut.y2 = s(`.${id}-cut-dim-y2`).value;
        };

        s(`.${id}-cut-dim-x1`).onblur = inputX1;
        s(`.${id}-cut-dim-x1`).oninput = inputX1;

        s(`.${id}-cut-dim-y1`).onblur = inputY1;
        s(`.${id}-cut-dim-y1`).oninput = inputY1;

        s(`.${id}-cut-dim-x2`).onblur = inputX2;
        s(`.${id}-cut-dim-x2`).oninput = inputX2;

        s(`.${id}-cut-dim-y2`).onblur = inputY2;
        s(`.${id}-cut-dim-y2`).oninput = inputY2;
      });
      return html`<div class="in section-mp toggle-form-container toggle-form-container-${id} hover">
          <div class="fl ">
            <div class="in fll" style="width: 70%">
              <div class="in"><i class="fas fa-cut"></i> ${Translate.Render('cut')}</div>
            </div>
            <div class="in fll" style="width: 30%">
              ${await ToggleSwitch.Render({
                id,
                containerClass: 'inl',
                disabledOnClick: true,
                checked: cut.enable,
                on: {
                  unchecked: () => {
                    cut.enable = false;
                    s(`.${id}-cut-dim-container`).classList.add('hide');
                  },
                  checked: () => {
                    cut.enable = true;
                    s(`.${id}-cut-dim-container`).classList.remove('hide');
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="${id}-cut-dim-container ${cut.enable ? '' : 'hide'}">
          ${await Input.Render({
            id: `${id}-cut-dim-x1`,
            label: html`<i class="fa-solid fa-ruler"></i> x1`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.x1,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-y1`,
            label: html`<i class="fa-solid fa-ruler"></i> y1`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.y1,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-x2`,
            label: html`<i class="fa-solid fa-ruler"></i> x2`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.x2,
          })}
          ${await Input.Render({
            id: `${id}-cut-dim-y2`,
            label: html`<i class="fa-solid fa-ruler"></i> y2`,
            containerClass: 'in section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: cut.y2,
          })}
        </div>`;
    },
  },

  generateBiomeCyberia: async function (biome) {
    const BiomeCyberiaMatrixCyberia = await BiomeCyberia[biome]();
    BiomeCyberiaScope.Keys[biome] = { biome, ...BiomeCyberiaParamsScope, ...BiomeCyberiaMatrixCyberia };
    BiomeCyberiaEngine.CurrentKey = biome;
    await this.renderPixiCyberiaBiomeCyberia(BiomeCyberiaScope.Keys[biome]);
    setTimeout(
      async () => {
        {
          const biomeImg = await this.PixiCyberiaBiomeCyberia.renderer.extract.image(
            this.PixiCyberiaBiomeCyberia.stage,
          );
          BiomeCyberiaScope.Keys[biome].imageSrc = biomeImg.currentSrc;
          const res = await fetch(BiomeCyberiaScope.Keys[biome].imageSrc);
          const blob = await res.blob();
          BiomeCyberiaScope.Keys[biome].imageFile = new File([blob], `${biome}.png`, { type: 'image/png' });
        }
        {
          const biomeImgTopLevelColor = await this.PixiCyberiaBiomeCyberiaTopLevelColor.renderer.extract.image(
            this.PixiCyberiaBiomeCyberiaTopLevelColor.stage,
          );
          BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc = biomeImgTopLevelColor.currentSrc;
          const res = await fetch(BiomeCyberiaScope.Keys[biome].imageTopLevelColorSrc);
          const blob = await res.blob();
          BiomeCyberiaScope.Keys[biome].imageTopLevelColorFile = new File([blob], `${biome}.png`, {
            type: 'image/png',
          });
        }
      },
      BiomeCyberiaMatrixCyberia.timeOut ? BiomeCyberiaMatrixCyberia.timeOut : 0,
    );
  },
  renderPixiCyberiaBiomeCyberia: async function (BiomeCyberiaMatrixCyberia) {
    this.PixiCyberiaBiomeCyberia.stage.removeChildren();
    this.PixiCyberiaBiomeCyberiaTopLevelColor.stage.removeChildren();
    const rangeBiomeCyberia = range(0, BiomeCyberiaMatrixCyberia.dim * BiomeCyberiaMatrixCyberia.dimPaintByCell - 1);
    const dim = this.PixiCyberiaBiomeCyberiaDim / rangeBiomeCyberia.length;

    // if (BiomeCyberiaMatrixCyberia.biome === 'seed-city' && !BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
    //   const biomeData = await BiomeCyberia['seed-city']();
    //   BiomeCyberiaMatrixCyberia.setBiomeCyberia = biomeData.setBiomeCyberia;
    // }

    for (const y of rangeBiomeCyberia)
      for (const x of rangeBiomeCyberia) {
        if (
          (x === 0 && y === 0) ||
          (x === rangeBiomeCyberia[rangeBiomeCyberia.length - 1] &&
            y === rangeBiomeCyberia[rangeBiomeCyberia.length - 1]) ||
          (!['shop'].includes(BiomeCyberiaMatrixCyberia.biome) &&
            BiomeCyberiaMatrixCyberia.topLevelColor &&
            BiomeCyberiaMatrixCyberia.topLevelColor[y] &&
            BiomeCyberiaMatrixCyberia.topLevelColor[y][x])
        ) {
          const cell = new Sprite(Texture.WHITE);
          cell.x = dim * x;
          cell.y = dim * y;
          cell.width = dim;
          cell.height = dim;
          cell.tint =
            BiomeCyberiaMatrixCyberia.topLevelColor && BiomeCyberiaMatrixCyberia.topLevelColor[y]?.[x]
              ? BiomeCyberiaMatrixCyberia.topLevelColor[y][x]
              : `#151515`;
          this.PixiCyberiaBiomeCyberiaTopLevelColor.stage.addChild(cell);
        }
      }

    if (BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
      for (const cellData of BiomeCyberiaMatrixCyberia.setBiomeCyberia) {
        const { src, dim, x, y } = cellData;
        // case from png static url
        const cell = Sprite.from(src);
        cell.x = dim * x;
        cell.y = dim * y;
        cell.width = dim;
        cell.height = dim;
        this.PixiCyberiaBiomeCyberia.stage.addChild(cell);
      }
      return;
    }

    for (const y of rangeBiomeCyberia)
      for (const x of rangeBiomeCyberia) {
        if (BiomeCyberiaMatrixCyberia.color[y] && BiomeCyberiaMatrixCyberia.color[y][x]) {
          const cell = new Sprite(Texture.WHITE);
          cell.x = dim * x;
          cell.y = dim * y;
          cell.width = dim;
          cell.height = dim;
          cell.tint = BiomeCyberiaMatrixCyberia.color[y][x];
          this.PixiCyberiaBiomeCyberia.stage.addChild(cell);
        }
      }
    for (const typeLayer of ['layer', 'topLayer'])
      for (const layer of range(0, 5))
        for (const y of rangeBiomeCyberia)
          for (const x of rangeBiomeCyberia) {
            if (
              BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`] &&
              BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y] &&
              BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x]
            ) {
              const cell = Sprite.from(
                `${getProxyPath()}${BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].src}`,
              );
              cell.x = dim * x;
              cell.y = dim * y;
              cell.width =
                dim *
                (BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].width
                  ? BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].width
                  : BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].dim);
              cell.height =
                dim *
                (BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].height
                  ? BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].height
                  : BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].dim);

              if (BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].params) {
                if (BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].params.rotation) {
                  cell.rotation = BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].params.rotation;

                  switch (BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].params.rotation) {
                    case Math.PI / 2:
                      {
                        cell.x = cell.x + dim * BiomeCyberiaMatrixCyberia[`${typeLayer}${layer}`][y][x].dim;
                      }
                      break;

                    default:
                      break;
                  }
                }
              }
              switch (typeLayer) {
                case 'layer':
                  this.PixiCyberiaBiomeCyberia.stage.addChild(cell);
                  break;
                case 'topLayer':
                  this.PixiCyberiaBiomeCyberiaTopLevelColor.stage.addChild(cell);
                  break;
                default:
                  break;
              }
            }
          }
  },
  resourcesJsonEditorContent: {},
  instanceJsonTransportEditor: () => null,
  transportsJsonEditorContent: {},
  instanceJsonResourcesEditor: () => null,
};

const getBiomeId = (params) => `biome-${params.data._id}`;

class LoadBiomeCyberiaRenderer {
  eGui;

  async init(params) {
    console.log('LoadBiomeCyberiaRenderer created', params);
    const rowId = getBiomeId(params);

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-load-biome-${rowId}`,
        label: html`<i class="fa-solid fa-bolt"></i><br />
          ${Translate.Render(`load`)}`,
      })}
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-delete-biome-${rowId}`,
        label: html`<i class="fa-solid fa-circle-xmark"></i> <br />
          ${Translate.Render(`delete`)}`,
      })}
    `;

    setTimeout(() => {
      if (s(`.btn-load-biome-${rowId}`))
        EventsUI.onClick(`.btn-load-biome-${rowId}`, async () => {
          if (!BiomeCyberiaScope.Data[rowId]) await BiomeCyberiaManagement.loadData(params);
          BiomeCyberiaScope.Keys[params.data.biome] = BiomeCyberiaScope.Data[rowId];
          BiomeCyberiaEngine.CurrentKey = params.data.biome;

          await BiomeCyberiaEngine.renderPixiCyberiaBiomeCyberia(BiomeCyberiaScope.Data[rowId]);
          BiomeCyberiaParamsScope.dim = BiomeCyberiaScope.Data[rowId].dim;
          BiomeCyberiaParamsScope.dimPaintByCell = BiomeCyberiaScope.Data[rowId].dimPaintByCell;
          BiomeCyberiaParamsScope.dimAmplitude = BiomeCyberiaScope.Data[rowId].dimAmplitude;
          s(`.input-name-${params.data.biome}`).value = BiomeCyberiaScope.Data[rowId].name;
          s(`.biome-dim`).value = BiomeCyberiaScope.Data[rowId].dim;
          s(`.biome-dimPaintByCell`).value = BiomeCyberiaScope.Data[rowId].dimPaintByCell;
          s(`.biome-dimAmplitude`).value = BiomeCyberiaScope.Data[rowId].dimAmplitude;
          s(`.input-name-${params.data.biome}`).value = BiomeCyberiaScope.Data[rowId].name;
          s(`.dropdown-option-${params.data.biome}`).click();
          BiomeCyberiaEngine.transportsJsonEditorContent = {
            json: BiomeCyberiaScope.Keys[params.data.biome].transports,
          };
          BiomeCyberiaEngine.instanceJsonTransportEditor();
          BiomeCyberiaEngine.resourcesJsonEditorContent = {
            json: BiomeCyberiaScope.Keys[params.data.biome].resources,
          };
          BiomeCyberiaEngine.instanceJsonResourcesEditor();
        });
      if (s(`.btn-delete-biome-${rowId}`))
        EventsUI.onClick(`.btn-delete-biome-${rowId}`, async () => {
          const biomeDeleteResult = await CyberiaBiomeService.delete({ id: params.data._id });
          NotificationManager.Push({
            html: biomeDeleteResult.status === 'success' ? '33%' : biomeDeleteResult.message,
            status: biomeDeleteResult.status,
          });

          const fileDeleteResult = await FileService.delete({ id: params.data.fileId });
          NotificationManager.Push({
            html: fileDeleteResult.status === 'success' ? '66%' : fileDeleteResult.message,
            status: fileDeleteResult.status,
          });

          const topLevelColorFileDeleteResult = await FileService.delete({ id: params.data.topLevelColorFileId });
          NotificationManager.Push({
            html: topLevelColorFileDeleteResult.status === 'success' ? '100%' : topLevelColorFileDeleteResult.message,
            status: topLevelColorFileDeleteResult.status,
          });

          setTimeout(() => {
            BiomeCyberiaScope.Grid = BiomeCyberiaScope.Grid.filter((biome) => biome._id !== params.data._id);
            AgGrid.grids[`ag-grid-biome-files`].setGridOption('rowData', BiomeCyberiaScope.Grid);
          });
        });
    });
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadBiomeCyberiaRenderer refreshed', params);
    return true;
  }
}

export {
  BiomeCyberiaParamsScope,
  cut,
  transportDataScope,
  BiomeCyberia,
  BiomeCyberiaEngine,
  LoadBiomeCyberiaRenderer,
  getBiomeId,
  getCurrentTransportData,
};
