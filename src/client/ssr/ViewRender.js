ViewRender = (data) => html`
  <!DOCTYPE html>
  <html dir="ltr" lang="en">
    <head>
      <title>${data.title}</title>
      <link rel="icon" type="image/x-icon" href="${data.path !== '/' ? `${data.path}/` : '/'}favicon.ico" />
      <meta charset="UTF-8" />
      <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
      <!-- <link rel="stylesheet" href="${data.path ? `/${data.path}` : ''}/styles/app.css" />  -->
      <!-- <script type="application/javascript" src=""></script>  -->
    </head>
    <body>
      <script async type="module" src="./${data.buildId}.js"></script>
    </body>
  </html>
`;
