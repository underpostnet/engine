import { renderCssAttr } from './Css.js';
import { append, s } from './VanillaJs.js';
import { Modal } from './Modal.js';

const ToolTip = {
  Tokens: {},
  Render: async function (
    options = { container: '', htmlRender: '', id: '', classList: '', useVisibilityHover: false, useMenuBtn: false },
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

    const containerEl = s(container);
    if (!containerEl) return;

    const tooltipId = `tooltip-${id}`;
    const tooltip = html`
      <div
        class="fix fix-tooltip ${tooltipId}"
        style="${renderCssAttr({
          style: {
            'z-index': 10,
            position: 'absolute',
            opacity: 0,
            transition: 'opacity 0.2s ease-in-out',
            'pointer-events': 'none',
          },
        })}"
      >
        ${htmlRender}
      </div>
    `;
    append('body', tooltip);

    const tooltipEl = s(`.${tooltipId}`);

    containerEl.addEventListener('mouseenter', () => {
      if (
        options.useMenuBtn &&
        s(
          `.btn-icon-menu-mode-${Modal.Data['modal-menu'].options.mode === 'slide-menu-right' ? 'left' : 'right'}`,
        ).classList.contains('hide')
      )
        return;

      const containerRect = containerEl.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let top = containerRect.bottom + window.scrollY + 5;
      let left = containerRect.left + window.scrollX + containerRect.width / 2 - tooltipRect.width / 2;

      // Adjust if it goes off-screen
      if (left < 0) left = 5;
      if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 5;
      }
      if (top + tooltipRect.height > window.innerHeight) {
        top = containerRect.top + window.scrollY - tooltipRect.height - 5;
      }

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.opacity = '1';
    });

    containerEl.addEventListener('mouseleave', () => {
      tooltipEl.style.opacity = '0';
    });
  },
};

export { ToolTip };
