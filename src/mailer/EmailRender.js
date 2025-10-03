import { ssrFactory } from '../server/ssr.js';

const EmailRender = {
  style: {
    body: {
      'font-family': 'Arial, sans-serif',
      'background-color': '#f4f4f4',
      margin: 0,
      padding: '20px',
      'min-height': '300px',
      width: '100%',
      'max-width': '700px',
      display: 'block',
    },
    '.container': {
      'max-width': '600px',
      margin: '0 auto',
      'background-color': '#ffffff',
      padding: '20px',
      'border-radius': '5px',
      // 'box-shadow': '0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19)',
    },
    h1: {
      'font-size': '24px',
      'margin-bottom': '20px',
      color: '#333333',
    },
    p: {
      'font-size': '16px',
      'line-height': 1.5,
      'margin-bottom': '20px',
      color: '#666666',
    },
    button: {
      display: 'inline-block',
      padding: '10px 20px',
      'background-color': '#007bff',
      color: '#ffffff',
      'text-decoration': 'none',
      'border-radius': '5px',
      'font-size': '16px',
    },
    '.footer': {
      'text-align': 'center',
      padding: '20px',
      'font-size': '14px',
      color: '#999999',
    },
  },
  renderStyle: function (classObj) {
    return Object.keys(this.style[classObj])
      .map((classKey) => ` ${classKey}: ${this.style[classObj][classKey]};`)
      .join(``);
  },

  getTemplates: async function (options = { templates: {} }) {
    const templates = {};
    for (const templateKey of Object.keys(options.templates)) {
      const ssrEmailComponent = options.templates[templateKey];
      const SrrComponent = await ssrFactory(`./src/client/ssr/mailer/${ssrEmailComponent}.js`);
      templates[templateKey] = SrrComponent(this, options);
    }
    return templates;
  },
};

export { EmailRender };
