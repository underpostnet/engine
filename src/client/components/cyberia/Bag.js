import Sortable from 'sortablejs';
import { getId, range, uniqueArray } from '../core/CommonJs.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Css, Themes, borderChar, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Modal } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { Stat } from './CommonCyberia.js';
import { Menu } from './Menu.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { SocketIo } from '../core/SocketIo.js';
import { Pixi } from './Pixi.js';
import { loggerFactory } from '../core/Logger.js';
import { Character } from './Character.js';

// https://github.com/underpostnet/underpost-engine/blob/2.0.0/src/cyberia/components/bag.js

const logger = loggerFactory(import.meta);

const ItemModal = {
  Render: async function (options = { idModal: '', skin: { id: '' }, weapon: { id: '' } }) {
    const { idModal, skin, weapon } = options;
    const id0 = `${idModal}-section-0`;
    const id1 = `${idModal}-section-1`;

    setTimeout(async () => {
      if (skin) {
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        let statsRender = '';
        const statData = Stat.get[skin.id]();
        for (const statKey of Object.keys(statData)) {
          statsRender += html` <div class="in fll stat-table-cell stat-table-cell-key">
              <div class="in section-mp">${statKey}</div>
            </div>
            <div class="in fll stat-table-cell">
              <div class="in section-mp">${statData[statKey]}</div>
            </div>`;
        }
        htmls(
          `.${id0}-render-col-a`,
          html` <div class="in section-mp">
              <div class="in sub-title-item-modal">
                <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/stats.png" /> Stats
              </div>
            </div>
            <div class="in section-mp"><div class="fl">${statsRender}</div></div>`,
        );
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
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        let statsRender = '';
        const statData = Stat.get[weapon.id]();
        for (const statKey of Object.keys(statData)) {
          statsRender += html` <div class="in fll stat-table-cell stat-table-cell-key">
              <div class="in section-mp">${statKey}</div>
            </div>
            <div class="in fll stat-table-cell">
              <div class="in section-mp">${statData[statKey]}</div>
            </div>`;
        }
        htmls(
          `.${id0}-render-col-a`,
          html` <div class="in section-mp">
              <div class="in sub-title-item-modal">
                <img class="inl header-icon-item-modal" src="${getProxyPath()}assets/ui-icons/stats.png" /> Stats
              </div>
            </div>
            <div class="in section-mp"><div class="fl">${statsRender}</div></div>`,
        );
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
    skin: function ({ type, id, skin }) {
      Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((skinData) => {
        skinData.enabled = skinData.displayId === skin.id;
        skinData.current = skinData.displayId === skin.id;
        return skinData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
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
      SocketIo.Emit(type, {
        status: 'update-weapon',
        element: { components: { weapon: Elements.Data[type][id].components.weapon } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'weapon' });
    },
  },
  Unequip: {
    skin: function ({ type, id, skin }) {
      Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((skinData) => {
        skinData.enabled = skinData.displayId === (skin?.id ? skin.id : 'anon');
        skinData.current = skinData.displayId === (skin?.id ? skin.id : 'anon');
        return skinData;
      });
      Elements.Data[type][id] = Stat.set(type, Elements.Data[type][id]);
      Pixi.setDisplayComponent({ type, id });
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
      SocketIo.Emit(type, {
        status: 'update-weapon',
        element: { components: { weapon: Elements.Data[type][id].components.weapon } },
      });
      Character.RenderCharacterSLot({ type, id, componentType: 'weapon' });
    },
  },
};

const Slot = {
  coin: {
    renderBagSlots: ({ bagId, indexBag }) => {
      htmls(
        `.${bagId}-${indexBag}`,
        html` <div class="abs bag-slot-count character-drop-zone">
            <div class="abs center character-drop-zone">
              x<span class="bag-slot-value-${bagId}-${indexBag} character-drop-zone"
                >${Elements.Data.user.main.coin}</span
              >
            </div>
          </div>
          <img class="abs center bag-slot-img character-drop-zone" src="${getProxyPath()}assets/coin/animation.gif" />
          <div class="in bag-slot-type-text character-drop-zone">currency</div>
          <div class="in bag-slot-name-text character-drop-zone">coin</div>`,
      );
      indexBag++;
      return indexBag;
    },
    update: ({ bagId, type, id }) => {
      if (s(`.bag-slot-value-${bagId}-0`)) htmls(`.bag-slot-value-${bagId}-0`, Elements.Data[type][id].coin);
    },
  },
  skin: {
    render: function ({ slotId, displayId }) {
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.components.skin.filter((s) => s.displayId === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count character-drop-zone">
            <div class="abs center character-drop-zone">
              x<span class="bag-slot-value-${slotId} character-drop-zone">${count}</span>
            </div>
          </div>
          <img
            class="abs center bag-slot-img character-drop-zone"
            src="${getProxyPath()}assets/skin/${displayId}/08/0.png"
          />
          <div class="in bag-slot-type-text character-drop-zone">skin</div>
          <div class="in bag-slot-name-text character-drop-zone">${displayId}</div>
        `,
      );
      EventsUI.onClick(`.${slotId}`, async (e) => {
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
      });
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
    render: function ({ slotId, displayId }) {
      if (!s(`.${slotId}`)) return;
      const count = Elements.Data.user.main.weapon.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count character-drop-zone">
            <div class="abs center character-drop-zone">
              x<span class="bag-slot-value-${slotId} character-drop-zone">${count}</span>
            </div>
          </div>
          <img
            class="abs center bag-slot-img character-drop-zone"
            src="${getProxyPath()}assets/weapon/${displayId}/animation.gif"
          />
          <div class="in bag-slot-type-text character-drop-zone">weapon</div>
          <div class="in bag-slot-name-text character-drop-zone">${displayId}</div>
        `,
      );
      EventsUI.onClick(`.${slotId}`, async (e) => {
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
      });
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
  skill: {
    renderBagSlots: ({ bagId, indexBag }) => {
      for (const displayId of uniqueArray(Elements.Data.user.main.skill.tree.map((s) => s.id))) {
        const count = Elements.Data.user.main.skill.tree.filter((s) => s.id === displayId).length;
        htmls(
          `.${bagId}-${indexBag}`,
          html`
            <div class="abs bag-slot-count character-drop-zone">
              <div class="abs center character-drop-zone">
                x<span class="bag-slot-value-${bagId}-${indexBag} character-drop-zone">${count}</span>
              </div>
            </div>
            <img
              class="abs center bag-slot-img character-drop-zone"
              src="${getProxyPath()}assets/skill/${displayId}/animation.gif"
            />
            <div class="in bag-slot-type-text character-drop-zone">skill</div>
            <div class="in bag-slot-name-text character-drop-zone">${displayId}</div>
          `,
        );
        indexBag++;
      }
      return indexBag;
    },
  },
  xp: {
    renderBagSlots: ({ bagId, indexBag }) => {
      htmls(
        `.${bagId}-${indexBag}`,
        html` <div class="abs bag-slot-count character-drop-zone">
            <div class="abs center character-drop-zone">
              x<span class="bag-slot-value-${bagId}-${indexBag} character-drop-zone">0</span>
            </div>
          </div>
          <div class="abs center xp-icon character-drop-zone">XP</div>
          <div class="in bag-slot-type-text character-drop-zone">experience</div>
          <div class="in bag-slot-name-text character-drop-zone">level 0</div>`,
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
          // console.log('Sortable onEnd', evt);
          // console.log('evt.oldIndex', evt.oldIndex);
          // console.log('evt.newIndex', evt.newIndex);

          const { srcElement, target, toElement } = evt.originalEvent;

          const { item } = evt;

          const dataBagFrom = {
            type: Array.from(item.children)[2].innerHTML,
            id: Array.from(item.children)[3].innerHTML,
          };
          const dataBagTo = {
            srcElement: Array.from(srcElement.classList).pop(),
            target: Array.from(target.classList).pop(),
            toElement: Array.from(toElement.classList).pop(),
          };

          logger.info('Sortable Bag From:', dataBagFrom);
          logger.info('Sortable Bag To:', dataBagTo);

          if (
            ['skin', 'weapon'].includes(dataBagFrom.type) &&
            Object.values(dataBagTo).includes('character-drop-zone')
          ) {
            const payLoadEquip = { type: 'user', id: 'main' };
            payLoadEquip[dataBagFrom.type] = { id: dataBagFrom.id };
            ItemModal.Equip[dataBagFrom.type](payLoadEquip);
            return;
          }

          const slotId = Array.from(evt.item.classList).pop();
          // console.log('slotId', slotId);
          if (evt.oldIndex === evt.newIndex) s(`.${slotId}`).click();

          // var itemEl = evt.item; // dragged HTMLElement
          // evt.to; // target list
          // evt.from; // previous list
          // evt.oldIndex; // element's old index within old parent
          // evt.newIndex; // element's new index within new parent
          // evt.oldDraggableIndex; // element's old index within old parent, only counting draggable elements
          // evt.newDraggableIndex; // element's new index within new parent, only counting draggable elements
          // evt.clone; // the clone element
          // evt.pullMode; // when item is in another sortable: `"clone"` if cloning, `true` if moving
        },
      });

      let indexBag = 0;
      indexBag = await Slot.coin.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.xp.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.skin.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.skill.renderBagSlots({ bagId, indexBag });
      indexBag = await Slot.weapon.renderBagSlots({ bagId, indexBag });
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

export { Bag, Slot, ItemModal };
