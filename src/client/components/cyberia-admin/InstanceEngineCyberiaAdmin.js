import { s } from '../core/VanillaJs.js';
import { CyberiaInstancesStructs } from '../cyberia/CommonCyberia.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
// https://www.npmjs.com/package/vanilla-jsoneditor

const InstanceEngineCyberiaAdmin = {
  Render: async function () {
    setTimeout(() => {
      let content = {
        text: JSON.stringify(CyberiaInstancesStructs.default, null, 4),
        json: CyberiaInstancesStructs.default,
      };
      const editor = createJSONEditor({
        target: s('.jsoneditor'),
        props: {
          content,
          onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
            // content is an object { json: JSONData } | { text: string }
            console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
            content = updatedContent;
          },
        },
      });
    });
    return html` <div class="jsoneditor"></div> `;
  },
};

export { InstanceEngineCyberiaAdmin };
