Render = ({ title, ssrPath, buildId, ssrHeadComponents, ssrBodyComponents }) => html`
  <!DOCTYPE html>
  <html dir="ltr" lang="en">
    <head>
      <title>${title}</title>
      <link rel="icon" type="image/x-icon" href="${ssrPath}favicon.ico" />
      <meta charset="UTF-8" />
      <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
      ${ssrHeadComponents}
    </head>
    <body>
      ${ssrBodyComponents}
      <script async type="module" src="./${buildId}.js"></script>
    </body>
  </html>
`;
