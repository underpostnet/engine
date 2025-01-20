import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { darkTheme, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { CyberiaInstancesStructs } from '../cyberia/CommonCyberia.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
// https://www.npmjs.com/package/vanilla-jsoneditor

const InstanceEngineCyberiaAdmin = {
  jsonEditor: null,
  Render: async function (options = { idModal: '' }) {
    setTimeout(() => {
      let content = {
        text: undefined, // JSON.stringify(CyberiaInstancesStructs.default, null, 4)
        json: CyberiaInstancesStructs.default[0],
      };
      const instanceJsonEditor = () => {
        if (this.jsonEditor) this.jsonEditor.destroy();
        this.jsonEditor = createJSONEditor({
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
      };
      instanceJsonEditor();

      EventsUI.onClick(`.cyberia-instance-btn-upload`, async () => {
        let status, data;
        if (content.json._id) {
          const createResult = await CyberiaInstanceService.put({
            id: content.json._id,
            body: content.json,
          });
          data = createResult.data;
          status = createResult.status;
        } else {
          const createResult = await CyberiaInstanceService.post({
            body: content.json,
          });
          data = createResult.data;
          status = createResult.status;
        }
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
      EventsUI.onClick(`.cyberia-instance-btn-management`, async () => {
        hideWorksContainer();
        s(`.cyberia-instance-management-container`).classList.remove('hide');

        const getCyberiaInstanceRowId = (params) => `cy-in-${params.data._id}`;

        class LoadCyberiaInstanceRenderer {
          eGui;

          async init(params) {
            console.log('LoadCyberiaInstanceRenderer init', params);

            const rowId = getCyberiaInstanceRowId(params);

            setTimeout(() => {
              if (s(`.btn-load-${rowId}`))
                s(`.btn-load-${rowId}`).onclick = () => {
                  content.json = params.data;
                  instanceJsonEditor();
                  s(`.cyberia-instance-btn-json`).click();
                };
              if (s(`.btn-delete-${rowId}`))
                s(`.btn-delete-${rowId}`).onclick = async () => {
                  const result = await CyberiaInstanceService.delete({ id: params.data._id });
                  NotificationManager.Push({
                    html: result.status,
                    status: result.status,
                  });
                  await InstanceEngineCyberiaAdmin.list();
                };
            });

            this.eGui = document.createElement('div');
            this.eGui.innerHTML = html`
              ${await BtnIcon.Render({
                class: `in ag-btn-renderer btn-load-${rowId}`,
                label: html`<i class="fa-solid fa-bolt"></i><br />
                  ${Translate.Render(`load`)}`,
              })}
              ${await BtnIcon.Render({
                class: `in ag-btn-renderer btn-delete-${rowId}`,
                label: html`<i class="fa-solid fa-circle-xmark"></i> <br />
                  ${Translate.Render(`delete`)}`,
              })}
            `;
          }

          getGui() {
            return this.eGui;
          }

          refresh(params) {
            console.log('LoadCyberiaInstanceRenderer refreshed', params);
            return true;
          }
        }
        const gridId = `ag-grid-cyberia-instance`;
        this.list = async () => {
          const { status, data } = await CyberiaInstanceService.get();
          AgGrid.grids[gridId].setGridOption('rowData', data);
        };
        InstanceEngineCyberiaAdmin.list();
        htmls(
          `.cyberia-instance-management-container`,
          html`
            ${await AgGrid.Render({
              id: gridId,
              darkTheme,
              gridOptions: {
                // rowData: [],
                columnDefs: [
                  { field: '_id', headerName: 'ID' },
                  { field: 'name', headerName: 'Name' },
                  { headerName: '', cellRenderer: LoadCyberiaInstanceRenderer },
                ],
              },
            })}
          `,
        );
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
