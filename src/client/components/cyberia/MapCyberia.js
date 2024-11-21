import { borderChar, renderCssAttr } from '../core/Css.js';
import { getProxyPath } from '../core/VanillaJs.js';

const MapCyberia = {
  Render: async function () {
    const renderZoneLegendInfo = ({ name, color, imgPath, left, top, style }) => {
      return html`
        <div
          class="abs map-faction-symbol-container"
          style="${renderCssAttr({
            style: {
              left,
              top,
              border: `2px solid ${color}`,
              ...(style ? style : {}),
            },
          })}"
        >
          ${imgPath ? html`<img class="inl map-faction-symbol-img" src="${getProxyPath()}${imgPath}" />` : ''}
          <span class="inl map-text-shadow-${color}" ${imgPath ? html`style="top: -10px"` : ''}> ${name}</span>
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
        .blink-current-universe-position-container {
          width: 35px;
          height: 35px;
        }
        .blink-current-universe-position {
          animation: blink-current-universe-position 1s infinite;
          transition: 1s;
        }
        @keyframes blink-current-universe-position {
          0% {
            width: 35px;
            height: 35px;
          }
          50% {
            width: 25px;
            height: 25px;
          }
          100% {
            width: 35px;
            height: 35px;
          }
        }
      </style>
      ${borderChar(1, 'red', ['.map-text-shadow-red'])} ${borderChar(1, 'yellow', ['.map-text-shadow-yellow'])}
      ${borderChar(1, 'blue', ['.map-text-shadow-blue'])} ${borderChar(1, 'white', ['.map-text-shadow-white'])}
      <div class="in map-modal-universe-background-image">
        <img class="in map-modal-universe-background-image" src="${getProxyPath()}assets/lore/universe/_0.jpeg" />
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/zenith-empire.jpeg',
          name: 'Zenith Empire',
          color: 'red',
          left: '5%',
          top: '38%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/zenith-empire.jpeg',
          name: 'Zenith Empire',
          color: 'red',
          left: '56%',
          top: '22%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/atlas-confederation.jpeg',
          name: 'Atlas Confederation',
          color: 'yellow',
          left: '13%',
          top: '64%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/atlas-confederation.jpeg',
          name: 'Atlas Confederation',
          color: 'yellow',
          left: '14%',
          top: '11%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/nova-republic.jpeg',
          name: 'Nova Republic',
          color: 'blue',
          left: '48%',
          top: '6%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/zenith-empire.jpeg',
          name: 'Zenith Empire',
          color: 'red',
          left: '42%',
          top: '76%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/nova-republic.jpeg',
          name: 'Nova Republic',
          color: 'blue',
          left: '67%',
          top: '63%',
        })}
        ${renderZoneLegendInfo({
          imgPath: 'assets/lore/macro-factions/atlas-confederation.jpeg',
          name: 'Atlas Confederation',
          color: 'yellow',
          left: '37%',
          top: '51%',
        })}
        ${renderZoneLegendInfo({
          name: 'Seed City',
          color: 'white',
          left: '50%',
          top: '61%',
          style: {
            'min-width': '0px',
            'min-height': '0px',
          },
        })}
        <div
          class="abs blink-current-universe-position-container"
          style="${renderCssAttr({
            style: {
              top: '61%',
              left: '45%',
            },
          })}"
        >
          <img
            src="${getProxyPath()}/assets/ui-icons/fullscreen.png"
            class="abs center blink-current-universe-position"
          />
        </div>
      </div>
    `;
  },
};

export { MapCyberia };
