/**
 * The Map Population workflow of the Procedural Engine view, in four steps that follow the work.
 * **Items**: each item the map needs, grouped by type, with its own starting point, template,
 * palette and variation; Generate adds entries to its gallery, and Select chooses the exact artwork
 * it publishes. **Entity type defaults**: the stored defaults that name the staged items. **Map**: the Map
 * Studio composes the draft, grid and placements, each item drawn by the CID it would run.
 * **Publish**: a check, then a background publication applies everything onto the same map.
 * A population stays on the server, so a reload, another browser or another moderator opens it as
 * it was saved. Every state this view shows comes from the server; it computes none.
 *
 * @module src/client/components/cyberia/ProceduralPopulationCyberia.js
 */
import { Modal } from '../core/Modal.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from '../core/Router.js';
import { htmls, s } from '../core/VanillaJs.js';
import { ObjectLayerEngineModal } from '../objectlayer-studio/ObjectLayerEngineModal.js';
import { animationPace, drawEntities, mapMediaLabel } from './MapPlacementCyberia.js';
import { ProceduralGrid } from './ProceduralGridCyberia.js';
import { ProceduralPalette, swatches } from './ProceduralPaletteCyberia.js';
import { authoringKey } from './SharedDefaultsCyberia.js';
import {
  column,
  decide,
  denied,
  element,
  frameSummary,
  notify,
  readPage,
  refusal,
  shortCid,
  stamp,
} from './ProceduralReviewCyberia.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';
import { CyberiaEntityTypeDefaultService } from '../../services/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';
import { CyberiaProceduralPopulationService as Population } from '../../services/cyberia-procedural-population/cyberia-procedural-population.service.js';
import { CyberiaProceduralProfileService } from '../../services/cyberia-procedural-profile/cyberia-procedural-profile.service.js';

const MAP_STUDIO = 'cyberia-map-engine';
const ENTITY_STUDIO = 'cyberia-entity-engine';
const MAPS_GRID = 'procedural-maps-grid';
const POLL_MS = 3000;
/** The most entries one Generate asks for. */
const MAX_RUNS = 4;
/** Pixels per cell of each zoom of the map preview; `fit` shows the whole map. */
const ZOOMS = Object.freeze({ fit: 0, '1×': 8, '2×': 16 });
/** The greatest height of the map preview, as a part of the window height. */
const FRAME_HEIGHT = 0.7;
const STEPS = Object.freeze([
  ['items', 'Items', 'fa-solid fa-cubes'],
  ['defaults', 'Entity type defaults', 'fa-solid fa-diagram-project'],
  ['map', 'Map', 'fa-solid fa-map-location-dot'],
  ['publish', 'Publish', 'fa-solid fa-cloud-arrow-up'],
]);
const STEP_STATES = Object.freeze({
  'not-started': ['fa-regular fa-circle', 'procedural-muted', 'Not started'],
  'in-progress': ['fa-solid fa-circle-half-stroke', '', 'In progress'],
  attention: ['fa-solid fa-triangle-exclamation', 'procedural-bad', 'Needs attention'],
  ready: ['fa-solid fa-circle-check', 'procedural-good', 'Ready'],
  published: ['fa-solid fa-cloud', 'procedural-good', 'Published'],
});
const STATUS = Object.freeze({
  open: ['Open', 'draft'],
  publishing: ['Publishing', 'pending'],
  published: ['Published', 'live'],
  cancelled: ['Cancelled', 'muted'],
  outdated: ['Outdated: migrate or delete it', 'bad'],
});
const ITEM_STATE = Object.freeze({
  new: ['Not generated', 'muted'],
  generating: ['Generating', 'pending'],
  choose: ['Choose artwork', 'draft'],
  failed: ['Generation failed', 'bad'],
  author: ['Author it by hand', 'bad'],
  selected: ['Artwork selected', 'good'],
  published: ['Published', 'live'],
  kept: ['Keeps current artwork', 'good'],
  conflict: ['Rebound since kept', 'bad'],
  authored: ['Authored by hand', 'good'],
});
/** Where the artwork an item shows comes from, as the server resolves it: a label and a tone. */
const ARTWORK_SOURCE = Object.freeze({
  kept: ['Kept', 'good'],
  authored: ['Authored', 'good'],
  selected: ['Selected entry', 'good'],
  published: ['Published', 'live'],
  draft: ['Newest entry, not selected', 'draft'],
  bound: ['Runs now', 'muted'],
  unrendered: ['Runs now: no render', 'bad'],
  missing: ['No artwork', 'bad'],
});
const ENTRY_STATE = Object.freeze({
  generating: ['Generating', 'pending'],
  ready: ['Ready', 'draft'],
  editing: ['Open in the Studio', 'pending'],
  selected: ['Selected', 'good'],
  published: ['Published', 'live'],
  discarded: ['Discarded', 'muted'],
  failed: ['Failed', 'bad'],
  cancelled: ['Cancelled', 'muted'],
});
/** The resolutions of an item, in the order the server lists them: a label and what each does. */
const RESOLUTION = Object.freeze({
  keep: [
    'Keep current artwork',
    'Nothing is generated, published or bound: the item keeps the definition it runs now.',
  ],
  render: ['Generate from current artwork', 'Generate variants of the artwork it runs now.'],
  template: ['Rebuild from template', 'Draw new artwork from a Genesis Template; it replaces the current one.'],
  author: ['Authored by hand', 'Create new artwork by hand from an empty canvas in the Object Layer Studio.'],
});
const GENERATING = Object.freeze(['render', 'template']);
const IMPACT = Object.freeze({
  local: ['This map only', 'good'],
  shared: ['Shared · same biome', 'pending'],
  global: ['Global change', 'bad'],
});
const MAP_POPULATION = Object.freeze({
  open: ['Open', 'draft'],
  published: ['Published', 'live'],
  cancelled: ['Cancelled', 'muted'],
  outdated: ['Outdated', 'bad'],
});
/** The state of a definition of an item in its authoring view. */
const DRAFT_STATE = Object.freeze({
  selected: ['Selected', 'good'],
  saved: ['Saved draft', 'draft'],
  superseded: ['Superseded', 'muted'],
  unrendered: ['No render', 'bad'],
  active: ['Runs now', 'live'],
  published: ['Published, unbound', 'good'],
  candidate: ['Generated entry', 'pending'],
  archived: ['Archived', 'muted'],
});
/** The definitions of an item one read of its authoring view shows. */
const DRAFT_PAGE = 10;
const MEDIA_STATE = Object.freeze({
  pending: 'pending',
  ready: 'ready',
  failed: 'failed',
  superseded: 'a later save drew it',
});
const FINDINGS = Object.freeze([
  ['blocker', 'Blocking', 'procedural-bad'],
  ['action', 'Needs a choice', ''],
  ['info', 'Notes', 'procedural-muted'],
]);
/** The publication statuses the worker runs, the ones a retry resumes, and the ones a cancel stops. */
const RUNNING = Object.freeze([
  'queued',
  'preflight',
  'publishing_objects',
  'committing_runtime',
  'refreshing_runtime',
]);
const RETRYABLE = Object.freeze([
  'preflight_failed',
  'objects_publish_failed',
  'runtime_commit_failed',
  'published_reload_pending',
]);
const CANCELLABLE = Object.freeze([
  'queued',
  'preflight',
  'publishing_objects',
  'objects_publish_failed',
  'runtime_commit_failed',
]);
/** The state of one asset of a publication manifest. */
const ASSET_STATE = Object.freeze({
  pending: ['Not yet', 'muted'],
  published: ['Published', 'good'],
  failed: ['Failed', 'bad'],
});
const PHASE_STATE = Object.freeze({
  done: ['fa-solid fa-circle-check', 'procedural-good', 'Done'],
  running: ['fa-solid fa-spinner fa-spin', '', 'Running'],
  failed: ['fa-solid fa-circle-xmark', 'procedural-bad', 'Failed'],
  waiting: ['fa-solid fa-clock', '', 'Waiting'],
  pending: ['fa-regular fa-circle', 'procedural-muted', 'Not yet'],
  cancelled: ['fa-solid fa-ban', 'procedural-muted', 'Cancelled'],
});

const badge = ([label, tone]) => element('span', `procedural-state procedural-state-${tone}`, label);
const count = (n, noun, plural = `${noun}s`) => `${n} ${n === 1 ? noun : plural}`;
const fact = (label, value) => {
  const row = element('div', 'procedural-fact');
  row.append(
    element('span', 'procedural-fact-label', label),
    value instanceof Node ? value : element('span', '', value),
  );
  return row;
};
/** The stored preview of a map, as the server drew it. */
const previewFigure = (fileId, caption) => {
  const figure = element('figure', 'procedural-figure');
  figure.append(
    Object.assign(element('img', 'procedural-map-preview'), {
      src: getApiBaseUrl({ id: fileId, endpoint: 'file/blob' }),
      alt: `Map preview of ${caption}`,
    }),
    element('figcaption', 'procedural-muted', caption),
  );
  return figure;
};
const button = (icon, label, onclick, { primary = false, title = '' } = {}) => {
  const control = element('button', `procedural-action${primary ? ' procedural-action-primary' : ''}`, ` ${label}`);
  control.type = 'button';
  control.prepend(element('i', icon));
  control.title = title || label;
  control.onclick = onclick;
  return control;
};
/** A table in a horizontal scroll; a cell is text, a node, or a list of them. */
const table = (headers, rows) => {
  const node = element('table', 'procedural-targets');
  const head = element('tr');
  for (const header of headers) head.append(Object.assign(element('th', '', header), { scope: 'col' }));
  const thead = element('thead');
  thead.append(head);
  const body = element('tbody');
  for (const cells of rows) {
    const row = element('tr');
    for (const cell of cells) {
      const td = element('td');
      td.append(...[cell].flat().map((part) => (part instanceof Node ? part : document.createTextNode(String(part)))));
      row.append(td);
    }
    body.append(row);
  }
  node.append(thead, body);
  const scroll = element('div', 'procedural-table-scroll');
  scroll.append(node);
  return scroll;
};
const field = (label, control) => {
  const node = element('label', 'procedural-field', label);
  node.append(control);
  return node;
};
const select = (options, value, label) => {
  const node = element('select');
  node.setAttribute('aria-label', label);
  for (const [optionValue, text] of options)
    node.append(Object.assign(element('option', '', text), { value: optionValue, selected: optionValue === value }));
  return node;
};
/** A radio group: one choice of some, each with its label and hint; a disabled choice shows why. */
const radios = (name, options, value, onchange) => {
  const group = element('div', 'procedural-radios');
  group.setAttribute('role', 'radiogroup');
  for (const [optionValue, label, hint = '', disabled = false] of options) {
    const input = Object.assign(element('input'), {
      type: 'radio',
      name,
      value: optionValue,
      checked: optionValue === value,
      disabled,
    });
    input.onchange = () => onchange(optionValue);
    const option = element('label', 'procedural-radio');
    option.append(input, element('span', 'procedural-radio-label', label));
    if (hint) {
      const note = Object.assign(element('span', 'procedural-muted', hint), { id: `${name}-${optionValue}-hint` });
      input.setAttribute('aria-describedby', note.id);
      option.append(note);
    }
    group.append(option);
  }
  return group;
};
const isOpen = ({ status }) => status === 'open';
const impactOf = ({ impact, maps = [], players } = {}) => {
  if (!impact) return [];
  const where = [
    ...maps.map(({ code, biome }) => `${code} (${biome?.name ?? 'no biome'})`),
    ...(players ? ['players'] : []),
  ];
  return [
    badge(IMPACT[impact]),
    ...(where.length > 0 ? [element('span', 'procedural-muted', `Also on ${where.join(', ')}`)] : []),
  ];
};

/** Where an item runs, with what goes with it, spaced in one cell. */
const impactCell = (usage, ...extra) => {
  const cell = element('div', 'procedural-impact');
  cell.append(...impactOf(usage), ...extra);
  return cell;
};

/** The canvases that show an animated sprite, and the timer that turns their frames. */
const animated = new Set();
let ticker = null;
/** Draws the frame of a sprite the time `now` shows, centered and scaled to whole pixels. */
const paintSprite = ({ canvas, sprite }, now) => {
  const frame = sprite.frames[Math.floor(now / sprite.duration) % sprite.frames.length];
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / frame.width, canvas.height / frame.height)));
  const [w, h] = [frame.width * scale, frame.height * scale];
  ctx.drawImage(
    sprite.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    (canvas.width - w) / 2,
    (canvas.height - h) / 2,
    w,
    h,
  );
};
const turn = () => {
  ticker = null;
  const now = performance.now();
  for (const view of animated) {
    if (!view.canvas.isConnected) animated.delete(view);
    else paintSprite(view, now);
  }
  if (animated.size > 0) ticker = setTimeout(turn, 100);
};
/** The artwork of a CID as the game client animates it, or why it shows none: `empty` without a CID. */
const spriteView = (cid, size, label, empty = 'No artwork') => {
  const host = element('div', 'procedural-sprite');
  host.style.width = host.style.height = `${size}px`;
  const canvas = element('canvas');
  canvas.width = canvas.height = size;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  host.append(canvas);
  const note = (text, tone = '') => {
    const node = element('span', `procedural-sprite-note ${tone}`, size >= 96 ? text : '?');
    node.title = text;
    host.append(node);
  };
  if (!cid) {
    note(empty);
    return host;
  }
  AtlasSpriteSheetService.loadSprite(cid).then((sprite) => {
    if (sprite.missing) return note(sprite.missing, 'procedural-bad');
    const view = { canvas, sprite };
    paintSprite(view, performance.now());
    if (sprite.frames.length > 1) {
      animated.add(view);
      ticker ??= setTimeout(turn, 100);
    }
  });
  return host;
};

class ProceduralPopulation {
  static canMutate = false;
  static config = null;
  /** The map the setup reads and its context. */
  static setup = { code: '', context: null };
  static population = null;
  static step = 'items';
  /** The item the editor shows and its unsaved configuration. */
  static itemId = '';
  static edit = null;
  /** The entries of the item the editor shows. */
  static entries = [];
  /** The items checked for a bulk palette change, and the change it previews. */
  static checked = new Set();
  static palette = null;
  static definitions = { q: '', page: 1, rows: [], total: 0 };
  static zoom = 'fit';
  static timer = null;
  static frameTimer = null;
  /** Whether a write waits for its answer. */
  static sending = false;

  static style = css`
    .procedural-population .procedural-stepper {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 6px;
      list-style: none;
      padding: 0;
      margin: 0 0 6px;
    }
    .procedural-population .procedural-stepper button {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
    }
    .procedural-population .procedural-stepper button[aria-current='step'] {
      border: 1px solid var(--studio-accent);
      box-shadow: inset 0 -3px 0 var(--studio-accent);
    }
    .procedural-population .procedural-step-name {
      font-weight: bold;
    }
    .procedural-population .procedural-step-state {
      font-size: 12px;
    }
    .procedural-population .procedural-step-detail {
      font-size: 12px;
      margin: 0 0 10px;
    }
    .procedural-population .procedural-card {
      padding: 10px 12px;
      margin-bottom: 10px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
      min-width: 0;
    }
    .procedural-population .procedural-card-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      align-items: center;
      margin-bottom: 6px;
      font-weight: bold;
    }
    .procedural-population .procedural-fact {
      display: flex;
      gap: 8px;
      font-size: 13px;
      line-height: 1.6;
    }
    .procedural-population .procedural-fact-label {
      min-width: 110px;
      opacity: 0.7;
    }
    .procedural-population .procedural-findings ul,
    .procedural-population .procedural-list {
      margin: 4px 0 8px;
      padding-left: 18px;
      font-size: 13px;
    }
    .procedural-population .procedural-targets {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
    }
    .procedural-population .procedural-targets th,
    .procedural-population .procedural-targets td {
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid var(--studio-subtle-border);
      vertical-align: top;
    }
    .procedural-population .procedural-table-scroll {
      overflow-x: auto;
    }
    .procedural-population .procedural-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-top: 8px;
    }
    .procedural-population .procedural-action {
      padding: 4px 10px;
      font-size: 13px;
      cursor: pointer;
      min-height: 30px;
    }
    .procedural-population .procedural-action-primary {
      font-weight: bold;
      border: 1px solid var(--studio-accent);
    }
    .procedural-population .procedural-action:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .procedural-population .procedural-run-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
      padding: 8px 0;
      margin-bottom: 8px;
      background: var(--editor-stage-background, var(--studio-card));
      border-bottom: 1px solid var(--studio-subtle-border);
    }
    @media (min-width: 600px) {
      .procedural-population .procedural-run-head {
        position: sticky;
        top: 0;
        z-index: 2;
      }
    }
    .procedural-population .procedural-run-title {
      font-weight: bold;
      font-size: 15px;
    }
    .procedural-population .procedural-field {
      display: inline-flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
      margin: 6px 12px 6px 0;
    }
    .procedural-population .procedural-field input,
    .procedural-population .procedural-field select {
      min-width: 9rem;
      padding: 3px 6px;
    }
    .procedural-population .procedural-items-layout {
      display: grid;
      gap: 12px;
    }
    @media (min-width: 900px) {
      .procedural-population .procedural-items-layout {
        grid-template-columns: minmax(250px, 330px) minmax(0, 1fr);
        align-items: start;
      }
    }
    .procedural-population .procedural-group-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 10px 0 4px;
      font-weight: bold;
      font-size: 13px;
    }
    .procedural-population .procedural-item-row {
      display: grid;
      grid-template-columns: auto 40px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      padding: 4px 6px;
      border-radius: 6px;
      border: 1px solid transparent;
    }
    .procedural-population .procedural-figure {
      margin: 8px 0;
    }
    .procedural-population .procedural-map-preview {
      display: block;
      max-width: min(100%, 360px);
      height: auto;
      image-rendering: pixelated;
      border: 1px solid var(--studio-subtle-border);
    }
    .procedural-population .procedural-item-row[aria-current='true'] {
      border-color: var(--studio-accent);
      background: #ffffff0d;
    }
    .procedural-population .procedural-item-open {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
      padding: 2px 4px;
      background: none;
      border: none;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .procedural-population .procedural-item-id {
      font-weight: bold;
      overflow-wrap: anywhere;
    }
    .procedural-population .procedural-sprite {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      background: repeating-conic-gradient(#ffffff10 0 25%, #00000030 0 50%) 0 0 / 12px 12px;
    }
    .procedural-population .procedural-impact {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
    }
    .procedural-population .procedural-tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 4px;
      min-width: 150px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .procedural-population .procedural-tile {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .procedural-population .procedural-tile-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      font-size: 11px;
      line-height: 1.3;
    }
    .procedural-population .procedural-sprite canvas {
      image-rendering: pixelated;
    }
    .procedural-population .procedural-sprite-note {
      position: absolute;
      inset: auto 2px 2px;
      font-size: 10px;
      text-align: center;
      line-height: 1.2;
    }
    .procedural-population .procedural-editor-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      align-items: center;
    }
    .procedural-population .procedural-editor-title {
      font-size: 16px;
      font-weight: bold;
      overflow-wrap: anywhere;
    }
    .procedural-population .procedural-chip {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 8px;
      border: 1px solid var(--studio-subtle-border);
    }
    .procedural-population .procedural-radios {
      display: grid;
      gap: 4px;
      margin: 4px 0 8px;
    }
    .procedural-population .procedural-radio {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0 6px;
      align-items: baseline;
      font-size: 13px;
      cursor: pointer;
    }
    .procedural-population .procedural-radio .procedural-muted {
      grid-column: 2;
      font-size: 12px;
    }
    .procedural-population .procedural-radio:has(input:disabled) {
      cursor: not-allowed;
    }
    .procedural-population .procedural-radio:has(input:disabled) .procedural-radio-label {
      opacity: 0.55;
    }
    .procedural-population .procedural-save-state {
      font-size: 12px;
    }
    .procedural-population .procedural-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }
    .procedural-population .procedural-entry {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
      font-size: 12px;
    }
    .procedural-population .procedural-entry[data-state='selected'],
    .procedural-population .procedural-entry[data-state='published'] {
      border-color: var(--studio-positive);
      box-shadow: inset 0 0 0 1px var(--studio-positive);
    }
    .procedural-population .procedural-entry .procedural-action {
      padding: 2px 6px;
      font-size: 12px;
    }
    .procedural-population .procedural-preview-frame {
      overflow: auto;
      max-height: ${FRAME_HEIGHT * 100}vh;
      margin: 8px 0;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
      background: #0006;
    }
    .procedural-population .procedural-preview-frame canvas {
      display: block;
      image-rendering: pixelated;
    }
    .procedural-population .procedural-preview-frame canvas.procedural-preview-fit {
      max-width: 100%;
      max-height: ${FRAME_HEIGHT * 100}vh;
    }
    .procedural-population .procedural-phases {
      list-style: none;
      padding: 0;
      margin: 6px 0;
    }
    .procedural-population .procedural-phases li {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      align-items: baseline;
      padding: 4px 0;
      border-bottom: 1px solid var(--studio-subtle-border);
    }
    .procedural-population .procedural-phase-name {
      min-width: 14rem;
    }
    .procedural-population .procedural-swatch-pair {
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
  `;

  /**
   * The workflow, empty of a map and a population until {@link ProceduralPopulation.mount} reads them.
   * @param {{canMutate:boolean,config:Object,group:(title:string,icon:string,inner:string)=>string}} params
   * @returns {Promise<string>}
   */
  static async render({ canMutate, config, group }) {
    Object.assign(ProceduralPopulation, {
      canMutate,
      config,
      setup: { code: '', context: null },
      population: null,
      step: 'items',
      itemId: '',
      edit: null,
      entries: [],
      checked: new Set(),
      palette: null,
      definitions: { q: '', page: 1, rows: [], total: 0 },
    });
    window.addEventListener('beforeunload', (event) => {
      if (ProceduralPopulation.edit?.dirty) event.preventDefault();
    });
    const panel = (step, inner) =>
      html`<section class="procedural-panel" data-step="${step}" hidden>${inner}</section>`;
    return html`<div class="procedural-population">
      <style>
        ${ProceduralPopulation.style}
      </style>
      <div class="procedural-population-setup">
        ${group(
          'Choose a map',
          'fa-solid fa-map',
          html`<div class="in procedural-muted" style="margin-bottom: 6px;">
              A population prepares the items of one map, their runtime defaults and the map itself, then publishes them
              together. An empty map is a valid start.
            </div>
            ${await ProceduralGrid.instance({
              id: MAPS_GRID,
              height: '300px',
              rowId: ({ code }) => code,
              columnDefs: ProceduralPopulation.mapColumns(),
              fetch: (query) => readPage(ProceduralPopulation.canMutate, () => Population.getMaps(query)),
              onRowClicked: (row) => ProceduralPopulation.selectMap(row),
            })}
            <div class="in procedural-map-context" style="margin-top: 10px;" aria-live="polite"></div>`,
        )}
      </div>
      <div class="procedural-population-run" hidden>
        <div class="procedural-run-head" role="region" aria-label="Population">
          <span class="procedural-run-title"></span>
          <span class="procedural-run-status" aria-live="polite"></span>
          <span class="procedural-buttons procedural-run-actions" style="margin: 0 0 0 auto;"></span>
        </div>
        <ol class="procedural-stepper" aria-label="Population steps"></ol>
        <div class="procedural-step-detail" aria-live="polite"></div>
        <div class="procedural-run-notice"></div>
        ${panel(
          'items',
          html`<div class="procedural-items-layout">
            <div class="procedural-item-list" aria-label="Items"></div>
            <div class="procedural-item-editor" aria-live="polite"></div>
          </div>`,
        )}
        ${panel('defaults', html`<div class="procedural-defaults"></div>`)}
        ${panel('map', html`<div class="procedural-map"></div>`)}
        ${panel('publish', html`<div class="procedural-publish"></div>`)}
      </div>
    </div>`;
  }

  static mapColumns() {
    const text = { sortable: true, filter: 'agTextColumnFilter' };
    return [
      column('name', 'Map', { ...text, minWidth: 160, valueFormatter: ({ data }) => data.name || data.code }),
      column('code', 'Code', { ...text, minWidth: 140 }),
      { headerName: 'Instance', minWidth: 140, valueGetter: ({ data }) => data.instances.join(', ') || '—' },
      column('biome', 'Biome', { minWidth: 130, valueFormatter: ({ value }) => value || '—' }),
      { headerName: 'Grid', minWidth: 90, valueGetter: ({ data }) => `${data.gridX} × ${data.gridY}` },
      column('entityCount', 'Placed', {
        sortable: true,
        filter: 'agNumberColumnFilter',
        valueFormatter: ({ value }) => (value ? String(value) : 'none yet'),
      }),
      {
        headerName: 'Population',
        minWidth: 130,
        cellRenderer: ({ data }) =>
          data.population ? badge(MAP_POPULATION[data.population.state]) : element('span', 'procedural-muted', '—'),
      },
    ];
  }

  /** Reads the map grid, and the population, step and item the URL names. */
  static async mount() {
    await ProceduralGrid.load(MAPS_GRID);
    const { population, step, item } = getQueryParams();
    if (population) await ProceduralPopulation.select(population, { step, itemId: item });
  }

  /** The findings of a context, grouped by what they ask: blocking, a choice, or nothing. */
  static findings(findings) {
    const root = element('div', 'procedural-findings');
    for (const [level, title, tone] of FINDINGS) {
      const listed = findings.filter((finding) => finding.level === level);
      if (listed.length === 0) continue;
      const list = element('ul');
      for (const { message } of listed) list.append(element('li', tone, message));
      if (level === 'info') {
        const details = element('details');
        details.append(element('summary', 'procedural-muted', `${title} · ${listed.length}`), list);
        root.append(details);
      } else root.append(element('div', `procedural-card-head ${tone}`, title), list);
    }
    return root;
  }

  /** Selects a map: its context, then a new population or the one it has. */
  static async selectMap(row) {
    ProceduralPopulation.setup = { code: row.code, context: null };
    htmls('.procedural-map-context', html`<div class="procedural-muted">Reading map ${row.code}…</div>`);
    const response = await Population.getMapContext({ code: row.code });
    if (row.code !== ProceduralPopulation.setup.code) return;
    if (response.status !== 'success') return refusal(response);
    const context = (ProceduralPopulation.setup.context = response.data);
    const { map, biome, instances, foundation, targets } = context;
    const card = element('div', 'procedural-card');
    const head = element('div', 'procedural-card-head', map.name || map.code);
    head.append(element('span', 'procedural-muted', `${map.code} · revision ${map.revision}`));
    card.append(
      head,
      fact('Instance', instances.map(({ code, name }) => name || code).join(', ') || 'none'),
      fact('Biome', biome?.name ?? 'none: each item starts from its own colors'),
      fact('Grid', `${map.grid.gridX} × ${map.grid.gridY} cells`),
      fact('Foundation', foundation ? count(foundation.entries, 'composition entry', 'composition entries') : 'none'),
      fact('Placed', map.entityCount ? count(map.entityCount, 'entity', 'entities') : 'none'),
      fact('Items', `${count(targets.length, 'item')} · ${targets.filter(({ cid }) => !cid).length} new`),
      ProceduralPopulation.findings(context.findings),
    );
    const blocked = context.findings.find(({ level, itemId }) => level === 'blocker' && !itemId);
    const actions = element('div', 'procedural-buttons');
    const open = row.population;
    if (open?.state === 'open')
      actions.append(
        button('fa-solid fa-play', 'Continue', () => ProceduralPopulation.select(open.id), {
          primary: true,
          title: 'Open the population this map has in progress.',
        }),
      );
    if (open?.state === 'outdated')
      actions.append(
        element('span', 'procedural-bad', 'An earlier Procedural Engine made the last population of this map.'),
        button('fa-solid fa-trash', 'Delete it', () => ProceduralPopulation.remove(open.id)),
      );
    const start = button(
      'fa-solid fa-seedling',
      open?.state === 'open' ? 'Start another' : 'Start',
      () => ProceduralPopulation.create({ mapCode: row.code, seed: { mode: 'auto' } }),
      { primary: open?.state !== 'open', title: blocked?.message ?? 'Prepare the items of this map.' },
    );
    start.disabled = Boolean(blocked);
    actions.append(start);
    card.append(actions);
    s('.procedural-map-context').replaceChildren(card);
  }

  static async create(body) {
    if (!ProceduralPopulation.canMutate) return denied();
    const response = await Population.post({ body });
    if (response.status !== 'success') return refusal(response);
    await ProceduralPopulation.select(response.data._id);
  }

  /** Asks before unsaved changes of the open item go; resolves whether to go on. */
  static async leaveItem() {
    const { edit } = ProceduralPopulation;
    if (!edit?.dirty) return true;
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-leave-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          ${edit.itemId} has unsaved changes. Discard them?
        </div>`,
    });
    return answer.status === 'confirm';
  }

  /** Shows a step of the open population again from what the server stores, keeping its selections. */
  static async resume(step = ProceduralPopulation.step, itemId = ProceduralPopulation.itemId) {
    ProceduralPopulation.step = STEPS.some(([name]) => name === step) ? step : ProceduralPopulation.step;
    ProceduralPopulation.itemId = itemId;
    setQueryParams({ step: ProceduralPopulation.step, item: itemId || null }, { replace: true });
    await ProceduralPopulation.refresh();
  }

  /** Opens a population on a step and an item, or the map selection when the id is empty. */
  static async select(id, { step = 'items', itemId = '' } = {}) {
    if (!(await ProceduralPopulation.leaveItem())) return;
    clearTimeout(ProceduralPopulation.timer);
    Object.assign(ProceduralPopulation, {
      population: null,
      step: STEPS.some(([name]) => name === step) ? step : 'items',
      itemId: itemId ?? '',
      edit: null,
      entries: [],
      checked: new Set(),
      palette: null,
    });
    setQueryParams(
      { population: id || null, step: id ? ProceduralPopulation.step : null, item: itemId || null },
      { replace: true },
    );
    s('.procedural-population-setup').hidden = Boolean(id);
    s('.procedural-population-run').hidden = !id;
    if (!id) return await ProceduralGrid.load(MAPS_GRID);
    await ProceduralPopulation.refresh();
  }

  /** Whether the server still works for the population: an entry generates, or a publication runs or waits. */
  static working({ targets, publication }) {
    return (
      targets.some(({ state, counts }) => state === 'generating' || counts.generating > 0) ||
      RUNNING.includes(publication?.status) ||
      Boolean(publication?.status === 'published_reload_pending' && publication.nextAttemptAt)
    );
  }

  /** Reads the population and paints the head, the steps and the step shown; polls while the server works. */
  static async refresh() {
    clearTimeout(ProceduralPopulation.timer);
    const id = getQueryParams().population;
    if (!id || !s('.procedural-population')) return;
    const response = await Population.get({ id });
    if (response.status !== 'success') {
      refusal(response);
      ProceduralPopulation.edit = null;
      return await ProceduralPopulation.select('');
    }
    const population = (ProceduralPopulation.population = response.data);
    if (!population.targets.some(({ itemId }) => itemId === ProceduralPopulation.itemId))
      ProceduralPopulation.itemId = population.targets[0]?.itemId ?? '';
    ProceduralPopulation.paintHead();
    ProceduralPopulation.paintStepper();
    await ProceduralPopulation.paintStep();
    if (ProceduralPopulation.working(population))
      ProceduralPopulation.timer = setTimeout(() => ProceduralPopulation.refresh(), POLL_MS);
  }

  static paintHead() {
    const { population } = ProceduralPopulation;
    htmls('.procedural-run-title', `${population.context.map.name || population.mapCode}`);
    s('.procedural-run-notice').replaceChildren(...ProceduralPopulation.migrationNotice(population.migration));
    s('.procedural-run-status').replaceChildren(badge(STATUS[population.status]));
    const cancel = button('fa-solid fa-ban', 'Cancel', () => ProceduralPopulation.cancel(), {
      title: 'Stop the work of every item. Nothing is deleted.',
    });
    cancel.disabled = !isOpen(population);
    s('.procedural-run-actions').replaceChildren(
      button('fa-solid fa-arrow-left', 'All maps', () => ProceduralPopulation.select('')),
      button('fa-solid fa-rotate', 'Refresh', () => ProceduralPopulation.refresh()),
      cancel,
      button('fa-solid fa-trash', 'Delete', () => ProceduralPopulation.remove(population._id), {
        title: 'Delete the population with its generated entries. What a publication wrote stays.',
      }),
    );
  }

  /** What the migration from an earlier version changed and dropped, when it changed anything. */
  static migrationNotice(migration) {
    if (!migration) return [];
    const { kept, removed, legacyDefaults, publication } = migration;
    const lines = [
      ...(kept.length > 0 ? [`Kept, at the definition they read: ${kept.map(({ itemId }) => itemId).join(', ')}`] : []),
      ...(removed.length > 0 ? [`Excluded, now removed: ${removed.map(({ itemId }) => itemId).join(', ')}`] : []),
      ...(legacyDefaults.length > 0
        ? [`${count(legacyDefaults.length, 'entity-default change')} kept for review in the defaults step`]
        : []),
      ...(publication ? [`Publication ${publication}`] : []),
    ];
    if (lines.length === 0) return [];
    const card = element('details', 'procedural-card');
    card.append(element('summary', '', `Migrated from version ${migration.from} · ${stamp(migration.at)}`));
    const list = element('ul', 'procedural-list');
    for (const line of lines) list.append(element('li', '', line));
    card.append(list);
    return [card];
  }

  /**
   * The entity-default changes an earlier version recorded and never applied, each in full, with the
   * way to apply it in the Entity Studio.
   */
  static legacyDefaults(legacy, open) {
    const card = element('details', 'procedural-card');
    card.append(
      element(
        'summary',
        '',
        `Changes from version ${ProceduralPopulation.population.migration.from} · ${legacy.length}`,
      ),
    );
    card.append(
      element(
        'div',
        'procedural-muted',
        'An earlier version recorded these changes and never applied them. Apply each in the Entity Studio, or leave it.',
      ),
      table(
        ['Change', 'Entity', 'Live items', 'Behavior', 'Drops', ''],
        legacy.map(({ rowId, action, row }) => [
          action,
          row?.entityType ?? '—',
          (row?.liveItemIds ?? []).join(', ') || '—',
          row?.behavior || 'auto',
          (row?.dropItemIds ?? []).join(', ') || '—',
          open && row
            ? button(
                'fa-solid fa-up-right-from-square',
                action === 'add' || action === 'create' ? 'Create' : 'Open',
                () =>
                  ProceduralPopulation.openEntityStudio(
                    action === 'add' || action === 'create'
                      ? { entityType: row.entityType, liveItemIds: row.liveItemIds }
                      : { rowId },
                  ),
              )
            : element('span', 'procedural-muted', '—'),
        ]),
      ),
    );
    return card;
  }

  /** The steps, each with the state the server derives from what is stored. */
  static paintStepper() {
    const { population, step: current } = ProceduralPopulation;
    s('.procedural-stepper').replaceChildren(
      ...STEPS.map(([step, label, icon], index) => {
        const { state, detail } = population.steps[step];
        const [mark, tone, stateLabel] = STEP_STATES[state];
        const control = element('button');
        control.type = 'button';
        const name = element('span', 'procedural-step-name', ` ${index + 1} · ${label}`);
        name.prepend(element('i', icon));
        const status = element('span', `procedural-step-state ${tone}`, ` ${stateLabel}`);
        status.prepend(element('i', mark));
        control.append(name, status);
        control.title = detail;
        control.onclick = () => ProceduralPopulation.show(step);
        if (step === current) control.setAttribute('aria-current', 'step');
        const item = element('li');
        item.append(control);
        return item;
      }),
    );
    htmls('.procedural-step-detail', population.steps[current].detail);
  }

  /** Shows one step. */
  static async show(step) {
    if (step === ProceduralPopulation.step) return;
    if (!(await ProceduralPopulation.leaveItem())) return;
    ProceduralPopulation.edit = null;
    ProceduralPopulation.step = step;
    setQueryParams({ step }, { replace: true });
    ProceduralPopulation.paintStepper();
    await ProceduralPopulation.paintStep();
  }

  static async paintStep() {
    for (const panel of s('.procedural-population-run').querySelectorAll('.procedural-panel'))
      panel.hidden = panel.dataset.step !== ProceduralPopulation.step;
    const paint = {
      items: () => ProceduralPopulation.paintItems(),
      defaults: () => ProceduralPopulation.paintDefaults(),
      map: () => ProceduralPopulation.paintMap(),
      publish: () => ProceduralPopulation.paintPublish(),
    }[ProceduralPopulation.step];
    await paint();
  }

  /** Sends a change of the population; a refusal is told, a success repaints. */
  /**
   * Sends one write at a time and shows its outcome: `success` is a text or reads it from the answer.
   * A conflict reloads the population, so the view shows what is stored now.
   */
  static async send(call, success) {
    if (!ProceduralPopulation.canMutate) return denied();
    if (ProceduralPopulation.sending) return false;
    ProceduralPopulation.sending = true;
    try {
      const response = await call();
      if (response.status !== 'success') {
        refusal(response);
        if (response.code === 409) await ProceduralPopulation.refresh();
        return false;
      }
      if (success) notify(typeof success === 'function' ? success(response.data) : success, 'success');
      await ProceduralPopulation.refresh();
      return true;
    } finally {
      ProceduralPopulation.sending = false;
    }
  }

  /** The target of an item id. */
  static targetOf = (itemId) => ProceduralPopulation.population.targets.find((target) => target.itemId === itemId);

  // ── Items ────────────────────────────────────────────────────────────────

  static async paintItems() {
    ProceduralPopulation.paintItemList();
    await ProceduralPopulation.paintEditor();
  }

  /** The items, grouped by type, each with its artwork and state; the bulk palette and the add form. */
  static paintItemList() {
    const { population, checked } = ProceduralPopulation;
    const open = isOpen(population);
    const root = element('div');
    const tools = element('div', 'procedural-buttons');
    const bulk = button(
      'fa-solid fa-palette',
      `Palette for ${count(checked.size, 'checked item')}`,
      () => ProceduralPopulation.openPalette(),
      { title: 'Give the checked items one palette source. You see every change before it applies.' },
    );
    bulk.disabled = !open || checked.size === 0;
    tools.append(bulk);
    root.append(tools);
    if (ProceduralPopulation.palette) root.append(ProceduralPopulation.palettePanel());
    for (const group of population.groups) {
      const targets = population.targets.filter(({ stage }) => stage === group.id);
      if (targets.length === 0) continue;
      const head = element('div', 'procedural-group-head');
      const all = Object.assign(element('input'), {
        type: 'checkbox',
        checked: targets.every(({ itemId }) => checked.has(itemId)),
        disabled: !open,
      });
      all.setAttribute('aria-label', `Check every item of ${group.name}`);
      all.onchange = () => {
        for (const { itemId } of targets) all.checked ? checked.add(itemId) : checked.delete(itemId);
        ProceduralPopulation.paintItemList();
      };
      head.append(
        all,
        element('span', '', group.name),
        element('span', 'procedural-muted', `${group.ready}/${group.items} ready`),
      );
      root.append(head);
      for (const target of targets) root.append(ProceduralPopulation.itemRow(target));
    }
    if (population.removed.length > 0) root.append(ProceduralPopulation.removedCard());
    if (open) root.append(ProceduralPopulation.addItemCard());
    s('.procedural-item-list').replaceChildren(root);
  }

  static itemRow(target) {
    const { population, checked } = ProceduralPopulation;
    const row = element('div', 'procedural-item-row');
    row.dataset.state = target.state;
    row.setAttribute('aria-current', String(target.itemId === ProceduralPopulation.itemId));
    const box = Object.assign(element('input'), { type: 'checkbox', checked: checked.has(target.itemId) });
    box.disabled = !isOpen(population);
    box.setAttribute('aria-label', `Check ${target.itemId}`);
    box.onchange = () => {
      box.checked ? checked.add(target.itemId) : checked.delete(target.itemId);
      ProceduralPopulation.paintItemList();
    };
    const open = element('button', 'procedural-item-open');
    open.type = 'button';
    open.append(element('span', 'procedural-item-id', target.itemId), badge(ITEM_STATE[target.state]));
    open.onclick = () => ProceduralPopulation.openItem(target.itemId);
    row.append(box, spriteView(target.artwork.cid, 40, `${target.itemId} artwork`), open);
    return row;
  }

  static async openItem(itemId) {
    if (itemId === ProceduralPopulation.itemId) return;
    if (!(await ProceduralPopulation.leaveItem())) return;
    Object.assign(ProceduralPopulation, { itemId, edit: null, entries: [] });
    setQueryParams({ item: itemId }, { replace: true });
    await ProceduralPopulation.paintItems();
  }

  /**
   * The editor of the open item: what it is and where it runs, its artwork, its configuration with
   * the save state, the generation, and its gallery. Unsaved changes survive a repaint.
   */
  static async paintEditor() {
    const { population, itemId } = ProceduralPopulation;
    const root = s('.procedural-item-editor');
    const target = ProceduralPopulation.targetOf(itemId);
    if (!target) return root.replaceChildren(element('div', 'procedural-muted', 'Add an item to start.'));
    const response = await Population.getEntries({ id: population._id, itemId });
    if (itemId !== ProceduralPopulation.itemId) return;
    ProceduralPopulation.entries = response.status === 'success' ? response.data : [];
    const stored = {
      resolution: target.resolution,
      templateId: target.templateId,
      variation: target.variation,
      palette: target.palette,
    };
    const version = JSON.stringify(stored);
    const { edit } = ProceduralPopulation;
    const current = edit?.itemId === itemId && (edit.dirty || edit.version === version);
    if (!current) ProceduralPopulation.edit = { itemId, version, ...stored, dirty: false, saving: false, error: '' };
    const editable = isOpen(population);
    const parts = {
      head: ProceduralPopulation.editorHead(target),
      artwork: ProceduralPopulation.editorArtwork(target),
      config: editable ? null : element('div'),
      gallery: ProceduralPopulation.editorGallery(target),
      footer: isOpen(population) ? ProceduralPopulation.editorFooter(target) : element('div'),
    };
    const card = root.querySelector('.procedural-editor');
    const config = card?.dataset.item === itemId && card.querySelector('[data-part="config"]');
    const keep = editable && config && current;
    parts.config ??= keep ? config : ProceduralPopulation.editorConfig(target);
    for (const [name, node] of Object.entries(parts)) node.dataset.part = name;
    if (keep) {
      for (const name of ['head', 'artwork', 'gallery', 'footer'])
        card.querySelector(`[data-part="${name}"]`).replaceWith(parts[name]);
      // The authoring shows stored drafts, not the unsaved configuration: it reads them again.
      if (ProceduralPopulation.edit.resolution === 'author')
        ProceduralPopulation.paintConfigDetails(target, config.querySelector('.procedural-config-details'));
      return;
    }
    const next = element('div', 'procedural-card procedural-editor');
    next.dataset.item = itemId;
    next.append(...Object.values(parts));
    root.replaceChildren(next);
  }

  static editorHead(target) {
    const head = element('div', 'procedural-editor-head');
    head.append(
      element('span', 'procedural-editor-title', target.itemId),
      element('span', 'procedural-chip', target.itemType),
      badge(ITEM_STATE[target.state]),
    );
    for (const source of target.sources)
      head.append(
        element(
          'span',
          'procedural-chip',
          source === 'foundation'
            ? `Foundation expects ${target.expected ?? 0}`
            : source === 'placement'
              ? `Placed ${target.placements}×`
              : 'Added by hand',
        ),
      );
    head.append(...impactOf(target.usage));
    return head;
  }

  /** The artwork the item shows, where it comes from, and what it runs now when that differs. */
  static editorArtwork(target) {
    const root = element('div', 'procedural-buttons');
    const { cid, source } = target.artwork;
    const caption = cid
      ? `${ARTWORK_SOURCE[source][0]} · ${shortCid(cid)}${target.observed ? ` · binding revision ${target.observed.bindingRevision}` : ''}`
      : source === 'unrendered'
        ? 'It runs a definition with no render: choose how it resolves'
        : 'No artwork yet: choose how it resolves';
    const figure = element('figure', 'procedural-figure');
    figure.append(spriteView(cid, 128, caption), element('figcaption', 'procedural-muted', caption));
    root.append(figure);
    if (target.state === 'conflict')
      root.append(
        element(
          'div',
          'procedural-bad',
          `${target.itemId} was bound again after you kept it. Keep it again to keep what it runs now, or choose new artwork.`,
        ),
      );
    if (cid && target.binding && cid !== target.binding.cid) {
      const { hasRender } = target.binding;
      const label = hasRender ? ARTWORK_SOURCE.bound[0] : ARTWORK_SOURCE.unrendered[0];
      const now = element('figure', 'procedural-figure');
      now.append(
        spriteView(hasRender ? target.binding.cid : '', 64, label, 'No render'),
        element('figcaption', 'procedural-muted', label),
      );
      root.append(now);
    }
    return root;
  }

  /**
   * The configuration of the item: one resolution of the four, each disabled with its reason while
   * the item does not take it, then the fields of that resolution, with the save state.
   */
  static editorConfig(target) {
    const { edit } = ProceduralPopulation;
    const root = element('div', 'procedural-card');
    root.append(element('div', 'procedural-card-head', 'Configuration'));
    const state = element('span', 'procedural-save-state');
    const save = button('fa-solid fa-floppy-disk', 'Save', () => ProceduralPopulation.saveItem(), { primary: true });
    const revert = button('fa-solid fa-rotate-left', 'Revert', () => {
      ProceduralPopulation.edit = null;
      ProceduralPopulation.paintEditor();
    });
    const sync = () => {
      state.className = `procedural-save-state ${edit.error ? 'procedural-bad' : 'procedural-muted'}`;
      state.textContent = edit.saving
        ? 'Saving…'
        : edit.error
          ? `Save failed: ${edit.error}`
          : edit.dirty
            ? 'Unsaved changes'
            : 'Saved';
      save.disabled = !edit.dirty || edit.saving;
      revert.disabled = !edit.dirty || edit.saving;
    };
    const changed = () => {
      Object.assign(edit, { dirty: true, error: '' });
      sync();
    };
    Object.assign(edit, { markDirty: changed, sync });
    const options = target.resolutions.map(({ id, available, reason }) => [
      id,
      RESOLUTION[id][0],
      available ? RESOLUTION[id][1] : reason,
      !available,
    ]);
    const details = element('div', 'procedural-config-details');
    const label = Object.assign(element('div', 'procedural-muted', 'Resolution'), {
      id: `resolution-${target.itemId}-label`,
    });
    const withdraws = element('div', 'procedural-muted');
    const warn = () => {
      withdraws.textContent =
        target.selected?.state === 'selected' && edit.resolution !== target.resolution
          ? `Saving takes the selection back from entry ${shortCid(target.selected.cid)}; the entry stays.`
          : '';
    };
    const group = radios(`resolution-${target.itemId}`, options, edit.resolution, (resolution) => {
      edit.resolution = resolution;
      changed();
      warn();
      ProceduralPopulation.paintConfigDetails(target, details);
    });
    group.setAttribute('aria-labelledby', label.id);
    warn();
    root.append(label, group, withdraws, details);
    ProceduralPopulation.paintConfigDetails(target, details);
    const actions = element('div', 'procedural-buttons');
    actions.append(save, revert, state);
    root.append(actions);
    sync();
    return root;
  }

  /** The fields of a resolution: the template, the palette and the variation, or the authoring. */
  static paintConfigDetails(target, container) {
    const { edit } = ProceduralPopulation;
    container.replaceChildren();
    if (edit.resolution === 'author') return container.append(ProceduralPopulation.authoring(target));
    if (!GENERATING.includes(edit.resolution)) return;
    const template = select(
      target.templates.map((id) => [id, ProceduralPalette.templates.find((entry) => entry.id === id)?.name ?? id]),
      edit.templateId,
      `Genesis Template of ${target.itemId}`,
    );
    template.onchange = () => {
      edit.templateId = template.value;
      edit.palette = { slots: {} };
      edit.markDirty();
      ProceduralPopulation.paintConfigDetails(target, container);
    };
    const own = Object.assign(element('input'), { type: 'checkbox', checked: edit.variation !== null });
    const level = Object.assign(element('input'), {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      value: edit.variation ?? 0.5,
      disabled: edit.variation === null,
    });
    level.setAttribute('aria-label', `Variation of ${target.itemId}`);
    const shown = element('span', '', edit.variation === null ? 'generator default' : String(edit.variation));
    own.onchange = () => {
      level.disabled = !own.checked;
      edit.variation = own.checked ? Number(level.value) : null;
      shown.textContent = own.checked ? level.value : 'generator default';
      edit.markDirty();
    };
    level.oninput = () => {
      edit.variation = Number(level.value);
      shown.textContent = level.value;
      edit.markDirty();
    };
    const ownLabel = element('label', 'procedural-field', ' Own variation');
    ownLabel.prepend(own);
    const variation = field('Variation', level);
    variation.append(shown);
    const palette = element('div');
    const chosen = ProceduralPalette.templates.find((entry) => entry.id === edit.templateId);
    const frames = chosen
      ? element(
          'div',
          'procedural-muted',
          `Frames: ${frameSummary(chosen.frames)} · baseline: ${frameSummary(chosen.baseline)}. Change them in the Object Layer Studio.`,
        )
      : element('div');
    container.append(field('Genesis Template', template), frames, ownLabel, variation, palette);
    edit.editor = ProceduralPalette.editor(palette, {
      key: `item-${target.itemId}`,
      title: 'Palette',
      paletteId: edit.palette.paletteId ?? '',
      colors: { ...(edit.palette.slots ?? {}) },
      read: (paletteId) =>
        !target.cid
          ? CyberiaProceduralProfileService.getTemplatePalette({ id: edit.templateId, paletteId })
          : CyberiaProceduralJobService.getSourcePalette({
              itemId: target.itemId,
              paletteId,
              templateId: edit.templateId,
              fromTemplate: edit.resolution !== 'render',
            }),
      describe: (resolved, palettes) =>
        `${resolved?.name ?? edit.templateId} · ${palettes.length > 0 ? `item colors: ${palettes.map(({ name }) => name).join(', ')}` : 'template colors'}`,
      defaultsLabel: 'Item defaults',
      onChange: (entry) => {
        edit.palette = ProceduralPalette.choice(entry);
        edit.markDirty();
      },
    });
  }

  /** Saves the configuration of the open item; resolves whether it saved. */
  static async saveItem() {
    const { edit, population } = ProceduralPopulation;
    if (!ProceduralPopulation.canMutate) return denied();
    const generating = GENERATING.includes(edit.resolution);
    Object.assign(edit, { saving: true, error: '' });
    edit.sync();
    const response = await Population.updateTarget({
      id: population._id,
      itemId: edit.itemId,
      body: {
        resolution: edit.resolution,
        ...(generating && { templateId: edit.templateId, variation: edit.variation, palette: edit.palette }),
      },
    });
    if (response.status !== 'success') {
      Object.assign(edit, { saving: false, error: response.message });
      edit.sync();
      return false;
    }
    ProceduralPopulation.edit = null;
    await ProceduralPopulation.refresh();
    return true;
  }

  /**
   * Authoring by hand: the draft the item uses, the actions its state allows, and every stored
   * definition of the item id, newest first, with its state and what each one allows.
   */
  static authoring(target) {
    const { population } = ProceduralPopulation;
    const root = element('div');
    const selected = target.definitionCid;
    root.append(
      element(
        'div',
        'procedural-muted',
        selected
          ? `${target.itemId} uses the draft ${shortCid(selected)}. A save in the Studio stores a new draft and selects it; the earlier one stays in the list.`
          : `No draft is selected. Create one on an empty ${target.itemType} canvas, or use a stored definition below.`,
      ),
    );
    if (isOpen(population)) {
      const actions = element('div', 'procedural-buttons');
      if (selected)
        actions.append(
          button('fa-solid fa-pen-ruler', 'Continue editing', () => ProceduralPopulation.author(target, selected), {
            primary: true,
            title: 'Open the selected draft in the Object Layer Studio.',
          }),
        );
      actions.append(
        button('fa-solid fa-file-circle-plus', 'Create draft', () => ProceduralPopulation.author(target, ''), {
          primary: !selected,
          title: 'Open the Object Layer Studio on an empty down idle frame. Nothing comes from a template.',
        }),
      );
      root.append(actions);
    }
    root.append(ProceduralPopulation.drafts(target));
    return root;
  }

  /** The state of a definition of the item: the selection first, then its status and its render. */
  static draftState(row, target, selectedAt) {
    if (row.cid === target.definitionCid) return 'selected';
    if (row.status !== 'draft') return row.status;
    if (!row.hasRender) return 'unrendered';
    return selectedAt && new Date(row.updatedAt) < new Date(selectedAt) ? 'superseded' : 'saved';
  }

  /** The stored definitions of the item id, a page at a time, each with what it allows. */
  static drafts(target) {
    const root = element('div', 'procedural-card');
    root.append(element('div', 'procedural-card-head', `Drafts and definitions of ${target.itemId}`));
    const body = element('div', 'procedural-muted', 'Loading…');
    root.append(body);
    const rows = [];
    const read = async () => {
      const response = await Population.getDefinitions({
        itemId: target.itemId,
        page: Math.floor(rows.length / DRAFT_PAGE) + 1,
        limit: DRAFT_PAGE,
      });
      if (response.status !== 'success') return refusal(response);
      rows.push(...response.data.data);
      const selectedAt = rows.find(({ cid }) => cid === target.definitionCid)?.updatedAt;
      const more =
        rows.length < response.data.total
          ? [button('fa-solid fa-angles-down', `Show older (${response.data.total - rows.length})`, read)]
          : [];
      body.className = '';
      body.replaceChildren(
        rows.length === 0
          ? element('div', 'procedural-muted', `No Object Layer definition of ${target.itemId} is stored yet.`)
          : table(
              ['Artwork', 'State', 'Saved', 'CID', ''],
              rows.map((row) => {
                const state = ProceduralPopulation.draftState(row, target, selectedAt);
                return [
                  row.hasRender ? spriteView(row.cid, 40, row.cid) : spriteView('', 40, row.cid, 'No render'),
                  [
                    badge(DRAFT_STATE[state]),
                    ...(state === 'selected' && !row.hasRender ? [badge(DRAFT_STATE.unrendered)] : []),
                  ],
                  stamp(row.updatedAt),
                  shortCid(row.cid),
                  ProceduralPopulation.draftActions(target, row, state),
                ];
              }),
            ),
        ...more,
      );
    };
    read();
    return root;
  }

  /** What a definition of the item allows now, or why it allows nothing. */
  static draftActions(target, row, state) {
    if (!isOpen(ProceduralPopulation.population)) return element('span', 'procedural-muted', '—');
    const { population } = ProceduralPopulation;
    const actions = element('div', 'procedural-buttons');
    const usable = ['saved', 'superseded', 'published'].includes(state);
    if (usable)
      actions.append(
        button(
          'fa-solid fa-hand-pointer',
          'Use this draft',
          () =>
            ProceduralPopulation.send(
              () => Population.addTarget({ id: population._id, body: { itemId: target.itemId, cid: row.cid } }),
              `${target.itemId} uses ${shortCid(row.cid)}. It publishes with the population; the live artwork stays until then.`,
            ),
          { primary: true, title: 'Select this definition for the item. Nothing is published or bound yet.' },
        ),
      );
    if (row.status === 'draft')
      actions.append(
        button('fa-solid fa-pen-ruler', 'Continue editing', () => ProceduralPopulation.author(target, row.cid), {
          title: 'Open this draft in the Object Layer Studio. A save stores a new draft and selects it.',
        }),
      );
    if (row.status === 'draft' && state !== 'selected' && !row.keptBy)
      actions.append(
        button('fa-solid fa-trash-can', 'Delete draft', () => ProceduralPopulation.deleteDraft(target, row.cid), {
          title: 'Delete this draft and its frames. Nothing else uses it.',
        }),
      );
    if (state === 'unrendered' || (state === 'selected' && !row.hasRender))
      actions.append(
        element('span', 'procedural-bad', 'No render: it cannot be used or published. Continue editing to add frames.'),
      );
    else if (row.status === 'draft' && state !== 'selected' && row.keptBy)
      actions.append(element('span', 'procedural-muted', `Kept: ${row.keptBy}.`));
    return actions.children.length > 0 ? actions : element('span', 'procedural-muted', '—');
  }

  /** Deletes a draft of the item after a confirmation that names it. */
  static async deleteDraft(target, cid) {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-delete-draft-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Delete the draft ${shortCid(cid)} of ${target.itemId} and its frames? Nothing uses it; it cannot come back.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    await ProceduralPopulation.send(
      () => Population.deleteDraft({ id: ProceduralPopulation.population._id, itemId: target.itemId, cid }),
      `The draft ${shortCid(cid)} is deleted.`,
    );
  }

  /** Opens the Object Layer Studio for this population: on a definition of the item, or on an empty draft. */
  static author(target, cid) {
    if (!ProceduralPopulation.canMutate) return denied();
    const review = authoringKey(ProceduralPopulation.population._id, target.itemId);
    if (!ObjectLayerEngineModal.open({ cid: cid || undefined, review }))
      notify('This host has no Object Layer Studio.', 'warning');
  }

  /** Generate, and the entries of the item: each with its artwork, its state and what it allows. */
  static editorGallery(target) {
    const { population, entries, edit } = ProceduralPopulation;
    const generates = target.resolutions.some(({ id, available }) => available && GENERATING.includes(id));
    if (!generates && entries.length === 0) return element('div');
    const root = element('div', 'procedural-card');
    const head = element('div', 'procedural-card-head', 'Generated entries');
    root.append(head);
    const open = isOpen(population);
    if (open && GENERATING.includes(target.resolution)) {
      const runs = select(
        [...Array(MAX_RUNS).keys()].map((index) => [String(index + 1), count(index + 1, 'entry', 'entries')]),
        '1',
        'Entries to generate',
      );
      const generate = button(
        'fa-solid fa-wand-magic-sparkles',
        'Generate',
        () => ProceduralPopulation.generate(Number(runs.value)),
        {
          primary: target.state === 'new' || target.state === 'failed',
          title: 'Generate entries from the configuration; unsaved changes save first.',
        },
      );
      const line = element('div', 'procedural-buttons');
      line.append(runs, generate);
      root.append(line);
    } else if (GENERATING.includes(edit?.resolution))
      root.append(element('div', 'procedural-muted', 'Save the resolution to generate.'));
    const shown = entries.filter(({ state }) => state !== 'discarded' && state !== 'cancelled');
    const hidden = entries.length - shown.length;
    if (entries.length === 0) {
      root.append(element('div', 'procedural-muted', 'No entry yet.'));
      return root;
    }
    const gallery = element('div', 'procedural-gallery');
    for (const entry of shown) gallery.append(ProceduralPopulation.entryCard(target, entry));
    root.append(gallery);
    if (hidden > 0) {
      const details = element('details');
      details.append(
        element('summary', 'procedural-muted', `${count(hidden, 'discarded entry', 'discarded entries')}`),
      );
      const rest = element('div', 'procedural-gallery');
      for (const entry of entries.filter((item) => !shown.includes(item)))
        rest.append(ProceduralPopulation.entryCard(target, entry));
      details.append(rest);
      root.append(details);
    }
    return root;
  }

  static entryCard(target, entry) {
    const open = isOpen(ProceduralPopulation.population);
    const card = element('div', 'procedural-entry');
    card.dataset.state = entry.state;
    card.append(
      spriteView(entry.state === 'generating' ? '' : entry.cid, 96, `Entry ${entry.run + 1} of ${target.itemId}`),
      badge(ENTRY_STATE[entry.state]),
      element(
        'span',
        'procedural-muted',
        `Entry ${entry.run + 1} · ${entry.cid ? shortCid(entry.cid) : 'no revision yet'}`,
      ),
    );
    if (entry.error) card.append(element('span', 'procedural-bad', entry.error));
    if (!entry.valid && entry.problems.length > 0)
      card.append(element('span', 'procedural-bad', entry.problems.join('; ')));
    if (!open) return card;
    const actions = element('div', 'procedural-buttons');
    if (['ready', 'editing'].includes(entry.state))
      actions.append(
        button(
          'fa-solid fa-check',
          'Select',
          () =>
            ProceduralPopulation.send(
              () =>
                Population.select({
                  id: ProceduralPopulation.population._id,
                  itemId: target.itemId,
                  body: { entryId: entry.id, cid: entry.cid },
                }),
              `${target.itemId} publishes entry ${entry.run + 1}.`,
            ),
          {
            primary: true,
            title: 'Publish this exact artwork for the item. The entry selected before returns to ready.',
          },
        ),
      );
    if (['ready', 'editing', 'selected'].includes(entry.state))
      actions.append(
        button(
          'fa-solid fa-pen',
          'Edit artwork',
          () =>
            decide(
              { _id: entry.id, jobId: entry.jobId, targetItemId: target.itemId, candidateCid: entry.cid },
              'edit',
              null,
            ),
          { title: 'Open this entry in the Object Layer Studio. A save makes a new revision to select.' },
        ),
        button('fa-solid fa-xmark', 'Discard', () =>
          ProceduralPopulation.send(
            () =>
              Population.discardEntry({
                id: ProceduralPopulation.population._id,
                itemId: target.itemId,
                entryId: entry.id,
              }),
            `Entry ${entry.run + 1} of ${target.itemId} discarded.`,
          ),
        ),
      );
    card.append(actions);
    return card;
  }

  /** Generates entries; unsaved changes save first. */
  static async generate(runs) {
    const { edit, population } = ProceduralPopulation;
    if (edit?.dirty && !(await ProceduralPopulation.saveItem())) return;
    await ProceduralPopulation.send(
      () => Population.generate({ id: population._id, itemId: ProceduralPopulation.itemId, count: runs }),
      `${count(runs, 'entry', 'entries')} of ${ProceduralPopulation.itemId} generating.`,
    );
  }

  /** Keep again after a rebind, reset the workflow of the item, or remove it from the population. */
  static editorFooter(target) {
    const { population } = ProceduralPopulation;
    const actions = element('div', 'procedural-buttons');
    const { itemId } = target;
    if (target.state === 'conflict')
      actions.append(
        button(
          'fa-solid fa-thumbtack',
          'Keep again',
          () =>
            ProceduralPopulation.send(
              () => Population.updateTarget({ id: population._id, itemId, body: { resolution: 'keep' } }),
              `${itemId} keeps what it runs now.`,
            ),
          { primary: true, title: 'Keep the definition the item runs now, at its binding revision.' },
        ),
      );
    actions.append(
      button('fa-solid fa-rotate', 'Reset item', () => ProceduralPopulation.reset(target), {
        title: 'Return the item to a clean start. Published content stays.',
      }),
      button('fa-solid fa-xmark', 'Remove from population', () => ProceduralPopulation.takeOut(target)),
    );
    return actions;
  }

  /** Resets the workflow of an item after a confirmation that lists what goes and what stays, then shows the report. */
  static async reset(target) {
    if (!ProceduralPopulation.canMutate) return denied();
    const goes = [
      ...(target.selected ? ['the approval of its selected entry'] : []),
      ...(target.runs.length > 0
        ? [`${count(target.runs.length, 'run')}: generation stops and the entries leave the item`]
        : []),
      ...(target.definitionCid
        ? [`the use of the draft ${shortCid(target.definitionCid)}, deleted when nothing else uses it`]
        : []),
      'its palette choice and variation: it takes the recommendation now',
    ];
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-reset-confirm',
      html: async () =>
        html`<div class="in section-mp">
          <p>Reset the workflow of ${target.itemId}?</p>
          <p>Goes: ${goes.join('; ')}.</p>
          <p>
            Stays: published definitions, bindings, placements, defaults, jobs and audit. A reset is safe to run again.
          </p>
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    let report = null;
    await ProceduralPopulation.send(
      async () => {
        const response = await Population.resetTarget({
          id: ProceduralPopulation.population._id,
          itemId: target.itemId,
        });
        report = response.data?.reset ?? null;
        return response;
      },
      () => `${target.itemId} starts clean. Removed: ${report.removed.join('; ') || 'nothing'}.`,
    );
    if (report?.failures.length > 0)
      notify(
        `The reset of ${target.itemId} is incomplete: ${report.failures.join('; ')}. Reset again to retry.`,
        'warning',
      );
  }

  /** Removes an item from the population after a confirmation, with an optional reason. */
  static async takeOut(target) {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-take-out-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Remove ${target.itemId} from this population? Generation in progress stops; its entries, the item, its
          definitions, its binding and its placements stay. You can add it back.
          <label class="procedural-field" style="display: flex; margin: 8px auto; max-width: 24rem;"
            >Reason <input class="procedural-remove-reason" maxlength="200"
          /></label>
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const reason = s('.procedural-remove-reason')?.value ?? '';
    await ProceduralPopulation.send(
      () => Population.removeTarget({ id: ProceduralPopulation.population._id, itemId: target.itemId, reason }),
      `${target.itemId} removed from the population.`,
    );
  }

  /**
   * The items removed from the population, with who removed each, when and why: each restores, or a
   * moderator forgets it permanently after a confirmation.
   */
  static removedCard() {
    const { population } = ProceduralPopulation;
    const details = element('details', 'procedural-card');
    details.append(element('summary', '', `Removed · ${population.removed.length}`));
    details.append(
      table(
        ['Item', 'Removed', 'Reason', ''],
        population.removed.map(({ target, by, at, reason }) => {
          if (!isOpen(population)) return [target.itemId, `${stamp(at)}${by ? ` · ${by}` : ''}`, reason || '—', '—'];
          const actions = element('div', 'procedural-buttons');
          actions.append(
            button(
              'fa-solid fa-rotate-left',
              'Restore',
              () =>
                ProceduralPopulation.send(
                  () => Population.addTarget({ id: population._id, body: { itemId: target.itemId } }),
                  `${target.itemId} is restored with its entries.`,
                ),
              { title: 'Bring the item back with its configuration and entries.' },
            ),
            button('fa-solid fa-trash-can', 'Forget permanently', () => ProceduralPopulation.forget(target.itemId), {
              title: 'Delete only this entry of the Removed list.',
            }),
          );
          return [target.itemId, `${stamp(at)}${by ? ` · ${by}` : ''}`, reason || '—', actions];
        }),
      ),
    );
    return details;
  }

  /** Forgets a removed item permanently after a confirmation that names it and what stays. */
  static async forget(itemId) {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-forget-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Forget ${itemId} permanently? This deletes only its entry in the Removed list of this population. Its
          definitions, CIDs, binding, placements, defaults, jobs and audit stay. A later read of the map may add it
          again.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    await ProceduralPopulation.send(
      () => Population.forgetRemoved({ id: ProceduralPopulation.population._id, itemId }),
      `${itemId} is forgotten in this population.`,
    );
  }

  /**
   * Adds an item: an item id with its group, or an existing definition. A new item of a group no
   * generator draws also names its item type.
   */
  static addItemCard() {
    const { population } = ProceduralPopulation;
    const details = element('details', 'procedural-card');
    details.append(element('summary', '', 'Add an item'));
    const form = element('form');
    const itemId = Object.assign(element('input'), { name: 'itemId', required: true });
    const stage = select(
      [['', 'Its own item type'], ...population.groups.map(({ id, name }) => [id, name])],
      '',
      'Group of the item',
    );
    const itemType = select([], '', 'Item type of the item');
    const typeField = field('Item type', itemType);
    const showTypes = () => {
      const group = population.groups.find(({ id }) => id === stage.value);
      typeField.hidden = !group || group.generates;
      itemType.replaceChildren(
        ...(group?.itemTypes ?? []).map((type) => Object.assign(element('option', '', type), { value: type })),
      );
    };
    stage.onchange = showTypes;
    showTypes();
    const add = button('fa-solid fa-plus', 'Add', () => form.requestSubmit());
    add.type = 'submit';
    form.append(
      element(
        'div',
        'procedural-muted',
        'An existing item takes its group from its type. A new item id needs its group, and in Other its item type.',
      ),
      field('Item id', itemId),
      field('Group', stage),
      typeField,
      add,
    );
    form.onsubmit = async (event) => {
      event.preventDefault();
      const id = itemId.value.trim();
      if (
        await ProceduralPopulation.send(
          () =>
            Population.addTarget({
              id: population._id,
              body: {
                itemId: id,
                ...(stage.value && { stage: stage.value }),
                ...(!typeField.hidden && { itemType: itemType.value }),
              },
            }),
          `${id} added.`,
        )
      )
        await ProceduralPopulation.openItem(id);
    };
    details.append(form);
    return details;
  }

  // ── Bulk palette ────────────────────────────────────────────────────────

  static openPalette() {
    ProceduralPopulation.palette = { source: 'palette', paletteId: '', overrides: 'keep', preview: null };
    ProceduralPopulation.paintItemList();
  }

  /** The bulk palette change: one source, one override policy, the preview, then Apply. */
  static palettePanel() {
    const { population, checked, palette } = ProceduralPopulation;
    const root = element('div', 'procedural-card');
    root.append(element('div', 'procedural-card-head', `Palette for ${count(checked.size, 'checked item')}`));
    const changed = () => {
      palette.preview = null;
      ProceduralPopulation.paintItemList();
    };
    const choice = select(
      [
        ['', 'Choose a palette'],
        ...ProceduralPalette.catalog.palettes.map(({ id, name, family }) => [id, `${name} · ${family}`]),
      ],
      palette.paletteId,
      'Palette',
    );
    choice.disabled = palette.source !== 'palette';
    choice.onchange = () => {
      palette.paletteId = choice.value;
      changed();
    };
    const biome = population.context.biome;
    root.append(
      element('div', 'procedural-muted', 'Colors from'),
      radios(
        'palette-source',
        [
          ['palette', 'A palette of the library', 'Its colors for every role of every item type.'],
          [
            'biome',
            `The biome colors${biome ? ` of ${biome.name}` : ''}`,
            biome
              ? 'Each item takes the biome colors; NPCs and portals each start from another color.'
              : 'The map has no biome.',
            !biome,
          ],
        ],
        palette.source,
        (source) => {
          palette.source = source;
          changed();
        },
      ),
      choice,
      element('div', 'procedural-muted', 'The colors each item sets'),
      radios(
        'palette-overrides',
        [
          ['keep', 'Keep them', 'A slot an item sets stays over the new colors.'],
          ['replace', 'Replace them', 'The new colors replace every slot the items set.'],
        ],
        palette.overrides,
        (overrides) => {
          palette.overrides = overrides;
          changed();
        },
      ),
    );
    const body = {
      itemIds: [...checked],
      source: palette.source,
      ...(palette.source === 'palette' && { paletteId: palette.paletteId }),
      overrides: palette.overrides,
    };
    const preview = button('fa-solid fa-eye', 'Preview', async () => {
      const response = await Population.previewPalette({ id: population._id, body });
      if (response.status !== 'success') return refusal(response);
      palette.preview = response.data;
      ProceduralPopulation.paintItemList();
    });
    preview.disabled = palette.source === 'palette' && !palette.paletteId;
    const apply = button(
      'fa-solid fa-fill-drip',
      'Apply',
      async () => {
        if (
          await ProceduralPopulation.send(
            () => Population.applyPalette({ id: population._id, body }),
            `Palette applied to ${count(palette.preview.changes.length, 'item')}.`,
          )
        ) {
          ProceduralPopulation.palette = null;
          ProceduralPopulation.paintItemList();
        }
      },
      { primary: true, title: 'Apply exactly the changes the preview shows.' },
    );
    apply.disabled = !palette.preview || palette.preview.changes.length === 0;
    const actions = element('div', 'procedural-buttons');
    actions.append(
      preview,
      apply,
      button('fa-solid fa-xmark', 'Close', () => {
        ProceduralPopulation.palette = null;
        ProceduralPopulation.paintItemList();
      }),
    );
    root.append(actions);
    if (palette.preview) root.append(ProceduralPopulation.palettePreview(palette.preview));
    return root;
  }

  static palettePreview({ changes, skipped }) {
    const root = element('div');
    const swatch = (color) =>
      color
        ? Object.assign(element('span', 'procedural-swatch-pair'), { innerHTML: `${swatches([color])} ${color}` })
        : '—';
    const name = (palette) =>
      ProceduralPalette.catalog.palettes.find(({ id }) => id === palette.paletteId)?.name ?? 'Item defaults';
    for (const { itemId, before, after, slots } of changes) {
      root.append(element('div', 'procedural-card-head', `${itemId} · ${name(before)} → ${name(after)}`));
      root.append(
        slots.length === 0
          ? element('div', 'procedural-muted', 'No slot changes.')
          : table(
              ['Slot', 'Now', 'After', ''],
              slots.map(({ slot, before: now, after: next, kept }) => [
                slot,
                swatch(now),
                swatch(next),
                kept
                  ? element('span', 'procedural-muted', 'kept')
                  : now && !next
                    ? 'removed'
                    : now
                      ? 'replaced'
                      : 'new',
              ]),
            ),
      );
    }
    if (skipped.length > 0) {
      const list = element('ul', 'procedural-list');
      for (const { itemId, reason } of skipped) list.append(element('li', 'procedural-muted', `${itemId}: ${reason}`));
      root.append(element('div', 'procedural-card-head', 'Skipped'), list);
    }
    return root;
  }

  // ── Entity type defaults ────────────────────────────────────────────────

  /**
   * The defaults step: the stored entity-type defaults of the staged items, each with what it stores,
   * where the game runs it and which default runs in its place; the items no default names, a warning
   * only; and the ways to add a stored default and bring back a removed one.
   */
  static async paintDefaults() {
    const { population } = ProceduralPopulation;
    const response = await Population.getDefaults({ id: population._id });
    if (response.status !== 'success') return refusal(response);
    const { rows, items, missing, removed } = response.data;
    const open = isOpen(population);
    const parts = [
      element(
        'div',
        'procedural-muted',
        'What an entity that carries the items of this population runs on in the game. A global default runs in every world, an instance default only in its instance. Edit opens the Entity Studio; a save there returns here.',
      ),
    ];
    if (missing.length > 0) parts.push(ProceduralPopulation.missingDefaults(missing, open));
    parts.push(
      rows.length === 0
        ? element('div', 'procedural-muted', 'No stored default names an item of this population.')
        : table(
            ['Entity', 'Live items', 'Dead items', 'Drops', 'Behavior', 'Runs in', ''],
            rows.map((row) => [
              [element('div', '', row.entityType), ...(row.added ? [badge(['Added by hand', 'muted'])] : [])],
              ProceduralPopulation.itemTiles(row.liveItemIds, items),
              ProceduralPopulation.itemTiles(row.deadItemIds, items),
              ProceduralPopulation.itemTiles(row.dropItemIds, items),
              row.behavior || 'auto',
              ProceduralPopulation.runtimeNote(row),
              ProceduralPopulation.defaultActions(row, open),
            ]),
          ),
    );
    if (open) parts.push(ProceduralPopulation.addDefaultCard(rows));
    if (removed.length > 0) parts.push(ProceduralPopulation.removedDefaults(removed, open));
    const legacy = population.migration?.legacyDefaults ?? [];
    if (legacy.length > 0) parts.push(ProceduralPopulation.legacyDefaults(legacy, open));
    s('.procedural-defaults').replaceChildren(...parts);
  }

  /** Items as tiles: the idle 08 artwork each shows now, its id, its item type and where the artwork comes from. */
  static itemTiles(itemIds, items) {
    if (itemIds.length === 0) return element('span', 'procedural-muted', '—');
    const list = element('ul', 'procedural-tiles');
    for (const itemId of itemIds) list.append(ProceduralPopulation.artworkTile(itemId, items[itemId]));
    return list;
  }

  /** One item as a tile: its idle 08 artwork, its id, its item type and where the artwork comes from. */
  static artworkTile(itemId, { itemType, cid, source }) {
    const tile = element('li', 'procedural-tile');
    tile.dataset.source = source;
    const text = element('div', 'procedural-tile-text');
    text.append(
      element('span', 'procedural-item-id', itemId),
      element('span', 'procedural-muted', itemType || 'unknown type'),
      badge(ARTWORK_SOURCE[source]),
    );
    tile.append(spriteView(cid, 40, `${itemId}: ${ARTWORK_SOURCE[source][0]}`), text);
    return tile;
  }

  /** The items no default names: a warning that blocks nothing, with a way to create one. */
  static missingDefaults(missing, open) {
    const card = element('div', 'procedural-card');
    card.setAttribute('role', 'status');
    card.append(
      element('div', 'procedural-card-head', `No default names ${count(missing.length, 'item')}`),
      element(
        'div',
        'procedural-muted',
        'This does not stop the population: an entity that carries one of them runs the first default of its type.',
      ),
    );
    const list = element('ul', 'procedural-list');
    for (const { itemId, entityType } of missing) {
      const line = element('li', 'procedural-buttons');
      line.append(element('span', '', `${itemId} · ${entityType}`));
      if (open)
        line.append(
          button('fa-solid fa-plus', 'Create default', () =>
            ProceduralPopulation.openEntityStudio({ entityType, liveItemIds: [itemId] }),
          ),
        );
      list.append(line);
    }
    card.append(list);
    return card;
  }

  /** Where the game runs a default, when it was saved, and which default runs in its place. */
  static runtimeNote({ instances, shadowedBy, updatedAt }) {
    return [
      element('div', '', instances.length > 0 ? `Instance ${instances.join(', ')}` : 'Every world (global)'),
      element('div', 'procedural-muted', `Saved ${stamp(updatedAt)}`),
      ...shadowedBy.map(({ instanceCode, rowId }) =>
        element(
          'div',
          'procedural-bad',
          `${instanceCode ? `Instance ${instanceCode}` : 'Every other world'} runs ${rowId ? `default …${rowId.slice(-6)}` : 'the foundation baseline'} in its place`,
        ),
      ),
    ];
  }

  static defaultActions({ rowId }, open) {
    const { population } = ProceduralPopulation;
    const actions = element('div', 'procedural-buttons');
    if (!open) return actions;
    actions.append(
      button('fa-solid fa-pen', 'Edit', () => ProceduralPopulation.openEntityStudio({ rowId })),
      button(
        'fa-solid fa-xmark',
        'Remove',
        () =>
          ProceduralPopulation.send(
            () => Population.removeDefault({ id: population._id, rowId }),
            'Removed from this population. The default stays as it is.',
          ),
        { title: 'Remove from this population only. The default and every world that runs it stay as they are.' },
      ),
    );
    return actions;
  }

  /** Finds stored defaults by an item id they run on, to add one to the population. */
  static addDefaultCard(rows) {
    const { population } = ProceduralPopulation;
    const details = element('details', 'procedural-card');
    details.append(element('summary', '', 'Add an existing default'));
    const query = Object.assign(element('input'), { type: 'search', placeholder: 'Live item id' });
    query.setAttribute('aria-label', 'Live item id of the default');
    const results = element('div');
    const shown = new Set(rows.map(({ rowId }) => rowId));
    const find = async () => {
      const response = await CyberiaEntityTypeDefaultService.get({
        limit: 10,
        filterModel: { liveItemIds: { filterType: 'text', type: 'contains', filter: query.value.trim() } },
      });
      if (response.status !== 'success') return refusal(response);
      const found = response.data.data.filter(({ _id }) => !shown.has(String(_id)));
      results.replaceChildren(
        found.length === 0
          ? element('div', 'procedural-muted', 'No other default runs on that item id.')
          : table(
              ['Entity', 'Live items', 'Behavior', ''],
              found.map((doc) => [
                doc.entityType,
                (doc.liveItemIds ?? []).join(', '),
                doc.behavior || 'auto',
                button('fa-solid fa-plus', 'Add', () =>
                  ProceduralPopulation.send(
                    () => Population.addDefault({ id: population._id, rowId: doc._id }),
                    'Added to this population.',
                  ),
                ),
              ]),
            ),
      );
    };
    const form = element('form', 'procedural-buttons');
    const search = button('fa-solid fa-magnifying-glass', 'Find', () => form.requestSubmit());
    search.type = 'submit';
    form.onsubmit = (event) => {
      event.preventDefault();
      find();
    };
    form.append(query, search);
    details.append(form, results);
    return details;
  }

  /** The defaults removed from the population, each with a way back. */
  static removedDefaults(removed, open) {
    const { population } = ProceduralPopulation;
    const details = element('details', 'procedural-card');
    details.append(element('summary', '', `Removed from this population · ${removed.length}`));
    details.append(
      table(
        ['Entity', 'Live items', ''],
        removed.map(({ rowId, entityType, liveItemIds }) => [
          entityType,
          liveItemIds.join(', '),
          open
            ? button('fa-solid fa-rotate-left', 'Add back', () =>
                ProceduralPopulation.send(
                  () => Population.addDefault({ id: population._id, rowId }),
                  'Back in this population.',
                ),
              )
            : element('span', 'procedural-muted', '—'),
        ]),
      ),
    );
    return details;
  }

  /** Opens the Entity Studio on a stored default, or on a new default of a build, for this population. */
  static openEntityStudio({ rowId = '', entityType = '', liveItemIds = [] }) {
    const entry = s(`.main-btn-${ENTITY_STUDIO}`);
    if (!entry) return notify('This host has no Entity Studio.', 'warning');
    setPath(`${getProxyPath()}${ENTITY_STUDIO}`);
    setQueryParams(
      {
        population: ProceduralPopulation.population._id,
        row: rowId || null,
        entityType: entityType || null,
        liveItemIds: liveItemIds.length > 0 ? liveItemIds.join(',') : null,
        step: null,
        item: null,
        workflow: null,
        job: null,
      },
      { replace: true },
    );
    entry.click();
  }

  // ── Map ─────────────────────────────────────────────────────────────────

  /**
   * The map step: the draft as it is saved, its grid and placements drawn as the game client draws
   * them, the items no artwork draws, a rebase when the live map moved, and the way to the Map Studio.
   */
  static async paintMap() {
    const { population } = ProceduralPopulation;
    const response = await Population.getDraft({ id: population._id });
    if (response.status !== 'success') return refusal(response);
    const draft = response.data;
    const open = isOpen(population);
    const { gridX, gridY, cellWidth, cellHeight } = draft.grid;
    const card = element('div', 'procedural-card');
    card.append(
      element(
        'div',
        'procedural-card-head',
        population.draft ? `Draft · revision ${draft.revision}` : 'No draft: the map stays as it is',
      ),
      fact('Grid', `${gridX} × ${gridY} cells · ${cellWidth} × ${cellHeight} px a cell`),
      fact('Placements', String(draft.entities.length)),
      fact(
        'Starts from',
        `map revision ${draft.baseRevision}${draft.savedAt ? ` · saved ${stamp(draft.savedAt)}` : ''}`,
      ),
    );
    const media = mapMediaLabel(draft.media, draft.mapRevision);
    const mediaLine = fact('Live map preview', badge([media.text, media.tone]));
    if (media.retry && ProceduralPopulation.canMutate)
      mediaLine.append(
        button('fa-solid fa-image', 'Draw again', async () => {
          const response = await CyberiaMapService.media({ id: draft.mapId });
          if (response.status !== 'success') return refusal(response);
          await ProceduralPopulation.paintMap();
        }),
      );
    card.append(mediaLine);
    if (draft.preview)
      card.append(previewFigure(draft.preview, `${draft.mapCode} · revision ${draft.media?.revision ?? '—'}`));
    const parts = [card];
    if (open && population.draft && draft.mapRevision !== draft.baseRevision) {
      const stale = element('div', 'procedural-card');
      stale.append(
        element(
          'div',
          'procedural-bad',
          `The live map moved to revision ${draft.mapRevision} after the draft started from revision ${draft.baseRevision}. Publishing would replace the live map with the draft.`,
        ),
      );
      const buttons = element('div', 'procedural-buttons');
      buttons.append(
        button('fa-solid fa-map', 'Review the live map', () => ProceduralPopulation.openMapStudio(false)),
        button('fa-solid fa-code-merge', `Rebase on revision ${draft.mapRevision}`, () =>
          ProceduralPopulation.send(
            () =>
              Population.rebaseDraft({
                id: population._id,
                body: { mapRevision: draft.mapRevision, revision: draft.revision },
              }),
            `The draft starts from map revision ${draft.mapRevision} now.`,
          ),
        ),
      );
      stale.append(buttons);
      parts.push(stale);
    }
    if (draft.missing.length > 0) {
      const missing = element('div', 'procedural-card');
      missing.append(
        element(
          'div',
          'procedural-card-head procedural-bad',
          `${count(draft.missing.length, 'item')} with no artwork to draw`,
        ),
      );
      const list = element('ul', 'procedural-list');
      for (const { reason } of draft.missing) list.append(element('li', '', reason));
      missing.append(list);
      parts.push(missing);
    }
    const zooms = element('div', 'procedural-buttons');
    zooms.setAttribute('role', 'group');
    zooms.setAttribute('aria-label', 'Zoom of the preview');
    for (const zoom of Object.keys(ZOOMS)) {
      const control = button(
        zoom === 'fit' ? 'fa-solid fa-expand' : 'fa-solid fa-magnifying-glass',
        zoom === 'fit' ? 'Fit' : zoom,
        () => {
          ProceduralPopulation.zoom = zoom;
          ProceduralPopulation.paintMap();
        },
      );
      control.setAttribute('aria-pressed', String(zoom === ProceduralPopulation.zoom));
      zooms.append(control);
    }
    const preview = ProceduralPopulation.draftCanvas(draft, ProceduralPopulation.zoom);
    const studio = button(
      'fa-solid fa-pen-ruler',
      'Open in Map Studio',
      () => ProceduralPopulation.openMapStudio(true),
      {
        primary: true,
        title: 'Edit the grid and the placements of the draft. The live map does not change.',
      },
    );
    studio.disabled = !open;
    const discard = button('fa-solid fa-eraser', 'Discard draft', () => ProceduralPopulation.discardDraft(), {
      title: 'Start again from the live map.',
    });
    discard.disabled = !open || !population.draft;
    const actions = element('div', 'procedural-buttons');
    actions.append(studio, discard);
    parts.push(actions, zooms, preview.frame);
    s('.procedural-map').replaceChildren(...parts);
    preview.paint();
  }

  /**
   * The draft of a map as the game client draws it, each placement by the artwork its items show
   * (`previewKeys` of the draft), animated; `paint` starts it once the frame is in the page.
   * @returns {{frame:HTMLElement,paint:()=>void}}
   */
  static draftCanvas(draft, zoom) {
    const { gridX, gridY } = draft.grid;
    const frame = element('div', 'procedural-preview-frame');
    const canvas = element('canvas', zoom === 'fit' ? 'procedural-preview-fit' : '');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Map ${draft.mapCode}: ${count(draft.entities.length, 'placement')}`);
    frame.append(canvas);
    const spriteOf = (itemId) =>
      draft.previewKeys[itemId]
        ? AtlasSpriteSheetService.sprite(draft.previewKeys[itemId])
        : { missing: draft.missing.find((entry) => entry.itemId === itemId)?.reason ?? 'no artwork' };
    const paint = () => {
      clearTimeout(ProceduralPopulation.frameTimer);
      if (!canvas.isConnected) return;
      const fit = Math.min((frame.clientWidth || 640) / gridX, (window.innerHeight * FRAME_HEIGHT - 2) / gridY);
      const cell = ZOOMS[zoom] || Math.max(2, Math.floor(fit));
      if (canvas.width !== gridX * cell) Object.assign(canvas, { width: gridX * cell, height: gridY * cell });
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawEntities(ctx, draft.entities, {
        cellW: cell,
        cellH: cell,
        objectLayers: true,
        spriteOf,
        now: performance.now(),
      });
      if (cell >= 8) {
        ctx.strokeStyle = '#ffffff22';
        for (let x = 0; x <= gridX; x++) ctx.strokeRect(x * cell, 0, 0, gridY * cell);
        for (let y = 0; y <= gridY; y++) ctx.strokeRect(0, y * cell, gridX * cell, 0);
      }
      const pace = animationPace(draft.entities, spriteOf);
      if (pace && canvas.offsetParent) ProceduralPopulation.frameTimer = setTimeout(paint, pace);
    };
    return {
      frame,
      paint: () => {
        paint();
        AtlasSpriteSheetService.preloadSprites(Object.values(draft.previewKeys), paint);
      },
    };
  }

  /** Opens the Map Studio on the draft of the population, or on the live map. */
  static openMapStudio(onDraft) {
    const entry = s(`.main-btn-${MAP_STUDIO}`);
    if (!entry) return notify('This host has no Map Studio.', 'warning');
    const { population } = ProceduralPopulation;
    setPath(`${getProxyPath()}${MAP_STUDIO}`);
    setQueryParams(
      {
        mapCode: population.mapCode,
        population: onDraft ? population._id : null,
        step: null,
        item: null,
        workflow: null,
        job: null,
      },
      { replace: true },
    );
    entry.click();
  }

  static async discardDraft() {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-discard-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Discard the draft grid and placements? The map starts again from the live map.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    await ProceduralPopulation.send(() => Population.discardDraft({ id: ProceduralPopulation.population._id }));
  }

  // ── Publish ─────────────────────────────────────────────────────────────

  /** The phases of a publication, each with its state and what it did. */
  static phases(publication) {
    const reached = (status) => publication.history.some((entry) => entry.status === status);
    const { status, plan, commit, refresh } = publication;
    const cancelled = status === 'cancelled_before_commit';
    const state = (failedStatus, runningStatuses, done) =>
      done
        ? 'done'
        : status === failedStatus
          ? 'failed'
          : runningStatuses.includes(status)
            ? 'running'
            : cancelled
              ? 'cancelled'
              : 'pending';
    const published = plan?.assets.filter((asset) => asset.status === 'published').length ?? 0;
    const failed = plan?.assets.filter((asset) => asset.status === 'failed').length ?? 0;
    const transaction = state('runtime_commit_failed', ['committing_runtime'], Boolean(commit));
    const servers = refresh?.servers ?? [];
    return [
      ['Check', state('preflight_failed', ['queued', 'preflight'], reached('publishing_objects')), ''],
      [
        'Publish the artwork',
        state('objects_publish_failed', ['publishing_objects'], reached('committing_runtime')),
        plan
          ? `${published} of ${count(plan.assets.length, 'definition')} published${failed ? `, ${failed} failed` : ''}`
          : '',
      ],
      [
        'Commit items and map',
        transaction,
        commit
          ? `${count(commit.assets.length, 'binding')} · ${commit.map ? `map revision ${commit.map.from} → ${commit.map.to}` : 'map unchanged'}`
          : '',
      ],
      [
        'Refresh previews and caches',
        refresh ? 'done' : state('', ['refreshing_runtime'], false),
        refresh ? (refresh.previews === 'refreshed' ? 'refreshed' : `previews: ${refresh.previews}`) : '',
      ],
      [
        'Reload game servers',
        status === 'completed'
          ? 'done'
          : status === 'published_reload_pending'
            ? publication.nextAttemptAt
              ? 'waiting'
              : 'failed'
            : state('', ['refreshing_runtime'], false),
        servers.length > 0
          ? servers
              .map(
                ({ instanceCode, error }) => `${instanceCode || 'server'} ${error ? `missed: ${error}` : 'reloaded'}`,
              )
              .join('; ')
          : status === 'completed'
            ? 'no live server to reload'
            : '',
      ],
    ];
  }

  /**
   * The publish step: before a publication, the review of everything it applies (each item with the
   * artwork it shows and what publishing does to it, the entity type defaults, the map draft with its
   * pictures, and the instances that run the map), the check with its errors and warnings, the
   * consents it needs and the button; once it runs, each phase, the failure with its retry, and the
   * outcome.
   */
  static async paintPublish() {
    const { population } = ProceduralPopulation;
    const root = s('.procedural-publish');
    const { publication } = population;
    if (publication && !['cancelled_before_commit', 'preflight_failed'].includes(publication.status))
      return ProceduralPopulation.paintPublication(root, publication);
    if (population.status === 'cancelled')
      return root.replaceChildren(
        element('div', 'procedural-muted', 'The population was cancelled: it publishes nothing.'),
      );
    const response = await Population.getDraft({ id: population._id });
    if (response.status !== 'success') return refusal(response);
    const draft = response.data;
    const consents = [];
    const head = element('div', 'procedural-card');
    head.append(
      element('div', 'procedural-card-head', `Review · population revision ${population.revision}`),
      element(
        'div',
        'procedural-muted',
        'Publishing applies exactly what this review shows. A change after it asks for a new review. Nothing here publishes or stores anything.',
      ),
    );
    if (publication?.status === 'preflight_failed')
      head.append(element('div', 'procedural-muted', 'The last publication stopped at its check; nothing changed.'));
    const check = element('div', 'procedural-card');
    const publish = button(
      'fa-solid fa-cloud-arrow-up',
      'Publish',
      () => ProceduralPopulation.publish(consents, population.revision),
      { primary: true, title: 'Publish the artwork, then bind the items and write the map in one transaction.' },
    );
    const validate = async () => {
      publish.disabled = true;
      const checked = await Population.validate({
        id: population._id,
        body: { acknowledged: consents.filter((box) => box.checked).map((box) => box.value) },
      });
      if (checked.status !== 'success') return refusal(checked);
      const { ready, problems, plan } = checked.data;
      const warnings = [
        ...(population.steps.defaults.detail.includes('no default names') ? [population.steps.defaults.detail] : []),
        ...draft.missing.map(({ reason }) => reason),
      ];
      const list = (lines, tone) => {
        const node = element('ul', 'procedural-list');
        for (const line of lines) node.append(element('li', tone, line));
        return node;
      };
      check.replaceChildren(
        element(
          'div',
          `procedural-card-head ${ready ? 'procedural-good' : 'procedural-bad'}`,
          ready ? 'Ready to publish' : 'Not ready',
        ),
        ...(problems.length > 0
          ? [element('div', '', 'Errors: they stop the publication'), list(problems, 'procedural-bad')]
          : []),
        ...(warnings.length > 0
          ? [element('div', '', 'Warnings: they stop nothing'), list(warnings, 'procedural-muted')]
          : []),
        ...(plan ? [ProceduralPopulation.planList(plan)] : []),
      );
      publish.disabled = !ready || !isOpen(population);
    };
    const map = ProceduralPopulation.reviewMap(draft);
    const actions = element('div', 'procedural-buttons');
    actions.append(publish);
    root.replaceChildren(
      head,
      ProceduralPopulation.reviewItems(consents, validate),
      ProceduralPopulation.reviewDefaults(),
      map.card,
      check,
      actions,
    );
    map.paint();
    await validate();
  }

  /** Each item with the artwork it shows, its state and what publishing does to it, and the consent a global change needs. */
  static reviewItems(consents, validate) {
    const { population } = ProceduralPopulation;
    const operation = {
      kept: 'Nothing is published or bound',
      authored: 'Publish its authored definition when it is a draft, then bind it',
      selected: 'Publish the selected entry, then bind it',
      published: 'Published',
    };
    const card = element('div', 'procedural-card');
    const ready = population.targets.filter(({ state }) => operation[state]).length;
    card.append(element('div', 'procedural-card-head', `Items · ${ready} of ${population.targets.length} ready`));
    card.append(
      table(
        ['Artwork', 'State', 'Publishing', 'Where it runs', ''],
        population.targets.map((target) => {
          const changes = target.state === 'selected' || target.state === 'authored';
          let consent = '';
          if (changes && target.usage?.impact === 'global') {
            const box = Object.assign(element('input'), { type: 'checkbox', value: target.itemId });
            box.setAttribute('aria-label', `Accept the global change of ${target.itemId}`);
            box.onchange = validate;
            consent = element('label', '', ' I accept');
            consent.prepend(box);
            consents.push(box);
          }
          return [
            ProceduralPopulation.artworkTile(target.itemId, { itemType: target.itemType, ...target.artwork }),
            badge(ITEM_STATE[target.state]),
            operation[target.state]
              ? [
                  element('div', '', operation[target.state]),
                  ...(changes
                    ? [
                        element(
                          'div',
                          'procedural-muted',
                          `${target.binding ? shortCid(target.binding.cid) : 'new'} → ${shortCid(target.artwork.cid)}`,
                        ),
                      ]
                    : []),
                ]
              : element('span', 'procedural-bad', 'Not ready: decide it in the items step'),
            impactCell(target.usage, consent),
            button('fa-solid fa-up-right-from-square', 'Open', () =>
              ProceduralPopulation.openReviewed('items', target.itemId),
            ),
          ];
        }),
      ),
    );
    return card;
  }

  /** The entity type defaults of the staged items: how many, and the items no default names, a warning only. */
  static reviewDefaults() {
    const { defaults } = ProceduralPopulation.population.steps;
    const card = element('div', 'procedural-card');
    const actions = element('div', 'procedural-buttons');
    actions.append(
      button('fa-solid fa-up-right-from-square', 'Open the defaults', () =>
        ProceduralPopulation.openReviewed('defaults'),
      ),
    );
    card.append(
      element('div', 'procedural-card-head', 'Entity type defaults'),
      element('div', '', defaults.detail),
      element(
        'div',
        'procedural-muted',
        'A publication changes no default. A missing default is a warning: it stops nothing.',
      ),
      actions,
    );
    return card;
  }

  /**
   * The map the publication writes: its draft drawn by the artwork of its items, the live pictures,
   * and the instances that run it; `paint` starts the draft once the card is in the page.
   * @returns {{card:HTMLElement,paint:()=>void}}
   */
  static reviewMap(draft) {
    const { population } = ProceduralPopulation;
    const { gridX, gridY } = draft.grid;
    const card = element('div', 'procedural-card');
    card.append(
      element('div', 'procedural-card-head', `Map ${draft.mapCode}`),
      element(
        'div',
        '',
        population.draft
          ? `Revision ${draft.baseRevision} → ${draft.baseRevision + 1}: ${gridX} × ${gridY} cells, ${count(draft.entities.length, 'placement')}. Its preview is drawn after the commit.`
          : 'No draft: the map stays as it is.',
      ),
    );
    const figures = element('div', 'procedural-buttons');
    if (draft.thumbnail) figures.append(previewFigure(draft.thumbnail, 'Thumbnail · custom image'));
    if (draft.preview)
      figures.append(previewFigure(draft.preview, `Live map preview · revision ${draft.media?.revision ?? '—'}`));
    card.append(figures);
    const preview = population.draft ? ProceduralPopulation.draftCanvas(draft, 'fit') : null;
    if (preview)
      card.append(element('div', 'procedural-muted', 'The draft, as the items it places show now:'), preview.frame);
    const instances = population.context.instances;
    card.append(
      element(
        'div',
        'procedural-muted',
        instances.length > 0
          ? `Run by ${instances.map(({ name, code }) => name || code).join(', ')}: a publication that writes the map reloads them.`
          : 'No instance runs this map yet.',
      ),
    );
    const actions = element('div', 'procedural-buttons');
    actions.append(
      button('fa-solid fa-up-right-from-square', 'Open the map step', () => ProceduralPopulation.openReviewed('map')),
      button('fa-solid fa-pen-ruler', 'Open in Map Studio', () => ProceduralPopulation.openMapStudio(true), {
        title: 'Edit the grid and the placements of the draft. The live map does not change.',
      }),
    );
    card.append(actions);
    return { card, paint: () => preview?.paint() };
  }

  /** Opens a step of the population, on an item of it, from the review. */
  static async openReviewed(step, itemId) {
    if (itemId) {
      ProceduralPopulation.itemId = itemId;
      setQueryParams({ item: itemId }, { replace: true });
    }
    await ProceduralPopulation.show(step);
  }

  /** What a plan publishes, operation by operation. */
  static planList(plan) {
    const kinds = (kind) => plan.assets.filter((asset) => asset.kind === kind);
    const fresh = [...kinds('create'), ...kinds('update')];
    const lines = [
      `Kept: ${plan.kept.map(({ itemId }) => itemId).join(', ') || 'none'}`,
      `Authored definitions to bind: ${
        kinds('definition')
          .map(({ itemId }) => itemId)
          .join(', ') || 'none'
      }`,
      `New revisions to publish and bind: ${fresh.map(({ itemId }) => itemId).join(', ') || 'none'}`,
      plan.grid
        ? `Map: revision ${plan.mapRevision} → ${plan.mapRevision + 1}, ${plan.grid.gridX} × ${plan.grid.gridY} cells, ${count(plan.placements, 'placement')}`
        : 'Map: no change',
      plan.media
        ? `Media: the preview of revision ${plan.media.revision} is drawn before the publication completes`
        : 'Media: no change',
    ];
    const list = element('ul', 'procedural-list');
    for (const line of lines) list.append(element('li', '', line));
    return list;
  }

  /** A publication that runs or ran: each phase, the failure with its retry or cancel, and the outcome. */
  static paintPublication(root, publication) {
    const list = element('ol', 'procedural-phases');
    list.setAttribute('aria-label', 'Publication phases');
    for (const [name, state, detail] of ProceduralPopulation.phases(publication)) {
      const [icon, tone, label] = PHASE_STATE[state];
      const item = element('li');
      const mark = element('i', `${icon} ${tone}`);
      mark.setAttribute('aria-hidden', 'true');
      item.append(
        mark,
        element('span', 'procedural-phase-name', name),
        element('span', tone, label),
        element('span', 'procedural-muted', detail),
      );
      list.append(item);
    }
    const { status, plan, error, cancelRequestedAt } = publication;
    const outcome =
      status === 'completed'
        ? ['Published and the runtime refreshed', 'procedural-good']
        : status === 'published_reload_pending'
          ? ['Published: the runtime refresh waits', 'procedural-bad']
          : status === 'cancelled_before_commit'
            ? ['Cancelled before the commit', 'procedural-muted']
            : cancelRequestedAt
              ? ['Cancellation requested: the server stops at its next safe point', '']
              : error
                ? error.retryable
                  ? ['Stopped: a retry resumes it', 'procedural-bad']
                  : ['Stopped: it needs a repair', 'procedural-bad']
                : ['Publishing…', ''];
    const parts = [
      element('div', `procedural-card-head ${outcome[1]}`, outcome[0]),
      element(
        'div',
        'procedural-muted',
        [
          `Requested ${stamp(publication.requestedAt)}`,
          ...(plan
            ? [`manifest ${plan.manifestHash.slice(0, 12)} of population revision ${plan.populationRevision}`]
            : []),
          'You can leave this page: the server goes on, and this view reads what it stores.',
        ].join(' · '),
      ),
      list,
    ];
    if (plan?.assets.length) parts.push(ProceduralPopulation.manifestAssets(plan.assets));
    if (error) {
      const failed = element('div', 'procedural-card');
      failed.append(
        element('div', '', error.itemId ? `${error.itemId}: ${error.message}` : error.message),
        element(
          'div',
          'procedural-muted',
          error.retryable
            ? 'A retry resumes the same manifest: what is published stays published.'
            : 'A retry meets this again. Cancel, repair it (for example save the item again in the Object Layer Studio), then review and publish again.',
        ),
      );
      if (status === 'published_reload_pending' && publication.nextAttemptAt)
        failed.append(
          element('div', 'procedural-muted', `The server tries again at ${stamp(publication.nextAttemptAt)}.`),
        );
      parts.push(failed);
    }
    const actions = element('div', 'procedural-buttons');
    if (RETRYABLE.includes(status) && error?.retryable !== false)
      actions.append(
        button(
          'fa-solid fa-rotate-right',
          'Resume publication',
          () =>
            ProceduralPopulation.send(
              () => Population.retryPublication({ id: ProceduralPopulation.population._id }),
              'The publication resumes on the same manifest.',
            ),
          { primary: true },
        ),
      );
    if (CANCELLABLE.includes(status) && !cancelRequestedAt)
      actions.append(
        button('fa-solid fa-ban', 'Cancel before commit', () => ProceduralPopulation.cancelPublication(), {
          title: 'Stop the publication at its next safe point. Artwork it published stays published and unbound.',
        }),
      );
    parts.push(actions);
    if (publication.commit)
      parts.push(
        table(
          ['Item', 'Definition'],
          [
            ...publication.commit.assets.map(({ itemId, previousCid, definitionCid }) => [
              itemId,
              `${previousCid ? shortCid(previousCid) : 'new'} → ${shortCid(definitionCid)}`,
            ]),
            ...(publication.commit.kept ?? []).map(({ itemId, cid }) => [itemId, `kept · ${shortCid(cid)}`]),
          ],
        ),
      );
    const media = publication.refresh?.media;
    if (media)
      parts.push(
        element(
          'div',
          media.status === 'failed' ? 'procedural-bad' : 'procedural-muted',
          `Preview of ${media.mapCode} revision ${media.revision}: ${MEDIA_STATE[media.status]}${media.error ? ` · ${media.error}` : ''}`,
        ),
        ...(media.preview ? [previewFigure(media.preview, `${media.mapCode} · revision ${media.revision}`)] : []),
      );
    root.replaceChildren(...parts);
  }

  /** Each asset of a manifest: its revision, the definition the authority holds, its state and its error. */
  static manifestAssets(assets) {
    const cidCell = (cid) => {
      if (!cid) return element('span', 'procedural-muted', '—');
      const node = element('code', '', shortCid(cid));
      node.title = cid;
      return node;
    };
    return table(
      ['Item', 'Revision', 'Definition', 'State', ''],
      assets.map(({ itemId, revisionCid, definitionCid, status, attempts, error }) => [
        itemId,
        cidCell(revisionCid),
        cidCell(definitionCid),
        badge(ASSET_STATE[status]),
        error
          ? element(
              'span',
              'procedural-bad',
              `${error.message} · ${error.retryable ? 'a retry is safe' : 'needs a repair'}${attempts > 1 ? ` · ${attempts} attempts` : ''}`,
            )
          : element('span', 'procedural-muted', attempts > 1 ? `${attempts} attempts` : ''),
      ]),
    );
  }

  static async publish(consents, revision) {
    if (!ProceduralPopulation.canMutate) return denied();
    const { population } = ProceduralPopulation;
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-publish-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Publish onto ${population.mapCode}? The server checks every revision first, publishes each exactly as
          reviewed, then binds the items${population.draft ? ' and writes the map' : ''} in one transaction, then draws
          the map preview and refreshes the runtime. Kept items change nothing. You can cancel before the commit:
          artwork already published stays published and unbound.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const started = await ProceduralPopulation.send(
      () =>
        Population.publish({
          id: population._id,
          body: { revision, acknowledged: consents.filter((box) => box.checked).map((box) => box.value) },
        }),
      'Publication started.',
    );
    // A refused publication shows the review of what is stored now.
    if (!started) await ProceduralPopulation.refresh();
  }

  static async cancelPublication() {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-publication-cancel-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Cancel the publication before its commit? Artwork it published stays published and unbound, and the population
          takes changes again.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const response = await Population.cancelPublication({ id: ProceduralPopulation.population._id });
    if (response.status !== 'success') return refusal(response);
    notify(
      response.data.publication.status === 'cancelled_before_commit'
        ? 'Publication cancelled before its commit.'
        : 'Cancellation requested: the server stops at its next safe point.',
      'success',
    );
    await ProceduralPopulation.refresh();
  }

  static async cancel() {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-cancel-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Cancel this population? Generation stops and nothing publishes. The server keeps every entry and the draft.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    await ProceduralPopulation.send(
      () => Population.cancel({ id: ProceduralPopulation.population._id }),
      'Population cancelled.',
    );
  }

  static async remove(id) {
    if (!ProceduralPopulation.canMutate) return denied();
    const answer = await Modal.RenderConfirm({
      id: 'procedural-population-delete-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Delete this population with its generated entries? What a publication wrote stays.
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const response = await Population.delete({ id });
    if (response.status !== 'success') return refusal(response);
    notify('Population deleted.', 'success');
    ProceduralPopulation.edit = null;
    await ProceduralPopulation.select('');
  }
}

export { ProceduralPopulation };
