import { BtnIcon } from '../core/BtnIcon.js';
import { dynamicCol } from '../core/Css.js';
import { s } from '../core/VanillaJs.js';
import { CyberiaInstancesStructs } from '../cyberia/CommonCyberia.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
// https://www.npmjs.com/package/vanilla-jsoneditor

const InstanceEngineCyberiaAdmin = {
  Render: async function (options = { idModal: '' }) {
    const engineCyberiaInstanceMenu = {
      'cyberia-instance-btn-json': {},
      'cyberia-instance-btn-management': {},
    };

    setTimeout(() => {
      let content = {
        text: undefined, // JSON.stringify(CyberiaInstancesStructs.default, null, 4)
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
    const dynamicColId = 'cyberia-instance-dynamic-col';
    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: dynamicColId })}
      <div class="fl">
        <div class="in fll ${dynamicColId}-col-a">
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom cyberia-instance-btn-json`,
              label: html`json`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom cyberia-instance-btn-management`,
              label: html`management`,
            })}
          </div>
        </div>
        <div class="in fll ${dynamicColId}-col-b">
          <div class="jsoneditor"></div>
        </div>
      </div>
    `;
  },
};

export { InstanceEngineCyberiaAdmin };
