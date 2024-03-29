import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const Docs = {
  Render: async function (options) {
    setTimeout(() => {
      Modal.Data[options.idModal].observerEvent[options.idModal] = (args) => {
        s(`.docs-iframe`).style.height = `${args.height * 0.83}px`;
      };
    });
    return html`
      <style>
        .${options.idModal} {
          overflow: hidden;
        }
        .docs-iframe {
          width: 100%;
          border: none;
          margin: 2px;
        }
      </style>
      <iframe class="in docs-iframe" src="/docs/engine/2.0.0"> </iframe>
    `;
  },
};

export { Docs };
