import Sortable from 'sortablejs';
import { getId, range, timer, uniqueArray } from '../core/CommonJs.js';
import { ItemModal, Slot, SlotEvents } from './Bag.js';
import { CharacterSlotType, updateMovementDirection } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { htmls, s } from '../core/VanillaJs.js';
import { loggerFactory } from '../core/Logger.js';
import { MainUser } from './MainUser.js';
import { Pixi } from './Pixi.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';

const logger = loggerFactory(import.meta);

const Character = {
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
      for (const componentType of Object.keys(CharacterSlotType)) {
        if (!Elements.Data[type][id].components[componentType]) continue;
        this.RenderCharacterSLot({ type, id, componentType });
      }
      for (const skillKey of Object.keys(Elements.Data.user.main.skill.keys))
        this.RenderCharacterSkillSLot({
          type,
          id,
          skillKey,
        });
      this.renderCharacterStat();
      this.renderCharacterPreView();
      LoadingAnimation.spinner.play(`.character-preview-loading`);
    });
    const onEnd = function (/**Event*/ evt) {
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
        if (dataBagFrom.type.split('<br>')[1]) dataBagFrom.type = dataBagFrom.type.split('<br>')[1];

        if (
          (Object.values(dataClassBagTo).find(
            (c) => c.startsWith(`character-`) || c.startsWith(`character-container-stat`),
          ) === undefined ||
            Object.values(dataClassBagTo).find((c) => c.startsWith(`character-container-view`))) &&
          ['skin', 'weapon', 'breastplate', 'skill'].includes(dataBagFrom.type)
        ) {
          const payLoadEquip = { type: 'user', id: 'main' };
          payLoadEquip[dataBagFrom.type] = { id: dataBagFrom.id };
          ItemModal.Unequip[dataBagFrom.type](payLoadEquip);
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
            ${Object.keys(CharacterSlotType)
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
                    ${this.renderEmptyCharacterSlot(slotType)}
                  </div>
                </div>`;
              })
              .join('')}
          </div>
          <div class="in character-skill-container">
            ${Object.keys(Elements.Data.user.main.skill.keys)
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
                      ${this.renderEmptyCharacterSlot(skillKey)}
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
  RenderCharacterSLot: function (options = { id: 'main', type: 'user', componentType: 'skin' }) {
    const { id, type, componentType } = options;
    const component = Elements.Data[type][id].components[componentType].find((e) => e.current);
    if (component)
      Slot[componentType].render({
        slotId: `character-slot-${componentType}`,
        displayId: component.displayId,
        disabledCount: true,
      });
    else if (s(`.character-slot-${componentType}`))
      htmls(`.character-slot-${componentType}`, this.renderEmptyCharacterSlot(componentType));
    this.renderCharacterPreView();
  },
  RenderCharacterSkillSLot: function (options = { id: 'main', type: 'user', skillKey: '' }) {
    const { type, id, skillKey } = options;
    const componentType = `${skillKey}-skill`;
    if (Elements.Data[type][id].skill.keys[skillKey]) {
      Slot.skill.render({
        slotId: `character-slot-${componentType}`,
        displayId: Elements.Data[type][id].skill.keys[skillKey],
        disabledCount: true,
      });
    } else if (s(`.character-slot-${componentType}`))
      htmls(`.character-slot-${componentType}`, this.renderEmptyCharacterSlot(componentType));
  },
  renderCharacterPreView: async function () {
    const type = 'user';
    const id = 'main';

    if (!s(`.character-container-view`)) return;

    if (Pixi.Data[type][id].components['lifeBar']) Pixi.Data[type][id].components['lifeBar'].visible = false;
    if (Pixi.Data[type][id].components['coinIndicator'].container)
      Pixi.Data[type][id].components['coinIndicator'].container.visible = false;
    if (Pixi.Data[type][id].components['lifeIndicator'].container)
      Pixi.Data[type][id].components['lifeIndicator'].container.visible = false;
    if (Pixi.Data[type][id].components['username'].container)
      Pixi.Data[type][id].components['username'].container.visible = false;

    const frames = [];
    for (const frame of range(0, 2)) {
      Elements.Data.user.main = updateMovementDirection({
        direction: 's',
        element: Elements.Data.user.main,
        suffix: '0',
      });
      Elements.Data.user.main.components.skin = Elements.Data.user.main.components.skin.map((s) => {
        s.enabled = s.current ? true : false;
        return s;
      });
      Pixi.triggerUpdateDisplay({ type, id });
      const characterImg = await MainUser.PixiMainUser.renderer.extract.image(MainUser.PixiMainUser.stage);
      frames[frame] = characterImg.currentSrc;
      await timer(200);
    }

    htmls(
      `.character-container-view`,
      frames
        .map(
          (v, i) =>
            html`<img
              class="abs center character-view-img character-view-img-frame-${i} ${i === 0 ? '' : 'hide'}"
              src="${v}"
            />`,
        )
        .join(''),
    );

    let frame = 0;
    if (this.CharacterPreViewInterval) clearInterval(this.CharacterPreViewInterval);
    this.CharacterPreViewInterval = setInterval(() => {
      if (!s(`.character-container-view`)) return clearInterval(this.CharacterPreViewInterval);
      s(`.character-view-img-frame-${frame}`).classList.add('hide');
      frame++;
      if (frame === frames.length) frame = 0;
      s(`.character-view-img-frame-${frame}`).classList.remove('hide');
    }, 200);

    if (Pixi.Data[type][id].components['lifeBar']) Pixi.Data[type][id].components['lifeBar'].visible = true;
    if (Pixi.Data[type][id].components['coinIndicator'].container)
      Pixi.Data[type][id].components['coinIndicator'].container.visible = true;
    if (Pixi.Data[type][id].components['lifeIndicator'].container)
      Pixi.Data[type][id].components['lifeIndicator'].container.visible = true;
    if (Pixi.Data[type][id].components['username'].container)
      Pixi.Data[type][id].components['username'].container.visible = true;

    Elements.Data.user.main.components.skin = Elements.Data.user.main.components.skin.map((s) => {
      s.enabled = Elements.Data.user.main.life > 0 ? s.current : s.displayId === 'ghost';
      return s;
    });
    Pixi.triggerUpdateDisplay({ type, id });
  },
  renderEmptyCharacterSlot: function (slotType) {
    this.renderCharacterPreView();
    return html` <div class="abs center character-slot-type-text">${slotType.replace('-', html`<br />`)}</div>`;
  },
  renderCharacterStat: function () {
    if (s(`.character-container-stats`))
      htmls(`.character-container-stats`, ItemModal.RenderStat(Elements.Data.user.main));
  },
};

export { Character };
