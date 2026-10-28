import { BtnIcon } from '../core/BtnIcon.js';
import { borderChar, Css, dynamicCol, Themes } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Translate } from '../core/Translate.js';
import { s, append, hexToRgbA, htmls } from '../core/VanillaJs.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams, RouterEvents } from '../core/Router.js';
import { s4, commonModeratorGuard } from '../core/CommonJs.js';
import { Input } from '../core/Input.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { AgGrid } from '../core/AgGrid.js';
import { Modal } from '../core/Modal.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { ObjectLayerEngineElement } from './ObjectLayerEngine.js';
import { OBJECT_LAYER_DIRECTION_CODES, OBJECT_LAYER_DIRECTION_LABELS } from './ObjectLayerProtocol.js';
import { framesByDirection, fromWire, sourceFromDirectionFrames, toWire } from './RenderSource.js';
import { renderTemplate, templateSuits } from './PixelTemplate.js';
import { contextIcon, contextIconSrc, contextPanelStyle, mountContextPanel } from './ContextPanel.js';
import { EditorCrud } from '../core/EditorCrud.js';
import { EditorDraftStore } from '../core/EditorDraftStore.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { Tabs } from '../core/Tabs.js';
import '../core/ColorPaletteElement.js';

const CANVAS_BEHAVIOR_ICON = 'fa-solid fa-shapes';

const DISTORTION_TYPES = Object.freeze([
  {
    value: 'position-jitter',
    label: 'Position Jitter',
    group: 'distortion',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'rotation-drift',
    label: 'Rotation Drift',
    group: 'distortion',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'scale-wobble',
    label: 'Scale Wobble',
    group: 'distortion',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'particle-drift',
    label: 'Particle Drift',
    group: 'distortion',
    icon: CANVAS_BEHAVIOR_ICON,
  },
]);

const MOSAIC_TYPES = Object.freeze([
  {
    value: 'mosaic-diamond-checker',
    label: 'Diamond Checker',
    group: 'mosaic',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'mosaic-rhombus-lattice',
    label: 'Rhombus Lattice',
    group: 'mosaic',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'mosaic-zigzag-rows',
    label: 'Zigzag Rows',
    group: 'mosaic',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'mosaic-staggered-tiles',
    label: 'Staggered Tiles',
    group: 'mosaic',
    icon: CANVAS_BEHAVIOR_ICON,
  },
  {
    value: 'mosaic-brick-offset',
    label: 'Brick Offset',
    group: 'mosaic',
    icon: CANVAS_BEHAVIOR_ICON,
  },
]);

const CANVAS_BEHAVIORS = Object.freeze([...DISTORTION_TYPES, ...MOSAIC_TYPES]);

const DEFAULT_DISTORTION_TYPE = DISTORTION_TYPES[0].value;
const DEFAULT_DISTORTION_STATUS =
  'Applies the selected canvas behavior directly to the current editor frame. factorA controls distortion density or mosaic tile scale.';
const DEFAULT_DISTORTION_FACTOR_A = 0.12;
const DIRECTION_PREVIEW_MODAL_ID = 'modal-object-layer-direction-preview';
/* The template that clears the canvas. */
const EMPTY_TEMPLATE = Object.freeze({ id: 'empty', label: 'empty', itemTypes: [] });
const CANVAS_BEHAVIOR_BY_VALUE = Object.freeze(
  Object.fromEntries(CANVAS_BEHAVIORS.map((entry) => [entry.value, entry])),
);
const isMosaicBehavior = (value = '') => CANVAS_BEHAVIOR_BY_VALUE[value]?.group === 'mosaic';
const getCanvasBehaviorDisplay = (value = DEFAULT_DISTORTION_TYPE) => {
  const behavior = CANVAS_BEHAVIOR_BY_VALUE[value] || CANVAS_BEHAVIOR_BY_VALUE[DEFAULT_DISTORTION_TYPE];
  return `<i class="${CANVAS_BEHAVIOR_ICON}"></i> ${behavior.label}`;
};

const hashString = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
};

const clampNumber = (value, min, max) => (value < min ? min : value > max ? max : value);
const lerp = (start, end, factor) => start + (end - start) * factor;
const smoothstep = (value) => value * value * (3 - 2 * value);
const normalizedHash = (seed, x, y) => ((hashString(`${seed}:${x}:${y}`) >>> 0) / 4294967295) * 2 - 1;

const sampleSmoothNoise = (seed, x, y) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);
  const n00 = normalizedHash(seed, x0, y0);
  const n10 = normalizedHash(seed, x1, y0);
  const n01 = normalizedHash(seed, x0, y1);
  const n11 = normalizedHash(seed, x1, y1);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
};

const isVisibleCell = (cell) => Array.isArray(cell) && (cell[3] || 0) > 0;
const cloneMatrix = (matrix = []) => matrix.map((row) => row.map((cell) => cell.slice()));
const modulo = (value, divisor) => {
  if (!divisor) return 0;
  return ((value % divisor) + divisor) % divisor;
};
const normalizeColorCell = (cell = [255, 0, 0, 255]) => [
  clampNumber(Math.round(cell[0] || 0), 0, 255),
  clampNumber(Math.round(cell[1] || 0), 0, 255),
  clampNumber(Math.round(cell[2] || 0), 0, 255),
  clampNumber(Math.round(cell[3] ?? 255), 0, 255),
];
const getRenderedInputNode = (id = '') => s(`.${id}`) || s(`#${id}-name`) || s(`#${id}`);

const countChangedCells = (baseMatrix = [], nextMatrix = []) => {
  const height = Math.max(baseMatrix.length, nextMatrix.length);
  const width = Math.max(baseMatrix[0]?.length || 0, nextMatrix[0]?.length || 0);
  let changedCells = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const baseCell = baseMatrix[y]?.[x] || [0, 0, 0, 0];
      const nextCell = nextMatrix[y]?.[x] || [0, 0, 0, 0];
      if (
        baseCell[0] !== nextCell[0] ||
        baseCell[1] !== nextCell[1] ||
        baseCell[2] !== nextCell[2] ||
        baseCell[3] !== nextCell[3]
      ) {
        changedCells++;
      }
    }
  }

  return changedCells;
};

const deriveMatrixLayerSeed = (matrix = []) => {
  const signature = [];
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < (matrix[y]?.length || 0); x++) {
      const cell = matrix[y][x];
      if (!isVisibleCell(cell)) continue;
      signature.push(`${x}:${y}:${cell.join(',')}`);
    }
  }
  return hashString(`${matrix[0]?.length || 0}x${matrix.length}:${signature.join('|')}`);
};

const colorDistance = (left = [0, 0, 0, 0], right = [0, 0, 0, 0]) => {
  const deltaRed = (left[0] - right[0]) / 255;
  const deltaGreen = (left[1] - right[1]) / 255;
  const deltaBlue = (left[2] - right[2]) / 255;
  const deltaAlpha = ((left[3] || 0) - (right[3] || 0)) / 255;
  return (
    Math.sqrt(deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue + deltaAlpha * deltaAlpha * 0.35) /
    1.83
  );
};

const getNeighborEntries = (matrix, x, y) => {
  const neighbors = [];
  const sourceCell = matrix[y]?.[x] || [0, 0, 0, 0];

  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      if (offsetX === 0 && offsetY === 0) continue;

      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (
        neighborY < 0 ||
        neighborX < 0 ||
        neighborY >= matrix.length ||
        neighborX >= (matrix[neighborY]?.length || 0)
      ) {
        continue;
      }

      const neighborCell = matrix[neighborY][neighborX];
      const visible = isVisibleCell(neighborCell);
      neighbors.push({
        x: neighborX,
        y: neighborY,
        dx: offsetX,
        dy: offsetY,
        cell: neighborCell.slice(),
        visible,
        distance: visible ? colorDistance(sourceCell, neighborCell) : 1,
      });
    }
  }

  return neighbors;
};

const getDistortionTime = (distortionSeed = 0) => (Math.abs(Number(distortionSeed) || 0) % 4096) / 128 + 1;

const getDirectionalVector = ({ x, y, width, height, distortionType, frameSeed, distortionSeed }) => {
  const distortionTime = getDistortionTime(distortionSeed);
  const noiseX = sampleSmoothNoise(frameSeed + 211, x * 0.26 + distortionTime * 0.14, y * 0.26 + 1.9);
  const noiseY = sampleSmoothNoise(frameSeed + 263, x * 0.26 + 7.1, y * 0.26 + distortionTime * 0.14);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  const radialX = deltaX === 0 ? 0 : deltaX / Math.max(1, Math.abs(deltaX) + Math.abs(deltaY));
  const radialY = deltaY === 0 ? 0 : deltaY / Math.max(1, Math.abs(deltaX) + Math.abs(deltaY));

  if (distortionType === 'position-jitter') {
    return { dx: noiseX, dy: noiseY };
  }

  if (distortionType === 'rotation-drift') {
    const tangentDirection = sampleSmoothNoise(frameSeed + 307, distortionTime * 0.24, 3.7) >= 0 ? 1 : -1;
    return {
      dx: tangentDirection * -radialY + noiseX * 0.3,
      dy: tangentDirection * radialX + noiseY * 0.3,
    };
  }

  if (distortionType === 'scale-wobble') {
    const radialDirection = sampleSmoothNoise(frameSeed + 359, distortionTime * 0.18, 4.6) >= 0 ? 1 : -1;
    return {
      dx: radialX * radialDirection + noiseX * 0.2,
      dy: radialY * radialDirection + noiseY * 0.2,
    };
  }

  return {
    dx: (noiseX >= 0 ? 0.6 : -0.6) + noiseX * 0.6,
    dy: (noiseY >= 0 ? 0.6 : -0.6) + noiseY * 0.6,
  };
};

const collectVisibleCells = (matrix = [], layerSeed, frameSeed, distortionType, distortionSeed) => {
  const distortionTime = getDistortionTime(distortionSeed);
  const visibleCells = [];

  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < (matrix[y]?.length || 0); x++) {
      const cell = matrix[y][x];
      if (!isVisibleCell(cell)) continue;

      const neighbors = getNeighborEntries(matrix, x, y);
      const visibleNeighbors = neighbors.filter((neighbor) => neighbor.visible);
      const edgeScore = neighbors.some((neighbor) => !neighbor.visible) ? 1 : 0;
      const variationScore = visibleNeighbors.length
        ? visibleNeighbors.reduce((sum, neighbor) => {
            if (neighbor.distance < 0.01) return sum + 0.04;
            if (neighbor.distance <= 0.35) return sum + (1 - Math.abs(neighbor.distance - 0.14) / 0.21);
            if (neighbor.distance <= 0.55) return sum + 0.18;
            return sum + 0.04;
          }, 0) / visibleNeighbors.length
        : 0;

      const activity = (sampleSmoothNoise(frameSeed + 401, x * 0.24 + distortionTime * 0.1, y * 0.24 + 2.7) + 1) / 2;
      const stabilityBias = 1 - (hashString(`${layerSeed}:${distortionType}:${x}:${y}`) >>> 0) / 4294967295;

      visibleCells.push({
        x,
        y,
        cell: cell.slice(),
        neighbors,
        edgeScore,
        variationScore,
        score: variationScore * 0.58 + edgeScore * 0.2 + activity * 0.18 + stabilityBias * 0.04,
      });
    }
  }

  return visibleCells.sort((left, right) => right.score - left.score);
};

const chooseDistortionTarget = ({ entry, matrix, distortionType, frameSeed, distortionSeed, reservedCells }) => {
  const width = matrix[0]?.length || 0;
  const height = matrix.length;
  const vector = getDirectionalVector({
    x: entry.x,
    y: entry.y,
    width,
    height,
    distortionType,
    frameSeed,
    distortionSeed,
  });
  const vectorLength = Math.hypot(vector.dx, vector.dy) || 1;

  return [...entry.neighbors]
    .map((neighbor) => {
      const alignment =
        (neighbor.dx * vector.dx + neighbor.dy * vector.dy) /
        ((Math.hypot(neighbor.dx, neighbor.dy) || 1) * vectorLength);
      let score = alignment * 0.55;

      if (!neighbor.visible) {
        score += 0.22 + entry.edgeScore * 0.16;
      } else if (neighbor.distance >= 0.01 && neighbor.distance <= 0.38) {
        score += 0.34 + (0.38 - neighbor.distance) * 0.45;
      } else {
        score -= 0.2;
      }

      if (distortionType === 'particle-drift' && Math.abs(neighbor.dx) === 1 && Math.abs(neighbor.dy) === 1) {
        score += 0.16;
      }
      if (distortionType === 'rotation-drift' && Math.abs(neighbor.dx) + Math.abs(neighbor.dy) === 1) {
        score += 0.06;
      }
      if (distortionType === 'scale-wobble' && !neighbor.visible) {
        score += 0.08;
      }
      if (reservedCells.has(`${neighbor.x}:${neighbor.y}`)) {
        score = -Infinity;
      }

      return { ...neighbor, score };
    })
    .sort((left, right) => right.score - left.score)
    .find((candidate) => candidate.score > 0.02);
};

const buildDistortedMatrix = (
  baseMatrix,
  distortionType,
  factorA = DEFAULT_DISTORTION_FACTOR_A,
  distortionSeed = Date.now(),
) => {
  const layerSeed = deriveMatrixLayerSeed(baseMatrix);
  const normalizedSeed = Number.isFinite(distortionSeed) ? distortionSeed : hashString(String(distortionSeed));
  const frameSeed = hashString(`${layerSeed}:${distortionType}:${normalizedSeed}`);
  const visibleCells = collectVisibleCells(baseMatrix, layerSeed, frameSeed, distortionType, normalizedSeed);
  const result = cloneMatrix(baseMatrix);

  if (!visibleCells.length) {
    return { matrix: result, changedCells: 0, appliedDistortions: 0, layerSeed, frameSeed };
  }

  const densityFactor = clampNumber(Number.isFinite(factorA) ? factorA : DEFAULT_DISTORTION_FACTOR_A, 0.01, 1);
  const maxBudget = Math.max(1, Math.round(visibleCells.length * 0.35));
  const distortionBudget = clampNumber(Math.round(visibleCells.length * densityFactor), 1, maxBudget);
  const reservedCells = new Set();
  let appliedDistortions = 0;

  for (const entry of visibleCells) {
    if (appliedDistortions >= distortionBudget) break;

    const sourceKey = `${entry.x}:${entry.y}`;
    if (reservedCells.has(sourceKey)) continue;

    const target = chooseDistortionTarget({
      entry,
      matrix: baseMatrix,
      distortionType,
      frameSeed,
      distortionSeed: normalizedSeed,
      reservedCells,
    });

    if (!target) continue;

    if (target.visible) {
      const nextCell = result[target.y][target.x].slice();
      result[target.y][target.x] = entry.cell.slice();
      result[entry.y][entry.x] = nextCell;
    } else {
      result[target.y][target.x] = entry.cell.slice();
      result[entry.y][entry.x] = [0, 0, 0, 0];
    }

    reservedCells.add(sourceKey);
    reservedCells.add(`${target.x}:${target.y}`);
    appliedDistortions++;
  }

  let changedCells = countChangedCells(baseMatrix, result);

  if (changedCells === 0) {
    for (const entry of visibleCells) {
      const transparentTarget = entry.neighbors.find((neighbor) => !neighbor.visible);
      if (!transparentTarget) continue;
      result[transparentTarget.y][transparentTarget.x] = entry.cell.slice();
      result[entry.y][entry.x] = [0, 0, 0, 0];
      appliedDistortions = 1;
      changedCells = countChangedCells(baseMatrix, result);
      break;
    }
  }

  return {
    matrix: result,
    changedCells,
    appliedDistortions,
    densityFactor,
    layerSeed,
    frameSeed,
  };
};

const getMosaicTileSize = (width, height, factorA = DEFAULT_DISTORTION_FACTOR_A) => {
  const minDimension = Math.max(1, Math.min(width, height));
  const normalizedFactor = clampNumber(Number.isFinite(factorA) ? factorA : DEFAULT_DISTORTION_FACTOR_A, 0.01, 1);
  return clampNumber(
    Math.round(1 + normalizedFactor * Math.max(2, Math.min(10, Math.floor(minDimension / 2)))),
    1,
    minDimension,
  );
};

const buildMosaicMatrix = (
  baseMatrix,
  mosaicType,
  factorA = DEFAULT_DISTORTION_FACTOR_A,
  brushCell = [255, 0, 0, 255],
) => {
  const height = baseMatrix.length;
  const width = baseMatrix[0]?.length || 0;
  const result = cloneMatrix(baseMatrix);

  if (!height || !width) {
    return { matrix: result, changedCells: 0, paintedCells: 0, tileSize: 1 };
  }

  const tileSize = getMosaicTileSize(width, height, factorA);
  const gap = Math.max(1, Math.floor(tileSize / 2));
  const thickness = Math.max(1, Math.ceil(tileSize / 3));
  const paintCell = normalizeColorCell(brushCell);
  let paintedCells = 0;

  const shouldPaint = (x, y) => {
    switch (mosaicType) {
      case 'mosaic-diamond-checker': {
        const span = tileSize * 2 + gap;
        const tileX = Math.floor(x / span);
        const tileY = Math.floor(y / span);
        if ((tileX + tileY) % 2 !== 0) return false;
        const localX = modulo(x, span) - tileSize;
        const localY = modulo(y, span) - tileSize;
        return Math.abs(localX) + Math.abs(localY) <= tileSize - 1;
      }
      case 'mosaic-rhombus-lattice': {
        const period = tileSize * 2 + gap;
        const diagonalA = modulo(x + y, period);
        const diagonalB = modulo(x - y, period);
        return diagonalA < thickness || diagonalB < thickness;
      }
      case 'mosaic-zigzag-rows': {
        const zigzagWidth = Math.max(2, tileSize * 2 + gap);
        const bandHeight = Math.max(1, tileSize);
        const rowIndex = Math.floor(y / bandHeight);
        const localX = modulo(x + (rowIndex % 2) * tileSize, zigzagWidth);
        const ridge = modulo(y, bandHeight);
        return Math.abs(localX - ridge) < thickness || Math.abs(localX - (zigzagWidth - ridge - 1)) < thickness;
      }
      case 'mosaic-staggered-tiles': {
        const step = tileSize + gap;
        const rowIndex = Math.floor(y / step);
        const localX = modulo(x + (rowIndex % 2) * Math.floor(step / 2), step);
        const localY = modulo(y, step);
        return localX < tileSize && localY < tileSize;
      }
      case 'mosaic-brick-offset': {
        const brickWidth = tileSize * 2 + gap;
        const brickHeight = tileSize + gap;
        const rowIndex = Math.floor(y / brickHeight);
        const localX = modulo(x + (rowIndex % 2) * Math.floor(brickWidth / 2), brickWidth);
        const localY = modulo(y, brickHeight);
        return localX < brickWidth - gap && localY < tileSize;
      }
      default:
        return false;
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!shouldPaint(x, y)) continue;
      paintedCells++;
      result[y][x] = paintCell.slice();
    }
  }

  return {
    matrix: result,
    changedCells: countChangedCells(baseMatrix, result),
    paintedCells,
    tileSize,
  };
};

class ObjectLayerEngineModal {
  static selectItemType = 'skin';
  static itemActivable = false;
  /** The stat bounds in use: `contract`, those of the item type, or `custom`, ranges the author sets. */
  static statBoundsMode = 'contract';
  static renderFrameDuration = 100;
  static existingObjectLayerId = null;
  static selectedDistortionType = DEFAULT_DISTORTION_TYPE;
  static distortionFactorA = DEFAULT_DISTORTION_FACTOR_A;
  /** Whether a frame import mutates the contour of the frames it brings, and by how much, 0 to 1. */
  static mutateFrames = false;
  static mutationFactor = 0;
  /** The seed of the next frame import: it counts up, so each import is another variation. */
  static importSeed = 0;
  /** The palette editor of a frame import the host's studio mounts: `request()` gives the palette of a mutation. */
  static importPalette = null;
  static templates = [EMPTY_TEMPLATE];
  /** What the host's Studio adds: `context(key)` for the foundation panel, `templates`, and `importPalette` for a frame import. */
  static studio = null;
  /** The palettes of the foundation context of the item: templates paint in the first one. */
  static contextPalettes = [];
  /**
   * The content profile the editor binds: the item type vocabulary and the stat contract the
   * store's writers apply. Set by {@link ObjectLayerEngineModal.instance}.
   * @type {{id:string,itemTypes:ReadonlyArray<string>,statTypes:ReadonlyArray<string>,statDescriptions:Object,statModifierMin:number,statModifierMax:number,validateStats:Function,statBounds:Function,customStatBounds:Function,statProblems:Function,randomStats:Function}|null}
   */
  static profile = null;

  /* Paints a template in the first foundation palette of the item, as one command, and keeps it as the stamp. */
  static RenderTemplate = (template) => {
    const ole = s('object-layer-engine');
    if (!ole) return;
    if (!template.roles && !template.colors) {
      ole.command('Clear', () => ole.clear());
      return;
    }
    const frame = renderTemplate(template, ObjectLayerEngineModal.contextPalettes[0]?.roles ?? {});
    ole.command('PasteTemplate', () => ole.loadMatrix(frame));
    ole.setSymmetry(template.symmetry ?? '');
    ole.setStamp(frame);
  };

  static ObjectLayerData = {};

  static clearData() {
    this.ObjectLayerData = {};
    this.selectItemType = 'skin';
    this.itemActivable = false;
    this.statBoundsMode = 'contract';
    this.renderFrameDuration = 100;
    this.existingObjectLayerId = null;
    this.selectedDistortionType = DEFAULT_DISTORTION_TYPE;
    this.distortionFactorA = DEFAULT_DISTORTION_FACTOR_A;
    this.mutateFrames = false;
    this.mutationFactor = 0;
    this.templates = [EMPTY_TEMPLATE];
    this.contextPalettes = [];

    const ole = s('object-layer-engine');
    if (ole && typeof ole.clear === 'function') {
      ole.clear();
    }

    for (const directionCode of OBJECT_LAYER_DIRECTION_CODES) {
      const framesContainer = s(`.frames-${directionCode}`);
      if (framesContainer) {
        framesContainer.innerHTML = '';
      }
    }

    // Clear form inputs with correct IDs
    const itemIdInput = s('#ol-input-item-id');
    if (itemIdInput) itemIdInput.value = '';

    const itemDescInput = s('#ol-input-item-description');
    if (itemDescInput) itemDescInput.value = '';

    const frameDurationInput = s('#ol-input-render-frame-duration');
    if (frameDurationInput) frameDurationInput.value = '100';

    // Reset toggle switches with correct IDs
    const activableCheckbox = s('#ol-toggle-item-activable');
    if (activableCheckbox) activableCheckbox.checked = false;

    // Clear stat inputs with correct IDs
    const profile = ObjectLayerEngineModal.profile;
    for (const stat of profile?.statTypes ?? []) {
      const statInput = getRenderedInputNode(`ol-input-item-stats-${stat}`);
      if (statInput) statInput.value = '0';
    }

    // Clear DropDown displays
    const templateDropdownCurrent = s(`.dropdown-current-ol-dropdown-template`);
    if (templateDropdownCurrent) templateDropdownCurrent.innerHTML = '';

    const itemTypeDropdownCurrent = s(`.dropdown-current-ol-dropdown-item-type`);
    if (itemTypeDropdownCurrent) itemTypeDropdownCurrent.innerHTML = 'skin';

    const distortionDropdownCurrent = s(`.dropdown-current-ol-dropdown-distortion-type`);
    if (distortionDropdownCurrent) {
      distortionDropdownCurrent.innerHTML = getCanvasBehaviorDisplay(DEFAULT_DISTORTION_TYPE);
    }

    const distortionFactorInput = s('#ol-input-distortion-factor-a') || s('.ol-input-distortion-factor-a');
    if (distortionFactorInput) distortionFactorInput.value = String(DEFAULT_DISTORTION_FACTOR_A);

    const distortionStatusNode = s(`.ol-distortion-status`);
    if (distortionStatusNode) {
      distortionStatusNode.style.color = '#888';
      distortionStatusNode.innerHTML = DEFAULT_DISTORTION_STATUS;
    }
  }

  static loadFromDatabase = async (objectLayerId) => {
    try {
      // Load metadata first (lightweight)
      const { status: metaStatus, data: metadata } = await ObjectLayerService.getMetadata({ id: objectLayerId });

      if (metaStatus !== 'success' || !metadata) {
        NotificationManager.Push({
          html: `Failed to load object layer metadata`,
          status: 'error',
        });
        return null;
      }

      // Load the editor source separately (heavy)
      const { status: renderStatus, data: render } = await ObjectLayerService.getRender({ id: objectLayerId });

      if (renderStatus !== 'success' || !render) {
        NotificationManager.Push({
          html: `Failed to load object layer render data`,
          status: 'error',
        });
        return null;
      }

      return { metadata, renderSource: render.renderFrames ? fromWire(render.renderFrames) : null };
    } catch (error) {
      console.error('Error loading object layer from database:', error);
      NotificationManager.Push({
        html: `Error loading object layer: ${error.message}`,
        status: 'error',
      });
      return null;
    }
  };

  static instance = async (options = { idModal: '', appStore: {}, profile: null, studio: null }) => {
    if (!options.profile) throw new Error('ObjectLayerEngineModal.instance requires a content profile');
    ObjectLayerEngineModal.profile = options.profile;
    ObjectLayerEngineModal.studio = options.studio ?? null;
    // Clear all cached data at the start of each render to prevent contamination
    ObjectLayerEngineModal.clearData();

    const { appStore, profile } = options;
    const canMutate = commonModeratorGuard(appStore?.Data?.user?.main?.model?.user?.role || 'guest');

    const directionCodes = OBJECT_LAYER_DIRECTION_CODES;
    const directionCodeLabels = OBJECT_LAYER_DIRECTION_LABELS;
    const statTypes = profile.statTypes;
    const { statModifierMin, statModifierMax } = profile;

    // The profile's authorable item types. A per-render copy so a loaded layer's custom type
    // can be appended without mutating the profile.
    const itemTypes = [...profile.itemTypes];

    const distortionDropdownId = 'ol-dropdown-distortion-type';
    const distortionApplyBtnClass = 'ol-btn-apply-distortion';
    const distortionStatusClass = 'ol-distortion-status';
    const statsRandomizeBtnClass = 'ol-btn-randomize-stats';
    const statsCorrectBtnClass = 'ol-btn-correct-stats';

    // ?cid=<key> opens the editor on a stored definition: its cid, its document id, or the
    // item label the host's catalog binds.
    const queryParams = getQueryParams();
    let loadedData = null;

    // Track frame editing state
    let editingFrameId = null;
    let editingDirectionCode = null;

    const setMutateFrames = (mutate) => {
      ObjectLayerEngineModal.mutateFrames = mutate;
      if (s('.ol-input-mutation-factor')) s('.ol-input-mutation-factor').disabled = !mutate;
      if (s('.ol-import-palette')) s('.ol-import-palette').hidden = !mutate;
    };

    const readDistortionFactorA = () => {
      const factorInput = s('.ol-input-distortion-factor-a') || s('#ol-input-distortion-factor-a');
      const parsedFactor = Number.parseFloat(factorInput?.value);
      const normalizedFactor = clampNumber(
        Number.isFinite(parsedFactor)
          ? parsedFactor
          : ObjectLayerEngineModal.distortionFactorA || DEFAULT_DISTORTION_FACTOR_A,
        0.01,
        1,
      );

      ObjectLayerEngineModal.distortionFactorA = normalizedFactor;
      if (factorInput) {
        factorInput.value = String(Math.round(normalizedFactor * 100) / 100);
      }

      return normalizedFactor;
    };

    // The stat bounds in use: those of the item type, or the custom ranges the author sets inside the
    // stat contract. A save in custom bounds sends them, and the server checks the same bounds.
    const statInputs = () =>
      Object.fromEntries(statTypes.map((key) => [key, getRenderedInputNode(`ol-input-item-stats-${key}`)]));
    const statValues = () =>
      Object.fromEntries(
        Object.entries(statInputs()).map(([key, input]) => [key, input?.value.trim() ? Number(input.value) : NaN]),
      );
    const customRanges = () =>
      Object.fromEntries(
        statTypes.map((key) => [key, ['min', 'max'].map((end) => Number(s(`.ol-stat-${end}-${key}`)?.value))]),
      );
    const activeBounds = () => {
      if (ObjectLayerEngineModal.statBoundsMode !== 'custom')
        return { bounds: profile.statBounds(ObjectLayerEngineModal.selectItemType), error: '' };
      try {
        return { bounds: profile.customStatBounds(customRanges()), error: '' };
      } catch (error) {
        return { bounds: null, error: error.message };
      }
    };
    const boundsName = () =>
      ObjectLayerEngineModal.statBoundsMode === 'custom' ? 'custom' : ObjectLayerEngineModal.selectItemType;
    const checkStatInputs = () => {
      const { bounds, error } = activeBounds();
      const problems = bounds ? profile.statProblems(bounds, statValues()) : [];
      const invalid = new Set(problems.map(({ key }) => key));
      for (const [key, input] of Object.entries(statInputs())) {
        if (!input) continue;
        input.setAttribute('aria-invalid', String(invalid.has(key)));
        input.classList.toggle('ol-stat-invalid', invalid.has(key));
      }
      const list = s('.ol-stats-problems');
      if (list)
        list.textContent = error
          ? `Custom bounds: ${error}`
          : problems.length
            ? `Outside the ${boundsName()} bounds: ${problems.map(({ key, value, min, max }) => `${profile.statDescriptions[key].title} ${Number.isNaN(value) ? 'empty' : value} (${min} to ${max})`).join('; ')}.`
            : '';
      if (s(`.${statsCorrectBtnClass}`)) s(`.${statsCorrectBtnClass}`).hidden = problems.length === 0;
      return error ? [{ error }] : problems;
    };
    const syncStatBounds = () => {
      const custom = ObjectLayerEngineModal.statBoundsMode === 'custom';
      const select = s('.ol-select-stat-bounds');
      if (select) {
        select.options[0].textContent = `${ObjectLayerEngineModal.selectItemType} · STAT_TYPE_BOUNDS`;
        select.value = custom ? 'custom' : 'contract';
      }
      if (s('.ol-stat-bounds-hint'))
        s('.ol-stat-bounds-hint').textContent = custom
          ? `Set each range inside ${statModifierMin} to ${statModifierMax}. A stat outside its range cannot be saved.`
          : 'The bounds follow the item type. A stat outside them cannot be saved.';
      const { bounds } = activeBounds();
      for (const [key, input] of Object.entries(statInputs())) {
        if (bounds && input) Object.assign(input, { min: bounds[key][0], max: bounds[key][1] });
        if (s(`.ol-stat-range-${key}`)) {
          s(`.ol-stat-range-${key}`).hidden = custom;
          if (bounds) s(`.ol-stat-range-${key}`).textContent = `${bounds[key][0]} — ${bounds[key][1]}`;
        }
        if (s(`.ol-stat-custom-${key}`)) s(`.ol-stat-custom-${key}`).hidden = !custom;
      }
      checkStatInputs();
    };
    // Custom ranges start from the bounds of the item type, widened to any stat already outside them.
    const fillCustomRanges = () => {
      const typed = profile.statBounds(ObjectLayerEngineModal.selectItemType);
      const values = statValues();
      for (const key of statTypes) {
        const value = Number.isInteger(values[key]) ? values[key] : typed[key][0];
        if (s(`.ol-stat-min-${key}`)) s(`.ol-stat-min-${key}`).value = String(Math.min(typed[key][0], value));
        if (s(`.ol-stat-max-${key}`)) s(`.ol-stat-max-${key}`).value = String(Math.max(typed[key][1], value));
      }
    };
    const randomizeStatInputs = () => {
      const { bounds, error } = activeBounds();
      if (!bounds) return NotificationManager.Push({ html: `Custom bounds: ${error}`, status: 'error' });
      const stats = profile.randomStats(bounds);
      for (const [key, input] of Object.entries(statInputs())) if (input) input.value = String(stats[key]);
      checkStatInputs();
      NotificationManager.Push({ html: `Stats randomized within the ${boundsName()} bounds.`, status: 'success' });
    };
    const correctStatInputs = () => {
      if (!activeBounds().bounds) return;
      const changes = checkStatInputs().map(({ key, value, min, max }) => {
        const next = Number.isNaN(value)
          ? Math.max(min, Math.min(max, 0))
          : Math.max(min, Math.min(max, Math.trunc(value)));
        const input = getRenderedInputNode(`ol-input-item-stats-${key}`);
        if (input) input.value = String(next);
        return `${profile.statDescriptions[key].title} ${Number.isNaN(value) ? 'empty' : value} → ${next}`;
      });
      checkStatInputs();
      if (changes.length > 0)
        NotificationManager.Push({ html: `Stats corrected: ${changes.join(', ')}.`, status: 'success' });
    };

    // Helper function to update UI when entering edit mode
    const enterEditMode = (frameId, directionCode) => {
      editingFrameId = frameId;
      editingDirectionCode = directionCode;

      // Hide/disable all "Add Frame" buttons except the one for the editing direction
      directionCodes.forEach((code) => {
        const addButton = s(`.direction-code-bar-frames-btn-${code}`);
        const addButtonParent = addButton?.parentElement;
        if (addButton && addButtonParent) {
          if (code === directionCode) {
            // Keep the button for the editing direction visible and highlighted with animation
            addButton.style.opacity = '1';
            addButton.style.pointerEvents = 'auto';
            addButton.style.border = '2px solid #4CAF50';
            addButton.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
            addButtonParent.classList.add('edit-mode-active');
          } else {
            // Hide/disable buttons for other directions
            addButton.style.opacity = '0.3';
            addButton.style.pointerEvents = 'none';
            addButton.style.filter = 'grayscale(100%)';
            addButton.style.cursor = 'not-allowed';
          }
        }
      });

      // Change the edit button to close button for the frame being edited
      const editBtn = s(`.direction-code-bar-edit-btn-${frameId}`);
      if (editBtn) {
        editBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
        editBtn.classList.add('edit-mode-active');
        editBtn.title = 'Cancel editing (Esc)';
      }

      // Highlight the frame being edited
      document.querySelectorAll('.direction-code-bar-frames-img').forEach((img) => {
        img.style.border = '';
        img.style.boxShadow = '';
      });
      const frameImg = s(`.direction-code-bar-frames-img-${frameId}`);
      if (frameImg) {
        frameImg.style.border = '3px solid #4CAF50';
        frameImg.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
      }

      // Show notification with better instructions
      NotificationManager.Push({
        html: `<strong>Edit Mode Active</strong><br/>Click the glowing <i class="fa-solid fa-edit"></i> button for direction <strong>${directionCode}</strong> to save, or click <i class="fa-solid fa-times"></i> to cancel.`,
        status: 'info',
      });
      s(`.direction-code-bar-frames-btn-icon-add-${directionCode}`).classList.add('hide');
      s(`.direction-code-bar-frames-btn-icon-edit-${directionCode}`).classList.remove('hide');
    };

    // Helper function to exit edit mode and restore UI
    const exitEditMode = () => {
      const previousEditingFrameId = editingFrameId;

      s(`.direction-code-bar-frames-btn-icon-add-${editingDirectionCode}`).classList.remove('hide');
      s(`.direction-code-bar-frames-btn-icon-edit-${editingDirectionCode}`).classList.add('hide');

      editingFrameId = null;
      editingDirectionCode = null;

      // Restore all "Add Frame" buttons
      directionCodes.forEach((code) => {
        const addButton = s(`.direction-code-bar-frames-btn-${code}`);
        const addButtonParent = addButton?.parentElement;
        if (addButton) {
          addButton.style.opacity = '1';
          addButton.style.pointerEvents = 'auto';
          addButton.style.border = '';
          addButton.style.filter = 'none';
          addButton.style.cursor = 'pointer';
          addButton.style.boxShadow = '';
          if (addButtonParent) {
            addButtonParent.classList.remove('edit-mode-active');
          }
        }
      });

      // Restore edit button icon if it exists
      if (previousEditingFrameId) {
        const editBtn = s(`.direction-code-bar-edit-btn-${previousEditingFrameId}`);
        if (editBtn) {
          editBtn.innerHTML = '<i class="fa-solid fa-edit"></i>';
          editBtn.classList.remove('edit-mode-active');
          editBtn.title = 'Edit frame';
        }
      }

      // Remove all frame borders and shadows
      document.querySelectorAll('.direction-code-bar-frames-img').forEach((img) => {
        img.style.border = '';
        img.style.boxShadow = '';
      });
    };

    // A cid opens exactly that revision; an item id opens the revision the item runs.
    const cid = queryParams.cid ?? '';
    if (cid) {
      loadedData = await ObjectLayerEngineModal.loadFromDatabase(cid);

      if (loadedData) {
        const { metadata, renderSource } = loadedData;
        // Writes address the document the key resolved to; changed content publishes a new one.
        ObjectLayerEngineModal.existingObjectLayerId = metadata._id;

        // Set form values from metadata
        if (metadata.data) {
          if (metadata.data.item) {
            ObjectLayerEngineModal.selectItemType = metadata.data.item.type || itemTypes[0];
            ObjectLayerEngineModal.itemActivable = metadata.data.item.activable || false;

            // Add loaded item type to itemTypes array if it doesn't exist
            if (ObjectLayerEngineModal.selectItemType && !itemTypes.includes(ObjectLayerEngineModal.selectItemType)) {
              itemTypes.push(ObjectLayerEngineModal.selectItemType);
            }
          }
          if (renderSource) {
            ObjectLayerEngineModal.renderFrameDuration = renderSource.frameDurationMs || 100;
          }
        }
      }
    }

    // ?review=<key> opens the definition as a revision under review in the host's Studio, which saves it.
    const review = queryParams.review ? await ObjectLayerEngineModal.studio?.review?.resolve(queryParams.review) : null;
    // A review of a new item names the item: a blank form starts from its id and item type.
    const reviewedItem = !loadedData ? (review?.item ?? null) : null;
    if (reviewedItem) ObjectLayerEngineModal.selectItemType = reviewedItem.type;
    // Outside a review, the host's Studio says whether this revision is the one its item runs.
    const binding =
      loadedData && !review ? await ObjectLayerEngineModal.studio?.binding?.resolve(loadedData.metadata) : null;

    if (ObjectLayerEngineModal.templates.length === 1) {
      ObjectLayerEngineModal.templates.push(...(ObjectLayerEngineModal.studio?.templates ?? []));
    }
    // Templates that suit the item type come first.
    const suitedFirst = [...ObjectLayerEngineModal.templates].sort(
      (a, b) =>
        Number(templateSuits(b, ObjectLayerEngineModal.selectItemType)) -
        Number(templateSuits(a, ObjectLayerEngineModal.selectItemType)),
    );

    const cellsW = loadedData?.renderSource?.width || 16;
    const cellsH = loadedData?.renderSource?.height || 16;
    // const pixelSize = parseInt(320 / Math.max(cellsW, cellsH));
    const pixelSize = 30;
    const idSectionB = 'template-section-b';
    const colorPaletteClass = 'ol-color-palette';
    let directionPreviewRuntime = null;

    const cleanupDirectionPreviewRuntime = () => {
      if (!directionPreviewRuntime) return;
      if (directionPreviewRuntime.intervalId) {
        clearInterval(directionPreviewRuntime.intervalId);
      }
      for (const frameUrl of directionPreviewRuntime.frameUrls || []) {
        URL.revokeObjectURL(frameUrl);
      }
      directionPreviewRuntime = null;
    };

    const cleanupDirectionPreviewModal = () => {
      cleanupDirectionPreviewRuntime();
      if (s(`.${DIRECTION_PREVIEW_MODAL_ID}`)) {
        Modal.removeModal(DIRECTION_PREVIEW_MODAL_ID);
      }
    };

    if (Modal.Data[options.idModal]) {
      Modal.Data[options.idModal].onCloseListener[`${options.idModal}-direction-preview-cleanup`] = () => {
        cleanupDirectionPreviewModal();
        delete Modal.Data[options.idModal]?.onCloseListener?.[`${options.idModal}-direction-preview-cleanup`];
      };
    }

    const getCurrentFrameDuration = () => {
      const durationInput = s('.ol-input-render-frame-duration') || s('#ol-input-render-frame-duration');
      const parsedDuration = Number.parseInt(durationInput?.value, 10);
      return Math.max(
        100,
        Number.isFinite(parsedDuration) ? parsedDuration : ObjectLayerEngineModal.renderFrameDuration || 100,
      );
    };

    const openDirectionPreviewModal = async (directionCode) => {
      const frames = ObjectLayerEngineModal.ObjectLayerData[directionCode] || [];
      if (!frames.length) {
        NotificationManager.Push({
          html: `No frames available yet for ${directionCodeLabels[directionCode] || directionCode}.`,
          status: 'warning',
        });
        return;
      }

      const frameUrls = frames
        .map((frame) => {
          if (!frame?.image) return null;
          return URL.createObjectURL(frame.image);
        })
        .filter(Boolean);

      if (!frameUrls.length) {
        NotificationManager.Push({
          html: `Could not build a local preview for ${directionCodeLabels[directionCode] || directionCode}.`,
          status: 'error',
        });
        return;
      }

      cleanupDirectionPreviewModal();

      const { barConfig } = await Themes[Css.currentTheme]();
      const frameDuration = getCurrentFrameDuration();
      const previewWidth = Math.max(180, cellsW * pixelSize);
      const previewHeight = Math.max(180, cellsH * pixelSize);

      await Modal.instance({
        id: DIRECTION_PREVIEW_MODAL_ID,
        barConfig,
        title: `${directionCodeLabels[directionCode] || directionCode} Preview`,
        html: () => html`
          <div class="in section-mp" style="text-align: center; min-width: ${previewWidth}px;">
            <div class="in" style="font-size: 12px; color: #999; margin-bottom: 8px;">
              ${frames.length} frame${frames.length === 1 ? '' : 's'} at ${frameDuration}ms
            </div>
            <div
              class="in direction-preview-stage"
              style="display: inline-flex; align-items: center; justify-content: center; min-height: ${previewHeight}px; min-width: ${previewWidth}px; background-image: linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; border: 1px solid rgba(255,255,255,0.15);"
            >
              <img
                class="direction-preview-image"
                src="${frameUrls[0]}"
                style="image-rendering: pixelated; width: ${previewWidth}px; height: ${previewHeight}px; object-fit: contain;"
              />
            </div>
            <div class="fl" style="justify-content: center; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
              ${frameUrls.map(
                (frameUrl, frameIndex) => html`
                  <img
                    src="${frameUrl}"
                    style="width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.25);"
                    title="Frame ${frameIndex + 1}"
                  />
                `,
              )}
            </div>
          </div>
        `,
        style: {
          width: `${Math.max(300, previewWidth + 40)}px`,
          height: `${Math.max(260, previewHeight + 150)}px`,
          border: '1px solid rgba(255,255,255,0.15)',
          'z-index': 10,
        },
        slideMenu: 'modal-menu',
      });

      const previewImage = s(`.${DIRECTION_PREVIEW_MODAL_ID} .direction-preview-image`);
      if (!previewImage) {
        cleanupDirectionPreviewRuntime();
        return;
      }

      let currentFrameIndex = 0;
      const advancePreviewFrame = () => {
        if (!previewImage) return;
        currentFrameIndex = (currentFrameIndex + 1) % frameUrls.length;
        previewImage.src = frameUrls[currentFrameIndex];
      };

      directionPreviewRuntime = {
        frameUrls,
        intervalId: frameUrls.length > 1 ? setInterval(advancePreviewFrame, frameDuration) : null,
      };

      if (Modal.Data[DIRECTION_PREVIEW_MODAL_ID]) {
        Modal.Data[DIRECTION_PREVIEW_MODAL_ID].onCloseListener[DIRECTION_PREVIEW_MODAL_ID] = () => {
          cleanupDirectionPreviewRuntime();
          delete Modal.Data[DIRECTION_PREVIEW_MODAL_ID]?.onCloseListener?.[DIRECTION_PREVIEW_MODAL_ID];
        };
      }
    };

    const rgbaToHex = (rgba = [0, 0, 0]) => {
      const red = Math.max(0, Math.min(255, rgba[0] || 0))
        .toString(16)
        .padStart(2, '0');
      const green = Math.max(0, Math.min(255, rgba[1] || 0))
        .toString(16)
        .padStart(2, '0');
      const blue = Math.max(0, Math.min(255, rgba[2] || 0))
        .toString(16)
        .padStart(2, '0');
      return `#${red}${green}${blue}`.toUpperCase();
    };

    let directionsCodeBarRender = '';

    // Keeps the unsaved work of this editor in the browser; set once the editor is mounted.
    let scheduleDraft = () => {};

    // Helper function to add a frame to the direction bar
    const addFrameToBar = async (directionCode, id, image, json) => {
      // Capture directionCode in a local variable to ensure proper closure
      const capturedDirectionCode = directionCode;

      if (!s(`.frames-${capturedDirectionCode}`)) {
        console.warn(`Frames container for direction code ${capturedDirectionCode} not found`);
        return;
      }

      append(
        `.frames-${capturedDirectionCode}`,
        html`
          <div class="in fll ${id}">
            <img
              class="in fll direction-code-bar-frames-img direction-code-bar-frames-img-${id}"
              src="${URL.createObjectURL(image)}"
              data-direction-code="${capturedDirectionCode}"
            />
            ${await BtnIcon.instance({
              label: html`<i class="fa-solid fa-edit"></i>`,
              class: `abs direction-code-bar-edit-btn direction-code-bar-edit-btn-${id}`,
            })}
            ${await BtnIcon.instance({
              label: html`<i class="fa-solid fa-trash"></i>`,
              class: `abs direction-code-bar-trash-btn direction-code-bar-trash-btn-${id}`,
            })}
          </div>
        `,
      );

      EventsUI.onClick(`.direction-code-bar-frames-img-${id}`, async (e) => {
        // Get direction code from data attribute to ensure we're using the correct one
        const clickedDirectionCode = e.target.getAttribute('data-direction-code') || capturedDirectionCode;
        console.log(`Clicked frame ${id} from direction code: ${clickedDirectionCode}`);
        const frameData = ObjectLayerEngineModal.ObjectLayerData[clickedDirectionCode]?.find(
          (frame) => frame.id === id,
        );
        if (frameData && frameData.json) {
          // console.log(`Loading frame data for direction code ${clickedDirectionCode}:`, frameData.json);
          s('object-layer-engine').importMatrixJSON(frameData.json);
        } else {
          console.error(`Frame data not found for id ${id} in direction code ${clickedDirectionCode}`);
        }
      });

      EventsUI.onClick(`.direction-code-bar-trash-btn-${id}`, async () => {
        s(`.${id}`).remove();
        ObjectLayerEngineModal.ObjectLayerData[capturedDirectionCode] = ObjectLayerEngineModal.ObjectLayerData[
          capturedDirectionCode
        ].filter((frame) => frame.id !== id);
        scheduleDraft();

        // Clear edit mode if deleting the frame being edited
        if (editingFrameId === id && editingDirectionCode === capturedDirectionCode) {
          exitEditMode();
        }
      });

      EventsUI.onClick(`.direction-code-bar-edit-btn-${id}`, async () => {
        // Check if this is the frame being edited (close button behavior)
        if (editingFrameId === id && editingDirectionCode === capturedDirectionCode) {
          console.log(`Canceling edit mode for frame ${id}`);
          exitEditMode();
          // Clear the editor
          s('object-layer-engine').clear();
          NotificationManager.Push({
            html: `<i class="fa-solid fa-times-circle"></i> Edit canceled`,
            status: 'info',
          });
          return;
        }

        s(`.direction-code-bar-frames-btn-icon-add-${capturedDirectionCode}`).classList.add('hide');
        s(`.direction-code-bar-frames-btn-icon-edit-${capturedDirectionCode}`).classList.remove('hide');

        console.log(`Edit button clicked for frame ${id} in direction code ${capturedDirectionCode}`);

        // If another frame is being edited, exit that edit mode first
        if (editingFrameId && editingFrameId !== id) {
          exitEditMode();
        }

        // Find the frame data
        const frameData = ObjectLayerEngineModal.ObjectLayerData[capturedDirectionCode]?.find(
          (frame) => frame.id === id,
        );

        if (frameData && frameData.json) {
          // Load the frame into the editor
          s('object-layer-engine').importMatrixJSON(frameData.json);

          // Enter edit mode with UI updates
          enterEditMode(id, capturedDirectionCode);

          console.log(`Entering edit mode for frame ${id} in direction ${capturedDirectionCode}`);
        } else {
          console.error(`Frame data not found for id ${id} in direction code ${capturedDirectionCode}`);
          NotificationManager.Push({
            html: `<i class="fa-solid fa-exclamation-triangle"></i> Error: Frame data not found`,
            status: 'error',
          });
        }
      });
    };

    // Helper function to show loading animation
    const showFrameLoading = () => {
      if (!s(`.frame-editor-container`) || s(`.frame-editor-container`).classList.contains('hide')) return;
      LoadingAnimation.spinner.play(`.frame-editor-container-loading`, 'dual-ring-mini', {
        prepend: html`<span class="inl loading-text">Loading </span><br /><br /> ` + '<div style="color: gray;">',
        append: '</div>',
      });
      s(`.frame-editor-container`).classList.add('hide');
      s(`.frame-editor-container-loading`).classList.remove('hide');
    };

    // Helper function to hide loading animation
    const hideFrameLoading = () => {
      if (!s(`.frame-editor-container-loading`) || s(`.frame-editor-container-loading`).classList.contains('hide'))
        return;
      LoadingAnimation.spinner.stop(`.frame-editor-container-loading`);
      s(`.frame-editor-container-loading`).classList.add('hide');
      s(`.frame-editor-container`).classList.remove('hide');
    };

    // Adds one stored frame to a direction code, rebuilt cell for cell from the render source,
    // never resampled from the asset PNG.
    const processAndAddStoredFrame = async (directionCode, matrix) => {
      try {
        const image = await ObjectLayerEngineElement.matrixToBlob(matrix, pixelSize);
        const json = ObjectLayerEngineElement.matrixJSON(matrix);
        const id = `frame-loaded-${s4()}-${s4()}`;

        if (!ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
          ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
        }
        ObjectLayerEngineModal.ObjectLayerData[directionCode].push({ id, image, json });
        await addFrameToBar(directionCode, id, image, json);
      } catch (error) {
        console.error('Error loading stored frame:', error);
      }
    };

    // Replaces the frames of every direction bar with rgba frames by direction code.
    const fillDirectionBars = async (framesByCode) => {
      for (const directionCode of directionCodes) {
        if (s(`.frames-${directionCode}`)) s(`.frames-${directionCode}`).innerHTML = '';
        ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
        for (const matrix of framesByCode[directionCode] ?? []) await processAndAddStoredFrame(directionCode, matrix);
      }
    };

    for (const directionCode of directionCodes) {
      directionsCodeBarRender += html`
        <div class="in section-mp-border">
          <div class="fl">
            <div class="in fll">
              <div class="in direction-code-bar-frames-title">${directionCodeLabels[directionCode]}</div>
              <div class="fl direction-code-bar-btn-row" style="gap: 6px;">
                ${await BtnIcon.instance({
                  label: html`
                    <i class="fa-solid fa-plus direction-code-bar-frames-btn-icon-add-${directionCode}"></i>
                    <i class="fa-solid fa-edit direction-code-bar-frames-btn-icon-edit-${directionCode} hide"></i>
                  `,
                  class: `direction-code-bar-frames-btn-add direction-code-bar-frames-btn-${directionCode}`,
                })}
                ${await BtnIcon.instance({
                  label: html`<i class="fa-solid fa-play"></i>`,
                  class: `direction-code-bar-preview-btn direction-code-bar-preview-btn-${directionCode}`,
                })}
              </div>
            </div>
            <div class="frames-${directionCode}"></div>
          </div>
        </div>
      `;
    }

    let statsInputsRender = '';
    const initialBounds = profile.statBounds(ObjectLayerEngineModal.selectItemType);
    for (const statType of statTypes) {
      const statInfo = profile.statDescriptions[statType];
      const statValue = loadedData?.metadata?.data?.stats?.[statType] || 0;
      const [statMin, statMax] = initialBounds[statType];
      statsInputsRender += html`
        <div class="inl" style="margin-bottom: 10px; position: relative;">
          ${await Input.instance({
            id: `ol-input-item-stats-${statType}`,
            label: html`<div
              title="${statInfo.description} ${statInfo.detail}"
              class="inl stat-label-container stat-info-icon"
              style="width: 120px; font-size: 16px; overflow: visible; position: relative;"
            >
              <img
                src="${getProxyPath()}assets/ui-icons/${statInfo.icon}"
                style="width: 32px; height: 32px; margin-right: 5px; image-rendering: pixelated; vertical-align: middle;"
              />
              ${statInfo.title}
            </div>`,
            containerClass: 'inl',
            type: 'number',
            min: statMin,
            max: statMax,
            placeholder: true,
            value: statValue,
          })}
          <span class="ol-stat-range ol-stat-range-${statType}" title="Inclusive bounds in use"
            >${statMin} — ${statMax}</span
          >
          <span class="ol-stat-custom ol-stat-custom-${statType}" hidden>
            <input
              class="ol-stat-min-${statType}"
              type="number"
              step="1"
              min="${statModifierMin}"
              max="${statModifierMax}"
              value="${statMin}"
              aria-label="${statInfo.title} minimum"
            />
            —
            <input
              class="ol-stat-max-${statType}"
              type="number"
              step="1"
              min="${statModifierMin}"
              max="${statModifierMax}"
              value="${statMax}"
              aria-label="${statInfo.title} maximum"
            />
          </span>
          <div class="in stat-description">
            ${statInfo.description}<br />
            <span style="color: #888; font-style: italic;">${statInfo.detail}</span>
          </div>
        </div>
      `;
    }

    setTimeout(async () => {
      let loadFramesInProgress = false;
      const loadFrames = async () => {
        // Concurrency guard: skip if already loading to prevent duplicate frames
        if (loadFramesInProgress) {
          console.warn('loadFrames already in progress, skipping duplicate call');
          return;
        }
        loadFramesInProgress = true;

        try {
          showFrameLoading();
          // Object layers with an empty render (no render-frames doc yet) load with zero frames so
          // the user can author them from scratch.
          await fillDirectionBars(loadedData?.metadata?.data ? framesByDirection(loadedData.renderSource) : {});

          for (const directionCode of directionCodes) {
            // Use IIFE to properly capture directionCode and handle async operations
            await (async (currentDirectionCode) => {
              const buttonSelector = `.direction-code-bar-frames-btn-${currentDirectionCode}`;
              const previewButtonSelector = `.direction-code-bar-preview-btn-${currentDirectionCode}`;
              console.log(`Registering click handler for: ${buttonSelector}`);

              EventsUI.onClick(previewButtonSelector, async () => {
                await openDirectionPreviewModal(currentDirectionCode);
              });

              EventsUI.onClick(buttonSelector, async () => {
                console.log(`Add frame button clicked for direction: ${currentDirectionCode}`);
                const ole = s('object-layer-engine');
                if (!ole) {
                  console.error('object-layer-engine not found');
                  return;
                }
                const image = await ole.toBlob();
                const json = ole.exportMatrixJSON();

                // Check if we're in edit mode
                if (editingFrameId && editingDirectionCode) {
                  // Ensure we're clicking the add button for the same direction being edited
                  if (currentDirectionCode !== editingDirectionCode) {
                    NotificationManager.Push({
                      html: `<i class="fa-solid fa-exclamation-circle"></i> Please click the glowing <i class="fa-solid fa-edit"></i> button for direction <strong>${editingDirectionCode}</strong> to save changes, or click <i class="fa-solid fa-times"></i> to cancel.`,
                      status: 'warning',
                    });
                    return; // Don't add a new frame
                  }

                  // UPDATE existing frame
                  console.log(`Updating frame ${editingFrameId} in direction ${editingDirectionCode}`);

                  // Find the frame in the data array
                  const frameArray = ObjectLayerEngineModal.ObjectLayerData[editingDirectionCode];
                  const frameIndex = frameArray?.findIndex((frame) => frame.id === editingFrameId);

                  if (frameIndex !== undefined && frameIndex >= 0) {
                    // Update the frame data while preserving the ID and index
                    frameArray[frameIndex] = {
                      id: editingFrameId,
                      image,
                      json,
                    };

                    // Update the visual representation
                    const imgElement = s(`.direction-code-bar-frames-img-${editingFrameId}`);
                    if (imgElement) {
                      imgElement.src = URL.createObjectURL(image);
                    }

                    console.log(`Frame ${editingFrameId} updated successfully at index ${frameIndex}`);
                    NotificationManager.Push({
                      html: `<i class="fa-solid fa-check-circle"></i> Frame updated successfully at position ${frameIndex + 1}!`,
                      status: 'success',
                    });
                  } else {
                    console.error(`Could not find frame ${editingFrameId} in direction ${editingDirectionCode}`);
                    NotificationManager.Push({
                      html: `<i class="fa-solid fa-exclamation-triangle"></i> Error: Could not find frame to update`,
                      status: 'error',
                    });
                  }

                  // Exit edit mode and restore UI
                  exitEditMode();
                  scheduleDraft();
                } else {
                  // ADD new frame (existing behavior)
                  const id = `frame-capture-${s4()}-${s4()}`;
                  console.log(`Creating new frame ${id} for direction ${currentDirectionCode}`);

                  if (!ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode])
                    ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode] = [];
                  ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode].push({ id, image, json });
                  console.log(
                    `Stored frame ${id} in direction code ${currentDirectionCode}. Total frames:`,
                    ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode].length,
                  );

                  await addFrameToBar(currentDirectionCode, id, image, json);
                  scheduleDraft();
                }
              });
            })(directionCode);
          }
          hideFrameLoading();
        } finally {
          loadFramesInProgress = false;
        }
      };
      RouterEvents[`router-${options.idModal}`] = loadFrames;

      await loadFrames();
      s('object-layer-engine').clear();
      const first = directionCodes.map((code) => ObjectLayerEngineModal.ObjectLayerData[code]?.[0]).find(Boolean);
      if (first) s('object-layer-engine').importMatrixJSON(first.json);

      const editor = s('object-layer-engine');
      const colorPalette = s(`.${colorPaletteClass}`);

      if (editor) EditorLayout.pin(editor, `${options.idModal}-stage`);

      const syncPaletteFromEditor = (event = null) => {
        if (!colorPalette || !editor) {
          return;
        }
        const nextHex = event?.detail?.hex || rgbaToHex(editor.getBrushColor?.());
        if (nextHex && colorPalette.value !== nextHex) {
          colorPalette.value = nextHex;
        }
      };

      const syncEditorFromPalette = (event) => {
        if (!editor) {
          return;
        }
        const nextHex = event.detail?.value || event.detail?.hex;
        if (!nextHex) {
          return;
        }
        const [red, green, blue] = hexToRgbA(nextHex);
        const alpha = editor.getBrushAlpha?.() ?? editor.getBrushColor?.()?.[3] ?? 255;
        editor.setBrushColor([red, green, blue, alpha]);
      };

      if (colorPalette) {
        colorPalette.addEventListener('colorchange', syncEditorFromPalette);
      }
      if (editor) {
        editor.addEventListener('brushcolorchange', syncPaletteFromEditor);
      }
      syncPaletteFromEditor();

      // The foundation context of the item: by the key the editor opened, then by the item id an
      // author types for an item not painted yet.
      ObjectLayerEngineModal.importPalette =
        (await ObjectLayerEngineModal.studio?.importPalette?.(s('.ol-import-palette'), {
          itemId: () => s('.ol-input-item-id')?.value.trim() ?? '',
        })) ?? null;
      if (!ObjectLayerEngineModal.importPalette)
        s('.ol-import-palette').textContent = 'This host offers no palette: Mutate imports the frames as stored.';
      const showContext = async (key) => {
        if (!ObjectLayerEngineModal.studio || !key) return;
        const panel = await ObjectLayerEngineModal.studio.context(key);
        mountContextPanel(s('.ol-context-panel'), panel, 'No foundation definition carries this item label yet.');
        ObjectLayerEngineModal.contextPalettes = panel?.palettes ?? [];
      };
      await showContext(cid || loadedData?.metadata?.data?.item?.id);
      s('.ol-input-item-id')?.addEventListener('change', (event) => {
        showContext(event.target.value.trim());
        ObjectLayerEngineModal.importPalette?.reload();
      });

      // Unsaved work of an item stays in this browser until a save, whatever definition it runs; a
      // draft newer than the stored item is offered back on open.
      const draftKey = `object-layer:${loadedData?.metadata?.data?.item?.id || reviewedItem?.id || 'new'}`;
      const draft = EditorDraftStore.debounced(draftKey);
      const draftState = () => ({
        itemId: s('.ol-input-item-id')?.value ?? '',
        description: s('.ol-input-item-description')?.value ?? '',
        itemType: ObjectLayerEngineModal.selectItemType,
        activable: ObjectLayerEngineModal.itemActivable,
        frameDurationMs:
          Number(s('.ol-input-render-frame-duration')?.value) || ObjectLayerEngineModal.renderFrameDuration,
        frames: Object.fromEntries(
          Object.entries(ObjectLayerEngineModal.ObjectLayerData).map(([code, list]) => [
            code,
            list.map(({ json }) => json),
          ]),
        ),
        canvas: editor.exportMatrixJSON(),
      });
      scheduleDraft = () => draft.save(draftState());
      const discardDraft = async () => {
        draft.cancel();
        await EditorDraftStore.remove(draftKey);
      };
      for (const type of ['command', 'undo', 'redo']) editor.addEventListener(type, scheduleDraft);

      const restoreDraft = async (value) => {
        if (s('.ol-input-item-id')) s('.ol-input-item-id').value = value.itemId;
        if (s('.ol-input-item-description')) s('.ol-input-item-description').value = value.description;
        if (s('.ol-input-render-frame-duration')) s('.ol-input-render-frame-duration').value = value.frameDurationMs;
        ObjectLayerEngineModal.selectItemType = value.itemType;
        ObjectLayerEngineModal.itemActivable = value.activable;
        htmls(`.dropdown-current-ol-dropdown-item-type`, value.itemType);
        syncStatBounds();
        await fillDirectionBars(
          Object.fromEntries(
            Object.entries(value.frames).map(([code, frames]) => [code, frames.map((json) => JSON.parse(json).matrix)]),
          ),
        );
        editor.importMatrixJSON(value.canvas);
      };
      const stored = await EditorDraftStore.get(draftKey);
      const loadedAt = Date.parse(loadedData?.metadata?.updatedAt ?? '') || 0;
      if (stored && stored.savedAt > loadedAt) {
        const answer = await Modal.RenderConfirm({
          html: async () => html`
            <div class="in section-mp" style="text-align: center">
              Recover the unsaved work of ${new Date(stored.savedAt).toLocaleString()}?
            </div>
          `,
          id: 'ol-draft-recover-confirm',
        });
        if (answer.status === 'confirm') await restoreDraft(stored.value);
        else await discardDraft();
      }
      // A new reviewed item starts from one empty down idle frame: a canvas, never artwork.
      if (reviewedItem && !ObjectLayerEngineModal.ObjectLayerData['08']?.length)
        await fillDirectionBars({ '08': [JSON.parse(editor.exportMatrixJSON()).matrix] });

      // Takes the frames of every direction and the frame duration from another object layer: as stored or,
      // with Mutate, in the palette of the import and with a new contour. The item data and the stats stay.
      EventsUI.onClick('.ol-btn-import-frames', async () => {
        const itemId = DropDown.Tokens['ol-dropdown-import-frames']?.value;
        if (typeof itemId !== 'string' || !itemId) return;
        const palette = ObjectLayerEngineModal.importPalette;
        const mutate = ObjectLayerEngineModal.mutateFrames && Boolean(palette);
        if (editingFrameId) exitEditMode();
        const factorInput = s('.ol-input-mutation-factor');
        const mutationFactor = Math.round(clampNumber(Number.parseFloat(factorInput?.value) || 0, 0, 1) * 100) / 100;
        ObjectLayerEngineModal.mutationFactor = mutationFactor;
        if (factorInput) factorInput.value = String(mutationFactor);
        // The server remaps and mutates: the editor only shows its result.
        const { status, data, message } = await ObjectLayerService.importFrames({
          body: {
            id: itemId,
            ...(mutate && { palette: palette.request() }),
            mutate,
            mutationFactor,
            seed: ObjectLayerEngineModal.importSeed++,
            target: s('.ol-input-item-id')?.value.trim() ?? '',
          },
        });
        if (status !== 'success') {
          NotificationManager.Push({ html: message ?? `"${itemId}" has no frames to import`, status: 'error' });
          return;
        }
        const result = { ...data, framesByCode: framesByDirection(fromWire(data.renderFrames)) };
        await fillDirectionBars(result.framesByCode);
        ObjectLayerEngineModal.renderFrameDuration = result.frameDurationMs;
        if (s('.ol-input-render-frame-duration')) s('.ol-input-render-frame-duration').value = result.frameDurationMs;
        scheduleDraft();
        const shown = mutate
          ? `mutated in the palette of the import, factor ${mutationFactor}`
          : 'as stored, with no mutation';
        if (s('.ol-import-status'))
          s('.ol-import-status').textContent =
            `The frames show ${itemId} ${shown}. ${itemId} itself is unchanged; save to keep them in this item.`;
        NotificationManager.Push({
          html: [
            `Frames of "${itemId}" imported: ${result.frames}`,
            mutate
              ? `Mutation: factor ${mutationFactor}, ${result.accepted} accepted, ${result.rejected} rejected`
              : 'Mutation: no',
          ].join('<br />'),
          status: 'success',
        });
      });

      const setDistortionStatus = (message, tone = 'muted') => {
        const statusNode = s(`.${distortionStatusClass}`);
        if (!statusNode) return;
        statusNode.style.color = tone === 'success' ? '#8fd18c' : tone === 'error' ? '#ff8a8a' : '#888';
        statusNode.innerHTML = message;
      };

      const applyDistortionToCurrentFrame = async () => {
        const ole = s('object-layer-engine');
        if (!ole || typeof ole.exportMatrixJSON !== 'function' || typeof ole.loadMatrix !== 'function') return;

        let currentJson = null;
        let currentFrame = null;

        try {
          currentJson = ole.exportMatrixJSON();
          currentFrame = typeof currentJson === 'string' ? JSON.parse(currentJson) : currentJson;
        } catch (error) {
          setDistortionStatus('Could not read the current frame from the editor.', 'error');
          return;
        }

        const currentMatrix = currentFrame?.matrix;
        if (!Array.isArray(currentMatrix) || !currentMatrix.length || !currentMatrix[0]?.length) {
          setDistortionStatus('The current frame has no editable matrix data.', 'error');
          return;
        }
        const selectedDistortionType = ObjectLayerEngineModal.selectedDistortionType || DEFAULT_DISTORTION_TYPE;
        const selectedBehavior =
          CANVAS_BEHAVIOR_BY_VALUE[selectedDistortionType] || CANVAS_BEHAVIOR_BY_VALUE[DEFAULT_DISTORTION_TYPE];
        const distortionFactorA = readDistortionFactorA();
        const isMosaicMode = isMosaicBehavior(selectedDistortionType);

        if (!isMosaicMode && !currentMatrix.some((row) => row.some((cell) => isVisibleCell(cell)))) {
          setDistortionStatus('Paint something on the current frame before applying a distortion.', 'error');
          return;
        }

        const baseFrame = currentFrame;
        let transformationResult = null;

        if (isMosaicMode) {
          const activeBrushColor = normalizeColorCell(ole.getBrushColor?.() || [255, 0, 0, 255]);
          transformationResult = buildMosaicMatrix(
            baseFrame.matrix,
            selectedDistortionType,
            distortionFactorA,
            activeBrushColor,
          );
        } else {
          const seedBase = Date.now() + hashString(currentJson);
          for (let attempt = 0; attempt < 4; attempt++) {
            const distortionSeed = seedBase + attempt * 977;
            transformationResult = buildDistortedMatrix(
              baseFrame.matrix,
              selectedDistortionType,
              distortionFactorA,
              distortionSeed,
            );
            if (transformationResult.changedCells > 0) break;
          }
        }

        if (!transformationResult || transformationResult.changedCells === 0) {
          setDistortionStatus(
            isMosaicMode
              ? 'No visible mosaic was painted on the current frame. Try another factorA value or a different active color.'
              : 'No visible distortion was produced for the current frame. Try applying again or edit the frame shape first.',
            'error',
          );
          return;
        }

        ole.command('CanvasMacro', () => ole.loadMatrix(transformationResult.matrix));

        if (isMosaicMode) {
          setDistortionStatus(
            `${selectedBehavior.label} painted on the current frame with the active color. tileSize ${transformationResult.tileSize}, ${transformationResult.paintedCells || 0} pattern cells, ${transformationResult.changedCells} cells changed, factorA=${distortionFactorA.toFixed(2)}.`,
            'success',
          );
        } else {
          setDistortionStatus(
            `${selectedBehavior.label} applied to the current frame. ${transformationResult.appliedDistortions || 0} local shifts, ${transformationResult.changedCells} cells changed, factorA=${distortionFactorA.toFixed(2)}.`,
            'success',
          );
        }
      };

      EventsUI.onClick(`.${distortionApplyBtnClass}`, async () => {
        await applyDistortionToCurrentFrame();
      });
      setDistortionStatus(DEFAULT_DISTORTION_STATUS);

      EventsUI.onClick(`.${statsRandomizeBtnClass}`, async () => {
        randomizeStatInputs();
      });
      EventsUI.onClick(`.${statsCorrectBtnClass}`, async () => {
        correctStatInputs();
      });
      for (const input of Object.values(statInputs())) input?.addEventListener('input', checkStatInputs);
      for (const key of statTypes)
        for (const end of ['min', 'max']) s(`.ol-stat-${end}-${key}`)?.addEventListener('input', syncStatBounds);
      s('.ol-select-stat-bounds')?.addEventListener('change', (event) => {
        ObjectLayerEngineModal.statBoundsMode = event.target.value;
        if (event.target.value === 'custom') fillCustomRanges();
        syncStatBounds();
      });
      const storedStats = loadedData?.metadata?.data?.stats;
      if (
        storedStats &&
        profile.statProblems(profile.statBounds(ObjectLayerEngineModal.selectItemType), storedStats).length
      ) {
        ObjectLayerEngineModal.statBoundsMode = 'custom';
        fillCustomRanges();
      }
      syncStatBounds();

      if (review) EventsUI.onClick('.ol-btn-review-back', () => ObjectLayerEngineModal.studio.review.close(review));
      if (binding?.bindable && canMutate)
        EventsUI.onClick('.ol-btn-bind', async () => {
          if (await binding.bind()) await ObjectLayerEngineModal.Reload();
        });

      const persistObjectLayer = async ({ clone = false } = {}) => {
        const isUpdateMode = Boolean(ObjectLayerEngineModal.existingObjectLayerId) && !clone;

        // Validate minimum frame_duration 100ms
        const frameDuration = parseInt(s(`.ol-input-render-frame-duration`).value);
        if (!frameDuration || frameDuration < 100) {
          NotificationManager.Push({
            html: 'Frame duration must be at least 100ms',
            status: 'error',
          });
          return;
        }

        // Validate that item.id is not empty
        const itemId = s(`.ol-input-item-id`).value;
        if (!itemId || itemId.trim() === '') {
          NotificationManager.Push({
            html: 'Item ID is required',
            status: 'error',
          });
          return;
        }

        // Validate that direction 08 (down idle) has at least 1 frame (frame index 0)
        if (
          !ObjectLayerEngineModal.ObjectLayerData['08'] ||
          ObjectLayerEngineModal.ObjectLayerData['08'].length === 0
        ) {
          NotificationManager.Push({
            html: 'Direction 08 (down idle) must have at least 1 frame (frame index 0)',
            status: 'error',
          });
          return;
        }

        const objectLayer = {
          data: {
            stats: {},
            item: {},
          },
        };
        // The render source: every frame of every keyframe its direction code feeds.
        let objectLayerRenderFramesData;
        try {
          const framesByCode = Object.fromEntries(
            Object.entries(ObjectLayerEngineModal.ObjectLayerData).map(([directionCode, frames]) => [
              directionCode,
              frames.map((frameData) => JSON.parse(frameData.json).matrix),
            ]),
          );
          objectLayerRenderFramesData = toWire(
            sourceFromDirectionFrames({ framesByCode, frameDurationMs: frameDuration }),
          );
        } catch (error) {
          NotificationManager.Push({ html: error.message, status: 'error' });
          return;
        }
        if (checkStatInputs().length > 0) {
          NotificationManager.Push({
            html: `Some stats or ranges are outside the ${boundsName()} bounds: correct them first.`,
            status: 'error',
          });
          return;
        }
        try {
          objectLayer.data.stats = profile.validateStats(statValues());
        } catch (error) {
          NotificationManager.Push({ html: error.message, status: 'error' });
          return;
        }
        objectLayer.data.item = {
          type: ObjectLayerEngineModal.selectItemType,
          activable: ObjectLayerEngineModal.itemActivable,
          id: s(`.ol-input-item-id`).value,
          description: s(`.ol-input-item-description`).value,
        };

        if (!commonModeratorGuard(appStore.Data.user.main.model.user.role)) {
          NotificationManager.Push({
            html: 'Only moderators and admins can create or edit object layers.',
            status: 'warning',
          });
          return;
        }

        // One request: the definition with its render source inline. MongoDB holds every frame.
        const body = {
          data: objectLayer.data,
          objectLayerRenderFramesData,
          ...(ObjectLayerEngineModal.statBoundsMode === 'custom' && { statBounds: customRanges() }),
          ...(review && { review: queryParams.review }),
        };
        const { status, data, message } = isUpdateMode
          ? await ObjectLayerService.put({ id: ObjectLayerEngineModal.existingObjectLayerId, body })
          : await ObjectLayerService.post({ body });

        if (status === 'success') {
          await discardDraft();
          AtlasSpriteSheetService.invalidateIdlePreview(objectLayer.data.item.id);
          const successAction = clone ? 'cloned' : isUpdateMode ? 'updated' : 'created';
          NotificationManager.Push({
            html: review
              ? `Revision of "${objectLayer.data.item.id}" saved. It returns to review.`
              : `Object layer "${objectLayer.data.item.id}" ${successAction} successfully! The item runs it once you bind it.`,
            status: 'success',
          });
          if (review) ObjectLayerEngineModal.studio.review.close(review);
          else ObjectLayerEngineModal.toManagement(data?._id || ObjectLayerEngineModal.existingObjectLayerId);
        } else {
          const errorAction = clone ? 'cloning' : isUpdateMode ? 'updating' : 'creating';
          NotificationManager.Push({
            html: `Error ${errorAction} object layer: ${message}`,
            status: 'error',
          });
        }
      };

      // New reopens the editor blank, Reset on the stored definition: both drop the draft.
      Tabs.bind(s('.ol-tabs'));
      EditorCrud.bind(s('.ol-crud'), () => ({
        subject: 'object layer',
        id: ObjectLayerEngineModal.existingObjectLayerId,
        name: loadedData?.metadata?.data?.item?.id,
        new: async () => {
          await discardDraft();
          setPath(`${getProxyPath()}object-layer-engine`);
          await ObjectLayerEngineModal.Reload();
        },
        reset: async () => {
          await discardDraft();
          await ObjectLayerEngineModal.Reload();
        },
        ...(canMutate && {
          save: () => persistObjectLayer(),
          ...(!review && { clone: () => persistObjectLayer({ clone: true }) }),
        }),
      }));
    });

    return html`
      <style>
        .direction-code-bar-frames-title {
          font-weight: bold;
          font-size: 1.2rem;
          padding: 0.5rem;
          width: 70px;
        }
        /* One square tile per frame whatever its aspect: a wide frame drawn at natural height
           sat almost entirely under the edit and trash buttons, so a click never reached it. */
        .direction-code-bar-frames-img {
          width: 100px;
          height: 100px;
          object-fit: contain;
          margin: 3px;
          cursor: pointer;
        }
        .direction-code-bar-trash-btn {
          top: 3px;
          left: 30px;
          color: white;
          border: none !important;
        }
        .direction-code-bar-edit-btn {
          top: 3px;
          left: 3px;
          color: white;
          border: none !important;
        }
        .direction-code-bar-frames-btn-add {
          color: white;
          border: none !important;
        }
        .direction-code-bar-preview-btn {
          color: white;
          border: none !important;
        }
        .direction-code-bar-trash-btn:hover {
          background: none !important;
          color: red;
        }
        .direction-code-bar-edit-btn:hover {
          background: none !important;
          color: yellow;
        }
        .direction-code-bar-frames-btn-add:hover {
          background: none !important;
          color: #c7ff58;
        }
        .direction-code-bar-preview-btn:hover {
          background: none !important;
          color: #5ee6ff;
        }
        .ol-btn-randomize-stats {
          min-height: 50px;
          padding: 0.5rem 0.75rem;
        }
        .ol-number-label {
          width: 120px;
          font-size: 16px;
          overflow: hidden;
          font-family: 'retro-font';
        }
        .sub-title-modal {
          color: #ffcc00;
        }
        .stat-label-container {
          display: flex;
          align-items: center;
        }
        .stat-info-icon {
          cursor: default;
        }
        .stat-description {
          padding: 2px 5px;
          border-left: 2px solid #444;
          margin-bottom: 5px;
          max-width: 200px;
        }
        .ol-stat-bounds-field {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        .ol-stat-bounds-hint,
        .ol-stat-range {
          color: #888;
          font-size: 12px;
        }
        .ol-stat-range,
        .ol-stat-custom {
          margin-left: 6px;
          font-variant-numeric: tabular-nums;
        }
        .ol-stat-custom input {
          width: 6ch;
        }
        .ol-stats-problems:not(:empty) {
          color: #ff7a7a;
          margin-bottom: 8px;
        }
        .ol-stat-invalid {
          outline: 2px solid #ff5a5a;
          outline-offset: 1px;
        }
        .ol-import-palette {
          margin: 6px 0;
        }
        .ol-import-status {
          color: #888;
          font-size: 12px;
        }
        .frame-editor-container-loading {
          width: 100%;
          height: 150px;
          color: #ffcc00;
        }
        .loading-text {
          font-family: 'retro-font';
          font-size: 26px;
        }
        ${contextPanelStyle}
      </style>
      ${borderChar(2, 'black', [
        '.sub-title-modal',
        '.frame-editor-container-loading',
        '.direction-code-bar-edit-btn',
        '.direction-code-bar-trash-btn',
        '.direction-code-bar-frames-btn-add',
        '.direction-code-bar-preview-btn',
      ])}
      ${
        review
          ? html`<div class="in section-mp studio-group ol-review-banner">
              <div class="in sub-title-modal"><i class="fa-solid fa-clipboard-check"></i> ${review.title}</div>
              <div class="in" style="font-size: 12px; opacity: 0.7;">${review.detail}</div>
              ${await BtnIcon.instance({
                class: 'ol-btn-review-back',
                label: html`<i class="fa-solid fa-arrow-left"></i> ${review.back}`,
              })}
            </div>`
          : ''
      }
      ${
        binding
          ? html`<div class="in section-mp studio-group ol-binding-banner">
              <div class="in sub-title-modal"><i class="fa-solid fa-link"></i> ${binding.title}</div>
              <div class="in" style="font-size: 12px; opacity: 0.7;">${binding.detail}</div>
              ${
                binding.bindable && canMutate
                  ? await BtnIcon.instance({
                      class: 'ol-btn-bind',
                      label: html`<i class="fa-solid fa-link"></i> Bind as Runtime Version`,
                    })
                  : ''
              }
            </div>`
          : ''
      }
      <div class="in frame-editor-container-loading">
        <div class="abs center frame-editor-container-loading-center"></div>
      </div>
      <div class="in section-mp studio-editor frame-editor-container">
        <div class="in sub-title-modal"><i class="fa-solid fa-table-cells-large"></i> Frame editor</div>

        <object-layer-engine id="ole" width="${cellsW}" height="${cellsH}" pixel-size="${pixelSize}">
          ${EditorCrud.render({ id: 'ol-crud', label: 'Object layer', slot: 'actions' })}
          <div class="in ol-sections">
            ${Tabs.render({
              id: 'ol-tabs',
              label: 'Object layer tools',
              tabs: [
                {
                  id: 'paint',
                  label: 'Paint',
                  icon: 'fa-solid fa-paintbrush',
                  content: html`
                    <div class="in section-mp-border" style="margin-top: 10px;">
                      <div class="in sub-title-modal"><i class="fa-solid fa-palette"></i> Brush palette</div>
                      <color-palette class="${colorPaletteClass}" value="#FF0000"></color-palette>
                    </div>

                    <div class="in section-mp section-mp-border">
                      <div class="in sub-title-modal"><i class="fa-solid fa-paint-roller"></i> Template</div>
                      <div class="in section-mp">
                        ${await DropDown.instance({
                          id: 'ol-dropdown-template',
                          value: suitedFirst[0].id,
                          label: html`${Translate.instance('select-template')}`,
                          data: suitedFirst.map((template) => {
                            const suited =
                              template.itemTypes.length > 0 &&
                              templateSuits(template, ObjectLayerEngineModal.selectItemType);
                            return {
                              value: template.id,
                              display: html`<i class="fa-solid fa-paint-roller"></i>
                                ${template.label}${suited ? ' ★' : ''}`,
                              onClick: async () => {
                                ObjectLayerEngineModal.RenderTemplate(template);
                              },
                            };
                          }),
                        })}
                      </div>
                    </div>
                    <object-layer-png-loader id="loader" editor-selector="#ole"></object-layer-png-loader>
                    <div class="in section-mp-border" style="margin-top: 10px;">
                      <div class="in sub-title-modal"><i class="fa-solid fa-wand-magic-sparkles"></i> Canvas macro</div>
                      <div class="fl" style="align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                        <div class="in fll" style="min-width: 240px;">
                          ${await DropDown.instance({
                            id: distortionDropdownId,
                            value: ObjectLayerEngineModal.selectedDistortionType,
                            label: html`Select behavior`,
                            disableSearchBox: true,
                            data: [
                              {
                                kind: 'group',
                                value: 'group-distortion-behaviors',
                                display: html`<div style="padding: 0 6px; color: #9d9d9d;">Distortion behaviors</div>`,
                              },
                              ...DISTORTION_TYPES.map((distortion) => ({
                                value: distortion.value,
                                display: html`<i class="${CANVAS_BEHAVIOR_ICON}"></i> ${distortion.label}`,
                                onClick: async () => {
                                  ObjectLayerEngineModal.selectedDistortionType = distortion.value;
                                  readDistortionFactorA();
                                  const statusNode = s(`.${distortionStatusClass}`);
                                  if (statusNode) {
                                    statusNode.style.color = '#888';
                                    statusNode.innerHTML = `${distortion.label} ready for direct canvas apply. factorA controls local distortion density.`;
                                  }
                                },
                              })),
                              {
                                kind: 'group',
                                value: 'group-mosaic-behaviors',
                                display: html`<div style="padding: 0 6px; color: #9d9d9d;">
                                  Mosaic drawing behaviors
                                </div>`,
                              },
                              ...MOSAIC_TYPES.map((mosaic) => ({
                                value: mosaic.value,
                                display: html`<i class="${CANVAS_BEHAVIOR_ICON}"></i> ${mosaic.label}`,
                                onClick: async () => {
                                  ObjectLayerEngineModal.selectedDistortionType = mosaic.value;
                                  readDistortionFactorA();
                                  const statusNode = s(`.${distortionStatusClass}`);
                                  if (statusNode) {
                                    statusNode.style.color = '#888';
                                    statusNode.innerHTML = `${mosaic.label} ready for direct canvas apply. factorA controls tile size and density.`;
                                  }
                                },
                              })),
                            ],
                          })}
                        </div>
                        <div class="in fll" style="width: 120px;">
                          ${await Input.instance({
                            id: `ol-input-distortion-factor-a`,
                            label: html`factorA`,
                            containerClass: 'inl',
                            type: 'number',
                            min: 0.01,
                            max: 1,
                            step: 0.01,
                            value: ObjectLayerEngineModal.distortionFactorA,
                          })}
                        </div>
                        <div class="in fll">
                          ${await BtnIcon.instance({
                            class: distortionApplyBtnClass,
                            label: html`<i class="fa-solid fa-bolt"></i> Apply To Frame`,
                          })}
                        </div>
                      </div>
                      <div class="in ${distortionStatusClass}" style="margin-top: 6px; font-size: 12px; color: #888;">
                        ${DEFAULT_DISTORTION_STATUS}
                      </div>
                    </div>
                  `,
                },
                {
                  id: 'frames',
                  label: 'Frames',
                  icon: 'fa-solid fa-film',
                  content: html`<div class="in section-mp section-mp-border">
                    <div class="in sub-title-modal"><i class="fa-solid fa-film"></i> Frames</div>
                    <div class="in section-mp-border" style="width: 135px;">
                      ${await Input.instance({
                        id: `ol-input-render-frame-duration`,
                        label: html`<div class="inl ol-number-label">
                          <i class="fa-solid fa-chart-simple"></i> Frame duration
                        </div>`,
                        containerClass: 'inl',
                        type: 'number',
                        min: 100,
                        max: 1000,
                        placeholder: true,
                        value: ObjectLayerEngineModal.renderFrameDuration,
                      })}
                    </div>
                    <div class="fl" style="align-items: flex-end; gap: 8px; flex-wrap: wrap;">
                      <div class="in fll">
                        ${await DropDown.instance({
                          id: 'ol-dropdown-import-frames',
                          label: html`Frames of object layer`,
                          data: [],
                          containerClass: 'inl',
                          serviceProvider: async (q) => {
                            const result = await ObjectLayerService.searchItemIds({ q });
                            return result.status === 'success'
                              ? (result.data?.items ?? []).map(({ id }) => ({
                                  value: id,
                                  display: id,
                                  data: id,
                                  onClick: () => {},
                                }))
                              : [];
                          },
                        })}
                      </div>
                      <div class="in fll">
                        <div class="fl" style="align-items: center; gap: 8px;">
                          ${await ToggleSwitch.instance({
                            id: 'ol-toggle-import-mutate',
                            type: 'checkbox',
                            displayMode: 'checkbox',
                            containerClass: 'in fll',
                            checked: ObjectLayerEngineModal.mutateFrames,
                            on: {
                              checked: () => setMutateFrames(true),
                              unchecked: () => setMutateFrames(false),
                            },
                          })}
                          <div class="in fll">Mutate</div>
                        </div>
                      </div>
                      <div class="in fll" style="width: 120px;">
                        ${await Input.instance({
                          id: 'ol-input-mutation-factor',
                          label: html`Random factor`,
                          containerClass: 'inl',
                          type: 'number',
                          min: 0,
                          max: 1,
                          step: 0.01,
                          value: ObjectLayerEngineModal.mutationFactor,
                          disabled: !ObjectLayerEngineModal.mutateFrames,
                        })}
                      </div>
                      <div class="in fll">
                        ${await BtnIcon.instance({
                          class: 'ol-btn-import-frames',
                          label: html`<i class="fa-solid fa-file-import"></i> Import frames`,
                        })}
                      </div>
                    </div>
                    <div class="in ol-import-palette" hidden></div>
                    <div class="in ol-import-status" role="status" aria-live="polite"></div>
                    ${directionsCodeBarRender}
                  </div>`,
                },
                {
                  id: 'item',
                  label: 'Item',
                  icon: 'fa-solid fa-tag',
                  content: html`
                    ${dynamicCol({ containerSelector: 'ol-sections', id: idSectionB, type: 'a-50-b-50' })}

                    <div class="fl">
                      <div class="in fll ${idSectionB}-col-a">
                        <div class="in section-mp section-mp-border">
                          <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Item data</div>
                          ${await Input.instance({
                            id: `ol-input-item-id`,
                            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.instance('item-id')}`,
                            containerClass: '',
                            placeholder: true,
                            value: loadedData?.metadata?.data?.item?.id || reviewedItem?.id || '',
                          })}
                          ${await Input.instance({
                            id: `ol-input-item-description`,
                            label: html`<i class="fa-solid fa-pen-to-square"></i>
                              ${Translate.instance('item-description')}`,
                            containerClass: '',
                            placeholder: true,
                            value: loadedData?.metadata?.data?.item?.description || '',
                          })}
                          <div class="in section-mp">
                            ${await DropDown.instance({
                              id: 'ol-dropdown-item-type',
                              value: ObjectLayerEngineModal.selectItemType,
                              label: html`${Translate.instance('select-item-type')}`,
                              data: itemTypes.map((itemType) => {
                                return {
                                  value: itemType,
                                  display: html`${itemType}`,
                                  onClick: async () => {
                                    ObjectLayerEngineModal.selectItemType = itemType;
                                    syncStatBounds();
                                  },
                                };
                              }),
                            })}
                          </div>
                          <div class="in section-mp">
                            ${await ToggleSwitch.instance({
                              id: 'ol-toggle-item-activable',
                              wrapper: true,
                              wrapperLabel: html`${Translate.instance('item-activable')}`,
                              disabledOnClick: true,
                              checked: ObjectLayerEngineModal.itemActivable,
                              on: {
                                unchecked: () => {
                                  ObjectLayerEngineModal.itemActivable = false;
                                  console.warn('itemActivable', ObjectLayerEngineModal.itemActivable);
                                },
                                checked: () => {
                                  ObjectLayerEngineModal.itemActivable = true;
                                  console.warn('itemActivable', ObjectLayerEngineModal.itemActivable);
                                },
                              },
                            })}
                          </div>
                        </div>
                      </div>
                      <div class="in fll ${idSectionB}-col-b">
                        <div class="in section-mp section-mp-border">
                          <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Stats data</div>
                          <div class="in">${statModifierMin} penalty ↔ 0 neutral ↔ +${statModifierMax} bonus</div>
                          <label class="in ol-stat-bounds-field">
                            <span>Stat bounds</span>
                            <select class="ol-select-stat-bounds" aria-describedby="ol-stat-bounds-hint">
                              <option value="contract" selected>
                                ${ObjectLayerEngineModal.selectItemType} · STAT_TYPE_BOUNDS
                              </option>
                              <option value="custom">Custom bounds</option>
                            </select>
                          </label>
                          <div id="ol-stat-bounds-hint" class="in ol-stat-bounds-hint">
                            The bounds follow the item type. A stat outside them cannot be saved.
                          </div>
                          <div class="fl" style="align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0;">
                            ${await BtnIcon.instance({
                              label: html`<i class="fa-solid fa-dice"></i> Randomize within bounds`,
                              class: statsRandomizeBtnClass,
                            })}
                            ${await BtnIcon.instance({
                              label: html`<i class="fa-solid fa-wand-magic"></i> Correct to bounds`,
                              class: statsCorrectBtnClass,
                            })}
                          </div>
                          <div class="in ol-stats-problems" role="status" aria-live="polite"></div>
                          ${statsInputsRender}
                        </div>
                      </div>
                    </div>
                  `,
                },
                ...(ObjectLayerEngineModal.studio
                  ? [
                      {
                        id: 'context',
                        label: 'Context',
                        image: contextIconSrc(),
                        content: html`<div class="in section-mp section-mp-border">
                          <div class="in sub-title-modal">${contextIcon()} Foundation context</div>
                          <div class="in ol-context-panel"></div>
                        </div>`,
                      },
                    ]
                  : []),
              ],
            })}
            <div class="in section-mp"></div>
          </div>
        </object-layer-engine>
      </div>
    `;
  };

  static toManagement = async (id = null) => {
    await ObjectLayerEngineModal.clearData();
    const subModalId = 'management';
    const modalId = `modal-object-layer-engine-${subModalId}`;
    await DefaultManagement.runIsolated(modalId, async () => {
      setPath(`${getProxyPath()}object-layer-engine-management`);
      // The grid filters by document id; cid belongs to the editor and viewer routes only.
      setQueryParams({ ...getQueryParams(), cid: null, id: id ? id : '', page: 1 }, { replace: true });

      if (id) {
        DefaultManagement.setIdFilter(modalId, id);
      } else {
        DefaultManagement.clearIdFilter(modalId);
      }

      const managerComponent = DefaultManagement.Tokens[modalId];
      if (managerComponent) {
        managerComponent.page = 1;
      }

      s(`.main-btn-object-layer-engine-${subModalId}`).click();

      await DefaultManagement.waitGridReady(modalId);
      await DefaultManagement.loadTable(modalId, { force: true, reload: true });
    });
  };

  /**
   * Opens the editor on `cid`, or on a blank form without one. A host without the editor
   * entry keeps its path: `getProxyPath` reads the first path segment, so a route the host
   * lacks would become the proxy prefix of every later asset and API request.
   * @param {object} [options]
   * @param {string} [options.cid] - The object layer to edit.
   * @param {string} [options.review] - The key of the review the edit belongs to; the host's Studio resolves it.
   *   With no cid it opens a blank form on the item the review names.
   * @returns {boolean} Whether the host offers the editor.
   */
  static open({ cid, review } = {}) {
    const entryEl = s(`.main-btn-object-layer-engine`);
    if (!entryEl) return false;
    setPath(`${getProxyPath()}object-layer-engine`);
    if (cid || review) setQueryParams({ id: null, cid: cid ?? null, review: review ?? null }, { replace: true });
    if (s(`.modal-object-layer-engine`)) setTimeout(() => ObjectLayerEngineModal.Reload());
    entryEl.click();
    return true;
  }

  static async Reload() {
    // Clear data before reload to prevent contamination
    ObjectLayerEngineModal.clearData();
    const idModal = 'modal-object-layer-engine';
    if (s(`.modal-object-layer-engine`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  }
}

export { ObjectLayerEngineModal };
