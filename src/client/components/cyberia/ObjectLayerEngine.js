import { darkTheme, renderChessPattern } from '../core/Css.js';
import { NotificationManager } from '../core/NotificationManager.js';

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
};

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

class ObjectLayerEngineElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = html`
      <style>
        :host {
          --border: 1px solid #bbb;
          --gap: 8px;
          display: inline-block;
          font-family:
            system-ui,
            -apple-system,
            'Segoe UI',
            Roboto,
            'Helvetica Neue',
            Arial;
        }
        .wrap {
          display: flex;
          flex-direction: column;
          gap: var(--gap);
          align-items: flex-start;
        }
        .canvas-frame {
          border: var(--border);
          display: inline-block;
          line-height: 0;
          position: relative;
          background: transparent;
          image-rendering: pixelated;
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
          background: ${darkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'};
        }
        .icon-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .icon-btn[data-active] {
          background: ${darkTheme ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)'};
          border-color: currentColor;
          box-shadow: 0 0 0 2px ${darkTheme ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)'};
        }

        /* A rule between groups, so the toolbar reads as sections rather than one long row. */
        .sep {
          width: 1px;
          align-self: stretch;
          min-height: 24px;
          background: ${darkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.15)'};
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
          background: ${darkTheme ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)'};
        }
        .hint {
          font-size: 12px;
          opacity: 0.7;
        }

        /* Right-click menu, positioned over the canvas frame at the pointer. */
        .ctx-menu {
          position: absolute;
          z-index: 5;
          min-width: 148px;
          padding: 4px;
          border-radius: 8px;
          line-height: normal;
          background: ${darkTheme ? '#242424' : '#ffffff'};
          border: 1px solid ${darkTheme ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)'};
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
          background: ${darkTheme ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'};
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

      <div class="wrap">
        <div class="toolbar">
          ${iconButton('undo', 'undo', 'Undo (Ctrl+Z)')} ${iconButton('redo', 'redo', 'Redo (Ctrl+Shift+Z)')}

          <span class="sep"></span>

          <!-- Tools: one button each, so the active tool is visible without opening anything. -->
          ${iconButton('tool-pencil', 'pencil', 'Pencil', { active: true })}
          ${iconButton('tool-eraser', 'eraser', 'Eraser')} ${iconButton('tool-fill', 'fill', 'Fill')}
          ${iconButton('tool-eyedropper', 'eyedropper', 'Pick colour')}

          <span class="sep"></span>

          <!-- Select mode: while it is on the canvas selects and moves instead of drawing. -->
          ${iconButton('tool-select', 'marquee', 'Select mode: drag to select, then drag to move')}

          <span class="sep"></span>

          <div class="group">
            ${iconButton('flip-h', 'flipH', 'Flip horizontally')} ${iconButton('flip-v', 'flipV', 'Flip vertically')}
            ${iconButton('rot-ccw', 'rotateCCW', 'Rotate -90°')} ${iconButton('rot-cw', 'rotateCW', 'Rotate +90°')}
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
            <input type="number" part="g-input" min="0" max="255" value="0" title="Green (0-255)" style="width:5ch" />
            <input type="number" part="b-input" min="0" max="255" value="0" title="Blue (0-255)" style="width:5ch" />
            <input type="number" part="a-input" min="0" max="255" value="255" title="Alpha (0-255)" style="width:5ch" />
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

          <label>brush <input type="number" part="brush-size" min="1" value="1" /></label>
        </div>

        <div class="toolbar">
          <label>pixel-size <input type="number" part="pixel-size" min="1" value="16" /></label>
          <label
            >cells <input type="number" part="cell-width" min="1" value="16" style="width:6ch" /> x
            <input type="number" part="cell-height" min="1" value="16" style="width:6ch"
          /></label>
          <label class="switch"> <input type="checkbox" part="toggle-grid" /> grid </label>

          <span class="sep"></span>

          <button part="export">Export PNG</button>
          <button part="export-json">Export JSON</button>
          <button part="import-json">Import JSON</button>
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
          <span part="sel-info" class="sel-info">no selection</span>
          <span part="sel-hint" class="hint">Drag to select</span>
        </div>

        <div class="canvas-frame" style="${renderChessPattern()}">
          <canvas part="canvas" class="canvas-layer"></canvas>
          <canvas part="grid" class="grid-layer"></canvas>
          <div class="ctx-menu" part="ctx-menu" hidden></div>
        </div>
      </div>
    `;

    // DOM
    this._pixelCanvas = this.shadowRoot.querySelector('canvas[part="canvas"]');
    this._gridCanvas = this.shadowRoot.querySelector('canvas[part="grid"]');
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
    };
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
    this._matrix = this._createEmptyMatrix(this._width, this._height);

    this._pixelCtx = null;
    this._gridCtx = null;

    this._isPointerDown = false;
    this._tool = 'pencil';
    this._showGrid = false;

    // history (undo/redo)
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = 200;
    this._transactionActive = false; // grouping for pointer drags

    // Select mode replaces drawing with selecting and moving; off, the canvas draws as before.
    this._selectMode = false;
    // selection: {x, y, w, h} in cells, or null. _selAnchor holds the marquee drag origin.
    this._selection = null;
    this._selAnchor = null;
    // While a move is under way the cells travel here, lifted out of the matrix so what they
    // covered shows through, and are written back on drop.
    this._floating = null;
    this._moveGrab = null;
    this._clipboard = null; // matrix copied out of a selection
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
    if (oldV === newV) return;
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

    // initialize color & opacity UI
    if (this._colorInput) this._colorInput.value = this._rgbaToHex(this._brushColor);
    if (this._hexInput) this._hexInput.value = this._rgbaToHexWithAlpha(this._brushColor);
    if (this._rInput) this._rInput.value = String(this._brushColor[0]);
    if (this._gInput) this._gInput.value = String(this._brushColor[1]);
    if (this._bInput) this._bInput.value = String(this._brushColor[2]);
    if (this._aInput) this._aInput.value = String(this._brushColor[3]);
    if (this._opacityRange) this._opacityRange.value = String(this._brushColor[3]);
    if (this._opacityNumber) this._opacityNumber.value = String(this._brushColor[3]);
    this._emitBrushColorChange();

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
    this._brushSizeInput.addEventListener('change', (e) => this.setBrushSize(parseInt(e.target.value, 10) || 1));
    this._pixelSizeInput.addEventListener('change', (e) => {
      this.pixelSize = Math.max(1, parseInt(e.target.value, 10) || 1);
    });
    this._toggleGrid.addEventListener('change', (e) => {
      this._showGrid = !!e.target.checked;
      this._renderGrid();
    });

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
        // keep value synced (will update input again in resize)
        this.resize(val, this._height, { preserve: true });
      });
    if (this._heightInput)
      this._heightInput.addEventListener('change', (e) => {
        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
        this.resize(this._width, val, { preserve: true });
      });

    // transform buttons
    if (this._flipHBtn)
      this._flipHBtn.addEventListener('click', () => {
        this._beginTransaction();
        this.flipHorizontal();
        this._endTransaction();
      });
    if (this._flipVBtn)
      this._flipVBtn.addEventListener('click', () => {
        this._beginTransaction();
        this.flipVertical();
        this._endTransaction();
      });
    if (this._rotCWBtn)
      this._rotCWBtn.addEventListener('click', () => {
        this._beginTransaction();
        this.rotateCW();
        this._endTransaction();
      });
    if (this._rotCCWBtn)
      this._rotCCWBtn.addEventListener('click', () => {
        this._beginTransaction();
        this.rotateCCW();
        this._endTransaction();
      });

    // clear button (makes canvas fully transparent)
    if (this._clearBtn)
      this._clearBtn.addEventListener('click', () => {
        this._beginTransaction();
        this.clear([0, 0, 0, 0]);
        this._endTransaction();
      });

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
        this._beginTransaction();
        this.importMatrixJSON(text);
        this._endTransaction();
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

    // initial render and clear history
    this.render();
    this._clearHistory();
    this._updateToolbarButtons();
    this._updateToolButtons();
    this._updateSelectionUI();
  }

  disconnectedCallback() {
    this._pixelCanvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);

    if (this._flipHBtn) this._flipHBtn.removeEventListener('click', this.flipHorizontal);
    if (this._flipVBtn) this._flipVBtn.removeEventListener('click', this.flipVertical);
    if (this._rotCWBtn) this._rotCWBtn.removeEventListener('click', this.rotateCW);
    if (this._rotCCWBtn) this._rotCCWBtn.removeEventListener('click', this.rotateCCW);
    if (this._clearBtn) this._clearBtn.removeEventListener('click', () => this.clear([0, 0, 0, 0]));
    if (this._opacityRange) this._opacityRange.removeEventListener('input', () => {});
    if (this._opacityNumber) this._opacityNumber.removeEventListener('change', () => {});

    if (this._undoBtn) this._undoBtn.removeEventListener('click', () => this.undo());
    if (this._redoBtn) this._redoBtn.removeEventListener('click', () => this.redo());

    window.removeEventListener('keydown', this._onKeyDown);

    this._pixelCanvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);

    // the ants loop holds a frame handle across renders; it must not outlive the element
    if (this._antsFrame) cancelAnimationFrame(this._antsFrame);
    this._antsFrame = 0;
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
    this._width = w;
    this._height = h;
    this._matrix = matrix.map((r) => r.map((c) => c.slice()));
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
    this._width = nw;
    this._height = nh;
    this._matrix = newMat;

    // keep inputs and attributes in sync
    if (this._widthInput) this._widthInput.value = String(this._width);
    if (this._heightInput) this._heightInput.value = String(this._height);
    this.setAttribute('width', String(this._width));
    this.setAttribute('height', String(this._height));

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
    this._renderGrid();
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
      ctx.strokeStyle = darkTheme ? '#e1e1e1' : '#272727';
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
    return !!sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
  }

  // set full RGBA brush color (alpha optional)
  setBrushColor(rgba) {
    if (!Array.isArray(rgba) || rgba.length < 3) return;
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

  _applyBrush(x, y, color, renderAfter = false) {
    const half = Math.floor(this._brushSize / 2);
    for (let oy = -half; oy <= half; oy++)
      for (let ox = -half; ox <= half; ox++) {
        const tx = x + ox,
          ty = y + oy;
        if (this._inBounds(tx, ty)) this._matrix[ty][tx] = color.slice();
      }
    if (renderAfter) this.render();
  }

  fillBucket(x, y, targetColor = null) {
    if (!this._inBounds(x, y)) return;
    this._beginTransaction();
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
    // start transaction for continuous stroke
    this._beginTransaction();
    this._applyToolAt(x, y, evt);
  }

  _onPointerMove(evt) {
    const [x, y] = this._toGridCoords(evt);
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
    this._endTransaction();
  }

  // ---------------- Moving a selection ----------------
  /* Lifts the selected cells out of the matrix so what they covered shows through while they
   * travel. They ride in _floating until the drop writes them back. */
  _beginMove(x, y) {
    if (!this._selection) return;
    if (!this._floating) {
      this._floating = this._readRegion(this._selection);
      const { x: sx, y: sy, w, h } = this._selection;
      for (let ry = 0; ry < h; ry++) for (let rx = 0; rx < w; rx++) this._matrix[sy + ry][sx + rx] = [0, 0, 0, 0];
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
    this._beginTransaction();
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
    if (!this._inBounds(x, y)) return;
    switch (this._tool) {
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
    this._updateSelectionUI();
    this._startAnts();
    this._renderGrid();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: this.getSelection() }));
    return this.getSelection();
  }

  selectAll() {
    return this.setSelection(0, 0, this._width - 1, this._height - 1);
  }

  clearSelection() {
    if (!this._selection) return;
    this._selection = null;
    this._updateSelectionUI();
    this._renderGrid();
    this.dispatchEvent(new CustomEvent('selectionchange', { detail: null }));
  }

  /* Keeps the marquee on the canvas after the canvas itself changed shape. */
  _clampSelection() {
    if (!this._selection) return;
    const { x, y, w, h } = this._selection;
    if (x >= this._width || y >= this._height) return this.clearSelection();
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
    if (this._selInfo) this._selInfo.textContent = sel ? `${sel.x},${sel.y}  ${sel.w}×${sel.h}` : 'no selection';
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
  _readRegion({ x, y, w, h }) {
    const out = this._createEmptyMatrix(w, h);
    for (let ry = 0; ry < h; ry++)
      for (let rx = 0; rx < w; rx++) {
        const cell = this._matrix[y + ry] && this._matrix[y + ry][x + rx];
        out[ry][rx] = cell ? cell.slice() : [0, 0, 0, 0];
      }
    return out;
  }

  /* Writes a matrix with its top-left at (x, y), dropping whatever falls off the canvas. */
  _writeRegion(src, x, y) {
    for (let ry = 0; ry < src.length; ry++)
      for (let rx = 0; rx < src[ry].length; rx++) {
        const tx = x + rx;
        const ty = y + ry;
        if (this._inBounds(tx, ty)) this._matrix[ty][tx] = src[ry][rx].slice();
      }
  }

  copySelection() {
    if (!this._selection) return null;
    this._clipboard = this._readRegion(this._selection);
    this._updateSelectionUI();
    this.dispatchEvent(new CustomEvent('copy', { detail: { width: this._selection.w, height: this._selection.h } }));
    return this._clipboard.map((r) => r.map((c) => c.slice()));
  }

  cutSelection() {
    const copied = this.copySelection();
    if (copied) this.deleteSelection();
    return copied;
  }

  /* Clears the selected cells to fully transparent. */
  deleteSelection() {
    if (!this._selection) return;
    this._beginTransaction();
    const { x, y, w, h } = this._selection;
    for (let ry = 0; ry < h; ry++) for (let rx = 0; rx < w; rx++) this._matrix[y + ry][x + rx] = [0, 0, 0, 0];
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
    this._beginTransaction();
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
      this._beginTransaction();
      const resampled = this.resampleMatrix(this._matrix, w, h);
      this._width = w;
      this._height = h;
      this._matrix = resampled;
      if (this._widthInput) this._widthInput.value = String(w);
      if (this._heightInput) this._heightInput.value = String(h);
      this.setAttribute('width', String(w));
      this.setAttribute('height', String(h));
      this._setupContextsAndSize();
      this.render();
      this._endTransaction();
      this._updateSelectionUI();
      this.dispatchEvent(new CustomEvent('rescale', { detail: { scope: 'image', width: w, height: h } }));
      return;
    }

    const sel = this._selection;
    if (w === sel.w && h === sel.h) return;
    this._beginTransaction();
    const resampled = this.resampleMatrix(this._readRegion(sel), w, h);
    for (let ry = 0; ry < sel.h; ry++)
      for (let rx = 0; rx < sel.w; rx++) this._matrix[sel.y + ry][sel.x + rx] = [0, 0, 0, 0];
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
    return JSON.stringify({ width: this._width, height: this._height, matrix: this._matrix });
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
    return new Promise((resolve) => {
      const w = this._width,
        h = this._height;
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
          const c = this._matrix[y][x] || [0, 0, 0, 0];
          data[p++] = this._clampInt(c[0]);
          data[p++] = this._clampInt(c[1]);
          data[p++] = this._clampInt(c[2]);
          data[p++] = this._clampInt(c[3]);
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
    this._width = snap.width;
    this._height = snap.height;
    this._matrix = snap.matrix.map((r) => r.map((c) => c.slice()));
    if (this._widthInput) this._widthInput.value = String(this._width);
    if (this._heightInput) this._heightInput.value = String(this._height);
    this.setAttribute('width', String(this._width));
    this.setAttribute('height', String(this._height));
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

  _pushUndo(snap) {
    this._undoStack.push(snap);
    if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
    // clear redo
    this._redoStack.length = 0;
    this._updateToolbarButtons();
  }

  _clearHistory() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._updateToolbarButtons();
  }

  _beginTransaction() {
    if (this._transactionActive) return;
    this._transactionActive = true;
    const before = this._snapshot();
    this._pushUndo(before);
  }

  _endTransaction() {
    if (!this._transactionActive) return;
    this._transactionActive = false;
    // if the last undo state is identical to current (no-op), remove it
    const last = this._undoStack[this._undoStack.length - 1];
    const now = this._snapshot();
    if (this._matricesEqual(last, now)) this._undoStack.pop();
    this._updateToolbarButtons();
  }

  undo() {
    if (!this._undoStack.length) return;
    const snap = this._undoStack.pop();
    // push current to redo
    this._redoStack.push(this._snapshot());
    this._loadSnapshot(snap);
    this._updateToolbarButtons();
    this.dispatchEvent(new CustomEvent('undo'));
  }

  redo() {
    if (!this._redoStack.length) return;
    const snap = this._redoStack.pop();
    // push current to undo
    this._undoStack.push(this._snapshot());
    this._loadSnapshot(snap);
    this._updateToolbarButtons();
    this.dispatchEvent(new CustomEvent('redo'));
  }

  _updateToolbarButtons() {
    if (this._undoBtn) this._undoBtn.disabled = this._undoStack.length === 0;
    if (this._redoBtn) this._redoBtn.disabled = this._redoStack.length === 0;
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
    this._width = newW;
    this._height = newH;
    this._matrix = newMat;
    // keep inputs/attributes in sync
    if (this._widthInput) this._widthInput.value = String(this._width);
    if (this._heightInput) this._heightInput.value = String(this._height);
    this.setAttribute('width', String(this._width));
    this.setAttribute('height', String(this._height));

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
    this._width = newW;
    this._height = newH;
    this._matrix = newMat;
    if (this._widthInput) this._widthInput.value = String(this._width);
    if (this._heightInput) this._heightInput.value = String(this._height);
    this.setAttribute('width', String(this._width));
    this.setAttribute('height', String(this._height));

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
    this._width = Math.max(1, Math.floor(v));
    this.setAttribute('width', String(this._width));
    this._clampSelection();
    this._setupContextsAndSize();
    this.render();
  }
  get height() {
    return this._height;
  }
  set height(v) {
    this._height = Math.max(1, Math.floor(v));
    this.setAttribute('height', String(this._height));
    this._clampSelection();
    this._setupContextsAndSize();
    this.render();
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
