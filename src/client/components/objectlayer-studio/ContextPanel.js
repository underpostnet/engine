/**
 * The context panel of the Studio: what a host's studio knows of the item or map on screen, as
 * titled sections. The editors and the viewer mount the same panel. The studio builds the panel
 * model; this mounts it. Text goes in as text, never as markup.
 *
 * A panel model is `{ title, subtitle, badges, sections, raw }`; `raw` is optional. A badge is
 * `{ label, title, color }`. A section is `{ id, title, open, items }`; an item is `{ text }`,
 * `{ label, value }`, `{ label, chips: [{ label, title }] }` or `{ label, swatches: [{ color, title }] }`.
 * A click on a swatch copies its color as the editor's hex field takes it.
 *
 * @module src/client/components/objectlayer-studio/ContextPanel.js
 */
import { NotificationManager } from '../core/NotificationManager.js';
import { getProxyPath } from '../core/Router.js';
import { copyData } from '../core/VanillaJs.js';
import { hexToRgba, rgbaToHex } from './RenderSource.js';

/** The URL of the foundation context icon. */
export const contextIconSrc = () => `${getProxyPath()}assets/ui-icons/lore.png`;

/** The foundation context icon, for a title that names the panel. */
export const contextIcon = () => html`<img class="ol-context-icon" src="${contextIconSrc()}" alt="" />`;

/** A color as the Object Layer editor's hex field takes it: `#RRGGBBAA`. */
const editorHex = (color) => rgbaToHex(hexToRgba(color)).toUpperCase();

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const listNode = (entries, nodeOf) => {
  const list = element('span', 'ol-context-chips');
  list.append(...entries.map(nodeOf));
  return list;
};

const chipNode = ({ label, title }) => {
  const node = element('span', 'ol-context-chip', label);
  if (title) node.title = title;
  return node;
};

const swatchNode = ({ color, title }) => {
  const hex = editorHex(color);
  const node = element('button', 'ol-context-swatch');
  node.type = 'button';
  node.style.background = color;
  node.title = `${title} · click to copy ${hex}`;
  node.setAttribute('aria-label', `Copy ${hex}`);
  node.onclick = () =>
    copyData(hex).then(
      () => NotificationManager.Push({ html: `Copied ${hex}`, status: 'success' }),
      () => NotificationManager.Push({ html: `Could not copy ${hex}`, status: 'error' }),
    );
  return node;
};

const itemNode = (item) => {
  if (item.text !== undefined) return element('p', 'ol-context-text', item.text);
  const row = element('div', 'ol-context-row');
  row.append(element('span', 'ol-context-label', item.label));
  if (item.chips) row.append(listNode(item.chips, chipNode));
  else if (item.swatches) row.append(listNode(item.swatches, swatchNode));
  else row.append(element('span', 'ol-context-value', item.value));
  return row;
};

const sectionNode = ({ title, open, items }, children) => {
  const details = element('details', 'ol-context-section');
  details.open = !!open;
  const summary = element('summary', 'ol-context-summary', title);
  if (!open && items.length) summary.append(element('span', 'ol-context-count', String(items.length)));
  const body = element('div', 'ol-context-body');
  body.append(...children);
  details.append(summary, body);
  return details;
};

/**
 * Mounts a panel model into a container, replacing what it held.
 * @param {HTMLElement} container
 * @param {Object|null} panel - The studio's panel, or null when it knows nothing of the target.
 * @param {string} [empty] - What a null panel says; without it the container stays empty.
 */
export function mountContextPanel(container, panel, empty = '') {
  if (!container) return;
  container.replaceChildren();
  if (!panel) {
    if (empty) container.append(element('div', 'ol-context-empty', empty));
    return;
  }
  const root = element('div', 'ol-context');
  const head = element('div', 'ol-context-head');
  head.append(element('div', 'ol-context-title', panel.title), element('div', 'ol-context-subtitle', panel.subtitle));
  if (panel.badges?.length) {
    const badges = element('div', 'ol-context-badges');
    for (const badge of panel.badges) {
      const node = element('span', 'ol-context-badge', badge.label);
      node.title = badge.title;
      node.style.background = badge.color;
      badges.append(node);
    }
    head.append(badges);
  }
  root.append(head);
  for (const section of panel.sections) root.append(sectionNode(section, section.items.map(itemNode)));
  if (panel.raw !== undefined)
    root.append(
      sectionNode({ title: 'Raw JSON', open: false, items: [] }, [
        element('pre', 'ol-context-raw', JSON.stringify(panel.raw, null, 2)),
      ]),
    );
  container.append(root);
}

/** The styles of the panel, for the page that mounts it. Its cards read the studio theme tokens. */
export const contextPanelStyle = `
  .ol-context { display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .ol-context-head { display: flex; flex-direction: column; gap: 4px; }
  .ol-context-title { font-size: 1.2rem; font-weight: bold; }
  .ol-context-subtitle { font-size: 12px; opacity: 0.7; }
  .ol-context-empty { font-size: 13px; opacity: 0.7; padding: 8px 0; }
  .ol-context-badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .ol-context-badge { color: #fff; padding: 2px 10px; border-radius: 8px; font-size: 15px; font-weight: bold; }
  .ol-context-section {
    background: var(--studio-card, transparent);
    border: 1px solid var(--studio-subtle-border, rgba(127, 127, 127, 0.3));
    border-radius: 8px;
  }
  .ol-context-summary {
    cursor: pointer;
    padding: 10px 16px;
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .ol-context-section[open] > .ol-context-summary {
    border-bottom: 1px solid var(--studio-subtle-border, rgba(127, 127, 127, 0.3));
  }
  .ol-context-count { margin-left: 8px; font-size: 12px; font-weight: normal; letter-spacing: 0; opacity: 0.7; }
  .ol-context-body { padding: 8px 16px 12px; }
  .ol-context-text { margin: 4px 0; font-size: 13px; line-height: 1.4; }
  .ol-context-row { display: flex; flex-wrap: wrap; column-gap: 12px; row-gap: 2px; padding: 3px 0; font-size: 13px; }
  .ol-context-label { flex: 0 0 150px; opacity: 0.7; }
  .ol-context-value { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
  .ol-context-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; flex: 1 1 200px; min-width: 0; }
  .ol-context-chip {
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 12px;
    background: var(--studio-tag, rgba(127, 127, 127, 0.25));
    color: var(--studio-tag-ink, inherit);
  }
  .ol-context-swatch {
    appearance: none;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid rgba(127, 127, 127, 0.6);
    border-radius: 3px;
    cursor: copy;
  }
  .ol-context-swatch:hover,
  .ol-context-swatch:focus-visible { outline: 2px solid var(--studio-accent, currentColor); outline-offset: 1px; }
  .ol-context-icon { width: 1.25em; height: 1.25em; vertical-align: middle; image-rendering: pixelated; }
  .ol-context-raw { margin: 0; max-height: 280px; overflow: auto; font-size: 11px; }
`;
