const PublicProfile = {
  Render: async function (options) {
    return html`<pre>${JSON.stringify(options, null, 4)}</pre>`;
  },
};

export { PublicProfile };
