import Sortable from 'sortablejs';
import { getId, range } from '../core/CommonJs.js';
import { s } from '../core/VanillaJs.js';

// https://github.com/underpostnet/underpost-engine/blob/2.0.0/src/cyberia/components/bag.js

const Bag = {
  Tokens: {},
  Render: async function (options) {
    const bagId = options && 'id' in options ? options.id : getId(this.Tokens, 'slot-');
    const totalSlots = 10;
    this.Tokens[bagId] = {};
    setTimeout(() => {
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
    });
    return html`
      <div class="fl ${bagId}">
        ${range(1, totalSlots)
          .map((slot) => {
            setTimeout(() => {
              s(`.${bagId}-${slot}`).onclick = () => console.warn(slot);
            });
            return html` <div class="in fll slot ${bagId}-${slot}" data-id="${slot}">slot ${slot}</div> `;
          })
          .join('')}
      </div>
    `;
  },
};

export { Bag };
