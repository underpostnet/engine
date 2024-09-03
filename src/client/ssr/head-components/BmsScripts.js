SrrComponent = ({ ssrPath }) => html`
  <script type="text/javascript" src="${ssrPath}dist/validator/validator.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/tinymce/tinymce.min.js"></script>
  <script src="${ssrPath}dist/d3/d3.min.js"></script>
  <script src="${ssrPath}dist/peerjs/peerjs.min.js"></script>
`;
