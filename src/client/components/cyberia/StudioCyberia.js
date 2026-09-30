/**
 * The Cyberia Studio menu: its editors, the icon of each one, the submenu that opens them, the
 * landing that shows them as cards, and the modal title of each view.
 *
 * @module src/client/components/cyberia/StudioCyberia.js
 */
import { Badge } from '../core/Badge.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { getProxyPath } from '../core/Router.js';
import { Translate } from '../core/Translate.js';

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
    route: 'cyberia-map-engine',
    icon: 'map.png',
    description: 'Place the entities of a map and track its foundation composition',
  },
  {
    route: 'cyberia-instance-engine',
    icon: 'grid.png',
    description: 'Connect maps into a world: portals, spawn and instance settings',
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
]);

const iconImage = (icon, className = 'cyberia-menu-icon') =>
  html`<img class="inl ${className}" src="${getProxyPath()}assets/ui-icons/${icon}" />`;

const iconOf = (route) => (route === STUDIO_ROUTE ? STUDIO_ICON : VIEWS.find((view) => view.route === route).icon);

/** One button of the Studio submenu. */
const viewButton = async ({ route, icon, hidden }) =>
  await BtnIcon.instance({
    class: `in wfa main-btn-menu submenu-btn btn-${STUDIO_ROUTE} btn-${STUDIO_ROUTE}-${route} main-btn-${route}${
      hidden ? ' hide' : ''
    }`,
    useMenuBtn: true,
    label: renderMenuLabel({
      icon: iconImage(icon),
      text: html`<span class="menu-label-text menu-label-text-${STUDIO_ROUTE}">${Translate.instance(route)}</span>`,
    }),
    attrs: `data-id="${route}"`,
    tabHref: `${getProxyPath()}${route}`,
    handleContainerClass: 'handle-btn-container',
    tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption(route)),
  });

class StudioCyberia {
  /** The Studio menu entry: its button and the submenu of its editors. */
  static async renderMenu() {
    const button = await BtnIcon.instance({
      class: `in wfa main-btn-menu main-btn-${STUDIO_ROUTE}`,
      useMenuBtn: true,
      label: html`<div class="in">
        ${renderMenuLabel({
          icon: iconImage(STUDIO_ICON),
          text: html`<span class="menu-label-text"
            >${Translate.instance(STUDIO_ROUTE)}
            <i
              class="fas fa-caret-down inl down-arrow-submenu down-arrow-submenu-${STUDIO_ROUTE}"
              style="rotate: 0deg; transition: 0.4s;"
            ></i
          ></span>`,
        })}
      </div> `,
      attrs: `data-id="${STUDIO_ROUTE}"`,
      tabHref: `${getProxyPath()}${STUDIO_ROUTE}`,
      handleContainerClass: 'handle-btn-container',
      tooltipHtml: await Badge.instance(buildBadgeToolTipMenuOption(STUDIO_ROUTE)),
    });
    return html`${button}
      <div class="abs menu-btn-container-children-${STUDIO_ROUTE}" style="height: 0px; overflow: hidden;">
        ${(await Promise.all(VIEWS.map(viewButton))).join('')}
      </div>`;
  }

  /** The modal title of the Studio landing or of an editor: the icon and the name of its menu button. */
  static renderTitle(route, text = Translate.instance(route)) {
    return renderViewTitle({
      icon: iconImage(iconOf(route), 'cyberia-menu-icon-modal'),
      text: html`<span class="inl cyberia-text-title-modal">${text}</span>`,
    });
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
