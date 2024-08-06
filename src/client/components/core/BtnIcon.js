import { getId, s4 } from './CommonJs.js';
import { renderCssAttr } from './Css.js';
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
      tabHref: '',
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
      ${options?.class ? `class="${options.class}"` : ''}
      ${options?.type ? `type="${options.type}"` : ''}
      ${options?.style ? `style="${options.style}"` : ''}
      ${options?.attrs ? `${options.attrs}` : ''}
    >
      ${options.tabHref
        ? html`<a
            class="abs a-${tokenId}"
            href="${options.tabHref}"
            style="${renderCssAttr({ style: { width: '100%', height: '100%', top: '0%', left: '0%' } })}"
          >
            ${label}</a
          >`
        : label}
    </button>`;
    return render;
  },
  RenderTouch: async function () {
    return html``;
  },
};

export { BtnIcon };
