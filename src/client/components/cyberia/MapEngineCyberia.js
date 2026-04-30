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
import { getProxyPath } from '../core/Router.js';
import { ENTITY_TYPES, getDefaultCyberiaItemById } from '../cyberia-portal/CommonCyberiaPortal.js';
import '../core/ColorPaletteElement.js';

const DEFAULT_ENTITY_TYPE = ENTITY_TYPES.floor;
const dropdownValueKey = (value = '') => String(value).trim().replaceAll(' ', '-');
const createDropdownOption = (value, onClick = () => {}, display = value, data = value) => ({
  value,
  display,
  data,
  onClick,
});

class MapEngineCyberia {
  static entities = [];
  static currentMapId = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static loadMap = null;
  static showGridBorders = true;
  static addOnClick = true;
  static showObjectLayers = false;
  static enableRandomFactors = false;
  static captureObjLayerThumbnail = true;
  static imageCache = {};
  static entityUndoStack = [];
  static entityRedoStack = [];
  static maxEntityHistory = 200;
  static entityHistorySync = null;
  static entityHistoryHotkeyHandler = null;
  static entityTypeDropdownId = 'map-engine-entity-type';
  static objectLayerDropdownId = 'map-engine-obj-layer-dropdown';
  static objectLayerDropdownHostId = 'map-engine-obj-layer-dropdown-host';
  static renameSourceObjectLayerInputId = 'map-engine-rename-source-object-layer-item-id';
  static renameTargetObjectLayerInputId = 'map-engine-rename-target-object-layer-item-id';

  static getSelectedDropdownValue(dropdownId, fallback = '') {
    return DropDown.Tokens[dropdownId]?.value || s(`.${dropdownId}`)?.value || fallback;
  }

  static getSelectedEntityType() {
    return MapEngineCyberia.getSelectedDropdownValue(MapEngineCyberia.entityTypeDropdownId, DEFAULT_ENTITY_TYPE);
  }

  static getSelectedObjectLayerItemIds() {
    return DropDown.Tokens[MapEngineCyberia.objectLayerDropdownId]?.value
      ? [...DropDown.Tokens[MapEngineCyberia.objectLayerDropdownId].value]
      : [];
  }

  static getRenameObjectLayerItemIds() {
    return {
      source: s(`.${MapEngineCyberia.renameSourceObjectLayerInputId}`)?.value?.trim() || '',
      target: s(`.${MapEngineCyberia.renameTargetObjectLayerInputId}`)?.value?.trim() || '',
    };
  }

  static setDropdownValue(dropdownId, value) {
    if (!value || !DropDown.Tokens[dropdownId]) return;
    DropDown.Tokens[dropdownId].value = value;
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = value;
    htmls(`.dropdown-current-${dropdownId}`, value);
  }

  static getEntityTypeDropdownOptions() {
    return Object.values(ENTITY_TYPES).map((entityType) => createDropdownOption(entityType));
  }

  static syncObjectLayerDropdownSelection(itemIds = []) {
    const dropdownId = MapEngineCyberia.objectLayerDropdownId;
    if (!DropDown.Tokens[dropdownId]) return;

    DropDown.Tokens[dropdownId].oncheckvalues = {};
    for (const itemId of itemIds) {
      const key = dropdownValueKey(itemId);
      DropDown.Tokens[dropdownId].oncheckvalues[key] = {
        data: itemId,
        display: itemId,
        value: itemId,
      };
    }
    DropDown.Tokens[dropdownId].value = [...itemIds];
    if (s(`.${dropdownId}`)) s(`.${dropdownId}`).value = [...itemIds];
    DropDown.Tokens[dropdownId]._renderSelectedBadges?.();
  }

  static async buildObjectLayerDropdown() {
    return await DropDown.instance({
      id: MapEngineCyberia.objectLayerDropdownId,
      label: html`Object Layers`,
      data: [],
      type: 'checkbox',
      containerClass: 'inl',
      excludeSelected: true,
      serviceProvider: async (q) => {
        const result = await ObjectLayerService.searchItemIds({ q });
        if (result.status === 'success' && result.data?.itemIds) {
          return result.data.itemIds.map((itemId) => createDropdownOption(itemId));
        }
        return [];
      },
    });
  }

  static async renderObjectLayerDropdown({ selectedItemIds = [] } = {}) {
    const hostId = MapEngineCyberia.objectLayerDropdownHostId;
    if (!s(`.${hostId}`)) return;

    htmls(`.${hostId}`, await MapEngineCyberia.buildObjectLayerDropdown());
    MapEngineCyberia.syncObjectLayerDropdownSelection(selectedItemIds);
  }

  static renameFilteredObjectLayerItemId() {
    const { source, target } = MapEngineCyberia.getRenameObjectLayerItemIds();
    if (!source || !target) {
      NotificationManager.Push({
        html: 'Source and target ItemId are required.',
        status: 'error',
      });
      return false;
    }

    if (source === target) {
      NotificationManager.Push({
        html: 'Source and target ItemId must be different.',
        status: 'error',
      });
      return false;
    }

    const filtered = MapEngineCyberia.getFilteredEntities();
    if (!filtered.length) {
      NotificationManager.Push({
        html: 'No filtered entities available for ItemId rename.',
        status: 'error',
      });
      return false;
    }

    let matchedEntities = 0;
    let renamedReferences = 0;
    const changed = MapEngineCyberia.commitEntityMutation(() => {
      for (const { i } of filtered) {
        const entity = MapEngineCyberia.entities[i];
        if (!Array.isArray(entity?.objectLayerItemIds) || entity.objectLayerItemIds.length === 0) continue;

        let entityChanged = false;
        entity.objectLayerItemIds = entity.objectLayerItemIds.map((itemId) => {
          if (itemId !== source) return itemId;
          entityChanged = true;
          renamedReferences += 1;
          return target;
        });

        if (entityChanged) matchedEntities += 1;
      }
    });

    if (!changed) {
      NotificationManager.Push({
        html: `No exact ItemId matches for "${source}" were found in the current filtered entities.`,
        status: 'error',
      });
      return false;
    }

    NotificationManager.Push({
      html: `Renamed ${renamedReferences} object layer reference${renamedReferences === 1 ? '' : 's'} across ${matchedEntities} filtered entit${matchedEntities === 1 ? 'y' : 'ies'}.`,
      status: 'success',
    });
    return true;
  }

  static cloneEntity(entity) {
    return {
      ...entity,
      objectLayerItemIds: Array.isArray(entity?.objectLayerItemIds) ? [...entity.objectLayerItemIds] : [],
    };
  }

  static cloneEntities(entities = MapEngineCyberia.entities) {
    return (entities || []).map((entity) => MapEngineCyberia.cloneEntity(entity));
  }

  static entitySnapshotsEqual(left, right) {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;

    for (let i = 0; i < left.length; i++) {
      const a = left[i] || {};
      const b = right[i] || {};
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        const aValue = a[key];
        const bValue = b[key];

        if (Array.isArray(aValue) || Array.isArray(bValue)) {
          if (!Array.isArray(aValue) || !Array.isArray(bValue) || aValue.length !== bValue.length) return false;
          for (let j = 0; j < aValue.length; j++) {
            if (aValue[j] !== bValue[j]) return false;
          }
          continue;
        }

        if (aValue !== bValue) return false;
      }
    }

    return true;
  }

  static pushEntityHistory(stack, snapshot) {
    stack.push(snapshot);
    if (stack.length > MapEngineCyberia.maxEntityHistory) stack.shift();
  }

  static setEntityHistorySync(callback) {
    MapEngineCyberia.entityHistorySync = callback;
  }

  static preloadEntityObjectLayers(onLoad = null) {
    for (const entity of MapEngineCyberia.entities) {
      for (const itemId of entity.objectLayerItemIds || []) {
        MapEngineCyberia.loadObjectLayerImage(itemId, onLoad);
      }
    }
  }

  static refreshEntityEditor() {
    const callback = MapEngineCyberia.entityHistorySync;
    if (typeof callback !== 'function') return;
    MapEngineCyberia.preloadEntityObjectLayers(callback);
    callback();
  }

  static clearEntityHistory() {
    MapEngineCyberia.entityUndoStack.length = 0;
    MapEngineCyberia.entityRedoStack.length = 0;
  }

  static setEntities(entities, { clearHistory = false } = {}) {
    MapEngineCyberia.entities = MapEngineCyberia.cloneEntities(entities);
    if (clearHistory) MapEngineCyberia.clearEntityHistory();
    MapEngineCyberia.refreshEntityEditor();
  }

  static commitEntityMutation(mutate) {
    if (typeof mutate !== 'function') return false;

    const before = MapEngineCyberia.cloneEntities();
    mutate();
    const after = MapEngineCyberia.cloneEntities();

    if (MapEngineCyberia.entitySnapshotsEqual(before, after)) return false;

    MapEngineCyberia.pushEntityHistory(MapEngineCyberia.entityUndoStack, before);
    MapEngineCyberia.entityRedoStack.length = 0;
    MapEngineCyberia.refreshEntityEditor();
    return true;
  }

  static undoEntityMutation() {
    if (!MapEngineCyberia.entityUndoStack.length) return false;

    const previous = MapEngineCyberia.entityUndoStack.pop();
    MapEngineCyberia.pushEntityHistory(MapEngineCyberia.entityRedoStack, MapEngineCyberia.cloneEntities());
    MapEngineCyberia.setEntities(previous);
    return true;
  }

  static redoEntityMutation() {
    if (!MapEngineCyberia.entityRedoStack.length) return false;

    const next = MapEngineCyberia.entityRedoStack.pop();
    MapEngineCyberia.pushEntityHistory(MapEngineCyberia.entityUndoStack, MapEngineCyberia.cloneEntities());
    MapEngineCyberia.setEntities(next);
    return true;
  }

  static isEditableTarget(target) {
    if (!target) return false;
    const tagName = target.tagName?.toUpperCase();
    return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  static isEntityHistoryActive() {
    const container = s('.map-engine-container');
    return !!container && container.isConnected && container.getClientRects().length > 0;
  }

  static bindEntityHistoryHotkeys() {
    if (MapEngineCyberia.entityHistoryHotkeyHandler) {
      window.removeEventListener('keydown', MapEngineCyberia.entityHistoryHotkeyHandler);
    }

    MapEngineCyberia.entityHistoryHotkeyHandler = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !MapEngineCyberia.isEntityHistoryActive() ||
        MapEngineCyberia.isEditableTarget(event.target)
      ) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (event.key === 'z' || event.key === 'Z') {
        const handled = event.shiftKey ? MapEngineCyberia.redoEntityMutation() : MapEngineCyberia.undoEntityMutation();
        if (handled) event.preventDefault();
        return;
      }

      if (event.key === 'y' || event.key === 'Y') {
        if (MapEngineCyberia.redoEntityMutation()) event.preventDefault();
      }
    };

    window.addEventListener('keydown', MapEngineCyberia.entityHistoryHotkeyHandler);
  }

  static getEntityFilters() {
    return {
      filterType: s('.map-engine-filter-entity-type')?.value?.trim().toLowerCase() || '',
      filterX: s('.map-engine-filter-init-x')?.value?.trim() || '',
      filterY: s('.map-engine-filter-init-y')?.value?.trim() || '',
    };
  }

  static getFilteredEntities() {
    const { filterType, filterX, filterY } = MapEngineCyberia.getEntityFilters();

    return MapEngineCyberia.entities.reduce((acc, entity, i) => {
      if (filterType && !(entity.entityType || '').toLowerCase().includes(filterType)) return acc;
      if (filterX !== '' && String(entity.initCellX) !== filterX) return acc;
      if (filterY !== '' && String(entity.initCellY) !== filterY) return acc;
      acc.push({ entity, i });
      return acc;
    }, []);
  }

  static loadObjectLayerImage(itemId, onLoad) {
    if (MapEngineCyberia.imageCache[itemId]) return;
    MapEngineCyberia.imageCache[itemId] = { img: null, loaded: false, error: false };

    const loadImage = (type, id) => {
      const img = new Image();
      img.onload = () => {
        MapEngineCyberia.imageCache[itemId].img = img;
        MapEngineCyberia.imageCache[itemId].loaded = true;
        if (onLoad) onLoad();
      };
      img.onerror = () => {
        MapEngineCyberia.imageCache[itemId].error = true;
      };
      img.src = `${getProxyPath()}assets/${type}/${id}/08/0.png`;
    };

    const sharedItem = getDefaultCyberiaItemById(itemId)?.item;
    if (sharedItem?.type && sharedItem?.id) {
      loadImage(sharedItem.type, sharedItem.id);
      return;
    }

    ObjectLayerService.get({
      limit: 1,
      filterModel: { 'data.item.id': { filterType: 'text', type: 'equals', filter: itemId } },
    })
      .then((res) => {
        const doc = res?.data?.data?.[0];
        if (!doc || !doc.data?.item?.type || !doc.data?.item?.id) {
          MapEngineCyberia.imageCache[itemId].error = true;
          return;
        }
        const { type, id } = doc.data.item;
        loadImage(type, id);
      })
      .catch(() => {
        MapEngineCyberia.imageCache[itemId].error = true;
      });
  }

  static renderGrid(canvas, cols, rows, cellW, cellH, showGrid = true) {
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw entities
    for (const entity of MapEngineCyberia.entities) {
      const x = entity.initCellX * cellW;
      const y = entity.initCellY * cellH;
      const w = entity.dimX * cellW;
      const h = entity.dimY * cellH;

      if (MapEngineCyberia.showObjectLayers && entity.objectLayerItemIds?.length) {
        for (const itemId of entity.objectLayerItemIds) {
          const cached = MapEngineCyberia.imageCache[itemId];
          if (cached?.loaded && cached.img) {
            ctx.drawImage(cached.img, x, y, w, h);
          }
        }
      } else {
        ctx.fillStyle = entity.color;
        ctx.fillRect(x, y, w, h);
      }
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

  static renderToOffscreenCanvas(cols, rows, cellW, cellH, { forceObjectLayers = false } = {}) {
    const offscreen = document.createElement('canvas');
    offscreen.width = cols * cellW;
    offscreen.height = rows * cellH;
    const ctx = offscreen.getContext('2d');
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    const useObjectLayers = forceObjectLayers || MapEngineCyberia.showObjectLayers;
    for (const entity of MapEngineCyberia.entities) {
      const x = entity.initCellX * cellW;
      const y = entity.initCellY * cellH;
      const w = entity.dimX * cellW;
      const h = entity.dimY * cellH;

      if (useObjectLayers && entity.objectLayerItemIds?.length) {
        for (const itemId of entity.objectLayerItemIds) {
          const cached = MapEngineCyberia.imageCache[itemId];
          if (cached?.loaded && cached.img) {
            ctx.drawImage(cached.img, x, y, w, h);
          }
        }
      } else {
        ctx.fillStyle = entity.color;
        ctx.fillRect(x, y, w, h);
      }
    }
    return offscreen;
  }

  static renderEntityList(containerId) {
    const container = s(`.${containerId}`);
    if (!container) return;

    const filtered = MapEngineCyberia.getFilteredEntities();
    const counter = s('.map-engine-entity-filter-count');
    if (counter) {
      const total = MapEngineCyberia.entities.length;
      const visible = filtered.length;
      counter.innerHTML = `Showing ${visible} of ${total} entities`;
    }

    let html = '';
    filtered.forEach(({ entity, i }) => {
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
    if (!html)
      html = `<div style="color:#888;font-size:13px;">${MapEngineCyberia.entities.length > 0 ? 'No matching entities.' : 'No entities added yet.'}</div>`;
    htmls(`.${containerId}`, html);

    container.querySelectorAll('.btn-map-engine-remove-entity').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        MapEngineCyberia.commitEntityMutation(() => {
          MapEngineCyberia.entities.splice(idx, 1);
        });
      };
    });

    container.querySelectorAll('.btn-map-engine-load-entity-values').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index);
        const entity = MapEngineCyberia.entities[idx];
        if (!entity) return;

        const entityType = entity.entityType || DEFAULT_ENTITY_TYPE;
        const itemIds = entity.objectLayerItemIds || [];

        MapEngineCyberia.setDropdownValue(MapEngineCyberia.entityTypeDropdownId, entityType);
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

        MapEngineCyberia.syncObjectLayerDropdownSelection(itemIds);
      };
    });
  }

  static async render(options = {}) {
    const { appStore } = options;
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

    const idEntityType = MapEngineCyberia.entityTypeDropdownId;
    const idInitCellX = 'map-engine-init-cell-x';
    const idInitCellY = 'map-engine-init-cell-y';
    const idDimX = 'map-engine-dim-x';
    const idDimY = 'map-engine-dim-y';
    const idColor = 'map-engine-color';
    const idColorPalette = 'map-engine-color-palette';
    const idAlpha = 'map-engine-alpha';
    const idFactorA = 'map-engine-factor-a';
    const idFactorB = 'map-engine-factor-b';
    const idVariationPreserve = 'map-engine-variation-preserve';
    const rgbaDisplayId = 'map-engine-rgba-display';
    const entityListId = 'map-engine-entity-list';
    const idObjLayerDropdown = MapEngineCyberia.objectLayerDropdownId;
    const idObjLayerDropdownHost = MapEngineCyberia.objectLayerDropdownHostId;
    const idRenameSourceObjectLayer = MapEngineCyberia.renameSourceObjectLayerInputId;
    const idRenameTargetObjectLayer = MapEngineCyberia.renameTargetObjectLayerInputId;
    const managementId = 'modal-cyberia-map-engine';

    MapEngineCyberia.setEntities([], { clearHistory: true });
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

    const getFactorRange = () => {
      const rawA = parseFloat(s(`.${idFactorA}`)?.value);
      const rawB = parseFloat(s(`.${idFactorB}`)?.value);
      const safeA = Number.isFinite(rawA) ? rawA : 0.5;
      const safeB = Number.isFinite(rawB) ? rawB : 1.5;
      return {
        min: Math.min(safeA, safeB),
        max: Math.max(safeA, safeB),
      };
    };

    const getPreserveSet = () => {
      const preserveRaw = s(`.${idVariationPreserve}`)?.value || '';
      return new Set(
        preserveRaw
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t),
      );
    };

    const getPreserveIndices = () => {
      const preserveSet = getPreserveSet();
      return MapEngineCyberia.entities.reduce((acc, entity, index) => {
        if (preserveSet.has((entity.entityType || '').toLowerCase())) acc.push(index);
        return acc;
      }, []);
    };

    const getAffectedEntityCount = (total) => {
      if (total <= 0) return 0;
      if (!MapEngineCyberia.enableRandomFactors) return Math.max(1, Math.round(total / 2));

      const { min, max } = getFactorRange();
      const factor = min + Math.random() * (max - min);
      return Math.max(1, Math.min(total, Math.round(total * factor)));
    };

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
        entityType: MapEngineCyberia.getSelectedEntityType(),
        initCellX: parseInt(s(`.${idInitCellX}`)?.value) || 0,
        initCellY: parseInt(s(`.${idInitCellY}`)?.value) || 0,
        dimX: parseInt(s(`.${idDimX}`)?.value) || 1,
        dimY: parseInt(s(`.${idDimY}`)?.value) || 1,
        color: hexToRgba(hex, alpha),
      };
    };

    const applyRandomFactorsToDimensions = (ep) => {
      if (!MapEngineCyberia.enableRandomFactors) return;
      const { min, max } = getFactorRange();
      const factor = min + Math.random() * (max - min);
      ep.dimX = Math.max(1, Math.round(ep.dimX * factor));
      ep.dimY = Math.max(1, Math.round(ep.dimY * factor));
    };

    const addEntityLocally = () => {
      const ep = getEntityParams();
      ep.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];
      applyRandomFactorsToDimensions(ep);
      MapEngineCyberia.commitEntityMutation(() => {
        MapEngineCyberia.entities.push(ep);
      });
    };

    const fillMapWithEntity = () => {
      const ep = getEntityParams();
      ep.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];
      const { cols, rows } = getCanvasParams();
      const dimX = ep.dimX || 1;
      const dimY = ep.dimY || 1;
      MapEngineCyberia.commitEntityMutation(() => {
        for (let r = 0; r < rows; r += dimY) {
          for (let c = 0; c < cols; c += dimX) {
            const tile = {
              ...ep,
              initCellX: c,
              initCellY: r,
              objectLayerItemIds: [...ep.objectLayerItemIds],
            };
            applyRandomFactorsToDimensions(tile);
            MapEngineCyberia.entities.push(tile);
          }
        }
      });
    };

    const generateVariation = () => {
      const { min, max } = getFactorRange();
      const preserveSet = getPreserveSet();
      const { cols, rows } = getCanvasParams();
      MapEngineCyberia.commitEntityMutation(() => {
        for (const entity of MapEngineCyberia.entities) {
          if (preserveSet.has((entity.entityType || '').toLowerCase())) continue;
          const dimFactor = min + Math.random() * (max - min);
          entity.dimX = Math.max(1, Math.round(entity.dimX * dimFactor));
          entity.dimY = Math.max(1, Math.round(entity.dimY * dimFactor));
          const posFactor = min + Math.random() * (max - min);
          entity.initCellX = Math.max(0, Math.min(cols - 1, Math.round(entity.initCellX * posFactor)));
          entity.initCellY = Math.max(0, Math.min(rows - 1, Math.round(entity.initCellY * posFactor)));
        }
      });
    };

    const clearAllEntities = () => {
      MapEngineCyberia.commitEntityMutation(() => {
        MapEngineCyberia.entities = [];
      });
    };

    const randomSwapPreserveEntities = () => {
      const preserveIndices = getPreserveIndices();
      if (preserveIndices.length < 2) return;

      const selectedCount = getAffectedEntityCount(preserveIndices.length);
      const shuffled = [...preserveIndices].sort(() => Math.random() - 0.5).slice(0, selectedCount);
      const swapCount = Math.max(1, Math.floor(shuffled.length / 2));

      MapEngineCyberia.commitEntityMutation(() => {
        for (let i = 0; i < swapCount * 2; i += 2) {
          const firstIndex = shuffled[i];
          const secondIndex = shuffled[i + 1];
          if (firstIndex === undefined || secondIndex === undefined) continue;

          const first = MapEngineCyberia.entities[firstIndex];
          const second = MapEngineCyberia.entities[secondIndex];
          const firstPos = { initCellX: first.initCellX, initCellY: first.initCellY };

          first.initCellX = second.initCellX;
          first.initCellY = second.initCellY;
          second.initCellX = firstPos.initCellX;
          second.initCellY = firstPos.initCellY;
        }
      });
    };

    const replacePreserveEntitiesWithCurrentConfig = () => {
      const preserveIndices = getPreserveIndices();
      if (preserveIndices.length === 0) return;

      const selectedCount = getAffectedEntityCount(preserveIndices.length);
      const selected = [...preserveIndices].sort(() => Math.random() - 0.5).slice(0, selectedCount);
      const template = getEntityParams();
      template.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];

      MapEngineCyberia.commitEntityMutation(() => {
        for (const index of selected) {
          const target = MapEngineCyberia.entities[index];
          const replacement = {
            ...target,
            entityType: template.entityType,
            dimX: template.dimX,
            dimY: template.dimY,
            color: template.color,
            objectLayerItemIds: [...template.objectLayerItemIds],
          };
          applyRandomFactorsToDimensions(replacement);
          MapEngineCyberia.entities[index] = replacement;
        }
      });
    };

    const flipHorizontal = () => {
      const { cols } = getCanvasParams();
      MapEngineCyberia.commitEntityMutation(() => {
        for (const entity of MapEngineCyberia.entities) {
          entity.initCellX = cols - entity.initCellX - entity.dimX;
        }
      });
    };

    const flipVertical = () => {
      const { rows } = getCanvasParams();
      MapEngineCyberia.commitEntityMutation(() => {
        for (const entity of MapEngineCyberia.entities) {
          entity.initCellY = rows - entity.initCellY - entity.dimY;
        }
      });
    };

    const getMapPayload = () => {
      const tagsRaw = s(`.${idTags}`)?.value || '';
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      const { cols, rows, cellW, cellH } = getCanvasParams();
      const payload = {
        code: s(`.${idCode}`)?.value || '',
        name: s(`.${idName}`)?.value || '',
        description: s(`.${idDescription}`)?.value || '',
        tags,
        status: DropDown.Tokens[idStatus]?.value || 'unlisted',
        entities: MapEngineCyberia.entities,
        gridX: cols,
        gridY: rows,
        cellWidth: cellW,
        cellHeight: cellH,
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

      // Capture object layer thumbnail on save/update if checkbox is checked
      if (MapEngineCyberia.captureObjLayerThumbnail) {
        const { cols, rows, cellW, cellH } = getCanvasParams();
        const offscreen = MapEngineCyberia.renderToOffscreenCanvas(cols, rows, cellW, cellH, {
          forceObjectLayers: true,
        });
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
              ? Translate.instance('success-update-item')
              : Translate.instance('success-create-item'),
        status: result.status,
      });
      if (result.status === 'success') {
        if (result.data?._id) MapEngineCyberia.currentMapId = result.data._id;
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
    };

    const cloneMap = async () => {
      if (!MapEngineCyberia.currentMapId) return;

      let cloneThumbnailId = null;

      // When enabled, clone should use a fresh object-layer capture instead of reusing the current thumbnail file.
      if (MapEngineCyberia.captureObjLayerThumbnail) {
        const { cols, rows, cellW, cellH } = getCanvasParams();
        const offscreen = MapEngineCyberia.renderToOffscreenCanvas(cols, rows, cellW, cellH, {
          forceObjectLayers: true,
        });
        const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], 'map-thumbnail.png', { type: 'image/png' });
          const formData = new FormData();
          formData.append('file', file);
          const uploadResult = await FileService.post({ body: formData });
          if (uploadResult.status === 'success' && uploadResult.data?.length > 0) {
            cloneThumbnailId = uploadResult.data[0]._id;
          }
        }
      } else {
        const thumbnailInput = s(`.${idThumbnail}`);
        if (thumbnailInput && thumbnailInput.files && thumbnailInput.files.length > 0) {
          const formData = new FormData();
          formData.append('file', thumbnailInput.files[0]);
          const uploadResult = await FileService.post({ body: formData });
          if (uploadResult.status === 'success' && uploadResult.data && uploadResult.data.length > 0) {
            cloneThumbnailId = uploadResult.data[0]._id;
          } else {
            NotificationManager.Push({
              html: uploadResult.message || 'Failed to upload thumbnail',
              status: 'error',
            });
            return;
          }
        }
      }

      const body = getMapPayload();
      if (cloneThumbnailId) body.thumbnail = cloneThumbnailId;
      const result = await CyberiaMapService.post({ body });
      NotificationManager.Push({
        html: result.status === 'error' ? result.message : Translate.instance('success-create-item'),
        status: result.status,
      });
      if (result.status === 'success') {
        if (result.data?._id) MapEngineCyberia.currentMapId = result.data._id;
        if (cloneThumbnailId) MapEngineCyberia.currentThumbnailId = cloneThumbnailId;
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
    };

    const loadMap = async (mapData) => {
      MapEngineCyberia.currentMapId = mapData._id || null;
      if (s(`.${idCode}`)) s(`.${idCode}`).value = mapData.code || '';
      if (s(`.${idName}`)) s(`.${idName}`).value = mapData.name || '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = mapData.description || '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = (mapData.tags || []).join(', ');

      // Restore grid dimensions
      if (s(`.${idX}`)) s(`.${idX}`).value = mapData.gridX || 16;
      if (s(`.${idY}`)) s(`.${idY}`).value = mapData.gridY || 16;
      if (s(`.${idCellW}`)) s(`.${idCellW}`).value = mapData.cellWidth || 32;
      if (s(`.${idCellH}`)) s(`.${idCellH}`).value = mapData.cellHeight || 32;
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

      const nextEntities = (mapData.entities || []).map((e) => ({
        entityType: e.entityType,
        initCellX: e.initCellX,
        initCellY: e.initCellY,
        dimX: e.dimX,
        dimY: e.dimY,
        color: e.color,
        objectLayerItemIds: e.objectLayerItemIds || [],
      }));
      MapEngineCyberia.setEntities(nextEntities, { clearHistory: true });
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
      if (s(`.${idX}`)) s(`.${idX}`).value = 16;
      if (s(`.${idY}`)) s(`.${idY}`).value = 16;
      if (s(`.${idCellW}`)) s(`.${idCellW}`).value = 32;
      if (s(`.${idCellH}`)) s(`.${idCellH}`).value = 32;
      if (s(`.${idVariationPreserve}`)) s(`.${idVariationPreserve}`).value = '';
      if (s(`.${idRenameSourceObjectLayer}`)) s(`.${idRenameSourceObjectLayer}`).value = '';
      if (s(`.${idRenameTargetObjectLayer}`)) s(`.${idRenameTargetObjectLayer}`).value = '';
      MapEngineCyberia.setEntities([], { clearHistory: true });
      MapEngineCyberia.setDropdownValue(idEntityType, DEFAULT_ENTITY_TYPE);
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

      MapEngineCyberia.setEntityHistorySync(() => {
        MapEngineCyberia.renderEntityList(entityListId);
        rerenderCanvas();
      });
      MapEngineCyberia.bindEntityHistoryHotkeys();

      const syncPaletteFromColorInput = () => {
        const colorPalette = s(`.${idColorPalette}`);
        const hex = (s(`.${idColor}`)?.value || '#ff0000').toUpperCase();
        if (colorPalette && colorPalette.value !== hex) {
          colorPalette.value = hex;
        }
      };

      const updateRgbaDisplay = () => {
        const hex = s(`.${idColor}`)?.value || '#ff0000';
        const alpha = parseFloat(s(`.${idAlpha}`)?.value);
        const rgba = hexToRgba(hex, alpha);
        if (s(`.${rgbaDisplayId}`))
          htmls(
            `.${rgbaDisplayId}`,
            `<span style="display:inline-block;width:16px;height:16px;background:${rgba};border:1px solid #888;vertical-align:middle;margin-right:6px;"></span>${rgba}`,
          );
        syncPaletteFromColorInput();
      };

      if (s(`.${idColor}`)) s(`.${idColor}`).addEventListener('input', updateRgbaDisplay);
      if (s(`.${idAlpha}`)) s(`.${idAlpha}`).addEventListener('input', updateRgbaDisplay);
      if (s(`.${idColorPalette}`)) {
        s(`.${idColorPalette}`).addEventListener('colorchange', (event) => {
          const nextHex = (event.detail?.value || event.detail?.hex || '#ff0000').toLowerCase();
          if (s(`.${idColor}`) && s(`.${idColor}`).value !== nextHex) {
            s(`.${idColor}`).value = nextHex;
            s(`.${idColor}`).dispatchEvent(new Event('input'));
          }
        });
      }
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
      MapEngineCyberia.refreshEntityEditor();

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const { cellW, cellH } = getCanvasParams();
        const col = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / cellW);
        const row = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / cellH);
        console.log(`Cell clicked: (${col}, ${row})`);

        if (s('.map-engine-cell-coords')) htmls('.map-engine-cell-coords', `Cell: (${col}, ${row})`);

        if (s(`.${idInitCellX}`)) s(`.${idInitCellX}`).value = col;
        if (s(`.${idInitCellY}`)) s(`.${idInitCellY}`).value = row;

        if (MapEngineCyberia.addOnClick) addEntityLocally();
      };

      if (s(`.btn-map-engine-add-entity`)) s(`.btn-map-engine-add-entity`).onclick = () => addEntityLocally();

      if (s(`.btn-map-engine-fill-map`)) s(`.btn-map-engine-fill-map`).onclick = () => fillMapWithEntity();

      if (s(`.btn-map-engine-generate-variation`))
        s(`.btn-map-engine-generate-variation`).onclick = () => generateVariation();

      if (s(`.btn-map-engine-swap-preserve-entities`))
        s(`.btn-map-engine-swap-preserve-entities`).onclick = () => randomSwapPreserveEntities();

      if (s(`.btn-map-engine-replace-preserve-entities`))
        s(`.btn-map-engine-replace-preserve-entities`).onclick = () => replacePreserveEntitiesWithCurrentConfig();

      if (s(`.btn-map-engine-flip-horizontal`)) s(`.btn-map-engine-flip-horizontal`).onclick = () => flipHorizontal();

      if (s(`.btn-map-engine-flip-vertical`)) s(`.btn-map-engine-flip-vertical`).onclick = () => flipVertical();

      if (s(`.btn-map-engine-generate`))
        s(`.btn-map-engine-generate`).onclick = () => {
          rerenderCanvas();
        };

      if (s(`.btn-map-engine-save-map`)) s(`.btn-map-engine-save-map`).onclick = () => saveMap();

      if (s(`.btn-map-engine-clone-map`))
        s(`.btn-map-engine-clone-map`).onclick = () => {
          if (!MapEngineCyberia.currentMapId) return;
          cloneMap();
        };

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

      if (s('.btn-map-engine-toggle-entity-filter'))
        s('.btn-map-engine-toggle-entity-filter').onclick = () => {
          const body = s('.map-engine-entity-filter-body');
          const caret = s('.map-engine-entity-filter-caret');
          if (body) body.classList.toggle('hide');
          if (caret) {
            caret.classList.toggle('fa-caret-right');
            caret.classList.toggle('fa-caret-down');
          }
        };

      let entityFilterTimeout = null;
      const applyEntityFilter = () => {
        clearTimeout(entityFilterTimeout);
        entityFilterTimeout = setTimeout(() => {
          MapEngineCyberia.renderEntityList(entityListId);
        }, 300);
      };
      [idFilterEntityType, idFilterInitX, idFilterInitY].forEach((cls) => {
        if (s(`.${cls}`)) s(`.${cls}`).addEventListener('input', applyEntityFilter);
      });

      if (s('.btn-map-engine-clear-entity-filter'))
        s('.btn-map-engine-clear-entity-filter').onclick = () => {
          [idFilterEntityType, idFilterInitX, idFilterInitY].forEach((cls) => {
            if (s(`.${cls}`)) s(`.${cls}`).value = '';
          });
          MapEngineCyberia.renderEntityList(entityListId);
        };

      if (s('.btn-map-engine-clear-all-entities'))
        s('.btn-map-engine-clear-all-entities').onclick = () => clearAllEntities();

      if (s('.btn-map-engine-rename-filtered-object-layer-item-id'))
        s('.btn-map-engine-rename-filtered-object-layer-item-id').onclick = () => {
          MapEngineCyberia.renameFilteredObjectLayerItemId();
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
      appStore,
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
    const dcFactors = 'map-engine-dc-factors';
    const dcSaveNew = 'map-engine-dc-save-new';
    const dcEntityFilter = 'map-engine-dc-entity-filter';
    const dcCanvasOpts = 'map-engine-dc-canvas-opts';
    const idFilterEntityType = 'map-engine-filter-entity-type';
    const idFilterInitX = 'map-engine-filter-init-x';
    const idFilterInitY = 'map-engine-filter-init-y';

    return html`<div class="in section-mp map-engine-container">
      ${dynamicCol({ containerSelector: 'map-engine-container', id: dcMapFields, type: 'search-inputs' })}
      <div class="fl">
        <div class="in fll ${dcMapFields}-col-a">
          ${await Input.instance({
            id: idCode,
            label: html`Code`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMapFields}-col-b">
          ${await Input.instance({
            id: idName,
            label: html`Name`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMapFields}-col-c">
          ${await Input.instance({
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
          ${await Input.instance({
            id: idTags,
            label: html`Tags (comma separated)`,
            containerClass: 'inl',
            type: 'text',
          })}
        </div>
        <div class="in fll ${dcMetaFields}-col-b">
          ${await DropDown.instance({
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
        ${await BtnIcon.instance({
          class: 'wfa btn-map-engine-capture-thumbnail',
          label: html`<i class="fa-solid fa-camera"></i> Capture Thumbnail`,
        })}
        <div class="fl" style="align-items: center; gap: 8px; font-size: 20px; text-align: left; margin: 5px 0;">
          ${await ToggleSwitch.instance({
            id: 'map-engine-capture-obj-layer-thumb',
            type: 'checkbox',
            displayMode: 'checkbox',
            containerClass: 'in fll',
            checked: true,
            on: {
              checked: () => {
                MapEngineCyberia.captureObjLayerThumbnail = true;
              },
              unchecked: () => {
                MapEngineCyberia.captureObjLayerThumbnail = false;
              },
            },
          })}
          <div class="section-mp">&nbsp &nbsp Capture Object Layer Map Thumbnail on Save/Update/Clone</div>
        </div>
        ${await BtnIcon.instance({
          class: 'wfa btn-map-engine-toggle-thumbnail',
          label: html`<i class="fa-solid fa-caret-right map-engine-thumbnail-caret"></i> Thumbnail`,
        })}
        <div class="in map-engine-thumbnail-body hide">
          ${await InputFile.instance(
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
          ${await Input.instance({
            id: idX,
            label: html`X`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 16,
          })}
        </div>
        <div class="in fll ${dcGridSize}-col-b">
          ${await Input.instance({
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
          ${await Input.instance({
            id: idCellW,
            label: html`Cell Width (px)`,
            containerClass: 'inl',
            type: 'number',
            min: 1,
            value: 32,
          })}
        </div>
        <div class="in fll ${dcCellSize}-col-b">
          ${await Input.instance({
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
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-generate',
            label: html`<i class="fa-solid fa-arrows-rotate"></i> Generate`,
          })}
        </div>
      </div>
      <div class="in" style="text-align: center; margin-top: 10px;">
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcCanvasOpts, type: 'search-inputs' })}
        <div class="fl" style="margin-bottom: 5px;">
          <div class="in fll ${dcCanvasOpts}-col-a">
            <div class="fl" style="align-items: center; gap: 8px; font-size: 20px; text-align: left;">
              ${await ToggleSwitch.instance({
                id: 'map-engine-show-grid',
                type: 'checkbox',
                displayMode: 'checkbox',
                containerClass: 'in fll',
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
              <div class="section-mp">&nbsp &nbsp Show Grid</div>
            </div>
          </div>
          <div class="in fll ${dcCanvasOpts}-col-b">
            <div class="fl" style="align-items: center; gap: 8px; font-size: 20px; text-align: left;">
              ${await ToggleSwitch.instance({
                id: 'map-engine-add-on-click',
                type: 'checkbox',
                displayMode: 'checkbox',
                containerClass: 'in fll',
                checked: true,
                on: {
                  checked: () => {
                    MapEngineCyberia.addOnClick = true;
                  },
                  unchecked: () => {
                    MapEngineCyberia.addOnClick = false;
                  },
                },
              })}
              <div class="section-mp">&nbsp &nbsp Add on Click</div>
            </div>
          </div>
          <div class="in fll ${dcCanvasOpts}-col-c">
            <div class="fl" style="align-items: center; gap: 8px; font-size: 20px; text-align: left;">
              ${await ToggleSwitch.instance({
                id: 'map-engine-show-object-layers',
                type: 'checkbox',
                displayMode: 'checkbox',
                containerClass: 'in fll',
                checked: false,
                on: {
                  checked: () => {
                    MapEngineCyberia.showObjectLayers = true;
                    rerenderCanvas();
                  },
                  unchecked: () => {
                    MapEngineCyberia.showObjectLayers = false;
                    rerenderCanvas();
                  },
                },
              })}
              <div class="section-mp">&nbsp &nbsp Object Layers</div>
            </div>
          </div>
        </div>
        <canvas class="${canvasId}" width="512" height="512" style="border: 1px solid #555;"></canvas>
        <div class="in map-engine-cell-coords" style="font-family:monospace;font-size:13px;color:#888;margin-top:4px;">
          Cell: (0, 0)
        </div>
      </div>
      <div class="in section-mp" style="margin-top: 10px;">
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcEntityType, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcEntityType}-col-a">
            ${await DropDown.instance({
              id: idEntityType,
              label: html`Entity Type`,
              data: MapEngineCyberia.getEntityTypeDropdownOptions(),
              value: DEFAULT_ENTITY_TYPE,
              containerClass: 'inl',
            })}
          </div>
          <div class="in fll ${dcEntityType}-col-b">
            ${await Input.instance({
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
        <div class="in section-mp-border" style="margin-top: 10px;">
          <div class="in input-label">Color Palette</div>
          <color-palette class="${idColorPalette}" value="#FF0000"></color-palette>
        </div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcCellPos, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcCellPos}-col-a">
            ${await Input.instance({
              id: idInitCellX,
              label: html`initCellX`,
              containerClass: 'inl',
              type: 'number',
              min: 0,
              value: 0,
            })}
          </div>
          <div class="in fll ${dcCellPos}-col-b">
            ${await Input.instance({
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
            ${await Input.instance({
              id: idDimX,
              label: html`dimX`,
              containerClass: 'inl',
              type: 'number',
              min: 1,
              value: 1,
            })}
          </div>
          <div class="in fll ${dcDim}-col-b">
            ${await Input.instance({
              id: idDimY,
              label: html`dimY`,
              containerClass: 'inl',
              type: 'number',
              min: 1,
              value: 1,
            })}
          </div>
        </div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcFactors, type: 'a-50-b-50' })}
        <div class="fl">
          <div class="in fll ${dcFactors}-col-a">
            ${await Input.instance({
              id: idFactorA,
              label: html`factorA`,
              containerClass: 'inl',
              type: 'number',
              step: 0.01,
              value: 0.5,
            })}
          </div>
          <div class="in fll ${dcFactors}-col-b">
            ${await Input.instance({
              id: idFactorB,
              label: html`factorB`,
              containerClass: 'inl',
              type: 'number',
              step: 0.01,
              value: 1.5,
            })}
          </div>
        </div>
        ${await Input.instance({
          id: idVariationPreserve,
          label: html`Variation Preserve List`,
          containerClass: 'inl',
          type: 'text',
          placeholder: true,
        })}
        <div class="fl" style="align-items: center; gap: 8px; font-size: 20px; text-align: left; margin: 5px 0;">
          ${await ToggleSwitch.instance({
            id: 'map-engine-random-dim',
            type: 'checkbox',
            displayMode: 'checkbox',
            containerClass: 'in fll',
            checked: false,
            on: {
              checked: () => {
                MapEngineCyberia.enableRandomFactors = true;
              },
              unchecked: () => {
                MapEngineCyberia.enableRandomFactors = false;
              },
            },
          })}
          <div class="section-mp">&nbsp &nbsp Enable Random Factors</div>
        </div>
        <div class="in" style="margin: 10px;">
          <div class="${idObjLayerDropdownHost}">${await MapEngineCyberia.buildObjectLayerDropdown()}</div>
        </div>
        <div class="in section-mp-border" style="margin: 10px; padding: 10px;">
          <div class="in input-label">Rename Object Layer ItemId on Filtered Entities</div>
          <div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
            Replaces only exact source ItemId matches inside entities currently visible through the filters.
          </div>
          <div class="fl">
            <div class="in fll" style="flex:1;padding-right:5px;">
              ${await Input.instance({
                id: idRenameSourceObjectLayer,
                label: html`Source ItemId`,
                containerClass: 'inl',
                type: 'text',
                placeholder: true,
              })}
            </div>
            <div class="in fll" style="flex:1;padding-left:5px;">
              ${await Input.instance({
                id: idRenameTargetObjectLayer,
                label: html`Target ItemId`,
                containerClass: 'inl',
                type: 'text',
                placeholder: true,
              })}
            </div>
          </div>
          <div class="in" style="margin-top: 5px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-map-engine-rename-filtered-object-layer-item-id',
              label: html`<i class="fa-solid fa-arrow-right-arrow-left"></i> Rename Filtered ItemId`,
            })}
          </div>
        </div>
        <div class="in">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-add-entity',
            label: html`<i class="fa-solid fa-plus"></i> Add Entity`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-fill-map',
            label: html`<i class="fa-solid fa-fill-drip"></i> Map Fill`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-generate-variation',
            label: html`<i class="fa-solid fa-shuffle"></i> Generate Variation`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-swap-preserve-entities',
            label: html`<i class="fa-solid fa-arrows-rotate"></i> Swap Preserve Positions`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-replace-preserve-entities',
            label: html`<i class="fa-solid fa-wand-magic-sparkles"></i> Replace Preserve Entities`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-flip-horizontal',
            label: html`<i class="fa-solid fa-arrows-left-right"></i> Flip Horizontal`,
          })}
        </div>
        <div class="in" style="margin-top: 5px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-flip-vertical',
            label: html`<i class="fa-solid fa-arrows-up-down"></i> Flip Vertical`,
          })}
        </div>
        <div class="in" style="margin-top: 10px;">
          ${await BtnIcon.instance({
            class: 'wfa btn-map-engine-toggle-entity-filter',
            label: html`<i class="fa-solid fa-caret-right map-engine-entity-filter-caret"></i> Filters`,
          })}
          <div class="in map-engine-entity-filter-body hide">
            ${dynamicCol({ containerSelector: 'map-engine-container', id: dcEntityFilter, type: 'search-inputs' })}
            <div class="fl">
              <div class="in fll ${dcEntityFilter}-col-a">
                ${await Input.instance({
                  id: idFilterEntityType,
                  label: html`Entity Type`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
              <div class="in fll ${dcEntityFilter}-col-b">
                ${await Input.instance({
                  id: idFilterInitX,
                  label: html`initCellX`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
              <div class="in fll ${dcEntityFilter}-col-c">
                ${await Input.instance({
                  id: idFilterInitY,
                  label: html`initCellY`,
                  containerClass: 'inl',
                  type: 'text',
                  placeholder: true,
                })}
              </div>
            </div>
            <div
              class="in map-engine-entity-filter-count"
              style="margin-top:5px;font-size:12px;color:#888;font-family:monospace;"
            >
              Showing 0 of 0 entities
            </div>
            <div class="in" style="margin-top:5px;">
              ${await BtnIcon.instance({
                class: 'wfa btn-map-engine-clear-entity-filter',
                label: html`<i class="fa-solid fa-broom"></i> Clear Filters`,
              })}
            </div>
            <div class="in" style="margin-top:5px;">
              ${await BtnIcon.instance({
                class: 'wfa btn-map-engine-clear-all-entities',
                label: html`<i class="fa-solid fa-trash-can"></i> Delete All Entities`,
              })}
            </div>
          </div>
        </div>
        <div class="in ${entityListId}" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
        ${dynamicCol({ containerSelector: 'map-engine-container', id: dcSaveNew, type: 'search-inputs' })}
        <div class="fl" style="margin-top: 10px;">
          <div class="in fll ${dcSaveNew}-col-a" style="padding: 5px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-map-engine-save-map',
              label: html`<i class="fa-solid fa-floppy-disk"></i> Save Map`,
            })}
          </div>
          <div class="in fll ${dcSaveNew}-col-b" style="padding: 5px;">
            ${await BtnIcon.instance({
              class: 'wfa btn-map-engine-clone-map',
              label: html`<i class="fa-solid fa-clone"></i> Clone Map`,
            })}
          </div>
          <div class="in fll ${dcSaveNew}-col-c" style="padding: 5px;">
            ${await BtnIcon.instance({
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
