const CssCommonNexodev = async () => html`<style>
  .top-bar-app-icon {
    width: 50px;
    height: 40px;
  }
</style>`;

const CssNexodevDark = {
  themePair: 'nexodev-light',
  theme: 'nexodev-dark',
  dark: true,
  render: CssCommonNexodev,
};
const CssNexodevLight = {
  themePair: 'nexodev-dark',
  theme: 'nexodev-light',
  dark: false,
  render: CssCommonNexodev,
};

export { CssNexodevDark, CssNexodevLight, CssCommonNexodev };
