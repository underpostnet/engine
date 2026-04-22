const PALETTE_COLUMNS = [
  { name: 'Red', hue: 0 },
  { name: 'Orange', hue: 28 },
  { name: 'Yellow', hue: 52 },
  { name: 'Lime', hue: 82 },
  { name: 'Green', hue: 132 },
  { name: 'Cyan', hue: 182 },
  { name: 'Blue', hue: 224 },
  { name: 'Violet', hue: 278 },
];

const PALETTE_LIGHTNESS = [88, 74, 60, 44, 28];
const PALETTE_SATURATION = 82;
const NEUTRAL_SWATCHES = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#000000' },
];

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = l - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = second;
  } else if (segment < 2) {
    red = second;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = second;
  } else if (segment < 4) {
    green = second;
    blue = chroma;
  } else if (segment < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }

  const r = clampChannel((red + match) * 255)
    .toString(16)
    .padStart(2, '0');
  const g = clampChannel((green + match) * 255)
    .toString(16)
    .padStart(2, '0');
  const b = clampChannel((blue + match) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

function normalizeHex(value) {
  const raw = String(value || '')
    .trim()
    .replace('#', '');
  if (/^[\da-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((char) => char + char)
      .join('')}`.toUpperCase();
  }
  if (/^[\da-fA-F]{6}$/.test(raw)) {
    return `#${raw}`.toUpperCase();
  }
  return null;
}

function buildPaletteRows() {
  return PALETTE_LIGHTNESS.map((lightness, rowIndex) =>
    PALETTE_COLUMNS.map((column) => ({
      name: `${column.name} ${rowIndex + 1}`,
      value: hslToHex(column.hue, PALETTE_SATURATION, lightness),
    })),
  );
}

const PALETTE_ROWS = buildPaletteRows();

class ColorPaletteElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._value = '#FF0000';
    this._disabled = false;
    this._handleClick = this._handleClick.bind(this);
  }

  static get observedAttributes() {
    return ['value', 'disabled'];
  }

  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === 'value') {
      this._setValue(newValue, { reflect: false, emit: false });
      return;
    }
    if (name === 'disabled') {
      this._disabled = newValue !== null;
      this._updateSelection();
    }
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.addEventListener('click', this._handleClick);
    this._setValue(this.getAttribute('value') || this._value, { reflect: false, emit: false });
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('click', this._handleClick);
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._setValue(value, { reflect: true, emit: false });
  }

  _setValue(value, { reflect, emit } = { reflect: true, emit: false }) {
    const normalized = normalizeHex(value);
    if (!normalized) {
      return;
    }
    const changed = normalized !== this._value;
    this._value = normalized;
    if (reflect && this.getAttribute('value') !== normalized) {
      this.setAttribute('value', normalized);
    }
    this._updateSelection();
    if (emit && changed) {
      const detail = { value: normalized, hex: normalized };
      this.dispatchEvent(new CustomEvent('colorchange', { detail }));
      this.dispatchEvent(new CustomEvent('change', { detail }));
    }
  }

  _handleClick(event) {
    const swatch = event.target.closest('button[data-color]');
    if (!swatch || this._disabled) {
      return;
    }
    this._setValue(swatch.dataset.color, { reflect: true, emit: true });
  }

  _updateSelection() {
    if (!this.shadowRoot) {
      return;
    }
    const swatches = this.shadowRoot.querySelectorAll('button[data-color]');
    swatches.forEach((swatch) => {
      const selected = swatch.dataset.color === this._value;
      swatch.toggleAttribute('data-selected', selected);
      swatch.setAttribute('aria-pressed', selected ? 'true' : 'false');
      swatch.disabled = this._disabled;
    });

    const currentValue = this.shadowRoot.querySelector('.current-value');
    if (currentValue) {
      currentValue.textContent = this._value;
    }
    const currentSwatch = this.shadowRoot.querySelector('.current-swatch');
    if (currentSwatch) {
      currentSwatch.style.background = this._value;
    }
  }

  render() {
    const gridMarkup = PALETTE_ROWS.map(
      (row) => `
        <div class="swatch-row">
          ${row
            .map(
              (swatch) => `
                <button
                  type="button"
                  class="swatch"
                  data-color="${swatch.value}"
                  title="${swatch.name} ${swatch.value}"
                  aria-label="${swatch.name} ${swatch.value}"
                  style="background:${swatch.value};"
                ></button>
              `,
            )
            .join('')}
        </div>
      `,
    ).join('');

    const neutralMarkup = NEUTRAL_SWATCHES.map(
      (swatch) => `
        <button
          type="button"
          class="swatch neutral-swatch"
          data-color="${swatch.value}"
          title="${swatch.name} ${swatch.value}"
          aria-label="${swatch.name} ${swatch.value}"
          style="background:${swatch.value};"
        ></button>
      `,
    ).join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }

        .palette {
          display: grid;
          gap: 10px;
          font-family: monospace;
          color: #d7d7d7;
        }

        .grid {
          display: grid;
          gap: 6px;
        }

        .swatch-row {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 6px;
        }

        .swatch {
          appearance: none;
          border: 2px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          cursor: pointer;
          display: block;
          min-height: 24px;
          padding: 0;
          position: relative;
          transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
          width: 100%;
        }

        .swatch:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.5);
        }

        .swatch[data-selected] {
          border-color: #ffffff;
          box-shadow: 0 0 0 2px rgba(28, 28, 28, 0.7), 0 0 0 4px rgba(255, 255, 255, 0.45);
        }

        .swatch[data-selected]::after {
          content: '';
          position: absolute;
          inset: 6px;
          border: 1px solid rgba(0, 0, 0, 0.45);
          border-radius: 5px;
        }

        .neutral-row {
          display: grid;
          gap: 6px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .current {
          align-items: center;
          display: flex;
          gap: 8px;
          font-size: 12px;
        }

        .current-swatch {
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 6px;
          height: 18px;
          width: 18px;
        }

        .current-label {
          color: #9f9f9f;
          text-transform: uppercase;
        }

        .swatch:disabled {
          cursor: default;
          opacity: 0.55;
          transform: none;
        }
      </style>
      <div class="palette">
        <div class="grid">${gridMarkup}</div>
        <div class="neutral-row">${neutralMarkup}</div>
        <div class="current">
          <div class="current-swatch"></div>
          <div><span class="current-label">Selected</span> <span class="current-value"></span></div>
        </div>
      </div>
    `;
    this._updateSelection();
  }
}

if (!customElements.get('color-palette')) {
  customElements.define('color-palette', ColorPaletteElement);
}

export { ColorPaletteElement };
