SrrComponent = ({ ssrPath }) => html`
  <script type="text/javascript" src="${ssrPath}dist/validator/validator.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/pathfinding/pathfinding-browser.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/easymde/easymde.min.js"></script>
  <link rel="stylesheet" href="${ssrPath}dist/easymde/easymde.min.css" />
`;
