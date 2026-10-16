SSRComponent = ({
  title,
  ssrPath,
  buildId,
  ssrHeadComponents,
  ssrBodyComponents,
  buildManifestHead = '',
  sessionState,
  theme,
}) => html`
  <!DOCTYPE html>
  <html
    dir="ltr"
    lang="en"
    data-session="${sessionState === 'log-in' ? 'log-in' : 'log-out'}"
    data-theme="${theme === 'light' ? 'light' : 'dark'}"
  >
    <head>
      <title>${title}</title>
      <link rel="icon" type="image/x-icon" href="${ssrPath}favicon.ico" />
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      ${buildManifestHead} ${ssrHeadComponents}
      <style class="root-style">
        html {
          scroll-behavior: smooth;
        }

        body {
          padding: 0px;
          margin: 0px;
        }

        .fl {
          position: relative;
          display: flow-root;
        }

        .abs,
        .in {
          display: block;
        }

        .fll {
          float: left;
        }

        .flr {
          float: right;
        }

        .abs {
          position: absolute;
        }

        .in,
        .inl {
          position: relative;
        }

        .inl {
          display: inline-table;
          display: -webkit-inline-table;
          display: -moz-inline-table;
          display: -ms-inline-table;
          display: -o-inline-table;
        }

        .fix {
          position: fixed;
          display: block;
        }

        .stq {
          position: sticky;
        }

        .wfa {
          width: available;
          width: -webkit-available;
          width: -moz-available;
          width: -ms-available;
          width: -o-available;

          width: fill-available;
          width: -webkit-fill-available;
          width: -moz-fill-available;
          width: -ms-fill-available;
          width: -o-fill-available;
        }

        .wft {
          width: fit-content;
          width: -webkit-fit-content;
          width: -moz-fit-content;
          width: -ms-fit-content;
          width: -o-fit-content;
        }

        .wfm {
          width: max-content;
          width: -webkit-max-content;
          width: -moz-max-content;
          width: -ms-max-content;
          width: -o-max-content;
        }

        .negative-color {
          filter: invert(1);
          -webkit-filter: invert(1);
          -moz-filter: invert(1);
          -ms-filter: invert(1);
          -o-filter: invert(1);
        }

        .no-drag {
          user-drag: none;
          -webkit-user-drag: none;
          -moz-user-drag: none;
          -ms-user-drag: none;
          -o-user-drag: none;
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          -o-user-select: none;
        }

        .center {
          transform: translate(-50%, -50%);
          top: 50%;
          left: 50%;
          width: 100%;
          text-align: center;
        }

        input {
          outline: none !important;
          border: none;
          padding-block: 0;
          padding-inline: 0;
          height: 30px;
          line-height: 30px;
        }
        input::file-selector-button {
          outline: none !important;
          border: none;
        }

        .hide {
          display: none !important;
        }
        ::placeholder {
          color: black;
          opacity: 1;
          /* Firefox */
          background: none;
        }

        :-ms-input-placeholder {
          /* Internet Explorer 10-11 */
          color: black;
          background: none;
        }

        ::-ms-input-placeholder {
          /* Microsoft Edge */
          color: black;
          background: none;
        }

        ::-moz-selection {
          /* Code for Firefox */
          color: black;
          background: rgb(208, 208, 208);
        }

        ::selection {
          color: black;
          background: rgb(208, 208, 208);
        }

        .lowercase {
          text-transform: lowercase;
        }
        .uppercase {
          text-transform: uppercase;
        }
        .capitalize {
          text-transform: capitalize;
        }

        .bold {
          font-weight: bold;
        }

        .m {
          font-family: monospace;
        }

        .gray {
          filter: grayscale(1);
        }

        /* Every state except log-in shows the log-out UI. */
        :root:not([data-session='log-in']) .session-in-log-in,
        :root:not([data-session='log-in']) .session-inl-log-in,
        :root:not([data-session='log-in']) .session-fl-log-in,
        :root[data-session='log-in'] .session-in-log-out,
        :root[data-session='log-in'] .session-inl-log-out,
        :root[data-session='log-in'] .session-fl-log-out {
          display: none;
        }

        :root:not([data-session='log-in']) .session-in-log-out,
        :root[data-session='log-in'] .session-in-log-in {
          display: block;
        }

        :root:not([data-session='log-in']) .session-inl-log-out,
        :root[data-session='log-in'] .session-inl-log-in {
          display: inline-table;
        }

        :root:not([data-session='log-in']) .session-fl-log-out,
        :root[data-session='log-in'] .session-fl-log-in {
          display: flow-root;
        }
      </style>
      <style class="theme-style"></style>
    </head>
    <body>
      ${ssrBodyComponents} ${buildId ? html`<script async type="module" src="./${buildId}.js"></script>` : ''}
    </body>
  </html>
`;
