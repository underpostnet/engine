import { append } from './VanillaJs.js';

const Css = {
  Init: () => {
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
            }
          `}
        </style>
      `
    );
  },
};

export { Css };
