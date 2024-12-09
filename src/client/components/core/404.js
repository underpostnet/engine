import { Alert } from './Alert.js';

const Page404 = {
  Render: async function ({ idModal }) {
    return html`${await Alert.e404()}`;
  },
};

export { Page404 };
