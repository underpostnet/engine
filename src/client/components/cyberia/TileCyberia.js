import { CyberiaTileService } from '../../services/cyberia-tile/cyberia-tile.service.js';
import { FileService } from '../../services/file/file.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { JSONmatrix, range, s4 } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';

import { Application, BaseTexture, Container, Sprite, Texture } from 'pixi.js';

const TileCyberia = {
  Render: async function (options) {
    let mouseDown = false;
    let dataColor = [];
    let dataSolid = [];
    let solidMode = false;
    const paint = (x, y) => {
      for (const sumY of range(0, parseInt(s(`.tile-weight`).value) - 1))
        for (const sumX of range(0, parseInt(s(`.tile-weight`).value) - 1)) {
          if (s(`.tile-cell-${x + sumX}-${y + sumY}`)) {
            s(`.tile-cell-${x + sumX}-${y + sumY}`).style.background = s(`.tile-color`).value;
            if (!dataColor[y + sumY]) dataColor[y + sumY] = [];
            if (!dataSolid[y + sumY]) dataSolid[y + sumY] = [];
            dataColor[y + sumY][x + sumX] = s(`.tile-color`).value;
            dataSolid[y + sumY][x + sumX] = solidMode ? Input.parseJsonEval('.tile-solid') : 0;
          }
        }

      htmls(
        `.tile-object-container`,
        JSONmatrix(dataSolid).replaceAll('1', html`<span style="color: yellow">1</span>`),
      );
      this.TileCyberiaApp.stage.removeChildren();

      const rangeTileCyberia = range(0, parseInt(s(`.tile-dim`).value) * parseInt(s(`.tile-dimPaintByCell`).value) - 1);
      const dim = this.TileCyberiaAppDim / rangeTileCyberia.length;

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
    setTimeout(() => {
      const RenderTileCyberiaGrid = () => {
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
                            setTimeout(() => {
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
      s(`.tile-dim`).oninput = RenderTileCyberiaGrid;
      s(`.tile-dim`).onblur = RenderTileCyberiaGrid;
      s(`.tile-dimPaintByCell`).oninput = RenderTileCyberiaGrid;
      s(`.tile-dimPaintByCell`).onblur = RenderTileCyberiaGrid;
      RenderTileCyberiaGrid();

      this.TileCyberiaAppDim = 600;
      this.TileCyberiaApp = new Application({
        width: this.TileCyberiaAppDim,
        height: this.TileCyberiaAppDim,
        background: 'gray',
      });

      s('.tile-pixi-container').appendChild(this.TileCyberiaApp.view);
      // s('canvas').classList.add('');

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
          };
          const { data, status } = await CyberiaTileService.post({ body });
          NotificationManager.Push({
            html: Translate.Render(`${status}-upload-tile`),
            status,
          });
        }
      });
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
