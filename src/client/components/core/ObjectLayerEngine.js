import { darkTheme, renderChessPattern } from './Css.js';

const templateHTML = html`
  <style>
    :host {
      --border: 1px solid #bbb;
      --gap: 8px;
      display: inline-block;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
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
    }
    canvas.canvas-layer {
      display: block;
      image-rendering: pixelated;
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
  </style>

  <div class="wrap">
    <div class="toolbar">
      <input type="color" part="color" title="Brush color" value="#000000" />
      <select part="tool">
        <option value="pencil">pencil</option>
        <option value="eraser">eraser</option>
        <option value="fill">fill</option>
        <option value="eyedropper">eyedropper</option>
      </select>

      <label>brush <input type="number" part="brush-size" min="1" value="1" /></label>
      <label>pixel-size <input type="number" part="pixel-size" min="1" value="16" /></label>

      <!-- New: cell dimensions (width x height) -->
      <label
        >cells <input type="number" part="cell-width" min="1" value="16" style="width:6ch" /> x
        <input type="number" part="cell-height" min="1" value="16" style="width:6ch"
      /></label>

      <label class="switch"> <input type="checkbox" part="toggle-grid" /> grid </label>

      <!-- New: transform tools -->
      <div class="group">
        <button part="flip-h" title="Flip horizontally">Flip H</button>
        <button part="flip-v" title="Flip vertically">Flip V</button>
        <button part="rot-ccw" title="Rotate -90°">⟲</button>
        <button part="rot-cw" title="Rotate +90°">⟳</button>
      </div>

      <label
        >opacity <input type="range" part="opacity" min="0" max="255" value="255" style="width:10rem" /><input
          type="number"
          part="opacity-num"
          min="0"
          max="255"
          value="255"
          style="width:5ch;margin-left:4px"
      /></label>

      <button part="clear" title="Clear (make fully transparent)">Clear</button>

      <button part="export">Export PNG</button>
      <button part="export-json">Export JSON</button>
      <button part="import-json">Import JSON</button>
    </div>
    <div class="canvas-frame" style="${renderChessPattern()}">
      <canvas part="canvas" class="canvas-layer"></canvas>
      <canvas part="grid" class="grid-layer"></canvas>
    </div>
  </div>
`;

class ObjectLayerEngineElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = templateHTML;

    // DOM
    this._pixelCanvas = this.shadowRoot.querySelector('canvas[part="canvas"]');
    this._gridCanvas = this.shadowRoot.querySelector('canvas[part="grid"]');
    this._colorInput = this.shadowRoot.querySelector('input[part="color"]');
    this._toolSelect = this.shadowRoot.querySelector('select[part="tool"]');
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

    // binds
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    // transform methods bound (useful if passing as callbacks)
    this.flipHorizontal = this.flipHorizontal.bind(this);
    this.flipVertical = this.flipVertical.bind(this);
    this.rotateCW = this.rotateCW.bind(this);
    this.rotateCCW = this.rotateCCW.bind(this);
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
    if (this._opacityRange) this._opacityRange.value = String(this._brushColor[3]);
    if (this._opacityNumber) this._opacityNumber.value = String(this._brushColor[3]);

    // UI events
    this._colorInput.addEventListener('input', (e) => {
      const rgb = this._hexToRgba(e.target.value);
      // keep current alpha
      this.setBrushColor([rgb[0], rgb[1], rgb[2], this._brushColor[3]]);
    });
    this._toolSelect.addEventListener('change', (e) => this.setTool(e.target.value));
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
    if (this._flipHBtn) this._flipHBtn.addEventListener('click', this.flipHorizontal);
    if (this._flipVBtn) this._flipVBtn.addEventListener('click', this.flipVertical);
    if (this._rotCWBtn) this._rotCWBtn.addEventListener('click', this.rotateCW);
    if (this._rotCCWBtn) this._rotCCWBtn.addEventListener('click', this.rotateCCW);

    // clear button (makes canvas fully transparent)
    if (this._clearBtn) this._clearBtn.addEventListener('click', () => this.clear([0, 0, 0, 0]));

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
        this.importMatrixJSON(text);
      } catch (err) {
        console.error(err);
        alert('Invalid JSON');
      }
    });

    // Pointer events
    this._pixelCanvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    this.render();
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
        const cell = this._matrix[y] && this._matrix[y][x] ? this._matrix[y][x] : [0, 0, 0, 0];
        data[p++] = this._clampInt(cell[0]);
        data[p++] = this._clampInt(cell[1]);
        data[p++] = this._clampInt(cell[2]);
        data[p++] = this._clampInt(cell[3]);
      }
    }
    this._pixelCtx.putImageData(img, 0, 0);

    if (this._showGrid) this._renderGrid();
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
    if (!this._showGrid) return;
    const ps = this._pixelSize;
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

  // ---------------- Tools & painting ----------------
  setTool(name) {
    this._tool = name;
    if (this._toolSelect) this._toolSelect.value = name;
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
    if (this._opacityRange) this._opacityRange.value = String(this._brushColor[3]);
    if (this._opacityNumber) this._opacityNumber.value = String(this._brushColor[3]);
  }

  // set brush alpha (0-255)
  setBrushAlpha(a) {
    const v = Math.max(0, Math.min(255, Math.floor(Number(a) || 0)));
    this._brushColor[3] = v;
    if (this._opacityRange) this._opacityRange.value = String(v);
    if (this._opacityNumber) this._opacityNumber.value = String(v);
    // keep color input (hex) representing rgb only
    if (this._colorInput) this._colorInput.value = this._rgbaToHex(this._brushColor);
  }
  getBrushAlpha() {
    return this._brushColor[3];
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
    const src = this.getPixel(x, y);
    const newColor = targetColor ? targetColor.slice() : this._brushColor.slice();
    if (this._colorsEqual(src, newColor)) return;
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
    evt.preventDefault();
    this._isPointerDown = true;
    try {
      this._pixelCanvas.setPointerCapture(evt.pointerId);
    } catch (e) {}
    const [x, y] = this._toGridCoords(evt);
    this._applyToolAt(x, y, evt);
  }
  _onPointerMove(evt) {
    if (!this._isPointerDown) return;
    const [x, y] = this._toGridCoords(evt);
    this._applyToolAt(x, y, evt, true);
  }
  _onPointerUp(evt) {
    this._isPointerDown = false;
    try {
      this._pixelCanvas.releasePointerCapture(evt.pointerId);
    } catch (e) {}
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

  // ---------------- Import / Export ----------------
  exportMatrixJSON() {
    return JSON.stringify({ width: this._width, height: this._height, matrix: this._matrix });
  }
  importMatrixJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.matrix)) throw new TypeError('Invalid matrix JSON');
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
    this._setupContextsAndSize();
    this.render();
  }
  get height() {
    return this._height;
  }
  set height(v) {
    this._height = Math.max(1, Math.floor(v));
    this.setAttribute('height', String(this._height));
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
