import { range } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { Input } from '../core/Input.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';

const Tile = {
  Render: async function (options) {
    setTimeout(() => {
      const RenderTileGrid = () => {
        let mouseDown = false;
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
                                  if (s(`.tile-cell-${x + sumX}-${y + sumY}`))
                                    s(`.tile-cell-${x + sumX}-${y + sumY}`).style.background = s(`.tile-color`).value;
                                }
                            };
                            setTimeout(() => {
                              s(`.tile-cell-${x}-${y}`).onmouseover = () => {
                                if (mouseDown) paint();
                              };
                              s(`.tile-cell-${x}-${y}`).onclick = () => {
                                paint();
                              };
                            });
                            return html`<div class="in fll tile-cell tile-cell-${x}-${y}"><!-- ${x} - ${y} --></div>`;
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
        </div>
        <div class="in fll tile-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-table-cells"></i> ${Translate.Render('tile')}</div>
          </div>
          <div class="in section-mp">
            <div class="in tile-grid-container"></div>
          </div>
        </div>
      </div>
    `;
  },
};

export { Tile };
