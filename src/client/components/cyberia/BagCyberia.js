import Sortable from 'sortablejs';
import { getId, range, uniqueArray } from '../core/CommonJs.js';
import { getProxyPath, htmls, s } from '../core/VanillaJs.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { Css, Themes, borderChar, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { DisplayComponent, QuestComponent, SkillCyberiaData, Stat, getK } from './CommonCyberia.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { SocketIo } from '../core/SocketIo.js';
import { PixiCyberia } from './PixiCyberia.js';
import { loggerFactory } from '../core/Logger.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { SkillCyberia } from './SkillCyberia.js';
import { QuestManagementCyberia } from './QuestCyberia.js';

// https://github.com/underpostnet/underpost-engine/blob/2.0.0/src/cyberia/components/bag.js

const logger = loggerFactory(import.meta);

const ItemModal = {
  Render: async function (
    options = {
      idModal: '',
      item: { type: '', id: '' },
    },
  ) {
    const { idModal, item } = options;
    const id0 = `${idModal}-section-0`;
    const id1 = `${idModal}-section-1`;

    setTimeout(async () => {
      htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[item.id](), { 'item type': item.type }));
      htmls(
        `.${id0}-render-col-b`,
        html`${await BtnIcon.Render({
          label: renderViewTitle({
            'ui-icon': `equip.png`,
            text: html`${Translate.Render('equip')}`,
            dim: 30,
            top: 4,
          }),
          type: 'button',
          class: `btn-equip-${item.type}-${idModal} inl wfa`,
        })}
        ${await BtnIcon.Render({
          label: renderViewTitle({
            'ui-icon': `unequip.png`,
            text: html`${Translate.Render('unequip')}`,
            dim: 30,
            top: 4,
          }),
          type: 'button',
          class: `btn-unequip-${item.type}-${idModal} inl wfa`,
        })} `,
      );
      EventsUI.onClick(`.btn-equip-${item.type}-${idModal}`, () => {
        const payload = { type: 'user', id: 'main' };
        payload[item.type] = item;
        this.Equip[item.type](payload);
      });
      EventsUI.onClick(`.btn-unequip-${item.type}-${idModal}`, () => {
        const payload = { type: 'user', id: 'main' };
        payload[item.type] = item;
        this.Unequip[item.type](payload);
      });
      htmls(
        `.${id1}-render-col-a`,
        html`
          <img
            class="in item-modal-img"
            src="${getProxyPath()}assets/${item.type}/${item.id}/${item.type === 'skin'
              ? `08/0.${DisplayComponent.get[item.id]().extension}`
              : `animation.gif`}"
          />
        `,
      );
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
      ElementsCyberia.Data[type][id].skill.keys[SkillCyberiaData[skill.id].type] = skill.id;
      SocketIo.Emit(type, {
        status: 'update-skill',
        element: { skill: ElementsCyberia.Data[type][id].skill },
      });
      CharacterCyberia.RenderCharacterCyberiaSkillSLot({ type, id, skillKey: SkillCyberiaData[skill.id].type });
      SkillCyberia.setMainKeysSkillCyberia();
    },
    skin: function ({ type, id, skin }) {
      ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
        (skinData) => {
          skinData.enabled = skinData.displayId === skin.id;
          skinData.current = skinData.displayId === skin.id;
          return skinData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: ElementsCyberia.Data[type][id].components.skin } },
        direction: ElementsCyberia.LocalDataScope[type][id].lastDirection,
        updateStat: true,
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'skin' });
    },
    weapon: function ({ type, id, weapon }) {
      ElementsCyberia.Data[type][id].components.weapon = ElementsCyberia.Data[type][id].components.weapon.map(
        (weaponData) => {
          weaponData.enabled = weaponData.displayId === weapon.id;
          weaponData.current = weaponData.displayId === weapon.id;
          return weaponData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'weapon',
        element: { components: { weapon: ElementsCyberia.Data[type][id].components.weapon } },
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'weapon' });
    },
    breastplate: function ({ type, id, breastplate }) {
      ElementsCyberia.Data[type][id].components.breastplate = ElementsCyberia.Data[type][id].components.breastplate.map(
        (breastplateData) => {
          breastplateData.enabled = breastplateData.displayId === breastplate.id;
          breastplateData.current = breastplateData.displayId === breastplate.id;
          return breastplateData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'breastplate',
        element: { components: { breastplate: ElementsCyberia.Data[type][id].components.breastplate } },
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'breastplate' });
    },
  },
  Unequip: {
    skill: function ({ type, id, skill }) {
      console.log('Unequip skill', { type, id, skill });
      ElementsCyberia.Data[type][id].skill.keys[SkillCyberiaData[skill.id].type] = null;
      SocketIo.Emit(type, {
        status: 'update-skill',
        element: { skill: ElementsCyberia.Data[type][id].skill },
      });
      CharacterCyberia.RenderCharacterCyberiaSkillSLot({ type, id, skillKey: SkillCyberiaData[skill.id].type });
      SkillCyberia.setMainKeysSkillCyberia();
    },
    skin: function ({ type, id, skin }) {
      ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
        (skinData) => {
          // skinData.enabled = skinData.displayId === (skin?.id ? skin.id : 'anon');
          // skinData.current = skinData.displayId === (skin?.id ? skin.id : 'anon');
          skinData.enabled = skinData.displayId === 'anon';
          skinData.current = skinData.displayId === 'anon';
          return skinData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: ElementsCyberia.Data[type][id].components.skin } },
        direction: ElementsCyberia.LocalDataScope[type][id].lastDirection,
        updateStat: true,
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'skin' });
    },
    weapon: function ({ type, id, weapon }) {
      ElementsCyberia.Data[type][id].components.weapon = ElementsCyberia.Data[type][id].components.weapon.map(
        (weaponData) => {
          // weaponData.enabled = weapon?.id ? weaponData.displayId === weapon.id : false;
          // weaponData.current = weapon?.id ? weaponData.displayId === weapon.id : false;
          weaponData.enabled = false;
          weaponData.current = false;
          return weaponData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'weapon',
        element: { components: { weapon: ElementsCyberia.Data[type][id].components.weapon } },
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'weapon' });
    },
    breastplate: function ({ type, id, breastplate }) {
      ElementsCyberia.Data[type][id].components.breastplate = ElementsCyberia.Data[type][id].components.breastplate.map(
        (breastplateData) => {
          // breastplateData.enabled = breastplate?.id ? breastplateData.displayId === breastplate.id : false;
          // breastplateData.current = breastplate?.id ? breastplateData.displayId === breastplate.id : false;
          breastplateData.enabled = false;
          breastplateData.current = false;
          return breastplateData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      PixiCyberia.setDisplayComponent({ type, id });
      CharacterCyberia.renderCharacterCyberiaStat();
      SocketIo.Emit(type, {
        status: 'update-item',
        itemType: 'breastplate',
        element: { components: { breastplate: ElementsCyberia.Data[type][id].components.breastplate } },
      });
      CharacterCyberia.RenderCharacterCyberiaSLot({ type, id, componentType: 'breastplate' });
    },
  },
  RenderStat: function (statData, options) {
    const displayStats = [
      'dim',
      'vel',
      'maxLife',
      'life',
      'deadTime',
      'damage',
      'lifeRegeneration',
      'lifeRegenerationVel',
    ];
    let statsRender = '';
    if (options)
      for (const statKey of Object.keys(options)) {
        statsRender += html` <div class="in fll stat-table-cell stat-table-cell-key">
            <div class="in section-mp">${statKey}</div>
          </div>
          <div class="in fll stat-table-cell">
            <div class="in section-mp">${options[statKey]}</div>
          </div>`;
      }
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
  questItem: {
    render: function ({ slotId, displayId, disabledCount, bagId }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      let count = 0;

      if (!disabledCount) count = QuestManagementCyberia.countQuestItems({ type: 'user', id: 'main', displayId });

      if (count === 0) return;

      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId} bag-slot-value-${bagId}-${displayId}">${getK(count)}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/quest/${displayId}/animation.gif" />
          <div class="in bag-slot-type-text">quest item</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      const setQuestItem = uniqueArray(
        ElementsCyberia.Data.user.main.model.quests
          .map((q) => q.displaySearchObjects.filter((s) => s.step === q.currentStep).map((s) => s.id))
          .flat(),
      );

      for (const displayId of setQuestItem) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ slotId, displayId, bagId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
    update: ({ bagId, displayId, type, id }) => {
      const value = QuestManagementCyberia.countQuestItems({ type, id, displayId });
      if (s(`.bag-slot-value-${bagId}-${displayId}`)) htmls(`.bag-slot-value-${bagId}-${displayId}`, getK(value));
    },
  },
  coin: {
    renderBagCyberiaSlots: ({ bagId, indexBagCyberia, quantity }) => {
      htmls(
        `.${bagId}-${indexBagCyberia}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">
              x<span class="bag-slot-value-${bagId}-${indexBagCyberia}"
                >${getK(quantity !== undefined ? quantity : ElementsCyberia.Data.user.main.coin)}</span
              >
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/coin/animation.gif" />
          <div class="in bag-slot-type-text">currency</div>
          <div class="in bag-slot-name-text">coin</div>`,
      );
      indexBagCyberia++;
      return indexBagCyberia;
    },
    update: ({ bagId, type, id }) => {
      if (s(`.bag-slot-value-${bagId}-0`))
        htmls(`.bag-slot-value-${bagId}-0`, getK(ElementsCyberia.Data[type][id].coin));
    },
  },
  skin: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data.user.main.components.skin.filter((s) => s.displayId === displayId).length;
      const componentData = ElementsCyberia.Data.user.main.components.skin.find((s) => s.displayId === displayId);
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${getK(count)}</span>
            </div>
          </div>
          <img
            class="abs center bag-slot-img"
            src="${getProxyPath()}assets/skin/${displayId}/08/0.${componentData.extension}"
          />
          <div class="in bag-slot-type-text">skin</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-skin-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/skin/${displayId}/08/0.${componentData.extension}`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-skin-${slotId}`,
            item: { type: 'skin', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(ElementsCyberia.Data.user.main.components.skin.map((s) => s.displayId))) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ displayId, slotId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  weapon: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data.user.main.weapon.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${getK(count)}</span>
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
          title: renderViewTitle({
            img: `${getProxyPath()}assets/weapon/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-weapon-${slotId}`,
            item: { type: 'weapon', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(ElementsCyberia.Data.user.main.weapon.tree.map((i) => i.id))) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  breastplate: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data.user.main.breastplate.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${getK(count)}</span>
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
          title: renderViewTitle({
            img: `${getProxyPath()}assets/breastplate/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-breastplate-${slotId}`,
            item: { type: 'breastplate', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(ElementsCyberia.Data.user.main.breastplate.tree.map((i) => i.id))) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  skill: {
    render: function ({ slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data.user.main.skill.tree.filter((s) => s.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${getK(count)}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/skill/${displayId}/animation.gif" />
          <div class="in bag-slot-type-text">${SkillCyberiaData[displayId].type}<br />skill</div>
          <div class="in bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-skill-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/skill/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            idModal: `modal-skill-${slotId}`,
            item: { type: 'skill', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: Modal.mobileModal(),
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(ElementsCyberia.Data.user.main.skill.tree.map((s) => s.id))) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  xp: {
    renderBagCyberiaSlots: ({ bagId, indexBagCyberia }) => {
      htmls(
        `.${bagId}-${indexBagCyberia}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">x<span class="bag-slot-value-${bagId}-${indexBagCyberia}">0</span></div>
          </div>
          <div class="abs center text-icon">XP</div>
          <div class="in bag-slot-type-text">experience</div>
          <div class="in bag-slot-name-text">level 0</div>`,
      );
      indexBagCyberia++;
      return indexBagCyberia;
    },
  },
  wallet: {
    renderBagCyberiaSlots: ({ bagId, indexBagCyberia }) => {
      htmls(
        `.${bagId}-${indexBagCyberia}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">x<span class="bag-slot-value-${bagId}-${indexBagCyberia}">1</span></div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/ui-icons/wallet.png" />
          <div class="in bag-slot-type-text">wallet</div>
          <div class="in bag-slot-name-text">simple leather</div>`,
      );
      const slotId = `${bagId}-${indexBagCyberia}`;
      SlotEvents[slotId] = {};
      SlotEvents[slotId].onClick = async (e) => {
        s(`.main-btn-wallet`).click();
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);

      indexBagCyberia++;
      return indexBagCyberia;
    },
  },
};

const BagCyberia = {
  Tokens: {},
  Render: async function (options) {
    const bagId = options && 'id' in options ? options.id : getId(this.Tokens, 'slot-');
    const totalSlots = 15;
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

            const toElementsCyberia = {
              srcElement: evt.originalEvent.srcElement,
              target: evt.originalEvent.target,
              toElement: evt.originalEvent.toElement,
            };

            const { item } = evt; // parentElement parentNode children(array)

            const dataBagCyberiaFrom = {
              type: Array.from(item.children)[2].innerHTML,
              id: Array.from(item.children)[3].innerHTML,
            };
            const dataBagCyberiaTo = {};

            let dataClassBagCyberiaFrom = [];
            let dataClassBagCyberiaTo = [];

            for (const toElementKey of Object.keys(toElementsCyberia)) {
              try {
                dataClassBagCyberiaTo = dataClassBagCyberiaTo.concat(
                  Array.from(toElementsCyberia[toElementKey].parentNode.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagCyberiaTo = dataClassBagCyberiaTo.concat(
                  Array.from(toElementsCyberia[toElementKey].parentElement.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagCyberiaTo = dataClassBagCyberiaTo.concat(
                  Array.from(toElementsCyberia[toElementKey].parentNode.parentNode.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
              try {
                dataClassBagCyberiaTo = dataClassBagCyberiaTo.concat(
                  Array.from(toElementsCyberia[toElementKey].parentElement.parentElement.classList),
                );
              } catch (error) {
                logger.warn(error);
              }
            }

            dataClassBagCyberiaTo = uniqueArray(dataClassBagCyberiaTo);

            logger.info('Sortable BagCyberia From:', { dataClassBagCyberiaFrom, dataBagCyberiaFrom });
            logger.info('Sortable BagCyberia To:', { dataClassBagCyberiaTo, dataBagCyberiaTo });
            if (dataBagCyberiaFrom.type.split('<br>')[1])
              dataBagCyberiaFrom.type = dataBagCyberiaFrom.type.split('<br>')[1];

            if (
              Object.values(dataClassBagCyberiaTo).find(
                (c) => c.startsWith(`character-`) || c.startsWith('main-skill-slot'),
              ) &&
              ['skin', 'weapon', 'breastplate', 'skill'].includes(dataBagCyberiaFrom.type)
            ) {
              const payLoadEquip = { type: 'user', id: 'main' };
              payLoadEquip[dataBagCyberiaFrom.type] = { id: dataBagCyberiaFrom.id };
              ItemModal.Equip[dataBagCyberiaFrom.type](payLoadEquip);
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

      let indexBagCyberia = 0;
      indexBagCyberia = await Slot.coin.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.xp.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.skin.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.skill.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.weapon.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.breastplate.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      // indexBagCyberia = await Slot.wallet.renderBagCyberiaSlots({ bagId, indexBagCyberia });
      indexBagCyberia = await Slot.questItem.renderBagCyberiaSlots({ bagId, indexBagCyberia });
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

export { BagCyberia, Slot, SlotEvents, ItemModal };
