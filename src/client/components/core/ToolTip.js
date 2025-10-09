import { append, s } from './VanillaJs.js';

const ToolTip = {
  Tokens: {},
  Render: async function (
    options = { container: '', htmlRender: '', id: '', classList: '', useVisibilityHover: false },
  ) {
    const { container, htmlRender, id, useVisibilityHover } = options;

    if (useVisibilityHover) {
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
          <div class="tooltip ${options?.classList ? `${options.classList} ` : ' '}${tooltipId}">${htmlRender}</div>
        `,
      );
      return '';
    } else return 'test';
  },
};

export { ToolTip };
