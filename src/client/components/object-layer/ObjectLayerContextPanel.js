/**
 * The context panel of the Object Layer editor: what the host's studio knows of the item being
 * painted, as titled sections. The studio builds the panel model; this mounts it. Text goes in as
 * text, never as markup.
 *
 * A panel model is `{ title, subtitle, sections, raw }`. A section is `{ id, title, open, items }`;
 * an item is `{ text }`, `{ label, value }` or `{ label, chips: [{ label, title }] }`.
 *
 * @module src/client/components/object-layer/ObjectLayerContextPanel.js
 */

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const itemNode = (item) => {
  if (item.text !== undefined) return element('p', 'ol-context-text', item.text);
  const row = element('div', 'ol-context-row');
  row.append(element('span', 'ol-context-label', item.label));
  if (item.chips) {
    const chips = element('span', 'ol-context-chips');
    for (const chip of item.chips) {
      const node = element('span', 'ol-context-chip', chip.label);
      if (chip.title) node.title = chip.title;
      chips.append(node);
    }
    row.append(chips);
  } else row.append(element('span', 'ol-context-value', item.value));
  return row;
};

const sectionNode = (title, open, children) => {
  const details = element('details', 'ol-context-section');
  details.open = !!open;
  details.append(element('summary', 'ol-context-summary', title), ...children);
  return details;
};

/**
 * Mounts a panel model into a container, replacing what it held.
 * @param {HTMLElement} container
 * @param {Object|null} panel - The studio's panel, or null when it knows nothing of the item.
 */
export function mountContextPanel(container, panel) {
  if (!container) return;
  container.replaceChildren();
  if (!panel) {
    container.append(element('div', 'ol-context-empty', 'No foundation definition carries this item label yet.'));
    return;
  }
  container.append(
    element('div', 'ol-context-title', panel.title),
    element('div', 'ol-context-subtitle', panel.subtitle),
  );
  for (const section of panel.sections)
    container.append(sectionNode(section.title, section.open, section.items.map(itemNode)));
  container.append(
    sectionNode('Raw JSON', false, [element('pre', 'ol-context-raw', JSON.stringify(panel.raw, null, 2))]),
  );
}

/** The styles of the panel, for the page that mounts it. */
export const contextPanelStyle = `
  .ol-context-title { font-size: 1.2rem; font-weight: bold; }
  .ol-context-subtitle, .ol-context-empty { font-size: 12px; opacity: 0.7; margin-bottom: 6px; }
  .ol-context-section { margin: 4px 0; padding: 4px 6px; border-left: 2px solid #444; }
  .ol-context-summary { cursor: pointer; font-weight: bold; }
  .ol-context-row { display: flex; gap: 8px; margin: 3px 0; font-size: 13px; }
  .ol-context-label { min-width: 150px; opacity: 0.7; }
  .ol-context-text { margin: 4px 0; font-size: 13px; }
  .ol-context-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .ol-context-chip { padding: 1px 6px; border-radius: 8px; background: rgba(127, 127, 127, 0.25); font-size: 12px; }
  .ol-context-raw { max-height: 280px; overflow: auto; font-size: 11px; }
`;
