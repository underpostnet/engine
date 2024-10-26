const Worker = {
  instance: async function (options = { render: async () => {} }) {
    window.serviceWorkerReady = true;
    append(
      'body',
      html`
        <style>
          body {
            background-color: #dcdcdc;
            color: #303030;
            font-family: arial;
            font-size: 16px;
          }
          .page-render {
            min-height: 100vh;
          }
          a {
            color: #000000;
          }
        </style>
        <div class="in page-render"></div>
      `,
    );
    await options.render();
  },
};

export { Worker };
