import { BtnIcon } from '../core/BtnIcon.js';
import { JSONmatrix, range } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { Input } from '../core/Input.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';

const Tile = {
  Render: async function (options) {
    let mouseDown = false;
    let dataColor = [];
    let dataSolid = [];
    let solidMode = false;
    setTimeout(() => {
      const RenderTileGrid = () => {
        dataColor = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((y) =>
          range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((x) => {
            if (dataColor[y] && dataColor[y][x] !== undefined) return dataColor[y][x];
            return '#000000';
          }),
        );
        dataSolid = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((y) =>
          range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1).map((x) => {
            if (dataSolid[y] && dataSolid[y][x] !== undefined) return dataSolid[y][x];
            return 0;
          }),
        );
        setTimeout(() => {
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
                            const paint = () => {
                              for (const sumY of range(0, parseInt(s(`.tile-weight`).value) - 1))
                                for (const sumX of range(0, parseInt(s(`.tile-weight`).value) - 1)) {
                                  if (s(`.tile-cell-${x + sumX}-${y + sumY}`)) {
                                    s(`.tile-cell-${x + sumX}-${y + sumY}`).style.background = s(`.tile-color`).value;
                                    if (!dataColor[y + sumY]) dataColor[y + sumY] = [];
                                    if (!dataSolid[y + sumY]) dataSolid[y + sumY] = [];
                                    dataColor[y + sumY][x + sumX] = s(`.tile-color`).value;
                                    dataSolid[y + sumY][x + sumX] = solidMode ? JSON.parse(s(`.tile-solid`).value) : 0;
                                  }
                                }

                              htmls(
                                `.tile-object-container`,
                                JSONmatrix(dataSolid).replaceAll('1', html`<span style="color: yellow">1</span>`),
                              );
                            };
                            setTimeout(() => {
                              s(`.tile-cell-${x}-${y}`).onmouseover = () => {
                                if (mouseDown) paint();
                              };
                              s(`.tile-cell-${x}-${y}`).onclick = () => {
                                paint();
                              };
                            });
                            return html`<div
                              class="in fll tile-cell tile-cell-${x}-${y}"
                              ${dataColor[y] && dataColor[y][x] ? `style='background: ${dataColor[y][x]}'` : ''}
                            >
                              <!-- ${x} - ${y} -->
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
      };
      s(`.tile-dim`).oninput = RenderTileGrid;
      s(`.tile-dim`).onblur = RenderTileGrid;
      s(`.tile-dimPaintByCell`).oninput = RenderTileGrid;
      s(`.tile-dimPaintByCell`).onblur = RenderTileGrid;
      RenderTileGrid();

      this.TileAppDim = 600;
      this.TileApp = new Application({
        width: this.TileAppDim,
        height: this.TileAppDim,
        background: 'gray',
      });

      s('.tile-pixi-container').appendChild(this.TileApp.view);
      // s('canvas').classList.add('');

      s(`.btn-upload-tile`).onclick = () => {
        this.TileApp.stage.removeChildren();

        const rangeTile = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1);
        const dim = this.TileAppDim / rangeTile.length;

        for (const y of rangeTile)
          for (const x of rangeTile) {
            if (dataColor[y] && dataColor[y][x]) {
              const cell = new Sprite(Texture.WHITE);
              cell.x = dim * x;
              cell.y = dim * y;
              cell.width = dim;
              cell.height = dim;
              cell.tint = dataColor[y][x];
              this.TileApp.stage.addChild(cell);
            }
          }
      };
    });
    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: 'tile' })}
      <div class="fl">
        <div class="in fll tile-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal">
              <i class="fa-solid fa-sliders"></i> ${Translate.Render('config-tiles')}
            </div>
          </div>
          ${await Input.Render({
            id: `tile-color`,
            label: html`<i class="fa-solid fa-brush"></i> color`,
            containerClass: 'section-mp container-component input-container',
            type: 'color',
            placeholder: true,
          })}
          ${await Input.Render({
            id: `tile-dim`,
            label: html`<i class="fa-solid fa-ruler"></i> dim`,
            containerClass: 'section-mp container-component input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 16,
          })}
          ${await Input.Render({
            id: `tile-dimPaintByCell`,
            label: html`<i class="fa-solid fa-ruler"></i> dimPaintByCell`,
            containerClass: 'section-mp container-component input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 3,
          })}
          ${await Input.Render({
            id: `tile-weight`,
            label: html`<i class="fa-solid fa-ruler"></i> weight`,
            containerClass: 'section-mp container-component input-container',
            type: 'number',
            min: 0,
            placeholder: true,
            value: 1,
          })}
          ${await Input.Render({
            id: `tile-solid`,
            label: html`<i class="fa-solid fa-ruler"></i> matrix object
              <div class="in toggle-switch-input-container">
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
            containerClass: 'section-mp container-component input-container',
            placeholder: true,
            value: 1,
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

export { Tile };
