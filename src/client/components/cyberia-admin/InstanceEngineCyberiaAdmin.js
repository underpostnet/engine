import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { CyberiaInstancesStructs } from '../cyberia/CommonCyberia.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
// https://www.npmjs.com/package/vanilla-jsoneditor

const InstanceEngineCyberiaAdmin = {
  Render: async function (options = { idModal: '' }) {
    setTimeout(() => {
      let content = {
        text: undefined, // JSON.stringify(CyberiaInstancesStructs.default, null, 4)
        json: CyberiaInstancesStructs.default[0],
      };
      const editor = createJSONEditor({
        target: s('.jsoneditor'),
        props: {
          content,
          onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
            // content is an object { json: JSONData } | { text: string }
            console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
            content.json = JSON.parse(updatedContent.text);
          },
        },
      });

      EventsUI.onClick(`.cyberia-instance-btn-upload`, async () => {
        const { status, data } = await CyberiaInstanceService.post({ body: content.json });

        NotificationManager.Push({
          html: Translate.Render(`${status}-upload-cyberia-instance`),
          status,
        });
      });

      const cyberiaEngineWorksContainer = ['jsoneditor', 'cyberia-instance-management-container'];
      const hideWorksContainer = () =>
        cyberiaEngineWorksContainer.map((selector) => s(`.${selector}`).classList.add('hide'));
      s(`.cyberia-instance-btn-json`).onclick = () => {
        hideWorksContainer();
        s(`.jsoneditor`).classList.remove('hide');
      };
      s(`.cyberia-instance-btn-management`).onclick = () => {
        hideWorksContainer();
        s(`.cyberia-instance-management-container`).classList.remove('hide');
      };
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
          <div class="in">
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom cyberia-instance-btn-upload`,
              label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
            })}
          </div>
        </div>
        <div class="in fll ${dynamicColId}-col-b">
          <div class="jsoneditor"></div>
          <div class="in cyberia-instance-management-container hide">table</div>
        </div>
      </div>
    `;
  },
};

export { InstanceEngineCyberiaAdmin };
