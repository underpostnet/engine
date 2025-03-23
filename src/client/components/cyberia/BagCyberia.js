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
import { NotificationManager } from '../core/NotificationManager.js';
import { CyberiaItemService } from '../../services/cyberia-item/cyberia-item.service.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';

const logger = loggerFactory(import.meta);

const ItemModal = {
  Render: async function (
    options = {
      idModal: '',
      item: { type: '', id: '' },
      bagId: '',
      itemData: {},
      context: '',
      storageBotId: '',
    },
  ) {
    const { idModal, item, bagId, itemData, storageBotId } = options;
    const id0 = `${idModal}-section-0`;
    const id1 = `${idModal}-section-1`;

    setTimeout(async () => {
      htmls(`.${id0}-render-col-a`, this.RenderStat(Stat.get[item.id](), { 'item type': item.type }));
      switch (options.context) {
        case 'seller':
          {
            const elementOwnerType = 'user';
            const elementOwnerId = 'main';
            const sellFactor = 0.5;
            const itemStat = Stat.get[itemData.id]();
            const { basePrice } = itemStat;
            let countCurrentItem = 0;
            switch (item.type) {
              case 'weapon':
                {
                  countCurrentItem = ElementsCyberia.Data[elementOwnerType][elementOwnerId].weapon.tree.filter(
                    (i) => i.id === item.id,
                  ).length;
                }

                break;

              default:
                break;
            }

            htmls(
              `.${id0}-render-col-b`,
              html`<div class="section-mp item-modal-container">
                  ${await BtnIcon.Render({
                    label: html`
                      <div class="in fll">${Translate.Render('buy')}</div>
                      <div class="in flr">
                        ${ElementsCyberia.Data[elementOwnerType][elementOwnerId].coin} /
                        <span class="total-price-buy-${item.type}-${idModal}">${basePrice}</span>
                        <img
                          class="inl icon-img-btn-item-modal"
                          src="${getProxyPath()}assets/coin/coin/animation.gif"
                        />
                      </div>
                    `,
                    type: 'button',
                    class: `btn-buy-${item.type}-${idModal} inl wfa`,
                  })}
                  <div class="fl">
                    <div class="in flr">
                      x<input
                        type="number"
                        value="1"
                        min="0"
                        max="10"
                        class="item-modal-quantity-input buy-btn-quantity-input-${item.type}-${idModal}"
                      />
                      / 10
                    </div>
                  </div>
                </div>

                <div class="section-mp item-modal-container">
                  ${await BtnIcon.Render({
                    label: html`
                      <div class="in fll">${Translate.Render('sell')}</div>
                      <div class="in flr">
                        <span class="total-price-sell-${item.type}-${idModal}">${basePrice * sellFactor}</span>
                        / ${basePrice * countCurrentItem * sellFactor}
                        <img
                          class="inl icon-img-btn-item-modal"
                          src="${getProxyPath()}assets/coin/coin/animation.gif"
                        />
                      </div>
                    `,
                    type: 'button',
                    class: `btn-sell-${item.type}-${idModal} inl wfa`,
                  })}
                  <div class="fl">
                    <div class="in flr">
                      x<input
                        type="number"
                        value="1"
                        min="0"
                        max="${countCurrentItem}"
                        class="item-modal-quantity-input sell-btn-quantity-input-${item.type}-${idModal}"
                      />
                      / ${countCurrentItem}
                    </div>
                  </div>
                </div> `,
            );
            const onChangeQuantityBuyItemInput = () => {
              htmls(
                `.total-price-buy-${item.type}-${idModal}`,
                s(`.buy-btn-quantity-input-${item.type}-${idModal}`).value * basePrice,
              );
            };
            s(`.buy-btn-quantity-input-${item.type}-${idModal}`).onblur = onChangeQuantityBuyItemInput;
            s(`.buy-btn-quantity-input-${item.type}-${idModal}`).oninput = onChangeQuantityBuyItemInput;
            EventsUI.onClick(`.btn-buy-${item.type}-${idModal}`, async () => {
              if (ElementsCyberia.Data[elementOwnerType][elementOwnerId].coin < basePrice) {
                NotificationManager.Push({
                  html: Translate.Render('insufficient-cash'),
                  status: 'error',
                });
                return;
              }
              const result = await CyberiaItemService.post({ id: `buy/${storageBotId}/${item.type}/${item.id}` });
              if (result.status === 'success') {
                ElementsCyberia.Data[elementOwnerType][elementOwnerId].coin -= basePrice;
                Slot.coin.update({ bagId: 'cyberia-bag', type: elementOwnerType, id: elementOwnerId });

                ElementsCyberia.Data[elementOwnerType][elementOwnerId][item.type].tree.push({ id: item.id });
                if (
                  !ElementsCyberia.Data[elementOwnerType][elementOwnerId].components[item.type].find(
                    (c) => c.displayId === item.id,
                  )
                ) {
                  ElementsCyberia.Data[elementOwnerType][elementOwnerId].components[item.type].push(
                    DisplayComponent.get[item.id](),
                  );
                }
                Slot[item.type].update({
                  bagId: 'cyberia-bag',
                  displayId: item.id,
                  type: elementOwnerType,
                  id: elementOwnerId,
                });
              }
            });

            const onChangeQuantitySellItemInput = () => {
              htmls(
                `.total-price-sell-${item.type}-${idModal}`,
                s(`.sell-btn-quantity-input-${item.type}-${idModal}`).value * basePrice * sellFactor,
              );
            };
            s(`.sell-btn-quantity-input-${item.type}-${idModal}`).onblur = onChangeQuantitySellItemInput;
            s(`.sell-btn-quantity-input-${item.type}-${idModal}`).oninput = onChangeQuantitySellItemInput;
            EventsUI.onClick(`.btn-sell-${item.type}-${idModal}`, () => {});
          }
          break;

        case 'reward': {
          break;
        }

        default:
          {
            if (['resources', 'coin', 'quest'].includes(item.type)) break;
            htmls(
              `.${id0}-render-col-b`,
              html`${await BtnIcon.Render({
                label: renderViewTitle({
                  'ui-icon': `equip.png`,
                  text: html`${Translate.Render('equip')}`,
                  top: 2,
                  topText: 0,
                }),
                type: 'button',
                class: `btn-equip-${item.type}-${idModal} section-mp-btn inl wfa`,
              })}
              ${await BtnIcon.Render({
                label: renderViewTitle({
                  'ui-icon': `unequip.png`,
                  text: html`${Translate.Render('unequip')}`,
                  top: 2,
                  topText: 0,
                }),
                type: 'button',
                class: `btn-unequip-${item.type}-${idModal} section-mp-btn inl wfa`,
              })} `,
            );
            EventsUI.onClick(`.btn-equip-${item.type}-${idModal}`, () => {
              const payload = BagCyberia.Tokens[bagId].owner;
              payload[item.type] = item;
              this.Equip[item.type](payload);
            });
            EventsUI.onClick(`.btn-unequip-${item.type}-${idModal}`, () => {
              const payload = BagCyberia.Tokens[bagId].owner;
              payload[item.type] = item;
              this.Unequip[item.type](payload);
            });
          }
          break;
      }

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
    skill: function ({ type, id, skill, disabledSubEquip }) {
      console.log('Equip skill', { type, id, skill });
      ElementsCyberia.Data[type][id].skill.keys[SkillCyberiaData[skill.id].type] = skill.id;
      SocketIo.Emit(type, {
        status: 'update-skill',
        element: { skill: ElementsCyberia.Data[type][id].skill },
      });
      const currentWeapon = ElementsCyberia.Data[type][id].components.weapon.find((w) => w.current);
      if (currentWeapon && currentWeapon.displayId !== skill.id)
        switch (currentWeapon.displayId) {
          case 'hatchet':
            {
              ItemModal.Unequip.weapon({ type, id, weapon: skill, disabledSubEquip: true });
            }

            break;

          case 'atlas_pistol_mk2_bullet':
            {
              ItemModal.Unequip.weapon({ type, id, weapon: { id: 'atlas_pistol_mk2' }, disabledSubEquip: true });
            }
            break;

          default:
            break;
        }
      if (!disabledSubEquip)
        switch (skill.id) {
          case 'hatchet':
            {
              this.weapon({ type, id, weapon: skill, disabledSubEquip: true });
            }
            break;
          case 'atlas_pistol_mk2_bullet':
            {
              this.weapon({ type, id, weapon: { id: 'atlas_pistol_mk2' }, disabledSubEquip: true });
            }
            break;

          default:
            break;
        }
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
    weapon: function ({ type, id, weapon, disabledSubEquip }) {
      const currentWeapon = ElementsCyberia.Data[type][id].components.weapon.find((c) => c.current);
      if (currentWeapon) {
        ItemModal.Unequip.weapon({ type, id, weapon: { id: currentWeapon.displayId }, disabledSubEquip });
      }
      ElementsCyberia.Data[type][id].components.weapon = ElementsCyberia.Data[type][id].components.weapon.map(
        (weaponData) => {
          weaponData.enabled = weaponData.displayId === weapon.id;
          weaponData.current = weaponData.displayId === weapon.id;
          return weaponData;
        },
      );
      ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
      if (!disabledSubEquip)
        switch (weapon.id) {
          case 'hatchet':
            {
              this.skill({ type, id, skill: weapon, disabledSubEquip: true });
            }
            break;
          case 'atlas_pistol_mk2':
            {
              this.skill({ type, id, skill: { id: 'atlas_pistol_mk2_bullet' }, disabledSubEquip: true });
            }
            break;
          default:
            break;
        }
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
    skill: function ({ type, id, skill, disabledSubEquip }) {
      console.log('Unequip skill', { type, id, skill });
      ElementsCyberia.Data[type][id].skill.keys[SkillCyberiaData[skill.id].type] = null;
      if (!disabledSubEquip)
        switch (skill.id) {
          case 'hatchet':
            {
              this.weapon({ type, id, weapon: skill, disabledSubEquip: true });
            }
            break;
          case 'atlas_pistol_mk2_bullet':
            {
              this.weapon({ type, id, weapon: { id: 'atlas_pistol_mk2' }, disabledSubEquip: true });
            }
            break;
          default:
            break;
        }
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
    weapon: function ({ type, id, weapon, disabledSubEquip }) {
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
      if (!disabledSubEquip)
        switch (weapon.id) {
          case 'hatchet':
            {
              this.skill({ type, id, skill: weapon, disabledSubEquip: true });
            }
            break;
          case 'atlas_pistol_mk2':
            {
              this.skill({ type, id, skill: { id: 'atlas_pistol_mk2_bullet' }, disabledSubEquip: true });
            }
            break;
          default:
            break;
        }
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
    // TODO: xp, and level feature
    const displayStats = [
      'dim',
      'vel',
      'maxLife',
      'life',
      'deadTime',
      'damage',
      'lifeRegeneration',
      'lifeRegenerationVel',
      'basePrice',
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
          <div class="in section-mp" ${statKey === 'basePrice' ? `style="top: -10px"` : ''}>
            ${statData[statKey]}
            ${statKey === 'basePrice'
              ? html` <img
                  class="inl coin-slot-icon-img"
                  style="top: 6px"
                  src="${getProxyPath()}assets/coin/coin/animation.gif"
                />`
              : ''}
          </div>
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
  resource: {
    render: function ({ bagId, slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].resource.tree.find((s) => s.id === displayId).quantity;
      const componentData = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].components.resource.find((s) => s.displayId === displayId);
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${bagId}-${displayId}">${getK(count)}</span>
            </div>
          </div>
          <img
            class="abs center bag-slot-img"
            src="${getProxyPath()}assets/resources/${displayId}/08/0.${componentData.extension}"
          />
          <div class="abs bag-slot-type-text">resource</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-resources-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/resources/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            bagId,
            idModal: `modal-resources-${slotId}`,
            item: { type: 'resources', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia, displayId }) {
      const setQuestItem = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].resource.tree.map((r) => r.id);
      for (const id of setQuestItem) {
        if (displayId && displayId !== id) continue;
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, slotId, displayId: id });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
    update: async ({ bagId, displayId, type, id }) => {
      if (!s(`.modal-bag`)) return;
      if (!s(`.bag-slot-value-${bagId}-${displayId}`)) {
        BagCyberia.indexBagCyberia = await Slot.resource.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: BagCyberia.Tokens[bagId].indexBagCyberia,
          displayId,
        });
      }
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].resource.tree.find((s) => s.id === displayId).quantity;
      htmls(`.bag-slot-value-${bagId}-${displayId}`, getK(count));
    },
  },
  questItem: {
    render: function ({ bagId, slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = { displayId: `${displayId}` };
      if (!s(`.${slotId}`)) return;
      let count = 0;

      if (!disabledCount)
        count = QuestManagementCyberia.countQuestItems({ ...BagCyberia.Tokens[bagId].owner, displayId });

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
          <div class="abs bag-slot-type-text">quest item</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-quest-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/quest/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            bagId,
            idModal: `modal-quest-${slotId}`,
            item: { type: 'quest', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      const setQuestItem = uniqueArray(
        ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].model.quests
          ? ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].model.quests
              .map((q) =>
                q.displaySearchObjects
                  .filter((s) => QuestComponent.componentsScope[s.id].questKeyContext === 'displaySearchObjects')
                  .map((s) => s.id),
              )
              .flat()
          : [],
      );

      for (const displayId of setQuestItem) {
        if (s(`.bag-slot-value-${bagId}-${displayId}`)) continue;
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
    update: async ({ bagId, displayId, type, id }) => {
      const value = QuestManagementCyberia.countQuestItems({ type, id, displayId });
      if (value > 0 && !s(`.bag-slot-value-${bagId}-${displayId}`)) {
        BagCyberia.indexBagCyberia = await Slot.questItem.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: BagCyberia.Tokens[bagId].indexBagCyberia,
          displayId,
        });
      } else if (value === 0 && s(`.bag-slot-value-${bagId}-${displayId}`)) {
        htmls(`.${Object.keys(SlotEvents).find((slotId) => SlotEvents[slotId].displayId === displayId)}`, '');
      } else if (s(`.bag-slot-value-${bagId}-${displayId}`))
        htmls(`.bag-slot-value-${bagId}-${displayId}`, getK(value));
    },
  },
  coin: {
    render: ({ bagId, slotId, quantity }) => {
      SlotEvents[slotId] = {};
      htmls(
        `.${slotId}`,
        html` <div class="abs bag-slot-count">
            <div class="abs center">x<span class="bag-slot-value-${slotId}">${getK(quantity)}</span></div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/coin/coin/animation.gif" />
          <div class="abs bag-slot-type-text">currency</div>
          <div class="abs bag-slot-name-text">coin</div>`,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-coin-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/coin/coin/animation.gif`,
            text: html`coin`,
          }),
          html: html`${await ItemModal.Render({
            bagId,
            idModal: `modal-coin-${slotId}`,
            item: { type: 'coin', id: 'coin' },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: ({ bagId, indexBagCyberia, quantity }) => {
      const slotId = `${bagId}-${indexBagCyberia}`;
      Slot.coin.render({
        bagId,
        slotId,
        quantity:
          quantity !== undefined
            ? quantity
            : ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].coin,
      });
      if (!ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].coin) {
        const bagId = 'cyberia-bag';
        if (s(`.${bagId}-${indexBagCyberia}`)) s(`.${bagId}-${indexBagCyberia}`).classList.add('hide');
      }
      indexBagCyberia++;
      return indexBagCyberia;
    },
    update: ({ bagId, type, id }) => {
      if (type === 'user' && id === 'main') {
        const bagId = 'cyberia-bag';
        if (s(`.${bagId}-0`))
          if (!ElementsCyberia.Data[type][id].coin) s(`.${bagId}-0`).classList.add('hide');
          else if (s(`.${bagId}-0`).classList.contains('hide')) s(`.${bagId}-0`).classList.remove('hide');
      }

      if (s(`.bag-slot-value-${bagId}-0`))
        htmls(`.bag-slot-value-${bagId}-0`, getK(ElementsCyberia.Data[type][id].coin));
    },
  },
  skin: {
    render: function ({ bagId, slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].skin.tree.filter((s) => s.id === displayId).length;
      const componentData = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].components.skin.find((s) => s.displayId === displayId);
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
          <div class="abs bag-slot-type-text">skin</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
        `,
      );
      if (['ghost'].includes(displayId)) s(`.${slotId}`).classList.add('hide');
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
            bagId,
            idModal: `modal-skin-${slotId}`,
            item: { type: 'skin', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(
        ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
          BagCyberia.Tokens[bagId].owner.id
        ].components.skin.map((s) => s.displayId),
      )) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, displayId, slotId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  weapon: {
    render: function ({ bagId, slotId, displayId, disabledCount, itemData, context, storageBotId, quantity }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = quantity
        ? quantity
        : ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
            BagCyberia.Tokens[bagId].owner.id
          ].weapon.tree.filter((i) => i.id === displayId).length;

      let basePrice;
      if (itemData) {
        const itemStat = Stat.get[itemData.id]();
        basePrice = itemStat.basePrice;
      }
      const componentData = DisplayComponent.get[displayId]();
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId} bag-slot-value-${bagId}-${displayId}">${getK(count)}</span>
            </div>
            ${basePrice
              ? html`
                  <div class="abs center" style="width: 100px">
                    x
                    <span class="bag-slot-value-${slotId}">${getK(basePrice)}</span
                    ><img class="inl coin-slot-icon-img" src="${getProxyPath()}assets/coin/coin/animation.gif" />
                  </div>
                `
              : ''}
          </div>
          <img
            class="abs center bag-slot-img"
            src="${getProxyPath()}assets/weapon/${displayId}/06/0.${componentData.extension}"
          />
          <div class="abs bag-slot-type-text">weapon</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
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
            bagId,
            idModal: `modal-weapon-${slotId}`,
            item: { type: 'weapon', id: displayId },
            itemData,
            context,
            storageBotId,
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(
        ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].weapon.tree.map(
          (i) => i.id,
        ),
      )) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
    update: async ({ bagId, displayId, type, id }) => {
      if (!s(`.modal-bag`)) return;
      if (!s(`.bag-slot-value-${bagId}-${displayId}`)) {
        BagCyberia.indexBagCyberia = await Slot.weapon.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: BagCyberia.Tokens[bagId].indexBagCyberia,
          displayId,
        });
      }
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].weapon.tree.filter((s) => s.id === displayId).length;
      htmls(`.bag-slot-value-${bagId}-${displayId}`, getK(count));
    },
  },
  breastplate: {
    render: function ({ bagId, slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].breastplate.tree.filter((i) => i.id === displayId).length;
      htmls(
        `.${slotId}`,
        html`
          <div class="abs bag-slot-count">
            <div class="abs center ${disabledCount ? 'hide' : ''}">
              x<span class="bag-slot-value-${slotId}">${getK(count)}</span>
            </div>
          </div>
          <img class="abs center bag-slot-img" src="${getProxyPath()}assets/breastplate/${displayId}/animation.gif" />
          <div class="abs bag-slot-type-text">breastplate</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
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
            bagId,
            idModal: `modal-breastplate-${slotId}`,
            item: { type: 'breastplate', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(
        ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
          BagCyberia.Tokens[bagId].owner.id
        ].breastplate.tree.map((i) => i.id),
      )) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, slotId, displayId });
        indexBagCyberia++;
      }
      return indexBagCyberia;
    },
  },
  skill: {
    render: function ({ bagId, slotId, displayId, disabledCount }) {
      SlotEvents[slotId] = {};
      if (!s(`.${slotId}`)) return;
      const count = ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][
        BagCyberia.Tokens[bagId].owner.id
      ].skill.tree.filter((s) => s.id === displayId).length;
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
            src="${getProxyPath()}assets/${SkillCyberiaData[displayId].folder}/${displayId}/animation.gif"
          />
          <div class="abs bag-slot-type-text">${SkillCyberiaData[displayId].type}<br />skill</div>
          <div class="abs bag-slot-name-text">${displayId}</div>
        `,
      );
      SlotEvents[slotId].onClick = async (e) => {
        const { barConfig } = await Themes[Css.currentTheme]();
        await Modal.Render({
          id: `modal-skill-${slotId}`,
          barConfig,
          title: renderViewTitle({
            img: `${getProxyPath()}assets/${SkillCyberiaData[displayId].folder}/${displayId}/animation.gif`,
            text: html`${displayId}`,
          }),
          html: html`${await ItemModal.Render({
            bagId,
            idModal: `modal-skill-${slotId}`,
            item: { type: 'skill', id: displayId },
          })}`,
          mode: 'view',
          slideMenu: 'modal-menu',
          maximize: true,
        });
      };
      EventsUI.onClick(`.${slotId}`, SlotEvents[slotId].onClick);
    },
    renderBagCyberiaSlots: function ({ bagId, indexBagCyberia }) {
      for (const displayId of uniqueArray(
        ElementsCyberia.Data[BagCyberia.Tokens[bagId].owner.type][BagCyberia.Tokens[bagId].owner.id].skill.tree.map(
          (s) => s.id,
        ),
      )) {
        const slotId = `${bagId}-${indexBagCyberia}`;
        this.render({ bagId, slotId, displayId });
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
          <div class="abs bag-slot-type-text">experience</div>
          <div class="abs bag-slot-name-text">level 0</div>`,
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
          <div class="abs bag-slot-type-text">wallet</div>
          <div class="abs bag-slot-name-text">simple leather</div>`,
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
const defaultOwner = { type: 'user', id: 'main' };
const BagCyberia = {
  Tokens: { 'cyberia-bag': { owner: defaultOwner } },
  Render: async function (options) {
    const bagId = options && 'id' in options ? options.id : getId(this.Tokens, 'slot-');
    const totalSlots = 20;
    if (!options.owner) options.owner = defaultOwner;
    this.Tokens[bagId] = { bagId, totalSlots, ...options };
    setTimeout(async () => {
      if (!options.disableSortable)
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
                const payLoadEquip = options.owner;
                payLoadEquip[dataBagCyberiaFrom.type] = { id: dataBagCyberiaFrom.id };
                if (s(`.character-container-view`)) {
                  htmls(`.character-container-view`, html`<div class="abs center character-preview-loading"></div>`);
                  LoadingAnimation.img.play(`.character-preview-loading`, 'points');
                }
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

      this.Tokens[bagId].indexBagCyberia = 0;

      if (!options.empty) {
        this.Tokens[bagId].indexBagCyberia = await Slot.coin.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        // this.Tokens[bagId].indexBagCyberia = await Slot.xp.renderBagCyberiaSlots({ bagId, indexBagCyberia: this.Tokens[bagId].indexBagCyberia });
        this.Tokens[bagId].indexBagCyberia = await Slot.skin.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        this.Tokens[bagId].indexBagCyberia = await Slot.skill.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        this.Tokens[bagId].indexBagCyberia = await Slot.weapon.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        this.Tokens[bagId].indexBagCyberia = await Slot.breastplate.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        // this.Tokens[bagId].indexBagCyberia = await Slot.wallet.renderBagCyberiaSlots({ bagId, indexBagCyberia: this.Tokens[bagId].indexBagCyberia });
        this.Tokens[bagId].indexBagCyberia = await Slot.questItem.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
        this.Tokens[bagId].indexBagCyberia = await Slot.resource.renderBagCyberiaSlots({
          bagId,
          indexBagCyberia: this.Tokens[bagId].indexBagCyberia,
        });
      }
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
      if (this.Tokens[bagId].sortable) this.Tokens[bagId].sortable.destroy();
      Modal.writeHTML({
        idModal: this.Tokens[bagId].idModal,
        html: await this.Render(this.Tokens[bagId]),
      });
    }
  },
};

export { BagCyberia, Slot, SlotEvents, ItemModal };
