/**
 * The palette panel of the Procedural Engine view: one palette editor for the run of a create, or
 * one for each selected item of an update. An editor starts from the defaults of its target, the
 * foundation palettes of an item where it has them, else its render or its Genesis Template. Its
 * dropdown applies a Palette Template, or a random one for each candidate. Any slot set wins. Every
 * color, slot, default and palette comes from the server.
 *
 * @module src/client/components/cyberia/ProceduralPaletteCyberia.js
 */
import { DropDown } from '../core/DropDown.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { s } from '../core/VanillaJs.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';
import { CyberiaProceduralProfileService } from '../../services/cyberia-procedural-profile/cyberia-procedural-profile.service.js';

/** The `paletteId` that gives each candidate a Palette Template the seed picks. */
const RANDOM_PALETTE = 'random';
/** The dropdown value that keeps the defaults of the target. */
const DEFAULTS = 'defaults';
/** Where the color of a slot comes from: an `auto` color moves with the palette variation. */
const ORIGINS = Object.freeze({
  palette: { label: 'palette', auto: false },
  foundation: { label: 'foundation', auto: false },
  render: { label: 'auto · render', auto: true },
  template: { label: 'auto · template', auto: true },
  random: { label: 'random', auto: true },
});

/** Swatches of colors, once each; the colors come from the server. */
export const swatches = (colors) =>
  [...new Set(colors)]
    .map((color) => `<span class="procedural-swatch" title="${color}" style="background: ${color}"></span>`)
    .join('');

const label = (id) => id.replace(/^./, (first) => first.toUpperCase());
const notify = (text, status = 'info') => NotificationManager.Push({ html: text, status });
const element = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (icon, text, title, onclick) => {
  const control = element('button', '', ` ${text}`);
  control.type = 'button';
  control.title = title;
  control.prepend(element('i', icon));
  control.onclick = onclick;
  return control;
};

/**
 * A palette target: the run of a create (`templateId`) or one item of an update (`itemId`), its
 * palette choice, the slots set, and the defaults the server answers for that choice.
 */
const target = (fields) => ({ paletteId: '', colors: {}, defaults: null, palettes: [], error: '', ...fields });

class ProceduralPalette {
  static catalog = { families: [], palettes: [] };
  /** The Genesis Templates of the server configuration. */
  static templates = [];
  static mode = '';
  /** The target of a create. */
  static run = null;
  /** The target of each selected item of an update, and the order of the selection. */
  static items = new Map();
  static order = [];

  static style = css`
    .procedural-palette-editor {
      padding: 8px;
      margin-bottom: 10px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
    }
    .procedural-palette-editor-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: center;
      margin-bottom: 8px;
    }
    .procedural-palette-editor-title {
      font-weight: bold;
      font-family: monospace;
    }
    .procedural-palette-editor-hint {
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.7;
    }
    .procedural-palette-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-left: auto;
    }
    .procedural-palette-tools > button {
      padding: 3px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    .procedural-slot-role {
      margin-bottom: 8px;
    }
    .procedural-slot-role-name {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .procedural-slots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }
    .procedural-slot {
      display: grid;
      grid-template-columns: 40px 1fr auto;
      gap: 2px 8px;
      align-items: center;
      padding: 6px;
      border: 1px solid var(--studio-subtle-border);
      border-radius: 6px;
    }
    .procedural-slot-swatch {
      grid-row: span 2;
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 4px;
      border: 1px solid var(--studio-subtle-border);
      background: var(--slot-color);
      cursor: pointer;
    }
    .procedural-slot[data-auto='true'] .procedural-slot-swatch {
      background: repeating-linear-gradient(45deg, var(--slot-color) 0 6px, transparent 6px 10px);
    }
    .procedural-slot-swatch > input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .procedural-slot-name {
      font-size: 13px;
    }
    .procedural-slot-value {
      font-size: 11px;
      font-family: monospace;
      opacity: 0.75;
    }
    .procedural-slot-clear {
      grid-row: span 2;
      padding: 2px 8px;
      cursor: pointer;
    }
    .procedural-slot-clear:disabled {
      opacity: 0.3;
      cursor: default;
    }
  `;

  /**
   * The panel, empty until {@link ProceduralPalette.setContext} names a mode.
   * @param {{templates: Object[], palettes: {families: string[], palettes: Object[]}}} config - The server configuration.
   * @returns {string}
   */
  static render(config) {
    Object.assign(ProceduralPalette, {
      catalog: config.palettes,
      templates: config.templates,
      mode: '',
      run: null,
      items: new Map(),
      order: [],
    });
    return html`<style>
        ${ProceduralPalette.style}
      </style>
      <div class="in procedural-palette"></div>`;
  }

  /**
   * Shows the editors of a mode. A create keeps its palette while its Genesis Template stays.
   * @param {{mode: string, template: Object|null}} context - The template of a create; null in an update.
   */
  static setContext({ mode, template }) {
    ProceduralPalette.mode = mode;
    if (mode === 'create-new' && template && ProceduralPalette.run?.templateId !== template.id) {
      ProceduralPalette.run = target({ key: 'run', templateId: template.id });
      ProceduralPalette.load(ProceduralPalette.run);
    }
    ProceduralPalette.layout();
  }

  /**
   * Gives an update the selected items. An item that stays keeps its palette; a new item reads its
   * defaults from the server.
   * @param {string[]} itemIds
   */
  static setItems(itemIds) {
    const { items } = ProceduralPalette;
    ProceduralPalette.order = [...itemIds];
    for (const itemId of [...items.keys()]) if (!itemIds.includes(itemId)) items.delete(itemId);
    for (const itemId of itemIds.filter((id) => !items.has(id))) {
      items.set(itemId, target({ key: itemId, itemId }));
      ProceduralPalette.load(items.get(itemId));
    }
    ProceduralPalette.layout();
  }

  static reset() {
    Object.assign(ProceduralPalette, { mode: '', run: null, items: new Map(), order: [] });
  }

  /** The palette of the request: the choice of each item of an update, or the choice of the run of a create. */
  static request() {
    const choice = ({ paletteId, colors }) => ({ ...(paletteId && { paletteId }), slots: { ...colors } });
    if (ProceduralPalette.mode !== 'update-existing') return ProceduralPalette.run ? choice(ProceduralPalette.run) : {};
    return {
      items: ProceduralPalette.targets()
        .filter(({ paletteId, colors }) => paletteId || Object.keys(colors).length > 0)
        .map((entry) => ({ itemId: entry.itemId, ...choice(entry) })),
    };
  }

  /** The targets the mode shows, in order. */
  static targets() {
    const { mode, run, items, order } = ProceduralPalette;
    if (mode === 'create-new') return run ? [run] : [];
    return mode === 'update-existing' ? order.map((itemId) => items.get(itemId)).filter(Boolean) : [];
  }

  /** Places the editor of each target the mode shows. */
  static layout() {
    const container = s('.procedural-palette');
    if (!container) return;
    const targets = ProceduralPalette.targets();
    if (targets.length === 0 && ProceduralPalette.mode === 'update-existing')
      return container.replaceChildren(
        element('div', 'procedural-muted', 'Select existing items to edit the palette of each one.'),
      );
    container.replaceChildren(...targets.map((entry) => (entry.host ??= element('div', 'procedural-palette-editor'))));
    for (const entry of targets) if (!entry.painted) ProceduralPalette.paint(entry);
  }

  /** The Palette Template whose defaults a target shows: none for a random choice. */
  static defaultsFor = ({ paletteId }) => (paletteId === RANDOM_PALETTE ? '' : paletteId);

  /** Reads the defaults of a target for its palette choice. */
  static async load(entry) {
    const ticket = (entry.ticket = (entry.ticket ?? 0) + 1);
    const paletteId = ProceduralPalette.defaultsFor(entry);
    Object.assign(entry, { defaults: null, error: '' });
    ProceduralPalette.paint(entry);
    const { status, data, message } = entry.itemId
      ? await CyberiaProceduralJobService.getSourcePalette({ itemId: entry.itemId, paletteId })
      : await CyberiaProceduralProfileService.getTemplatePalette({ id: entry.templateId, paletteId });
    if (ticket !== entry.ticket) return;
    if (status === 'success')
      Object.assign(entry, {
        templateId: data.templateId,
        palettes: data.palettes,
        defaults: data.slots,
        loadedFor: paletteId,
      });
    else entry.error = message ?? 'the server did not answer';
    ProceduralPalette.paint(entry);
  }

  /** Applies a palette choice to a target: its slots go back to the defaults of that choice. */
  static choose(entry, paletteId) {
    if (paletteId === entry.paletteId) return;
    Object.assign(entry, { paletteId, colors: {} });
    if (entry.defaults && entry.loadedFor === ProceduralPalette.defaultsFor(entry)) ProceduralPalette.paint(entry);
    else ProceduralPalette.load(entry);
  }

  /** The dropdown entries of a target: its defaults, a random palette, then the palettes that fit its template. */
  static choices(entry, template) {
    const option = (value, display) => ({
      value,
      display,
      data: value,
      onClick: () => ProceduralPalette.choose(entry, value === DEFAULTS ? '' : value),
    });
    const fitting = new Set(template.palettes);
    const data = [
      option(DEFAULTS, entry.palettes.length > 0 ? 'Foundation palette' : 'Default colors'),
      option(RANDOM_PALETTE, 'Random template for each candidate'),
    ];
    for (const family of ProceduralPalette.catalog.families) {
      const members = ProceduralPalette.catalog.palettes.filter(
        (palette) => palette.family === family && fitting.has(palette.id),
      );
      if (members.length === 0) continue;
      data.push({ kind: 'group', value: `group-${family}`, display: label(family) });
      for (const palette of members)
        data.push(option(palette.id, `${swatches(Object.values(palette.roles))} ${palette.name}`));
    }
    return data;
  }

  /** Draws the editor of a target in the page: its head, its palette dropdown and tools, and its slots by role. */
  static async paint(entry) {
    entry.painted = Boolean(entry.host?.isConnected);
    if (!entry.painted) return;
    const ticket = (entry.paintTicket = (entry.paintTicket ?? 0) + 1);
    const head = element('div', 'procedural-palette-editor-head');
    head.append(element('span', 'procedural-palette-editor-title', entry.itemId ?? 'New items'));
    if (entry.error)
      return entry.host.replaceChildren(
        head,
        element('div', 'procedural-bad', `The palette did not load: ${entry.error}`),
      );
    if (!entry.defaults)
      return entry.host.replaceChildren(head, element('div', 'procedural-muted', 'Loading the palette…'));
    const template = ProceduralPalette.templates.find(({ id }) => id === entry.templateId);
    const names = entry.palettes.map(({ name, group }) => `${name} (${group})`).join(', ');
    head.append(
      element(
        'span',
        'procedural-muted',
        entry.itemId
          ? `${template.id} · ${names ? `foundation palettes: ${names}` : 'no foundation palette'}`
          : template.name,
      ),
    );
    const choice = element('div', '');
    const dropdown = await DropDown.instance({
      id: `procedural-palette-${entry.key}`,
      label: html`<i class="fa-solid fa-palette"></i> Palette`,
      data: ProceduralPalette.choices(entry, template),
      value: entry.paletteId || DEFAULTS,
      containerClass: 'inl',
      disableSelectOptionsLabel: true,
    });
    if (ticket !== entry.paintTicket) return;
    choice.innerHTML = dropdown;
    const tools = element('div', 'procedural-palette-tools');
    head.append(choice, tools);
    const cards = [];
    const hint = element('div', 'procedural-palette-editor-hint');
    const repaint = () => {
      for (const paintCard of cards) paintCard();
      const set = Object.keys(entry.colors).length;
      hint.textContent =
        set > 0
          ? `${set} of ${template.slots.length} slots set. The other slots take their default.`
          : entry.paletteId === RANDOM_PALETTE
            ? 'Each candidate takes a palette template the seed picks. Pick a color to set a slot over it.'
            : 'Palette and foundation colors stay as they are; auto colors move with the variation. Pick a color to set a slot.';
    };
    tools.append(
      button('fa-solid fa-dice', 'Random colors', 'Set every slot to random colors in one color scheme.', async () => {
        const { status, data, message } = await CyberiaProceduralProfileService.getRandomSlots({ id: template.id });
        if (status !== 'success') return notify(message, 'error');
        entry.colors = data.slots;
        repaint();
      }),
      button('fa-solid fa-eraser', 'Reset', 'Give every slot its default again.', () => {
        entry.colors = {};
        repaint();
      }),
    );
    const groups = [...new Set(template.slots.map((slot) => slot.role))].map((role) => {
      const group = element('div', 'procedural-slot-role');
      const regions = template.roles[role]?.regions ?? [];
      group.innerHTML = `<div class="procedural-slot-role-name">${label(role)}${regions.length > 1 ? ` <span class="procedural-muted">${regions.join(', ')}</span>` : ''}</div><div class="procedural-slots"></div>`;
      for (const slot of template.slots.filter((candidate) => candidate.role === role)) {
        const fallback = entry.defaults[slot.id];
        const { card, paint } = ProceduralPalette.slotCard(
          slot,
          entry,
          entry.paletteId === RANDOM_PALETTE ? { color: fallback.color, origin: 'random' } : fallback,
          repaint,
        );
        cards.push(paint);
        group.querySelector('.procedural-slots').append(card);
      }
      return group;
    });
    entry.host.replaceChildren(head, ...groups, hint);
    repaint();
  }

  /** The card of one slot: the color set, or its default and where it comes from, and a reset button. */
  static slotCard(slot, entry, fallback, repaint) {
    const card = element('div', 'procedural-slot');
    card.innerHTML = `<label class="procedural-slot-swatch" title="Pick the ${slot.id} color">
        <input type="color" aria-label="${slot.id} color" />
      </label>
      <div class="procedural-slot-name">${slot.id === slot.role ? 'Color' : label(slot.tone)}</div>
      <button type="button" class="procedural-slot-clear" title="Give the slot its default again">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <div class="procedural-slot-value"></div>`;
    card.querySelector('input').oninput = ({ target: input }) => {
      entry.colors = { ...entry.colors, [slot.id]: input.value };
      repaint();
    };
    card.querySelector('.procedural-slot-clear').onclick = () => {
      const { [slot.id]: cleared, ...rest } = entry.colors;
      entry.colors = rest;
      repaint();
    };
    const paint = () => {
      const color = entry.colors[slot.id];
      const origin = ORIGINS[fallback.origin];
      const shown = color ?? fallback.color;
      card.dataset.auto = String(!color && origin.auto);
      card.querySelector('.procedural-slot-swatch').style.setProperty('--slot-color', shown);
      if (card.querySelector('input').value !== shown) card.querySelector('input').value = shown;
      card.querySelector('.procedural-slot-clear').disabled = !color;
      card.querySelector('.procedural-slot-value').textContent = color ?? `${origin.label} ${fallback.color}`;
    };
    return { card, paint };
  }
}

export { ProceduralPalette };
