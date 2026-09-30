import { darkTheme, renderChessPattern, ThemeEvents } from '../core/Css.js';
import { EditorLayout } from '../core/EditorLayout.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { CommandHistory } from '../core/CommandHistory.js';
import {
  clip,
  colorRegion,
  ellipseRegion,
  fillRegion,
  lineRegion,
  mirrorRegion,
  mixColor,
  outlineRegion,
  patternRegion,
  rectOutlineRegion,
  rectRegion,
  regionFromQuery,
  stampRegion,
  tiledPreview,
} from './PixelRegion.js';

/* Stroked 24x24 glyphs drawn in currentColor. Inline rather than a font: the toolbar lives in a
 * shadow root, where an external icon stylesheet never lands. */
const ICONS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/>',
  pencil: '<path d="M4 20h4L19.5 8.5a2 2 0 0 0-3-3L5 17v3z"/><path d="m14.5 6.5 3 3"/>',
  eraser: '<path d="M9 20h11"/><path d="M5.5 16.5 13 9l5.5 5.5L14 19H8z"/>',
  fill: '<path d="M11 4 5.5 9.5a2 2 0 0 0 0 3l4.5 4.5a2 2 0 0 0 3 0L18.5 12z"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z"/>',
  eyedropper: '<path d="M16.8 3.2a2.5 2.5 0 0 1 4 3l-2 2-3.5-3.5z"/><path d="m14.5 6.5-10 10L4 20l3.5-.5 10-10z"/>',
  marquee: '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="3.5 3"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  cut: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M7.5 16 18 4M16.5 16 6 4"/>',
  paste: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3.5h6V5"/><path d="M9 11h6M9 15h6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3"/><path d="m6.5 7 1 13h9l1-13"/>',
  flipH: '<path d="M12 3v18" stroke-dasharray="3 3"/><path d="M9 7 4.5 12 9 17z"/><path d="m15 7 4.5 5-4.5 5z"/>',
  flipV: '<path d="M3 12h18" stroke-dasharray="3 3"/><path d="M7 9 12 4.5 17 9z"/><path d="m7 15 5 4.5 5-4.5z"/>',
  rotateCW: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M21 4v5h-5"/>',
  rotateCCW: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3 4v5h5"/>',
  clear: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="m9 9 6 6M15 9l-6 6"/>',
  selectAll:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke-dasharray="3.5 3"/><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>',
  rescale: '<path d="M4 10V4h6"/><path d="M20 14v6h-6"/><path d="m4 4 7 7M20 20l-7-7"/>',
  line: '<path d="M5 19 19 5"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
  pattern:
    '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/><path d="M13 4h7v7M4 13h7v7" stroke-dasharray="2 2"/>',
  stamp: '<path d="M9 4h6v5l3 3v3H6v-3l3-3z"/><path d="M5 19h14"/>',
  wand: '<path d="m4 20 11-11"/><path d="m15 9 2-2"/><path d="M17 3v2M21 7h-2M19.5 4.5l-1 1"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="3 3"/><path d="M9 8 5 12l4 4M15 8l4 4-4 4"/>',
  outline:
    '<rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none"/>',
  tile: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
  fillSelection:
    '<path d="M11 4 5.5 9.5a2 2 0 0 0 0 3l4.5 4.5a2 2 0 0 0 3 0L18.5 12z"/><path d="M3 21h18" stroke-dasharray="3 3"/>',
};

/* The command a drag of each drawing tool records. */
const STROKE_COMMANDS = Object.freeze({
  pencil: 'DrawStroke',
  eraser: 'EraseStroke',
  line: 'DrawShape',
  rect: 'DrawShape',
  ellipse: 'DrawShape',
  pattern: 'PatternStroke',
  stamp: 'StampTemplate',
});

/* Tools that drag out a shape from the press to the pointer. */
const SHAPE_TOOLS = Object.freeze(['line', 'rect', 'ellipse']);

/* The mirror painting cycles through, and how its button names it. */
const SYMMETRIES = Object.freeze(['', 'x', 'y', 'xy']);
const SYMMETRY_LABELS = Object.freeze({ '': 'off', x: 'left ↔ right', y: 'top ↕ bottom', xy: 'four ways' });

/* One icon button: an inline SVG plus the accessible name, since the glyph carries no text. */
const iconButton = (part, name, label, { active = false } = {}) => html`
  <button
    part="${part}"
    class="icon-btn"
    type="button"
    title="${label}"
    aria-label="${label}"
    ${active ? 'data-active' : ''}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>
  </button>
`;

/* The ink of the rulers and the grid in the current theme. */
const inkColor = () => (darkTheme ? '#e1e1e1' : '#272727');

/* The colors of the current theme, as the variables the element's styles read. */
const themeStyle = () => css`
  :host {
    --hover: ${darkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'};
    --active: ${darkTheme ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)'};
    --ring: ${darkTheme ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)'};
    --rule: ${darkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.15)'};
    --panel: ${darkTheme ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)'};
    --menu: ${darkTheme ? '#242424' : '#ffffff'};
  }
`;

let elementCount = 0;

class ObjectLayerEngineElement extends HTMLElement {
  constructor() {
    super();
    this._themeKey = `object-layer-engine-${++elementCount}`;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = html`
      <style class="theme">
        ${themeStyle()}
      </style>
      <style>
        :host {
          --border: 1px solid #bbb;
          display: block;
        }
        /* The element's own face; slotted sections keep the face of the page. */
        .editor-stage,
        .controls {
          font-family:
            system-ui,
            -apple-system,
            'Segoe UI',
            Roboto,
            'Helvetica Neue',
            Arial;
          font-size-adjust: none;
        }
        .controls {
          display: contents;
        }
        /* Rulers on two sides of the frame: the X axis above, the Y axis on the left, and the
           frame's own border padded onto each so the ticks line up with the cells inside it.
           Both stay on their edge while the board scrolls. */
        .board {
          width: max-content;
          line-height: 0;
        }
        .ruler-row {
          position: sticky;
          top: 0;
          z-index: 1;
          display: flex;
          background: var(--editor-stage-background);
        }
        .board-row {
          display: flex;
        }
        .ruler-corner,
        canvas.ruler-y {
          position: sticky;
          left: 0;
          z-index: 1;
          flex: none;
          background: var(--editor-stage-background);
        }
        canvas.ruler-x {
          border-left: var(--border);
          border-left-color: transparent;
        }
        canvas.ruler-y {
          border-top: var(--border);
          border-top-color: transparent;
        }
        .canvas-frame {
          border: var(--border);
          display: inline-block;
          line-height: 0;
          position: relative;
          background: transparent;
          image-rendering: pixelated;
        }
        .cursor-info {
          font-size: 12px;
          opacity: 0.75;
          min-height: 1.2em;
          font-variant-numeric: tabular-nums;
        }
        /* The shade bar shows its own range: black, the base color, white. */
        input[part='shade'] {
          appearance: none;
          height: 10px;
          border: var(--border);
          border-radius: 5px;
        }
        input[part='shade']::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border: 2px solid #555;
          border-radius: 50%;
          background: #fff;
        }
        input[part='shade']::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border: 2px solid #555;
          border-radius: 50%;
          background: #fff;
        }
        canvas.tile-preview {
          align-self: flex-start;
          image-rendering: pixelated;
          border: var(--border);
        }
        canvas.tile-preview[hidden] {
          display: none;
        }
        canvas.canvas-layer {
          display: block;
          touch-action: none;
          cursor: crosshair;
        }
        canvas.grid-layer {
          position: absolute;
          left: 0;
          top: 0;
          pointer-events: none;
        }
        .toolbar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .toolbar label {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }
        .group {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }
        .sel-info {
          font-size: 12px;
          opacity: 0.75;
          min-width: 11ch;
          font-variant-numeric: tabular-nums;
        }

        /* Icon buttons: square, quiet until hovered, ringed while active — the same state
           language the palette element uses for a chosen swatch. */
        .icon-btn {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .icon-btn svg {
          width: 18px;
          height: 18px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          pointer-events: none;
        }
        .icon-btn:hover:not(:disabled) {
          background: var(--hover);
        }
        .icon-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .icon-btn[data-active] {
          background: var(--active);
          border-color: currentColor;
          box-shadow: 0 0 0 2px var(--ring);
        }
        .text-btn {
          appearance: none;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 6px;
          color: inherit;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          padding: 5px 10px;
        }
        .text-btn:hover:not(:disabled) {
          background: var(--hover);
        }
        .text-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }

        /* A rule between groups, so the toolbar reads as sections rather than one long row. */
        .sep {
          width: 1px;
          align-self: stretch;
          min-height: 24px;
          background: var(--rule);
        }

        /* The selection bar only exists while select mode is on, so the default toolbar stays
           as short as it was. */
        .sel-bar[hidden] {
          display: none;
        }
        .sel-bar {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
          padding: 4px 6px;
          border-radius: 8px;
          background: var(--panel);
        }
        .hint {
          font-size: 12px;
          opacity: 0.7;
        }
        /* A locked replace color over the chessboard, so its alpha shows. */
        .swatch {
          display: inline-block;
          width: 22px;
          height: 22px;
          border: var(--border);
          border-radius: 3px;
          line-height: 0;
        }
        .swatch > span {
          display: block;
          width: 100%;
          height: 100%;
        }

        /* Right-click menu, positioned over the canvas frame at the pointer. */
        .ctx-menu {
          position: absolute;
          z-index: 5;
          min-width: 148px;
          padding: 4px;
          border-radius: 8px;
          line-height: normal;
          background: var(--menu);
          border: 1px solid var(--rule);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        }
        .ctx-menu[hidden] {
          display: none;
        }
        .ctx-item {
          appearance: none;
          background: transparent;
          border: 0;
          border-radius: 5px;
          color: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          font: inherit;
          font-size: 13px;
          text-align: left;
        }
        .ctx-item svg {
          width: 15px;
          height: 15px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          flex: none;
        }
        .ctx-item:hover:not(:disabled) {
          background: var(--hover);
        }
        .ctx-item:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .ctx-key {
          margin-left: auto;
          opacity: 0.55;
          font-size: 11px;
        }
      </style>

      ${EditorLayout.render({
        subject: 'canvas',
        readout: html`<span part="cursor-info" class="cursor-info"></span>`,
        stage: html`<div class="board">
          <div class="ruler-row">
            <span class="ruler-corner"></span>
            <canvas part="ruler-x" class="ruler-x"></canvas>
          </div>
          <div class="board-row">
            <canvas part="ruler-y" class="ruler-y"></canvas>
            <div class="canvas-frame" style="${renderChessPattern()}">
              <canvas part="canvas" class="canvas-layer"></canvas>
              <canvas part="grid" class="grid-layer"></canvas>
              <div class="ctx-menu" part="ctx-menu" hidden></div>
            </div>
          </div>
        </div>`,
        tools: html`<slot name="actions"></slot>
          <div class="controls">
            <div class="toolbar">
              ${iconButton('undo', 'undo', 'Undo (Ctrl+Z)')} ${iconButton('redo', 'redo', 'Redo (Ctrl+Shift+Z)')}

              <span class="sep"></span>

              <!-- Tools: one button each, so the active tool is visible without opening anything. -->
              ${iconButton('tool-pencil', 'pencil', 'Pencil', { active: true })}
              ${iconButton('tool-eraser', 'eraser', 'Eraser')} ${iconButton('tool-fill', 'fill', 'Fill')}
              ${iconButton('tool-eyedropper', 'eyedropper', 'Pick colour')} ${iconButton('tool-line', 'line', 'Line')}
              ${iconButton('tool-rect', 'rect', 'Rectangle (Shift: filled)')}
              ${iconButton('tool-ellipse', 'ellipse', 'Ellipse (Shift: filled)')}
              ${iconButton('tool-pattern', 'pattern', 'Pattern brush: paints the clipboard as a repeating tile')}
              ${iconButton('tool-stamp', 'stamp', 'Stamp: places the stamp (a template, else the clipboard)')}
              ${iconButton('tool-wand', 'wand', 'Select by colour (Shift: every cell of that colour)')}

              <span class="sep"></span>

              <!-- Select mode: while it is on the canvas selects and moves instead of drawing. -->
              ${iconButton('tool-select', 'marquee', 'Select mode: drag to select, then drag to move')}
              ${iconButton('symmetry', 'mirror', 'Mirror painting: off')}
              ${iconButton('outline', 'outline', 'Outline the painted shape in the brush colour')}
              ${iconButton('tile-preview', 'tile', 'Seamless tile preview')}

              <span class="sep"></span>

              <div class="group">
                ${iconButton('flip-h', 'flipH', 'Flip horizontally')}
                ${iconButton('flip-v', 'flipV', 'Flip vertically')} ${iconButton('rot-ccw', 'rotateCCW', 'Rotate -90°')}
                ${iconButton('rot-cw', 'rotateCW', 'Rotate +90°')}
                ${iconButton('clear', 'clear', 'Clear (make fully transparent)')}
              </div>
            </div>

            <div class="toolbar">
              <input type="color" part="color" title="Brush color" value="#000000" />
              <label
                >hex
                <input
                  type="text"
                  part="hex-input"
                  title="Hex color (e.g., #FF0000 or #FF0000FF)"
                  placeholder="#000000FF"
                  style="width:9ch"
              /></label>
              <label
                >rgba
                <input type="number" part="r-input" min="0" max="255" value="0" title="Red (0-255)" style="width:5ch" />
                <input
                  type="number"
                  part="g-input"
                  min="0"
                  max="255"
                  value="0"
                  title="Green (0-255)"
                  style="width:5ch"
                />
                <input
                  type="number"
                  part="b-input"
                  min="0"
                  max="255"
                  value="0"
                  title="Blue (0-255)"
                  style="width:5ch"
                />
                <input
                  type="number"
                  part="a-input"
                  min="0"
                  max="255"
                  value="255"
                  title="Alpha (0-255)"
                  style="width:5ch"
                />
              </label>

              <label
                >opacity <input type="range" part="opacity" min="0" max="255" value="255" style="width:10rem" /><input
                  type="number"
                  part="opacity-num"
                  min="0"
                  max="255"
                  value="255"
                  style="width:5ch;margin-left:4px"
              /></label>

              <label title="Shade: left adds black, right adds white"
                >shade <input type="range" part="shade" min="-100" max="100" value="0" style="width:10rem"
              /></label>

              <label>brush <input type="number" part="brush-size" min="1" value="1" /></label>
            </div>

            <!-- Replace global color: both colors lock from the brush color. -->
            <div class="toolbar">
              <span class="hint">Replace global color</span>
              <button
                part="lock-source"
                class="text-btn"
                type="button"
                title="Lock the brush color as the color to replace"
              >
                Lock Source Color
              </button>
              <span class="swatch" style="${renderChessPattern(8)}"><span part="source-swatch"></span></span>
              <span aria-hidden="true">→</span>
              <button part="lock-target" class="text-btn" type="button" title="Lock the brush color as the new color">
                Lock Target Color
              </button>
              <span class="swatch" style="${renderChessPattern(8)}"><span part="target-swatch"></span></span>
              <button
                part="global-replace"
                class="text-btn"
                type="button"
                title="Replace every cell of the source color on the canvas with the target color"
              >
                Global Replace
              </button>
              <span part="replace-info" class="hint"></span>
            </div>

            <div class="toolbar">
              <label>pixel-size <input type="number" part="pixel-size" min="1" value="16" /></label>
              <label
                >cells <input type="number" part="cell-width" min="1" value="16" style="width:6ch" /> x
                <input type="number" part="cell-height" min="1" value="16" style="width:6ch"
              /></label>
              <label class="switch"> <input type="checkbox" part="toggle-grid" /> grid </label>

              <span class="sep"></span>

              <button part="export" class="text-btn" type="button">Export PNG</button>
              <button part="export-json" class="text-btn" type="button">Export JSON</button>
              <button part="import-json" class="text-btn" type="button">Import JSON</button>
            </div>

            <!-- Everything the selection can do, shown only while select mode is on. -->
            <div class="sel-bar" part="sel-bar" hidden>
              ${iconButton('select-all', 'selectAll', 'Select all (Ctrl+A)')}
              ${iconButton('reselect', 'marquee', 'Reselect: drop this one and drag a new area (Esc)')}
              <span class="sep"></span>
              ${iconButton('copy', 'copy', 'Copy (Ctrl+C)')} ${iconButton('cut', 'cut', 'Cut (Ctrl+X)')}
              ${iconButton('paste', 'paste', 'Paste (Ctrl+V)')} ${iconButton('delete', 'trash', 'Delete (Del)')}
              <span class="sep"></span>
              <label
                >rescale <input type="number" part="scale-width" min="1" value="16" style="width:6ch" /> x
                <input type="number" part="scale-height" min="1" value="16" style="width:6ch"
              /></label>
              ${iconButton('scale-apply', 'rescale', 'Resample to that size, keeping the source palette')}
              <span class="sep"></span>
              <label title="Cells to select: 'x,y x,y …', 'rect x0 y0 x1 y1', 'circle cx cy r' or 'poly x,y x,y x,y'"
                >cells <input type="text" part="mask-input" placeholder="rect 0 0 7 7" style="width:14ch"
              /></label>
              ${iconButton('fill-selection', 'fillSelection', 'Fill the selection with the brush colour')}
              <span class="sep"></span>
              <span part="sel-info" class="sel-info">no selection</span>
              <span part="sel-hint" class="hint">Drag to select</span>
            </div>

            <canvas part="tile-preview-canvas" class="tile-preview" hidden></canvas>
          </div>
          <slot></slot>`,
      })}
    `;

    // DOM
    this._pixelCanvas = this.shadowRoot.querySelector('canvas[part="canvas"]');
    this._gridCanvas = this.shadowRoot.querySelector('canvas[part="grid"]');
    this._rulerX = this.shadowRoot.querySelector('canvas[part="ruler-x"]');
    this._rulerY = this.shadowRoot.querySelector('canvas[part="ruler-y"]');
    this._rulerCorner = this.shadowRoot.querySelector('.ruler-corner');
    this._themeStyle = this.shadowRoot.querySelector('style.theme');
    EditorLayout.bind(this.shadowRoot);
    this._cursorInfo = this.shadowRoot.querySelector('span[part="cursor-info"]');
    this._colorInput = this.shadowRoot.querySelector('input[part="color"]');
    this._hexInput = this.shadowRoot.querySelector('input[part="hex-input"]');
    this._rInput = this.shadowRoot.querySelector('input[part="r-input"]');
    this._gInput = this.shadowRoot.querySelector('input[part="g-input"]');
    this._bInput = this.shadowRoot.querySelector('input[part="b-input"]');
    this._aInput = this.shadowRoot.querySelector('input[part="a-input"]');
    // Tool buttons, keyed by the tool they select.
    this._toolButtons = {
      pencil: this.shadowRoot.querySelector('button[part="tool-pencil"]'),
      eraser: this.shadowRoot.querySelector('button[part="tool-eraser"]'),
      fill: this.shadowRoot.querySelector('button[part="tool-fill"]'),
      eyedropper: this.shadowRoot.querySelector('button[part="tool-eyedropper"]'),
      line: this.shadowRoot.querySelector('button[part="tool-line"]'),
      rect: this.shadowRoot.querySelector('button[part="tool-rect"]'),
      ellipse: this.shadowRoot.querySelector('button[part="tool-ellipse"]'),
      pattern: this.shadowRoot.querySelector('button[part="tool-pattern"]'),
      stamp: this.shadowRoot.querySelector('button[part="tool-stamp"]'),
      wand: this.shadowRoot.querySelector('button[part="tool-wand"]'),
    };
    this._symmetryBtn = this.shadowRoot.querySelector('button[part="symmetry"]');
    this._outlineBtn = this.shadowRoot.querySelector('button[part="outline"]');
    this._tilePreviewBtn = this.shadowRoot.querySelector('button[part="tile-preview"]');
    this._tilePreviewCanvas = this.shadowRoot.querySelector('canvas[part="tile-preview-canvas"]');
    this._maskInput = this.shadowRoot.querySelector('input[part="mask-input"]');
    this._fillSelectionBtn = this.shadowRoot.querySelector('button[part="fill-selection"]');
    this._selectModeBtn = this.shadowRoot.querySelector('button[part="tool-select"]');
    this._brushSizeInput = this.shadowRoot.querySelector('input[part="brush-size"]');
    this._pixelSizeInput = this.shadowRoot.querySelector('input[part="pixel-size"]');
    this._exportBtn = this.shadowRoot.querySelector('button[part="export"]');
    this._exportJsonBtn = this.shadowRoot.querySelector('button[part="export-json"]');
    this._importJsonBtn = this.shadowRoot.querySelector('button[part="import-json"]');
    this._toggleGrid = this.shadowRoot.querySelector('input[part="toggle-grid"]');

    // new controls
    this._widthInput = this.shadowRoot.querySelector('input[part="cell-width"]');
    this._heightInput = this.shadowRoot.querySelector('input[part="cell-height"]');
    this._flipHBtn = this.shadowRoot.querySelector('button[part="flip-h"]');
    this._flipVBtn = this.shadowRoot.querySelector('button[part="flip-v"]');
    this._rotCCWBtn = this.shadowRoot.querySelector('button[part="rot-ccw"]');
    this._rotCWBtn = this.shadowRoot.querySelector('button[part="rot-cw"]');
    this._clearBtn = this.shadowRoot.querySelector('button[part="clear"]');
    this._opacityRange = this.shadowRoot.querySelector('input[part="opacity"]');
    this._opacityNumber = this.shadowRoot.querySelector('input[part="opacity-num"]');
    this._shadeRange = this.shadowRoot.querySelector('input[part="shade"]');
    this._lockSourceBtn = this.shadowRoot.querySelector('button[part="lock-source"]');
    this._lockTargetBtn = this.shadowRoot.querySelector('button[part="lock-target"]');
    this._globalReplaceBtn = this.shadowRoot.querySelector('button[part="global-replace"]');
    this._sourceSwatch = this.shadowRoot.querySelector('span[part="source-swatch"]');
    this._targetSwatch = this.shadowRoot.querySelector('span[part="target-swatch"]');
    this._replaceInfo = this.shadowRoot.querySelector('span[part="replace-info"]');

    // undo/redo buttons
    this._undoBtn = this.shadowRoot.querySelector('button[part="undo"]');
    this._redoBtn = this.shadowRoot.querySelector('button[part="redo"]');

    // selection + rescale controls
    this._selBar = this.shadowRoot.querySelector('div[part="sel-bar"]');
    this._selectAllBtn = this.shadowRoot.querySelector('button[part="select-all"]');
    this._reselectBtn = this.shadowRoot.querySelector('button[part="reselect"]');
    this._copyBtn = this.shadowRoot.querySelector('button[part="copy"]');
    this._cutBtn = this.shadowRoot.querySelector('button[part="cut"]');
    this._pasteBtn = this.shadowRoot.querySelector('button[part="paste"]');
    this._deleteBtn = this.shadowRoot.querySelector('button[part="delete"]');
    this._selInfo = this.shadowRoot.querySelector('span[part="sel-info"]');
    this._selHint = this.shadowRoot.querySelector('span[part="sel-hint"]');
    this._ctxMenu = this.shadowRoot.querySelector('div[part="ctx-menu"]');
    this._scaleWidthInput = this.shadowRoot.querySelector('input[part="scale-width"]');
    this._scaleHeightInput = this.shadowRoot.querySelector('input[part="scale-height"]');
    this._scaleApplyBtn = this.shadowRoot.querySelector('button[part="scale-apply"]');

    // internal state
    this._width = 16;
    this._height = 16;
    this._pixelSize = 16;
    this._brushSize = 1;
    // brush color stored as [r,g,b,a]
    this._brushColor = [0, 0, 0, 255];
    // The [r,g,b,a] colors a global replace reads, or null until locked.
    this._replaceSource = null;
    this._replaceTarget = null;
    this._matrix = this._createEmptyMatrix(this._width, this._height);

    this._pixelCtx = null;
    this._gridCtx = null;

    this._isPointerDown = false;
    this._tool = 'pencil';
    this._showGrid = false;

    // History: one named command per finished operation; a drag is one command.
    this._history = new CommandHistory({ limit: 200, onChange: () => this._updateToolbarButtons() });
    this._transaction = null;

    // Select mode replaces drawing with selecting and moving; off, the canvas draws as before.
    this._selectMode = false;
    // selection: {x, y, w, h} in cells, or null. _selAnchor holds the marquee drag origin.
    this._selection = null;
    this._selAnchor = null;
    // While a move is under way the cells travel here, lifted out of the matrix so what they
    // covered shows through, and are written back on drop.
    this._floating = null;
    this._moveGrab = null;
    this._clipboard = null; // matrix copied out of a selection; null cells lie outside a mask
    // A mask selection: the "dx,dy" keys of its cells from the selection corner, or null.
    this._selectionMask = null;
    // The mirror strokes and shapes keep: '', 'x', 'y' or 'xy'.
    this._symmetry = '';
    // A shape drag: where it started and the frame before it, repainted on each move.
    this._shapeDrag = null;
    // Where a pattern stroke anchors its tile: the first cell it paints.
    this._patternOrigin = null;
    // What the stamp tool places: a template frame, else the clipboard.
    this._stamp = null;
    this._showTilePreview = false;
    this._antsPhase = 0; // marching-ants offset, advanced while a selection stands
    this._antsFrame = 0;

    // binds
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // transform methods bound (useful if passing as callbacks)
    this.flipHorizontal = this.flipHorizontal.bind(this);
    this.flipVertical = this.flipVertical.bind(this);
    this.rotateCW = this.rotateCW.bind(this);
    this.rotateCCW = this.rotateCCW.bind(this);
    this._tickAnts = this._tickAnts.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);

    // ensure keyboard handlers bound for undo/redo
  }

  static get observedAttributes() {
    return ['width', 'height', 'pixel-size'];
  }
  attributeChangedCallback(name, oldV, newV) {
    // An attribute this element wrote itself is already applied: reacting to it would read the
    // sibling axis before its own write lands and cut the matrix to the stale size.
    if (oldV === newV || this._reflecting) return;
    if (name === 'width') this.width = parseInt(newV, 10) || this._width;
    if (name === 'height') this.height = parseInt(newV, 10) || this._height;
    if (name === 'pixel-size') this.pixelSize = parseInt(newV, 10) || this._pixelSize;
  }

  connectedCallback() {
    // respect attributes if present
    if (this.hasAttribute('width')) this._width = Math.max(1, parseInt(this.getAttribute('width'), 10));
    if (this.hasAttribute('height')) this._height = Math.max(1, parseInt(this.getAttribute('height'), 10));
    if (this.hasAttribute('pixel-size')) this._pixelSize = Math.max(1, parseInt(this.getAttribute('pixel-size'), 10));

    this._setupContextsAndSize();

    // set initial UI control values (keeps in sync with attributes)
    if (this._widthInput) this._widthInput.value = String(this._width);
    if (this._heightInput) this._heightInput.value = String(this._height);
    if (this._pixelSizeInput) this._pixelSizeInput.value = String(this._pixelSize);
    if (this._brushSizeInput) this._brushSizeInput.value = String(this._brushSize);

    // initialize color, opacity and shade UI
    this.setBrushColor(this._brushColor);

    // UI events
    this._colorInput.addEventListener('input', (e) => {
      const rgb = this._hexToRgba(e.target.value);
      // keep current alpha
      this.setBrushColor([rgb[0], rgb[1], rgb[2], this._brushColor[3]]);
    });

    // hex text input with optional alpha
    if (this._hexInput) {
      this._hexInput.addEventListener('change', (e) => {
        const rgba = this._hexToRgbaWithAlpha(e.target.value);
        this.setBrushColor(rgba);
      });
    }

    // individual RGBA inputs
    const updateFromRGBAInputs = () => {
      const r = Math.max(0, Math.min(255, parseInt(this._rInput.value, 10) || 0));
      const g = Math.max(0, Math.min(255, parseInt(this._gInput.value, 10) || 0));
      const b = Math.max(0, Math.min(255, parseInt(this._bInput.value, 10) || 0));
      const a = Math.max(0, Math.min(255, parseInt(this._aInput.value, 10) || 0));
      this.setBrushColor([r, g, b, a]);
    };
    if (this._rInput) this._rInput.addEventListener('change', updateFromRGBAInputs);
    if (this._gInput) this._gInput.addEventListener('change', updateFromRGBAInputs);
    if (this._bInput) this._bInput.addEventListener('change', updateFromRGBAInputs);
    if (this._aInput) this._aInput.addEventListener('change', updateFromRGBAInputs);

    for (const [name, button] of Object.entries(this._toolButtons)) {
      if (button) button.addEventListener('click', () => this.setTool(name));
    }
    if (this._selectModeBtn) this._selectModeBtn.addEventListener('click', () => this.toggleSelectMode());
    if (this._symmetryBtn)
      this._symmetryBtn.addEventListener('click', () =>
        this.setSymmetry(SYMMETRIES[(SYMMETRIES.indexOf(this._symmetry) + 1) % SYMMETRIES.length]),
      );
    if (this._outlineBtn) this._outlineBtn.addEventListener('click', () => this.outline());
    if (this._tilePreviewBtn)
      this._tilePreviewBtn.addEventListener('click', () => {
        this._showTilePreview = !this._showTilePreview;
        this._tilePreviewBtn.toggleAttribute('data-active', this._showTilePreview);
        this._tilePreviewCanvas.hidden = !this._showTilePreview;
        this.render();
      });
    if (this._maskInput)
      this._maskInput.addEventListener('change', (e) => {
        const cells = regionFromQuery(e.target.value);
        if (cells) this.setSelectionMask(cells);
      });
    if (this._fillSelectionBtn)
      this._fillSelectionBtn.addEventListener('click', () =>
        this.transformRegion('FillRegion', (frame, cells) => fillRegion(frame, cells, this._brushColor)),
      );
    this._brushSizeInput.addEventListener('change', (e) => this.setBrushSize(parseInt(e.target.value, 10) || 1));
    this._pixelSizeInput.addEventListener('change', (e) => {
      this.pixelSize = Math.max(1, parseInt(e.target.value, 10) || 1);
    });
    this._toggleGrid.addEventListener('change', (e) => {
      this._showGrid = !!e.target.checked;
      this._renderGrid();
    });

    // shade: mixes the base color with black (left) or white (right), alpha kept
    if (this._shadeRange)
      this._shadeRange.addEventListener('input', (e) => {
        const share = Number(e.target.value) / 100;
        const target = share > 0 ? [255, 255, 255] : [0, 0, 0];
        this._applyBrushColor([...mixColor(this._shadeBase, target, Math.abs(share)), this._brushColor[3]]);
      });

    if (this._lockSourceBtn) this._lockSourceBtn.addEventListener('click', () => this.lockSourceColor());
    if (this._lockTargetBtn) this._lockTargetBtn.addEventListener('click', () => this.lockTargetColor());
    if (this._globalReplaceBtn) this._globalReplaceBtn.addEventListener('click', () => this.globalReplace());

    // opacity controls - keep range and number in sync
    if (this._opacityRange) {
      this._opacityRange.addEventListener('input', (e) => {
        const v = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
        this.setBrushAlpha(v);
      });
    }
    if (this._opacityNumber) {
      this._opacityNumber.addEventListener('change', (e) => {
        const v = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
        this.setBrushAlpha(v);
      });
    }

    // width/height change -> resize (preserve existing content)
    if (this._widthInput)
      this._widthInput.addEventListener('change', (e) => {
        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.command('Resize', () => this.resize(val, this._height, { preserve: true }));
      });
    if (this._heightInput)
      this._heightInput.addEventListener('change', (e) => {
        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.command('Resize', () => this.resize(this._width, val, { preserve: true }));
      });

    // transform buttons
    if (this._flipHBtn) this._flipHBtn.addEventListener('click', () => this.command('Flip', this.flipHorizontal));
    if (this._flipVBtn) this._flipVBtn.addEventListener('click', () => this.command('Flip', this.flipVertical));
    if (this._rotCWBtn) this._rotCWBtn.addEventListener('click', () => this.command('Rotate', this.rotateCW));
    if (this._rotCCWBtn) this._rotCCWBtn.addEventListener('click', () => this.command('Rotate', this.rotateCCW));

    // clear button (makes canvas fully transparent)
    if (this._clearBtn) this._clearBtn.addEventListener('click', () => this.command('Clear', () => this.clear()));

    // Export/Import
    this._exportBtn.addEventListener('click', () => this.exportPNG());
    this._exportJsonBtn.addEventListener('click', () => {
      const json = this.exportMatrixJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'object-layer.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    this._importJsonBtn.addEventListener('click', async () => {
      const file = await this._pickFile();
      if (!file) return;
      const text = await file.text();
      try {
        this.command('Import', () => this.importMatrixJSON(text));
      } catch (err) {
        console.error(err);
        alert('Invalid JSON');
      }
    });

    // undo/redo
    if (this._undoBtn) this._undoBtn.addEventListener('click', () => this.undo());
    if (this._redoBtn) this._redoBtn.addEventListener('click', () => this.redo());

    // selection + clipboard
    if (this._selectAllBtn) this._selectAllBtn.addEventListener('click', () => this.selectAll());
    if (this._reselectBtn) this._reselectBtn.addEventListener('click', () => this.reselect());
    if (this._copyBtn) this._copyBtn.addEventListener('click', () => this.copySelection());
    if (this._cutBtn) this._cutBtn.addEventListener('click', () => this.cutSelection());
    if (this._pasteBtn) this._pasteBtn.addEventListener('click', () => this.paste());
    if (this._deleteBtn) this._deleteBtn.addEventListener('click', () => this.deleteSelection());

    // Right-click opens the clipboard menu over the canvas, and any press elsewhere closes it.
    this._pixelCanvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);

    // rescale: the inputs track whatever the Apply button would act on
    if (this._scaleApplyBtn)
      this._scaleApplyBtn.addEventListener('click', () => {
        const w = Math.max(1, parseInt(this._scaleWidthInput?.value, 10) || 1);
        const h = Math.max(1, parseInt(this._scaleHeightInput?.value, 10) || 1);
        this.rescale(w, h);
      });

    // Pointer events
    this._pixelCanvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // keyboard for undo/redo
    window.addEventListener('keydown', this._onKeyDown);
    ThemeEvents[this._themeKey] = () => this._applyTheme();

    // initial render and clear history
    this.render();
    this._clearHistory();
    this._updateToolbarButtons();
    this._updateToolButtons();
    this._updateSelectionUI();
    this._updateReplaceUI();
  }

  disconnectedCallback() {
    this._pixelCanvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);

    window.removeEventListener('keydown', this._onKeyDown);

    this._pixelCanvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);

    // the ants loop holds a frame handle across renders; it must not outlive the element
    if (this._antsFrame) cancelAnimationFrame(this._antsFrame);
    this._antsFrame = 0;
    delete ThemeEvents[this._themeKey];
  }

  /* Repaints what the theme colors: the style variables, the rulers and the grid. */
  _applyTheme() {
    this._themeStyle.textContent = themeStyle();
    this._renderRulers();
    this._renderGrid();
  }

  // ---------------- Matrix helpers ----------------
  _createEmptyMatrix(w, h) {
    const mat = new Array(h);
    for (let y = 0; y < h; y++) {
      mat[y] = new Array(w);
      for (let x = 0; x < w; x++) mat[y][x] = [0, 0, 0, 0];
    }
    return mat;
  }

  createMatrix(width, height, fill = [0, 0, 0, 0]) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const mat = this._createEmptyMatrix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mat[y][x] = fill.slice();
    return mat;
  }

  /* Takes new cell dimensions and keeps the size inputs and attributes saying the same thing,
   * so a matrix loaded at another size cannot leave stale numbers for the next change to apply. */
  _setDimensions(w, h) {
    this._width = w;
    this._height = h;
    if (this._widthInput) this._widthInput.value = String(w);
    if (this._heightInput) this._heightInput.value = String(h);
    this._reflecting = true;
    try {
      this.setAttribute('width', String(w));
      this.setAttribute('height', String(h));
    } finally {
      this._reflecting = false;
    }
  }

  loadMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) throw new TypeError('matrix must be non-empty 2D array');
    const h = matrix.length;
    const w = matrix[0].length;
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(matrix[y]) || matrix[y].length !== w) throw new TypeError('matrix must be rectangular');
      for (let x = 0; x < w; x++) {
        const v = matrix[y][x];
        if (!Array.isArray(v) || v.length !== 4) throw new TypeError('each cell must be [r,g,b,a]');
        matrix[y][x] = v.map((n) => this._clampInt(n));
      }
    }
    this._matrix = matrix.map((r) => r.map((c) => c.slice()));
    this._setDimensions(w, h);
    this.clearSelection();
    this._updateSelectionUI();
    this._setupContextsAndSize();
    this.render();
    this.dispatchEvent(new CustomEvent('matrixload', { detail: { width: w, height: h } }));
  }

  clear(fill = [0, 0, 0, 0]) {
    for (let y = 0; y < this._height; y++) for (let x = 0; x < this._width; x++) this._matrix[y][x] = fill.slice();
    this.render();
    this.dispatchEvent(new CustomEvent('clear'));
  }

  resize(w, h, { preserve = true } = {}) {
    const nw = Math.max(1, Math.floor(w));
    const nh = Math.max(1, Math.floor(h));
    const newMat = this._createEmptyMatrix(nw, nh);
    if (preserve) {
      const minW = Math.min(nw, this._width);
      const minH = Math.min(nh, this._height);
      for (let y = 0; y < minH; y++) for (let x = 0; x < minW; x++) newMat[y][x] = this._matrix[y][x].slice();
    }
    this._matrix = newMat;
    this._setDimensions(nw, nh);

    this._clampSelection();
    this._updateSelectionUI();
    this._setupContextsAndSize();
    this.render();
    this.dispatchEvent(new CustomEvent('resize', { detail: { width: nw, height: nh } }));
  }

  setPixel(x, y, rgba, renderNow = true) {
    if (!this._inBounds(x, y)) return false;
    this._matrix[y][x] = rgba.map((n) => this._clampInt(n));
    if (renderNow) this.render();
    this.dispatchEvent(new CustomEvent('pixelchange', { detail: { x, y, rgba: this._matrix[y][x].slice() } }));
    return true;
  }

  getPixel(x, y) {
    return this._inBounds(x, y) ? this._matrix[y][x].slice() : null;
  }
  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this._width && y < this._height;
  }
  _clampInt(v) {
    const n = Number(v) || 0;
    return Math.min(255, Math.max(0, Math.floor(n)));
  }

  // ---------------- Canvas sizing and contexts ----------------
  _setupContextsAndSize() {
    // logical canvas (one logical pixel per image pixel). CSS scales by pixelSize.
    this._pixelCanvas.width = this._width;
    this._pixelCanvas.height = this._height;
    this._pixelCanvas.style.width = `${this._width * this._pixelSize}px`;
    this._pixelCanvas.style.height = `${this._height * this._pixelSize}px`;

    // grid overlay uses CSS pixel coordinates
    this._gridCanvas.width = this._width * this._pixelSize;
    this._gridCanvas.height = this._height * this._pixelSize;
    this._gridCanvas.style.width = this._pixelCanvas.style.width;
    this._gridCanvas.style.height = this._pixelCanvas.style.height;

    this._pixelCtx = this._pixelCanvas.getContext('2d');
    this._gridCtx = this._gridCanvas.getContext('2d');
    try {
      this._pixelCtx.imageSmoothingEnabled = false;
      this._gridCtx.imageSmoothingEnabled = false;
    } catch (e) {}
    this._renderRulers();
    this._renderGrid();
  }

  /* Cell indices along each axis. Every cell gets a tick; a number goes on every cell it fits
   * on, and on every Nth otherwise, so the rulers stay readable at any pixel size. */
  _renderRulers() {
    const ps = this._pixelSize;
    const font = '10px ui-monospace, Menlo, monospace';
    const color = inkColor();
    const thickness = 16;
    const measure = this._rulerX.getContext('2d');
    measure.font = font;
    const digits = measure.measureText(String(Math.max(this._width, this._height) - 1)).width;
    const step = Math.max(1, Math.ceil((digits + 4) / ps));

    const draw = (canvas, count, horizontal) => {
      canvas.width = horizontal ? count * ps : Math.ceil(digits) + 8;
      canvas.height = horizontal ? thickness : count * ps;
      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.textBaseline = 'middle';
      ctx.textAlign = horizontal ? 'center' : 'right';
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const at = i * ps + 0.5;
        const labelled = i % step === 0;
        const tick = labelled ? 5 : 2;
        if (horizontal) {
          ctx.moveTo(at, thickness);
          ctx.lineTo(at, thickness - tick);
          if (labelled) ctx.fillText(String(i), at + ps / 2, (thickness - tick) / 2);
        } else {
          ctx.moveTo(canvas.width, at);
          ctx.lineTo(canvas.width - tick, at);
          if (labelled) ctx.fillText(String(i), canvas.width - tick - 2, at + ps / 2);
        }
      }
      ctx.stroke();
    };
    draw(this._rulerX, this._width, true);
    draw(this._rulerY, this._height, false);
    this._rulerCorner.style.width = this._rulerY.style.width;
  }

  /* The cell under the pointer, or nothing once it leaves the canvas. */
  _updateCursorInfo(x, y) {
    const inside = x >= 0 && y >= 0 && x < this._width && y < this._height;
    this._cursorInfo.textContent = inside ? `x: ${x}  y: ${y}` : '';
  }

  render() {
    // sanity: ensure matrix shape matches
    if (
      !Array.isArray(this._matrix) ||
      this._matrix.length !== this._height ||
      !Array.isArray(this._matrix[0]) ||
      this._matrix[0].length !== this._width
    ) {
      this._matrix = this._createEmptyMatrix(this._width, this._height);
    }

    // detect transparency (fast bailout)
    let hasTransparent = false;
    for (let y = 0; y < this._height && !hasTransparent; y++) {
      for (let x = 0; x < this._width; x++) {
        const a = this._matrix[y] && this._matrix[y][x] ? this._matrix[y][x][3] : 0;
        if (a !== 255) {
          hasTransparent = true;
          break;
        }
      }
    }

    // clear and optionally draw checkerboard (visual only)
    this._pixelCtx.clearRect(0, 0, this._pixelCanvas.width, this._pixelCanvas.height);
    if (hasTransparent) this._drawCheckerboard();

    // write image data
    const img = this._pixelCtx.createImageData(this._width, this._height);
    const data = img.data;
    let p = 0;
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const cell = this._floatingCellAt(x, y) || (this._matrix[y] && this._matrix[y][x]) || [0, 0, 0, 0];
        data[p++] = this._clampInt(cell[0]);
        data[p++] = this._clampInt(cell[1]);
        data[p++] = this._clampInt(cell[2]);
        data[p++] = this._clampInt(cell[3]);
      }
    }
    this._pixelCtx.putImageData(img, 0, 0);

    if (this._showGrid) this._renderGrid();
    if (this._showTilePreview) this._renderTilePreview();
  }

  /* The frame repeated three by three, at the canvas scale, to check that its edges meet. */
  _renderTilePreview() {
    const tiled = tiledPreview(this._matrix, 3);
    const canvas = this._tilePreviewCanvas;
    canvas.width = tiled[0].length;
    canvas.height = tiled.length;
    canvas.style.width = `${Math.min(tiled[0].length * this._pixelSize, 480)}px`;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(canvas.width, canvas.height);
    tiled.flat().forEach((cell, index) => image.data.set(cell, index * 4));
    ctx.putImageData(image, 0, 0);
  }

  /* The travelling cell covering (x, y) during a move, or null. A fully transparent one still
   * counts: it is what the moved block carries there, not a hole to see the canvas through. */
  _floatingCellAt(x, y) {
    const sel = this._selection;
    if (!this._floating || !sel) return null;
    const fx = x - sel.x;
    const fy = y - sel.y;
    if (fy < 0 || fx < 0 || fy >= this._floating.length || fx >= this._floating[0].length) return null;
    return this._floating[fy][fx];
  }

  _drawCheckerboard() {
    const ctx = this._pixelCtx;
    const w = this._width;
    const h = this._height;
    const light = '#e9e9e9',
      dark = '#cfcfcf';
    // draw one logical pixel per matrix cell
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = ((x + y) & 1) === 0 ? light : dark;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  _renderGrid() {
    const ctx = this._gridCtx;
    if (!ctx) return;
    const w = this._gridCanvas.width;
    const h = this._gridCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const ps = this._pixelSize;
    if (this._showGrid) {
      ctx.save();
      ctx.strokeStyle = inkColor();
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= this._width; x++) {
        const xx = x * ps + 0.5;
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, h);
      }
      for (let y = 0; y <= this._height; y++) {
        const yy = y * ps + 0.5;
        ctx.moveTo(0, yy);
        ctx.lineTo(w, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    this._drawSelection();
  }

  /* Marching ants: a white rule under a moving dark dash, so the marquee reads against both a
   * light and a dark drawing, and never reads as painted content. */
  _drawSelection() {
    const ctx = this._gridCtx;
    const rect = this._selection;
    if (!ctx || !rect) return;
    const ps = this._pixelSize;
    const box = [rect.x * ps + 0.5, rect.y * ps + 0.5, rect.w * ps - 1, rect.h * ps - 1];
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(...box);
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -this._antsPhase;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeRect(...box);

    // A mask selection tints the cells it holds inside its rectangle.
    if (this._selectionMask) {
      ctx.fillStyle = 'rgba(80,160,255,0.35)';
      for (const key of this._selectionMask) {
        const [dx, dy] = key.split(',').map(Number);
        ctx.fillRect((rect.x + dx) * ps, (rect.y + dy) * ps, ps, ps);
      }
    }

    // Cell rules inside the rectangle: the selection reads as the grid of cells it is, whether
    // or not the canvas grid is on. Skipped once the cells are too small to tell apart.
    if (ps >= 6) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      for (let i = 1; i < rect.w; i++) {
        const xx = (rect.x + i) * ps + 0.5;
        ctx.moveTo(xx, rect.y * ps);
        ctx.lineTo(xx, (rect.y + rect.h) * ps);
      }
      for (let i = 1; i < rect.h; i++) {
        const yy = (rect.y + i) * ps + 0.5;
        ctx.moveTo(rect.x * ps, yy);
        ctx.lineTo((rect.x + rect.w) * ps, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _tickAnts() {
    if (!this._selection) {
      this._antsFrame = 0;
      return;
    }
    this._antsPhase = (this._antsPhase + 0.25) % 8;
    this._renderGrid();
    this._antsFrame = requestAnimationFrame(this._tickAnts);
  }

  _startAnts() {
    if (this._antsFrame || !this._selection) return;
    this._antsFrame = requestAnimationFrame(this._tickAnts);
  }

  // ---------------- Tools & painting ----------------
  /* Choosing a drawing tool leaves select mode, so the canvas draws again straight away. */
  setTool(name) {
    if (!this._toolButtons[name]) return;
    this._tool = name;
    if (this._selectMode) this.setSelectMode(false);
    this._updateToolButtons();
  }

  /* Select mode: the canvas selects and moves instead of drawing. Leaving it drops the
   * selection and hands the canvas back to the current drawing tool. */
  setSelectMode(on) {
    const next = !!on;
    if (next === this._selectMode) return;
    this._selectMode = next;
    if (!next) {
      this._dropFloating();
      this.clearSelection();
      this._closeContextMenu();
    }
    if (this._selBar) this._selBar.hidden = !next;
    this._updateToolButtons();
    this._updateSelectionUI();
    this._updateCursor();
    this.dispatchEvent(new CustomEvent('selectmodechange', { detail: { active: next } }));
  }

  toggleSelectMode() {
    this.setSelectMode(!this._selectMode);
  }

  /* Drops the current rectangle and waits for the next drag, without leaving select mode. */
  reselect() {
    this._dropFloating();
    this.clearSelection();
    this._updateCursor();
  }

  _updateToolButtons() {
    for (const [name, button] of Object.entries(this._toolButtons)) {
      if (!button) continue;
      button.toggleAttribute('data-active', !this._selectMode && this._tool === name);
    }
    if (this._selectModeBtn) this._selectModeBtn.toggleAttribute('data-active', this._selectMode);
  }

  /* Crosshair to draw or to start a rectangle, the move cursor once the pointer is over one. */
  _updateCursor(overSelection = false) {
    this._pixelCanvas.style.cursor = this._selectMode && overSelection ? 'move' : 'crosshair';
  }

  _inSelection(x, y) {
    const sel = this._selection;
    const inRect = !!sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
    return inRect && (!this._selectionMask || this._selectionMask.has(`${x - sel.x},${y - sel.y}`));
  }

  /** Sets the full RGBA brush color (alpha optional); the shade bar starts again from it. */
  setBrushColor(rgba) {
    if (!Array.isArray(rgba) || rgba.length < 3) return;
    this._applyBrushColor(rgba);
    this._shadeBase = this._brushColor.slice(0, 3);
    if (this._shadeRange) {
      this._shadeRange.value = '0';
      this._shadeRange.style.background = `linear-gradient(to right, #000, ${this._rgbaToHex(this._brushColor)}, #fff)`;
    }
  }

  _applyBrushColor(rgba) {
    const r = this._clampInt(rgba[0]);
    const g = this._clampInt(rgba[1]);
    const b = this._clampInt(rgba[2]);
    const a = typeof rgba[3] === 'number' ? this._clampInt(rgba[3]) : this._brushColor[3];
    this._brushColor = [r, g, b, a];
    if (this._colorInput) this._colorInput.value = this._rgbaToHex(this._brushColor);
    if (this._hexInput) this._hexInput.value = this._rgbaToHexWithAlpha(this._brushColor);
    if (this._rInput) this._rInput.value = String(this._brushColor[0]);
    if (this._gInput) this._gInput.value = String(this._brushColor[1]);
    if (this._bInput) this._bInput.value = String(this._brushColor[2]);
    if (this._aInput) this._aInput.value = String(this._brushColor[3]);
    if (this._opacityRange) this._opacityRange.value = String(this._brushColor[3]);
    if (this._opacityNumber) this._opacityNumber.value = String(this._brushColor[3]);
    this._emitBrushColorChange();
  }

  getBrushColor() {
    return this._brushColor.slice();
  }

  // set brush alpha (0-255)
  setBrushAlpha(a) {
    const v = Math.max(0, Math.min(255, Math.floor(Number(a) || 0)));
    this._brushColor[3] = v;
    if (this._opacityRange) this._opacityRange.value = String(v);
    if (this._opacityNumber) this._opacityNumber.value = String(v);
    if (this._aInput) this._aInput.value = String(v);
    // keep color input (hex) representing rgb only
    if (this._colorInput) this._colorInput.value = this._rgbaToHex(this._brushColor);
    if (this._hexInput) this._hexInput.value = this._rgbaToHexWithAlpha(this._brushColor);
    this._emitBrushColorChange();
  }
  getBrushAlpha() {
    return this._brushColor[3];
  }

  _emitBrushColorChange() {
    this.dispatchEvent(
      new CustomEvent('brushcolorchange', {
        detail: {
          rgba: this._brushColor.slice(),
          hex: this._rgbaToHex(this._brushColor),
          hexWithAlpha: this._rgbaToHexWithAlpha(this._brushColor),
        },
      }),
    );
  }

  setBrushSize(n) {
    this._brushSize = Math.max(1, Math.floor(n));
    if (this._brushSizeInput) this._brushSizeInput.value = this._brushSize;
  }

  /* The cells a brush of the current size covers around (x, y). */
  _brushCells(x, y) {
    const half = Math.floor(this._brushSize / 2);
    return rectRegion(x - half, y - half, x + half, y + half);
  }

  /* A region with its mirror images, clipped to the canvas. */
  _mirrored(cells) {
    const mirrored = this._symmetry
      ? mirrorRegion(cells, { width: this._width, height: this._height, axis: this._symmetry })
      : cells;
    return clip(mirrored, this._width, this._height);
  }

  _applyBrush(x, y, color, renderAfter = false) {
    for (const [tx, ty] of this._mirrored(this._brushCells(x, y))) this._matrix[ty][tx] = color.slice();
    if (renderAfter) this.render();
  }

  /** Sets the mirror strokes and shapes keep: '', 'x', 'y' or 'xy'. */
  setSymmetry(axis) {
    this._symmetry = SYMMETRIES.includes(axis) ? axis : '';
    if (this._symmetryBtn) {
      this._symmetryBtn.toggleAttribute('data-active', !!this._symmetry);
      const label = `Mirror painting: ${SYMMETRY_LABELS[this._symmetry]}`;
      this._symmetryBtn.title = label;
      this._symmetryBtn.setAttribute('aria-label', label);
    }
  }

  /** Sets what the stamp tool places: an rgba frame, or null for the clipboard. */
  setStamp(frame) {
    this._stamp = frame ? frame.map((row) => row.map((cell) => cell.slice())) : null;
  }

  /** The cells an operation acts on: the selection, its mask when it has one, else every cell. */
  getRegionCells() {
    const sel = this._selection;
    if (!sel) return rectRegion(0, 0, this._width - 1, this._height - 1);
    return rectRegion(sel.x, sel.y, sel.x + sel.w - 1, sel.y + sel.h - 1).filter(([x, y]) => this._inSelection(x, y));
  }

  /** The frame as rgba rows, copied. */
  getFrame() {
    return this._matrix.map((row) => row.map((cell) => cell.slice()));
  }

  /**
   * Runs one named command that rewrites the frame inside the region: `transform(frame, cells)`
   * returns the next frame (`PixelRegion.js` operations fit it).
   * @param {string} name
   * @param {(frame: number[][][], cells: Array<[number,number]>) => number[][][]} transform
   */
  transformRegion(name, transform) {
    this.command(name, () => {
      this._matrix = transform(this.getFrame(), this.getRegionCells());
      this.render();
    });
  }

  /** Paints the outline around the painted shape in the brush colour, inside the region. */
  outline() {
    const inside = new Set(this.getRegionCells().map(([x, y]) => `${x},${y}`));
    this.transformRegion('Outline', (frame) =>
      fillRegion(
        frame,
        outlineRegion(frame).filter(([x, y]) => inside.has(`${x},${y}`)),
        this._brushColor,
      ),
    );
  }

  fillBucket(x, y, targetColor = null) {
    if (!this._inBounds(x, y)) return;
    this._beginTransaction('FillRegion');
    const src = this.getPixel(x, y);
    const newColor = targetColor ? targetColor.slice() : this._brushColor.slice();
    if (this._colorsEqual(src, newColor)) {
      this._endTransaction();
      return;
    }
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!this._inBounds(cx, cy)) continue;
      const cur = this.getPixel(cx, cy);
      if (!this._colorsEqual(cur, src)) continue;
      this._matrix[cy][cx] = newColor.slice();
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    this.render();
    this.dispatchEvent(new CustomEvent('fill', { detail: { x, y } }));
    this._endTransaction();
  }

  _colorsEqual(a, b) {
    if (!a || !b) return false;
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  /** Locks an rgba color, the brush color by default, as the color a global replace finds. */
  lockSourceColor(rgba = this._brushColor) {
    this._replaceSource = rgba.map((n) => this._clampInt(n));
    this._updateReplaceUI();
  }

  /** Locks an rgba color, the brush color by default, as the color a global replace paints. */
  lockTargetColor(rgba = this._brushColor) {
    this._replaceTarget = rgba.map((n) => this._clampInt(n));
    this._updateReplaceUI();
  }

  /** Paints every canvas cell of the source color with the target color, as one command. Returns the cell count. */
  globalReplace() {
    const source = this._replaceSource;
    const target = this._replaceTarget;
    if (!source || !target || this._colorsEqual(source, target)) return 0;
    const cells = colorRegion(this._matrix, source);
    this.command('GlobalReplace', () => {
      this._matrix = fillRegion(this._matrix, cells, target);
      this.render();
    });
    this._updateReplaceUI(cells.length ? `${cells.length} cells replaced` : 'no cell has the source color');
    this.dispatchEvent(
      new CustomEvent('globalreplace', {
        detail: { source: source.slice(), target: target.slice(), count: cells.length },
      }),
    );
    return cells.length;
  }

  _updateReplaceUI(info = '') {
    const swatches = [
      [this._sourceSwatch, this._replaceSource, 'source'],
      [this._targetSwatch, this._replaceTarget, 'target'],
    ];
    for (const [swatch, rgba, role] of swatches) {
      if (!swatch) continue;
      swatch.style.background = rgba ? `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})` : 'transparent';
      swatch.parentElement.title = rgba ? `${role}: ${this._rgbaToHexWithAlpha(rgba)}` : `${role}: not locked`;
    }
    if (this._globalReplaceBtn)
      this._globalReplaceBtn.disabled =
        !this._replaceSource || !this._replaceTarget || this._colorsEqual(this._replaceSource, this._replaceTarget);
    if (this._replaceInfo) this._replaceInfo.textContent = info;
  }

  // ---------------- Pointer handling ----------------
  _toGridCoords(evt) {
    const rect = this._pixelCanvas.getBoundingClientRect();
    const cssX = evt.clientX - rect.left;
    const cssY = evt.clientY - rect.top;
    const scaleX = this._pixelCanvas.width / rect.width;
    const scaleY = this._pixelCanvas.height / rect.height;
    const x = Math.floor(cssX * scaleX);
    const y = Math.floor(cssY * scaleY);
    return [x, y];
  }

  _onPointerDown(evt) {
    if (evt.button === 2) return; // the context menu owns the right button
    this._closeContextMenu();
    evt.preventDefault();
    this._isPointerDown = true;
    try {
      this._pixelCanvas.setPointerCapture(evt.pointerId);
    } catch (e) {}
    const [x, y] = this._toGridCoords(evt);

    // The wand selects the colour under the pointer, then hands over to select mode.
    if (this._tool === 'wand' && !this._selectMode) {
      this._isPointerDown = false;
      if (!this._inBounds(x, y)) return;
      const cells = colorRegion(this._matrix, this._matrix[y][x], { contiguous: evt.shiftKey ? null : [x, y] });
      this.setSelectMode(true);
      this.setSelectionMask(cells);
      return;
    }

    // Select mode: a press inside the rectangle moves it, anywhere else starts a new one.
    // Neither opens an undo transaction here — the marquee changes no cell, and a move opens
    // one when it commits.
    if (this._selectMode) {
      if (this._inSelection(x, y)) this._beginMove(x, y);
      else {
        this._dropFloating();
        this._selAnchor = [x, y];
        this.setSelection(x, y, x, y);
      }
      return;
    }
    // One command for the whole stroke, named by the tool that draws it.
    this._beginTransaction(STROKE_COMMANDS[this._tool] ?? 'DrawStroke');
    if (SHAPE_TOOLS.includes(this._tool)) this._shapeDrag = { x, y, base: this.getFrame() };
    this._applyToolAt(x, y, evt);
  }

  _onPointerMove(evt) {
    const [x, y] = this._toGridCoords(evt);
    this._updateCursorInfo(x, y);
    if (!this._isPointerDown) {
      // Hover feedback: the cursor says whether the next press moves or selects.
      if (this._selectMode) this._updateCursor(this._inSelection(x, y));
      return;
    }
    if (this._selectMode) {
      if (this._moveGrab) this._dragMove(x, y);
      else if (this._selAnchor) this.setSelection(this._selAnchor[0], this._selAnchor[1], x, y);
      return;
    }
    this._applyToolAt(x, y, evt, true);
  }

  _onPointerUp(evt) {
    const wasSelecting = this._isPointerDown && this._selectMode;
    this._isPointerDown = false;
    try {
      this._pixelCanvas.releasePointerCapture(evt.pointerId);
    } catch (e) {}
    if (wasSelecting) {
      // A finished rectangle hands straight over to moving: the next drag inside it moves the
      // cells, with no tool to switch to first.
      this._selAnchor = null;
      if (this._moveGrab) this._endMove();
      this._updateSelectionUI();
      this._updateCursor(true);
      return;
    }
    // finish transaction for the stroke
    this._shapeDrag = null;
    this._patternOrigin = null;
    this._endTransaction();
  }

  // ---------------- Moving a selection ----------------
  /* Lifts the selected cells out of the matrix so what they covered shows through while they
   * travel. They ride in _floating until the drop writes them back. */
  _beginMove(x, y) {
    if (!this._selection) return;
    if (!this._floating) {
      this._floating = this._readRegion(this._selection);
      for (const [cx, cy] of this.getRegionCells()) this._matrix[cy][cx] = [0, 0, 0, 0];
    }
    this._moveGrab = { dx: x - this._selection.x, dy: y - this._selection.y };
    this._updateCursor(true);
    this.render();
  }

  _dragMove(x, y) {
    if (!this._moveGrab || !this._selection) return;
    this._selection = { ...this._selection, x: x - this._moveGrab.dx, y: y - this._moveGrab.dy };
    this._updateSelectionUI();
    this.render();
    this._renderGrid();
  }

  _endMove() {
    this._moveGrab = null;
    if (!this._floating) return;
    // Committing is one undo step: the lift and every drag frame collapse into the drop.
    this._beginTransaction('MoveSelection');
    this._writeRegion(this._floating, this._selection.x, this._selection.y);
    this._floating = null;
    this.render();
    this._endTransaction();
    this._clampSelection();
    this.dispatchEvent(new CustomEvent('move', { detail: this.getSelection() }));
  }

  /* Puts travelling cells back where they currently sit, for anything that ends a move without
   * a pointer release — leaving select mode, reselecting, a new rectangle. */
  _dropFloating() {
    if (this._floating) this._endMove();
    this._moveGrab = null;
  }

  _applyToolAt(x, y, evt, continuous = false) {
    if (this._shapeDrag) {
      const { x: x0, y: y0, base } = this._shapeDrag;
      const filled = evt.shiftKey;
      const cells =
        this._tool === 'line'
          ? lineRegion(x0, y0, x, y)
          : this._tool === 'rect'
            ? filled
              ? rectRegion(x0, y0, x, y)
              : rectOutlineRegion(x0, y0, x, y)
            : ellipseRegion(x0, y0, x, y, { filled });
      this._matrix = fillRegion(base, this._mirrored(cells), this._brushColor);
      this.render();
      return;
    }
    if (!this._inBounds(x, y)) return;
    switch (this._tool) {
      case 'pattern':
        if (this._clipboard) {
          const tile = this._clipboard.map((row) => row.map((cell) => cell ?? [0, 0, 0, 0]));
          this._patternOrigin ??= { originX: x, originY: y };
          this._matrix = patternRegion(this._matrix, this._mirrored(this._brushCells(x, y)), tile, this._patternOrigin);
          this.render();
        }
        break;
      case 'stamp': {
        const stamp = this._stamp ?? this._clipboard?.map((row) => row.map((cell) => cell ?? [0, 0, 0, 0]));
        if (!continuous && stamp) {
          this._matrix = stampRegion(
            this._matrix,
            stamp,
            x - Math.floor(stamp[0].length / 2),
            y - Math.floor(stamp.length / 2),
          );
          this.render();
        }
        break;
      }
      case 'pencil':
        this._applyBrush(x, y, this._brushColor, true);
        break;
      case 'eraser':
        this._applyBrush(x, y, [0, 0, 0, 0], true);
        break;
      case 'fill':
        if (!continuous) this.fillBucket(x, y);
        break;
      case 'eyedropper':
        const picked = this.getPixel(x, y);
        if (picked) this.setBrushColor(picked);
        break;
    }
  }

  // ---------------- Selection ----------------
  /* Cells the marquee covers, clamped to the canvas, or null. */
  getSelection() {
    return this._selection ? { ...this._selection } : null;
  }

  /* Takes two corners in cell coordinates and keeps whatever part lands on the canvas. */
  setSelection(ax, ay, bx, by) {
    const x0 = Math.max(0, Math.min(this._width - 1, Math.min(ax, bx)));
    const y0 = Math.max(0, Math.min(this._height - 1, Math.min(ay, by)));
    const x1 = Math.max(0, Math.min(this._width - 1, Math.max(ax, bx)));
    const y1 = Math.max(0, Math.min(this._height - 1, Math.max(ay, by)));
    this._selection = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    this._selectionMask = null;
    this._updateSelectionUI();
    this._startAnts();
    this._renderGrid();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelection() }));
    return this.getSelection();
  }

  selectAll() {
    return this.setSelection(0, 0, this._width - 1, this._height - 1);
  }

  /** Selects exactly the given cells, within the rectangle that holds them. */
  setSelectionMask(cells) {
    const inside = clip(cells, this._width, this._height);
    if (inside.length === 0) return this.clearSelection();
    const xs = inside.map(([x]) => x);
    const ys = inside.map(([, y]) => y);
    const [left, top] = [Math.min(...xs), Math.min(...ys)];
    this.setSelection(left, top, Math.max(...xs), Math.max(...ys));
    this._selectionMask = new Set(inside.map(([x, y]) => `${x - left},${y - top}`));
    this._updateSelectionUI();
    this._renderGrid();
    return this.getSelection();
  }

  clearSelection() {
    if (!this._selection) return;
    this._selection = null;
    this._selectionMask = null;
    this._updateSelectionUI();
    this._renderGrid();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: null }));
  }

  /* Keeps the marquee on the canvas after the canvas itself changed shape. */
  _clampSelection() {
    if (!this._selection) return;
    const { x, y, w, h } = this._selection;
    if (x >= this._width || y >= this._height) return this.clearSelection();
    if (this._selectionMask)
      this._selectionMask = new Set(
        [...this._selectionMask].filter((key) => {
          const [dx, dy] = key.split(',').map(Number);
          return x + dx < this._width && y + dy < this._height;
        }),
      );
    this._selection = {
      x,
      y,
      w: Math.min(w, this._width - x),
      h: Math.min(h, this._height - y),
    };
    this._updateSelectionUI();
  }

  _updateSelectionUI() {
    const sel = this._selection;
    if (this._selInfo)
      this._selInfo.textContent = sel
        ? `${sel.x},${sel.y}  ${sel.w}×${sel.h}${this._selectionMask ? `  ${this._selectionMask.size} cells` : ''}`
        : 'no selection';
    if (this._fillSelectionBtn) this._fillSelectionBtn.disabled = !sel;
    // The hint tracks the one thing the canvas will do next, so the handover to moving is stated
    // rather than left to be discovered.
    if (this._selHint)
      this._selHint.textContent = sel ? 'Drag inside to move · right-click for actions' : 'Drag to select';
    if (this._copyBtn) this._copyBtn.disabled = !sel;
    if (this._cutBtn) this._cutBtn.disabled = !sel;
    if (this._deleteBtn) this._deleteBtn.disabled = !sel;
    if (this._reselectBtn) this._reselectBtn.disabled = !sel;
    if (this._pasteBtn) this._pasteBtn.disabled = !this._clipboard;
    // The rescale inputs always show what Apply would act on: the selection, else the whole image.
    if (this._scaleWidthInput) this._scaleWidthInput.value = String(sel ? sel.w : this._width);
    if (this._scaleHeightInput) this._scaleHeightInput.value = String(sel ? sel.h : this._height);
  }

  // ---------------- Context menu ----------------
  /* Right-click over the canvas, in select mode, opens the clipboard actions where the pointer
   * is. Outside select mode the browser menu is left alone. */
  _onContextMenu(evt) {
    if (!this._selectMode) return;
    evt.preventDefault();
    const rect = this._pixelCanvas.getBoundingClientRect();
    const [x, y] = this._toGridCoords(evt);
    // A right-click outside the rectangle moves it there first, so the menu always acts on
    // what was just pointed at.
    if (!this._inSelection(x, y) && !this._floating) this.setSelection(x, y, x, y);
    this._openContextMenu(evt.clientX - rect.left, evt.clientY - rect.top);
  }

  _openContextMenu(left, top) {
    if (!this._ctxMenu) return;
    const sel = !!this._selection;
    const items = [
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', enabled: sel, run: () => this.copySelection() },
      { label: 'Cut', icon: 'cut', key: 'Ctrl+X', enabled: sel, run: () => this.cutSelection() },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', enabled: !!this._clipboard, run: () => this.paste() },
      { label: 'Delete', icon: 'trash', key: 'Del', enabled: sel, run: () => this.deleteSelection() },
      { label: 'Select all', icon: 'selectAll', key: 'Ctrl+A', enabled: true, run: () => this.selectAll() },
      { label: 'Reselect', icon: 'marquee', key: 'Esc', enabled: sel, run: () => this.reselect() },
    ];
    this._ctxMenu.innerHTML = items
      .map(
        (item, index) => html`
          <button class="ctx-item" type="button" data-index="${index}" ${item.enabled ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[item.icon]}</svg>
            <span>${item.label}</span><span class="ctx-key">${item.key}</span>
          </button>
        `,
      )
      .join('');
    this._ctxMenu.onclick = (event) => {
      const button = event.target.closest('button[data-index]');
      if (!button || button.disabled) return;
      this._closeContextMenu();
      items[Number(button.dataset.index)].run();
    };
    this._ctxMenu.hidden = false;
    // Placed after unhiding, so the measured size is the real one and the menu stays on canvas.
    const frame = this._ctxMenu.parentElement.getBoundingClientRect();
    const box = this._ctxMenu.getBoundingClientRect();
    this._ctxMenu.style.left = `${Math.max(0, Math.min(left, frame.width - box.width))}px`;
    this._ctxMenu.style.top = `${Math.max(0, Math.min(top, frame.height - box.height))}px`;
  }

  _closeContextMenu() {
    if (this._ctxMenu && !this._ctxMenu.hidden) this._ctxMenu.hidden = true;
  }

  /* Any press that is not on the menu dismisses it, including one in the page outside. */
  _onDocumentPointerDown(evt) {
    if (!this._ctxMenu || this._ctxMenu.hidden) return;
    if (evt.composedPath().includes(this._ctxMenu)) return;
    this._closeContextMenu();
  }

  // ---------------- Clipboard ----------------
  /* The cells of a rectangle; with a mask selection, cells outside the mask read as null. */
  _readRegion({ x, y, w, h }) {
    const out = this._createEmptyMatrix(w, h);
    for (let ry = 0; ry < h; ry++)
      for (let rx = 0; rx < w; rx++) {
        const cell = this._matrix[y + ry] && this._matrix[y + ry][x + rx];
        const masked = this._selectionMask && !this._selectionMask.has(`${rx},${ry}`);
        out[ry][rx] = masked ? null : cell ? cell.slice() : [0, 0, 0, 0];
      }
    return out;
  }

  /* Writes a matrix with its top-left at (x, y), dropping null cells and whatever falls off. */
  _writeRegion(src, x, y) {
    for (let ry = 0; ry < src.length; ry++)
      for (let rx = 0; rx < src[ry].length; rx++) {
        const tx = x + rx;
        const ty = y + ry;
        if (src[ry][rx] && this._inBounds(tx, ty)) this._matrix[ty][tx] = src[ry][rx].slice();
      }
  }

  copySelection() {
    if (!this._selection) return null;
    this._clipboard = this._readRegion(this._selection);
    this._updateSelectionUI();
    this.dispatchEvent(new CustomEvent('copy', { detail: { width: this._selection.w, height: this._selection.h } }));
    return this._clipboard.map((r) => r.map((c) => c?.slice() ?? null));
  }

  cutSelection() {
    const copied = this.copySelection();
    if (copied) this.deleteSelection();
    return copied;
  }

  /* Clears the selected cells to fully transparent. */
  deleteSelection() {
    if (!this._selection) return;
    this._beginTransaction('DeleteSelection');
    const { w, h } = this._selection;
    for (const [cx, cy] of this.getRegionCells()) this._matrix[cy][cx] = [0, 0, 0, 0];
    this.render();
    this._endTransaction();
    this.dispatchEvent(new CustomEvent('delete', { detail: { width: w, height: h } }));
  }

  /* Pastes at the selection corner, or at `at`, and selects what landed — so the next rescale
   * or move acts on the pasted cells without hunting for them. */
  paste(at = null) {
    if (!this._clipboard) return null;
    // Pasted cells arrive selected, so select mode comes on with them and they can be moved.
    this.setSelectMode(true);
    const x = at ? Math.floor(at.x) : this._selection ? this._selection.x : 0;
    const y = at ? Math.floor(at.y) : this._selection ? this._selection.y : 0;
    this._beginTransaction('Paste');
    this._writeRegion(this._clipboard, x, y);
    this.render();
    this._endTransaction();
    const w = this._clipboard[0].length;
    const h = this._clipboard.length;
    this.setSelection(x, y, x + w - 1, y + h - 1);
    this.dispatchEvent(new CustomEvent('paste', { detail: { x, y, width: w, height: h } }));
    return this.getSelection();
  }

  // ---------------- Resampling ----------------
  /* A destination cell keeps content when at least this much of what it covers is opaque. A
   * quarter is one source cell under a 2x reduction, so a one-cell detail survives being halved
   * instead of being averaged away. */
  static RESAMPLE_COVERAGE_FLOOR = 0.25;

  /**
   * Resamples a matrix to a new cell size, keeping as much of the original as the new size allows.
   *
   * Every output cell is a colour the source actually used — never a blend. Growing is
   * nearest-neighbour, exact at integer factors. Shrinking gives each destination cell the
   * heaviest colour among the source cells it covers, weighted by alpha so transparent cells
   * never outvote drawn ones, and clears the cell only when its coverage falls under
   * {@link RESAMPLE_COVERAGE_FLOOR}. Edges stay hard and the palette the atlas pipeline indexes
   * stays exactly as authored.
   *
   * @param {Array<Array<number[]>>} src - Source matrix of [r,g,b,a] cells.
   * @param {number} newW - Target width in cells.
   * @param {number} newH - Target height in cells.
   * @returns {Array<Array<number[]>>} The resampled matrix.
   */
  resampleMatrix(src, newW, newH) {
    const h = src.length;
    const w = src[0].length;
    const outW = Math.max(1, Math.floor(newW));
    const outH = Math.max(1, Math.floor(newH));
    const out = this._createEmptyMatrix(outW, outH);

    if (outW >= w && outH >= h) {
      for (let y = 0; y < outH; y++)
        for (let x = 0; x < outW; x++)
          out[y][x] =
            src[Math.min(h - 1, Math.floor((y * h) / outH))][Math.min(w - 1, Math.floor((x * w) / outW))].slice();
      return out;
    }

    const floor = ObjectLayerEngineElement.RESAMPLE_COVERAGE_FLOOR;
    for (let y = 0; y < outH; y++) {
      const sy0 = Math.floor((y * h) / outH);
      const sy1 = Math.min(h, Math.max(sy0 + 1, Math.ceil(((y + 1) * h) / outH)));
      for (let x = 0; x < outW; x++) {
        const sx0 = Math.floor((x * w) / outW);
        const sx1 = Math.min(w, Math.max(sx0 + 1, Math.ceil(((x + 1) * w) / outW)));
        // Insertion order breaks ties, so an equal split resolves the same way every run.
        const weights = new Map();
        let alphaSum = 0;
        let cells = 0;
        let best = null;
        let bestWeight = 0;
        for (let sy = sy0; sy < sy1; sy++)
          for (let sx = sx0; sx < sx1; sx++) {
            const c = src[sy][sx];
            alphaSum += c[3];
            cells++;
            if (c[3] === 0) continue;
            const key = (c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3];
            const weight = (weights.get(key) || 0) + c[3];
            weights.set(key, weight);
            if (weight > bestWeight) {
              bestWeight = weight;
              best = c;
            }
          }
        const coverage = cells > 0 ? alphaSum / (cells * 255) : 0;
        out[y][x] = best && coverage >= floor ? best.slice() : [0, 0, 0, 0];
      }
    }
    return out;
  }

  /**
   * Resamples the selection in place, or the whole image when nothing is selected.
   *
   * A resized selection keeps its top-left corner: the old cells clear and the new ones land
   * there, clipped to the canvas, and the marquee follows what actually fits.
   *
   * @param {number} newW - Target width in cells.
   * @param {number} newH - Target height in cells.
   */
  rescale(newW, newH) {
    const w = Math.max(1, Math.floor(newW));
    const h = Math.max(1, Math.floor(newH));
    if (!this._selection) {
      if (w === this._width && h === this._height) return;
      this._beginTransaction('Resize');
      this._matrix = this.resampleMatrix(this._matrix, w, h);
      this._setDimensions(w, h);
      this._setupContextsAndSize();
      this.render();
      this._endTransaction();
      this._updateSelectionUI();
      this.dispatchEvent(new CustomEvent('rescale', { detail: { scope: 'image', width: w, height: h } }));
      return;
    }

    const sel = this._selection;
    if (w === sel.w && h === sel.h) return;
    this._beginTransaction('Resize');
    const region = this._readRegion(sel).map((row) => row.map((cell) => cell ?? [0, 0, 0, 0]));
    const resampled = this.resampleMatrix(region, w, h);
    for (const [cx, cy] of this.getRegionCells()) this._matrix[cy][cx] = [0, 0, 0, 0];
    this._selectionMask = null;
    this._writeRegion(resampled, sel.x, sel.y);
    this.render();
    this._endTransaction();
    this.setSelection(
      sel.x,
      sel.y,
      sel.x + Math.min(w, this._width - sel.x) - 1,
      sel.y + Math.min(h, this._height - sel.y) - 1,
    );
    this.dispatchEvent(new CustomEvent('rescale', { detail: { scope: 'selection', width: w, height: h } }));
  }

  // ---------------- Import / Export ----------------
  exportMatrixJSON() {
    return ObjectLayerEngineElement.matrixJSON(this._matrix);
  }
  importMatrixJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.matrix)) throw new TypeError('Invalid matrix JSON');
    // wrap import as transactional change
    this.loadMatrix(data.matrix);
  }

  async _pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', () => {
        resolve(input.files && input.files[0] ? input.files[0] : null);
      });
      input.click();
    });
  }

  // Create a PNG data URL at the requested scale (scale = number of CSS pixels per logical pixel)
  toDataURL(scale = this._pixelSize) {
    const w = this._width,
      h = this._height;
    const outW = Math.max(1, Math.floor(w * scale));
    const outH = Math.max(1, Math.floor(h * scale));

    // create logical image at native resolution
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(w, h);
    const data = img.data;
    let p = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = this._matrix[y][x] || [0, 0, 0, 0];
        data[p++] = this._clampInt(c[0]);
        data[p++] = this._clampInt(c[1]);
        data[p++] = this._clampInt(c[2]);
        data[p++] = this._clampInt(c[3]);
      }
    sctx.putImageData(img, 0, 0);

    // scale into output canvas (nearest-neighbor)
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    try {
      octx.imageSmoothingEnabled = false;
    } catch (e) {}
    octx.drawImage(src, 0, 0, outW, outH);
    return out.toDataURL('image/png');
  }

  // Async blob version (recommended for large images)
  toBlob(scale = this._pixelSize) {
    return ObjectLayerEngineElement.matrixToBlob(this._matrix, scale);
  }

  /* A PNG of any matrix at `scale` px per cell, with no editor involved: a frame can be
   * pictured from stored data without passing through — or racing — the canvas. */
  static matrixToBlob(matrix, scale) {
    return new Promise((resolve) => {
      const h = matrix.length;
      const w = matrix[0].length;
      const outW = Math.max(1, Math.floor(w * scale));
      const outH = Math.max(1, Math.floor(h * scale));
      const src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const sctx = src.getContext('2d');
      const img = sctx.createImageData(w, h);
      const data = img.data;
      let p = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = matrix[y][x] || [0, 0, 0, 0];
          data[p++] = Math.min(255, Math.max(0, Math.floor(c[0]) || 0));
          data[p++] = Math.min(255, Math.max(0, Math.floor(c[1]) || 0));
          data[p++] = Math.min(255, Math.max(0, Math.floor(c[2]) || 0));
          data[p++] = Math.min(255, Math.max(0, Math.floor(c[3]) || 0));
        }
      sctx.putImageData(img, 0, 0);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const octx = out.getContext('2d');
      try {
        octx.imageSmoothingEnabled = false;
      } catch (e) {}
      octx.drawImage(src, 0, 0, outW, outH);
      out.toBlob((b) => resolve(b), 'image/png');
    });
  }

  /* The frame JSON the editor exports and imports, for any matrix. */
  static matrixJSON(matrix) {
    return JSON.stringify({ width: matrix[0].length, height: matrix.length, matrix });
  }

  // Trigger download of PNG (uses blob to avoid huge data URLs on big exports)
  async exportPNG(filename = 'object-layer.png', scale = this._pixelSize) {
    const blob = await this.toBlob(scale);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // revoke after a tick to ensure download started
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------------- Undo/Redo helpers ----------------
  _snapshot() {
    return {
      width: this._width,
      height: this._height,
      matrix: this._matrix.map((r) => r.map((c) => c.slice())),
    };
  }

  _loadSnapshot(snap) {
    if (!snap) return;
    this._matrix = snap.matrix.map((r) => r.map((c) => c.slice()));
    this._setDimensions(snap.width, snap.height);
    this._clampSelection();
    this._updateSelectionUI();
    this._setupContextsAndSize();
    this.render();
    this.dispatchEvent(new CustomEvent('matrixload', { detail: { width: this._width, height: this._height } }));
  }

  _matricesEqual(a, b) {
    if (!a || !b) return false;
    if (a.width !== b.width || a.height !== b.height) return false;
    const h = a.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < a.width; x++) {
        const ac = a.matrix[y][x];
        const bc = b.matrix[y][x];
        for (let i = 0; i < 4; i++) if (ac[i] !== bc[i]) return false;
      }
    }
    return true;
  }

  _clearHistory() {
    this._history.clear();
  }

  /* Opens a command with the frame before it. An open command absorbs nested ones. */
  _beginTransaction(name = 'Edit') {
    if (this._transaction) return;
    this._transaction = { name, before: this._snapshot() };
  }

  /* Closes the open command, and records it when it changed the frame. */
  _endTransaction() {
    const transaction = this._transaction;
    if (!transaction) return;
    this._transaction = null;
    const after = this._snapshot();
    if (this._matricesEqual(transaction.before, after)) return;
    this._history.record(transaction.name, transaction.before, after);
    this.dispatchEvent(new CustomEvent('command', { detail: { name: transaction.name } }));
  }

  /**
   * Runs one named command: every change `mutate` makes to the frame is one undo step.
   * @param {string} name - What the command does, such as `PaletteSwap`.
   * @param {() => void} mutate
   */
  command(name, mutate) {
    this._beginTransaction(name);
    try {
      mutate();
    } finally {
      this._endTransaction();
    }
  }

  undo() {
    const command = this._history.undo();
    if (!command) return;
    this._loadSnapshot(command.before);
    this.dispatchEvent(new CustomEvent('undo', { detail: { name: command.name } }));
  }

  redo() {
    const command = this._history.redo();
    if (!command) return;
    this._loadSnapshot(command.after);
    this.dispatchEvent(new CustomEvent('redo', { detail: { name: command.name } }));
  }

  _updateToolbarButtons() {
    if (this._undoBtn) this._undoBtn.disabled = !this._history.canUndo;
    if (this._redoBtn) this._redoBtn.disabled = !this._history.canRedo;
  }

  /* True while a field has focus, where these keys belong to the field rather than the canvas. */
  _typingInField() {
    const active = this.shadowRoot.activeElement || document.activeElement;
    return !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  }

  _onKeyDown(e) {
    if (this._typingInField()) return;
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) {
      if (e.key === 'Escape') {
        if (!this._ctxMenu || this._ctxMenu.hidden) {
          if (!this._selection) return;
          e.preventDefault();
          this.reselect();
          return;
        }
        e.preventDefault();
        this._closeContextMenu();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this._selection) {
        e.preventDefault();
        this.deleteSelection();
      }
      return;
    }
    // ctrl/cmd+z -> undo, ctrl/cmd+shift+z or ctrl+ y -> redo
    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        e.preventDefault();
        this.redo();
      } else {
        e.preventDefault();
        this.undo();
      }
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.setSelectMode(true);
      this.selectAll();
    } else if (e.key === 'c' || e.key === 'C') {
      if (!this._selection) return;
      e.preventDefault();
      this.copySelection();
    } else if (e.key === 'x' || e.key === 'X') {
      if (!this._selection) return;
      e.preventDefault();
      this.cutSelection();
    } else if (e.key === 'v' || e.key === 'V') {
      if (!this._clipboard) return;
      e.preventDefault();
      this.paste();
    }
  }

  // ---------------- Helpers ----------------
  _hexToRgba(hex) {
    const h = (hex || '').replace('#', '');
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
    }
    if (h.length === 6) {
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16), 255];
    }
    return [0, 0, 0, 255];
  }
  _rgbaToHex(rgba) {
    const [r, g, b] = rgba;
    return `#${((1 << 24) + (this._clampInt(r) << 16) + (this._clampInt(g) << 8) + this._clampInt(b))
      .toString(16)
      .slice(1)}`;
  }

  // convert RGBA to hex with alpha channel
  _rgbaToHexWithAlpha(rgba) {
    const [r, g, b, a] = rgba;
    const rHex = this._clampInt(r).toString(16).padStart(2, '0');
    const gHex = this._clampInt(g).toString(16).padStart(2, '0');
    const bHex = this._clampInt(b).toString(16).padStart(2, '0');
    const aHex = this._clampInt(a).toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}${aHex}`.toUpperCase();
  }

  // convert hex to RGBA with optional alpha channel support
  _hexToRgbaWithAlpha(hex) {
    const h = (hex || '').replace('#', '');
    if (h.length === 3) {
      // #RGB -> expand to RRGGBB
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
    }
    if (h.length === 4) {
      // #RGBA -> expand to RRGGBBAA
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
        parseInt(h[3] + h[3], 16),
      ];
    }
    if (h.length === 6) {
      // #RRGGBB
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16), 255];
    }
    if (h.length === 8) {
      // #RRGGBBAA
      return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
        parseInt(h.substring(6, 8), 16),
      ];
    }
    return [0, 0, 0, 255];
  }

  // ---------------- Transform helpers (flip/rotate) ----------------
  flipHorizontal() {
    // reverse each row (mirror horizontally)
    for (let y = 0; y < this._height; y++) {
      this._matrix[y].reverse();
    }
    this.render();
    this.dispatchEvent(new CustomEvent('transform', { detail: { type: 'flip-horizontal' } }));
  }

  flipVertical() {
    // reverse the order of rows (mirror vertically)
    this._matrix.reverse();
    this.render();
    this.dispatchEvent(new CustomEvent('transform', { detail: { type: 'flip-vertical' } }));
  }

  rotateCW() {
    // rotate +90 degrees (clockwise)
    const oldH = this._height;
    const oldW = this._width;
    const newW = oldH;
    const newH = oldW;
    const newMat = this._createEmptyMatrix(newW, newH);
    for (let y = 0; y < oldH; y++) {
      for (let x = 0; x < oldW; x++) {
        const px = this._matrix[y][x] ? this._matrix[y][x].slice() : [0, 0, 0, 0];
        const newX = oldH - 1 - y; // column in new matrix
        const newY = x; // row in new matrix
        newMat[newY][newX] = px;
      }
    }
    this._matrix = newMat;
    this._setDimensions(newW, newH);

    this.clearSelection();
    this._updateSelectionUI();
    this._setupContextsAndSize();
    this.render();
    this.dispatchEvent(
      new CustomEvent('transform', { detail: { type: 'rotate-cw', width: this._width, height: this._height } }),
    );
  }

  rotateCCW() {
    // rotate -90 degrees (counter-clockwise)
    const oldH = this._height;
    const oldW = this._width;
    const newW = oldH;
    const newH = oldW;
    const newMat = this._createEmptyMatrix(newW, newH);
    for (let y = 0; y < oldH; y++) {
      for (let x = 0; x < oldW; x++) {
        const px = this._matrix[y][x] ? this._matrix[y][x].slice() : [0, 0, 0, 0];
        const newX = y; // column in new matrix
        const newY = oldW - 1 - x; // row in new matrix
        newMat[newY][newX] = px;
      }
    }
    this._matrix = newMat;
    this._setDimensions(newW, newH);

    this.clearSelection();
    this._updateSelectionUI();
    this._setupContextsAndSize();
    this.render();
    this.dispatchEvent(
      new CustomEvent('transform', { detail: { type: 'rotate-ccw', width: this._width, height: this._height } }),
    );
  }

  // ---------------- Properties ----------------
  get width() {
    return this._width;
  }
  set width(v) {
    this._resizeAxis(v, this._attributeSize('height', this._height));
  }
  get height() {
    return this._height;
  }
  set height(v) {
    this._resizeAxis(this._attributeSize('width', this._width), v);
  }

  /* An axis as its attribute states it. While the element upgrades, the attributes are all
   * present before any setter has run, so the axis not being set is read from here rather than
   * from a default the resize would otherwise write over the attribute. */
  _attributeSize(name, fallback) {
    return parseInt(this.getAttribute(name), 10) || fallback;
  }

  _resizeAxis(w, h) {
    const nw = Math.max(1, Math.floor(w));
    const nh = Math.max(1, Math.floor(h));
    if (nw !== this._width || nh !== this._height) this.resize(nw, nh);
  }
  get pixelSize() {
    return this._pixelSize;
  }
  set pixelSize(v) {
    this._pixelSize = Math.max(1, Math.floor(v));
    this.setAttribute('pixel-size', String(this._pixelSize));
    this._setupContextsAndSize();
    this.render();
  }
  get brushSize() {
    return this._brushSize;
  }
  set brushSize(v) {
    this.setBrushSize(v);
  }
  get matrix() {
    return this._matrix.map((row) => row.map((c) => c.slice()));
  }

  exportJSON() {
    return this.exportMatrixJSON();
  }
  importJSON(json) {
    return this.importMatrixJSON(json);
  }
}

customElements.define('object-layer-engine', ObjectLayerEngineElement);

export { ObjectLayerEngineElement };

/*
Example usage:
<object-layer-engine id="ole" width="20" height="12" pixel-size="20"></object-layer-engine>
*/

class ObjectLayerPngLoader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = html`
      <style>
        :host {
          display: block;
          font-family:
            system-ui,
            -apple-system,
            'Segoe UI',
            Roboto,
            Arial;
        }
        .wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .controls {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .drop-area {
          border: 2px dashed #999;
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          color: #555;
          user-select: none;
        }
        .drop-area.dragover {
          border-color: #4a90e2;
          color: #1a73e8;
          background: rgba(74, 144, 226, 0.04);
        }
        input[type='file'] {
          display: inline-block;
        }
        .hint {
          font-size: 0.9rem;
          color: #666;
        }
      </style>

      <div class="wrap">
        <div class="controls">
          <label title="Load PNG file">
            <input type="file" accept="image/png" part="file-input" />
            <span class="btn">Choose PNG</span>
          </label>
          <div class="hint">Only PNG images accepted. Drop PNG onto the box below.</div>
        </div>

        <div class="drop-area" part="drop-area">Drop PNG here or click "Choose PNG"</div>
      </div>
    `;

    this._fileInput = this.shadowRoot.querySelector('input[type="file"]');
    this._dropArea = this.shadowRoot.querySelector('.drop-area');

    this._editor = null; // will hold external editor instance
    this._options = { fitMode: 'contain' };

    // Bind handlers
    this._onFileChange = this._onFileChange.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onDragOver = this._onDragOver.bind(this);
    this._onDragLeave = this._onDragLeave.bind(this);
  }

  static get observedAttributes() {
    return ['editor-selector', 'fit-mode', 'target-cells-x', 'target-cells-y'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'editor-selector' && newVal) {
      const el = document.querySelector(newVal);
      if (el) this.setEditor(el);
    }
    if (name === 'fit-mode') {
      this._options.fitMode = newVal || 'contain';
    }
  }

  connectedCallback() {
    this._fileInput.addEventListener('change', this._onFileChange);
    this._dropArea.addEventListener('dragover', this._onDragOver);
    this._dropArea.addEventListener('dragleave', this._onDragLeave);
    this._dropArea.addEventListener('drop', this._onDrop);
    this.addEventListener('dragover', this._onDragOver);
    this.addEventListener('dragleave', this._onDragLeave);
    this.addEventListener('drop', this._onDrop);

    // If editor-selector attribute was present at creation, try to resolve
    const sel = this.getAttribute('editor-selector');
    if (sel) {
      const target = document.querySelector(sel);
      if (target) this.setEditor(target);
    }

    // read fit-mode
    const fit = this.getAttribute('fit-mode');
    if (fit) this._options.fitMode = fit;
  }

  disconnectedCallback() {
    this._fileInput.removeEventListener('change', this._onFileChange);
    this._dropArea.removeEventListener('dragover', this._onDragOver);
    this._dropArea.removeEventListener('dragleave', this._onDragLeave);
    this._dropArea.removeEventListener('drop', this._onDrop);
    this.removeEventListener('dragover', this._onDragOver);
    this.removeEventListener('dragleave', this._onDragLeave);
    this.removeEventListener('drop', this._onDrop);
  }

  // ----------------- Public API -----------------
  setEditor(editor) {
    if (!editor) throw new Error('Editor cannot be null/undefined');
    if (typeof editor.loadMatrix !== 'function') {
      throw new Error('Provided editor does not expose loadMatrix(matrix)');
    }
    this._editor = editor;
    this.dispatchEvent(new CustomEvent('editorconnected', { detail: { editor } }));
  }

  setOptions(options = {}) {
    if (options.fitMode) this._options.fitMode = options.fitMode;
    if (options.targetCellsX) this.setAttribute('target-cells-x', String(options.targetCellsX));
    if (options.targetCellsY) this.setAttribute('target-cells-y', String(options.targetCellsY));
  }

  get editor() {
    return this._editor;
  }

  // ----------------- Events -----------------
  _onFileChange(e) {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (!file) return;
    this._handleFile(file);
    this._fileInput.value = '';
  }

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this._dropArea.classList.add('dragover');
  }
  _onDragLeave(e) {
    e.preventDefault();
    this._dropArea.classList.remove('dragover');
  }

  _onDrop(e) {
    e.preventDefault();
    this._dropArea.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null;
    if (!file) return;
    this._handleFile(file);
  }

  // ----------------- File handling -----------------
  async _handleFile(file) {
    const isPngByType = file.type === 'image/png';
    const isPngByName = file.name && file.name.toLowerCase().endsWith('.png');
    if (!isPngByType && !isPngByName) {
      this._showError('Only PNG files are supported.');
      return;
    }

    if (!this._editor) {
      this._showError('No editor connected. Use setEditor(editor) or provide editor-selector attribute.');
      return;
    }

    try {
      await this._loadPngToEditorAdaptive(file);
      this._dispatchLoadedEvent(file.name);
    } catch (err) {
      console.error('Failed to load PNG', err);
      this._showError('Failed to load PNG (see console).');
    }
  }

  _showError(msg) {
    NotificationManager.Push({
      status: 'error',
      html: msg,
    });
  }
  _dispatchLoadedEvent(filename) {
    this.dispatchEvent(new CustomEvent('pngloaded', { detail: { filename } }));
  }

  // ----------------- Adaptive load -----------------
  _readEditorConfig() {
    const ed = this._editor;
    const cfg = { pixelSize: null, cellsX: null, cellsY: null };

    if (!ed) return cfg;

    // pixel size detection (try multiple forms)
    cfg.pixelSize = ed.pixelSize || ed.pixel_size || null;
    if (!cfg.pixelSize) {
      const attr = ed.getAttribute && (ed.getAttribute('pixel-size') || ed.getAttribute('pixelSize'));
      if (attr) cfg.pixelSize = parseInt(attr, 10);
    }
    if (typeof cfg.pixelSize === 'string') cfg.pixelSize = parseInt(cfg.pixelSize, 10);

    // cells detection (common attribute names: width/height on engine represent cells)
    const widthAttr = ed.getAttribute && ed.getAttribute('width');
    const heightAttr = ed.getAttribute && ed.getAttribute('height');
    if (widthAttr && heightAttr) {
      cfg.cellsX = parseInt(widthAttr, 10);
      cfg.cellsY = parseInt(heightAttr, 10);
    }

    // alternative property names
    cfg.cellsX = cfg.cellsX || ed.cellsX || ed.cellCountX || (ed.cells && ed.cells.x) || null;
    cfg.cellsY = cfg.cellsY || ed.cellsY || ed.cellCountY || (ed.cells && ed.cells.y) || null;

    // if editor exposes getCells() prefer that
    try {
      if ((!cfg.cellsX || !cfg.cellsY) && typeof ed.getCells === 'function') {
        const c = ed.getCells();
        if (c && c.x && c.y) {
          cfg.cellsX = cfg.cellsX || c.x;
          cfg.cellsY = cfg.cellsY || c.y;
        }
      }
    } catch (e) {
      /* ignore */
    }

    return cfg;
  }

  // core adaptive loader: scales image to editor cells (or computes fallback)
  async _loadPngToEditorAdaptive(blobOrFile) {
    const imgBitmap = await createImageBitmap(blobOrFile);
    const srcW = imgBitmap.width;
    const srcH = imgBitmap.height;

    // read editor config and loader explicit overrides
    const editorCfg = this._readEditorConfig();
    const overrideX = this.getAttribute('target-cells-x');
    const overrideY = this.getAttribute('target-cells-y');

    let targetCellsX = overrideX ? parseInt(overrideX, 10) : editorCfg.cellsX || null;
    let targetCellsY = overrideY ? parseInt(overrideY, 10) : editorCfg.cellsY || null;

    // if cells unknown but pixelSize known, compute approximate cells from image dimensions
    if ((!targetCellsX || !targetCellsY) && editorCfg.pixelSize) {
      const px = parseInt(editorCfg.pixelSize, 10);
      if (px > 0) {
        if (!targetCellsX) targetCellsX = Math.max(1, Math.round(srcW / px));
        if (!targetCellsY) targetCellsY = Math.max(1, Math.round(srcH / px));
      }
    }

    // if still missing, fallback to native image pixels
    if (!targetCellsX) targetCellsX = srcW;
    if (!targetCellsY) targetCellsY = srcH;

    // Decide fit mode
    const fitMode = this._options.fitMode || this.getAttribute('fit-mode') || 'contain';

    // Create a small canvas sized to the target cells (we will render the image into this canvas
    // with smoothing disabled to preserve blocky/pixel look). Then read each pixel as a cell.
    const small = document.createElement('canvas');
    small.width = targetCellsX;
    small.height = targetCellsY;
    const sctx = small.getContext('2d');

    // nearest-neighbour / crisp scaling
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, small.width, small.height);

    if (fitMode === 'stretch') {
      // non-uniform scale to fill exactly
      sctx.drawImage(imgBitmap, 0, 0, srcW, srcH, 0, 0, small.width, small.height);
    } else {
      // compute uniform scale to contain or cover
      let scaleX = small.width / srcW;
      let scaleY = small.height / srcH;
      let scale = fitMode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
      // compute destination size in small-canvas pixels
      const destW = Math.max(1, Math.round(srcW * scale));
      const destH = Math.max(1, Math.round(srcH * scale));
      const dx = Math.floor((small.width - destW) / 2);
      const dy = Math.floor((small.height - destH) / 2);
      sctx.drawImage(imgBitmap, 0, 0, srcW, srcH, dx, dy, destW, destH);
    }

    // read pixel data from the small canvas
    const imageData = sctx.getImageData(0, 0, small.width, small.height).data;

    // build matrix[y][x] = [r,g,b,a]
    const matrix = new Array(small.height);
    let p = 0;
    for (let y = 0; y < small.height; y++) {
      const row = new Array(small.width);
      for (let x = 0; x < small.width; x++) {
        const r = imageData[p++];
        const g = imageData[p++];
        const b = imageData[p++];
        const a = imageData[p++];
        row[x] = [r, g, b, a];
      }
      matrix[y] = row;
    }

    // attempt to optionally align editor settings (best-effort)
    try {
      // if editor has setCells(x,y) or setCellCount, call it
      if (typeof this._editor.setCells === 'function') {
        this._editor.setCells(small.width, small.height);
      } else if (typeof this._editor.setCellCount === 'function') {
        this._editor.setCellCount(small.width, small.height);
      } else {
        // try common attribute setter
        if (this._editor.setAttribute) {
          this._editor.setAttribute('width', String(small.width));
          this._editor.setAttribute('height', String(small.height));
        }
      }

      // if editor has setPixelSize and editorCfg.pixelSize exists, keep it
      if (editorCfg.pixelSize && typeof this._editor.setPixelSize === 'function') {
        this._editor.setPixelSize(parseInt(editorCfg.pixelSize, 10));
      }
    } catch (e) {
      // non-critical; continue
      console.warn('Failed to align editor config:', e);
    }

    // finally, hand matrix to editor
    if (!this._editor || typeof this._editor.loadMatrix !== 'function') {
      throw new Error('Editor disconnected or does not expose loadMatrix');
    }

    this._editor.loadMatrix(matrix);
  }

  // Public helpers
  async loadPngBlob(blob) {
    return this._handleFile(blob);
  }
  async loadPngUrl(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return this._handleFile(blob);
  }
}

customElements.define('object-layer-png-loader', ObjectLayerPngLoader);

/*

Example usage:

// HTML
<object-layer-engine id="editor"></object-layer-engine>
<object-layer-png-loader id="loader" editor-selector="#editor"></object-layer-png-loader>

// JS (programmatic)
const editor = document.getElementById('editor');
const loader = document.getElementById('loader');
// Alternatively: loader.setEditor(editor);
loader.addEventListener('pngloaded', (e) => console.log('Loaded', e.detail.filename));

*/
