/**
 * ObjectLayerEngine.js
 * Lightweight Web Component for pixel/object layer editing.
 * - Custom element: <object-layer-engine>
 * - Matrix: 2D RGBA integer values [0..255]
 * - Features: drag-to-paint with configurable brush size, pencil/eraser/fill/eyedropper tools,
 *   import/export matrix JSON, export PNG, adjustable visual pixel size.
 *
 * Best-practices applied:
 * - Defensive checks in render() to avoid iterating undefined structures
 * - Minimal DOM in shadow root; no external dependencies
 * - Clear public API surface (createMatrix, loadMatrix, exportJSON, importJSON, setBrushSize, etc.)
 * - JSDoc comments on public methods for IDE discovery
 *
 * Copy this file as ObjectLayerEngine.js (ES module) and import it in your page
 */

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
      background: repeating-conic-gradient(#eee 0% 25%, transparent 0% 50%) 50% / 16px 16px;
    }
    canvas {
      display: block;
      image-rendering: pixelated;
      width: 100%;
      height: 100%;
      touch-action: none;
      cursor: crosshair;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .toolbar > * {
      font-size: 13px;
    }
    input[type='number'] {
      width: 64px;
      padding: 4px;
    }
    button {
      padding: 6px 8px;
      cursor: pointer;
    }
  </style>

  <div class="wrap">
    <div class="canvas-frame"><canvas part="canvas"></canvas></div>

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

      <button part="export">Export PNG</button>
      <button part="export-json">Export JSON</button>
      <button part="import-json">Import JSON</button>
    </div>
  </div>
`;

/**
 * ObjectLayerEngineElement
 * Web Component that provides a simple pixel editing surface.
 */
class ObjectLayerEngineElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = templateHTML;

    // DOM refs
    this._canvas = this.shadowRoot.querySelector('canvas');
    this._colorInput = this.shadowRoot.querySelector('input[part="color"]');
    this._toolSelect = this.shadowRoot.querySelector('select[part="tool"]');
    this._brushSizeInput = this.shadowRoot.querySelector('input[part="brush-size"]');
    this._pixelSizeInput = this.shadowRoot.querySelector('input[part="pixel-size"]');
    this._exportBtn = this.shadowRoot.querySelector('button[part="export"]');
    this._exportJsonBtn = this.shadowRoot.querySelector('button[part="export-json"]');
    this._importJsonBtn = this.shadowRoot.querySelector('button[part="import-json"]');

    // internal state
    this._width = 16;
    this._height = 16;
    this._pixelSize = 16; // visual scaling
    this._brushSize = 1; // brush diameter in pixels (square brush)

    // matrix: [height][width] -> [r,g,b,a]
    this._matrix = this._createEmptyMatrix(this._width, this._height);

    this._ctx = null;
    this._isPointerDown = false;
    this._tool = 'pencil';
    this._brushColor = [0, 0, 0, 255];

    // bind handlers
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  static get observedAttributes() {
    return ['width', 'height', 'pixel-size'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'width') this.width = parseInt(newValue, 10) || this._width;
    if (name === 'height') this.height = parseInt(newValue, 10) || this._height;
    if (name === 'pixel-size') this.pixelSize = parseInt(newValue, 10) || this._pixelSize;
  }

  connectedCallback() {
    // reflect attributes if provided
    if (this.hasAttribute('width')) this._width = Math.max(1, parseInt(this.getAttribute('width'), 10));
    if (this.hasAttribute('height')) this._height = Math.max(1, parseInt(this.getAttribute('height'), 10));
    if (this.hasAttribute('pixel-size')) this._pixelSize = Math.max(1, parseInt(this.getAttribute('pixel-size'), 10));

    this._ctx = this._canvas.getContext('2d');

    // UI wiring
    this._colorInput.addEventListener('input', (e) => {
      const rgba = this._hexToRgba(e.target.value);
      this.setBrushColor([rgba[0], rgba[1], rgba[2], 255]);
    });

    this._toolSelect.addEventListener('change', (e) => this.setTool(e.target.value));
    this._brushSizeInput.addEventListener('change', (e) =>
      this.setBrushSize(Math.max(1, parseInt(e.target.value, 10) || 1)),
    );
    this._pixelSizeInput.addEventListener(
      'change',
      (e) => (this.pixelSize = Math.max(1, parseInt(e.target.value, 10) || 1)),
    );

    this._exportBtn.addEventListener('click', () => {
      const url = this.toDataURL(this._pixelSize);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'object-layer.png';
      a.click();
    });

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
        console.error('Invalid JSON import', err);
        alert('Invalid JSON');
      }
    });

    // pointer events
    this._canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // initial sizing + render
    this._resizeCanvas();
    this.render();
  }

  disconnectedCallback() {
    this._canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  // ---------------- Matrix helpers ----------------
  _createEmptyMatrix(w, h) {
    const mat = new Array(h);
    for (let y = 0; y < h; y++) {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = [0, 0, 0, 0];
      mat[y] = row;
    }
    return mat;
  }

  /**
   * Create a new matrix (does not set it on the component)
   * @param {number} width
   * @param {number} height
   * @param {number[]} fill rgba array
   * @returns {Array}
   */
  createMatrix(width, height, fill = [0, 0, 0, 0]) {
    return this._createEmptyMatrix(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))).map((row) =>
      row.map(() => fill.slice()),
    );
  }

  /**
   * Load externally-provided matrix into the editor (deep copy)
   * @param {Array} matrix 2D array matrix[height][width] -> [r,g,b,a]
   */
  loadMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length === 0) throw new TypeError('matrix must be a non-empty 2D array');
    const h = matrix.length;
    const w = matrix[0].length;
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(matrix[y]) || matrix[y].length !== w) throw new TypeError('matrix must be rectangular');
      for (let x = 0; x < w; x++) {
        const v = matrix[y][x];
        if (!Array.isArray(v) || v.length !== 4) throw new TypeError('each cell must be an [r,g,b,a] array');
        matrix[y][x] = v.map((n) => this._clampInt(n));
      }
    }

    this._width = w;
    this._height = h;
    this._matrix = matrix.map((row) => row.map((cell) => cell.slice()));
    this._resizeCanvas();
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
    this._resizeCanvas();
    this.render();
    this.dispatchEvent(new CustomEvent('resize', { detail: { width: nw, height: nh } }));
  }

  setPixel(x, y, rgba) {
    if (!this._inBounds(x, y)) return false;
    this._matrix[y][x] = rgba.map((n) => this._clampInt(n));
    this.render();
    this.dispatchEvent(new CustomEvent('pixelchange', { detail: { x, y, rgba: this._matrix[y][x].slice() } }));
    return true;
  }

  getPixel(x, y) {
    if (!this._inBounds(x, y)) return null;
    return this._matrix[y][x].slice();
  }

  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this._width && y < this._height;
  }
  _clampInt(v) {
    const n = Number(v) || 0;
    return Math.min(255, Math.max(0, Math.floor(n)));
  }

  // ---------------- Rendering ----------------
  _resizeCanvas() {
    this._canvas.width = this._width;
    this._canvas.height = this._height;
    this._canvas.style.width = `${this._width * this._pixelSize}px`;
    this._canvas.style.height = `${this._height * this._pixelSize}px`;
    this._ctx = this._canvas.getContext('2d');
    try {
      this._ctx.imageSmoothingEnabled = false;
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Render matrix to canvas. Defensive: if matrix is invalid, replace with empty matrix first.
   */
  render() {
    if (
      !Array.isArray(this._matrix) ||
      this._matrix.length !== this._height ||
      !Array.isArray(this._matrix[0]) ||
      this._matrix[0].length !== this._width
    ) {
      // create safe fallback preserving nothing to avoid runtime exceptions
      this._matrix = this._createEmptyMatrix(this._width, this._height);
    }

    if (!this._ctx) this._ctx = this._canvas.getContext('2d');
    const img = this._ctx.createImageData(this._width, this._height);
    const data = img.data;
    let p = 0;

    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const cell = this._matrix[y] && this._matrix[y][x] ? this._matrix[y][x] : [0, 0, 0, 0];
        const [r, g, b, a] = cell;
        data[p++] = this._clampInt(r);
        data[p++] = this._clampInt(g);
        data[p++] = this._clampInt(b);
        data[p++] = this._clampInt(a);
      }
    }

    this._ctx.putImageData(img, 0, 0);
  }

  toDataURL(scale = 1, mime = 'image/png') {
    const tmp = document.createElement('canvas');
    tmp.width = this._width;
    tmp.height = this._height;
    const tctx = tmp.getContext('2d');
    const img = tctx.createImageData(this._width, this._height);
    const data = img.data;
    let p = 0;
    for (let y = 0; y < this._height; y++)
      for (let x = 0; x < this._width; x++) {
        const [r, g, b, a] = this._matrix[y][x];
        data[p++] = r;
        data[p++] = g;
        data[p++] = b;
        data[p++] = a;
      }
    tctx.putImageData(img, 0, 0);

    if (scale === 1) return tmp.toDataURL(mime);
    const s = document.createElement('canvas');
    s.width = this._width * scale;
    s.height = this._height * scale;
    const sctx = s.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(tmp, 0, 0, s.width, s.height);
    return s.toDataURL(mime);
  }

  // ---------------- Tools & Brush ----------------
  setTool(toolName) {
    this._tool = toolName;
    if (this._toolSelect) this._toolSelect.value = toolName;
  }
  setBrushColor(rgba) {
    this._brushColor = rgba.map((n) => this._clampInt(n));
    if (this._colorInput) this._colorInput.value = this._rgbaToHex(this._brushColor);
  }
  setBrushSize(n) {
    this._brushSize = Math.max(1, Math.floor(n));
    if (this._brushSizeInput) this._brushSizeInput.value = this._brushSize;
  }

  /**
   * Apply a square brush centered on (x,y). Simple and fast.
   * @private
   */
  _applyBrush(x, y, color) {
    const half = Math.floor(this._brushSize / 2);
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        const tx = x + ox,
          ty = y + oy;
        if (this._inBounds(tx, ty)) this._matrix[ty][tx] = color.slice();
      }
    }
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

  // ---------------- Pointer handling (drag painting) ----------------
  _toGridCoords(evt) {
    const rect = this._canvas.getBoundingClientRect();
    const cssX = evt.clientX - rect.left;
    const cssY = evt.clientY - rect.top;
    const scaleX = this._canvas.width / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const x = Math.floor(cssX * scaleX);
    const y = Math.floor(cssY * scaleY);
    return [x, y];
  }

  _onPointerDown(evt) {
    evt.preventDefault();
    this._isPointerDown = true;
    try {
      this._canvas.setPointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }
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
      this._canvas.releasePointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }
  }

  _applyToolAt(x, y, evt, continuous = false) {
    if (!this._inBounds(x, y)) return;
    switch (this._tool) {
      case 'pencil':
        this._applyBrush(x, y, this._brushColor.slice());
        this.render();
        break;
      case 'eraser':
        this._applyBrush(x, y, [0, 0, 0, 0]);
        this.render();
        break;
      case 'fill':
        if (!continuous) this.fillBucket(x, y);
        break;
      case 'eyedropper':
        const picked = this.getPixel(x, y);
        if (picked) this.setBrushColor([picked[0], picked[1], picked[2], picked[3]]);
        break;
      default:
        break;
    }
  }

  // ---------------- Import/Export JSON ----------------
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
        const f = input.files && input.files[0];
        resolve(f || null);
      });
      input.click();
    });
  }

  // ---------------- Helpers ----------------
  _hexToRgba(hex) {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return [r, g, b, 255];
    }
    if (h.length === 6) {
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return [r, g, b, 255];
    }
    return [0, 0, 0, 255];
  }

  _rgbaToHex(rgba) {
    const [r, g, b] = rgba;
    return `#${((1 << 24) + (this._clampInt(r) << 16) + (this._clampInt(g) << 8) + this._clampInt(b))
      .toString(16)
      .slice(1)}`;
  }

  // ---------------- Properties ----------------
  get width() {
    return this._width;
  }
  set width(v) {
    this._width = Math.max(1, Math.floor(v));
    this.setAttribute('width', String(this._width));
    this._resizeCanvas();
    this.render();
  }

  get height() {
    return this._height;
  }
  set height(v) {
    this._height = Math.max(1, Math.floor(v));
    this.setAttribute('height', String(this._height));
    this._resizeCanvas();
    this.render();
  }

  get pixelSize() {
    return this._pixelSize;
  }
  set pixelSize(v) {
    this._pixelSize = Math.max(1, Math.floor(v));
    this.setAttribute('pixel-size', String(this._pixelSize));
    this._resizeCanvas();
    this.render();
  }

  get brushSize() {
    return this._brushSize;
  }
  set brushSize(v) {
    this.setBrushSize(v);
  }

  get matrix() {
    return this._matrix.map((row) => row.map((cell) => cell.slice()));
  }

  // Public helpers for convenience
  exportJSON() {
    return this.exportMatrixJSON();
  }
  importJSON(json) {
    return this.importMatrixJSON(json);
  }
}

customElements.define('object-layer-engine', ObjectLayerEngineElement);

/* Example usage (HTML):
<object-layer-engine id="ole" width="16" height="16" pixel-size="20"></object-layer-engine>
<script type="module"> import './ObjectLayerEngine.js'; const e = document.getElementById('ole'); e.setBrushSize(3); </script>
*/
