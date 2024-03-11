import { InputFile } from './Input.js';

const FileExplorer = {
  Render: async function () {
    return html`${await InputFile.Render()}`;
  },
};

export { FileExplorer };
