import { BtnIcon } from '../core/BtnIcon.js';
import { Input } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { dynamicCol } from '../core/Css.js';
import { CyberiaMapManagement } from '../../services/cyberia-map/cyberia-map.management.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';

class MapEngineCyberia {
  static entities = [];
  static currentMapId = null;
  static loadMap = null;

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

  static renderEntityList(containerId) {
    const container = s(`.${containerId}`);
    if (!container) return;
    let html = '';
    MapEngineCyberia.entities.forEach((entity, i) => {
      html += `<div class="fl" style="border-bottom:1px solid #444; padding:4px 0; align-items:center;">
        <div class="in fll" style="width:20px;height:20px;background:${entity.color};border:1px solid #888;margin-right:6px;"></div>
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          ${entity.entityType} (${entity.initCellX},${entity.initCellY}) ${entity.dimX}x${entity.dimY}
        </div>
        <div class="in fll">
          <button class="btn-map-engine-remove-entity" data-index="${i}" style="cursor:pointer;background:#a00;color:#fff;border:none;padding:2px 8px;font-size:12px;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
    });
    if (!html) html = '<div style="color:#888;font-size:13px;">No entities added yet.</div>';
    htmls(`.${containerId}`, html);

    container.querySelectorAll('.btn-map-engine-remove-entity').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        MapEngineCyberia.entities.splice(idx, 1);
        MapEngineCyberia.renderEntityList(containerId);
        const canvasEl = s('.map-engine-canvas');
        if (canvasEl) {
          const cols = parseInt(s('.map-engine-input-x')?.value) || 16;
          const rows = parseInt(s('.map-engine-input-y')?.value) || 16;
          const cellW = parseInt(s('.map-engine-input-cell-w')?.value) || 32;
          const cellH = parseInt(s('.map-engine-input-cell-h')?.value) || 32;
          MapEngineCyberia.renderGrid(canvasEl, cols, rows, cellW, cellH);
        }
      };
    });
  }

  static async render() {
    const idCode = 'map-engine-input-code';
    const idName = 'map-engine-input-name';
    const idDescription = 'map-engine-input-description';

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
    const entityListId = 'map-engine-entity-list';
    const managementId = 'modal-cyberia-map-engine';

    MapEngineCyberia.entities = [];
    MapEngineCyberia.currentMapId = null;

    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const getCanvasParams = () => ({
      cols: parseInt(s(`.${idX}`)?.value) || 16,
      rows: parseInt(s(`.${idY}`)?.value) || 16,
      cellW: parseInt(s(`.${idCellW}`)?.value) || 32,
      cellH: parseInt(s(`.${idCellH}`)?.value) || 32,
    });

    const rerenderCanvas = () => {
      const canvas = s(`.${canvasId}`);
      if (!canvas) return;
      const { cols, rows, cellW, cellH } = getCanvasParams();
      MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH);
    };

    const getEntityParams = () => {
      const hex = s(`.${idColor}`)?.value || '#ff0000';
      const alpha = parseFloat(s(`.${idAlpha}`)?.value);
      return {
        entityType: s(`.${idEntityType}`)?.value || 'floor',
        initCellX: parseInt(s(`.${idInitCellX}`)?.value) || 0,
        initCellY: parseInt(s(`.${idInitCellY}`)?.value) || 0,
        dimX: parseInt(s(`.${idDimX}`)?.value) || 1,
        dimY: parseInt(s(`.${idDimY}`)?.value) || 1,
        color: hexToRgba(hex, alpha),
      };
    };

    const addEntityLocally = () => {
      const ep = getEntityParams();
      MapEngineCyberia.entities.push(ep);
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
    };

    const getMapPayload = () => ({
      code: s(`.${idCode}`)?.value || '',
      name: s(`.${idName}`)?.value || '',
      description: s(`.${idDescription}`)?.value || '',
      entities: MapEngineCyberia.entities,
    });

    const saveMap = async () => {
      const body = getMapPayload();
      let result;
      if (MapEngineCyberia.currentMapId) {
        result = await CyberiaMapService.put({ id: MapEngineCyberia.currentMapId, body });
      } else {
        result = await CyberiaMapService.post({ body });
      }
      NotificationManager.Push({
        html:
          result.status === 'error'
            ? result.message
            : MapEngineCyberia.currentMapId
              ? Translate.Render('success-update-item')
              : Translate.Render('success-create-item'),
        status: result.status,
      });
      if (result.status === 'success') {
        if (result.data?._id) MapEngineCyberia.currentMapId = result.data._id;
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
    };

    const loadMap = (mapData) => {
      MapEngineCyberia.currentMapId = mapData._id || null;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = mapData.code || '';
      if (s(`.${idName}`)) s(`.${idName}`).value = mapData.name || '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = mapData.description || '';
      MapEngineCyberia.entities = (mapData.entities || []).map((e) => ({
        entityType: e.entityType,
        initCellX: e.initCellX,
        initCellY: e.initCellY,
        dimX: e.dimX,
        dimY: e.dimY,
        color: e.color,
      }));
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
    };

    MapEngineCyberia.loadMap = loadMap;

    const resetForm = () => {
      MapEngineCyberia.currentMapId = null;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = '';
      if (s(`.${idName}`)) s(`.${idName}`).value = '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = '';
      MapEngineCyberia.entities = [];
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
    };

    setTimeout(() => {
      const canvas = s(`.${canvasId}`);
      if (!canvas) return;

      const updateRgbaDisplay = () => {
        const hex = s(`.${idColor}`)?.value || '#ff0000';
        const alpha = parseFloat(s(`.${idAlpha}`)?.value);
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

      const params = getCanvasParams();
      MapEngineCyberia.renderGrid(canvas, params.cols, params.rows, params.cellW, params.cellH);

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const { cellW, cellH } = getCanvasParams();
        const col = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / cellW);
        const row = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / cellH);
        console.log(`Cell clicked: (${col}, ${row})`);

        if (s(`.${idInitCellX}`)) s(`.${idInitCellX}`).value = col;
        if (s(`.${idInitCellY}`)) s(`.${idInitCellY}`).value = row;

        addEntityLocally();
      };

      if (s(`.btn-map-engine-add-entity`)) s(`.btn-map-engine-add-entity`).onclick = () => addEntityLocally();

      if (s(`.btn-map-engine-generate`))
        s(`.btn-map-engine-generate`).onclick = () => {
          rerenderCanvas();
        };

      if (s(`.btn-map-engine-save-map`)) s(`.btn-map-engine-save-map`).onclick = () => saveMap();

      if (s(`.btn-map-engine-new-map`)) s(`.btn-map-engine-new-map`).onclick = () => resetForm();
    });

    const managementTableHtml = await CyberiaMapManagement.RenderTable({
      idModal: managementId,
      loadMapCallback: loadMap,
    });

    const dcMapFields = 'map-engine-dc-fields';
    const dcGridSize = 'map-engine-dc-grid-size';
    const dcCellSize = 'map-engine-dc-cell-size';
    const dcEntityType = 'map-engine-dc-entity-type';
    const dcAlpha = 'map-engine-dc-alpha';
    const dcCellPos = 'map-engine-dc-cell-pos';
    const dcDim = 'map-engine-dc-dim';
    const dcSaveNew = 'map-engine-dc-save-new';

    return html`<div class="in section-mp map-engine-container">
      ${dynamicCol({ containerSelector: 'map-engine-container', id: dcMapFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcMapFields}-col-a">
          ${await Input.Render({
            id: idCode,
            label: html`Code`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMapFields}-col-b">
          ${await Input.Render({
            id: idName,
            label: html`Name`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMapFields}-col-c">
          ${await Input.Render({
            id: idDescription,
            label: html`Description`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
      </div>
      ${dynamicCol({ containerSelector: 'map-engine-container', id: dcGridSize, type: 'a-50-b-50' })}
      <div class="fl">
        <div class="in fll ${dcGridSize}-col-a">
          ${await Input.Render({
            id: idX,
            label: html`X`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 16,
          })}
        </div>
        <div class="in fll ${dcGridSize}-col-b">
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
      ${dynamicCol({ containerSelector: 'map-engine-container', id: dcCellSize, type: 'a-50-b-50' })}
      <div class="fl">
        <div class="in fll ${dcCellSize}-col-a">
          ${await Input.Render({
            id: idCellW,
            label: html`Cell Width (px)`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 32,
          })}
        </div>
        <div class="in fll ${dcCellSize}-col-b">
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
        <div class="in wfa" style="padding: 10px; max-width: 200px; margin: auto;">
          ${await BtnIcon.Render({
            class: 'wfa btn-map-engine-generate',
            label: html`<i class="fa-solid fa-arrows-rotate"></i> Generate`,
          })}
        </div>
      </div>
      <div class="in" style="text-align: center; margin-top: 10px;">
        <canvas class="${canvasId}" width="512" height="512" style="border: 1px solid #555;"></canvas>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcEntityType, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcEntityType}-col-a">
            ${await Input.Render({
              id: idEntityType,
              label: html`Entity Type`,
              containerClass: 'inl',
              type: 'text',
              value: 'floor',
            })}
          </div>
          <div class="in fll ${dcEntityType}-col-b">
            ${await Input.Render({
              id: idColor,
              label: html`Color`,
              containerClass: 'inl',
              type: 'color',
              value: '#ff0000',
            })}
          </div>
        </div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcAlpha, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcAlpha}-col-a">
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
          <div class="in fll ${dcAlpha}-col-b" style="line-height: 40px;">
            <div class="in input-label">RGBA</div>
            <div class="in ${rgbaDisplayId}" style="font-family: monospace; font-size: 13px;"></div>
          </div>
        </div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcCellPos, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcCellPos}-col-a">
            ${await Input.Render({
              id: idInitCellX,
              label: html`initCellX`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcCellPos}-col-b">
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
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcDim, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcDim}-col-a">
            ${await Input.Render({
              id: idDimX,
              label: html`dimX`,
              containerClass: 'inl',
              type: 'number',
              min: 1,
              value: 1,
            })}
          </div>
          <div class="in fll ${dcDim}-col-b">
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
        <div class="in ${entityListId}" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcSaveNew, type: 'a-50-b-50' })}
        <div class="fl" style="margin-top: 10px;">
          <div class="in fll ${dcSaveNew}-col-a" style="padding: 5px;">
            ${await BtnIcon.Render({
              class: 'wfa btn-map-engine-save-map',
              label: html`<i class="fa-solid fa-floppy-disk"></i> Save Map`,
            })}
          </div>
          <div class="in fll ${dcSaveNew}-col-b" style="padding: 5px;">
            ${await BtnIcon.Render({
              class: 'wfa btn-map-engine-new-map',
              label: html`<i class="fa-solid fa-file"></i> New Map`,
            })}
          </div>
        </div>
        <div class="in" style="margin-top: 10px;">${managementTableHtml}</div>
      </div>
    </div>`;
  }
}

export { MapEngineCyberia };
