const BtnIcon = {
  Render: async function (options) {
    return html`<button class="${options.class}">${options.label}</button>`;
  },
};

export { BtnIcon };
