import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { range } from '../core/CommonJs.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';

const logger = loggerFactory(import.meta);

const World = {
  Render: async function () {
    const resultBiome = await CyberiaBiomeService.get('all-name');
    NotificationManager.Push({
      html: resultBiome.status === 'success' ? Translate.Render(resultBiome.message) : resultBiome.message,
      status: resultBiome.status,
    });
    let render = '';
    const dataWorld = {
      face: {},
    };
    for (const index of range(0, 5)) {
      render += html`${await DropDown.Render({
        // value: ``,
        label: html`face ${index + 1}`,
        data: resultBiome.data.map((biome) => {
          return {
            display: html`${biome.name} <span style="color: #ffcc00; font-size: 15px;">[${biome.biome}]</span>`,
            value: biome._id,
            onClick: async () => {
              dataWorld.face[index] = biome;
            },
          };
        }),
      })}`;
    }
    setTimeout(() => {
      EventsUI.onClick(`.btn-generate-world`, async () => {
        logger.warn(dataWorld);
      });
    });
    return html` ${render}
      <div class="in">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-generate-world`,
          label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
        })}
      </div>`;
  },
};

export { World };
