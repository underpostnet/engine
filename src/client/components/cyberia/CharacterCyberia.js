import Sortable from 'sortablejs';
import { getId, range, timer, uniqueArray } from '../core/CommonJs.js';
import { ItemModal, Slot, SlotEvents } from './BagCyberia.js';
import { CharacterCyberiaStatsType } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { htmls, s } from '../core/VanillaJs.js';
import { loggerFactory } from '../core/Logger.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { ElementPreviewCyberia } from './ElementPreviewCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { borderChar } from '../core/Css.js';

const logger = loggerFactory(import.meta);

const CharacterCyberia = {
  Data: {},
  Render: async function (options) {
    const idModal = options.idModal ? options.idModal : getId(this.Data, 'character-');
    if (this.Data[idModal]) {
      if (this.Data[idModal].sortable)
        for (const sortableInstanceKey of Object.keys(this.Data[idModal].sortable)) {
          this.Data[idModal].sortable[sortableInstanceKey].destroy();
          delete this.Data[idModal].sortable[sortableInstanceKey];
        }
    } else this.Data[idModal] = { sortable: {} };

    setTimeout(async () => {
      const type = 'user';
      const id = 'main';
      for (const componentType of Object.keys(CharacterCyberiaStatsType)) {
        if (!ElementsCyberia.Data[type][id].components[componentType]) continue;
        this.RenderCharacterCyberiaSLot({ type, id, componentType });
      }
      for (const skillKey of Object.keys(ElementsCyberia.Data.user.main.skill.keys))
        this.RenderCharacterCyberiaSkillSLot({
          type,
          id,
          skillKey,
        });
      this.renderCharacterCyberiaStat();
      this.renderCharacterCyberiaPreView();
      LoadingAnimation.img.play(`.character-preview-loading`, 'points');
    });
    const onEnd = function (/**Event*/ evt) {
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
          (Object.values(dataClassBagCyberiaTo).find(
            (c) => c.startsWith(`character-`) || c.startsWith(`character-container-stat`),
          ) === undefined ||
            Object.values(dataClassBagCyberiaTo).find((c) => c.startsWith(`character-container-view`))) &&
          ['skin', 'weapon', 'breastplate', 'skill'].includes(dataBagCyberiaFrom.type)
        ) {
          const payLoadEquip = { type: 'user', id: 'main' };
          payLoadEquip[dataBagCyberiaFrom.type] = { id: dataBagCyberiaFrom.id };
          ItemModal.Unequip[dataBagCyberiaFrom.type](payLoadEquip);
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
    };
    return html`
      <div class="fl">
        <div class="in fll section-mp character-container">
          <div class="in character-equip-container">
            ${Object.keys(CharacterCyberiaStatsType)
              .map((slotType, i) => {
                setTimeout(() => {
                  this.Data[idModal].sortable[slotType] = new Sortable(s(`.character-slot-container-${slotType}`), {
                    animation: 150,
                    group: `character-equip-sortable-${slotType}`,
                    forceFallback: true,
                    fallbackOnBody: true,

                    // chosenClass: 'css-class',
                    // ghostClass: 'css-class',
                    // Element dragging ended
                    onEnd,
                  });
                });
                return html`<div class="abs center character-slot character-slot-container-${slotType}">
                  <div data-id="0" class="in sub-character-slot character-slot-${slotType}">
                    ${this.renderEmptyCharacterCyberiaSlot(slotType)}
                  </div>
                </div>`;
              })
              .join('')}
          </div>
          <div class="in character-skill-container">
            ${Object.keys(ElementsCyberia.Data.user.main.skill.keys)
              .map((skillKey) => {
                skillKey = `${skillKey}-skill`;
                setTimeout(() => {
                  this.Data[idModal].sortable[skillKey] = new Sortable(s(`.character-slot-container-${skillKey}`), {
                    animation: 150,
                    group: `character-equip-sortable-${skillKey}`,
                    forceFallback: true,
                    fallbackOnBody: true,

                    // chosenClass: 'css-class',
                    // ghostClass: 'css-class',
                    // Element dragging ended
                    onEnd,
                  });
                });
                return html`
                  <div class="abs center character-slot-skill character-slot-container-${skillKey}">
                    <div data-id="0" class="in sub-character-slot character-slot-${skillKey}">
                      ${this.renderEmptyCharacterCyberiaSlot(skillKey)}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
        <div class="in fll section-mp character-container character-container-stats"></div>
        <div class="in fll section-mp character-container character-container-view">
          <div class="abs center character-preview-loading"></div>
        </div>
      </div>
    `;
  },
  RenderCharacterCyberiaSLot: function (options = { id: 'main', type: 'user', componentType: 'skin' }) {
    const { id, type, componentType } = options;
    const component = ElementsCyberia.Data[type][id].components[componentType].find((e) => e.current);
    if (component)
      Slot[componentType].render({
        bagId: 'cyberia-bag',
        slotId: `character-slot-${componentType}`,
        displayId: component.displayId,
        disabledCount: true,
      });
    else if (s(`.character-slot-${componentType}`))
      htmls(`.character-slot-${componentType}`, this.renderEmptyCharacterCyberiaSlot(componentType));
    this.renderCharacterCyberiaPreView();
  },
  RenderCharacterCyberiaSkillSLot: function (options = { id: 'main', type: 'user', skillKey: '' }) {
    const { type, id, skillKey } = options;
    const componentType = `${skillKey}-skill`;
    if (ElementsCyberia.Data[type][id].skill.keys[skillKey]) {
      Slot.skill.render({
        bagId: 'cyberia-bag',
        slotId: `character-slot-${componentType}`,
        displayId: ElementsCyberia.Data[type][id].skill.keys[skillKey],
        disabledCount: true,
      });
    } else if (s(`.character-slot-${componentType}`))
      htmls(`.character-slot-${componentType}`, this.renderEmptyCharacterCyberiaSlot(componentType));
  },
  CharacterCyberiaPreViewInterval: {},
  renderCharacterCyberiaPreView: async function (
    options = { container: 'character-container-view', type: 'user', id: 'main', positionId: '18' },
  ) {
    const { container, type, id, positionId } = options;

    const intervalTime = 200;
    const totalFrames = 5;

    if (!s(`.${container}`)) return;
    const containerId = await ElementPreviewCyberia.renderElement({
      type,
      id,
      renderId: 'element-interaction-panel',
      positionId,
    });

    const frames = [];
    for (const frame of range(0, totalFrames - 1)) {
      try {
        const characterImg = await ElementPreviewCyberia.Tokens[
          `element-interaction-panel`
        ].AppInstance.renderer.extract.image(ElementPreviewCyberia.renderElementContainers[containerId]);
        frames[frame] = characterImg.currentSrc;
      } catch (error) {
        logger.error(error);
      }
      await timer(intervalTime);
    }
    ElementPreviewCyberia.renderElementContainers[containerId].removeChildren();
    ElementPreviewCyberia.renderElementContainers[containerId].destroy();
    delete ElementPreviewCyberia.renderElementContainers[containerId];

    if (!s(`.${container}`)) return;

    htmls(
      `.${container}`,
      html`
        ${options.customStyle
          ? options.customStyle
          : html`<style>
              .${container}-header {
                height: 100px;
              }
              .${container}-body {
                height: 350px;
              }
              .${container}-img {
                width: 100%;
                height: auto;
                top: 70%;
              }
            </style>`}
        <div class="in ${container}-header">
          <div class="abs center">
            ${ElementsCyberia.getDisplayTitle({ type, id, htmlTemplate: true })}<br />
            ${ElementsCyberia.getDisplayName({ type, id, htmlTemplate: true })}
          </div>
        </div>
        <div class="in ${container}-body">
          ${frames
            .map(
              (v, i) =>
                html`<img
                  class="abs center ${container}-img character${container}-frame-${i} ${i === 0 ? '' : 'hide'}"
                  src="${v}"
                />`,
            )
            .join('')}
        </div>
      `,
    );
    let frame = 0;
    if (this.CharacterCyberiaPreViewInterval[container]) clearInterval(this.CharacterCyberiaPreViewInterval[container]);
    this.CharacterCyberiaPreViewInterval[container] = setInterval(() => {
      if (!s(`.${container}`) || !s(`.character${container}-frame-${frame}`))
        return clearInterval(this.CharacterCyberiaPreViewInterval[container]);
      s(`.character${container}-frame-${frame}`).classList.add('hide');
      frame++;
      if (frame === frames.length) frame = 0;
      s(`.character${container}-frame-${frame}`).classList.remove('hide');
    }, intervalTime);
  },
  renderEmptyCharacterCyberiaSlot: function (slotType) {
    this.renderCharacterCyberiaPreView();
    return html` <div class="abs center character-slot-type-text">${slotType.replace('-', html`<br />`)}</div>`;
  },
  renderCharacterCyberiaStat: function () {
    if (s(`.character-container-stats`))
      htmls(`.character-container-stats`, ItemModal.RenderStat(ElementsCyberia.Data.user.main));
  },
};

export { CharacterCyberia };
