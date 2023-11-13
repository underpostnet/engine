import { append } from './VanillaJs.js';

// https://www.fontspace.com/

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

            .hide {
              display: none !important;
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
            }
          `}
        </style>
      `
    );
  },
  default: async () =>
    append(
      'head',
      html`
        <style>
          ${css`
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
          `}
        </style>
      `
    ),
  dark: async () =>
    append(
      'head',
      html`
        <style>
          ${css`
            html {
              background: black;
              color: white;
            }
            .modal {
              /* background: #242124; */
              background: #121212;
              color: white;
              font-family: arial;
              border-radius: 10px;
            }
            .bar-default-modal {
              /* background: #242124; */
              background: #242424;
              color: white;
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
              color: white;
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
              color: black;
            }
            .box-shadow {
              box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19);
            }
            .box-shadow:hover {
              box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3);
            }
          `}
        </style>
      `
    ),
  cryptokoyn: async () =>
    append(
      'head',
      html`
        ${css`
          html {
            background: black;
            color: white;
          }
          .modal {
            /* background: #242124; */
            background: #121212;
            color: white;
            font-family: arial;
            border: 2px solid yellow;
            /* border-radius: 10px; */
          }
          .bar-default-modal {
            /* background: #242124; */
            background: #242424;
            color: white;
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
            color: white;
            margin: 5px;
            padding: 5px;
            /* border-radius: 5px; */
            border: 2px solid yellow;
            min-height: 30px;
            min-width: 30px;
          }
          .title-modal {
            padding: 5px;
            margin: 5px;
            text-transform: capitalize;
            cursor: default;
            font-size: 20px;
            color: yellow;
          }
          button:hover {
            background: yellow;
            color: black;
          }
          .box-shadow {
            /* box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19); */
          }
          .box-shadow:hover {
            /* box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3); */
          }
        `}
      `
    ),
  'dark-light': async () =>
    append(
      'head',
      html`
        <style>
          ${css`
            html {
              background: black;
              color: white;
            }
            .modal {
              /* background: #242124; */
              background: #121212;
              color: white;
              font-family: arial;
              border: 2px solid #313131;
              /* border-radius: 10px; */
            }
            .bar-default-modal {
              /* background: #242124; */
              background: #242424;
              color: white;
            }
            .bar-default-modal-icon {
              /* background: #242124; */
              width: 15px;
              height: 15px;
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
              color: white;
              margin: 5px;
              padding: 5px;
              /* border-radius: 5px; */
              border: 2px solid #313131;
              min-height: 30px;
              min-width: 30px;
            }
            .title-modal {
              padding: 5px;
              margin: 5px;
              text-transform: capitalize;
              cursor: default;
              font-size: 20px;
              color: yellow;
            }
            button:hover {
              background: #313131;
              color: yellow;
            }
            .box-shadow {
              /* box-shadow: 0 2px 4px 0 rgba(255, 255, 255, 0.2), 0 3px 10px 0 rgba(255, 255, 255, 0.19); */
            }
            .box-shadow:hover {
              /* box-shadow: 0 4px 8px 0 rgba(255, 255, 255, 0.2), 0 5px 15px 0 rgba(255, 255, 255, 0.3); */
            }
            .toggle-switch-content-border {
              border: 2px solid #313131;
              padding: 5px;
              transition: 0.3s;
              cursor: pointer;
              top: 5px;
            }
            .toggle-switch-content-border:hover {
              background: #313131;
            }
            .toggle-switch-content {
              width: 60px;
            }
            .toggle-switch-circle {
              height: 20px;
              width: 20px;
              background: gray;
              transition: 0.3s;
            }
            .dropdown {
              margin-top: 10px;
            }
            .dropdown-content {
              display: none;
              position: absolute;
              z-index: 1;
              width: 100%;
            }
            .dropdown:hover .dropdown-content {
              display: block;
            }
            /* .dropdown:hover .dropdown-content:active {
              display: none;
            } */
            .dropdown-option {
              background: #121212;
              border: 2px solid #313131;
              padding: 5px;
              transition: 0.3s;
              cursor: pointer;
            }
            .dropdown-option:hover {
              background: #313131;
              color: yellow;
            }
            .section-row {
              cursor: default;
              padding: 15px 0px 15px 0px;
              border-bottom: 2px solid #313131;
              max-width: 450px;
            }
          `}
        </style>
      `
    ),
  retro: async () =>
    append(
      'head',
      html`
        <style>
          ${css`
            @font-face {
              font-family: 'retro-font-title';
              src: URL('${location.pathname}assets/fonts/EndlessBossBattleRegular-v7Ey.ttf') format('truetype');
            }
            @font-face {
              font-family: 'retro-font';
              src: URL('${location.pathname}assets/fonts/Pixeboy-z8XGD.ttf') format('truetype');
            }
          `}
        </style>
      `
    ),
  cyberia: async () =>
    append(
      'head',
      html`
        <style>
          ${css`
            body,
            .modal,
            button {
              font-family: 'retro-font';
              font-size: 18px;
            }
            .title-modal {
              color: #ffcc00;
              font-family: 'retro-font-title';
            }
            button:hover {
              color: #ffcc00;
            }
            .toggle-switch-active {
              background: #ffcc00;
              /* background: green; */
            }
          `}
        </style>
      `
    ),
  fontawesome: async () =>
    append(
      'head',
      html`<link rel="stylesheet" type="text/css" href="${location.pathname}dist/fontawesome/css/all.min.css" />`
    ),
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
