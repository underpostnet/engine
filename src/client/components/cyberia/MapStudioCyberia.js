/**
 * The foundation panel of the Cyberia map editor: the context panel of the map, and the tracker of
 * its composition. The tracker lists each composed entity with its item ids and their item types,
 * and marks it met once the map holds one of its type and item ids.
 *
 * The map editor owns the entities. The panel reads them, and a click on an entry loads its entity
 * type and item ids into the editor's entity form.
 *
 * @module src/client/components/cyberia/MapStudioCyberia.js
 */
import { CyberiaMapService } from '../../services/cyberia-map/cyberia-map.service.js';
import { contextIcon, contextPanelStyle, mountContextPanel } from '../objectlayer-studio/ContextPanel.js';
import { mapContextPanel } from './FoundationContextCyberia.js';
import { trackComposition } from './MapPlacementCyberia.js';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const query = (selector) => document.querySelector(selector);

class MapStudioCyberia {
  static context = null;
  static editor = null;

  /** The containers of the panel, for the editor's markup. */
  static renderPanel() {
    return html`
      <style>
        .map-studio {
          text-align: left;
        }
        .map-studio-title {
          font-size: 1.1rem;
          font-weight: bold;
        }
        .map-studio-muted {
          font-size: 12px;
          opacity: 0.7;
        }
        .map-studio-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin: 4px 0;
        }
        .map-studio-entry {
          cursor: pointer;
          padding: 3px 4px;
        }
        .map-studio-entry:hover {
          background: rgba(127, 127, 127, 0.15);
        }
        .map-studio-state {
          color: var(--studio-accent-warm);
        }
        .map-studio-entry[data-met] .map-studio-state {
          color: var(--studio-positive);
        }
        .map-studio-tracker:not(:empty) {
          margin-top: 12px;
        }
        ${contextPanelStyle}
      </style>
      <div class="in studio-group map-studio">
        <div class="in studio-group-title">${contextIcon()} Foundation context</div>
        <div class="in map-studio-context"></div>
        <div class="in map-studio-tracker"></div>
      </div>
    `;
  }

  /**
   * Connects the panel to the map editor.
   * @param {{entities: Function, load: Function}} editor - `entities()` of the map editor, and
   *   `load(entity)`, which puts an entity type and its item ids in the entity form.
   */
  static mount(editor) {
    MapStudioCyberia.editor = editor;
  }

  /** Loads the foundation context of a map code, and shows its tracker. */
  static async loadContext(code) {
    MapStudioCyberia.context = null;
    if (code) {
      const { status, data } = await CyberiaMapService.getContext({ code });
      if (status === 'success') MapStudioCyberia.context = data;
    }
    MapStudioCyberia.renderContext();
    MapStudioCyberia.refresh();
  }

  /** Tracks the composition against the entities the editor holds now. */
  static refresh() {
    const root = query('.map-studio-tracker');
    if (!root) return;
    root.replaceChildren();
    const entries = trackComposition(
      MapStudioCyberia.context?.composition ?? [],
      MapStudioCyberia.editor?.entities() ?? [],
    );
    if (entries.length === 0) return;
    const met = entries.filter(({ placed }) => placed > 0).length;
    root.append(element('div', 'map-studio-title', `Composition · ${met} / ${entries.length}`));
    for (const entry of entries) {
      const row = element('div', 'map-studio-row map-studio-entry');
      row.toggleAttribute('data-met', entry.placed > 0);
      row.title = 'Load into the entity form';
      row.append(
        element('span', 'map-studio-state', entry.placed > 0 ? '✓' : '✗'),
        element('span', '', entry.name),
        element('span', 'map-studio-muted', `entity: ${entry.entity.entityType}`),
        element('span', '', entry.items.map(({ id, type }) => (type ? `${id} (${type})` : id)).join(' + ')),
        element('span', 'map-studio-muted', `${entry.placed} placed`),
      );
      row.onclick = () => MapStudioCyberia.editor?.load(entry.entity);
      root.append(row);
    }
  }

  static renderContext() {
    const { context } = MapStudioCyberia;
    mountContextPanel(
      query('.map-studio-context'),
      context && mapContextPanel(context),
      'Load a map to see its foundation context.',
    );
  }
}

export { MapStudioCyberia };
