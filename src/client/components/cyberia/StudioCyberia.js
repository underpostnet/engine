/**
 * The Cyberia Studio menu: its editors, the icon of each one, the drawer entry whose submenu opens
 * them, the landing that shows them as cards, and the banner of an editor the Procedural Engine opens.
 *
 * @module src/client/components/cyberia/StudioCyberia.js
 */
import { Modal } from '../core/Modal.js';
import { getProxyPath, setPath, setQueryParams } from '../core/Router.js';
import { Translate } from '../core/Translate.js';
import { escapeHtml, s } from '../core/VanillaJs.js';

const STUDIO_ROUTE = 'cyberia-studio';
const STUDIO_ICON = 'cyberia-red-white.png';

/** The editors of the Studio submenu, each with its own icon and what its landing card says. */
const VIEWS = Object.freeze([
  {
    route: 'object-layer-engine',
    icon: 'engine.png',
    description: 'Paint the frames of an item, with its foundation context, palettes and templates',
  },
  { route: 'object-layer-engine-management', icon: 'stack.png', hidden: true },
  {
    route: 'object-layer-engine-viewer',
    icon: 'object-layer.png',
    description: 'Browse every item: its render, stats, identity and sagas',
  },
  {
    route: 'cyberia-procedural-engine',
    icon: 'reload.png',
    description: 'Generate batches of item variants in the background, then review, edit and approve each one',
  },
  {
    route: 'cyberia-map-engine',
    icon: 'map.png',
    description: 'Place the entities of a map and track its foundation composition',
  },
  {
    route: 'cyberia-universe-engine',
    icon: 'star.png',
    description: 'Gather worlds into a universe: their graph, routes and live servers',
  },
  {
    route: 'cyberia-instance-engine',
    icon: 'grid.png',
    description: 'Connect maps into a world: portals, layout, spawn and instance settings',
  },
  {
    route: 'cyberia-economy-engine',
    icon: 'coins.png',
    description: 'Set the wallet, fees, coin rules and item policies of the economies worlds run',
  },
  {
    route: 'cyberia-market-engine',
    icon: 'market.png',
    description: 'Set the shared markets terminals open: scope, modes, durations, auction rules, fees and limits',
  },
  {
    route: 'cyberia-action-engine',
    icon: 'quest.png',
    description: 'Author the quests, actions, dialogues and skills a map offers',
  },
  {
    route: 'cyberia-entity-engine',
    icon: 'character.png',
    description: 'Wire entity-type defaults: live, dead, drop and inventory items',
  },
  {
    route: 'cyberia-item-catalog',
    icon: 'registry.png',
    description: 'See and change the exact definition the runtime runs for each item',
  },
  {
    route: 'cyberia-player-manager',
    icon: 'users.png',
    description: 'See player profiles and their live sessions: save health, worlds and operator actions',
  },
]);

const iconImage = (icon) => html`<img class="inl cyberia-menu-icon" src="${getProxyPath()}assets/ui-icons/${icon}" />`;

class StudioCyberia {
  /**
   * The Studio drawer entry: the landing view, and a submenu entry for each editor.
   * @param {Object.<string, Function>} views - The view options of each editor, by route.
   * @returns {import('../core/ShellNavigation.js').ShellNavigationEntry}
   */
  static navigationEntry(views) {
    return {
      id: STUDIO_ROUTE,
      image: STUDIO_ICON,
      submenu: true,
      view: () => ({ observer: true, html: async () => StudioCyberia.renderLanding() }),
      children: VIEWS.map(({ route, icon, hidden }) => ({ id: route, image: icon, hidden, view: views[route] })),
    };
  }

  /**
   * Opens the editor of `route` on what `queryParams` names.
   * @param {string} route - A route of the Studio submenu.
   * @param {Object.<string, string>} queryParams - What the editor loads, such as `{ instanceCode }`.
   * @returns {boolean} Whether the host offers the editor.
   */
  static open(route, queryParams) {
    const entry = s(`.main-btn-${route}`);
    if (!entry) return false;
    setPath(`${getProxyPath()}${route}`);
    setQueryParams(queryParams, { replace: true });
    entry.click();
    return true;
  }

  /**
   * Shows the banner of an editor the Procedural Engine opened: what it edits, the state of what it
   * shows, what a save does, its actions and the way back without a save. No context hides it.
   * @param {HTMLElement|null} banner - A `.studio-context` element of the editor.
   * @param {{label:string, note:string, state?:{text:string, tone?:'warn'|'good'}, actions?:Array<{label:string,
   *   icon:string, run:()=>void}>, back:()=>void}|null} context
   */
  static paintContext(banner, context) {
    if (!banner) return;
    banner.hidden = !context;
    banner.context = context;
    if (!context) return;
    const { label, note, state, actions = [] } = context;
    // A repaint keeps the buttons in place, so a click that blurs a field of the form still lands.
    const structure = JSON.stringify([label, note, actions.map(({ label: text, icon }) => [text, icon])]);
    if (banner.dataset.structure !== structure) {
      banner.dataset.structure = structure;
      banner.innerHTML = html`<span class="studio-context-label"
          ><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${escapeHtml(label)}</span
        >
        <span class="studio-context-state"></span>
        <span class="studio-context-note">${escapeHtml(note)}</span>
        ${actions
          .map(
            ({ label: text, icon }, index) =>
              html`<button type="button" class="studio-context-action" data-action="${index}">
                <i class="${icon}" aria-hidden="true"></i> ${escapeHtml(text)}
              </button>`,
          )
          .join('')}
        <button type="button" class="studio-context-back">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back without saving
        </button>`;
      for (const button of banner.querySelectorAll('.studio-context-action'))
        button.onclick = () => banner.context.actions[Number(button.dataset.action)].run();
      banner.querySelector('.studio-context-back').onclick = () => banner.context.back();
    }
    const badge = banner.querySelector('.studio-context-state');
    badge.hidden = !state;
    badge.textContent = state?.text ?? '';
    badge.className = `studio-context-state${state?.tone ? ` studio-context-${state.tone}` : ''}`;
  }

  /**
   * The label of a preview a Studio shows in the context of a population: where its picture comes from,
   * or why there is none. `picture` is what the population service answers, or null while it loads.
   * @param {{state:'ready'|'empty'|'stale'|'failed', message?:string}|null} picture
   * @param {'draft'|'persisted'} source - The source of the preview in the working graph.
   * @returns {string}
   */
  static previewLabel(picture, source) {
    if (!picture) return 'Loading preview…';
    if (picture.state === 'ready') return source === 'draft' ? 'Draft preview' : 'Persisted preview';
    if (picture.state === 'empty') return source === 'draft' ? 'Draft preview · empty' : 'Persisted preview · empty';
    if (picture.state === 'stale') return 'Preview pending: the population moved on';
    return `Preview unavailable${picture.message ? ` · ${picture.message}` : ''}`;
  }

  /** Renders each open editor again, so what it offers follows the role of the session. */
  static async reload() {
    for (const { route } of VIEWS) {
      const idModal = `modal-${route}`;
      if (s(`.${idModal}`)) Modal.writeHTML({ idModal, html: await Modal.Data[idModal].options.html() });
    }
  }

  /** The Studio landing: one card for each editor the submenu shows. */
  static renderLanding() {
    return Modal.renderSubMenuLanding({
      subMenuId: STUDIO_ROUTE,
      title: Translate.instance(STUDIO_ROUTE),
      cards: VIEWS.filter(({ hidden }) => !hidden).map(({ route, icon, description }) => ({
        id: route,
        icon: iconImage(icon),
        title: Translate.instance(route),
        description,
      })),
    });
  }
}

export { StudioCyberia };
