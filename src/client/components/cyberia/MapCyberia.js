import { getProxyPath } from '../core/VanillaJs.js';

const MapCyberia = {
  Render: async function () {
    return html`
      <style>
        .map-modal-universe-background-image {
          width: 100%;
          height: auto;
          /* height: 100%;
          object-fit: cover; */
        }
      </style>
      <div class="in">
        <img class="in map-modal-universe-background-image" src="${getProxyPath()}assets/lore/universe/_0.jpeg" />
      </div>
    `;
  },
};

export { MapCyberia };
