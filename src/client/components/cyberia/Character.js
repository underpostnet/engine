import Sortable from 'sortablejs';
import { getId, uniqueArray } from '../core/CommonJs.js';
import { ItemModal, Slot } from './Bag.js';
import { CharacterSlotType } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { htmls, s } from '../core/VanillaJs.js';
import { loggerFactory } from '../core/Logger.js';

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

    setTimeout(() => {
      const type = 'user';
      const id = 'main';
      for (const componentType of Object.keys(CharacterSlotType)) {
        if (!Elements.Data[type][id].components[componentType]) continue;
        this.RenderCharacterSLot({ type, id, componentType });
      }
      this.renderCharacterStat();
    });
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
                    onEnd: function (/**Event*/ evt) {
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
                        dataClassBagTo = dataClassBagTo.concat(
                          Array.from(toElements[toElementKey].parentNode.classList),
                        );
                        dataClassBagTo = dataClassBagTo.concat(
                          Array.from(toElements[toElementKey].parentElement.classList),
                        );
                        dataClassBagTo = dataClassBagTo.concat(
                          Array.from(toElements[toElementKey].parentNode.parentNode.classList),
                        );
                        dataClassBagTo = dataClassBagTo.concat(
                          Array.from(toElements[toElementKey].parentElement.parentElement.classList),
                        );
                      }

                      dataClassBagTo = uniqueArray(dataClassBagTo);

                      logger.info('Sortable Bag From:', { dataClassBagFrom, dataBagFrom });
                      logger.info('Sortable Bag To:', { dataClassBagTo, dataBagTo });

                      if (
                        Object.values(dataClassBagTo).find((c) => c.startsWith(`character-`)) === undefined &&
                        ['skin', 'weapon'].includes(dataBagFrom.type)
                      )
                        return ItemModal.Unequip[dataBagFrom.type]({ type: 'user', id: 'main' });

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
              .map(
                (skillKey, i) =>
                  html`
                    <div class="abs center character-slot-skill character-slot-skill-${i}">
                      <div class="in character-slot-type-text">skill [${skillKey.toUpperCase()}]</div>
                    </div>
                  `,
              )
              .join('')}
          </div>
        </div>
        <div class="in fll section-mp character-container character-container-stats"></div>
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
      });
    else if (s(`.character-slot-${componentType}`))
      htmls(`.character-slot-${componentType}`, this.renderEmptyCharacterSlot(componentType));
  },
  renderEmptyCharacterSlot: function (slotType) {
    return html` <div class="in character-slot-type-text">${slotType.replace('-', html`<br />`)}</div>`;
  },
  renderCharacterStat: function () {
    if (s(`.character-container-stats`))
      htmls(`.character-container-stats`, ItemModal.RenderStat(Elements.Data.user.main));
  },
};

export { Character };
