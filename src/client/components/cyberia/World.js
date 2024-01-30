import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { CyberiaWorldService } from '../../services/cyberia-world/cyberia-world.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { newInstance, random, range } from '../core/CommonJs.js';
import { borderChar, dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { SocketIo } from '../core/SocketIo.js';
import { Translate } from '../core/Translate.js';
import { append, htmls, s } from '../core/VanillaJs.js';
import { BiomeEngine, BiomeScope, LoadBiomeRenderer } from './Biome.js';
import { WorldType } from './CommonCyberia.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

class LoadWorldRenderer {
  eGui;

  idFactory(params) {
    return `world-${params.data._id}`;
  }

  async init(params) {
    console.log('LoadWorldRenderer created', params);
    const rowId = this.idFactory(params);

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
        World.WorldScope = { ...World.WorldScope, ...newInstance(World.worlds.find((w) => w._id === params.data._id)) };
        for (const index of range(0, 5)) {
          if (World.WorldScope.face[index])
            s(`.dropdown-option-face-${index}-${World.WorldScope.face[index]._id}`).click();
          else s(`.dropdown-option-face-${index}-reset`).click();
        }
        s(`.world-name`).value = World.WorldScope.name;
        if (s(`.dropdown-option-${World.WorldScope.type}`)) s(`.dropdown-option-${World.WorldScope.type}`).click();

        await World.renderAllFace();
      });
      EventsUI.onClick(`.btn-delete-world-${rowId}`, async () => {
        const worldDeleteResult = await CyberiaWorldService.delete({ id: params.data._id });
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

const WorldLimit = (options = { type: undefined }) => {
  const { type } = options;
  return {
    6: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [1, 'right'],
      right: [3, 'left'],
    },
    5: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [3, 'right'],
      right: [1, 'left'],
    },
    4: {
      top: [1, 'bottom'],
      bottom: [3, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
    3: {
      top: [4, 'bottom'],
      bottom: [2, 'top'],
      left: [type === 'width' ? 6 : 5, 'right'],
      right: [type === 'width' ? 5 : 6, 'left'],
    },
    2: {
      top: [3, 'bottom'],
      bottom: [1, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
    1: {
      top: [2, 'bottom'],
      bottom: [4, 'top'],
      left: [5, 'right'],
      right: [6, 'left'],
    },
  };
};

const WorldManagement = {
  biomeRender: new LoadBiomeRenderer(),
  Data: {},
  LoadSingleFace: function (selector, src) {
    for (const element of s(selector).children) element.style.display = 'none';
    const adjacentMapDisplay = Array.from(s(selector).children).find((e) => e.src === src);
    adjacentMapDisplay
      ? (adjacentMapDisplay.style.display = 'block')
      : append(selector, html`<img class="in adjacent-map-limit-img" src="${src}" />`);
  },
  LoadAdjacentFaces: function (type, id) {
    for (const biomeKey of Object.keys(BiomeScope.Data)) {
      for (const limitType of ['top', 'bottom', 'left', 'right']) {
        if (
          BiomeScope.Data[biomeKey]._id ===
          this.Data[type][id].model.world.face[
            WorldLimit({ type: this.Data[type][id].model.world.type })[Elements.Data[type][id].model.world.face][
              limitType
            ][0] - 1
          ]
        ) {
          this.LoadSingleFace(`.adjacent-map-limit-${limitType}`, BiomeScope.Data[biomeKey].imageSrc);
          if (this.Data[type][id].model.world.type === 'height' && (limitType === 'right' || limitType === 'left')) {
            this.LoadSingleFace(`.adjacent-map-limit-top-${limitType}`, BiomeScope.Data[biomeKey].imageSrc);
            this.LoadSingleFace(`.adjacent-map-limit-bottom-${limitType}`, BiomeScope.Data[biomeKey].imageSrc);
          }
          if (this.Data[type][id].model.world.type === 'width' && (limitType === 'top' || limitType === 'bottom')) {
            this.LoadSingleFace(`.adjacent-map-limit-${limitType}-right`, BiomeScope.Data[biomeKey].imageSrc);
            this.LoadSingleFace(`.adjacent-map-limit-${limitType}-left`, BiomeScope.Data[biomeKey].imageSrc);
          }
        }
      }
    }
  },
  ChangeFace: async function (options = { type: 'user', id: 'main', direction: '' }) {
    const { type, id, direction } = options;

    if (this.Data[type][id].model.world.type === 'height' && (direction === 'right' || direction === 'left')) return;
    if (this.Data[type][id].model.world.type === 'width' && (direction === 'top' || direction === 'bottom')) return;

    if (!this.Data[type][id].blockChangeFace) {
      this.Data[type][id].blockChangeFace = true;
      setTimeout(() => (this.Data[type][id].blockChangeFace = false), 400);

      const [newFace, initDirection] = WorldLimit({ type: this.Data[type][id].model.world.type })[
        Elements.Data[type][id].model.world.face
      ][direction];

      console.warn('newFace', newFace);
      let newBiome;
      for (const biomeKey of Object.keys(BiomeScope.Data)) {
        if (BiomeScope.Data[biomeKey]._id === this.Data[type][id].model.world.face[newFace - 1]) {
          newBiome = BiomeScope.Data[biomeKey];
          break;
        }
      }
      let newX = newInstance(Elements.Data[type][id].x);
      let newY = newInstance(Elements.Data[type][id].y);
      switch (initDirection) {
        case 'left':
          newX = 0;
          break;
        case 'right':
          newX = Matrix.Data.dim - Elements.Data[type][id].dim;
          break;
        case 'bottom':
          newY = Matrix.Data.dim - Elements.Data[type][id].dim;
          break;
        case 'top':
          newY = 0;
          break;
        default:
          break;
      }
      if (BiomeEngine.isCollision({ type, id, x: newX, y: newY, biome: newBiome })) return;
      console.warn('newBiome', newBiome);
      console.warn('initDirection', initDirection);

      Elements.Data[type][id].x = newX;
      Elements.Data[type][id].y = newY;
      Elements.Data[type][id].model.world.face = newFace;
      await this.biomeRender.load({
        data: newBiome,
      });
      this.LoadAdjacentFaces(type, id, newFace);
      htmls('.display-current-face', newFace);
      this.EmitNewWorldFace({ type, id });
    }
  },
  EmitNewWorldFace: (options) => {
    const { type, id } = options;
    for (const elementType of ['user', 'bot']) {
      for (const elementId of Object.keys(Elements.Data[elementType])) {
        if (elementId !== 'main') {
          Pixi.removeElement({ type: elementType, id: elementId });
          delete Elements.Data[elementType][elementId];
        }
      }
      SocketIo.socket.emit(
        elementType,
        JSON.stringify({
          status: 'update-world-face',
          element: { model: { world: Elements.Data[type][id].model.world } },
        }),
      );
    }
  },
  Load: async function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;

    if (!this.Data[type]) this.Data[type] = {};
    if (!this.Data[type][id]) this.Data[type][id] = { model: {} };

    if (!('world' in this.Data[type][id].model)) {
      const { data } = await CyberiaWorldService.get({ id: Elements.Data[type][id].model.world._id });
      this.Data[type][id].model.world = data[0];
    }

    // load single world
    let indexFace = -1;
    for (const _id of this.Data[type][id].model.world.face) {
      indexFace++;

      if (Elements.Data.user.main.model.world.face - 1 === indexFace) {
        await this.biomeRender.load({
          data: await this.biomeRender.loadScope({
            data: { _id },
          }),
        });
      } else
        await this.biomeRender.loadScope({
          data: { _id },
        });
      this.LoadAdjacentFaces(type, id);
      htmls('.display-current-face', Elements.Data.user.main.model.world.face);
    }
  },
};

const World = {
  worlds: [],
  WorldScope: {
    face: [],
  },
  getGridData: function () {
    return newInstance(this.worlds).map((w) => {
      range(0, 5).map((i) => {
        if (!(i in w.face)) w.face[i] = null;
      });
      w.face = w.face.map((f, i) => `${i + 1}-${f?.biome ? f.biome : 'void'}`);
      return w;
    });
  },
  Render: async function (options) {
    const resultWorlds = await CyberiaWorldService.get({ id: 'all' });
    NotificationManager.Push({
      html: resultWorlds.status === 'success' ? Translate.Render(resultWorlds.message) : resultWorlds.message,
      status: resultWorlds.status,
    });
    if (resultWorlds.status === 'success') this.worlds = resultWorlds.data;

    const resultBiome = await CyberiaBiomeService.get({ id: 'all-name' });
    NotificationManager.Push({
      html: resultBiome.status === 'success' ? Translate.Render(resultBiome.message) : resultBiome.message,
      status: resultBiome.status,
    });
    let render = '';

    for (const index of range(0, 5)) {
      render += html`<div class="inl section-mp">
        ${await DropDown.Render({
          // value: ``,
          id: `face-${index}`,
          label: html`face ${index + 1}`,
          resetOption: true,
          resetOnClick: () => (this.WorldScope.face[index] = null),
          data: resultBiome.data.map((biome) => {
            return {
              data: biome,
              display: html`${biome.name} <span class="drop-down-option-info">[${biome.biome}]</span>`,
              value: biome._id,
              onClick: async () => {
                this.WorldScope.face[index] = biome;
              },
            };
          }),
        })}
      </div>`;
    }
    setTimeout(() => {
      EventsUI.onClick(`.btn-generate-world`, async () => {
        for (const index of range(0, 5)) {
          if (!DropDown.Tokens[`face-${index}`].value) delete this.WorldScope.face[index];
          await this.renderFace(index);
        }
      });
      EventsUI.onClick(`.btn-generate-random-world`, async () => {
        for (const index of range(0, 5)) {
          s(`.dropdown-option-face-${index}-${resultBiome.data[random(0, resultBiome.data.length - 1)]._id}`).click();
          await this.renderFace(index);
        }
      });
      EventsUI.onClick(`.btn-upload-world`, async () => {
        const body = newInstance(this.WorldScope);
        body.face = body.face.map((face) => {
          if (face && face._id) return face._id;
          return null;
        });
        body.name = s(`.world-name`).value;
        delete body._id;
        const { data, status } = await CyberiaWorldService.post({ body });
        NotificationManager.Push({
          html: Translate.Render(`${status}-upload-world`),
          status,
        });
        if (status === 'success') {
          this.worlds.push(data);
          AgGrid.grids[`ag-grid-world`].setGridOption('rowData', this.getGridData());
        }
      });
      EventsUI.onClick(`.btn-reset-world`, async () => {
        for (const index of range(0, 5)) s(`.dropdown-option-face-${index}-reset`).click();
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
              <div class="in section-mp">
                ${await DropDown.Render({
                  value: 'width',
                  label: html`${Translate.Render('type')}`,
                  data: ['width', 'height'].map((worldType) => {
                    const infoType = WorldType[worldType].worldFaces;
                    return {
                      display: html`
                      <i class="fa-solid fa-text-${worldType}"></i></i> ${Translate.Render(worldType)} 
                      <span class="drop-down-option-info">${infoType}</span>`,
                      value: worldType,
                      data: worldType,
                      onClick: () => {
                        this.WorldScope.type = worldType;
                      },
                    };
                  }),
                })}
              </div>
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-world`,
                label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render(`generate`)}`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-random-world`,
                label: html`<i class="fa-solid fa-dice"></i> ${Translate.Render(`generate`)} random`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-reset-world`,
                label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render(`clear`)}`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-upload-world`,
                label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
              })}
              ${await Input.Render({
                id: `world-name`,
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
                containerClass: 'inl section-mp container-component input-container',
                placeholder: true,
              })}
            </div>
          </div>
        </div>
        <div class="in fll world-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-cube"></i> ${Translate.Render('world')}</div>
            <div class="in">
              ${await Polyhedron.Render({
                id: 'world',
                idModal: 'world-col-b',
                style: {
                  face: {
                    background: `rgba(0, 0, 0, 0.5)`,
                    // border: `2px solid #620000ff`,
                    'font-size': `30px`,
                  },
                },
              })}
            </div>
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
                { field: 'type', headerName: 'type' },
                { headerName: '', cellRenderer: LoadWorldRenderer },
              ],
            },
          })}
        </div>
      </div>
    `;
  },
  renderFace: async function (index) {
    if (this.WorldScope.face[index] && this.WorldScope.face[index].fileId) {
      const resultFile = await FileService.get({ id: this.WorldScope.face[index].fileId });

      const imageData = resultFile.data[0];

      const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

      const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

      const imageSrc = URL.createObjectURL(imageFile);

      htmls(
        `.world-${index}`,
        html`
          <img class="in face-world-img" src="${imageSrc}" ${index === 2 ? `style="transform: rotate(180deg)"` : ''} />
          <div class="abs center" style="${borderChar(2, 'black')}">${index + 1}</div>
        `,
      );
      return;
    }
    this.WorldScope.face[index] = null;
    htmls(`.world-${index}`, html`<div class="abs center" style="${borderChar(2, 'black')}">${index + 1}</div>`);
  },
  renderAllFace: async function () {
    for (const index of range(0, 5)) await this.renderFace(index);
  },
};

export { World, WorldManagement, WorldLimit };
