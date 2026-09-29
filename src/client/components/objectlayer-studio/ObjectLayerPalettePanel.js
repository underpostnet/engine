/**
 * The palette panel of the Object Layer editor: palettes by group, colors by role. A palette is
 * authoring guidance, never render content. A swatch picks the brush color; the panel's
 * operations paint the editor through its region commands, so each one is one undo step.
 *
 * Groups: `biome` and `foundation` palettes come from the host's studio; `custom` and `recent`
 * stay in this browser. Click picks the brush color, Shift+click locks a color against apply and
 * swap, Alt+click marks it for swap and ramp.
 *
 * @module src/client/components/objectlayer-studio/ObjectLayerPalettePanel.js
 */
import { colorRamp, paletteApply, paletteSwap, scatterRegion } from './PixelRegion.js';
import { hexToRgba, rgbaToHex } from './RenderSource.js';

const GROUPS = Object.freeze([
  ['biome', 'Biome palette'],
  ['foundation', 'Foundation palette'],
  ['custom', 'Custom palette'],
  ['recent', 'Recent'],
]);
const RECENT_LIMIT = 16;
const STORAGE_KEY = 'object-layer-palettes';

/** The six-digit form of a color, as the panel keys it. */
const opaque = (hex) => hex.slice(0, 7).toLowerCase();

const readStored = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
};

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

class ObjectLayerPalettePanel {
  /**
   * @param {{container: HTMLElement, editor: HTMLElement}} params - The container and the
   *   `object-layer-engine` element it paints.
   */
  constructor({ container, editor }) {
    this.container = container;
    this.editor = editor;
    this.studioPalettes = [];
    const stored = readStored();
    this.custom = stored.custom ?? [];
    this.recent = stored.recent ?? [];
    this.activeId = null;
    this.locked = new Set();
    this.marked = [];
    this.render();
  }

  /** Sets the palettes the studio offers: `{ id, name, group, roles: { role: ['#rrggbb'] } }`. */
  setPalettes(palettes = []) {
    this.studioPalettes = palettes;
    if (!this.palettes().some(({ id }) => id === this.activeId)) this.activeId = this.palettes()[0]?.id ?? null;
    this.render();
  }

  /** Every palette, studio palettes first. */
  palettes() {
    return [
      ...this.studioPalettes,
      { id: 'custom', name: 'Custom', group: 'custom', roles: { base: this.custom } },
      { id: 'recent', name: 'Recent', group: 'recent', roles: { base: this.recent } },
    ];
  }

  /** The roles of the palette in use, for templates and operations. */
  activeRoles() {
    return this.palettes().find(({ id }) => id === this.activeId)?.roles ?? {};
  }

  /** The studio palette in use, else the first studio palette with a color; null when the studio offers none. */
  studioPalette() {
    const usable = this.studioPalettes.filter(({ roles }) => Object.values(roles ?? {}).some((hexes) => hexes.length));
    return usable.find(({ id }) => id === this.activeId) ?? usable[0] ?? null;
  }

  _activeColors() {
    const colors = this.marked.length > 0 ? this.marked : Object.values(this.activeRoles()).flat();
    return [...new Set(colors.map(opaque))].map(hexToRgba);
  }

  _store() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ custom: this.custom, recent: this.recent }));
    } catch {
      // A browser without storage keeps the palettes for this page only.
    }
  }

  _remember(hex) {
    this.recent = [opaque(hex), ...this.recent.filter((entry) => entry !== opaque(hex))].slice(0, RECENT_LIMIT);
    this._store();
  }

  _pick(hex, event) {
    const key = opaque(hex);
    if (event.shiftKey) {
      if (this.locked.has(key)) this.locked.delete(key);
      else this.locked.add(key);
    } else if (event.altKey) {
      this.marked = this.marked.includes(key)
        ? this.marked.filter((entry) => entry !== key)
        : [...this.marked, key].slice(-2);
    } else {
      const alpha = this.editor.getBrushAlpha?.() ?? 255;
      const [r, g, b] = hexToRgba(key);
      this.editor.setBrushColor([r, g, b, alpha]);
      this._remember(key);
    }
    this.render();
  }

  _operate(name, transform) {
    this.editor.transformRegion(name, transform);
  }

  /** Moves the region's colors to the nearest colors in use, locked colors left as they are. */
  applyToRegion() {
    const locked = [...this.locked].map(hexToRgba);
    const palette = this._activeColors();
    this._operate('PaletteApply', (frame, cells) => paletteApply(frame, cells, palette, { locked }));
  }

  /** Swaps the two marked colors inside the region, whatever their alpha. */
  swapMarked() {
    if (this.marked.length !== 2 || this.marked.some((hex) => this.locked.has(hex))) return;
    const [a, b] = this.marked.map(hexToRgba);
    this._operate('PaletteSwap', (frame, cells) => {
      const alphas = new Set(frame.flat().map((cell) => cell[3]));
      const pairs = [...alphas].flatMap((alpha) => [
        [
          [...a.slice(0, 3), alpha],
          [...b.slice(0, 3), alpha],
        ],
        [
          [...b.slice(0, 3), alpha],
          [...a.slice(0, 3), alpha],
        ],
      ]);
      return paletteSwap(frame, cells, pairs);
    });
  }

  /** Replaces the brush color inside the region with the first marked color. */
  replaceBrush() {
    const [target] = this.marked;
    if (!target) return;
    const brush = this.editor.getBrushColor();
    const [r, g, b] = hexToRgba(target);
    this._operate('PaletteReplace', (frame, cells) => paletteSwap(frame, cells, [[brush, [r, g, b, brush[3]]]]));
  }

  /** Paints a share of the region with the marked colors, or the palette in use. */
  scatter(density, seed) {
    const colors = this._activeColors();
    this._operate('ScatterRegion', (frame, cells) => scatterRegion(frame, cells, colors, { density, seed }));
  }

  /** Adds the ramp between the two marked colors to the custom palette. */
  ramp(steps) {
    if (this.marked.length !== 2) return;
    const [from, to] = this.marked.map(hexToRgba);
    const ramp = colorRamp(from, to, steps).map((rgba) => opaque(rgbaToHex(rgba)));
    this.custom = [...new Set([...this.custom, ...ramp])];
    this._store();
    this.render();
  }

  /** Adds the brush color to the custom palette. */
  keepBrush() {
    this.custom = [...new Set([...this.custom, opaque(rgbaToHex(this.editor.getBrushColor()))])];
    this._store();
    this.render();
  }

  render() {
    const root = this.container;
    if (!root) return;
    root.replaceChildren();
    for (const [group, title] of GROUPS) {
      const palettes = this.palettes().filter((palette) => palette.group === group);
      if (palettes.every(({ roles }) => Object.values(roles).flat().length === 0)) continue;
      root.append(element('div', 'ol-palette-group', title));
      for (const palette of palettes) {
        const head = element('label', 'ol-palette-head');
        const use = element('input');
        use.type = 'radio';
        use.name = 'ol-palette-in-use';
        use.checked = palette.id === this.activeId;
        use.onchange = () => {
          this.activeId = palette.id;
          this.render();
        };
        head.append(use, element('span', '', palette.name));
        root.append(head);
        for (const [role, colors] of Object.entries(palette.roles)) {
          if (colors.length === 0) continue;
          const row = element('div', 'ol-palette-row');
          row.append(element('span', 'ol-palette-role', role));
          for (const hex of colors) {
            const key = opaque(hex);
            const swatch = element('button', 'ol-palette-swatch');
            swatch.type = 'button';
            swatch.style.background = key;
            swatch.title = `${key}${this.locked.has(key) ? ' · locked' : ''}`;
            swatch.toggleAttribute('data-locked', this.locked.has(key));
            swatch.toggleAttribute('data-marked', this.marked.includes(key));
            swatch.onclick = (event) => this._pick(key, event);
            row.append(swatch);
          }
          root.append(row);
        }
      }
    }
    const controls = element('div', 'ol-palette-controls');
    const density = Object.assign(element('input'), { type: 'number', min: 0, max: 1, step: 0.05, value: 0.3 });
    const seed = Object.assign(element('input'), { type: 'number', min: 1, step: 1, value: 1 });
    const steps = Object.assign(element('input'), { type: 'number', min: 2, max: 16, step: 1, value: 5 });
    const button = (label, title, action) => {
      const node = element('button', 'ol-palette-action', label);
      node.type = 'button';
      node.title = title;
      node.onclick = action;
      return node;
    };
    controls.append(
      button('Apply', 'Move the selection to the nearest colors in use', () => this.applyToRegion()),
      button('Swap', 'Swap the two marked colors in the selection', () => this.swapMarked()),
      button('Replace', 'Replace the brush color in the selection with the marked color', () => this.replaceBrush()),
      element('span', 'ol-palette-label', 'density'),
      density,
      element('span', 'ol-palette-label', 'seed'),
      seed,
      button('Scatter', 'Paint a share of the selection with the marked colors, else the palette', () =>
        this.scatter(Number(density.value), Number(seed.value)),
      ),
      element('span', 'ol-palette-label', 'steps'),
      steps,
      button('Ramp', 'Add the ramp between the two marked colors to the custom palette', () =>
        this.ramp(Number(steps.value)),
      ),
      button('Keep', 'Add the brush color to the custom palette', () => this.keepBrush()),
    );
    root.append(
      controls,
      element('div', 'ol-palette-hint', 'Click: brush · Shift+click: lock · Alt+click: mark for swap and ramp'),
    );
  }
}

/** The styles of the panel, for the page that mounts it. */
const palettePanelStyle = `
  .ol-palette-group { margin-top: 6px; font-weight: bold; }
  .ol-palette-head { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
  .ol-palette-row { display: flex; align-items: center; gap: 3px; margin: 2px 0 2px 18px; flex-wrap: wrap; }
  .ol-palette-role { width: 70px; font-size: 12px; opacity: 0.7; }
  .ol-palette-swatch { width: 22px; height: 22px; border: 1px solid rgba(127, 127, 127, 0.6); border-radius: 3px; cursor: pointer; padding: 0; }
  .ol-palette-swatch[data-marked] { outline: 2px solid #4caf50; outline-offset: 1px; }
  .ol-palette-swatch[data-locked] { box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.6); }
  .ol-palette-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .ol-palette-controls input { width: 6ch; }
  .ol-palette-label, .ol-palette-hint { font-size: 12px; opacity: 0.7; }
`;

export { ObjectLayerPalettePanel, palettePanelStyle };
