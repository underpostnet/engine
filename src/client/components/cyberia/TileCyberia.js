import { CoreService } from '../../services/core/core.service.js';
import { CyberiaTileService } from '../../services/cyberia-tile/cyberia-tile.service.js';
import { FileService } from '../../services/file/file.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { JSONmatrix, random, range, s4 } from '../core/CommonJs.js';
import { dynamicCol, renderCssAttr } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { copyData, htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';

const logger = loggerFactory(import.meta);

const tileModels = {
  custom: {},
  'item-skin-08': {},
  'item-skin-06': {},
};

const TileCyberia = {
  Render: async function (options) {
    let mouseDown = false;
    let dataColor = [];
    let dataSolid = [];
    let solidMode = false;
    let tileType = 'custom';
    let coordinatePreview = [];
    let pixiColorMatrix = [];

    let lockStyle = false;
    let lastStyle = {};

    const renderDataSolid = () =>
      htmls(
        `.tile-object-container`,
        JSONmatrix(dataSolid).replaceAll('1', html`<span style="color: yellow">1</span>`),
      );
    const paint = (x, y) => {
      const pixiPaint = (x, y) => {
        const rangeTileCyberia = range(
          0,
          parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1,
        );
        const dim = this.TileCyberiaAppDim / rangeTileCyberia.length;

        coordinatePreview.push([x, y]);

        const existsCell = pixiColorMatrix[y] && pixiColorMatrix[y][x];

        const cell = existsCell ? pixiColorMatrix[y][x] : new Sprite(Texture.WHITE);

        cell.tint = dataColor[y][x];
        cell.x = dim * x;
        cell.y = dim * y;
        cell.width = dim;
        cell.height = dim;

        if (!existsCell) {
          if (!pixiColorMatrix[y]) pixiColorMatrix[y] = [];
          pixiColorMatrix[y][x] = cell;
          this.TileCyberiaApp.stage.addChild(pixiColorMatrix[y][x]);
        }
      };
      for (const sumY of range(0, parseInt(s(`.tile-weight`).value) - 1))
        for (const sumX of range(0, parseInt(s(`.tile-weight`).value) - 1)) {
          if (s(`.tile-cell-${x + sumX}-${y + sumY}`)) {
            s(`.tile-cell-${x + sumX}-${y + sumY}`).style.background = s(`.tile-color`).value;
            if (!dataColor[y + sumY]) dataColor[y + sumY] = [];
            if (!dataSolid[y + sumY]) dataSolid[y + sumY] = [];
            dataColor[y + sumY][x + sumX] = s(`.tile-color`).value;
            pixiPaint(x + sumX, y + sumY);
            dataSolid[y + sumY][x + sumX] = solidMode ? Input.parseJson('.tile-solid') : 0;
          }
        }
      renderDataSolid();

      // this.TileCyberiaApp.stage.removeChildren();

      return;

      for (const y of rangeTileCyberia)
        for (const x of rangeTileCyberia) {
          if (dataColor[y] && dataColor[y][x]) {
            const cell = new Sprite(Texture.WHITE);
            cell.x = dim * x;
            cell.y = dim * y;
            cell.width = dim;
            cell.height = dim;
            cell.tint = dataColor[y][x];
            this.TileCyberiaApp.stage.addChild(cell);
          }
        }
    };
    const RenderTileCyberiaGrid = () => {
      dataColor = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((y) =>
        range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((x) => {
          if (dataColor[y] && dataColor[y][x] !== undefined) return dataColor[y][x];
          return '#363636';
        }),
      );
      dataSolid = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((y) =>
        range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((x) => {
          if (dataSolid[y] && dataSolid[y][x] !== undefined) return dataSolid[y][x];
          return 0;
        }),
      );
      setTimeout(() => {
        if (!s(`.tile-grid-container`)) return;
        s(`.tile-grid-container`).onmousedown = () => (mouseDown = true);
        s(`.tile-grid-container`).onmouseup = () => (mouseDown = false);
      });
      htmls(
        `.tile-grid-container`,
        html`
          <div class="in">
            ${range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1)
              .map(
                (y) =>
                  html`
                    <div class="fl">
                      ${range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1)
                        .map((x) => {
                          setTimeout(() => {
                            if (!s(`.tile-cell-${x}-${y}`)) return;
                            s(`.tile-cell-${x}-${y}`).onmouseover = () => {
                              if (mouseDown) paint(x, y);
                            };
                            s(`.tile-cell-${x}-${y}`).onclick = () => {
                              paint(x, y);
                            };
                          });
                          return html`<div
                            class="in fll tile-cell tile-cell-${x}-${y}"
                            ${dataColor[y] && dataColor[y][x] ? `style='background: ${dataColor[y][x]}'` : ''}
                          >
                            <div class="abs center tile-cords">${x}<br />${y}</div>
                          </div>`;
                        })
                        .join('')}
                    </div>
                  `,
              )
              .join('')}
          </div>
        `,
      );
      renderDataSolid();
    };

    const updatePaintGrid = () => {
      const originColor = s(`.tile-color`).value;
      setTimeout(() => {
        RenderTileCyberiaGrid();
        pixiColorMatrix = [];
        let y = -1;
        for (const row of dataColor) {
          y++;
          let x = -1;
          for (const value of row) {
            x++;
            // if (dataColor[y] && dataColor[y][x]) {   }
            s(`.tile-color`).value = value;
            paint(x, y);
          }
        }
        s(`.tile-color`).value = originColor;
      });
    };

    const changeTileType = async (tileKey = 'custom') => {
      tileType = tileKey;
      coordinatePreview = [];
      s(`.tile-weight`).value = 1;
      switch (tileKey) {
        case 'item-skin-06':
        case 'item-skin-08':
          {
            s(`.tile-dimPaintByCell`).value = 1;
            s(`.tile-dim`).value = 26;
            htmls(
              `.style-tile-cell`,
              html`
                <style>
                  .tile-cell {
                    width: 23px;
                    height: 23px;
                  }
                </style>
              `,
            );
            const template = JSON.parse(
              await CoreService.getRaw({
                url: `${getProxyPath()}assets/templates/${tileKey}.json`,
              }),
            );
            dataColor = template.color;
          }
          break;

        default:
          {
            dataColor = [];
            s(`.tile-dimPaintByCell`).value = 3;
            s(`.tile-dim`).value = 16;
            htmls(
              `.style-tile-cell`,
              html`
                <style>
                  .tile-cell {
                    width: 10px;
                    height: 10px;
                  }
                </style>
              `,
            );
          }
          break;
      }

      updatePaintGrid();
    };
    setTimeout(async () => {
      s(`.tile-dim`).oninput = RenderTileCyberiaGrid;
      s(`.tile-dim`).onblur = RenderTileCyberiaGrid;
      s(`.tile-dimPaintByCell`).oninput = RenderTileCyberiaGrid;
      s(`.tile-dimPaintByCell`).onblur = RenderTileCyberiaGrid;

      this.TileCyberiaAppDim = 600;
      this.TileCyberiaApp = new Application({
        width: this.TileCyberiaAppDim,
        height: this.TileCyberiaAppDim,
        background: 'gray',
      });

      s('.tile-pixi-container').appendChild(this.TileCyberiaApp.view);
      // s('canvas').classList.add('');

      const SEED = {};
      (async () => {
        SEED['item-skin-style-hair'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-hair.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-skin-08'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-skin-08.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-skin-06'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-skin-06.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-legs-08'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-legs-08.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-legs-06'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-legs-06.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-breastplate-08'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-breastplate-08.json`,
          }),
        );
      })();
      (async () => {
        SEED['item-skin-style-breastplate-06'] = JSON.parse(
          await CoreService.getRaw({
            url: `${getProxyPath()}assets/templates/item-skin-style-breastplate-06.json`,
          }),
        );
      })();
      const RENDER = {
        [`item-skin-style-hair`]: () => {
          const style = [
            [`#000000`, `#494949`],
            [`#fee635`, `#e5d871`],
            [`#89510c`, `#7a7132`],
          ];

          const _style =
            lockStyle && lastStyle['item-skin-style-hair']
              ? lastStyle['item-skin-style-hair']
              : style[random(0, style.length - 1)];
          if (!lockStyle) lastStyle['item-skin-style-hair'] = _style;

          for (const _c of SEED['item-skin-style-hair']) {
            dataColor[_c[1]][_c[0]] = _style[0];

            for (const _y of range(-1, 1)) {
              for (const _x of range(-1, 1)) {
                if (random(0, 1) === 1) {
                  dataColor[_c[1] + _y][_c[0] + _x] = _style[random(1, _style.length - 1)];
                  s(`.tile-color`).value = dataColor[_c[1] + _y][_c[0] + _x];
                  paint(_c[0] + _x, _c[1] + _y);
                }
              }
            }
          }
        },
        [`item-skin-style-legs`]: () => {
          const style = [
            [`#4e1700`, `#4c0000`, `#a11313`],
            [`#22393e`, `#23467b`, `#464a91`],
            [`#185722`, `#3fb751`, `#39a113`],
            [`#e123f2`, `#e34ac2`, `#823671`],
          ];

          const _style =
            lockStyle && lastStyle['item-skin-style-legs']
              ? lastStyle['item-skin-style-legs']
              : style[random(0, style.length - 1)];
          if (!lockStyle) lastStyle['item-skin-style-legs'] = _style;

          let keyStyle;

          switch (tileType) {
            case 'item-skin-06':
              keyStyle = 'item-skin-style-legs-06';
              break;
            case 'item-skin-08':
              keyStyle = 'item-skin-style-legs-08';
              break;
            default:
              break;
          }

          for (const _c of SEED[keyStyle]) {
            dataColor[_c[1]][_c[0]] = _style[random(0, _style.length - 1)];
            s(`.tile-color`).value = dataColor[_c[1]][_c[0]];
            paint(_c[0], _c[1]);
          }
        },
        [`item-skin-style-breastplate`]: () => {
          const style = [
            [`#4e1700`, `#4c0000`, `#a11313`],
            [`#22393e`, `#23467b`, `#464a91`],
            [`#185722`, `#3fb751`, `#39a113`],
            [`#e123f2`, `#e34ac2`, `#823671`],
          ];

          const _style =
            lockStyle && lastStyle['item-skin-style-breastplate']
              ? lastStyle['item-skin-style-breastplate']
              : style[random(0, style.length - 1)];
          if (!lockStyle) lastStyle['item-skin-style-breastplate'] = _style;

          let keyStyle;

          switch (tileType) {
            case 'item-skin-06':
              keyStyle = 'item-skin-style-breastplate-06';
              break;
            case 'item-skin-08':
              keyStyle = 'item-skin-style-breastplate-08';
              break;
            default:
              break;
          }

          for (const _c of SEED[keyStyle]) {
            dataColor[_c[1]][_c[0]] = _style[random(0, _style.length - 1)];
            s(`.tile-color`).value = dataColor[_c[1]][_c[0]];
            paint(_c[0], _c[1]);
          }
        },
        ['item-skin-style-skin']: () => {
          const style = [
            [`#ffc4ff`, `#ffa6ff`, `#e4a9e4`, `#ffadef`],
            [`#fff8c3`, `#fff9cf`, `#d3b98c`, `#ffef78`],
          ];

          const _style =
            lockStyle && lastStyle['item-skin-style-skin']
              ? lastStyle['item-skin-style-skin']
              : style[random(0, style.length - 1)];
          if (!lockStyle) lastStyle['item-skin-style-skin'] = _style;

          let keyStyle;

          switch (tileType) {
            case 'item-skin-06':
              keyStyle = 'item-skin-style-skin-06';
              break;
            case 'item-skin-08':
              keyStyle = 'item-skin-style-skin-08';
              break;
            default:
              break;
          }

          for (const _c of SEED[keyStyle]) {
            dataColor[_c[1]][_c[0]] = _style[random(0, _style.length - 1)];
            s(`.tile-color`).value = dataColor[_c[1]][_c[0]];
            paint(_c[0], _c[1]);
          }
        },
      };

      EventsUI.onClick(`.btn-generate-tile`, async () => {
        coordinatePreview = [];
        RENDER['item-skin-style-skin']();
        RENDER[`item-skin-style-hair`]();
        RENDER[`item-skin-style-legs`]();
        RENDER[`item-skin-style-breastplate`]();
        RenderTileCyberiaGrid();
      });
      EventsUI.onClick(`.btn-copy-coordinates-tile`, async () => {
        await copyData(JSON.stringify(coordinatePreview));
        NotificationManager.Push({
          html: Translate.Render('success-copy-data'),
          status: 'success',
        });
      });

      EventsUI.onClick(`.btn-upload-tile`, async () => {
        const tileImg = await this.TileCyberiaApp.renderer.extract.image(this.TileCyberiaApp.stage);
        const imageSrc = tileImg.currentSrc;
        const res = await fetch(imageSrc);
        const blob = await res.blob();
        const tileFile = new File([blob], `${s(`.tile-name`).value ? s(`.tile-name`).value : s4() + s4()}.png`, {
          type: 'image/png',
        });
        const body = new FormData();
        body.append('file', tileFile);
        const { status, data } = await FileService.post({ body });
        NotificationManager.Push({
          html: Translate.Render(`${status}-upload-file`),
          status,
        });
        let fileId;
        if (status === 'success') fileId = data[0]._id;
        if (fileId) {
          const body = {
            fileId,
            solid: dataSolid,
            color: dataColor,
            name: s(`.tile-name`).value,
            dim: parseInt(s(`.tile-dim`).value),
            dimPaintByCell: parseInt(s(`.tile-dimPaintByCell`).value),
            type: tileType,
          };
          const { data, status } = await CyberiaTileService.post({ body });
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-tile`),
            status,
          });
        }
      });

      EventsUI.onClick(`.btn-flip-tile`, async () => {
        dataColor = dataColor.map((row) => row.reverse());
        updatePaintGrid();
      });

      changeTileType();
    });
    return html`
      <style>
        .tile-cell {
          border: 1px solid gray;
          box-sizing: border-box;
          cursor: pointer;
        }
        .tile-cell:hover {
          border: 1px solid yellow;
        }
        .tile-cords {
          color: gray;
          font-size: 10px;
        }
      </style>
      <div class="style-tile-cords">
        <style>
          .tile-cords {
            display: none;
          }
        </style>
      </div>
      <div class="style-tile-cell"></div>
      ${dynamicCol({ containerSelector: options.idModal, id: 'tile' })}
      <div class="fl">
        <div class="in fll tile-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal">
              <i class="fa-solid fa-sliders"></i> ${Translate.Render('config-tiles')}
            </div>
          </div>

          <div class="in section-mp">
            ${await DropDown.Render({
              value: 'custom',
              label: html`${Translate.Render('select-type')}`,
              data: Object.keys(tileModels).map((tileKey) => {
                return {
                  value: tileKey,
                  display: tileKey,
                  onClick: async () => {
                    changeTileType(tileKey);
                  },
                };
              }),
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-flip-tile`,
              label: html`<i class="fas fa-exchange-alt"></i> ${Translate.Render(`flip`)}`,
            })}
          </div>
          <div class="in section-mp toggle-form-container hover">
            <div class="fl ">
              <div class="in fll" style="width: 70%">
                <div class="in"><i class="fa-solid fa-expand"></i> ${Translate.Render('coordinates')}</div>
              </div>
              <div class="in fll" style="width: 30%">
                ${await ToggleSwitch.Render({
                  id: 'toggle-tile-coordinates',
                  checked: false,
                  on: {
                    unchecked: () => {
                      htmls(
                        `.style-tile-cords`,
                        html` <style>
                          .tile-cords {
                            display: none;
                          }
                        </style>`,
                      );
                      coordinatePreview = [];
                    },
                    checked: () => {
                      htmls(`.style-tile-cords`, '');
                      coordinatePreview = [];
                    },
                  },
                })}
              </div>
            </div>
          </div>
          <div class="in section-mp toggle-form-container toggle-form-container-lock-style hover">
            <div class="fl ">
              <div class="in fll" style="width: 70%">
                <div class="in"><i class="fas fa-lock"></i> ${Translate.Render('lock-style')}</div>
              </div>
              <div class="in fll" style="width: 30%">
                ${await ToggleSwitch.Render({
                  id: 'toggle-tile-lock-style',
                  checked: lockStyle,
                  on: {
                    unchecked: () => {
                      lockStyle = false;
                    },
                    checked: () => {
                      lockStyle = true;
                    },
                  },
                })}
              </div>
            </div>
          </div>

          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-copy-coordinates-tile`,
              label: html`<i class="fas fa-copy"></i> ${Translate.Render(`copy-coordinates`)}`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-generate-tile`,
              label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
            })}
          </div>
          ${await Input.Render({
            id: `tile-name`,
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
          })}
          ${await Input.Render({
            id: `tile-color`,
            label: html`<i class="fa-solid fa-brush"></i> color`,
            containerClass: 'inl section-mp width-mini-box input-container',
            type: 'color',
            placeholder: true,
          })}
          ${await Input.Render({
            id: `tile-dim`,
            label: html`<i class="fa-solid fa-ruler"></i> dim`,
            containerClass: 'inl section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 16,
          })}
          ${await Input.Render({
            id: `tile-dimPaintByCell`,
            label: html`<i class="fa-solid fa-ruler"></i> dimPaintByCell`,
            containerClass: 'inl section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 3,
          })}
          ${await Input.Render({
            id: `tile-weight`,
            label: html`<i class="fa-solid fa-ruler"></i> weight`,
            containerClass: 'inl section-mp width-mini-box input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 1,
          })}
          ${await Input.Render({
            id: `tile-solid`,
            label: html`<i class="fa-solid fa-ruler"></i> matrix object `,
            containerClass: 'inl section-mp width-mini-box input-container',
            placeholder: true,
            value: 1,
            extension: async () => html` <div class="in">
              ${await ToggleSwitch.Render({
                id: 'solid-toggle',
                checked: solidMode,
                on: {
                  unchecked: () => {
                    solidMode = false;
                  },
                  checked: () => {
                    solidMode = true;
                  },
                },
              })}
            </div>`,
          })}

          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-upload-tile`,
              label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
            })}
          </div>
        </div>
        <div class="in fll tile-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-table-cells"></i> ${Translate.Render('tile')}</div>
          </div>
          <div class="in section-mp">
            <div class="in tile-grid-container"></div>
          </div>
          <div class="in section-mp">
            <div class="in tile-pixi-container"></div>
          </div>
          <div class="in section-mp">
            <pre class="in tile-object-container"></pre>
          </div>
        </div>
      </div>
    `;
  },
};

export { TileCyberia };
