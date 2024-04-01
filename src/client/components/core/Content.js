import { marked } from 'marked';

const Content = {
  Render: async function (options = { location: '' }) {
    return html` ${marked.parse('# Marked in the browser\n\nRendered by **marked**.')}`;
  },
};

export { Content };
