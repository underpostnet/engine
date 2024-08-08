import { append } from './VanillaJs.js';

const ToolTip = {
  Tokens: {},
  Render: async function (options = { container: '', htmlRender: '', id: '' }) {
    const { container, htmlRender, id } = options;
    const tooltipId = 'tooltip-' + id;
    append(
      container,
      html`
        <style>
          ${container}:hover .${tooltipId} {
            visibility: visible;
          }
          .${tooltipId} {
            visibility: hidden;
          }
        </style>
        <div class="${tooltipId}">${htmlRender}</div>
      `,
    );
    return '';
  },
};

export { ToolTip };
