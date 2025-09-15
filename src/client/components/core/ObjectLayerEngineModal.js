import { CoreService } from '../../services/core/core.service.js';
import { getProxyPath } from './VanillaJs.js';

const ObjectLayerEngineModal = {
  Render: async () => {
    await import(`${getProxyPath()}components/core/ObjectLayerEngine.js`);
    // await import(`${getProxyPath()}components/core/WebComponent.js`);

    setTimeout(async () => {
      JSON.parse(
        await CoreService.getRaw({
          url: `${getProxyPath()}assets/templates/item-skin-08.json`,
        }),
      ).color.forEach((y, indexY) => {
        y.forEach((x, indexX) => {
          s('object-layer-engine')._applyBrush(indexX, indexY, [...hexToRgbA(x), 255], true);
        });
      });
    });

    const cells = 26;
    const pixelSize = parseInt(320 / cells);

    return html`<object-layer-engine
      id="ole"
      width="${cells}"
      height="${cells}"
      pixel-size="${pixelSize}"
    ></object-layer-engine>`;
  },
};

export { ObjectLayerEngineModal };
