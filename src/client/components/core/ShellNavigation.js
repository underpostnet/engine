/**
 * Declarative shell navigation: each drawer entry declares its button, its route and the view it
 * opens. One helper opens every view with the shell defaults.
 * @module src/client/components/core/ShellNavigation.js
 * @namespace ShellNavigation
 */

import Sortable from 'sortablejs';
import { BtnIcon } from './BtnIcon.js';
import { Css, Themes } from './Css.js';
import { EventsUI } from './EventsUI.js';
import {
  Modal,
  SUBMENU_SELECTION_QUERY_KEY,
  isSubMenuOpen,
  renderMenuLabel,
  renderViewTitle,
  sortableSubMenuEvents,
  subMenuRender,
} from './Modal.js';
import { getProxyPath, getQueryParams, setQueryParams } from './Router.js';
import { ShellLayout } from './ShellLayout.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';

/**
 * @typedef {object} ShellNavigationEntry
 * @property {string} id - Renders `.main-btn-<id>` and is the default route.
 * @property {string} [route] - Route when it differs from `id`; `''` is the home route.
 * @property {string} [icon] - Icon html.
 * @property {string} [image] - Image under `assets/ui-icons/`, drawn with the shell `iconSet`.
 * @property {string} [text] - Label html; the translation of `id` by default.
 * @property {string} [href] - Link target; the route by default.
 * @property {boolean} [hidden] - Starts hidden; role logic shows it.
 * @property {boolean} [session] - Starts hidden; `Auth` shows it while a session is open.
 * @property {boolean} [active] - Starts as the active entry.
 * @property {boolean} [submenu] - Owns the submenu of its id; activating it keeps the drawer open.
 * @property {ShellNavigationEntry[]} [children] - Fixed entries of the submenu.
 * @property {string} [badge] - Extra label html, such as an unread badge.
 * @property {Function} [view] - Returns the options of the view `modal-<id>` the entry opens.
 * @property {Function} [action] - Runs instead of `view`: `(event, open) => ...`, where
 *   `open(options)` opens the entry view.
 */

/**
 * @typedef {object} ShellNavigationConfig
 * @property {object} RouterInstance - The shell router.
 * @property {ShellNavigationEntry[]} entries - Drawer entries, in default order.
 * @property {string} [iconSet] - Prefix of the image classes: `<iconSet>-menu-icon` in the drawer,
 *   `<iconSet>-menu-icon-modal` and `<iconSet>-text-title-modal` in view titles.
 */

const imageSrc = (image) => `${getProxyPath()}assets/ui-icons/${image}`;

const entryText = (entry) => entry.text ?? Translate.instance(entry.id);

const entryRoute = (entry) => entry.route ?? entry.id;

const menuIcon = ({ iconSet }, entry) =>
  entry.image ? html`<img class="inl ${iconSet}-menu-icon" src="${imageSrc(entry.image)}" />` : entry.icon;

const submenuCaret = (id) =>
  html`<i
    class="fas fa-caret-down inl down-arrow-submenu down-arrow-submenu-${id}"
    style="rotate: 0deg; transition: 0.4s;"
  ></i>`;

const renderChild = async (config, parent, entry) =>
  await BtnIcon.instance({
    class: `in wfa main-btn-menu submenu-btn btn-${parent.id} btn-${parent.id}-${entry.id} main-btn-${entry.id}${
      entry.hidden ? ' hide' : ''
    }`,
    useMenuBtn: true,
    label: renderMenuLabel({
      icon: menuIcon(config, entry),
      text: html`<span class="menu-label-text menu-label-text-${parent.id}">${entryText(entry)}</span>`,
    }),
    attrs: `data-id="${entry.id}"`,
    tabHref: entry.href ?? `${getProxyPath()}${entryRoute(entry)}`,
  });

const renderEntry = async (config, entry) => {
  const button = await BtnIcon.instance({
    class: `in wfa main-btn-menu main-btn-${entry.id}${entry.active ? ' main-btn-menu-active' : ''}${
      entry.hidden ? ' hide' : ''
    }`,
    useMenuBtn: true,
    label: html`${renderMenuLabel({
      icon: menuIcon(config, entry),
      text: html`<span class="menu-label-text"
        >${entryText(entry)}${entry.submenu ? html` ${submenuCaret(entry.id)}` : ''}</span
      >`,
    })}${entry.badge ?? ''}`,
    style: entry.session ? 'display: none' : '',
    attrs: `data-id="${entry.id}"`,
    tabHref: entry.href ?? `${getProxyPath()}${entryRoute(entry)}`,
    handleContainerClass: 'handle-btn-container',
  });
  if (!entry.submenu) return button;
  const children = await Promise.all((entry.children ?? []).map((child) => renderChild(config, entry, child)));
  return html`${button}
    <div class="abs menu-btn-container-children-${entry.id}" style="height: 0px; overflow: hidden;">
      ${children.join('')}
    </div>`;
};

/** Toggles a submenu on a click, and opens it when a route reaches its entry. */
const activateSubmenu = async (entry, event) => {
  if (isSubMenuOpen(entry.id) && !event.isTrusted) return;
  if (event.isTrusted && getQueryParams()[SUBMENU_SELECTION_QUERY_KEY] !== undefined)
    setQueryParams({ [SUBMENU_SELECTION_QUERY_KEY]: null });
  await subMenuRender(entry.id);
};

class ShellNavigation {
  /**
   * The drawer html of the entries.
   * @param {ShellNavigationConfig} config
   * @returns {Promise<string>}
   */
  static async render(config) {
    const entries = await Promise.all(config.entries.map((entry) => renderEntry(config, entry)));
    return html`<div class="fl menu-btn-container">${entries.join('')}</div>`;
  }

  /**
   * Binds every entry and makes the drawer order sortable. Activating an entry closes the drawer,
   * except the entry of a submenu.
   * @param {ShellNavigationConfig} config
   */
  static bind(config) {
    const submenus = config.entries.filter((entry) => entry.submenu);
    const entries = [...config.entries, ...submenus.flatMap((entry) => entry.children ?? [])];
    for (const entry of entries) {
      if (!entry.view && !entry.action) continue;
      EventsUI.onClick(`.main-btn-${entry.id}`, async (event) => {
        if (entry.submenu) await activateSubmenu(entry, event);
        else ShellLayout.closeDrawer();
        const open = (options) => ShellNavigation.openView(config, entry, options);
        return entry.action ? entry.action(event, open) : open(await entry.view());
      });
    }
    const sortableSubmenus = sortableSubMenuEvents(submenus.map((entry) => entry.id));
    new Sortable(s(`.menu-btn-container`), {
      animation: 150,
      group: `menu-sortable`,
      forceFallback: true,
      fallbackOnBody: true,
      handle: '.handle-btn-container',
      draggable: '.main-btn-menu',
      store: {
        get: (sortable) => localStorage.getItem(sortable.options.group.name)?.split('|') ?? [],
        set: (sortable) => localStorage.setItem(sortable.options.group.name, sortable.toArray().join('|')),
      },
      onStart: sortableSubmenus.onStart,
      onEnd: (event) => {
        sortableSubmenus.onEnd();
        // A press without a move is a click the drag fallback swallowed.
        if (event.oldIndex === event.newIndex) s(`.${[...event.item.classList].pop()}`).click();
      },
    });
  }

  /**
   * The title of the view an entry opens: its icon and its label.
   * @param {ShellNavigationConfig} config
   * @param {ShellNavigationEntry} entry
   * @returns {string}
   */
  static title({ iconSet }, entry) {
    if (!entry.image) return renderViewTitle({ icon: entry.icon, text: entryText(entry) });
    return renderViewTitle({
      icon: html`<img class="inl ${iconSet}-menu-icon-modal" src="${imageSrc(entry.image)}" />`,
      text: html`<span class="inl ${iconSet}-text-title-modal">${entryText(entry)}</span>`,
    });
  }

  /**
   * Opens the view of an entry: a maximized view in the main body area, on the entry route.
   * @param {ShellNavigationConfig} config
   * @param {ShellNavigationEntry} entry
   * @param {object} options - `Modal.instance` options; they override the defaults.
   */
  static async openView(config, entry, options) {
    const { barConfig } = await Themes[Css.currentTheme]();
    return await Modal.instance({
      id: `modal-${entry.id}`,
      route: entryRoute(entry),
      barConfig,
      title: ShellNavigation.title(config, entry),
      handleType: 'bar',
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
      RouterInstance: config.RouterInstance,
      ...options,
    });
  }
}

export { ShellNavigation };
