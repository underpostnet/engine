import { borderChar, renderCssAttr } from '../core/Css.js';
import { getProxyPath } from '../core/VanillaJs.js';

const MapCyberia = {
  Render: async function () {
    const renderFactionMapSymbol = ({ name, color, imgPath, left, top }) => {
      return html`
        <div
          class="abs map-faction-symbol-container"
          style="${renderCssAttr({
            style: {
              left,
              top,
              border: `2px solid ${color}`,
            },
          })}"
        >
          <img class="inl map-faction-symbol-img" src="${getProxyPath()}${imgPath}" />
          <span class="inl" style="top: -10px"> ${name}</span>
        </div>
      `;
    };
    return html`
      <style>
        .map-modal-universe-background-image {
          width: 100%;
          height: auto;
          min-width: 350px;
          max-width: 600px;
          /* height: 100%;
          object-fit: cover; */
        }
        .map-faction-symbol-container {
          border-radius: 10px;
          opacity: 0.7;
          color: black;
          font-size: 12px;
          filter: contrast(130%);
          min-width: 100px;
          padding: 4px;
          min-height: 60px;
        }
        .map-faction-symbol-img {
          width: 35px;
          height: 35px;
        }
      </style>
      ${borderChar(1, 'red', ['.map-faction-symbol-container'])}
      <div class="in map-modal-universe-background-image">
        <img class="in map-modal-universe-background-image" src="${getProxyPath()}assets/lore/universe/_0.jpeg" />
        ${renderFactionMapSymbol({
          imgPath: 'assets/lore/macro-factions/zenith-empire.jpeg',
          name: 'Zenith Empire',
          color: 'red',
          left: '5%',
          top: '38%',
        })}
        ${renderFactionMapSymbol({
          imgPath: 'assets/lore/macro-factions/zenith-empire.jpeg',
          name: 'Zenith Empire',
          color: 'red',
          left: '56%',
          top: '22%',
        })}
      </div>
    `;
  },
};

export { MapCyberia };
