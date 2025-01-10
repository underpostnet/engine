import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { CyberiaInstanceService } from '../../services/cyberia-instance/cyberia-instance.service.js';
import { CyberiaWorldService } from '../../services/cyberia-world/cyberia-world.service.js';
import { FileService } from '../../services/file/file.service.js';
import { AgGrid } from '../core/AgGrid.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { newInstance, random, range } from '../core/CommonJs.js';
import { borderChar, darkTheme, dynamicCol } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { SocketIo } from '../core/SocketIo.js';
import { Translate } from '../core/Translate.js';
import { append, htmls, s } from '../core/VanillaJs.js';
import { BiomeCyberiaScope, BiomeCyberiaManagement } from './BiomeCyberia.js';
import { CyberiaParams, WorldCyberiaLimit, WorldCyberiaType } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { createJSONEditor } from 'vanilla-jsoneditor';

const logger = loggerFactory(import.meta);

const getWorldId = (params) => `world-${params.data._id}`;

class LoadWorldCyberiaRenderer {
  eGui;

  async init(params) {
    console.log('LoadWorldCyberiaRenderer created', params);
    const rowId = getWorldId(params);

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
        WorldCyberia.WorldCyberiaScope = {
          ...WorldCyberia.WorldCyberiaScope,
          ...newInstance(WorldCyberia.worlds.find((w) => w._id === params.data._id)),
        };
        for (const index of range(0, 5)) {
          if (WorldCyberia.WorldCyberiaScope.face[index])
            s(`.dropdown-option-face-${index}-${WorldCyberia.WorldCyberiaScope.face[index]._id}`).click();
          else s(`.dropdown-option-face-${index}-reset`).click();
          if (
            WorldCyberia.WorldCyberiaScope.instance &&
            WorldCyberia.WorldCyberiaScope.instance[index] &&
            s(`.dropdown-option-instance-${index}-${WorldCyberia.WorldCyberiaScope.instance[index]._id}`)
          )
            s(`.dropdown-option-instance-${index}-${WorldCyberia.WorldCyberiaScope.instance[index]._id}`).click();
          else s(`.dropdown-option-instance-${index}-reset`).click();
        }
        s(`.world-name`).value = WorldCyberia.WorldCyberiaScope.name;
        if (s(`.dropdown-option-${WorldCyberia.WorldCyberiaScope.type}`))
          s(`.dropdown-option-${WorldCyberia.WorldCyberiaScope.type}`).click();
        if (params.data.adjacentFace) {
          WorldCyberia.adjacentFaceJsonEditor.content.json = params.data.adjacentFace;
          WorldCyberia.adjacentFaceJsonEditor.newInstance();
        }
        if (params.data.quests) {
          WorldCyberia.questsJsonEditor.content.json = params.data.quests;
          WorldCyberia.questsJsonEditor.newInstance();
        }
        // await WorldCyberia.renderAllFace();
      });
      EventsUI.onClick(`.btn-delete-world-${rowId}`, async () => {
        const worldDeleteResult = await CyberiaWorldService.delete({ id: params.data._id });
        NotificationManager.Push({
          html: worldDeleteResult.status,
          status: worldDeleteResult.status,
        });

        setTimeout(() => {
          WorldCyberia.worlds = WorldCyberia.worlds.filter((world) => world._id !== params.data._id);
          AgGrid.grids[`ag-grid-world`].setGridOption('rowData', WorldCyberia.getGridData());
        });
      });
    });
  }

  getGui() {
    return this.eGui;
  }

  refresh(params) {
    console.log('LoadWorldCyberiaRenderer refreshed', params);
    return true;
  }
}

const WorldCyberiaManagement = {
  Data: {},
  LoadSingleFace: function (selector, src, topLevelSrc) {
    for (const element of s(selector).children) {
      if (!element.classList.contains('adjacent-map-background')) element.style.display = 'none';
    }
    const adjacentMapDisplay = Array.from(s(selector).children).find((e) => e.src === src);
    const adjacentTopMapDisplay = Array.from(s(selector).children).find((e) => e.src === topLevelSrc);
    adjacentMapDisplay
      ? ((adjacentMapDisplay.style.display = 'block'), (adjacentTopMapDisplay.style.display = 'block'))
      : append(
          selector,
          html`<img class="in adjacent-map-limit-img" src="${src}" />
            <img class="abs adjacent-map-limit-to-level-img" src="${topLevelSrc}" />`,
        );
  },
  LoadAdjacentFaces: function (type, id) {
    for (const biomeKey of Object.keys(BiomeCyberiaScope.Data)) {
      for (const limitType of ['top', 'bottom', 'left', 'right']) {
        if (
          BiomeCyberiaScope.Data[biomeKey]._id ===
          this.Data[type][id].model.world.face[
            WorldCyberiaLimit({ type: this.Data[type][id].model.world.type })[
              ElementsCyberia.Data[type][id].model.world.face
            ][limitType][0] - 1
          ]
        ) {
          this.LoadSingleFace(
            `.adjacent-map-limit-${limitType}`,
            BiomeCyberiaScope.Data[biomeKey].imageSrc,
            BiomeCyberiaScope.Data[biomeKey].imageTopLevelColorSrc,
          );
          if (this.Data[type][id].model.world.type === 'height' && (limitType === 'right' || limitType === 'left')) {
            this.LoadSingleFace(
              `.adjacent-map-limit-top-${limitType}`,
              BiomeCyberiaScope.Data[biomeKey].imageSrc,
              BiomeCyberiaScope.Data[biomeKey].imageTopLevelColorSrc,
            );
            this.LoadSingleFace(
              `.adjacent-map-limit-bottom-${limitType}`,
              BiomeCyberiaScope.Data[biomeKey].imageSrc,
              BiomeCyberiaScope.Data[biomeKey].imageTopLevelColorSrc,
            );
          }
          if (this.Data[type][id].model.world.type === 'width' && (limitType === 'top' || limitType === 'bottom')) {
            this.LoadSingleFace(
              `.adjacent-map-limit-${limitType}-right`,
              BiomeCyberiaScope.Data[biomeKey].imageSrc,
              BiomeCyberiaScope.Data[biomeKey].imageTopLevelColorSrc,
            );
            this.LoadSingleFace(
              `.adjacent-map-limit-${limitType}-left`,
              BiomeCyberiaScope.Data[biomeKey].imageSrc,
              BiomeCyberiaScope.Data[biomeKey].imageTopLevelColorSrc,
            );
          }
        }
      }
    }
  },
  ChangeFace: async function (options = { type: 'user', id: 'main', direction: '' }) {
    const { type, id, direction } = options;

    if (
      ElementsCyberia.LocalDataScope[type][id].path.length > 1 ||
      !this.Data[type] ||
      !this.Data[type][id].model.world
    )
      return;
    if (this.Data[type][id].model.world.type === 'height' && (direction === 'right' || direction === 'left')) return;
    if (this.Data[type][id].model.world.type === 'width' && (direction === 'top' || direction === 'bottom')) return;

    const initX = ElementsCyberia.Data[type][id].x;
    const initY = ElementsCyberia.Data[type][id].y;

    if (!ElementsCyberia.LocalDataScope[type][id].isChangeFace)
      setTimeout(async () => {
        if (
          !ElementsCyberia.LocalDataScope[type][id].isChangeFace &&
          initX === ElementsCyberia.Data[type][id].x &&
          initY === ElementsCyberia.Data[type][id].y
        ) {
          const [newFace, initDirection] = WorldCyberiaLimit({ type: this.Data[type][id].model.world.type })[
            ElementsCyberia.Data[type][id].model.world.face
          ][direction];

          await this.InstanceFace({ type, id, newFace, initDirection });
        }
      }, 750);
  },
  isAdjacentCollision: async function ({ type, id, newFace, initDirection, x, y }) {
    let newBiomeCyberia;
    for (const biomeKey of Object.keys(BiomeCyberiaScope.Data)) {
      if (BiomeCyberiaScope.Data[biomeKey]._id === this.Data[type][id].model.world.face[newFace - 1]) {
        newBiomeCyberia = BiomeCyberiaScope.Data[biomeKey];
        break;
      }
    }
    let newX = x ?? newInstance(ElementsCyberia.Data[type][id].x);
    let newY = y ?? newInstance(ElementsCyberia.Data[type][id].y);
    switch (initDirection) {
      case 'left':
        newX = 0.5;
        break;
      case 'right':
        newX = MatrixCyberia.Data.dim - ElementsCyberia.Data[type][id].dim - 0.5;
        break;
      case 'bottom':
        newY = MatrixCyberia.Data.dim - ElementsCyberia.Data[type][id].dim - 0.5;
        break;
      case 'top':
        newY = 0.5;
        break;
      default:
        break;
    }
    return {
      newX,
      newY,
      newBiomeCyberia,
      collision: BiomeCyberiaManagement.isBiomeCyberiaCollision({ type, id, x: newX, y: newY, biome: newBiomeCyberia }),
    };
  },
  InstanceFace: async function (options = { type: 'user', id: 'main', newFace: 0, initDirection: '' }) {
    console.warn('InstanceFace', options);
    const { type, id, newFace, initDirection } = options;
    const { collision, newBiomeCyberia, newX, newY } = await this.isAdjacentCollision(options);
    if (collision) return;
    console.warn('newBiomeCyberia', newBiomeCyberia);
    console.warn('initDirection', initDirection);
    await InteractionPanelCyberia.PanelRender.removeAllActionPanel();
    ElementsCyberia.Data[type][id].x = newX;
    ElementsCyberia.Data[type][id].y = newY;
    ElementsCyberia.Data[type][id].model.world.face = newFace;
    await BiomeCyberiaManagement.load({
      data: newBiomeCyberia,
    });
    this.LoadAdjacentFaces(type, id);
    InteractionPanelCyberia.PanelRender.map({ face: newFace });
    InteractionPanelCyberia.PanelRender.element({ type, id });
    PointAndClickMovementCyberia.TriggerTargetEvents({ type, id });
    this.EmitNewWorldCyberiaFace({ type, id });
  },
  EmitNewWorldCyberiaFace: (options) => {
    const { type, id } = options;
    if (type === 'user' && id === 'main') ElementsCyberia.LocalDataScope[type][id].isChangeFace = true;
    for (const elementType of Object.keys(ElementsCyberia.Data)) {
      for (const elementId of Object.keys(ElementsCyberia.Data[elementType])) {
        if (elementId !== 'main') {
          PixiCyberia.removeElement({ type: elementType, id: elementId });
          delete ElementsCyberia.Data[elementType][elementId];
        }
      }
      if (['user', 'bot', 'skill'].includes(elementType))
        SocketIo.Emit(elementType, {
          status: 'update-world-face',
          element: { model: { world: ElementsCyberia.Data[type][id].model.world } },
        });
    }
  },
  Load: async function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;

    if (!this.Data[type]) this.Data[type] = {};
    if (!this.Data[type][id]) this.Data[type][id] = { model: {} };

    if (!('world' in this.Data[type][id].model)) {
      const { data } = await CyberiaWorldService.get({ id: ElementsCyberia.Data[type][id].model.world._id });
      LoadingAnimation.barLevel.append();
      if (!CyberiaParams.CYBERIA_WORLD_ID) CyberiaParams.CYBERIA_WORLD_ID = data[0]._id;
      this.Data[type][id].model.world = data[0];
    }

    // load single world
    let indexFace = 0;
    for (const _id of this.Data[type][id].model.world.face) {
      indexFace++;
      if (ElementsCyberia.Data.user.main.model.world.face === indexFace) {
        await BiomeCyberiaManagement.load({
          data: await BiomeCyberiaManagement.loadData({
            data: { _id },
          }),
        });
        LoadingAnimation.barLevel.append();
      } else
        await BiomeCyberiaManagement.loadData({
          data: { _id },
        });
    }

    this.LoadAdjacentFaces(type, id);
    InteractionPanelCyberia.PanelRender.map({ face: ElementsCyberia.Data.user.main.model.world.face });
    const adjacentWorldData = WorldCyberiaManagement.Data[type][id].model.world.adjacentFace;
    if (adjacentWorldData && adjacentWorldData.type && adjacentWorldData.type !== 'default') {
      switch (adjacentWorldData.type) {
        case 'color':
          {
            s(`.adjacent-map-background-top`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-bottom`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-left`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-right`).style.background = adjacentWorldData.value;

            s(`.adjacent-map-background-top-left`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-top-right`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-bottom-left`).style.background = adjacentWorldData.value;
            s(`.adjacent-map-background-bottom-right`).style.background = adjacentWorldData.value;
          }
          break;
      }
    } else {
      s(`.adjacent-map-background-top-left`).style.background = null;
      s(`.adjacent-map-background-top-right`).style.background = null;
      s(`.adjacent-map-background-bottom-left`).style.background = null;
      s(`.adjacent-map-background-bottom-right`).style.background = null;
      if (this.Data[type][id].model.world.type === 'height') {
        s(`.adjacent-map-background-top`).style.background = `rgba(0,0,0,0.5)`;
        s(`.adjacent-map-background-bottom`).style.background = `rgba(0,0,0,0.5)`;
        s(`.adjacent-map-background-left`).style.background = null;
        s(`.adjacent-map-background-right`).style.background = null;
      } else if (this.Data[type][id].model.world.type === 'width') {
        s(`.adjacent-map-background-top`).style.background = null;
        s(`.adjacent-map-background-bottom`).style.background = null;
        s(`.adjacent-map-background-left`).style.background = `rgba(0,0,0,0.5)`;
        s(`.adjacent-map-background-right`).style.background = `rgba(0,0,0,0.5)`;
      }
    }
  },
};

const WorldCyberia = {
  worlds: [],
  WorldCyberiaScope: {
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
    const resultWorldCyberias = await CyberiaWorldService.get({ id: 'all' });
    NotificationManager.Push({
      html: resultWorldCyberias.status,
      status: resultWorldCyberias.status,
    });
    if (resultWorldCyberias.status === 'success') this.worlds = resultWorldCyberias.data;

    const resultBiomeCyberia = await CyberiaBiomeService.get({ id: 'all-name' });
    NotificationManager.Push({
      html: resultBiomeCyberia.status,
      status: resultBiomeCyberia.status,
    });
    const resultInstancesCyberia = await CyberiaInstanceService.get({ id: 'lite' });
    NotificationManager.Push({
      html: resultInstancesCyberia.status,
      status: resultInstancesCyberia.status,
    });
    let render = '';

    for (const index of range(0, 5)) {
      render += html`<div class="inl section-mp">
          ${await DropDown.Render({
            // value: ``,
            id: `face-${index}`,
            label: html`face ${index + 1}`,
            resetOption: true,
            resetOnClick: () => (this.WorldCyberiaScope.face[index] = null),
            data: resultBiomeCyberia.data.map((biome) => {
              return {
                data: biome,
                display: html`${biome.name} <span class="drop-down-option-info">[${biome.biome}]</span>`,
                value: biome._id,
                onClick: async () => {
                  this.WorldCyberiaScope.face[index] = biome;
                  s(`.btn-generate-world`).click();
                },
              };
            }),
          })}
        </div>
        <div class="inl section-mp">
          ${await DropDown.Render({
            // value: ``,
            id: `instance-${index}`,
            label: html`instance ${index + 1}`,
            resetOption: true,
            // resetOnClick: () => (this.WorldCyberiaScope.face[index] = null),
            data: resultInstancesCyberia.data.map((instance) => {
              return {
                data: instance,
                display: html`${instance.name}`,
                value: instance._id,
                onClick: async () => {
                  if (!this.WorldCyberiaScope.instance) this.WorldCyberiaScope.instance = [];
                  const { status, data, message } = await CyberiaInstanceService.get({ id: instance._id });
                  NotificationManager.Push({
                    html: resultInstancesCyberia.status === 'error' ? message : status,
                    status: resultInstancesCyberia.status,
                  });
                  this.WorldCyberiaScope.instance[index] = data;
                },
              };
            }),
          })}
        </div>`;
    }
    setTimeout(() => {
      EventsUI.onClick(`.btn-generate-world`, async () => {
        for (const index of range(0, 5)) {
          if (!DropDown.Tokens[`face-${index}`].value) delete this.WorldCyberiaScope.face[index];
          await this.renderFace(index);
        }
      });
      EventsUI.onClick(`.btn-generate-random-world`, async () => {
        for (const index of range(0, 5)) {
          s(
            `.dropdown-option-face-${index}-${
              resultBiomeCyberia.data[random(0, resultBiomeCyberia.data.length - 1)]._id
            }`,
          ).click();
          // await this.renderFace(index);
        }
      });
      EventsUI.onClick(`.btn-upload-world`, async () => {
        const body = newInstance(this.WorldCyberiaScope);
        body.face = body.face.map((face) => {
          if (face && face._id) return face._id;
          return null;
        });
        body.name = s(`.world-name`).value;
        body.adjacentFace = WorldCyberia.adjacentFaceJsonEditor.content.json.type
          ? WorldCyberia.adjacentFaceJsonEditor.content.json
          : undefined;
        body.quests =
          WorldCyberia.questsJsonEditor.content.json.length > 0
            ? WorldCyberia.questsJsonEditor.content.json
            : undefined;
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
        s(`.btn-generate-world`).click();
      });
      EventsUI.onClick(`.btn-reset-instances`, async () => {
        for (const index of range(0, 5)) s(`.dropdown-option-instance-${index}-reset`).click();
        delete this.WorldCyberiaScope.instance;
      });
      WorldCyberia.adjacentFaceJsonEditor.newInstance();
      WorldCyberia.questsJsonEditor.newInstance();
    });
    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: 'world' })}
      <div class="fl">
        <div class="in fll world-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-sliders"></i> ${Translate.Render('config')}</div>
            <div class="in">
              ${render}
              <div class="inl section-mp">
                ${await DropDown.Render({
                  value: 'width',
                  label: html`${Translate.Render('type')}`,
                  data: ['width', 'height'].map((worldType) => {
                    const infoType = WorldCyberiaType[worldType].worldFaces;
                    return {
                      display: html`
                      <i class="fa-solid fa-text-${worldType}"></i></i> ${Translate.Render(worldType)} 
                      <span class="drop-down-option-info">${infoType}</span>`,
                      value: worldType,
                      data: worldType,
                      onClick: () => {
                        this.WorldCyberiaScope.type = worldType;
                      },
                    };
                  }),
                })}
              </div>
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-generate-world hide`,
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
                class: `inl section-mp btn-custom btn-reset-instances`,
                label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render(`clear`)} instances`,
              })}
              ${await BtnIcon.Render({
                class: `inl section-mp btn-custom btn-upload-world`,
                label: html`<i class="fa-solid fa-upload"></i> ${Translate.Render(`upload`)}`,
              })}
              ${await Input.Render({
                id: `world-name`,
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('name')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
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
          <div class="in section-mp">
            <div class="in sub-title-modal">{ } Adjacent Face Config</div>
            <div class="in"><div class="jsoneditor-adjacentFace"></div></div>
          </div>
          <div class="in section-mp">
            <div class="in sub-title-modal">{ } Quests Config</div>
            <div class="in"><div class="jsoneditor-quests"></div></div>
          </div>
        </div>
      </div>
      <div class="in section-mp">
        <div class="in sub-title-modal"><i class="far fa-list-alt"></i> ${Translate.Render('worlds')}</div>
        <div class="in">
          ${await AgGrid.Render({
            id: `ag-grid-world`,
            darkTheme,
            gridOptions: {
              rowData: this.getGridData(),
              columnDefs: [
                // { field: '_id', headerName: 'ID' },
                { field: 'face', headerName: 'face' },
                { field: 'name', headerName: 'Name' },
                { field: 'type', headerName: 'type' },
                { headerName: '', cellRenderer: LoadWorldCyberiaRenderer },
              ],
            },
          })}
        </div>
      </div>
    `;
  },
  renderFace: async function (index) {
    if (
      this.WorldCyberiaScope.face[index] &&
      this.WorldCyberiaScope.face[index].fileId &&
      this.WorldCyberiaScope.face[index].topLevelColorFileId
    ) {
      const resultFile = await FileService.get({ id: this.WorldCyberiaScope.face[index].fileId });

      const imageData = resultFile.data[0];

      const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

      const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

      const imageSrc = URL.createObjectURL(imageFile);

      const resultTopLevelColorFile = await FileService.get({
        id: this.WorldCyberiaScope.face[index].topLevelColorFileId,
      });

      const imageTopLevelColorData = resultTopLevelColorFile.data[0];

      const imageTopLevelColorBlob = new Blob([new Uint8Array(imageTopLevelColorData.data.data)], {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorFile = new File([imageTopLevelColorBlob], imageTopLevelColorData.name, {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorSrc = URL.createObjectURL(imageTopLevelColorFile);

      htmls(
        `.world-${index}`,
        html`
          <img class="abs face-world-img" src="${imageSrc}" ${index === 2 ? `style="transform: rotate(180deg)"` : ''} />
          <div class="abs center" style="${borderChar(2, 'black')}">${index + 1}</div>
          <img
            class="abs face-world-img"
            src="${imageTopLevelColorSrc}"
            ${index === 2 ? `style="transform: rotate(180deg)"` : ''}
          />
          <div class="abs center" style="${borderChar(2, 'black')}">${index + 1}</div>
        `,
      );
      return;
    }
    this.WorldCyberiaScope.face[index] = null;
    htmls(`.world-${index}`, html`<div class="abs center" style="${borderChar(2, 'black')}">${index + 1}</div>`);
  },
  renderAllFace: async function () {
    for (const index of range(0, 5)) await this.renderFace(index);
  },
  adjacentFaceJsonEditor: {
    content: {
      json: {
        type: 'default',
        value: '',
        fileId: '',
      },
    },
    instance: null,
    newInstance: () => {
      if (WorldCyberia.adjacentFaceJsonEditor.instance) WorldCyberia.adjacentFaceJsonEditor.instance.destroy();
      WorldCyberia.adjacentFaceJsonEditor.instance = createJSONEditor({
        target: s('.jsoneditor-adjacentFace'),
        props: {
          content: WorldCyberia.adjacentFaceJsonEditor.content,
          onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
            // content is an object { json: JSONData } | { text: string }
            console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
            WorldCyberia.adjacentFaceJsonEditor.content.json = JSON.parse(updatedContent.text);
          },
        },
      });
    },
  },
  questsJsonEditor: {
    content: {
      json: [
        {
          id: '',
        },
      ],
    },
    instance: null,
    newInstance: () => {
      if (WorldCyberia.questsJsonEditor.instance) WorldCyberia.questsJsonEditor.instance.destroy();
      WorldCyberia.questsJsonEditor.instance = createJSONEditor({
        target: s('.jsoneditor-quests'),
        props: {
          content: WorldCyberia.questsJsonEditor.content,
          onChange: (updatedContent, previousContent, { contentErrors, patchResult }) => {
            // content is an object { json: JSONData } | { text: string }
            console.log('onChange', { updatedContent, previousContent, contentErrors, patchResult });
            WorldCyberia.questsJsonEditor.content.json = JSON.parse(updatedContent.text);
          },
        },
      });
    },
  },
};

export { WorldCyberia, WorldCyberiaManagement, WorldCyberiaLimit, getWorldId };
