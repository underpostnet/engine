SrrComponent = ({ ssrPath }) => html`
  <script type="text/javascript" src="${ssrPath}dist/validator/validator.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/tinymce/tinymce.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/d3/d3.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/peerjs/peerjs.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar-core/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar-daygrid/index.global.min.js"></script>
`;
