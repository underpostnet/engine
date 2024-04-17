import Sortable from 'sortablejs';
import { getId, range, uniqueArray } from '../core/CommonJs.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Css, Themes, borderChar, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Modal } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { SkillData, Stat } from './CommonCyberia.js';
import { Menu } from './Menu.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { SocketIo } from '../core/SocketIo.js';
import { Pixi } from './Pixi.js';
import { loggerFactory } from '../core/Logger.js';
import { Character } from './Character.js';

// https://github.com/underpostnet/underpost-engine/blob/2.0.0/src/cyberia/components/bag.js

const logger = loggerFactory(import.meta);

const ItemModal = {
  Render: async function (
    options = { idModal: '', skin: { id: '' }, weapon: { id: '' }, breastplate: { id: '' }, skill: { id: '' } },
  ) {
    const { idModal, skin, weapon, breastplate, skill } = options;
    const id0 = `${idModal}-section-0`;
    const id1 = `${idModal}-section-1`;

    setTimeout(async () => {
      if (skin) {
        htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[skin.id]()));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id0}-render-col-b`,
          html`${await BtnIcon.Render({
            label: Translate.Render('equip'),
            type: 'button',
            class: `btn-equip-skin-${idModal}`,
          })}
          ${await BtnIcon.Render({
            label: Translate.Render('unequip'),
            type: 'button',
            class: `btn-unequip-skin-${idModal}`,
          })} `,
        );
        EventsUI.onClick(`.btn-equip-skin-${idModal}`, () => this.Equip.skin({ type: 'user', id: 'main', skin }));
        EventsUI.onClick(`.btn-unequip-skin-${idModal}`, () => this.Unequip.skin({ type: 'user', id: 'main' }));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id1}-render-col-a`,
          html` <img class="in item-modal-img" src="${getProxyPath()}assets/skin/${skin.id}/08/0.png" /> `,
        );
      }
      if (weapon) {
        htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[weapon.id]()));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id0}-render-col-b`,
          html`${await BtnIcon.Render({
            label: Translate.Render('equip'),
            type: 'button',
            class: `btn-equip-weapon-${idModal}`,
          })}
          ${await BtnIcon.Render({
            label: Translate.Render('unequip'),
            type: 'button',
            class: `btn-unequip-weapon-${idModal}`,
          })} `,
        );
        EventsUI.onClick(`.btn-equip-weapon-${idModal}`, () => this.Equip.weapon({ type: 'user', id: 'main', weapon }));
        EventsUI.onClick(`.btn-unequip-weapon-${idModal}`, () => this.Unequip.weapon({ type: 'user', id: 'main' }));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id1}-render-col-a`,
          html` <img class="in item-modal-img" src="${getProxyPath()}assets/weapon/${weapon.id}/animation.gif" /> `,
        );
      }
      if (breastplate) {
        htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[breastplate.id]()));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id0}-render-col-b`,
          html`${await BtnIcon.Render({
            label: Translate.Render('equip'),
            type: 'button',
            class: `btn-equip-breastplate-${idModal}`,
          })}
          ${await BtnIcon.Render({
            label: Translate.Render('unequip'),
            type: 'button',
            class: `btn-unequip-breastplate-${idModal}`,
          })} `,
        );
        EventsUI.onClick(`.btn-equip-breastplate-${idModal}`, () =>
          this.Equip.breastplate({ type: 'user', id: 'main', breastplate }),
        );
        EventsUI.onClick(`.btn-unequip-breastplate-${idModal}`, () =>
          this.Unequip.breastplate({ type: 'user', id: 'main' }),
        );
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id1}-render-col-a`,
          html`
            <img class="in item-modal-img" src="${getProxyPath()}assets/breastplate/${breastplate.id}/animation.gif" />
          `,
        );
      }
      if (skill) {
        htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[skill.id]()));
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id0}-render-col-b`,
          html`${await BtnIcon.Render({
            label: Translate.Render('equip'),
            type: 'button',
            class: `btn-equip-skill-${idModal}`,
          })}
          ${await BtnIcon.Render({
            label: Translate.Render('unequip'),
            type: 'button',
            class: `btn-unequip-skill-${idModal}`,
          })} `,
        );
        EventsUI.onClick(`.btn-equip-skill-${idModal}`, () => this.Equip.skill({ type: 'user', id: 'main', skill }));
        EventsUI.onClick(`.btn-unequip-skill-${idModal}`, () =>
          this.Unequip.skill({ type: 'user', id: 'main', skill }),
        );
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id1}-render-col-a`,
          html` <img class="in item-modal-img" src="${getProxyPath()}assets/skill/${skill.id}/animation.gif" /> `,
        );
      }
    });
    return html`
      ${dynamicCol({ containerSelector: id0, id: id0, type: 'a-50-b-50', limit: 500 })}
      <div class="fl ${id0}">
        <div class="in fll ${id0}-col-a">
          <div class="in item-modal-section-cell section-mp ${id0}-render-col-a"></div>
        </div>
        <div class="in fll ${id0}-col-b">
          <div class="in item-modal-section-cell section-mp ${id0}-render-col-b"></div>
        </div>
      </div>
      ${dynamicCol({ containerSelector: id1, id: id1, type: 'a-50-b-50', limit: 500 })}
      <div class="fl ${id1}">
        <div class="in fll ${id1}-col-a">
          <div class="in item-modal-section-cell section-mp ${id1}-render-col-a"></div>
        </div>
        <div class="in fll ${id1}-col-b">
          <div class="in item-modal-section-cell section-mp ${id1}-render-col-b"></div>
        </div>
      </div>
    `;
  },
  Equip: {
    skill: function ({ type, id, skill }) {
      console.log('Equip skill', { type, id, skill });
    },
    skin: function ({ type, id, skin }) {
      Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((skinData) => {
        skinData.enabled = skinData.displayId === skin.id;
        skinData.current = skinData.displayId === skin.id;
        return skinData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: Elements.Data[type][id].components.skin } },
        direction: Elements.LocalDataScope[type][id].lastDirection,
        updateStat: true,
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'skin' });
    },
    weapon: function ({ type, id, weapon }) {
      Elements.Data[type][id].components.weapon = Elements.Data[type][id].components.weapon.map((weaponData) => {
        weaponData.enabled = weaponData.displayId === weapon.id;
        weaponData.current = weaponData.displayId === weapon.id;
        return weaponData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'weapon',
        element: { components: { weapon: Elements.Data[type][id].components.weapon } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'weapon' });
    },
    breastplate: function ({ type, id, breastplate }) {
      Elements.Data[type][id].components.breastplate = Elements.Data[type][id].components.breastplate.map(
        (breastplateData) => {
          breastplateData.enabled = breastplateData.displayId === breastplate.id;
          breastplateData.current = breastplateData.displayId === breastplate.id;
          return breastplateData;
        },
      );
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'breastplate',
        element: { components: { breastplate: Elements.Data[type][id].components.breastplate } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'breastplate' });
    },
  },
  Unequip: {
    skill: function ({ type, id, skill }) {
      console.log('Unequip skill', { type, id, skill });
    },
    skin: function ({ type, id, skin }) {
      Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((skinData) => {
        skinData.enabled = skinData.displayId === (skin?.id ? skin.id : 'anon');
        skinData.current = skinData.displayId === (skin?.id ? skin.id : 'anon');
        return skinData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: Elements.Data[type][id].components.skin } },
        direction: Elements.LocalDataScope[type][id].lastDirection,
        updateStat: true,
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'skin' });
    },
    weapon: function ({ type, id, weapon }) {
      Elements.Data[type][id].components.weapon = Elements.Data[type][id].components.weapon.map((weaponData) => {
        weaponData.enabled = weapon?.id ? weaponData.displayId === weapon.id : false;
        weaponData.current = weapon?.id ? weaponData.displayId === weapon.id : false;
        return weaponData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'weapon',
        element: { components: { weapon: Elements.Data[type][id].components.weapon } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'weapon' });
    },
    breastplate: function ({ type, id, breastplate }) {
      Elements.Data[type][id].components.breastplate = Elements.Data[type][id].components.breastplate.map(
        (breastplateData) => {
          breastplateData.enabled = breastplate?.id ? breastplateData.displayId === breastplate.id : false;
          breastplateData.current = breastplate?.id ? breastplateData.displayId === breastplate.id : false;
          return breastplateData;
        },
      );
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
      Character.renderCharacterStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'breastplate',
        element: { components: { breastplate: Elements.Data[type][id].components.breastplate } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'breastplate' });
    },
  },
  RenderStat: function (statData) {
    const displayStats = ['dim', 'vel', 'maxLife', 'life', 'deadTime', 'damage'];
    let statsRender = '';
    for (const statKey of Object.keys(statData)) {
      if (!displayStats.includes(statKey)) continue;
      statsRender += html` <div class="in fll stat-table-cell stat-table-cell-key">
          <div class="in section-mp">${statKey}</div>
        </div>
        <div class="in fll stat-table-cell">
          <div class="in section-mp">${statData[statKey]}</div>
        </div>`;
    }
    return html` <div class="in section-mp">
        <div class="in sub-title-item-modal">
          <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/stats.png" /> Stats
        </div>
      </div>
      <div class="in section-mp"><div class="fl">${statsRender}</div></div>`;
  },
};

const SlotEvents = {};

const Slot = {
  coin: {
    renderBagSlots: ({ bagId, indexBag }) => {
      htmls(
        `.${bagId}-${indexBag}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">
              x<span class="bag-slot-value-${bagId}-${indexBag}">${Elements.Data.user.main.coin}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/coin/animation.gif" />
          <div class="in bag-slot-type-text">currency</div>
          <div class="in bag-slot-name-text">coin</div>`,
      );
      indexBag++;
      return indexBag;
    },
    update: ({ bagId, type, id }) => {
      if (s(`.bag-slot-value-${bagId}-0`)) htmls(`.bag-slot-value-${bagId}-0`, Elements.Data[type][id].coin);
    },
  },
  skin: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.components.skin.filter((s) => s.displayId === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${count}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/skin/${displayId}/08/0.png" />
          <div class="in bag-slot-type-text">skin</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-skin-${slotId}`,
          barConfig,
          title: Menu.renderViewTitle({
            img: `${getProxyPath()}assets/skin/${displayId}/08/0.png`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({ idModal: `modal-skin-${slotId}`, skin: { id: displayId } })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagSlots: function ({ bagId, indexBag }) {
      for (const displayId of uniqueArray(Elements.Data.user.main.components.skin.map((s) => s.displayId))) {
        const slotId = `${bagId}-${indexBag}`;
        this.render({ displayId, slotId });
        indexBag++;
      }
      return indexBag;
    },
  },
  weapon: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.weapon.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${count}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/weapon/${displayId}/animation.gif" />
          <div class="in bag-slot-type-text">weapon</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-weapon-${slotId}`,
          barConfig,
          title: Menu.renderViewTitle({
            img: `${getProxyPath()}assets/weapon/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({ idModal: `modal-weapon-${slotId}`, weapon: { id: displayId } })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagSlots: function ({ bagId, indexBag }) {
      for (const displayId of uniqueArray(Elements.Data.user.main.weapon.tree.map((i) => i.id))) {
        const slotId = `${bagId}-${indexBag}`;
        this.render({ slotId, displayId });
        indexBag++;
      }
      return indexBag;
    },
  },
  breastplate: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.breastplate.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${count}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/breastplate/${displayId}/animation.gif" />
          <div class="in bag-slot-type-text">breastplate</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-breastplate-${slotId}`,
          barConfig,
          title: Menu.renderViewTitle({
            img: `${getProxyPath()}assets/breastplate/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-breastplate-${slotId}`,
            breastplate: { id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagSlots: function ({ bagId, indexBag }) {
      for (const displayId of uniqueArray(Elements.Data.user.main.breastplate.tree.map((i) => i.id))) {
        const slotId = `${bagId}-${indexBag}`;
        this.render({ slotId, displayId });
        indexBag++;
      }
      return indexBag;
    },
  },
  skill: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.skill.tree.filter((s) => s.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${count}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/skill/${displayId}/animation.gif" />
          <div class="in bag-slot-type-text">${SkillData[displayId].type}<br />skill</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-skill-${slotId}`,
          barConfig,
          title: Menu.renderViewTitle({
            img: `${getProxyPath()}assets/skill/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-skill-${slotId}`,
            skill: { id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagSlots: function ({ bagId, indexBag }) {
      for (const displayId of uniqueArray(Elements.Data.user.main.skill.tree.map((s) => s.id))) {
        const slotId = `${bagId}-${indexBag}`;
        this.render({ slotId, displayId });
        indexBag++;
      }
      return indexBag;
    },
  },
  xp: {
    renderBagSlots: ({ bagId, indexBag }) => {
      htmls(
        `.${bagId}-${indexBag}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">x<span class="bag-slot-value-${bagId}-${indexBag}">0</span></div>
          </div>
          <div class="abs center xp-icon">XP</div>
          <div class="in bag-slot-type-text">experience</div>
          <div class="in bag-slot-name-text">level 0</div>`,
      );
      indexBag++;
      return indexBag;
    },
  },
};

const Bag = {
  Tokens: {},
  Render: async function (options) {
    const bagId = options && 'id' in options ? options.id : getId(this.Tokens, 'slot-');
    const totalSlots = 10;
    this.Tokens[bagId] = { ...options, bagId, totalSlots };
    setTimeout(async () => {
      this.Tokens[bagId].sortable = new Sortable(s(`.${bagId}`), {
        animation: 150,
        group: `bag-sortable`,
        forceFallback: true,
        fallbackOnBody: true,
        store: {
          /**
           * Get the order of elements. Called once during initialization.
           * @param   {Sortable}  sortable
           * @returns {Array}
           */
          get: function (sortable) {
            const order = localStorage.getItem(sortable.options.group.name);
            return order ? order.split('|') : [];
          },

          /**
           * Save the order of elements. Called onEnd (when the item is dropped).
           * @param {Sortable}  sortable
           */
          set: function (sortable) {
            const order = sortable.toArray();
            localStorage.setItem(sortable.options.group.name, order.join('|'));
          },
        },
        // chosenClass: 'css-class',
        // ghostClass: 'css-class',
        // Element dragging ended
        onEnd: function (/**Event*/ evt) {
          try {
            // console.log('Sortable onEnd', evt);
            // console.log('evt.oldIndex', evt.oldIndex);
            // console.log('evt.newIndex', evt.newIndex);

            const toElements = {
              srcElement: evt.originalEvent.srcElement,
              target: evt.originalEvent.target,
              toElement: evt.originalEvent.toElement,
            };

            const { item } = evt; // parentElement parentNode children(array)

            const dataBagFrom = {
              type: Array.from(item.children)[2].innerHTML,
              id: Array.from(item.children)[3].innerHTML,
            };
            const dataBagTo = {};

            let dataClassBagFrom = [];
            let dataClassBagTo = [];

            for (const toElementKey of Object.keys(toElements)) {
              try {
                dataClassBagTo = dataClassBagTo.concat(Array.from(toElements[toElementKey].parentNode.classList));
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagTo = dataClassBagTo.concat(Array.from(toElements[toElementKey].parentElement.classList));
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagTo = dataClassBagTo.concat(
                  Array.from(toElements[toElementKey].parentNode.parentNode.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagTo = dataClassBagTo.concat(
                  Array.from(toElements[toElementKey].parentElement.parentElement.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
            }

            dataClassBagTo = uniqueArray(dataClassBagTo);

            logger.info('Sortable Bag From:', { dataClassBagFrom, dataBagFrom });
            logger.info('Sortable Bag To:', { dataClassBagTo, dataBagTo });

            if (
              Object.values(dataClassBagTo).find((c) => c.startsWith(`character-`)) &&
              ['skin', 'weapon', 'breastplate'].includes(dataBagFrom.type)
            ) {
              const payLoadEquip = { type: 'user', id: 'main' };
              payLoadEquip[dataBagFrom.type] = { id: dataBagFrom.id };
              ItemModal.Equip[dataBagFrom.type](payLoadEquip);
              return;
            }

            const slotId = Array.from(evt.item.classList).pop();
            // console.log('slotId', slotId);
            if (evt.oldIndex === evt.newIndex) SlotEvents[slotId].onClick();

            // var itemEl = evt.item; // dragged HTMLElement
            // evt.to; // target list
            // evt.from; // previous list
            // evt.oldIndex; // element's old index within old parent
            // evt.newIndex; // element's new index within new parent
            // evt.oldDraggableIndex; // element's old index within old parent, only counting draggable elements
            // evt.newDraggableIndex; // element's new index within new parent, only counting draggable elements
            // evt.clone; // the clone element
            // evt.pullMode; // when item is in another sortable: `"clone"` if cloning, `true` if moving
          } catch (error) {
            logger.error(error, error.stack);
          }
        },
      });

      let indexBag = 0;
      indexBag = await Slot.coin.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.xp.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.skin.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.skill.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.weapon.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.breastplate.renderBagSlots({ bagId, indexBag });
    });
    return html`
      <div class="fl ${bagId}">
        ${range(0, totalSlots - 1)
          .map(
            (slot) => html`
              <div class="in fll bag-slot ${bagId}-${slot}" data-id="${slot}">
                <!-- slot ${slot} -->
              </div>
            `,
          )
          .join('')}
      </div>
    `;
  },
  updateAll: async function (options = { bagId: '', type: '', id: '' }) {
    const { bagId, type, id } = options;
    if (this.Tokens[bagId] && s(`.${this.Tokens[bagId].idModal}`)) {
      this.Tokens[bagId].sortable.destroy();
      Modal.writeHTML({
        idModal: this.Tokens[bagId].idModal,
        html: await this.Render(this.Tokens[bagId]),
      });
    }
  },
};

export { Bag, Slot, SlotEvents, ItemModal };
