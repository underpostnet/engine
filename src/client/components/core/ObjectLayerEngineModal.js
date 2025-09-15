import { CoreService } from '../../services/core/core.service.js';
import { dynamicCol } from './Css.js';
import { DropDown } from './DropDown.js';
import { Translate } from './Translate.js';
import { getProxyPath, s, hexToRgbA } from './VanillaJs.js';

const ObjectLayerEngineModal = {
  templates: [],
  RenderTemplate: (colorTemplate) => {
    colorTemplate.forEach((y, indexY) => {
      y.forEach((x, indexX) => {
        s('object-layer-engine')._applyBrush(indexX, indexY, [...hexToRgbA(x), 255], true);
      });
    });
  },
  Render: async (options = { idModal: '' }) => {
    await import(`${getProxyPath()}components/core/ObjectLayerEngine.js`);
    // await import(`${getProxyPath()}components/core/WebComponent.js`);

    for (const url of [
      `${getProxyPath()}assets/templates/item-skin-08.json`,
      `${getProxyPath()}assets/templates/item-skin-06.json`,
    ]) {
      ObjectLayerEngineModal.templates.push({
        label: url.split('/').pop(),
        id: url.split('/').pop(),
        data: JSON.parse(await CoreService.getRaw({ url })).color,
      });
    }

    const cells = 26;
    const pixelSize = parseInt(320 / cells);
    const idSectionA = 'template-section-a';

    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: idSectionA })}
      <div class="fl">
        <div class="in fll ${idSectionA}-col-a">
          <div class="in section-mp">
            ${await DropDown.Render({
              value: ObjectLayerEngineModal.templates[0].id,
              label: html`${Translate.Render('select-template')}`,
              data: ObjectLayerEngineModal.templates.map((template) => {
                return {
                  value: template.id,
                  display: html`<i class="fa-solid fa-paint-roller"></i> ${template.label}`,
                  onClick: async () => {
                    ObjectLayerEngineModal.RenderTemplate(template.data);
                  },
                };
              }),
            })}
          </div>
        </div>
        <div class="in fll ${idSectionA}-col-b">
          <object-layer-engine id="ole" width="${cells}" height="${cells}" pixel-size="${pixelSize}">
          </object-layer-engine>
        </div>
      </div>
    `;
  },
};

export { ObjectLayerEngineModal };
