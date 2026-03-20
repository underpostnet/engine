import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { darkTheme } from '../core/Css.js';
import { Input } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';

class MapEngineCyberia {
  static entities = [];

  static renderGrid(canvas, cols, rows, cellW, cellH) {
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw entities
    for (const entity of MapEngineCyberia.entities) {
      ctx.fillStyle = entity.color;
      ctx.fillRect(entity.initCellX * cellW, entity.initCellY * cellH, entity.dimX * cellW, entity.dimY * cellH);
    }

    // Draw grid lines on top
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
  }

  static async render() {
    const idX = 'map-engine-input-x';
    const idY = 'map-engine-input-y';
    const idCellW = 'map-engine-input-cell-w';
    const idCellH = 'map-engine-input-cell-h';
    const canvasId = 'map-engine-canvas';

    const idEntityType = 'map-engine-entity-type';
    const idInitCellX = 'map-engine-init-cell-x';
    const idInitCellY = 'map-engine-init-cell-y';
    const idDimX = 'map-engine-dim-x';
    const idDimY = 'map-engine-dim-y';
    const idColor = 'map-engine-color';
    const idAlpha = 'map-engine-alpha';
    const rgbaDisplayId = 'map-engine-rgba-display';
    const entityGridId = 'map-engine-entity-grid';

    setTimeout(() => {
      const canvas = s(`.${canvasId}`);
      if (!canvas) return;
      const getParams = () => ({
        cols: parseInt(s(`.${idX}`).value) || 16,
        rows: parseInt(s(`.${idY}`).value) || 16,
        cellW: parseInt(s(`.${idCellW}`).value) || 32,
        cellH: parseInt(s(`.${idCellH}`).value) || 32,
      });

      const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      const updateRgbaDisplay = () => {
        const hex = s(`.${idColor}`).value || '#ff0000';
        const alpha = parseFloat(s(`.${idAlpha}`).value);
        const rgba = hexToRgba(hex, alpha);
        if (s(`.${rgbaDisplayId}`))
          htmls(
            `.${rgbaDisplayId}`,
            `<span style="display:inline-block;width:16px;height:16px;background:${rgba};border:1px solid #888;vertical-align:middle;margin-right:6px;"></span>${rgba}`,
          );
      };

      if (s(`.${idColor}`)) s(`.${idColor}`).addEventListener('input', updateRgbaDisplay);
      if (s(`.${idAlpha}`)) s(`.${idAlpha}`).addEventListener('input', updateRgbaDisplay);
      updateRgbaDisplay();

      const getEntityParams = () => {
        const hex = s(`.${idColor}`).value || '#ff0000';
        const alpha = parseFloat(s(`.${idAlpha}`).value);
        return {
          entityType: s(`.${idEntityType}`).value || 'floor',
          initCellX: parseInt(s(`.${idInitCellX}`).value) || 0,
          initCellY: parseInt(s(`.${idInitCellY}`).value) || 0,
          dimX: parseInt(s(`.${idDimX}`).value) || 1,
          dimY: parseInt(s(`.${idDimY}`).value) || 1,
          color: hexToRgba(hex, alpha),
        };
      };

      const addEntity = () => {
        const { cols, rows, cellW, cellH } = getParams();
        const ep = getEntityParams();
        MapEngineCyberia.entities.push(ep);
        MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH);
        if (AgGrid.grids[entityGridId]) {
          AgGrid.grids[entityGridId].setGridOption('rowData', [...MapEngineCyberia.entities]);
        }
      };

      const params = getParams();
      MapEngineCyberia.renderGrid(canvas, params.cols, params.rows, params.cellW, params.cellH);

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const { cellW, cellH } = getParams();
        const col = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / cellW);
        const row = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / cellH);
        console.log(`Cell clicked: (${col}, ${row})`);

        if (s(`.${idInitCellX}`)) s(`.${idInitCellX}`).value = col;
        if (s(`.${idInitCellY}`)) s(`.${idInitCellY}`).value = row;

        addEntity();
      };

      if (s(`.btn-map-engine-add-entity`)) s(`.btn-map-engine-add-entity`).onclick = () => addEntity();

      if (s(`.btn-map-engine-generate`))
        s(`.btn-map-engine-generate`).onclick = () => {
          const { cols, rows, cellW, cellH } = getParams();
          MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH);
        };

      if (s(`.btn-map-engine-clear`))
        s(`.btn-map-engine-clear`).onclick = () => {
          MapEngineCyberia.entities = [];
          const { cols, rows, cellW, cellH } = getParams();
          MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH);
          if (AgGrid.grids[entityGridId]) {
            AgGrid.grids[entityGridId].setGridOption('rowData', []);
          }
        };
    });

    return html`<div class="in section-mp">
      <div class="fl">
        <div class="in fll" style="width: 50%;">
          ${await Input.Render({
            id: idX,
            label: html`X`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 16,
          })}
        </div>
        <div class="in fll" style="width: 50%;">
          ${await Input.Render({
            id: idY,
            label: html`Y`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 16,
          })}
        </div>
      </div>
      <div class="fl">
        <div class="in fll" style="width: 50%;">
          ${await Input.Render({
            id: idCellW,
            label: html`Cell Width (px)`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 32,
          })}
        </div>
        <div class="in fll" style="width: 50%;">
          ${await Input.Render({
            id: idCellH,
            label: html`Cell Height (px)`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 32,
          })}
        </div>
      </div>
      <div class="fl">
        <div class="in fll" style="width: 50%;">
          ${await BtnIcon.Render({
            class: 'wfa btn-map-engine-generate',
            label: html`<i class="fa-solid fa-arrows-rotate"></i> Generate`,
          })}
        </div>
        <div class="in fll" style="width: 50%;">
          ${await BtnIcon.Render({
            class: 'wfa btn-map-engine-clear',
            label: html`<i class="fa-solid fa-broom"></i> Clear Entities`,
          })}
        </div>
      </div>
      <div class="in" style="text-align: center; margin-top: 10px;">
        <canvas class="${canvasId}" width="512" height="512" style="border: 1px solid #555;"></canvas>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        <div class="fl">
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idEntityType,
              label: html`Entity Type`,
              containerClass: 'inl',
              type: 'text',
              value: 'floor',
            })}
          </div>
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idColor,
              label: html`Color`,
              containerClass: 'inl',
              type: 'color',
              value: '#ff0000',
            })}
          </div>
        </div>
        <div class="fl">
          <div class="in fll" style="width: 50%;">
            <div class="inl input-container-${idAlpha}">
              <div class="in">
                <div class="in input-label">Alpha</div>
                <label for="${idAlpha}-name">
                  <span class="hide">Alpha</span>
                  <input
                    type="range"
                    class="in wfa ${idAlpha}"
                    min="0"
                    max="1"
                    step="0.01"
                    value="1"
                    name="${idAlpha}-name"
                    id="${idAlpha}-name"
                  />
                </label>
              </div>
            </div>
          </div>
          <div class="in fll" style="width: 50%; line-height: 40px;">
            <div class="in input-label">RGBA</div>
            <div class="in ${rgbaDisplayId}" style="font-family: monospace; font-size: 13px;"></div>
          </div>
        </div>
        <div class="fl">
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idInitCellX,
              label: html`initCellX`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idInitCellY,
              label: html`initCellY`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
        </div>
        <div class="fl">
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idDimX,
              label: html`dimX`,
              containerClass: 'inl',
              type: 'number',
              min: 1,
              value: 1,
            })}
          </div>
          <div class="in fll" style="width: 50%;">
            ${await Input.Render({
              id: idDimY,
              label: html`dimY`,
              containerClass: 'inl',
              type: 'number',
              min: 1,
              value: 1,
            })}
          </div>
        </div>
        <div class="in">
          ${await BtnIcon.Render({
            class: 'wfa btn-map-engine-add-entity',
            label: html`<i class="fa-solid fa-plus"></i> Add Entity`,
          })}
        </div>
        <div class="in">
          ${await AgGrid.Render({
            id: entityGridId,
            darkTheme,
            style: {
              height: '300px',
            },
            gridOptions: {
              rowData: [],
              columnDefs: [
                { field: 'entityType', headerName: 'Entity Type' },
                { field: 'initCellX', headerName: 'initCellX' },
                { field: 'initCellY', headerName: 'initCellY' },
                { field: 'dimX', headerName: 'dimX' },
                { field: 'dimY', headerName: 'dimY' },
                { field: 'color', headerName: 'Color' },
              ],
            },
          })}
        </div>
      </div>
    </div>`;
  }
}

export { MapEngineCyberia };
