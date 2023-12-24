import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { CyberiaWorldService } from '../../services/cyberia-world/cyberia-world.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { newInstance, random, range } from '../core/CommonJs.js';
import { dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

class LoadWorldRenderer {
  eGui;

  async init(params) {
    console.log('LoadWorldRenderer created', params);
    const rowId = `${params.data._id}-${params.rowIndex}`;

    this.eGui = document.createElement('div');
    this.eGui.innerHTML = html`
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-load-world-${rowId}`,
        label: html`<i class="fa-solid fa-bolt"></i><br />
          ${Translate.Render(`load`)}`,
      })}
      ${await BtnIcon.Render({
        class: `in ag-btn-renderer btn-delete-world-${rowId}`,
        label: html`<i class="fa-solid fa-circle-xmark"></i> <br />
          ${Translate.Render(`delete`)}`,
      })}
    `;

    setTimeout(() => {
      EventsUI.onClick(`.btn-load-world-${rowId}`, async () => {
        alert();
      });
      EventsUI.onClick(`.btn-delete-world-${rowId}`, async () => {
        const worldDeleteResult = await CyberiaWorldService.delete(params.data._id);
        NotificationManager.Push({
          html:
            worldDeleteResult.status === 'success'
              ? Translate.Render(worldDeleteResult.message)
              : worldDeleteResult.message,
          status: worldDeleteResult.status,
        });

        setTimeout(() => {
          World.worlds = World.worlds.filter((world) => world._id !== params.data._id);
          AgGrid.grids[`ag-grid-world`].setGridOption('rowData', World.getGridData());
        });
      });
    });
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadWorldRenderer refreshed', params);
    return true;
  }
}

const World = {
  worlds: [],
  getGridData: function () {
    return this.worlds.map((w) => {
      range(0, 5).map((i) => {
        if (!(i in w.face)) w.face[i] = null;
      });
      w.face = w.face.map((f, i) => `${i + 1}-${f?.biome ? f.biome : 'void'}`);
      return w;
    });
  },
  Render: async function (options) {
    const resultWorlds = await CyberiaWorldService.get('all');
    NotificationManager.Push({
      html: resultWorlds.status === 'success' ? Translate.Render(resultWorlds.message) : resultWorlds.message,
      status: resultWorlds.status,
    });
    if (resultWorlds.status === 'success') this.worlds = resultWorlds.data;

    const resultBiome = await CyberiaBiomeService.get('all-name');
    NotificationManager.Push({
      html: resultBiome.status === 'success' ? Translate.Render(resultBiome.message) : resultBiome.message,
      status: resultBiome.status,
    });
    let render = '';
    const dataWorld = {
      face: [],
    };
    for (const index of range(0, 5)) {
      render += html`<div class="inl section-mp">
        ${await DropDown.Render({
          // value: ``,
          id: `face-${index}`,
          label: html`face ${index + 1}`,
          data: resultBiome.data.map((biome) => {
            return {
              display: html`${biome.name} <span style="color: #ffcc00; font-size: 15px;">[${biome.biome}]</span>`,
              value: biome._id,
              onClick: async () => {
                dataWorld.face[index] = biome;
              },
            };
          }),
        })}
      </div>`;
    }
    setTimeout(() => {
      const renderFace = async (index) => {
        if (dataWorld.face[index] && dataWorld.face[index].fileId) {
          const resultFile = await FileService.get(dataWorld.face[index].fileId);

          const imageData = resultFile.data[0];

          const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

          const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

          const imageSrc = URL.createObjectURL(imageFile);

          htmls(`.world-${index}`, html` <img class="in face-world-img" src="${imageSrc}" /> `);
          return;
        }
        dataWorld.face[index] = null;
        htmls(`.world-${index}`, html``);
      };
      EventsUI.onClick(`.btn-generate-world`, async () => {
        for (const index of range(0, 5)) await renderFace(index);
      });
      EventsUI.onClick(`.btn-generate-random-world`, async () => {
        for (const index of range(0, 5)) {
          s(`.dropdown-option-face-${index}-${resultBiome.data[random(0, resultBiome.data.length - 1)]._id}`).click();
          await renderFace(index);
        }
      });
      EventsUI.onClick(`.btn-upload-world`, async () => {
        const body = newInstance(dataWorld);
        body.face = body.face.map((face) => {
          if (face && face._id) return face._id;
          return null;
        });
        body.name = s(`.world-name`).value;
        const { data, status } = await CyberiaWorldService.post(body);
        NotificationManager.Push({
          html: Translate.Render(`${status}-upload-world`),
          status,
        });
        if (status === 'success') {
          this.worlds.push(data);
          AgGrid.grids[`ag-grid-world`].setGridOption('rowData', this.getGridData());
        }
      });
    });
    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: 'world' })}
      <style class="style-world-col"></style>
      <div class="fl">
        <div class="in fll world-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-sliders"></i> ${Translate.Render('config')}</div>
            <div class="in">
              ${render}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-world`,
                label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-random-world`,
                label: html`<i class="fa-solid fa-dice"></i> ${Translate.Render(`generate`)} random`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-upload-world`,
                label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
              })}
              ${await Input.Render({
                id: `world-name`,
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
                containerClass: 'section-mp container-component input-container',
                placeholder: true,
              })}
            </div>
          </div>
        </div>
        <div class="in fll world-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-cube"></i> ${Translate.Render('world')}</div>
            <div class="in">${await Polyhedron.Render({ id: 'world', idModal: 'world-col-b' })}</div>
          </div>
        </div>
      </div>
      <div class="in section-mp">
        <div class="in sub-title-modal"><i class="far fa-list-alt"></i> ${Translate.Render('worlds')}</div>
        <div class="in">
          ${await AgGrid.Render({
            id: `ag-grid-world`,
            darkTheme: true,
            gridOptions: {
              rowData: this.getGridData(),
              columnDefs: [
                // { field: '_id', headerName: 'ID' },
                { field: 'face', headerName: 'face' },
                { field: 'name', headerName: 'Name' },
                { headerName: '', cellRenderer: LoadWorldRenderer },
              ],
            },
          })}
        </div>
      </div>
    `;
  },
};

export { World };
