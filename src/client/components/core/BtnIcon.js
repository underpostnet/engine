const BtnIcon = {
  Render: async function (options) {
    return html`<button
      ${options?.class ? `class="${options.class}"` : ''}
      ${options?.type ? `type="${options.type}"` : ''}
      ${options?.style ? `style="${options.style}"` : ''}
    >
      ${options.label}
    </button>`;
  },
};

export { BtnIcon };
