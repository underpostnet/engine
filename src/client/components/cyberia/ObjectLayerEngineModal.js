import { CoreService } from '../../services/core/core.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { borderChar, dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Translate } from '../core/Translate.js';
import { s, append, hexToRgbA } from '../core/VanillaJs.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams, RouterEvents } from '../core/Router.js';
import { s4 } from '../core/CommonJs.js';
import { Input } from '../core/Input.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { AgGrid } from '../core/AgGrid.js';
import { Modal } from '../core/Modal.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import * as _ from '../cyberia/ObjectLayerEngine.js';
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

const ObjectLayerEngineModal = {
  selectItemType: 'skin',
  itemActivable: false,
  renderFrameDuration: 100,
  existingObjectLayerId: null,
  originalDirectionCodes: [],
  selectedDistortionType: DEFAULT_DISTORTION_TYPE,
  distortionFactorA: DEFAULT_DISTORTION_FACTOR_A,
  templates: [
    {
      label: 'empty',
      id: 'empty',
      data: [],
    },
  ],
  statDescriptions: {
    effect: {
      title: 'Effect',
      icon: 'fa-solid fa-burst',
      description: 'Amount of life removed when an entity collides or deals an impact.',
      detail: 'Measured in life points.',
    },
    resistance: {
      title: 'Resistance',
      icon: 'fa-solid fa-shield',
      description: "Adds to the owner's maximum life (survivability cap).",
      detail:
        "This value is summed with the entity's base max life. It also increases the amount of life restored when a regeneration event occurs (adds directly to current life).",
    },
    agility: {
      title: 'Agility',
      icon: 'fa-solid fa-person-running',
      description: 'Increases the movement speed of entities.',
      detail: 'Higher values result in faster movement.',
    },
    range: {
      title: 'Range',
      icon: 'fa-solid fa-bullseye',
      description: 'Increases the lifetime of a cast/summoned entity.',
      detail: 'Measured in milliseconds.',
    },
    intelligence: {
      title: 'Intelligence',
      icon: 'fa-solid fa-brain',
      description: 'Probability-based stat that increases the chance to spawn/trigger a summoned entity.',
      detail: 'Higher values increase summoning success rate.',
    },
    utility: {
      title: 'Utility',
      icon: 'fa-solid fa-wrench',
      description: 'Reduces the cooldown time between actions, allowing for more frequent actions.',
      detail: 'It also increases the chance to trigger life-regeneration events.',
    },
  },

  RenderTemplate: (colorTemplate) => {
    const ole = s('object-layer-engine');
    if (!ole) {
      return;
    }

    if (colorTemplate.length === 0) {
      ole.clear();
      return;
    }

    const matrix = colorTemplate.map((row) => row.map((hex) => [...hexToRgbA(hex), 255]));
    ole.loadMatrix(matrix);
  },
  ObjectLayerData: {},
  clearData: function () {
    this.ObjectLayerData = {};
    this.selectItemType = 'skin';
    this.itemActivable = false;
    this.renderFrameDuration = 100;
    this.existingObjectLayerId = null;
    this.originalDirectionCodes = [];
    this.selectedDistortionType = DEFAULT_DISTORTION_TYPE;
    this.distortionFactorA = DEFAULT_DISTORTION_FACTOR_A;
    this.templates = [
      {
        label: 'empty',
        id: 'empty',
        data: [],
      },
    ];

    const ole = s('object-layer-engine');
    if (ole && typeof ole.clear === 'function') {
      ole.clear();
    }

    const directionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];
    for (const directionCode of directionCodes) {
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
    const statTypes = Object.keys(ObjectLayerEngineModal.statDescriptions);
    for (const stat of statTypes) {
      const statInput = s(`#ol-input-item-stats-${stat}`);
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
  },
  loadFromDatabase: async (objectLayerId) => {
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

      // Load render data separately (heavy)
      const { status: renderStatus, data: objectLayerRenderFramesData } = await ObjectLayerService.getRender({
        id: objectLayerId,
      });

      if (renderStatus !== 'success' || !objectLayerRenderFramesData) {
        NotificationManager.Push({
          html: `Failed to load object layer render data`,
          status: 'error',
        });
        return null;
      }

      return { metadata, objectLayerRenderFramesId: objectLayerRenderFramesData.objectLayerRenderFramesId };
    } catch (error) {
      console.error('Error loading object layer from database:', error);
      NotificationManager.Push({
        html: `Error loading object layer: ${error.message}`,
        status: 'error',
      });
      return null;
    }
  },
  Render: async (options = { idModal: '', appStore: {} }) => {
    // Clear all cached data at the start of each render to prevent contamination
    ObjectLayerEngineModal.clearData();

    const { appStore } = options;

    const directionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];
    const directionCodeLabels = {
      '08': 'Down Idle',
      18: 'Down Walk',
      '02': 'Up Idle',
      12: 'Up Walk',
      '04': 'Left Idle',
      14: 'Left Walk',
      '06': 'Right Idle',
      16: 'Right Walk',
    };
    const itemTypes = ['skin', 'weapon', 'armor', 'artifact', 'floor', 'resource', 'obstacle', 'foreground', 'portal'];
    const statTypes = ['effect', 'resistance', 'agility', 'range', 'intelligence', 'utility'];
    const distortionDropdownId = 'ol-dropdown-distortion-type';
    const distortionApplyBtnClass = 'ol-btn-apply-distortion';
    const distortionStatusClass = 'ol-distortion-status';

    // Check if we have an 'id' query parameter to load existing object layer
    const queryParams = getQueryParams();
    let loadedData = null;

    // Track frame editing state
    let editingFrameId = null;
    let editingDirectionCode = null;

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

    if (queryParams.id) {
      ObjectLayerEngineModal.existingObjectLayerId = queryParams.id;
      loadedData = await ObjectLayerEngineModal.loadFromDatabase(queryParams.id);

      if (loadedData) {
        const { metadata, objectLayerRenderFramesId } = loadedData;

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
          if (objectLayerRenderFramesId) {
            ObjectLayerEngineModal.renderFrameDuration = objectLayerRenderFramesId.frame_duration || 100;
          }
        }
      }
    }

    if (ObjectLayerEngineModal.templates.length === 1) {
      for (const url of [
        `${getProxyPath()}assets/templates/item-skin-08.json`,
        `${getProxyPath()}assets/templates/item-skin-06.json`,
      ]) {
        const id = url.split('/').pop().replace('.json', '');
        ObjectLayerEngineModal.templates.push({
          label: id,
          id,
          data: JSON.parse(await CoreService.getRaw({ url })).color,
        });
      }
    }

    let cellsW = 26;
    let cellsH = 26;
    if (loadedData && loadedData.objectLayerRenderFramesId && loadedData.objectLayerRenderFramesId.frames) {
      const frames = loadedData.objectLayerRenderFramesId.frames;
      for (const direction of Object.keys(frames)) {
        if (frames[direction] && frames[direction].length > 0 && frames[direction][0].length > 0) {
          cellsH = frames[direction][0].length;
          cellsW = frames[direction][0][0].length;
          break;
        }
      }
    }
    const pixelSize = parseInt(320 / Math.max(cellsW, cellsH));
    const idSectionA = 'template-section-a';
    const idSectionB = 'template-section-b';
    const colorPaletteClass = 'ol-color-palette';

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
            ${await BtnIcon.Render({
              label: html`<i class="fa-solid fa-edit"></i>`,
              class: `abs direction-code-bar-edit-btn direction-code-bar-edit-btn-${id}`,
            })}
            ${await BtnIcon.Render({
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

    // Helper function to process and add frame from PNG URL using ObjectLayerPngLoader
    const processAndAddFrameFromPngUrl = async (directionCode, pngUrl) => {
      // Wait for components to be available with retry logic
      let ole = s('object-layer-engine');
      let loader = s('object-layer-png-loader');

      if (!ole || !loader) {
        console.warn('object-layer-engine or object-layer-png-loader component not found after retries');
        return;
      }

      try {
        // Load PNG using the loader component - it will automatically load into the editor
        await loader.loadPngUrl(pngUrl);

        // Export as blob and JSON from component after loading
        const image = await ole.toBlob();
        const json = ole.exportMatrixJSON();
        const id = `frame-loaded-${s4()}-${s4()}`;

        // Add to ObjectLayerData
        if (!ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
          ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
        }
        ObjectLayerEngineModal.ObjectLayerData[directionCode].push({ id, image, json });
        console.log(
          `Stored frame ${id} in direction code ${directionCode}. Total frames:`,
          ObjectLayerEngineModal.ObjectLayerData[directionCode].length,
        );

        // Add to UI
        await addFrameToBar(directionCode, id, image, json);
      } catch (error) {
        console.error('Error loading frame from PNG URL:', error);
      }
    };

    for (const directionCode of directionCodes) {
      directionsCodeBarRender += html`
        <div class="in section-mp-border">
          <div class="fl">
            <div class="in fll">
              <div class="in direction-code-bar-frames-title">${directionCodeLabels[directionCode]}</div>
              <div class="in direction-code-bar-frames-btn">
                ${await BtnIcon.Render({
                  label: html`
                    <i class="fa-solid fa-plus direction-code-bar-frames-btn-icon-add-${directionCode}"></i>
                    <i class="fa-solid fa-edit direction-code-bar-frames-btn-icon-edit-${directionCode} hide"></i>
                  `,
                  class: `direction-code-bar-frames-btn-add direction-code-bar-frames-btn-${directionCode}`,
                })}
              </div>
            </div>
            <div class="frames-${directionCode}"></div>
          </div>
        </div>
      `;
    }

    let statsInputsRender = '';
    for (const statType of statTypes) {
      const statInfo = ObjectLayerEngineModal.statDescriptions[statType];
      const statValue = loadedData?.metadata?.data?.stats?.[statType] || 0;
      statsInputsRender += html`
        <div class="inl" style="margin-bottom: 10px; position: relative;">
          ${await Input.Render({
            id: `ol-input-item-stats-${statType}`,
            label: html`<div
              title="${statInfo.description} ${statInfo.detail}"
              class="inl stat-label-container stat-info-icon"
              style="width: 120px; font-size: 16px; overflow: visible; position: relative;"
            >
              <i class="${statInfo.icon}" style="margin-right: 5px;"></i> ${statInfo.title}
            </div>`,
            containerClass: 'inl',
            type: 'number',
            min: 0,
            max: 10,
            placeholder: true,
            value: statValue,
          })}
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

          // Clear all frames and data at the start to prevent duplication from multiple calls
          // This must happen BEFORE any async operations to avoid race conditions
          for (const directionCode of directionCodes) {
            // Clear DOM frames for this direction code
            const framesContainer = s(`.frames-${directionCode}`);
            if (framesContainer) {
              framesContainer.innerHTML = '';
            }
            // Clear data for this direction code
            ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
          }

          for (const directionCode of directionCodes) {
            // Use IIFE to properly capture directionCode and handle async operations
            await (async (currentDirectionCode) => {
              // Register frame add button handler after DOM is ready
              // Wait longer to ensure all direction bars are rendered

              if (loadedData && loadedData.metadata && loadedData.metadata.data && currentDirectionCode) {
                // Show loading animation only once on first direction that has frames

                const { type, id } = loadedData.metadata.data.item;
                const directions = ObjectLayerEngineModal.getDirectionsFromDirectionCode(currentDirectionCode);

                console.log(`Loading frames for direction code: ${currentDirectionCode}, directions:`, directions);

                // Check if frames exist for any direction mapped to this direction code
                const { frames } = loadedData.objectLayerRenderFramesId;
                for (const direction of directions) {
                  if (frames[direction] && frames[direction].length > 0) {
                    // Track this direction code as having original data
                    if (!ObjectLayerEngineModal.originalDirectionCodes.includes(currentDirectionCode)) {
                      ObjectLayerEngineModal.originalDirectionCodes.push(currentDirectionCode);
                    }
                    // Load frames from static PNG URLs sequentially to avoid race conditions
                    const frameCount = frames[direction].length;
                    console.log(
                      `Found ${frameCount} frames for direction: ${direction} (code: ${currentDirectionCode})`,
                    );
                    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
                      const pngUrl = `${getProxyPath()}assets/${type}/${id}/${currentDirectionCode}/${frameIndex}.png`;
                      console.log(
                        `Loading frame ${frameIndex} for direction code ${currentDirectionCode} from: ${pngUrl}`,
                      );
                      await processAndAddFrameFromPngUrl(currentDirectionCode, pngUrl);
                    }
                    console.log(`Completed loading ${frameCount} frames for direction code: ${currentDirectionCode}`);
                    // Once we found frames for this direction code, we can break to avoid duplicates
                    break;
                  }
                }
              }

              const buttonSelector = `.direction-code-bar-frames-btn-${currentDirectionCode}`;
              console.log(`Registering click handler for: ${buttonSelector}`);

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

      const editor = s('object-layer-engine');
      const colorPalette = s(`.${colorPaletteClass}`);

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

        const nextSnapshot = {
          width: baseFrame.width,
          height: baseFrame.height,
          matrix: transformationResult.matrix,
        };
        const beforeSnapshot = typeof ole._snapshot === 'function' ? ole._snapshot() : null;

        if (
          beforeSnapshot &&
          typeof ole._pushUndo === 'function' &&
          typeof ole._matricesEqual === 'function' &&
          !ole._matricesEqual(beforeSnapshot, nextSnapshot)
        ) {
          ole._pushUndo(beforeSnapshot);
        }

        ole.loadMatrix(transformationResult.matrix);

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

        // Separate render frames data from objectLayer.data
        const objectLayerRenderFramesData = {
          frames: {},
          colors: [],
          frame_duration: ObjectLayerEngineModal.renderFrameDuration,
        };

        const objectLayer = {
          data: {
            stats: {},
            item: {},
            ledger: { type: 'OFF_CHAIN' },
          },
        };
        for (const directionCode of directionCodes) {
          const directions = ObjectLayerEngineModal.getDirectionsFromDirectionCode(directionCode);
          for (const direction of directions) {
            if (!objectLayerRenderFramesData.frames[direction]) objectLayerRenderFramesData.frames[direction] = [];

            if (!(directionCode in ObjectLayerEngineModal.ObjectLayerData)) {
              console.warn('No set directionCodeBarFrameData for directionCode', directionCode);
              continue;
            }

            for (const frameData of ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
              const { matrix } = JSON.parse(frameData.json);
              const frameIndexColorMatrix = [];
              let indexRow = -1;
              for (const row of matrix) {
                indexRow++;
                frameIndexColorMatrix[indexRow] = [];
                let indexCol = -1;
                for (const value of row) {
                  indexCol++;
                  let colorIndex = objectLayerRenderFramesData.colors.findIndex(
                    (color) =>
                      color[0] === value[0] && color[1] === value[1] && color[2] === value[2] && color[3] === value[3],
                  );
                  if (colorIndex === -1) {
                    objectLayerRenderFramesData.colors.push(value);
                    colorIndex = objectLayerRenderFramesData.colors.length - 1;
                  }
                  frameIndexColorMatrix[indexRow][indexCol] = colorIndex;
                }
              }
              objectLayerRenderFramesData.frames[direction].push(frameIndexColorMatrix);
            }
          }
        }
        objectLayerRenderFramesData.frame_duration = parseInt(s(`.ol-input-render-frame-duration`).value);
        objectLayer.data.stats = {
          effect: parseInt(s(`.ol-input-item-stats-effect`).value),
          resistance: parseInt(s(`.ol-input-item-stats-resistance`).value),
          agility: parseInt(s(`.ol-input-item-stats-agility`).value),
          range: parseInt(s(`.ol-input-item-stats-range`).value),
          intelligence: parseInt(s(`.ol-input-item-stats-intelligence`).value),
          utility: parseInt(s(`.ol-input-item-stats-utility`).value),
        };
        objectLayer.data.item = {
          type: ObjectLayerEngineModal.selectItemType,
          activable: ObjectLayerEngineModal.itemActivable,
          id: s(`.ol-input-item-id`).value,
          description: s(`.ol-input-item-description`).value,
        };

        // Add _id only when updating the existing object layer.
        if (isUpdateMode) {
          objectLayer._id = ObjectLayerEngineModal.existingObjectLayerId;
        }

        console.warn(
          'objectLayer',
          objectLayer,
          clone ? '(CLONE MODE)' : isUpdateMode ? '(UPDATE MODE)' : '(CREATE MODE)',
        );

        if (appStore.Data.user.main.model.user.role === 'guest') {
          NotificationManager.Push({
            html: 'Guests cannot save object layers. Please log in.',
            status: 'warning',
          });
          return;
        }

        // Upload images
        {
          // Get all direction codes that currently have frames
          const directionCodesToUpload = Object.keys(ObjectLayerEngineModal.ObjectLayerData);

          // In UPDATE mode, also include original direction codes that may have been cleared
          const allDirectionCodes = isUpdateMode
            ? [...new Set([...directionCodesToUpload, ...ObjectLayerEngineModal.originalDirectionCodes])]
            : directionCodesToUpload;

          console.warn(
            `Uploading frames for ${allDirectionCodes.length} directions:`,
            allDirectionCodes,
            clone ? '(CLONE MODE)' : isUpdateMode ? '(UPDATE MODE)' : '(CREATE MODE)',
          );

          for (const directionCode of allDirectionCodes) {
            const frames = ObjectLayerEngineModal.ObjectLayerData[directionCode] || [];
            console.warn(`Direction ${directionCode}: ${frames.length} frames`);

            // Create FormData with ALL frames for this direction
            const form = new FormData();
            let frameIndex = -1;
            for (const frame of frames) {
              frameIndex++;
              const pngBlob = frame.image;

              if (!pngBlob) {
                console.error(`Frame ${frameIndex} in direction ${directionCode} has no image blob!`);
                continue;
              }

              // Append all frames to the same FormData
              form.append(directionCode, pngBlob, `${frameIndex}.png`);
            }

            // Send all frames for this direction in one request (even if empty, to remove frames)
            try {
              if (isUpdateMode) {
                // UPDATE: use PUT endpoint with object layer ID
                const { status, data } = await ObjectLayerService.put({
                  id: `${ObjectLayerEngineModal.existingObjectLayerId}/frame-image/${objectLayer.data.item.type}/${objectLayer.data.item.id}/${directionCode}`,
                  body: form,
                  headerId: 'file',
                });
                console.warn(`Updated ${frames.length} frames for direction ${directionCode}`);
              } else {
                // CREATE: use POST endpoint (only if frames exist)
                if (frames.length > 0) {
                  const { status, data } = await ObjectLayerService.post({
                    id: `frame-image/${objectLayer.data.item.type}/${objectLayer.data.item.id}/${directionCode}`,
                    body: form,
                    headerId: 'file',
                  });
                  console.warn(`Created ${frames.length} frames for direction ${directionCode}`);
                }
              }
            } catch (error) {
              console.error(`Error uploading frames for direction ${directionCode}:`, error);
              NotificationManager.Push({
                html: `Error uploading frames for direction ${directionCode}: ${error.message}`,
                status: 'error',
              });
              return;
            }
          }

          console.warn('All frames uploaded successfully');
        }

        // Upload metadata
        {
          // Send objectLayerRenderFramesData as top-level field (not in data)
          const requestBody = {
            data: objectLayer.data,
            objectLayerRenderFramesData: objectLayerRenderFramesData,
          };

          let response;
          if (isUpdateMode) {
            // UPDATE existing object layer
            console.warn(
              'PUT path:',
              `${ObjectLayerEngineModal.existingObjectLayerId}/metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
            );
            response = await ObjectLayerService.put({
              id: `${ObjectLayerEngineModal.existingObjectLayerId}/metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
              body: requestBody,
            });
          } else {
            // CREATE new object layer
            response = await ObjectLayerService.post({
              id: `metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
              body: requestBody,
            });
          }

          const { status, data, message } = response;

          if (status === 'success') {
            const successAction = clone ? 'cloned' : isUpdateMode ? 'updated' : 'created';
            NotificationManager.Push({
              html: `Object layer "${objectLayer.data.item.id}" ${successAction} successfully!`,
              status: 'success',
            });
            ObjectLayerEngineModal.toManagement(data?._id || ObjectLayerEngineModal.existingObjectLayerId);
          } else {
            const errorAction = clone ? 'cloning' : isUpdateMode ? 'updating' : 'creating';
            NotificationManager.Push({
              html: `Error ${errorAction} object layer: ${message}`,
              status: 'error',
            });
          }
        }
      };

      EventsUI.onClick(`.ol-btn-save`, async () => {
        await persistObjectLayer();
      });

      EventsUI.onClick(`.ol-btn-clone`, async () => {
        await persistObjectLayer({ clone: true });
      });

      // Add reset button event listener
      EventsUI.onClick(`.ol-btn-reset`, async () => {
        const confirmResult = await Modal.RenderConfirm({
          html: async () => {
            return html`
              <div class="in section-mp" style="text-align: center">
                Are you sure you want to reset the form? All unsaved data will be lost.
              </div>
            `;
          },
          id: `reset-ol-modal-confirm`,
        });

        if (confirmResult.status === 'confirm') {
          NotificationManager.Push({
            html: 'Resetting form to create new object layer...',
            status: 'info',
          });

          // Clear all data
          ObjectLayerEngineModal.clearData();

          setPath(`${getProxyPath()}object-layer-engine`);

          // Reload the modal
          await ObjectLayerEngineModal.Reload();

          NotificationManager.Push({
            html: 'Form reset! Ready to create new object layer.',
            status: 'success',
          });
        }
      });
    });

    return html`
      <style>
        .direction-code-bar-frames-title {
          font-weight: bold;
          font-size: 1.2rem;
          padding: 0.5rem;
          width: 70px;
        }
        .direction-code-bar-frames-img {
          width: 100px;
          height: auto;
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
        .ol-btn-save {
          width: 120px;
          padding: 0.5rem;
          font-size: 20px;
          min-height: 50px;
        }
        .ol-btn-reset {
          width: 120px;
          padding: 0.5rem;
          font-size: 20px;
          min-height: 50px;
        }
        .ol-btn-clone {
          width: 120px;
          padding: 0.5rem;
          font-size: 20px;
          min-height: 50px;
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
        .frame-editor-container-loading {
          width: 100%;
          height: 150px;
          color: #ffcc00;
        }
        .loading-text {
          font-family: 'retro-font';
          font-size: 26px;
        }
      </style>
      ${borderChar(2, 'black', [
        '.sub-title-modal',
        '.frame-editor-container-loading',
        '.direction-code-bar-edit-btn',
        '.direction-code-bar-trash-btn',
        '.direction-code-bar-frames-btn-add',
      ])}
      <div class="in frame-editor-container-loading">
        <div class="abs center frame-editor-container-loading-center"></div>
      </div>
      <div class="in section-mp section-mp-border frame-editor-container">
        <div class="in sub-title-modal"><i class="fa-solid fa-table-cells-large"></i> Frame editor</div>

        <object-layer-engine id="ole" width="${cellsW}" height="${cellsH}" pixel-size="${pixelSize}">
        </object-layer-engine>
        <div class="in section-mp-border" style="margin-top: 10px;">
          <div class="in sub-title-modal"><i class="fa-solid fa-palette"></i> Brush palette</div>
          <color-palette class="${colorPaletteClass}" value="#FF0000"></color-palette>
        </div>
        <div class="in section-mp-border" style="margin-top: 10px;">
          <div class="in sub-title-modal"><i class="fa-solid fa-wand-magic-sparkles"></i> Canvas macro</div>
          <div class="fl" style="align-items: flex-start; gap: 8px; flex-wrap: wrap;">
            <div class="in fll" style="min-width: 240px;">
              ${await DropDown.Render({
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
                    display: html`<div style="padding: 0 6px; color: #9d9d9d;">Mosaic drawing behaviors</div>`,
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
              ${await Input.Render({
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
              ${await BtnIcon.Render({
                class: distortionApplyBtnClass,
                label: html`<i class="fa-solid fa-bolt"></i> Apply To Frame`,
              })}
            </div>
          </div>
          <div class="in ${distortionStatusClass}" style="margin-top: 6px; font-size: 12px; color: #888;">
            ${DEFAULT_DISTORTION_STATUS}
          </div>
        </div>
        <object-layer-png-loader id="loader" editor-selector="#ole"></object-layer-png-loader>
      </div>

      <div class="in section-mp section-mp-border">
        <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Render data</div>
        ${dynamicCol({ containerSelector: options.idModal, id: idSectionA })}

        <div class="fl">
          <div class="in fll ${idSectionA}-col-a">
            <div class="in section-mp">
              ${await DropDown.Render({
                id: 'ol-dropdown-template',
                value: ObjectLayerEngineModal.templates[0].id,
                label: html`${Translate.Render('select-template')}`,
                data: ObjectLayerEngineModal.templates.map((template) => {
                  return {
                    value: template.id,
                    display: html`<i class="fa-solid fa-paint-roller"></i> ${template.label}`,
                    onClick: async () => {
                      ObjectLayerEngineModal.RenderTemplate(template.data);
                    },
                  };
                }),
              })}
            </div>
          </div>
          <div class="in fll ${idSectionA}-col-b">
            <div class="in section-mp-border" style="width: 135px;">
              ${await Input.Render({
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
          </div>
        </div>
        ${directionsCodeBarRender}
      </div>
      ${dynamicCol({ containerSelector: options.idModal, id: idSectionB, type: 'a-50-b-50' })}

      <div class="fl">
        <div class="in fll ${idSectionB}-col-a">
          <div class="in section-mp section-mp-border">
            <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Item data</div>
            ${await Input.Render({
              id: `ol-input-item-id`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-id')}`,
              containerClass: '',
              placeholder: true,
              value: loadedData?.metadata?.data?.item?.id || '',
            })}
            ${await Input.Render({
              id: `ol-input-item-description`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-description')}`,
              containerClass: '',
              placeholder: true,
              value: loadedData?.metadata?.data?.item?.description || '',
            })}
            <div class="in section-mp">
              ${await DropDown.Render({
                id: 'ol-dropdown-item-type',
                value: ObjectLayerEngineModal.selectItemType,
                label: html`${Translate.Render('select-item-type')}`,
                data: itemTypes.map((itemType) => {
                  return {
                    value: itemType,
                    display: html`${itemType}`,
                    onClick: async () => {
                      console.warn('itemType click', itemType);
                      ObjectLayerEngineModal.selectItemType = itemType;
                    },
                  };
                }),
              })}
            </div>
            <div class="in section-mp">
              ${await ToggleSwitch.Render({
                id: 'ol-toggle-item-activable',
                wrapper: true,
                wrapperLabel: html`${Translate.Render('item-activable')}`,
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
            ${statsInputsRender}
          </div>
        </div>
      </div>

      <div class="fl section-mp">
        ${await BtnIcon.Render({
          label: html`<i class="submit-btn-icon fa-solid fa-folder-open"></i>
            ${ObjectLayerEngineModal.existingObjectLayerId ? 'Update' : Translate.Render('save')}`,
          class: `in flr ol-btn-save`,
        })}
        ${ObjectLayerEngineModal.existingObjectLayerId
          ? await BtnIcon.Render({
              label: html`<i class="submit-btn-icon fa-solid fa-clone"></i> Clone`,
              class: `in flr ol-btn-clone`,
            })
          : ''}
        ${await BtnIcon.Render({
          label: html`<i class="submit-btn-icon fa-solid fa-broom"></i> ${Translate.Render('reset')}`,
          class: `in flr ol-btn-reset`,
        })}
      </div>
      <div class="in section-mp"></div>
    `;
  },
  getDirectionsFromDirectionCode(directionCode = '08') {
    let objectLayerFrameDirections = [];

    switch (directionCode) {
      case '08':
        objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
        break;
      case '18':
        objectLayerFrameDirections = ['down_walking'];
        break;
      case '02':
        objectLayerFrameDirections = ['up_idle'];
        break;
      case '12':
        objectLayerFrameDirections = ['up_walking'];
        break;
      case '04':
        objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
        break;
      case '14':
        objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
        break;
      case '06':
        objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
        break;
      case '16':
        objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
        break;
    }

    return objectLayerFrameDirections;
  },
  toManagement: async (id = null) => {
    await ObjectLayerEngineModal.clearData();
    const subModalId = 'management';
    const modalId = `modal-object-layer-engine-${subModalId}`;
    await DefaultManagement.runIsolated(modalId, async () => {
      setPath(`${getProxyPath()}object-layer-engine-management`);
      const queryParams = getQueryParams();
      queryParams.id = id ? id : '';
      queryParams.page = 1;
      setQueryParams(queryParams, { replace: true });

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
  },
  Reload: async function () {
    // Clear data before reload to prevent contamination
    ObjectLayerEngineModal.clearData();
    const idModal = 'modal-object-layer-engine';
    if (s(`.modal-object-layer-engine`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  },
};

export { ObjectLayerEngineModal };
