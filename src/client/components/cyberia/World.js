import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { FileService } from '../../services/file/file.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { random, range } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

const World = {
  Render: async function (options) {
    const resultBiome = await CyberiaBiomeService.get('all-name');
    NotificationManager.Push({
      html: resultBiome.status === 'success' ? Translate.Render(resultBiome.message) : resultBiome.message,
      status: resultBiome.status,
    });
    let render = '';
    const dataWorld = {
      face: {},
    };
    for (const index of range(1, 6)) {
      render += html`<div class="inl section-mp">
        ${await DropDown.Render({
          // value: ``,
          id: `face-${index}`,
          label: html`face ${index}`,
          data: resultBiome.data.map((biome) => {
            return {
              display: html`${biome.name} <span style="color: #ffcc00; font-size: 15px;">[${biome.biome}]</span>`,
              value: biome._id,
              onClick: async () => {
                dataWorld.face[index] = biome;
              },
            };
          }),
        })}
      </div>`;
    }
    setTimeout(() => {
      const renderFace = async (index) => {
        const resultFile = await FileService.get(dataWorld.face[index].fileId);

        const imageData = resultFile.data[0];

        const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

        const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

        const imageSrc = URL.createObjectURL(imageFile);

        htmls(`.world-${index}`, html` <img class="in face-world-img" src="${imageSrc}" /> `);
      };
      EventsUI.onClick(`.btn-generate-world`, async () => {
        for (const index of range(1, 6)) await renderFace(index);
      });
      EventsUI.onClick(`.btn-generate-random-world`, async () => {
        for (const index of range(1, 6)) {
          s(`.dropdown-option-face-${index}-${resultBiome.data[random(0, resultBiome.data.length - 1)]._id}`).click();
          await renderFace(index);
        }
      });
    });

    return html` ${dynamicCol({ containerSelector: options.idModal, id: 'world' })}
      <style class="style-world-col"></style>
      <div class="fl">
        <div class="in fll world-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-sliders"></i> ${Translate.Render('config')}</div>
            <div class="in">
              ${render}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-world`,
                label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-random-world`,
                label: html`<i class="fa-solid fa-dice"></i> ${Translate.Render(`generate`)} random`,
              })}
            </div>
          </div>
        </div>
        <div class="in fll world-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-cube"></i> ${Translate.Render('world')}</div>
            <div class="in">${await Polyhedron.Render({ id: 'world', idModal: 'world-col-b' })}</div>
          </div>
        </div>
      </div>`;
  },
};

export { World };
