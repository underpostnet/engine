const CssDefaultDark = {
  theme: 'default-dark',
  dark: true,
  render: async () => html` <style></style> `,
};

const CssDefaultLight = {
  theme: 'default-light',
  dark: false,
  render: async () => html` <style></style> `,
};

export { CssDefaultDark, CssDefaultLight };
