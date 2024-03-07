import { getId } from '../core/CommonJs.js';
import { CharacterSlotType } from './CommonCyberia.js';

const Character = {
  Data: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Data, 'character-');
    return html`
      <div class="in section-mp character-container">
        ${Object.keys(CharacterSlotType)
          .map(
            (slotType) =>
              html`<div class="abs center character-slot character-slot-${slotType}">
                <div class="in character-slot-type-text">${slotType.replace('-', html`<br />`)}</div>
              </div>`,
          )
          .join('')}
      </div>
    `;
  },
};

export { Character };
