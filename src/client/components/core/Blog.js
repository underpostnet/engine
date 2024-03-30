import { RichText } from './RichText.js';

const Blog = {
  Render: async function () {
    return html`${await RichText.Render()}`;
  },
};

export { Blog };
