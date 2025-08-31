/*
ObjectLayerEngine.js
- Web Component tag: <object-layer-engine>
- Encapsulated with Shadow DOM
- Features: RGBA matrix, drag-to-paint with brush sizes, persistent palettes, import/export JSON
- Bug fix: render() now guards against missing/invalid matrix to avoid "undefined is not iterable" errors.

Copy this file into your project as ObjectLayerEngine.js (ES module)
*/

const templateHTML = html`
  <style>
    :host {
      --border: 1px solid #bbb;
      --gap: 8px;
      display: inline-block;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
      user-select: none;
    }
    .wrap {
      display: inline-flex;
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
    .palette {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .swatch {
      width: 20px;
      height: 20px;
      border: 1px solid #333;
      cursor: pointer;
    }
  </style>

  <div class="wrap" part="root">
    <div class="canvas-frame" part="frame">
      <canvas part="canvas"></canvas>
    </div>

    <div class="toolbar" part="toolbar" aria-hidden="false">
      <input type="color" part="color" title="Brush color" value="#000000" />
      <select part="tool">
        <option value="pencil">pencil</option>
        <option value="eraser">eraser</option>
        <option value="fill">fill</option>
        <option value="eyedropper">eyedropper</option>
      </select>

      <label>brush <input type="number" part="brush-size" min="1" value="1" style="width:48px" /></label>

      <div class="palette" part="palette">
        <select part="palette-select"></select>
        <button part="save-palette">Save palette</button>
        <button part="add-swatch">+Add</button>
      </div>

      <label>pixel-size <input type="number" part="pixel-size" min="1" value="16" /></label>
      <button part="export">Export PNG</button>
      <button part="export-json">Export JSON</button>
      <button part="import-json">Import JSON</button>
    </div>
  </div>
`;

class ObjectLayerEngineElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = templateHTML;

    // DOM refs
    this._canvas = this.shadowRoot.querySelector('canvas');
    this._frame = this.shadowRoot.querySelector('.canvas-frame');
    this._colorInput = this.shadowRoot.querySelector('input[type="color"]');
    this._toolSelect = this.shadowRoot.querySelector('select[part="tool"]');
    this._pixelSizeInput = this.shadowRoot.querySelector('input[part="pixel-size"]');
    this._brushSizeInput = this.shadowRoot.querySelector('input[part="brush-size"]');
    this._exportBtn = this.shadowRoot.querySelector('button[part="export"]');
    this._exportJsonBtn = this.shadowRoot.querySelector('button[part="export-json"]');
    this._importJsonBtn = this.shadowRoot.querySelector('button[part="import-json"]');
    this._paletteSelect = this.shadowRoot.querySelector('select[part="palette-select"]');
    this._savePaletteBtn = this.shadowRoot.querySelector('button[part="save-palette"]');
    this._addSwatchBtn = this.shadowRoot.querySelector('button[part="add-swatch"]');

    // state
    this._width = 16;
    this._height = 16;
    this._pixelSize = 16;
    this._brushSize = 1; // in pixels (square brush)
    this._matrix = this._createEmptyMatrix(this._width, this._height);
    this._ctx = null;
    this._isPointerDown = false;
    this._tool = 'pencil';
    this._brushColor = [0, 0, 0, 255];

    // palettes
    this._palettesKey = 'object-layer-engine-palettes-v1';
    this._palettes = this._loadPalettesFromStorage();

    // binds
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  static get observedAttributes() {
    return ['width', 'height', 'pixel-size'];
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'width') this.width = parseInt(newV) || this._width;
    if (name === 'height') this.height = parseInt(newV) || this._height;
    if (name === 'pixel-size') this.pixelSize = parseInt(newV) || this._pixelSize;
  }

  connectedCallback() {
    if (this.hasAttribute('width')) this._width = Math.max(1, parseInt(this.getAttribute('width')));
    if (this.hasAttribute('height')) this._height = Math.max(1, parseInt(this.getAttribute('height')));
    if (this.hasAttribute('pixel-size')) this._pixelSize = Math.max(1, parseInt(this.getAttribute('pixel-size')));

    this._ctx = this._canvas.getContext('2d');
    this._pixelSizeInput.value = this._pixelSize;
    this._brushSizeInput.value = this._brushSize;
    this._toolSelect.value = this._tool;
    this._colorInput.value = this._rgbaToHex(this._brushColor);

    // wire small UI
    this._colorInput.addEventListener('input', (e) => {
      const rgba = this._hexToRgba(e.target.value);
      this.setBrushColor([rgba[0], rgba[1], rgba[2], 255]);
    });
    this._toolSelect.addEventListener('change', (e) => this.setTool(e.target.value));
    this._pixelSizeInput.addEventListener(
      'change',
      (e) => (this.pixelSize = Math.max(1, parseInt(e.target.value) || 1)),
    );
    this._brushSizeInput.addEventListener('change', (e) =>
      this.setBrushSize(Math.max(1, parseInt(e.target.value) || 1)),
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

    this._savePaletteBtn.addEventListener('click', () => {
      const name = prompt('Palette name:');
      if (!name) return;
      const colors = this._getColorsFromPaletteSelect() || [this._colorInput.value];
      this.addPalette({ name, colors });
    });
    this._addSwatchBtn.addEventListener('click', () => {
      const hex = this._colorInput.value;
      const sel = this._paletteSelect.value;
      if (!sel) {
        this.addPalette({ name: 'default', colors: [hex] });
      } else {
        const p = this._palettes.find((x) => x.name === sel);
        if (p && !p.colors.includes(hex)) {
          p.colors.push(hex);
          this._savePalettesToStorage();
          this._populatePaletteSelect();
        }
      }
    });

    this._paletteSelect.addEventListener('change', () => {
      this._applyPaletteToUI(this._paletteSelect.value);
    });

    // pointer events
    this._canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);

    // load palettes into UI
    this._populatePaletteSelect();

    // sizing & render
    this._resizeCanvas();
    this.render();
  }

  disconnectedCallback() {
    this._canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  // --------------- matrix & utils --------------
  _createEmptyMatrix(w, h) {
    const mat = new Array(h);
    for (let y = 0; y < h; y++) {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = [0, 0, 0, 0];
      mat[y] = row;
    }
    return mat;
  }

  createMatrix(width, height, fill = [0, 0, 0, 0]) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const mat = new Array(h);
    for (let y = 0; y < h; y++) {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = fill.slice();
      mat[y] = row;
    }
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
    this._matrix = matrix.map((row) => row.map((c) => c.slice()));
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
    const newMat = this.createMatrix(nw, nh, [0, 0, 0, 0]);
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

  // -------------- rendering ----------------
  _resizeCanvas() {
    this._canvas.width = this._width;
    this._canvas.height = this._height;
    this._canvas.style.width = `${this._width * this._pixelSize}px`;
    this._canvas.style.height = `${this._height * this._pixelSize}px`;
    this._frame.style.width = this._canvas.style.width;
    this._frame.style.height = this._canvas.style.height;
    this._ctx = this._canvas.getContext('2d');
    try {
      this._ctx.imageSmoothingEnabled = false;
    } catch (e) {}
  }

  render() {
    // guard: ensure matrix exists and matches width/height to avoid iterating undefined
    if (
      !Array.isArray(this._matrix) ||
      this._matrix.length !== this._height ||
      (this._matrix[0] && this._matrix[0].length !== this._width)
    ) {
      // create a valid empty matrix preserving nothing (safe fallback)
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
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const [r, g, b, a] = this._matrix[y][x];
        data[p++] = r;
        data[p++] = g;
        data[p++] = b;
        data[p++] = a;
      }
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

  // --------------- tools & brush ----------------
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

  // paint a square brush centered on x,y
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

  // --------------- pointer handling (drag painting) --------------
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
    this._canvas.setPointerCapture(evt.pointerId);
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
    } catch (e) {}
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

  // --------------- palettes (persistent) ----------------
  _loadPalettesFromStorage() {
    try {
      const raw = localStorage.getItem(this._palettesKey);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  _savePalettesToStorage() {
    try {
      localStorage.setItem(this._palettesKey, JSON.stringify(this._palettes));
    } catch (e) {
      console.warn('Could not save palettes', e);
    }
  }

  addPalette(palette) {
    // palette: {name, colors:["#rrggbb",...]}
    if (!palette || !palette.name) throw new TypeError('palette must have name');
    const exists = this._palettes.find((p) => p.name === palette.name);
    if (exists) {
      exists.colors = Array.from(new Set([...(exists.colors || []), ...(palette.colors || [])]));
    } else this._palettes.push({ name: palette.name, colors: (palette.colors || []).slice() });
    this._savePalettesToStorage();
    this._populatePaletteSelect();
    this.dispatchEvent(new CustomEvent('palettechange', { detail: { palettes: this._palettes } }));
  }

  getPalettes() {
    return JSON.parse(JSON.stringify(this._palettes));
  }

  _populatePaletteSelect() {
    const sel = this._paletteSelect;
    sel.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '(select palette)';
    sel.appendChild(defaultOption);
    for (const p of this._palettes) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      sel.appendChild(o);
    }
  }

  _applyPaletteToUI(name) {
    const p = this._palettes.find((x) => x.name === name);
    if (!p) return;
    this._paletteSelect.title = p.colors.join(', ');
  }

  _getColorsFromPaletteSelect() {
    const name = this._paletteSelect.value;
    if (!name) return null;
    const p = this._palettes.find((x) => x.name === name);
    return p ? p.colors.slice() : null;
  }

  // --------------- import/export JSON matrix ----------------
  exportMatrixJSON() {
    const payload = { width: this._width, height: this._height, matrix: this._matrix };
    return JSON.stringify(payload);
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

  // --------------- helpers ----------------
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

  // --------------- props ----------------
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

  // expose some methods for external use
  exportJSON() {
    return this.exportMatrixJSON();
  }
  importJSON(json) {
    return this.importMatrixJSON(json);
  }
  savePalettes() {
    this._savePalettesToStorage();
  }
  loadPalettes() {
    this._palettes = this._loadPalettesFromStorage();
    this._populatePaletteSelect();
  }
}

customElements.define('object-layer-engine', ObjectLayerEngineElement);

/* Example usage (in HTML)
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>ObjectLayerEngine</title></head>
  <body>
    <object-layer-engine id="ole" width="20" height="10" pixel-size="20"></object-layer-engine>

    <script type="module">
      import './ObjectLayerEngine.js';
      const e = document.getElementById('ole');

      // create a template 20x10, draw a 2x2 red square
      const template = e.createMatrix(20, 10, [0,0,0,0]);
      template[0][0] = [255,0,0,255];
      template[0][1] = [255,0,0,255];
      template[1][0] = [255,0,0,255];
      template[1][1] = [255,0,0,255];
      e.loadMatrix(template);

      // programmatic brush size
      e.setBrushSize(3);

      // export/import
      const json = e.exportJSON();
      // later: e.importJSON(json);

      // palettes
      e.addPalette({ name: 'my', colors: ['#ff0000','#00ff00'] });
      console.log(e.getPalettes());
    </script>
  </body>
</html>
*/
