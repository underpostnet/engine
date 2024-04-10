import { getId } from '../core/CommonJs.js';
import { Slot } from './Bag.js';
import { CharacterSlotType } from './CommonCyberia.js';
import { Elements } from './Elements.js';

const Character = {
  Data: {},
  RenderCharacterSLot: function (options = { id: 'main', type: 'user', componentType: 'skin' }) {
    const { id, type, componentType } = options;
    const component = Elements.Data[type][id].components[componentType].find((e) => e.current);
    if (component)
      Slot[componentType].render({
        slotId: `character-slot-${componentType}`,
        displayId: component.displayId,
      });
  },
  Render: async function (options) {
    const idModal = options.id ? options.id : getId(this.Data, 'character-');
    this.Data[idModal] = {};

    setTimeout(() => {
      const type = 'user';
      const id = 'main';
      for (const componentType of Object.keys(CharacterSlotType)) {
        if (!Elements.Data[type][id].components[componentType]) continue;
        this.RenderCharacterSLot({ type, id, componentType });
      }
    });
    return html`
      <div class="inl section-mp character-container character-drop-zone">
        <div class="in character-equip-container character-drop-zone">
          ${Object.keys(CharacterSlotType)
            .map(
              (slotType) =>
                html`<div class="abs center character-slot character-slot-${slotType} character-drop-zone">
                  <div class="in character-slot-type-text character-drop-zone">
                    ${slotType.replace('-', html`<br />`)}
                  </div>
                </div>`,
            )
            .join('')}
        </div>
        <div class="in character-skill-container character-drop-zone">
          ${Object.keys(Elements.Data.user.main.skill.keys)
            .map(
              (skillKey, i) =>
                html`
                  <div class="abs center character-slot-skill character-slot-skill-${i} character-drop-zone">
                    <div class="in character-slot-type-text character-drop-zone">skill [${skillKey.toUpperCase()}]</div>
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
