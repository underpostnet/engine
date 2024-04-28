import { BtnIcon } from '../core/BtnIcon.js';
import { getProxyPath, s } from '../core/VanillaJs.js';

const ServerCyberiaPortal = {
  instances: [
    { id: 'dim32', port: 4002 },
    { id: 'hhworld', port: 4003 },
  ],
  Render: async function () {
    let render = '';
    for (const serverInstance of this.instances) {
      const { id, port } = serverInstance;
      setTimeout(() => {
        s(`.btn-server-${id}`).onclick = () => {
          location.href = location.port ? `http://localhost:${port}/${id}` : `https://www.cyberiaonline.com/${id}`;
        };
      });
      render += html`
        ${await BtnIcon.Render({
          label: html`<img
              class="inl server-icon"
              src="${getProxyPath()}assets/ui-icons/world-default-forest-city.png"
            />
            ${id}`,
          class: `btn-server-${id}`,
        })}
      `;
    }
    return html`${render}`;
  },
};

export { ServerCyberiaPortal };
