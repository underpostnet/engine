import { Alert } from './Alert.js';

const Page500 = {
  Render: async function ({ idModal }) {
    return html`${await Alert.e500()}`;
  },
};

export { Page500 };
