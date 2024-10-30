// import { htmls } from './SsrCore.js';
// /*imports*/

const ViewUi = {
  scope: {},
  instance: async function ({ id, container }) {
    this.scope[id] = { container };
    htmls(
      container,
      html` <div class="view-ui-${id}-style">
          <style>
            .view-ui-${id} {
              background: #ffffff;
              color: #181818;
              width: 100%;
              height: 100%;
            }
          </style>
        </div>
        <div class="in view-ui-${id}"></div>`,
    );
  },
};

export { ViewUi };
