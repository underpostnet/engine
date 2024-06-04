import { srcFormatted } from '../server/client-formatted.js';
import fs from 'fs-extra';

const EmailRender = {
  style: {
    in: {
      display: 'block',
      position: 'relative',
    },
    'cyberia-email-container': {
      background: 'black',
      color: 'white',
      padding: '10px',
      width: '330px',
      margin: 'auto',
      'font-size': '20px',
      'font-family': 'arial',
    },
  },
  renderStyle: (classObj) =>
    Object.keys(classObj).map((classKey) => ` ${classKey}: ${classObj[classKey]};`).join(`
        `),

  getTemplates: async function (options = { templates: ['TemplateSrrComponent'] }) {
    const templates = {};
    for (const ssrEmailComponent of options.templates) {
      let SrrComponent;
      eval(await srcFormatted(fs.readFileSync(`./src/client/ssr/email-components/${ssrEmailComponent}.js`, 'utf8')));
      templates[ssrEmailComponent] = SrrComponent(this, options);
    }
    return templates;
  },
};

export { EmailRender };
