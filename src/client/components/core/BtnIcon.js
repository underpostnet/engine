import { getId, s4 } from './CommonJs.js';
import { renderCssAttr } from './Css.js';
import { ToolTip } from './ToolTip.js';
import { s } from './VanillaJs.js';

const BtnIcon = {
  Tokens: {},
  Render: async function (
    options = {
      class: '',
      type: '',
      style: '',
      attrs: '',
      label: '',
      labelStyle: '',
      tabHref: '',
      tooltipHtml: '',
    },
  ) {
    const tokenId = getId(this.Tokens, 'btn-token-');
    this.Tokens[tokenId] = { ...options };
    setTimeout(() => {
      if (s(`.a-${tokenId}`)) s(`.a-${tokenId}`).onclick = (e) => e.preventDefault();
    });
    let label = html` ${options.label}
    ${options.handleContainerClass
      ? html` <div class="abs ${options.handleContainerClass}">
          <div class="abs center">
            <i class="fas fa-grip-vertical"></i>
          </div>
        </div>`
      : ''}`;
    let render = html`<button
      ${options?.class ? `class="${options.class} ${tokenId}"` : ''}
      ${options?.type ? `type="${options.type}"` : ''}
      ${options?.style ? `style="${options.style}"` : ''}
      ${options?.attrs ? `${options.attrs}` : ''}
    >
      ${options.tabHref
        ? html`<a
            class="abs a-btn a-${tokenId}"
            href="${options.tabHref}"
            style="${renderCssAttr({ style: { width: '100%', height: '100%', top: '0%', left: '0%' } })}"
          >
            <span class="in btn-label-content" ${options?.labelStyle ? `style='${options.labelStyle}'` : ''}>
              ${label}</span
            ></a
          >`
        : label}
    </button>`;
    if (options.tooltipHtml)
      setTimeout(() => {
        ToolTip.Render({ container: `.${tokenId}`, id: tokenId, htmlRender: options.tooltipHtml });
      });
    return render;
  },
  // https://developer.mozilla.org/en-US/docs/Games/Techniques/Control_mechanisms/Mobile_touch
  TouchTokens: {},
  RenderTouch: async function (options = { id: '', Events: {} }) {
    const { id } = options;
    this.TouchTokens[id] = { Events: {}, ...options };
    setTimeout(() => {
      const triggerTouchEvents = () => {
        for (const event of Object.keys(this.TouchTokens[id].Events)) this.TouchTokens[id].Events[event]();
      };
      if (s(`.${id}`)) {
        s(`.${id}`).addEventListener('touchstart', () => {
          //  handleStart
          triggerTouchEvents();
        });
        s(`.${id}`).addEventListener('touchmove', () => {
          //  handleMove
          triggerTouchEvents();
        });
        s(`.${id}`).addEventListener('touchend', () => {
          //  handleEnd
          triggerTouchEvents();
        });
        s(`.${id}`).addEventListener('touchcancel', () => {
          //  handleCancel
          triggerTouchEvents();
        });
        s(`.${id}`).onclick = triggerTouchEvents;
      }
    });
    return html` <canvas
      class="abs ${id}"
      style="${renderCssAttr({ style: { width: '100%', height: '100%', top: '0px', left: '0px', border: 'none' } })}"
    >
    </canvas>`;
  },
};

export { BtnIcon };
