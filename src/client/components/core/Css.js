import { append } from './VanillaJs.js';

const Css = {
  Init: async function (options) {
    append(
      'body',
      html`
        <style>
          ${css`
            html {
              scroll-behavior: smooth;
            }

            body {
              /* overscroll-behavior: contain; */
              /* box-sizing: border-box; */
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
            }

            .fix {
              position: fixed;
              display: block;
            }

            .stq {
              position: sticky;
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
            }
            /*

placeholder

*/

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

            /*

selection

*/

            ::-moz-selection {
              /* Code for Firefox */
              color: black;
              background: rgb(208, 208, 208);
            }

            ::selection {
              color: black;
              background: rgb(208, 208, 208);
            }

            /*

scrollbar

Hide scrollbar for Chrome, Safari and Opera
[TAG]::-webkit-scrollbar {
display: none;
}
Hide scrollbar for IE, Edge and Firefox
[TAG] {
-ms-overflow-style: none;
scrollbar-width: none;
}

*/

            ::-webkit-scrollbar {
              width: 10px;
            }

            /* Track */
            ::-webkit-scrollbar-track {
              background: #f1f1f1;
            }

            /* Handle */
            ::-webkit-scrollbar-thumb {
              background: #888;
            }

            /* Handle on hover */
            ::-webkit-scrollbar-thumb:hover {
              background: #555;
            }`}
          ${options && options.theme ? this.themes[options.theme] : ''}
        </style>
      `
    );
  },
  themes: {
    default: css`
      .modal {
        background: white;
        color: black;
        font-family: arial;
        border-radius: 10px;
      }
      .bar-default-modal {
        background: #dfdfdf;
        color: black;
      }
      .html-modal-content {
        padding: 5px;
      }
      button {
        background: none;
        outline: none;
        border: none;
        cursor: pointer;
        transition: 0.3s;
        font-size: 15px;
        color: black;
        margin: 5px;
        padding: 5px;
        border-radius: 5px;
        border: 2px solid #bbbbbb;
        min-height: 30px;
        min-width: 30px;
      }
      .title-modal {
        padding: 5px;
        margin: 5px;
        text-transform: capitalize;
        cursor: default;
        font-size: 20px;
      }
      button:hover {
        background: #bbbbbb;
      }
      .box-shadow {
        box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
      }
      .box-shadow:hover {
        box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3);
      }
    `,
  },
  import: {
    fontawesome: async () =>
      append('head', html`<link rel="stylesheet" type="text/css" href="/dist/fontawesome/css/all.min.css" />`),
  },
};

const borderChar = (px, color) => html`
  text-shadow: ${px}px -${px}px ${px}px ${color}, -${px}px ${px}px ${px}px ${color}, -${px}px -${px}px ${px}px ${color},
  ${px}px ${px}px ${px}px ${color};
`;

const renderMediaQuery = (mediaData) => {
  //  first limit should be '0'
  return html`
    <style>
      ${mediaData
        .map(
          (mediaState) => css`
            @media only screen and (min-width: ${mediaState.limit}px) {
              ${mediaState.css}
            }
          `
        )
        .join('')}
    </style>
  `;
};

export { Css, borderChar, renderMediaQuery };
