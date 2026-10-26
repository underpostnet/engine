import { BtnIcon } from '../core/BtnIcon.js';
import { Input, InputFile, getFileFromBlobEndpoint } from '../core/Input.js';
import { htmls, s } from '../core/VanillaJs.js';
import Sortable from 'sortablejs';
import { commonModeratorGuard } from '../core/CommonJs.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Modal } from '../core/Modal.js';
import { dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { CyberiaMapManagement } from '../../services/cyberia-map/cyberia-map.management.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { FileService } from '../../services/file/file.service.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { getQueryParams, listenQueryParamsChange, setQueryParams } from '../core/Router.js';
import {
  ENTITY_TYPES,
  ENTITY_LEVEL_MIN,
  ENTITY_LEVEL_MAX,
  RESPAWN_DURATION_MS_DEFAULT,
  RESPAWN_DURATION_MS_MIN,
  validateEntityLevel,
  validateRespawnDuration,
} from './SharedDefaultsCyberia.js';
import { CommandHistory } from '../core/CommandHistory.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorDraftStore } from '../core/EditorDraftStore.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Tabs } from '../core/Tabs.js';
import { MapStudioCyberia } from './MapStudioCyberia.js';
import { ProceduralEngineCyberia } from './ProceduralEngineCyberia.js';
import { CyberiaProceduralPopulationService } from '../../services/cyberia-procedural-population/cyberia-procedural-population.service.js';
import { MapAudioCyberia } from './MapAudioCyberia.js';
import { animationPace, drawEntities, mapMediaLabel } from './MapPlacementCyberia.js';
import '../core/ColorPaletteElement.js';

const DEFAULT_ENTITY_TYPE = ENTITY_TYPES.floor;
const DEFAULT_MAP_DIMENSIONS = Object.freeze({
  gridX: 64,
  gridY: 64,
  cellWidth: 10,
  cellHeight: 10,
});
const dropdownValueKey = (value = '') => String(value).trim().replaceAll(' ', '-');
const createDropdownOption = (value, onClick = () => {}, display = value, data = value) => ({
  value,
  display,
  data,
  onClick,
});

/** The text color of each tone of the map media state. */
const MEDIA_TONE_COLORS = Object.freeze({ good: '#6c6', pending: '#c90', bad: '#d66', muted: '#888' });

class MapEngineCyberia {
  static entities = [];
  // The entity the form adds, under the pointer: `{ col, row, dimX, dimY, color }`, or null.
  static ghost = null;
  static currentMapId = null;
  static currentMapCode = null;
  static currentThumbnailId = null;
  static thumbnailDirty = false;
  static currentPreviewId = null;
  // The media of the stored map: the state of the preview the server draws for a revision.
  static currentMedia = null;
  // The custom thumbnail chosen and not saved yet, as an object URL.
  static pendingThumbnailUrl = null;
  // The picture of the map the editor holds, while no stored preview shows its revision: an object
  // URL, `empty` when it draws nothing, or null before its first draw.
  static draftPreview = null;
  // The newest draft draw: an older answer never replaces a newer one.
  static draftRequest = 0;
  static draftTimer = null;
  static mediaTimer = null;
  // The grid sides the editor holds: `{ gridX, gridY }`.
  static draftGrid = null;
  /** The most reads of a pending preview before the Studio stops following it. */
  static MEDIA_READS = 40;
  static loadMap = null;
  static crud = null;
  static showGridBorders = true;
  static addOnClick = true;
  static removeOnClick = false;
  static showObjectLayers = false;
  static enableRandomFactors = false;
  // One named command per finished edit of the entities.
  static history = new CommandHistory({ limit: 200 });
  // The revision of the stored map the editor loaded; a save names it.
  static currentRevision = null;
  /** The map population whose draft the editor composes: `{ id, mapCode, revision, baseRevision, previewKeys, missing, items }`; null on the live map. */
  static population = null;
  /** The binding each item id of the live map runs, `{ cid, hasRender }`, or null for an unbound one. */
  static bindings = new Map();
  /** The next frame of an animated canvas. */
  static frameTimer = null;
  // Called after each command, undo and redo: the editor keeps its draft there.
  static onCommand = () => {};
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

  /** Comma-separated ItemIds as typed, in order, blanks removed. Duplicates are the caller's to judge. */
  static parseItemIdList(value = '') {
    return String(value)
      .split(',')
      .map((itemId) => itemId.trim())
      .filter((itemId) => itemId);
  }

  static getRenameObjectLayerItemIds() {
    return {
      source: s(`.${MapEngineCyberia.renameSourceObjectLayerInputId}`)?.value?.trim() || '',
      target: s(`.${MapEngineCyberia.renameTargetObjectLayerInputId}`)?.value?.trim() || '',
    };
  }

  /**
   * source ItemId → the ItemIds that replace it, or the reason the lists cannot be paired.
   *
   * Three shapes, each unambiguous on its own:
   *   - one source, many targets — the source expands into all of them, so a layer can be split
   *     into a skin plus a weapon in one pass;
   *   - one target, many sources — every source collapses onto it;
   *   - equal counts — paired off in the order they were typed.
   * Any other combination is a typo worth refusing: pairing a short list by position would
   * rewrite some entities and silently leave the rest.
   *
   * @returns {{map?: Map<string,string[]>, error?: string}}
   */
  static buildRenameItemIdMap() {
    const { source, target } = MapEngineCyberia.getRenameObjectLayerItemIds();
    const sources = MapEngineCyberia.parseItemIdList(source);
    const targets = MapEngineCyberia.parseItemIdList(target);
    if (!sources.length || !targets.length) return { error: 'Source and target ItemId are required.' };

    const repeated = sources.filter((itemId, index) => sources.indexOf(itemId) !== index);
    if (repeated.length) {
      return { error: `Each source ItemId may appear once: "${[...new Set(repeated)].join('", "')}" is repeated.` };
    }
    if (sources.length > 1 && targets.length > 1 && targets.length !== sources.length) {
      return {
        error: `${sources.length} sources take one target for all of them, or ${sources.length} paired in order — got ${targets.length}. A list of targets replaces a single source.`,
      };
    }

    const replacement = (index) =>
      sources.length === 1 || targets.length === 1 ? [...new Set(targets)] : [targets[index]];
    const map = new Map(sources.map((itemId, index) => [itemId, replacement(index)]));
    // A source that expands into a list containing itself is keeping its layer and gaining
    // others, which is the point. Only a replacement that is the source alone does nothing.
    const unchanged = [...map].filter(([from, to]) => to.length === 1 && to[0] === from).map(([from]) => from);
    if (unchanged.length) {
      return { error: `Source and target ItemId must differ: "${unchanged.join('", "')}".` };
    }
    return { map };
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
        const drafted = (MapEngineCyberia.population?.items ?? [])
          .filter(({ itemId }) => itemId.includes(q))
          .map(({ itemId }) => createDropdownOption(itemId));
        const result = await ObjectLayerService.searchItemIds({ q });
        if (result.status === 'success' && result.data?.items)
          return [...drafted, ...result.data.items.map(({ id }) => createDropdownOption(id))];
        return drafted;
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
    const { map: renames, error } = MapEngineCyberia.buildRenameItemIdMap();
    if (error) {
      NotificationManager.Push({ html: error, status: 'error' });
      return false;
    }
    const sourceList = [...renames.keys()].join('", "');

    const filtered = MapEngineCyberia.getFilteredEntities();
    if (!filtered.length) {
      NotificationManager.Push({
        html: 'No filtered entities available for ItemId rename.',
        status: 'error',
      });
      return false;
    }

    // Exact ItemId equality, never a prefix or a case fold: this rewrites map documents, and a
    // near-miss would rename an entity nobody asked about.
    const eligible = [];
    for (const { i } of filtered) {
      const entity = MapEngineCyberia.entities[i];
      if (Array.isArray(entity?.objectLayerItemIds) && entity.objectLayerItemIds.some((id) => renames.has(id))) {
        eligible.push(i);
      }
    }

    if (!eligible.length) {
      NotificationManager.Push({
        html: `No exact ItemId matches for "${sourceList}" were found in the current filtered entities.`,
        status: 'error',
      });
      return false;
    }

    // When enableRandomFactors is active, each matching entity independently rolls
    // a random probability check in [fMin, fMax]. If the roll passes, it gets renamed;
    // otherwise it stays unchanged. This produces an intermediate intensity between
    // "almost everyone" (factors near/above 1.0) and "almost no one" (factors near 0).
    // The roll is per entity, not per ItemId: an entity carrying several sources takes all of
    // its renames or none, so a partly-renamed loadout is never produced.
    let matchedEntities = 0;
    let renamedReferences = 0;
    const changed = MapEngineCyberia.commitEntityMutation('RenameItemIds', () => {
      for (const i of eligible) {
        if (MapEngineCyberia.enableRandomFactors) {
          const rawA = parseFloat(s('.map-engine-factor-a')?.value);
          const rawB = parseFloat(s('.map-engine-factor-b')?.value);
          const minF = Number.isFinite(rawA) ? rawA : 0.5;
          const maxF = Number.isFinite(rawB) ? rawB : 1.5;
          const fMin = Math.min(minF, maxF);
          const fMax = Math.max(minF, maxF);
          const roll = fMin + Math.random() * (fMax - fMin);
          // If the roll is >= 1.0, always rename; otherwise compare against Math.random()
          if (roll < 1.0 && Math.random() > roll) continue;
        }
        const entity = MapEngineCyberia.entities[i];
        const previous = entity.objectLayerItemIds;
        let replaced = 0;
        const expanded = previous.flatMap((itemId) => {
          if (!renames.has(itemId)) return [itemId];
          replaced += 1;
          return renames.get(itemId);
        });
        // A replacement the entity already carries must not be added twice: an ItemId appearing
        // once is what every reader of a loadout assumes.
        const next = [...new Set(expanded)];
        if (next.length === previous.length && next.every((itemId, index) => itemId === previous[index])) continue;
        entity.objectLayerItemIds = next;
        renamedReferences += replaced;
        matchedEntities += 1;
      }
    });

    if (!changed) {
      NotificationManager.Push({
        html: MapEngineCyberia.enableRandomFactors
          ? `Random factors skipped all ${eligible.length} matching entit${eligible.length === 1 ? 'y' : 'ies'} — raise the factors or turn them off.`
          : `All ${eligible.length} entit${eligible.length === 1 ? 'y' : 'ies'} matching "${sourceList}" already carry the target ItemIds.`,
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

  static setEntityHistorySync(callback) {
    MapEngineCyberia.entityHistorySync = callback;
  }

  /**
   * The CID that draws an item: the one a population draft would publish it with, else its binding
   * when it has a render; null when nothing draws it, undefined while the binding loads.
   */
  static cidOf = (itemId) => {
    if (MapEngineCyberia.population) return MapEngineCyberia.population.previewKeys[itemId] ?? null;
    const binding = MapEngineCyberia.bindings.get(itemId);
    return binding === undefined ? undefined : binding?.hasRender ? binding.cid : null;
  };

  /** Why nothing draws an item: the reason of the population draft, else its binding. */
  static missingOf = (itemId) => {
    if (MapEngineCyberia.population)
      return MapEngineCyberia.population.missing.find((entry) => entry.itemId === itemId)?.reason ?? 'No artwork';
    return MapEngineCyberia.bindings.get(itemId)
      ? `${itemId} runs a definition with no render`
      : `No definition is bound to ${itemId}`;
  };

  /** The sprite of an item, or why it has none; undefined while it loads. */
  static spriteOf = (itemId) => {
    const cid = MapEngineCyberia.cidOf(itemId);
    if (cid === undefined) return undefined;
    if (cid === null) return { missing: MapEngineCyberia.missingOf(itemId) };
    return AtlasSpriteSheetService.sprite(cid);
  };

  /** Reads the binding of each item of the live map it does not know, then the sprite of each item. */
  static async preloadEntityObjectLayers(onLoad = null) {
    const itemIds = [...new Set(MapEngineCyberia.entities.flatMap((entity) => entity.objectLayerItemIds || []))];
    const unknown = MapEngineCyberia.population
      ? []
      : itemIds.filter((itemId) => !MapEngineCyberia.bindings.has(itemId));
    if (unknown.length > 0) {
      const response = await CyberiaItemCatalogService.resolve({ itemIds: unknown });
      for (const itemId of unknown)
        MapEngineCyberia.bindings.set(itemId, response.status === 'success' ? response.data[itemId] : null);
      onLoad?.();
    }
    await AtlasSpriteSheetService.preloadSprites(itemIds.map(MapEngineCyberia.cidOf).filter(Boolean), onLoad);
  }

  static refreshEntityEditor() {
    MapEngineCyberia.scheduleDraftPreview();
    const callback = MapEngineCyberia.entityHistorySync;
    if (typeof callback !== 'function') return;
    MapEngineCyberia.preloadEntityObjectLayers(callback);
    callback();
  }

  static clearEntityHistory() {
    MapEngineCyberia.history.clear();
  }

  static setEntities(entities, { clearHistory = false } = {}) {
    MapEngineCyberia.entities = MapEngineCyberia.cloneEntities(entities);
    if (clearHistory) MapEngineCyberia.clearEntityHistory();
    MapEngineCyberia.refreshEntityEditor();
  }

  /**
   * Runs one named command over the entities: one undo step when it changes them.
   * @param {string} name - Such as `PlaceEntity` or `BatchPlace`.
   * @param {() => void} mutate - Changes `MapEngineCyberia.entities`.
   * @returns {boolean} Whether the entities changed.
   */
  static commitEntityMutation(name, mutate) {
    const before = MapEngineCyberia.cloneEntities();
    mutate();
    const after = MapEngineCyberia.cloneEntities();

    if (MapEngineCyberia.entitySnapshotsEqual(before, after)) return false;

    MapEngineCyberia.history.record(name, before, after);
    MapEngineCyberia.refreshEntityEditor();
    MapEngineCyberia.onCommand();
    return true;
  }

  static undoEntityMutation() {
    const command = MapEngineCyberia.history.undo();
    if (command) {
      MapEngineCyberia.setEntities(command.before);
      MapEngineCyberia.onCommand();
    }
    return !!command;
  }

  static redoEntityMutation() {
    const command = MapEngineCyberia.history.redo();
    if (command) {
      MapEngineCyberia.setEntities(command.after);
      MapEngineCyberia.onCommand();
    }
    return !!command;
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
      filterItemIds: MapEngineCyberia.parseItemIdList(s('.map-engine-filter-object-layer-item-ids')?.value || ''),
    };
  }

  static getFilteredEntities() {
    const { filterType, filterX, filterY, filterItemIds } = MapEngineCyberia.getEntityFilters();

    return MapEngineCyberia.entities.reduce((acc, entity, i) => {
      if (filterType && !(entity.entityType || '').toLowerCase().includes(filterType)) return acc;
      if (filterX !== '' && String(entity.initCellX) !== filterX) return acc;
      if (filterY !== '' && String(entity.initCellY) !== filterY) return acc;
      // Every listed id, matched exactly: the list narrows the selection like the other filters,
      // so naming a second id picks out the entities carrying that combination rather than
      // widening the set. What this selects is exactly what the rename will act on.
      if (filterItemIds.length) {
        const carried = entity.objectLayerItemIds || [];
        if (!filterItemIds.every((itemId) => carried.includes(itemId))) return acc;
      }
      acc.push({ entity, i });
      return acc;
    }, []);
  }

  static renderGrid(canvas, cols, rows, cellW, cellH, showGrid = true) {
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawEntities(ctx, MapEngineCyberia.entities, {
      cellW,
      cellH,
      objectLayers: MapEngineCyberia.showObjectLayers,
      spriteOf: MapEngineCyberia.spriteOf,
      now: performance.now(),
    });

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

    const ghost = MapEngineCyberia.ghost;
    if (ghost) {
      const [x, y, w, h] = [ghost.col * cellW, ghost.row * cellH, ghost.dimX * cellW, ghost.dimY * cellH];
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ghost.color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#ffcc00';
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    }

    clearTimeout(MapEngineCyberia.frameTimer);
    const pace =
      MapEngineCyberia.showObjectLayers && animationPace(MapEngineCyberia.entities, MapEngineCyberia.spriteOf);
    if (pace)
      MapEngineCyberia.frameTimer = setTimeout(() => {
        if (canvas.isConnected && canvas.offsetParent)
          MapEngineCyberia.renderGrid(canvas, cols, rows, cellW, cellH, showGrid);
      }, pace);
  }

  static renderToOffscreenCanvas(cols, rows, cellW, cellH, { forceObjectLayers = false } = {}) {
    const offscreen = document.createElement('canvas');
    offscreen.width = cols * cellW;
    offscreen.height = rows * cellH;
    const ctx = offscreen.getContext('2d');
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    drawEntities(ctx, MapEngineCyberia.entities, {
      cellW,
      cellH,
      objectLayers: forceObjectLayers || MapEngineCyberia.showObjectLayers,
      spriteOf: MapEngineCyberia.spriteOf,
    });
    return offscreen;
  }

  /** Moves the entity the list shows at position `from` to the stored index of the one shown at `to`. */
  static moveEntity(from, to) {
    const shown = MapEngineCyberia.getFilteredEntities().map(({ i }) => i);
    if (from === to || shown[from] === undefined || shown[to] === undefined) return false;
    return MapEngineCyberia.commitEntityMutation('ReorderEntity', () => {
      const [entity] = MapEngineCyberia.entities.splice(shown[from], 1);
      MapEngineCyberia.entities.splice(shown[to], 0, entity);
    });
  }

  /** Exchanges the entities stored at indexes `a` and `b`; each index keeps its place in the array. */
  static swapEntities(a, b) {
    const { length } = MapEngineCyberia.entities;
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < length;
    if (!valid(a) || !valid(b) || a === b) {
      NotificationManager.Push({
        html: `Enter two different entity indexes between 0 and ${length - 1}.`,
        status: 'error',
      });
      return false;
    }
    return MapEngineCyberia.commitEntityMutation('SwapEntities', () => {
      const { entities } = MapEngineCyberia;
      [entities[a], entities[b]] = [entities[b], entities[a]];
    });
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
              style="background:var(--studio-tag);color:var(--studio-tag-ink);border-radius:4px;font-size:11px;height:auto;min-width:auto;margin:1px 2px;"
            >
              <div class="badge-text"><i class="fa-solid fa-tag" style="margin-right:3px;font-size:9px;"></i>${id}</div>
            </div>`,
        )
        .join('');
      html += html`<div
        class="fl"
        style="border-bottom:1px solid var(--studio-subtle-border); padding:4px 0; align-items:center;"
      >
        <button
          type="button"
          class="map-engine-entity-handle"
          aria-label="Move entity ${i}"
          title="Drag, or press the up and down arrows, to move"
        >
          <i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>${i}
        </button>
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

    container.querySelectorAll('.map-engine-entity-handle').forEach((handle, position) => {
      handle.onkeydown = (event) => {
        const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
        if (!step) return;
        event.preventDefault();
        if (MapEngineCyberia.moveEntity(position, position + step))
          container.querySelectorAll('.map-engine-entity-handle')[position + step]?.focus();
      };
    });

    container.querySelectorAll('.btn-map-engine-remove-entity').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        MapEngineCyberia.commitEntityMutation('DeleteEntity', () => {
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
        if (s('.map-engine-level')) s('.map-engine-level').value = entity.level ?? '';
        if (s('.map-engine-respawn-duration'))
          s('.map-engine-respawn-duration').value = entity.respawnDurationMs ?? RESPAWN_DURATION_MS_DEFAULT;
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
        Tabs.select(s('.map-engine-tabs'), 'paint');
      };
    });
  }

  /** Whether the stored preview shows the revision the map is at. */
  static storedPreviewReady() {
    const { currentMapId, currentMedia, currentRevision } = MapEngineCyberia;
    return Boolean(currentMapId && currentMedia?.status === 'ready' && currentMedia.revision === currentRevision);
  }

  /**
   * The thumbnail the map shows, its custom image or else its preview, and the state of that preview.
   * Until a stored preview shows the revision, the picture of the map the editor holds stands in.
   */
  static renderMedia() {
    const panel = s('.map-engine-media');
    if (!panel) return;
    const { currentThumbnailId, pendingThumbnailUrl, currentPreviewId, currentMedia, currentRevision, currentMapId } =
      MapEngineCyberia;
    const blob = (ref) => getApiBaseUrl({ id: typeof ref === 'object' ? ref._id : ref, endpoint: 'file/blob' });
    const custom = pendingThumbnailUrl ?? (currentThumbnailId ? blob(currentThumbnailId) : null);
    const media = mapMediaLabel(currentMedia, currentRevision);
    const stored = MapEngineCyberia.storedPreviewReady();
    const { draftPreview } = MapEngineCyberia;
    const figure = (src, caption) =>
      html`<figure class="map-engine-media-figure">
        <img src="${src}" alt="${caption}" onerror="this.style.display='none';" />
        <figcaption>${caption}</figcaption>
      </figure>`;
    const picture = stored
      ? currentPreviewId
        ? figure(blob(currentPreviewId), custom ? 'Map preview' : 'Thumbnail · map preview')
        : html`<div class="map-engine-media-empty">Empty map: place entities to draw its preview.</div>`
      : draftPreview === 'empty'
        ? html`<div class="map-engine-media-empty">Empty map: place entities to draw its preview.</div>`
        : draftPreview
          ? figure(draftPreview, 'Draft preview · not stored')
          : html`<div class="map-engine-media-empty">Drawing the draft preview…</div>`;
    panel.innerHTML = html`<div class="map-engine-media-figures">
        ${custom ? figure(custom, 'Thumbnail · custom image') : ''} ${picture}
      </div>
      <div class="in" role="status" style="font-size:12px;margin:4px 0;color:${MEDIA_TONE_COLORS[media.tone]};">
        ${currentMapId ? media.text : 'Not saved: the preview shows the draft. A save stores the map and draws it.'}
      </div>`;
    const retry = s('.btn-map-engine-media-retry');
    if (retry) retry.hidden = !(currentMapId && media.retry && !MapEngineCyberia.population);
  }

  /** Draws the map the editor holds again, a moment after its last change, while the media panel shows and no stored preview shows its revision. */
  static scheduleDraftPreview() {
    clearTimeout(MapEngineCyberia.draftTimer);
    const panel = s('.map-engine-media');
    if (!panel?.offsetParent || MapEngineCyberia.population || MapEngineCyberia.storedPreviewReady()) return;
    MapEngineCyberia.draftTimer = setTimeout(() => MapEngineCyberia.drawDraftPreview(), 400);
  }

  static async drawDraftPreview() {
    const request = ++MapEngineCyberia.draftRequest;
    let picture;
    try {
      picture = await CyberiaMapService.draftPreview({
        body: { ...MapEngineCyberia.draftGrid(), entities: MapEngineCyberia.entities },
      });
    } catch {
      return;
    }
    if (request !== MapEngineCyberia.draftRequest) return;
    if (MapEngineCyberia.draftPreview?.startsWith('blob:')) URL.revokeObjectURL(MapEngineCyberia.draftPreview);
    MapEngineCyberia.draftPreview = picture ? URL.createObjectURL(picture) : 'empty';
    MapEngineCyberia.renderMedia();
  }

  /** Reads the media of a saved map again while its preview is pending, then shows the stored preview. */
  static followMedia(reads = 0) {
    clearTimeout(MapEngineCyberia.mediaTimer);
    const { currentMapId: id, currentMedia, currentRevision } = MapEngineCyberia;
    const pending = !currentMedia || currentMedia.revision !== currentRevision || currentMedia.status === 'pending';
    if (!id || !pending || reads >= MapEngineCyberia.MEDIA_READS) return;
    MapEngineCyberia.mediaTimer = setTimeout(async () => {
      const response = await CyberiaMapService.readMedia({ id });
      if (response.status !== 'success' || id !== MapEngineCyberia.currentMapId) return;
      MapEngineCyberia.currentMedia = response.data.media;
      MapEngineCyberia.currentPreviewId = response.data.preview;
      MapEngineCyberia.renderMedia();
      MapEngineCyberia.followMedia(reads + 1);
    }, 1500);
  }

  static async render(options = {}) {
    const { appStore } = options;
    const role = appStore?.Data?.user?.main?.model?.user?.role || 'guest';
    const canMutate = commonModeratorGuard(role);
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
    const idWorldX = 'map-engine-input-world-x';
    const idWorldY = 'map-engine-input-world-y';
    const canvasId = 'map-engine-canvas';

    const idEntityType = MapEngineCyberia.entityTypeDropdownId;
    const idLevel = 'map-engine-level';
    const idRespawnDuration = 'map-engine-respawn-duration';
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
    const idSwapEntityA = 'map-engine-swap-entity-a';
    const idSwapEntityB = 'map-engine-swap-entity-b';
    const idRenameSourceObjectLayer = MapEngineCyberia.renameSourceObjectLayerInputId;
    const idRenameTargetObjectLayer = MapEngineCyberia.renameTargetObjectLayerInputId;
    const managementId = 'modal-cyberia-map-engine';

    MapEngineCyberia.setEntities([], { clearHistory: true });
    MapEngineCyberia.currentMapId = null;
    MapEngineCyberia.currentMapCode = null;
    MapEngineCyberia.currentThumbnailId = null;
    MapEngineCyberia.currentPreviewId = null;
    MapEngineCyberia.currentMedia = null;

    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const resetDimensions = () => {
      if (s(`.${idX}`)) s(`.${idX}`).value = DEFAULT_MAP_DIMENSIONS.gridX;
      if (s(`.${idY}`)) s(`.${idY}`).value = DEFAULT_MAP_DIMENSIONS.gridY;
      if (s(`.${idCellW}`)) s(`.${idCellW}`).value = DEFAULT_MAP_DIMENSIONS.cellWidth;
      if (s(`.${idCellH}`)) s(`.${idCellH}`).value = DEFAULT_MAP_DIMENSIONS.cellHeight;
    };

    const getCanvasParams = () => ({
      cols: parseInt(s(`.${idX}`)?.value) || DEFAULT_MAP_DIMENSIONS.gridX,
      rows: parseInt(s(`.${idY}`)?.value) || DEFAULT_MAP_DIMENSIONS.gridY,
      cellW: parseInt(s(`.${idCellW}`)?.value) || DEFAULT_MAP_DIMENSIONS.cellWidth,
      cellH: parseInt(s(`.${idCellH}`)?.value) || DEFAULT_MAP_DIMENSIONS.cellHeight,
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
      MapEngineCyberia.scheduleDraftPreview();
    };

    // The size and color of the entity the form adds.
    const formFootprint = () => ({
      dimX: parseInt(s(`.${idDimX}`)?.value) || 1,
      dimY: parseInt(s(`.${idDimY}`)?.value) || 1,
      color: hexToRgba(s(`.${idColor}`)?.value || '#ff0000', parseFloat(s(`.${idAlpha}`)?.value)),
    });

    const getEntityParams = () => {
      const rawLevel = s(`.${idLevel}`)?.value.trim();
      let level;
      let respawnDurationMs;
      try {
        if (rawLevel) level = validateEntityLevel(Number(rawLevel));
        respawnDurationMs = validateRespawnDuration(Number(s(`.${idRespawnDuration}`)?.value));
      } catch (error) {
        NotificationManager.Push({ html: error.message, status: 'error' });
        return null;
      }
      return {
        level,
        respawnDurationMs,
        entityType: MapEngineCyberia.getSelectedEntityType(),
        initCellX: parseInt(s(`.${idInitCellX}`)?.value) || 0,
        initCellY: parseInt(s(`.${idInitCellY}`)?.value) || 0,
        ...formFootprint(),
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
      if (!ep) return;
      ep.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];
      applyRandomFactorsToDimensions(ep);
      MapEngineCyberia.commitEntityMutation('PlaceEntity', () => {
        MapEngineCyberia.entities.push(ep);
      });
    };

    const fillMapWithEntity = () => {
      const ep = getEntityParams();
      if (!ep) return;
      ep.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];
      const { cols, rows } = getCanvasParams();
      const dimX = ep.dimX || 1;
      const dimY = ep.dimY || 1;
      MapEngineCyberia.commitEntityMutation('BatchPlace', () => {
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
      MapEngineCyberia.commitEntityMutation('GenerateVariation', () => {
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
      MapEngineCyberia.commitEntityMutation('DeleteEntity', () => {
        MapEngineCyberia.entities = [];
      });
    };

    // Deletes the entities the filters select: what the entity list shows.
    const deleteFilteredEntities = () => {
      const selected = new Set(MapEngineCyberia.getFilteredEntities().map(({ i }) => i));
      MapEngineCyberia.commitEntityMutation('DeleteEntity', () => {
        MapEngineCyberia.entities = MapEngineCyberia.entities.filter((_, i) => !selected.has(i));
      });
    };

    const randomSwapPreserveEntities = () => {
      const preserveIndices = getPreserveIndices();
      if (preserveIndices.length < 2) return;

      const selectedCount = getAffectedEntityCount(preserveIndices.length);
      const shuffled = [...preserveIndices].sort(() => Math.random() - 0.5).slice(0, selectedCount);
      const swapCount = Math.max(1, Math.floor(shuffled.length / 2));

      MapEngineCyberia.commitEntityMutation('MoveEntities', () => {
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
      if (!template) return;
      template.objectLayerItemIds = DropDown.Tokens[idObjLayerDropdown]?.value
        ? [...DropDown.Tokens[idObjLayerDropdown].value]
        : [];

      MapEngineCyberia.commitEntityMutation('ReplaceEntities', () => {
        for (const index of selected) {
          const target = MapEngineCyberia.entities[index];
          const replacement = {
            ...target,
            entityType: template.entityType,
            level: template.level,
            respawnDurationMs: template.respawnDurationMs,
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
      MapEngineCyberia.commitEntityMutation('Flip', () => {
        for (const entity of MapEngineCyberia.entities) {
          entity.initCellX = cols - entity.initCellX - entity.dimX;
        }
      });
    };

    const flipVertical = () => {
      const { rows } = getCanvasParams();
      MapEngineCyberia.commitEntityMutation('Flip', () => {
        for (const entity of MapEngineCyberia.entities) {
          entity.initCellY = rows - entity.initCellY - entity.dimY;
        }
      });
    };

    // An empty world cell leaves the map without a place in its world.
    const worldCell = (id) => {
      const value = s(`.${id}`)?.value.trim();
      return value ? Number(value) : null;
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
        worldX: worldCell(idWorldX),
        worldY: worldCell(idWorldY),
      };
      payload.thumbnail = MapEngineCyberia.currentThumbnailId ?? null;
      return payload;
    };

    // Unsaved work stays in this browser until a save, one draft per map code or population.
    const draftKey = () =>
      MapEngineCyberia.population
        ? `cyberia-map-population:${MapEngineCyberia.population.id}`
        : `cyberia-map:${MapEngineCyberia.currentMapCode || 'new'}`;
    let draft = EditorDraftStore.debounced(draftKey());
    const followDraft = () => {
      draft.cancel();
      draft = EditorDraftStore.debounced(draftKey());
    };
    MapEngineCyberia.onCommand = () => draft.save(getMapPayload());
    const dropDraft = async () => {
      draft.cancel();
      await EditorDraftStore.remove(draftKey());
    };

    // The stored media and preview of a map write answer; a pending preview is followed until it is stored.
    const takeMedia = (map) => {
      MapEngineCyberia.currentPreviewId = map?.preview ?? null;
      MapEngineCyberia.currentMedia = map?.media ?? null;
      MapEngineCyberia.renderMedia();
      MapEngineCyberia.followMedia();
      MapEngineCyberia.scheduleDraftPreview();
    };

    // A population draft saves its placements to the population; the live map does not change.
    const savePopulationDraft = async () => {
      const { population } = MapEngineCyberia;
      const { cols, rows, cellW, cellH } = getCanvasParams();
      const result = await CyberiaProceduralPopulationService.saveDraft({
        id: population.id,
        body: {
          grid: { gridX: cols, gridY: rows, cellWidth: cellW, cellHeight: cellH },
          entities: MapEngineCyberia.entities,
          revision: population.revision,
          baseRevision: population.baseRevision,
        },
      });
      if (result.status !== 'success') return NotificationManager.Push({ html: result.message, status: 'error' });
      Object.assign(population, { revision: result.data.revision, baseRevision: result.data.baseRevision });
      await dropDraft();
      await readPopulationKeys();
      paintPopulation();
      NotificationManager.Push({
        html: `Draft revision ${result.data.revision} saved. The live map does not change until you publish.`,
        status: 'success',
      });
    };

    const saveMap = async () => {
      if (MapEngineCyberia.population) return await savePopulationDraft();
      // A custom thumbnail uploads with the save; without one, the preview is the thumbnail.
      const thumbnailInput = s(`.${idThumbnail}`);
      const hasCustomThumbnail =
        MapEngineCyberia.thumbnailDirty && thumbnailInput && thumbnailInput.files && thumbnailInput.files.length > 0;
      if (hasCustomThumbnail) {
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

      const body = getMapPayload();
      if (MapEngineCyberia.currentMapId) body.revision = MapEngineCyberia.currentRevision;
      const result = await EditorCrud.save(CyberiaMapService, { id: MapEngineCyberia.currentMapId, body });
      if (result.status === 'success') {
        await dropDraft();
        if (result.data?._id) MapEngineCyberia.currentMapId = result.data._id;
        MapEngineCyberia.currentRevision = result.data?.revision ?? MapEngineCyberia.currentRevision;
        // A saved map becomes the one the URL points at.
        MapEngineCyberia.currentMapCode = body.code || null;
        MapEngineCyberia.thumbnailDirty = false;
        MapEngineCyberia.currentThumbnailId = result.data?.thumbnail ?? null;
        MapEngineCyberia.pendingThumbnailUrl = null;
        followDraft();
        setQueryParams({ mapCode: body.code || null }, { replace: true });
        takeMedia(result.data);
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
    };

    const leaveDraftFirst = () =>
      NotificationManager.Push({
        html: 'Leave the population draft first: it composes the grid and the placements only.',
        status: 'warning',
      });

    const cloneMap = async () => {
      if (MapEngineCyberia.population) return leaveDraftFirst();
      let cloneThumbnailId = null;

      // A custom thumbnail uploads as a file of its own: the clone never shares the File of the source.
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

      // A clone is a new map: it has no place in a world until one is set.
      const source = { ...getMapPayload(), worldX: null, worldY: null, thumbnail: cloneThumbnailId };
      const { result, body } = await EditorCrud.clone(CyberiaMapService, source);
      if (result.status === 'success') {
        if (s(`.${idWorldX}`)) s(`.${idWorldX}`).value = '';
        if (s(`.${idWorldY}`)) s(`.${idWorldY}`).value = '';
        if (result.data?._id) MapEngineCyberia.currentMapId = result.data._id;
        MapEngineCyberia.currentRevision = result.data?.revision ?? 1;
        MapEngineCyberia.currentMapCode = body.code || null;
        followDraft();
        setQueryParams({ mapCode: body.code || null }, { replace: true });
        MapEngineCyberia.currentThumbnailId = cloneThumbnailId;
        takeMedia(result.data);
        await DefaultManagement.loadTable(managementId, { force: true, reload: true });
      }
    };

    const loadMap = async (mapData) => {
      MapEngineCyberia.currentMapId = mapData._id || null;
      MapEngineCyberia.currentMapCode = mapData.code || null;
      MapEngineCyberia.crud?.refresh();
      setQueryParams({ mapCode: mapData.code || null }, { replace: true });
      if (s(`.${idCode}`)) s(`.${idCode}`).value = mapData.code || '';
      if (s(`.${idName}`)) s(`.${idName}`).value = mapData.name || '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = mapData.description || '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = (mapData.tags || []).join(', ');

      if (s(`.${idWorldX}`)) s(`.${idWorldX}`).value = mapData.worldX ?? '';
      if (s(`.${idWorldY}`)) s(`.${idWorldY}`).value = mapData.worldY ?? '';

      // Restore grid dimensions
      if (s(`.${idX}`)) s(`.${idX}`).value = mapData.gridX || DEFAULT_MAP_DIMENSIONS.gridX;
      if (s(`.${idY}`)) s(`.${idY}`).value = mapData.gridY || DEFAULT_MAP_DIMENSIONS.gridY;
      if (s(`.${idCellW}`)) s(`.${idCellW}`).value = mapData.cellWidth || DEFAULT_MAP_DIMENSIONS.cellWidth;
      if (s(`.${idCellH}`)) s(`.${idCellH}`).value = mapData.cellHeight || DEFAULT_MAP_DIMENSIONS.cellHeight;
      const statusValue = mapData.status || 'unlisted';
      if (DropDown.Tokens[idStatus]) {
        const statusIndex = statusOptions.findIndex((opt) => opt.value === statusValue);
        if (statusIndex > -1) s(`.dropdown-option-${idStatus}-${statusIndex}`).click();
      }

      // The custom thumbnail, the preview and its media
      MapEngineCyberia.currentThumbnailId = mapData.thumbnail || null;
      MapEngineCyberia.pendingThumbnailUrl = null;
      MapEngineCyberia.draftPreview = null;
      MapEngineCyberia.currentRevision = mapData.revision ?? 1;
      takeMedia(mapData);
      if (MapEngineCyberia.currentThumbnailId) {
        const thumbId =
          typeof MapEngineCyberia.currentThumbnailId === 'object'
            ? MapEngineCyberia.currentThumbnailId._id
            : MapEngineCyberia.currentThumbnailId;

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

      // Every field travels: the editor places and paints entities, and never drops what they are.
      const nextEntities = (mapData.entities || []).map(({ _id, ...entity }) => ({
        ...entity,
        objectLayerItemIds: entity.objectLayerItemIds || [],
      }));
      MapEngineCyberia.setEntities(nextEntities, { clearHistory: true });
      followDraft();
      await Promise.all([MapStudioCyberia.loadContext(mapData.code), MapAudioCyberia.load(mapData.code)]);

      // A draft newer than the stored map is offered back, as one command.
      const stored = await EditorDraftStore.get(draftKey());
      if (stored && stored.savedAt > (Date.parse(mapData.updatedAt ?? '') || 0)) {
        const answer = await Modal.RenderConfirm({
          html: async () => html`
            <div class="in section-mp" style="text-align: center">
              Recover the unsaved work of ${new Date(stored.savedAt).toLocaleString()}?
            </div>
          `,
          id: 'map-engine-draft-recover-confirm',
        });
        if (answer.status === 'confirm')
          MapEngineCyberia.commitEntityMutation('RecoverDraft', () => {
            MapEngineCyberia.entities = MapEngineCyberia.cloneEntities(stored.value.entities);
          });
        else await dropDraft();
      }
    };

    MapEngineCyberia.loadMap = loadMap;
    MapEngineCyberia.draftGrid = () => {
      const { cols, rows } = getCanvasParams();
      return { gridX: cols, gridY: rows };
    };

    const newMap = () => {
      MapEngineCyberia.currentMapId = null;
      MapEngineCyberia.currentMapCode = null;
      MapEngineCyberia.currentRevision = null;
      MapEngineCyberia.crud?.refresh();
      followDraft();
      MapStudioCyberia.loadContext(null);
      MapAudioCyberia.load(null);
      setQueryParams({ mapCode: null }, { replace: true });
      MapEngineCyberia.currentThumbnailId = null;
      MapEngineCyberia.pendingThumbnailUrl = null;
      MapEngineCyberia.currentPreviewId = null;
      MapEngineCyberia.currentMedia = null;
      MapEngineCyberia.draftPreview = null;
      MapEngineCyberia.thumbnailDirty = false;
      MapEngineCyberia.scheduleDraftPreview();
      if (s(`.${idCode}`)) s(`.${idCode}`).value = '';
      if (s(`.${idWorldX}`)) s(`.${idWorldX}`).value = '';
      if (s(`.${idWorldY}`)) s(`.${idWorldY}`).value = '';
      if (s(`.${idName}`)) s(`.${idName}`).value = '';
      if (s(`.${idDescription}`)) s(`.${idDescription}`).value = '';
      if (s(`.${idTags}`)) s(`.${idTags}`).value = '';
      if (DropDown.Tokens[idStatus]) {
        const resetIndex = statusOptions.findIndex((opt) => opt.value === 'unlisted');
        if (resetIndex > -1) s(`.dropdown-option-${idStatus}-${resetIndex}`).click();
      }
      MapEngineCyberia.renderMedia();
      if (s(`.${idThumbnail}`)) {
        s(`.${idThumbnail}`).value = '';
        s(`.${idThumbnail}`).onchange({ target: s(`.${idThumbnail}`) });
      }
      const creatorDisplay = s(`.map-engine-creator-display`);
      if (creatorDisplay) creatorDisplay.innerHTML = '<span style="color:#888;font-size:12px;">—</span>';
      resetDimensions();
      if (s(`.${idLevel}`)) s(`.${idLevel}`).value = '';
      if (s(`.${idRespawnDuration}`)) s(`.${idRespawnDuration}`).value = RESPAWN_DURATION_MS_DEFAULT;
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

    const deleteMap = async () => {
      if (MapEngineCyberia.population) return leaveDraftFirst();
      const result = await EditorCrud.remove(CyberiaMapService, {
        id: MapEngineCyberia.currentMapId,
        subject: 'map',
        name: MapEngineCyberia.currentMapCode,
      });
      if (result?.status !== 'success') return;
      await dropDraft();
      newMap();
      await DefaultManagement.loadTable(managementId, { force: true, reload: true });
    };

    const resetMap = async () => {
      await dropDraft();
      const { status, data, message } = await CyberiaMapService.get({ id: MapEngineCyberia.currentMapId });
      if (status === 'success' && data) await loadMap(data);
      else NotificationManager.Push({ html: message, status: 'error' });
    };

    // ?mapCode=<code> loads that map into the form on arrival, once however many events ask.
    let loadingCode = null;
    const loadMapByCode = async (code) => {
      if (!code || code === MapEngineCyberia.currentMapCode || code === loadingCode) return;
      loadingCode = code;
      try {
        const { status, data } = await CyberiaMapService.get({ id: code });
        if (status !== 'success' || !data?._id) {
          NotificationManager.Push({ html: `No map answers to the code "${code}"`, status: 'error' });
          return;
        }
        await loadMap(data);
        NotificationManager.Push({ html: `Map "${data.name || data.code}" loaded`, status: 'success' });
      } finally {
        loadingCode = null;
      }
    };

    // The banner of a population draft: which population, which draft revision, and the way back.
    const paintPopulation = () => {
      const banner = s('.map-engine-population');
      if (!banner) return;
      const { population } = MapEngineCyberia;
      banner.hidden = !population;
      if (!population) return;
      banner.innerHTML = html`<span class="map-engine-population-title"
          ><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Population draft of
          ${population.mapCode}</span
        >
        <span>
          ${population.revision ? `Draft revision ${population.revision}` : 'Not saved yet'} · from map revision
          ${population.baseRevision}. Save stores the grid and the placements in the draft; the live map does not change
          until you publish.
        </span>
        ${
          population.missing.length > 0
            ? html`<details class="map-engine-population-missing">
                <summary>${population.missing.length} items have no artwork to draw</summary>
                <ul>
                  ${population.missing.map(({ reason }) => html`<li>${reason}</li>`).join('')}
                </ul>
              </details>`
            : ''
        }
        <span class="map-engine-population-actions">
          <button type="button" class="map-engine-population-back">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to population
          </button>
          <button type="button" class="map-engine-population-leave">
            <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Open the live map
          </button>
        </span>`;
      banner.querySelector('.map-engine-population-back').onclick = () =>
        ProceduralEngineCyberia.open({ populationId: population.id });
      banner.querySelector('.map-engine-population-leave').onclick = () => setQueryParams({ population: null });
    };

    // The CID that draws each item, the items nothing draws and the items of the population. A selection
    // in the population changes them, so the Studio reads them again whenever it comes back to the draft.
    const readPopulationKeys = async () => {
      const { population } = MapEngineCyberia;
      const read = await CyberiaProceduralPopulationService.getDraft({ id: population.id });
      if (read.status !== 'success') return NotificationManager.Push({ html: read.message, status: 'error' });
      const { previewKeys, missing, items } = read.data;
      Object.assign(population, { previewKeys, missing, items });
      MapEngineCyberia.refreshEntityEditor();
      paintPopulation();
    };

    // ?population=<id> composes the draft of that population over its map: its grid and placements,
    // and each item drawn by the CID the population would publish.
    let entering = null;
    const enterPopulation = async (id) => {
      if (entering === id) return;
      entering = id;
      try {
        const draft = await CyberiaProceduralPopulationService.getDraft({ id });
        if (draft.status !== 'success') return NotificationManager.Push({ html: draft.message, status: 'error' });
        const map = await CyberiaMapService.get({ id: draft.data.mapCode });
        if (map.status !== 'success' || !map.data?._id)
          return NotificationManager.Push({
            html: `No map answers to the code "${draft.data.mapCode}"`,
            status: 'error',
          });
        const { mapCode, revision, baseRevision, previewKeys, missing, items, grid, entities, savedAt } = draft.data;
        MapEngineCyberia.population = { id, mapCode, revision, baseRevision, previewKeys, missing, items };
        MapEngineCyberia.showObjectLayers = true;
        for (const control of s('.map-engine-container').querySelectorAll('[data-map-toggle="showObjectLayers"]'))
          control.setAttribute('aria-pressed', 'true');
        paintPopulation();
        await loadMap({ ...map.data, ...grid, entities, updatedAt: savedAt ?? map.data.updatedAt });
      } finally {
        entering = null;
      }
    };

    const leavePopulation = async () => {
      MapEngineCyberia.population = null;
      paintPopulation();
      followDraft();
      const { status, data } = await CyberiaMapService.get({ id: MapEngineCyberia.currentMapCode });
      if (status === 'success' && data) await loadMap(data);
    };

    listenQueryParamsChange({
      id: 'cyberia-map-engine-query-listener',
      event: async (queryParams) => {
        if (!s(`.${idCode}`)) return;
        const code = queryParams.mapCode || null;
        const population = queryParams.population || null;
        if (population && population !== MapEngineCyberia.population?.id) return await enterPopulation(population);
        if (population) return await readPopulationKeys();
        if (!population && MapEngineCyberia.population) return await leavePopulation();
        if (code) await loadMapByCode(code);
        else if (MapEngineCyberia.currentMapCode) newMap();
      },
    });

    setTimeout(() => {
      const canvas = s(`.${canvasId}`);
      if (!canvas) return;

      MapEngineCyberia.setEntityHistorySync(() => {
        MapEngineCyberia.renderEntityList(entityListId);
        MapStudioCyberia.refresh();
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

      const cellOf = (e) => {
        const rect = canvas.getBoundingClientRect();
        const { cellW, cellH } = getCanvasParams();
        return [
          Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width)) / cellW),
          Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height)) / cellH),
        ];
      };
      // The ghost shows the entity the form adds at the cell under the pointer.
      canvas.onpointermove = (e) => {
        const [col, row] = cellOf(e);
        const footprint = formFootprint();
        const ghost = MapEngineCyberia.ghost;
        if (ghost?.col === col && ghost.row === row && ghost.dimX === footprint.dimX && ghost.dimY === footprint.dimY)
          return;
        MapEngineCyberia.ghost = { col, row, ...footprint };
        htmls('.map-engine-cell-coords', `Cell: (${col}, ${row}) · ${footprint.dimX}×${footprint.dimY}`);
        rerenderCanvas();
      };
      canvas.onpointerleave = () => {
        MapEngineCyberia.ghost = null;
        rerenderCanvas();
      };

      canvas.onclick = (e) => {
        const [col, row] = cellOf(e);

        if (s(`.${idInitCellX}`)) s(`.${idInitCellX}`).value = col;
        if (s(`.${idInitCellY}`)) s(`.${idInitCellY}`).value = row;

        if (MapEngineCyberia.addOnClick) {
          addEntityLocally();
        } else if (MapEngineCyberia.removeOnClick) {
          MapEngineCyberia.commitEntityMutation('DeleteEntity', () => {
            MapEngineCyberia.entities = MapEngineCyberia.entities.filter(
              (entity) => !(entity.initCellX === col && entity.initCellY === row),
            );
          });
        }
      };
      MapStudioCyberia.mount({
        entities: () => MapEngineCyberia.entities,
        load: ({ entityType, objectLayerItemIds }) => {
          MapEngineCyberia.setDropdownValue(MapEngineCyberia.entityTypeDropdownId, entityType);
          MapEngineCyberia.syncObjectLayerDropdownSelection(objectLayerItemIds);
          Tabs.select(s('.map-engine-tabs'), 'paint');
        },
      });
      MapAudioCyberia.mount();
      const container = s('.map-engine-container');
      EditorLayout.bind(container);
      EditorLayout.pin(container, 'map-engine-stage');
      Tabs.bind(container.querySelector('.map-engine-tabs'));
      const stageControls = container.querySelectorAll('[data-map-toggle]');
      for (const button of stageControls) {
        button.onclick = () => {
          const key = button.dataset.mapToggle;
          MapEngineCyberia[key] = !MapEngineCyberia[key];
          if (MapEngineCyberia[key] && key === 'addOnClick') MapEngineCyberia.removeOnClick = false;
          if (MapEngineCyberia[key] && key === 'removeOnClick') MapEngineCyberia.addOnClick = false;
          for (const control of stageControls)
            control.setAttribute('aria-pressed', String(MapEngineCyberia[control.dataset.mapToggle]));
          rerenderCanvas();
        };
      }
      container.querySelector('.btn-map-engine-reset-dimensions').onclick = () => {
        resetDimensions();
        rerenderCanvas();
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

      MapEngineCyberia.crud = EditorCrud.bind(container.querySelector('.map-engine-crud'), () => ({
        subject: 'map',
        id: MapEngineCyberia.currentMapId,
        name: MapEngineCyberia.currentMapCode,
        new: async () => {
          await dropDraft();
          newMap();
          Tabs.select(s('.map-engine-tabs'), 'map');
        },
        reset: resetMap,
        ...(canMutate && { save: saveMap, clone: cloneMap, delete: deleteMap }),
      }));

      // The draft preview draws when the media panel comes into view.
      new IntersectionObserver((seen) => {
        if (seen.some(({ isIntersecting }) => isIntersecting)) MapEngineCyberia.scheduleDraftPreview();
      }).observe(s('.map-engine-media'));
      if (s('.btn-map-engine-media-retry'))
        s('.btn-map-engine-media-retry').onclick = async () => {
          const response = await CyberiaMapService.media({ id: MapEngineCyberia.currentMapId });
          if (response.status !== 'success')
            return NotificationManager.Push({ html: response.message, status: 'error' });
          takeMedia(response.data);
        };
      for (const section of ['thumbnail', 'entity-filter', 'rename']) {
        const toggle = s(`.btn-map-engine-toggle-${section}`);
        if (toggle)
          toggle.onclick = () => {
            const open = !s(`.map-engine-${section}-body`).classList.toggle('hide');
            toggle.setAttribute('aria-expanded', String(open));
            s(`.map-engine-${section}-caret`).classList.toggle('fa-caret-right', !open);
            s(`.map-engine-${section}-caret`).classList.toggle('fa-caret-down', open);
          };
      }

      if (s('.btn-map-engine-swap-entities'))
        s('.btn-map-engine-swap-entities').onclick = () =>
          MapEngineCyberia.swapEntities(
            parseInt(s(`.${idSwapEntityA}`).value, 10),
            parseInt(s(`.${idSwapEntityB}`).value, 10),
          );

      new Sortable(s(`.${entityListId}`), {
        animation: 150,
        handle: '.map-engine-entity-handle',
        onEnd: ({ oldIndex, newIndex }) => MapEngineCyberia.moveEntity(oldIndex, newIndex),
      });

      let entityFilterTimeout = null;
      const applyEntityFilter = () => {
        clearTimeout(entityFilterTimeout);
        entityFilterTimeout = setTimeout(() => {
          MapEngineCyberia.renderEntityList(entityListId);
        }, 300);
      };
      [idFilterEntityType, idFilterInitX, idFilterInitY, idFilterObjectLayerItemIds].forEach((cls) => {
        if (s(`.${cls}`)) s(`.${cls}`).addEventListener('input', applyEntityFilter);
      });

      if (s('.btn-map-engine-clear-entity-filter'))
        s('.btn-map-engine-clear-entity-filter').onclick = () => {
          [idFilterEntityType, idFilterInitX, idFilterInitY, idFilterObjectLayerItemIds].forEach((cls) => {
            if (s(`.${cls}`)) s(`.${cls}`).value = '';
          });
          MapEngineCyberia.renderEntityList(entityListId);
        };

      if (s('.btn-map-engine-clear-all-entities'))
        s('.btn-map-engine-clear-all-entities').onclick = () => clearAllEntities();

      if (s('.btn-map-engine-delete-filtered-entities'))
        s('.btn-map-engine-delete-filtered-entities').onclick = () => deleteFilteredEntities();

      if (s('.btn-map-engine-rename-filtered-object-layer-item-id'))
        s('.btn-map-engine-rename-filtered-object-layer-item-id').onclick = () => {
          MapEngineCyberia.renameFilteredObjectLayerItemId();
        };

      // Loaded last: loadMap repaints the canvas through the history sync above.
      const { population, mapCode } = getQueryParams();
      if (population) enterPopulation(population);
      else loadMapByCode(mapCode);
    });

    const statusOptions = [
      { value: 'unlisted', display: 'unlisted', data: 'unlisted', onClick: () => {} },
      { value: 'draft', display: 'draft', data: 'draft', onClick: () => {} },
      { value: 'published', display: 'published', data: 'published', onClick: () => {} },
      { value: 'archived', display: 'archived', data: 'archived', onClick: () => {} },
    ];

    const managementTableHtml = await CyberiaMapManagement.instance({
      idModal: managementId,
      loadMapCallback: async (map) => {
        await loadMap(map);
        Tabs.select(s('.map-engine-tabs'), 'map');
      },
      appStore,
    });

    const dcMapFields = 'map-engine-dc-fields';
    const dcMetaFields = 'map-engine-dc-meta';
    const dcGridSize = 'map-engine-dc-grid-size';
    const dcCellSize = 'map-engine-dc-cell-size';
    const dcWorldOrigin = 'map-engine-dc-world-origin';
    const dcEntityType = 'map-engine-dc-entity-type';
    const dcAlpha = 'map-engine-dc-alpha';
    const dcCellPos = 'map-engine-dc-cell-pos';
    const dcDim = 'map-engine-dc-dim';
    const dcFactors = 'map-engine-dc-factors';
    const dcEntityFilter = 'map-engine-dc-entity-filter';
    const idFilterEntityType = 'map-engine-filter-entity-type';
    const idFilterInitX = 'map-engine-filter-init-x';
    const idFilterInitY = 'map-engine-filter-init-y';
    const idFilterObjectLayerItemIds = 'map-engine-filter-object-layer-item-ids';

    const stageToggle = (key, icon, label) =>
      html`<button
        type="button"
        class="map-engine-stage-button"
        data-map-toggle="${key}"
        aria-pressed="${MapEngineCyberia[key]}"
        title="${label}"
        aria-label="${label}"
      >
        <i class="${icon}" aria-hidden="true"></i>
      </button>`;

    return html`<div class="in section-mp studio-editor map-engine-container">
      <style>
        .map-engine-media-figures {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .map-engine-media-figure {
          margin: 0;
          font-size: 12px;
          color: #888;
        }
        .map-engine-media-figure img,
        .map-engine-media-empty {
          display: block;
          box-sizing: border-box;
          width: 160px;
          max-width: 100%;
          aspect-ratio: 1;
          object-fit: contain;
          image-rendering: pixelated;
          border: 1px solid #555;
        }
        .map-engine-media-empty {
          display: flex;
          align-items: center;
          padding: 8px;
          border-style: dashed;
          color: #888;
          font-size: 12px;
          text-align: center;
        }
        .map-engine-population {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          align-items: center;
          padding: 8px 10px;
          margin-bottom: 8px;
          border: 1px solid var(--studio-accent, #5aa7ff);
          border-left-width: 4px;
          border-radius: 6px;
          font-size: 13px;
        }
        .map-engine-population[hidden] {
          display: none;
        }
        .map-engine-population-title {
          font-weight: bold;
        }
        .map-engine-population-actions {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-left: auto;
        }
        .map-engine-population-actions > button {
          padding: 3px 10px;
          cursor: pointer;
        }
        .map-engine-population-missing {
          flex-basis: 100%;
          color: #ff8a9e;
        }
        .map-engine-population-missing ul {
          margin: 4px 0 0;
          padding-left: 18px;
        }
        .map-engine-stage-controls {
          display: inline-flex;
          gap: 2px;
          padding-right: 6px;
          border-right: 1px solid var(--studio-subtle-border, #8885);
        }
        .map-engine-stage-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          margin: 0;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          font-size: 13px;
          cursor: pointer;
        }
        .map-engine-stage-button:hover {
          background: #8882;
        }
        .map-engine-stage-button[aria-pressed='true'] {
          border-color: var(--studio-positive, #2196f3);
          background: #8882;
        }
        .map-engine-stage-button:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        .map-engine-entity-list .map-engine-entity-handle {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          min-height: 0;
          margin: 0 6px 0 0;
          padding: 2px 6px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: inherit;
          font: 12px monospace;
          cursor: grab;
        }
        .map-engine-entity-list .map-engine-entity-handle:hover {
          background: #8882;
        }
        .map-engine-entity-list .map-engine-entity-handle:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        .map-engine-entity-list .sortable-ghost {
          opacity: 0.4;
        }
        .map-engine-tool-hint {
          font-size: 13px;
          opacity: 0.75;
          margin: 0 0 12px;
        }
      </style>
      ${EditorLayout.render({
        subject: 'map',
        readout: html`<div class="map-engine-stage-controls" role="group" aria-label="Click Action">
            ${stageToggle('addOnClick', 'fa-solid fa-plus', 'Add on click')}
            ${stageToggle('removeOnClick', 'fa-solid fa-eraser', 'Remove on click')}
          </div>
          <div class="map-engine-stage-controls" role="group" aria-label="View Options">
            ${stageToggle('showGridBorders', 'fa-solid fa-border-all', 'Show grid')}
            ${stageToggle('showObjectLayers', 'fa-solid fa-layer-group', 'Show object layers')}
          </div>
          <button
            type="button"
            class="map-engine-stage-button btn-map-engine-reset-dimensions"
            title="Restore grid ${DEFAULT_MAP_DIMENSIONS.gridX} × ${DEFAULT_MAP_DIMENSIONS.gridY}, cells ${DEFAULT_MAP_DIMENSIONS.cellWidth} × ${DEFAULT_MAP_DIMENSIONS.cellHeight}px"
            aria-label="Restore default map dimensions"
          >
            <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
          </button>
          <div class="map-engine-cell-coords" style="font-family:monospace;font-size:12px;opacity:.7;">
            Cell: (0, 0)
          </div>`,
        stage: html`<canvas
          class="${canvasId}"
          width="${DEFAULT_MAP_DIMENSIONS.gridX * DEFAULT_MAP_DIMENSIONS.cellWidth}"
          height="${DEFAULT_MAP_DIMENSIONS.gridY * DEFAULT_MAP_DIMENSIONS.cellHeight}"
          style="border: 1px solid #555;"
        ></canvas>`,
        tools: html`<div class="in map-engine-tools">
          <div class="in map-engine-population" role="status" aria-live="polite" hidden></div>
          ${EditorCrud.render({ id: 'map-engine-crud', label: 'Map' })}
          ${Tabs.render({
            id: 'map-engine-tabs',
            label: 'Map tools',
            selected: 'paint',
            tabs: [
              {
                id: 'map',
                label: 'Map',
                icon: 'fa-solid fa-map',
                content: html`${dynamicCol({ containerSelector: 'map-engine-tools', id: dcMapFields, type: 'search-inputs' })}
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
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcMetaFields, type: 'search-inputs' })}
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
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcGridSize, type: 'a-50-b-50' })}
                  <div class="fl">
                    <div class="in fll ${dcGridSize}-col-a">
                      ${await Input.instance({
                        id: idX,
                        label: html`X`,
                        containerClass: 'inl',
                        type: 'number',
                        min: 1,
                        value: DEFAULT_MAP_DIMENSIONS.gridX,
                      })}
                    </div>
                    <div class="in fll ${dcGridSize}-col-b">
                      ${await Input.instance({
                        id: idY,
                        label: html`Y`,
                        containerClass: 'inl',
                        type: 'number',
                        min: 1,
                        value: DEFAULT_MAP_DIMENSIONS.gridY,
                      })}
                    </div>
                  </div>
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcCellSize, type: 'a-50-b-50' })}
                  <div class="fl">
                    <div class="in fll ${dcCellSize}-col-a">
                      ${await Input.instance({
                        id: idCellW,
                        label: html`Cell Width (px)`,
                        containerClass: 'inl',
                        type: 'number',
                        min: 1,
                        value: DEFAULT_MAP_DIMENSIONS.cellWidth,
                      })}
                    </div>
                    <div class="in fll ${dcCellSize}-col-b">
                      ${await Input.instance({
                        id: idCellH,
                        label: html`Cell Height (px)`,
                        containerClass: 'inl',
                        type: 'number',
                        min: 1,
                        value: DEFAULT_MAP_DIMENSIONS.cellHeight,
                      })}
                    </div>
                  </div>
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcWorldOrigin, type: 'a-50-b-50' })}
                  <div class="fl">
                    <div class="in fll ${dcWorldOrigin}-col-a">
                      ${await Input.instance({
                        id: idWorldX,
                        label: html`World X (cells)`,
                        containerClass: 'inl',
                        type: 'number',
                        step: 1,
                        placeholder: 'No place',
                      })}
                    </div>
                    <div class="in fll ${dcWorldOrigin}-col-b">
                      ${await Input.instance({
                        id: idWorldY,
                        label: html`World Y (cells)`,
                        containerClass: 'inl',
                        type: 'number',
                        step: 1,
                        placeholder: 'No place',
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
                  </div>`,
              },
              {
                id: 'paint',
                label: 'Paint',
                icon: 'fa-solid fa-paintbrush',
                content: html`${MapStudioCyberia.renderPanel()}
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcEntityType, type: 'a-50-b-50' })}
                  <div class="fl">
                    <div class="in fll ${dcEntityType}-col-a">
                      ${await DropDown.instance({
                        id: idEntityType,
                        label: html`Entity Type`,
                        data: MapEngineCyberia.getEntityTypeDropdownOptions(),
                        value: DEFAULT_ENTITY_TYPE,
                        containerClass: 'inl',
                      })}
                      ${await Input.instance({
                        id: idLevel,
                        label: html`Level (empty uses instance default)`,
                        containerClass: 'inl',
                        type: 'number',
                        min: ENTITY_LEVEL_MIN,
                        max: ENTITY_LEVEL_MAX,
                        value: '',
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
                      ${await Input.instance({
                        id: idRespawnDuration,
                        label: html`Respawn time (ms, at least ${RESPAWN_DURATION_MS_MIN})`,
                        containerClass: 'inl',
                        type: 'number',
                        min: RESPAWN_DURATION_MS_MIN,
                        required: true,
                        value: RESPAWN_DURATION_MS_DEFAULT,
                      })}
                    </div>
                  </div>
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcAlpha, type: 'a-50-b-50' })}
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
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcCellPos, type: 'a-50-b-50' })}
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
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcDim, type: 'a-50-b-50' })}
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
                  <div class="in" style="margin: 10px;">
                    <div class="${idObjLayerDropdownHost}">${await MapEngineCyberia.buildObjectLayerDropdown()}</div>
                  </div>
                  <div class="in">
                    ${await BtnIcon.instance({
                      class: 'wfa btn-map-engine-add-entity',
                      label: html`<i class="fa-solid fa-plus"></i> Add Entity`,
                    })}
                  </div>`,
              },
              {
                id: 'transform',
                label: 'Transform',
                icon: 'fa-solid fa-wand-magic-sparkles',
                content: html`<p class="map-engine-tool-hint">
                    Apply the entity settings from Paint to these map operations.
                  </p>
                  ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcFactors, type: 'a-50-b-50' })}
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
                  <div
                    class="fl"
                    style="align-items: center; gap: 8px; font-size: 20px; text-align: left; margin: 5px 0;"
                  >
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
                  </div>`,
              },
              {
                id: 'entities',
                label: 'Entities',
                icon: 'fa-solid fa-layer-group',
                content: html`<div class="in" style="margin-top: 10px;">
                    ${await BtnIcon.instance({
                      class: 'wfa btn-map-engine-toggle-entity-filter',
                      attrs: 'aria-expanded="false"',
                      label: html`<i class="fa-solid fa-caret-right map-engine-entity-filter-caret"></i> Filters`,
                    })}
                    <div class="in map-engine-entity-filter-body hide">
                      ${dynamicCol({ containerSelector: 'map-engine-tools', id: dcEntityFilter, type: 'search-inputs' })}
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
                      <div class="in" style="margin-top:5px;">
                        ${await Input.instance({
                          id: idFilterObjectLayerItemIds,
                          label: html`Object Layer ItemIds`,
                          containerClass: 'inl',
                          type: 'text',
                          placeholder: true,
                        })}
                        <div class="in" style="font-size:12px;color:#888;margin-top:3px;">
                          Comma separated, matched exactly. Keeps only entities carrying all of them.
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
                          class: 'wfa btn-map-engine-delete-filtered-entities',
                          label: html`<i class="fa-solid fa-filter-circle-xmark"></i> Delete Filtered Entities`,
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
                  <div class="in ${entityListId}" style="margin-top: 10px; max-height: 60vh; overflow-y: auto;"></div>
                  <div class="in section-mp-border" style="margin: 10px; padding: 10px;">
                    <div class="in input-label">Swap two entities by index</div>
                    <div class="fl" style="align-items:flex-end;">
                      <div class="in fll" style="flex:1;padding-right:5px;">
                        ${await Input.instance({
                          id: idSwapEntityA,
                          label: html`Index A`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 0,
                          placeholder: true,
                        })}
                      </div>
                      <div class="in fll" style="flex:1;padding-left:5px;">
                        ${await Input.instance({
                          id: idSwapEntityB,
                          label: html`Index B`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 0,
                          placeholder: true,
                        })}
                      </div>
                    </div>
                    <div class="in" style="margin-top: 5px;">
                      ${await BtnIcon.instance({
                        class: 'wfa btn-map-engine-swap-entities',
                        label: html`<i class="fa-solid fa-right-left"></i> Swap Entities`,
                      })}
                    </div>
                  </div>
                  <div class="in" style="margin-top: 10px;">
                    ${await BtnIcon.instance({
                      class: 'wfa btn-map-engine-toggle-rename',
                      attrs: 'aria-expanded="false"',
                      label: html`<i class="fa-solid fa-caret-right map-engine-rename-caret"></i> Rename Object Layer
                        ItemId on Filtered Entities`,
                    })}
                  </div>
                  <div class="in section-mp-border map-engine-rename-body hide" style="margin: 10px; padding: 10px;">
                    <div class="in" style="font-size:12px;color:#888;margin-bottom:8px;">
                      Replaces only exact source ItemId matches inside entities currently visible through the filters.
                      Both fields take comma-separated lists: several targets expand one source into all of them, one
                      target renames every source onto it, and equal counts pair off in the order typed.
                    </div>
                    <div class="fl">
                      <div class="in fll" style="flex:1;padding-right:5px;">
                        ${await Input.instance({
                          id: idRenameSourceObjectLayer,
                          label: html`Source ItemIds`,
                          containerClass: 'inl',
                          type: 'text',
                          placeholder: true,
                        })}
                      </div>
                      <div class="in fll" style="flex:1;padding-left:5px;">
                        ${await Input.instance({
                          id: idRenameTargetObjectLayer,
                          label: html`Target ItemIds`,
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
                  </div>`,
              },
              {
                id: 'media',
                label: 'Media',
                icon: 'fa-solid fa-photo-film',
                content: html`<div class="in section-mp" style="margin-top: 5px;">
                  <div class="in map-engine-media"></div>
                  ${await BtnIcon.instance({
                    class: 'wfa btn-map-engine-media-retry',
                    label: html`<i class="fa-solid fa-rotate-right"></i> Draw the preview again`,
                  })}
                  <div class="in" style="color:#888;font-size:12px;margin:4px 0;">
                    The server draws the map preview from the placed entities after each save. It is the node background
                    in the Instance Map, and the thumbnail while no custom image is set.
                  </div>
                  ${await BtnIcon.instance({
                    class: 'wfa btn-map-engine-toggle-thumbnail',
                    attrs: 'aria-expanded="false"',
                    label: html`<i class="fa-solid fa-caret-right map-engine-thumbnail-caret"></i> Custom thumbnail
                      (optional)`,
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
                          if (!file) return;
                          MapEngineCyberia.thumbnailDirty = true;
                          MapEngineCyberia.pendingThumbnailUrl = URL.createObjectURL(file);
                          MapEngineCyberia.renderMedia();
                        },
                        clear: () => {
                          MapEngineCyberia.thumbnailDirty = true;
                          MapEngineCyberia.currentThumbnailId = null;
                          MapEngineCyberia.pendingThumbnailUrl = null;
                          MapEngineCyberia.renderMedia();
                        },
                      },
                    )}
                  </div>
                  ${await MapAudioCyberia.renderPanel()}
                </div>`,
              },
              {
                id: 'library',
                label: 'Library',
                icon: 'fa-solid fa-folder-open',
                content: html`${managementTableHtml}`,
              },
            ],
          })}
        </div>`,
      })}
    </div>`;
  }
}

export { MapEngineCyberia };
