import { BtnIcon } from '../core/BtnIcon.js';
import { Input, InputFile, getFileFromBlobEndpoint } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { darkTheme, dynamicCol, ThemeEvents } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { CyberiaMapManagement } from '../../services/cyberia-map/cyberia-map.management.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { FileService } from '../../services/file/file.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';

class MapEngineCyberia {
  static entities = [];
  static currentMapId = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static loadMap = null;
  static showGridBorders = true;

  static renderGrid(canvas, cols, rows, cellW, cellH, showGrid = true) {
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
    if (showGrid) {
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
        }
      }
    }
  }

  static renderToOffscreenCanvas(cols, rows, cellW, cellH) {
    const offscreen = document.createElement('canvas');
    offscreen.width = cols * cellW;
    offscreen.height = rows * cellH;
    const ctx = offscreen.getContext('2d');
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    for (const entity of MapEngineCyberia.entities) {
      ctx.fillStyle = entity.color;
      ctx.fillRect(entity.initCellX * cellW, entity.initCellY * cellH, entity.dimX * cellW, entity.dimY * cellH);
    }
    return offscreen;
  }

  static renderEntityList(containerId) {
    const container = s(`.${containerId}`);
    if (!container) return;
    let html = '';
    MapEngineCyberia.entities.forEach((entity, i) => {
      const layerTags = (entity.objectLayerItemIds || [])
        .map(
          (id) =>
            html`<div
              class="badge inl"
              style="background:${darkTheme ? '#335' : '#cde'};color:${darkTheme
                ? '#adf'
                : '#246'};border-radius:4px;font-size:11px;height:auto;min-width:auto;margin:1px 2px;"
            >
              <div class="badge-text"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:9px;"></i>${id}</div>
            </div>`,
        )
        .join('');
      html += html`<div class="fl" style="border-bottom:1px solid #444; padding:4px 0; align-items:center;">
        <div
          class="in fll"
          style="width:20px;height:20px;background:${entity.color};border:1px solid #888;margin-right:6px;"
        ></div>
        <div class="in fll" style="flex:1;font-size:12px;font-family:monospace;">
          ${entity.entityType} (${entity.initCellX},${entity.initCellY}) ${entity.dimX}x${entity.dimY}
          ${layerTags ? html`<div style="margin-top:2px;">${layerTags}</div>` : ''}
        </div>
        <div class="in fll" style="display:flex;gap:3px;">
          <button
            class="btn-map-engine-load-entity-values"
            data-index="${i}"
            style="cursor:pointer;background:#36a;color:#fff;border:none;padding:2px 8px;font-size:12px;"
          >
            <i class="fa-solid fa-clone"></i>
          </button>
          <button
            class="btn-map-engine-remove-entity"
            data-index="${i}"
            style="cursor:pointer;background:#a00;color:#fff;border:none;padding:2px 8px;font-size:12px;"
          >
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
          MapEngineCyberia.renderGrid(canvasEl, cols, rows, cellW, cellH, MapEngineCyberia.showGridBorders);
        }
      };
    });

    container.querySelectorAll('.btn-map-engine-load-entity-values').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        const entity = MapEngineCyberia.entities[idx];
        if (!entity) return;

        if (s('.map-engine-entity-type')) s('.map-engine-entity-type').value = entity.entityType || 'floor';
        if (s('.map-engine-init-cell-x')) s('.map-engine-init-cell-x').value = entity.initCellX || 0;
        if (s('.map-engine-init-cell-y')) s('.map-engine-init-cell-y').value = entity.initCellY || 0;
        if (s('.map-engine-dim-x')) s('.map-engine-dim-x').value = entity.dimX || 1;
        if (s('.map-engine-dim-y')) s('.map-engine-dim-y').value = entity.dimY || 1;

        // Parse rgba color back to hex + alpha
        const rgbaMatch = (entity.color || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
          const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
          const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
          const alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
          if (s('.map-engine-color')) s('.map-engine-color').value = `#${r}${g}${b}`;
          if (s('.map-engine-alpha')) {
            s('.map-engine-alpha').value = alpha;
            s('.map-engine-alpha').dispatchEvent(new Event('input'));
          }
          if (s('.map-engine-color')) s('.map-engine-color').dispatchEvent(new Event('input'));
        }

        // Load object layer item IDs into the dropdown
        const ddId = 'map-engine-obj-layer-dropdown';
        if (DropDown.Tokens[ddId]) {
          DropDown.Tokens[ddId].oncheckvalues = {};
          const itemIds = entity.objectLayerItemIds || [];
          for (const itemId of itemIds) {
            const key = itemId.trim().replaceAll(' ', '-');
            DropDown.Tokens[ddId].oncheckvalues[key] = { data: itemId, display: itemId, value: itemId };
          }
          DropDown.Tokens[ddId].value = itemIds;
          if (s(`.${ddId}`)) s(`.${ddId}`).value = itemIds;
          // Trigger badge re-render
          if (s(`.dropdown-current-${ddId}`)) {
            DropDown.Tokens[ddId]._renderSelectedBadges?.();
          }
        }
      };
    });
  }

  static async render(options = {}) {
    const { Elements } = options;
    const idCode = 'map-engine-input-code';
    const idName = 'map-engine-input-name';
    const idDescription = 'map-engine-input-description';
    const idTags = 'map-engine-input-tags';
    const idStatus = 'map-engine-input-status';
    const idThumbnail = 'map-engine-input-thumbnail';
    const idCreator = 'map-engine-input-creator';

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
    const idObjLayerDropdown = 'map-engine-obj-layer-dropdown';
    const managementId = 'modal-cyberia-map-engine';

    MapEngineCyberia.entities = [];
    MapEngineCyberia.currentMapId = null;
    MapEngineCyberia.currentThumbnailId = null;

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
      MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH, MapEngineCyberia.showGridBorders);
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
      ep.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];
      MapEngineCyberia.entities.push(ep);
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
    };

    const getMapPayload = () => {
      const tagsRaw = s(`.${idTags}`)?.value || '';
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      const payload = {
        code: s(`.${idCode}`)?.value || '',
        name: s(`.${idName}`)?.value || '',
        description: s(`.${idDescription}`)?.value || '',
        tags,
        status: DropDown.Tokens[idStatus]?.value || 'unlisted',
        entities: MapEngineCyberia.entities,
      };
      if (MapEngineCyberia.currentThumbnailId) payload.thumbnail = MapEngineCyberia.currentThumbnailId;
      return payload;
    };

    const saveMap = async () => {
      // Upload thumbnail file only if user selected a new one
      const thumbnailInput = s(`.${idThumbnail}`);
      if (
        MapEngineCyberia.thumbnailDirty &&
        thumbnailInput &&
        thumbnailInput.files &&
        thumbnailInput.files.length > 0
      ) {
        const formData = new FormData();
        formData.append('file', thumbnailInput.files[0]);
        const uploadResult = await FileService.post({ body: formData });
        if (uploadResult.status === 'success' && uploadResult.data && uploadResult.data.length > 0) {
          MapEngineCyberia.currentThumbnailId = uploadResult.data[0]._id;
        } else {
          NotificationManager.Push({
            html: uploadResult.message || 'Failed to upload thumbnail',
            status: 'error',
          });
          return;
        }
      }

      // Auto-capture canvas as thumbnail if none set
      if (!MapEngineCyberia.currentThumbnailId) {
        const { cols, rows, cellW, cellH } = getCanvasParams();
        const offscreen = MapEngineCyberia.renderToOffscreenCanvas(cols, rows, cellW, cellH);
        const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], 'map-thumbnail.png', { type: 'image/png' });
          const formData = new FormData();
          formData.append('file', file);
          const uploadResult = await FileService.post({ body: formData });
          if (uploadResult.status === 'success' && uploadResult.data?.length > 0) {
            MapEngineCyberia.currentThumbnailId = uploadResult.data[0]._id;
          }
        }
      }

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

    const loadMap = async (mapData) => {
      MapEngineCyberia.currentMapId = mapData._id || null;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = mapData.code || '';
      if (s(`.${idName}`)) s(`.${idName}`).value = mapData.name || '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = mapData.description || '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = (mapData.tags || []).join(', ');
      const statusValue = mapData.status || 'unlisted';
      if (DropDown.Tokens[idStatus]) {
        const statusIndex = statusOptions.findIndex((opt) => opt.value === statusValue);
        if (statusIndex > -1) s(`.dropdown-option-${idStatus}-${statusIndex}`).click();
      }

      // Thumbnail
      MapEngineCyberia.currentThumbnailId = mapData.thumbnail || null;
      const thumbnailPreview = s(`.map-engine-thumbnail-preview`);
      if (MapEngineCyberia.currentThumbnailId) {
        const thumbId =
          typeof MapEngineCyberia.currentThumbnailId === 'object'
            ? MapEngineCyberia.currentThumbnailId._id
            : MapEngineCyberia.currentThumbnailId;

        // Set preview image
        if (thumbnailPreview) {
          thumbnailPreview.innerHTML = html`<img
            src="${getApiBaseUrl({ id: thumbId, endpoint: 'file/blob' })}"
            style="max-width:120px;max-height:120px;border:1px solid #555;"
            onerror="this.style.display='none';"
          />`;
        }

        // Populate InputFile with the actual file from server
        if (s(`.${idThumbnail}`)) {
          const fileData = await getFileFromBlobEndpoint({ _id: thumbId, mimetype: 'image/png' });
          if (fileData) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(fileData);
            s(`.${idThumbnail}`).files = dataTransfer.files;
            s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
          }
        }
        MapEngineCyberia.thumbnailDirty = false;
      } else {
        if (thumbnailPreview) thumbnailPreview.innerHTML = '';
        // Clear InputFile
        if (s(`.${idThumbnail}`)) {
          s(`.${idThumbnail}`).value = '';
          s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
        }
      }

      // Creator display
      const creatorDisplay = s(`.map-engine-creator-display`);
      if (creatorDisplay) {
        if (mapData.creator) {
          const creatorUsername =
            typeof mapData.creator === 'object' ? mapData.creator.username || mapData.creator._id : mapData.creator;
          creatorDisplay.innerHTML = html`<span style="font-family:monospace;font-size:12px;"
            >${creatorUsername}</span
          >`;
        } else {
          creatorDisplay.innerHTML = html`<span style="color:#888;font-size:12px;">—</span>`;
        }
      }

      MapEngineCyberia.entities = (mapData.entities || []).map((e) => ({
        entityType: e.entityType,
        initCellX: e.initCellX,
        initCellY: e.initCellY,
        dimX: e.dimX,
        dimY: e.dimY,
        color: e.color,
        objectLayerItemIds: e.objectLayerItemIds || [],
      }));
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
    };

    MapEngineCyberia.loadMap = loadMap;

    const resetForm = () => {
      MapEngineCyberia.currentMapId = null;
      MapEngineCyberia.currentThumbnailId = null;
      MapEngineCyberia.thumbnailDirty = false;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = '';
      if (s(`.${idName}`)) s(`.${idName}`).value = '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = '';
      if (DropDown.Tokens[idStatus]) {
        const resetIndex = statusOptions.findIndex((opt) => opt.value === 'unlisted');
        if (resetIndex > -1) s(`.dropdown-option-${idStatus}-${resetIndex}`).click();
      }
      const thumbnailPreview = s(`.map-engine-thumbnail-preview`);
      if (thumbnailPreview) thumbnailPreview.innerHTML = '';
      if (s(`.${idThumbnail}`)) {
        s(`.${idThumbnail}`).value = '';
        s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
      }
      const creatorDisplay = s(`.map-engine-creator-display`);
      if (creatorDisplay) creatorDisplay.innerHTML = '<span style="color:#888;font-size:12px;">—</span>';
      MapEngineCyberia.entities = [];
      MapEngineCyberia.renderEntityList(entityListId);
      rerenderCanvas();
      if (DropDown.Tokens[idObjLayerDropdown]) {
        DropDown.Tokens[idObjLayerDropdown].oncheckvalues = {};
        DropDown.Tokens[idObjLayerDropdown].value = [];
        htmls(`.dropdown-current-${idObjLayerDropdown}`, '');
        htmls(`.${idObjLayerDropdown}-render-container`, '');
      }
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
      MapEngineCyberia.renderGrid(
        canvas,
        params.cols,
        params.rows,
        params.cellW,
        params.cellH,
        MapEngineCyberia.showGridBorders,
      );

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

      ThemeEvents['map-engine-theme'] = () => {
        MapEngineCyberia.renderEntityList(entityListId);
      };

      if (s(`.btn-map-engine-capture-thumbnail`))
        s(`.btn-map-engine-capture-thumbnail`).onclick = () => {
          const { cols, rows, cellW, cellH } = getCanvasParams();
          const offscreen = MapEngineCyberia.renderToOffscreenCanvas(cols, rows, cellW, cellH);
          offscreen.toBlob((blob) => {
            if (!blob) return;
            const file = new File([blob], 'map-thumbnail.png', { type: 'image/png' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const thumbnailInput = s(`.${idThumbnail}`);
            if (thumbnailInput) {
              thumbnailInput.files = dataTransfer.files;
              thumbnailInput.onchange({ target: thumbnailInput });
            }
            MapEngineCyberia.thumbnailDirty = true;
          }, 'image/png');
        };

      if (s(`.btn-map-engine-toggle-thumbnail`))
        s(`.btn-map-engine-toggle-thumbnail`).onclick = () => {
          const body = s(`.map-engine-thumbnail-body`);
          const caret = s(`.map-engine-thumbnail-caret`);
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };
    });

    const statusOptions = [
      { value: 'unlisted', display: 'unlisted', data: 'unlisted', onClick: () => {} },
      { value: 'draft', display: 'draft', data: 'draft', onClick: () => {} },
      { value: 'published', display: 'published', data: 'published', onClick: () => {} },
      { value: 'archived', display: 'archived', data: 'archived', onClick: () => {} },
    ];

    const managementTableHtml = await CyberiaMapManagement.RenderTable({
      idModal: managementId,
      loadMapCallback: loadMap,
      Elements,
      readyRowDataEvent: {
        'map-engine-check-deleted': (rowData) => {
          if (MapEngineCyberia.currentMapId) {
            const stillExists = rowData.some((row) => row._id === MapEngineCyberia.currentMapId);
            if (!stillExists) MapEngineCyberia.currentMapId = null;
          }
        },
      },
    });

    const dcMapFields = 'map-engine-dc-fields';
    const dcMetaFields = 'map-engine-dc-meta';
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
      ${dynamicCol({ containerSelector: 'map-engine-container', id: dcMetaFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcMetaFields}-col-a">
          ${await Input.Render({
            id: idTags,
            label: html`Tags (comma separated)`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-b">
          ${await DropDown.Render({
            id: idStatus,
            label: html`Status`,
            data: statusOptions.map((opt) => ({ ...opt })),
            value: 'unlisted',
            containerClass: 'inl',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-c">
          <div class="inl">
            <div class="in input-label">Creator</div>
            <div class="in map-engine-creator-display">
              <span style="color:#888;font-size:12px;">—</span>
            </div>
          </div>
        </div>
      </div>
      <div class="in section-mp" style="margin-top: 5px;">
        <div class="in map-engine-thumbnail-preview" style="margin-bottom: 5px;"></div>
        ${await BtnIcon.Render({
          class: 'wfa btn-map-engine-capture-thumbnail',
          label: html`<i class="fa-solid fa-camera"></i> Capture Thumbnail`,
        })}
        ${await BtnIcon.Render({
          class: 'wfa btn-map-engine-toggle-thumbnail',
          label: html`<i class="fa-solid fa-caret-right map-engine-thumbnail-caret"></i> Thumbnail`,
        })}
        <div class="in map-engine-thumbnail-body hide">
          ${await InputFile.Render(
            {
              id: idThumbnail,
              multiple: false,
              extensionsAccept: ['image/png', 'image/jpeg'],
            },
            {
              change: (e) => {
                const file = e.target.files[0];
                if (file) {
                  MapEngineCyberia.thumbnailDirty = true;
                  const url = URL.createObjectURL(file);
                  const preview = s('.map-engine-thumbnail-preview');
                  if (preview)
                    preview.innerHTML = html`<img
                      src="${url}"
                      class="in"
                      style="max-width:300px;height:auto;border:1px solid #555;margin:auto"
                    />`;
                }
              },
              clear: () => {
                MapEngineCyberia.thumbnailDirty = true;
                MapEngineCyberia.currentThumbnailId = null;
                const preview = s('.map-engine-thumbnail-preview');
                if (preview) preview.innerHTML = '';
              },
            },
          )}
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
        <div class="fl" style="justify-content: center; margin-bottom: 5px;">
          <div class="inl" style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
            ${await ToggleSwitch.Render({
              id: 'map-engine-show-grid',
              type: 'checkbox',
              displayMode: 'checkbox',
              containerClass: 'inl',
              checked: true,
              on: {
                checked: () => {
                  MapEngineCyberia.showGridBorders = true;
                  rerenderCanvas();
                },
                unchecked: () => {
                  MapEngineCyberia.showGridBorders = false;
                  rerenderCanvas();
                },
              },
            })}
            <span>Show Grid</span>
          </div>
        </div>
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
        <div class="in" style="margin: 10px;">
          ${await DropDown.Render({
            id: idObjLayerDropdown,
            label: html`Object Layers`,
            data: [],
            type: 'checkbox',
            containerClass: 'inl',
            excludeSelected: true,
            serviceProvider: async (q) => {
              const result = await ObjectLayerService.searchItemIds({ q });
              if (result.status === 'success' && result.data?.itemIds) {
                return result.data.itemIds.map((itemId) => ({
                  value: itemId,
                  display: itemId,
                  data: itemId,
                  onClick: () => {},
                }));
              }
              return [];
            },
          })}
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
