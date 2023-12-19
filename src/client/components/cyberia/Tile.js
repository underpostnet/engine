import { range } from '../core/CommonJs.js';
import { Input } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';

const Tile = {
  Render: async function () {
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
                            setTimeout(() => {
                              s(`.tile-cell-${x}-${y}`).onmouseover = () => {
                                if (mouseDown) {
                                  s(`.tile-cell-${x}-${y}`).style.background = s(`.tile-color`).value;
                                }
                              };
                              s(`.tile-cell-${x}-${y}`).onclick = () => {
                                s(`.tile-cell-${x}-${y}`).style.background = s(`.tile-color`).value;
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
      <div class="in">
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
          id: `tile-color`,
          label: html`<i class="fa-solid fa-brush"></i> color`,
          containerClass: 'section-mp container-component input-container',
          type: 'color',
          placeholder: true,
        })}
      </div>
      <div class="in tile-grid-container"></div>
    `;
  },
};

export { Tile };
