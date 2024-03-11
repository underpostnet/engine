import { InputFile } from './Input.js';

const FileExplorer = {
  Render: async function () {
    return html` ${await InputFile.Render(
      {
        id: 'file-explorer',
        multiple: true,
      },
      {
        clear: () => console.log('file explorer clear file'),
        change: (e) => console.log('file explorer change file', e),
      },
    )}
    ${await InputFile.Render({
      id: 'file-explorer-single',
    })}`;
  },
};

export { FileExplorer };
