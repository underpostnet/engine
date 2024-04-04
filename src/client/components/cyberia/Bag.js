import Sortable from 'sortablejs';
import { getId, range, uniqueArray } from '../core/CommonJs.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Css, Themes, borderChar, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Modal } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { SkinComponent, setSkinStat } from './CommonCyberia.js';
import { Menu } from './Menu.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { SocketIo } from '../core/SocketIo.js';
import { Pixi } from './Pixi.js';

// https://github.com/underpostnet/underpost-engine/blob/2.0.0/src/cyberia/components/bag.js

const ItemModal = {
  Render: async function (options = { idModal: '', skin: { skinId: '' } }) {
    const { idModal, skin } = options;
    const id0 = `${idModal}-section-0`;
    const id1 = `${idModal}-section-1`;

    setTimeout(async () => {
      if (skin) {
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        let statsRender = '';
        for (const statKey of Object.keys(SkinComponent[skin.skinId])) {
          statsRender += html` <div class="in fll stat-skin-table-cell stat-skin-table-cell-key">
              <div class="in section-mp">${statKey}</div>
            </div>
            <div class="in fll stat-skin-table-cell">
              <div class="in section-mp">${SkinComponent[skin.skinId][statKey]}</div>
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
          html`${await BtnIcon.Render({ label: 'equip', type: 'button', class: `btn-equip-skin-${idModal}` })}`,
        );
        EventsUI.onClick(`.btn-equip-skin-${idModal}`, async () => {
          const type = 'user';
          const id = 'main';
          Elements.Data[type][id].components.skin = Elements.Data[type][id].components.skin.map((skinData) => {
            skinData.enabled = skinData.displayId === skin.skinId;
            skinData.current = skinData.displayId === skin.skinId;
            return skinData;
          });
          Elements.Data[type][id] = setSkinStat(Elements.Data[type][id]);
          Pixi.setSkinComponent({ type, id });
          Pixi.triggerUpdateSkinPosition({ type, id });
          SocketIo.Emit(type, {
            status: 'update-skin-position',
            element: { components: { skin: Elements.Data[type][id].components.skin } },
            direction: Elements.LocalDataScope[type][id].lastDirection,
            updateStat: true,
          });
        });
        // -----------------------------------------------------------
        // -----------------------------------------------------------
        htmls(
          `.${id1}-render-col-a`,
          html` <img class="in item-modal-img" src="${getProxyPath()}assets/skin/${skin.skinId}/08/0.png" /> `,
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
};

const Slot = {
  coin: {
    render: ({ bagId, indexBag }) => {
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
    render: ({ bagId, indexBag }) => {
      for (const skinId of uniqueArray(Elements.Data.user.main.components.skin.map((s) => s.displayId))) {
        const count = Elements.Data.user.main.components.skin.filter((s) => s.displayId === skinId).length;
        const slotId = `${bagId}-${indexBag}`;
        htmls(
          `.${slotId}`,
          html`
            <div class="abs bag-slot-count">
              <div class="abs center">x<span class="bag-slot-value-${slotId}">${count}</span></div>
            </div>
            <img class="abs center bag-slot-img" src="${getProxyPath()}assets/skin/${skinId}/08/0.png" />
            <div class="in bag-slot-type-text">skin</div>
            <div class="in bag-slot-name-text">${skinId}</div>
          `,
        );
        EventsUI.onClick(`.${slotId}`, async (e) => {
          const { barConfig } = await Themes[Css.currentTheme]();
          await Modal.Render({
            id: `modal-item-${slotId}`,
            barConfig,
            title: Menu.renderViewTitle({
              img: `${getProxyPath()}assets/skin/${skinId}/08/0.png`,
              text: html`${skinId}`,
            }),
            html: html`${await ItemModal.Render({ idModal: `modal-item-${slotId}`, skin: { skinId } })}`,
            mode: 'view',
            slideMenu: 'modal-menu',
            maximize: Modal.mobileModal(),
          });
        });
        indexBag++;
      }
      return indexBag;
    },
  },
  skill: {
    render: ({ bagId, indexBag }) => {
      for (const skillId of uniqueArray(Elements.Data.user.main.skill.tree)) {
        const count = Elements.Data.user.main.skill.tree.filter((s) => s === skillId).length;
        htmls(
          `.${bagId}-${indexBag}`,
          html`
            <div class="abs bag-slot-count">
              <div class="abs center">x<span class="bag-slot-value-${bagId}-${indexBag}">${count}</span></div>
            </div>
            <img class="abs center bag-slot-img" src="${getProxyPath()}assets/skill/${skillId}/animation.gif" />
            <div class="in bag-slot-type-text">skill</div>
            <div class="in bag-slot-name-text">${skillId}</div>
          `,
        );
        indexBag++;
      }
      return indexBag;
    },
  },
  xp: {
    render: ({ bagId, indexBag }) => {
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
      indexBag = await Slot.coin.render({ bagId, indexBag });
      indexBag = await Slot.skin.render({ bagId, indexBag });
      indexBag = await Slot.skill.render({ bagId, indexBag });
      indexBag = await Slot.xp.render({ bagId, indexBag });
    });
    return html`
      <div class="fl ${bagId}">
        ${range(0, totalSlots - 1)
          .map((slot) => {
            setTimeout(() => {
              // s(`.${bagId}-${slot}`).onclick = () => console.warn(slot);
            });
            return html` <div class="in fll bag-slot ${bagId}-${slot}" data-id="${slot}"><!-- slot ${slot} --></div> `;
          })
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

export { Bag, Slot };
