const CssBymyelectricsDark = {
  theme: 'bymyelectrics-dark',
  themePair: 'bymyelectrics-light',
  dark: true,
  render: async () => html`
    <style>
      .landing-container {
        color: black;
      }
    </style>
  `,
};

const CssBymyelectricsLight = {
  theme: 'bymyelectrics-light',
  themePair: 'bymyelectrics-dark',
  dark: false,
  render: async () => html`
    <style>
      .landing-container {
        color: black;
      }
    </style>
  `,
};

export { CssBymyelectricsDark, CssBymyelectricsLight };
