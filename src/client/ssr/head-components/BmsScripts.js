SrrComponent = ({ ssrPath }) => html`
  <script type="text/javascript" src="${ssrPath}dist/validator/validator.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/tinymce/tinymce.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/d3/d3.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/peerjs/peerjs.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/core/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/daygrid/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/interaction/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/list/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/multimonth/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/@fullcalendar/timegrid/index.global.min.js"></script>
  <script type="text/javascript" src="${ssrPath}dist/easymde/easymde.min.js"></script>
  <link rel="stylesheet" href="${ssrPath}dist/easymde/easymde.min.css" />
`;
