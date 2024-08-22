import { AgGrid } from '../../components/core/AgGrid.js';
import { darkTheme } from '../../components/core/Css.js';

const serviceId = 'default-management';

const DefaultManagement = {
  Tokens: {},
  RenderTable: async function (options = { idModal: '' }) {
    const id = options?.idModal ? options.idModal : getId(this.Tokens, `${serviceId}-`);
    const gridId = `${serviceId}-grid-${id}`;
    this.Tokens[id] = { gridId };
    return html` ${await AgGrid.Render({
      id: gridId,
      darkTheme,
    })}`;
  },
};

export { DefaultManagement };
