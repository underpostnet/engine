import { getId } from './CommonJs.js';

const RichText = {
  Tokens: {},
  Render: async function () {
    const id = getId(this.Tokens, 'rich-text-');
    this.Tokens[id] = {};
    setTimeout(() => {
      /** @type {import('tinymce').EditorOptions} */
      const options = {
        selector: `#${id}`,
        min_height: 400,
        menubar: true,
        plugins: [
          'advlist',
          'anchor',
          'autolink',
          'autoresize',
          'autosave',
          'charmap',
          'code',
          'codesample',
          'directionality',
          'emoticons',
          'fullscreen',
          'help',
          'image',
          'importcss',
          'insertdatetime',
          'link',
          'lists',
          'media',
          'nonbreaking',
          'pagebreak',
          'preview',
          'quickbars',
          'save',
          'searchreplace',
          'table',
          'template',
          'visualblocks',
          'visualchars',
          'wordcount',
        ],
        toolbar:
          'undo redo | casechange blocks | bold italic backcolor | ' +
          'alignleft aligncenter alignright alignjustify | ' +
          'bullist numlist checklist outdent indent | removeformat | a11ycheck code table help',
      };
      /** @type {import('tinymce').EditorManager} */
      const tinymce = window.tinymce;
      tinymce.init(options);
    });
    return html` <textarea id="${id}"></textarea>`;
  },
};

export { RichText };
