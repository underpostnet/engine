const BtnIcon = {
  Render: async function (options) {
    return html`<button class="${options.class}" ${options && options.style ? `style="${options.style}"` : ''}>
      ${options.label}
    </button>`;
  },
};

export { BtnIcon };
