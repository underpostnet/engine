import { renderCssAttr } from './Css.js';
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
      return;
    }
    append(
      'body',
      html`<div
        class="fix box-shadow fix-tooltip"
        style="${renderCssAttr({
          style: {
            top: 200 + 'px',
            left: 200 + 'px',
            'z-index': '8',
          },
        })}"
      >
        ${htmlRender}
      </div>`,
    );
  },
};

export { ToolTip };
