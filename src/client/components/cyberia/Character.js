import { getId } from '../core/CommonJs.js';
import { CharacterSlotType } from './CommonCyberia.js';
import { Elements } from './Elements.js';

const Character = {
  Data: {},
  Render: async function (options) {
    const id = options.id ? options.id : getId(this.Data, 'character-');
    return html`
      <div class="inl section-mp character-container">
        <div class="in character-equip-container">
          ${Object.keys(CharacterSlotType)
            .map(
              (slotType) =>
                html`<div class="abs center character-slot character-slot-${slotType}">
                  <div class="in character-slot-type-text">${slotType.replace('-', html`<br />`)}</div>
                </div>`,
            )
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
    `;
  },
};

export { Character };
