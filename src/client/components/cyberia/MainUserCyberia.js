import { Keyboard } from '../core/Keyboard.js';
import { BiomeCyberiaManagement } from './BiomeCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';
import {
  getDirection,
  getDistance,
  newInstance,
  objectEquals,
  orderArrayFromAttrInt,
  range,
  round10,
} from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { Account } from '../core/Account.js';
import { append, getProxyPath, s, htmls } from '../core/VanillaJs.js';
import { JoyStick } from '../core/JoyStick.js';
import { CyberiaParams, isElementCollision, updateMovementDirection } from './CommonCyberia.js';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { SkillCyberia } from './SkillCyberia.js';
import { BagCyberia, Slot } from './BagCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { QuestManagementCyberia } from './QuestCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { Modal } from '../core/Modal.js';
import { Translate } from '../core/Translate.js';
import { BtnIcon } from '../core/BtnIcon.js';

const logger = loggerFactory(import.meta);

const MainUserCyberia = {
  PixiCyberiaMainUserCyberia: {},
  Render: async function () {
    append(
      'body',
      html` <div class="fix center main-user-container hide">
        <canvas class="abs main-user-pixi-container"></canvas>
      </div>`,
    );
    return;
    this.PixiCyberiaMainUserCyberia = new Application({
      view: s(`.main-user-pixi-container`),
      width: PixiCyberia.MetaData.dim,
      height: PixiCyberia.MetaData.dim,
      backgroundAlpha: 0,
    });
  },
  Update: async function (options = { oldElement: {} }) {
    const type = 'user';
    const id = 'main';
    const { oldElement } = options;

    try {
      await WorldCyberiaManagement.Load({ type, id });
      await QuestManagementCyberia.Load({ type, id });
    } catch (error) {
      console.error(error);
    }

    const idEvent = `${type}.${id}`;

    Keyboard.Event[idEvent] = {
      ArrowLeft: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet || PixiCyberia.transportBlock) return;
        const x = ElementsCyberia.Data[type][id].x - ElementsCyberia.Data[type][id].vel;
        const y = ElementsCyberia.Data[type][id].y;
        if (BiomeCyberiaManagement.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].x = x;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowRight: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet || PixiCyberia.transportBlock) return;
        const x = ElementsCyberia.Data[type][id].x + ElementsCyberia.Data[type][id].vel;
        const y = ElementsCyberia.Data[type][id].y;
        if (BiomeCyberiaManagement.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].x = x;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowUp: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet || PixiCyberia.transportBlock) return;
        const x = ElementsCyberia.Data[type][id].x;
        const y = ElementsCyberia.Data[type][id].y - ElementsCyberia.Data[type][id].vel;
        if (BiomeCyberiaManagement.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].y = y;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowDown: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet || PixiCyberia.transportBlock) return;
        const x = ElementsCyberia.Data[type][id].x;
        const y = ElementsCyberia.Data[type][id].y + ElementsCyberia.Data[type][id].vel;
        if (BiomeCyberiaManagement.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].y = y;
        PixiCyberia.updatePosition({ type, id });
      },
    };

    let lastX = newInstance(ElementsCyberia.Data[type][id].x);
    let lastY = newInstance(ElementsCyberia.Data[type][id].y);
    let lastDirection;
    if (ElementsCyberia.Interval[type][id]['main-skin-sprite-controller'])
      clearInterval(ElementsCyberia.Interval[type][id]['main-skin-sprite-controller']);
    ElementsCyberia.Interval[type][id]['main-skin-sprite-controller'] = setInterval(() => {
      if (lastX !== ElementsCyberia.Data[type][id].x || lastY !== ElementsCyberia.Data[type][id].y) {
        const direction = getDirection({
          x1: lastX,
          y1: lastY,
          x2: ElementsCyberia.Data[type][id].x,
          y2: ElementsCyberia.Data[type][id].y,
        });
        lastX = newInstance(ElementsCyberia.Data[type][id].x);
        lastY = newInstance(ElementsCyberia.Data[type][id].y);
        const stopX = newInstance(lastX);
        const stopY = newInstance(lastY);
        setTimeout(() => {
          if (stopX === ElementsCyberia.Data[type][id].x && stopY === ElementsCyberia.Data[type][id].y) {
            switch (lastDirection) {
              case 'n':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '02';
                      return component;
                    },
                  );
                break;
              case 's':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '08';
                      return component;
                    },
                  );
                break;
              case 'e':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '06';
                      return component;
                    },
                  );
                break;
              case 'se':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '06';
                      return component;
                    },
                  );
                break;
              case 'ne':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '06';
                      return component;
                    },
                  );
                break;
              case 'w':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '04';
                      return component;
                    },
                  );
                break;
              case 'sw':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '04';
                      return component;
                    },
                  );
                break;
              case 'nw':
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '04';
                      return component;
                    },
                  );
                break;
              default:
                if (ElementsCyberia.Data[type][id].components.skin)
                  ElementsCyberia.Data[type][id].components.skin = ElementsCyberia.Data[type][id].components.skin.map(
                    (component) => {
                      component.position = '08';
                      return component;
                    },
                  );
                break;
            }
            PixiCyberia.triggerUpdateDisplay({ type, id });
            SocketIo.Emit(type, {
              status: 'update-skin-position',
              element: { components: { skin: ElementsCyberia.Data[type][id].components.skin } },
              direction: lastDirection,
            });
          }
        }, 500);

        if (lastDirection !== direction) {
          lastDirection = newInstance(direction);
          ElementsCyberia.LocalDataScope[type][id].lastDirection = lastDirection;
          logger.info('New direction', direction);
        } else if (ElementsCyberia.Data[type][id].components.skin.find((skin) => skin.position[0] === '1')) return;

        ElementsCyberia.Data[type][id] = updateMovementDirection({
          direction,
          element: ElementsCyberia.Data[type][id],
        });

        PixiCyberia.triggerUpdateDisplay({ type, id });
        SocketIo.Emit(type, {
          status: 'update-skin-position',
          element: { components: { skin: ElementsCyberia.Data[type][id].components.skin } },
          direction: lastDirection,
        });
      }
    }, CyberiaParams.EVENT_CALLBACK_TIME);

    if (Object.values(oldElement).length > 0) {
      await WorldCyberiaManagement.Load();

      if (!objectEquals(oldElement.model.world, ElementsCyberia.Data[type][id].model.world))
        WorldCyberiaManagement.EmitNewWorldCyberiaFace({ type, id });

      if (oldElement.x !== ElementsCyberia.Data[type][id].x || oldElement.y !== ElementsCyberia.Data[type][id].y)
        SocketIo.Emit(type, {
          status: 'update-position',
          element: { x: ElementsCyberia.Data[type][id].x, y: ElementsCyberia.Data[type][id].y },
        });
      SocketIo.Emit(type, {
        status: 'update-skin-position',
        element: { components: { skin: ElementsCyberia.Data[type][id].components.skin } },
        direction: lastDirection,
      });
    }

    Account.UpdateEvent[idEvent] = (options) => {
      const { user } = options;
      ElementsCyberia.Data.user.main.model.user = user;
    };

    SkillCyberia.setMainKeysSkillCyberia();
    await BagCyberia.updateAll({ bagId: 'cyberia-bag', type, id });
    PixiCyberia.setComponents({ type, id });
    CharacterCyberia.renderCharacterCyberiaStat();
    PixiCyberia.updateLife({ type, id });
    PixiCyberia.setUsername({ type, id });
    await InteractionPanelCyberia.PanelRender.removeAllActionPanel();
    await InteractionPanelCyberia.PanelRender.element({ type, id });
    await InteractionPanelCyberia.PanelRender.AllQuest({ type, id });
    PixiCyberia.topLevelCallBack({ type, id });

    PointAndClickMovementCyberia.TargetEvent[idEvent] = async ({ type, id }) => {
      PixiCyberia.displayPointerArrow({
        oldElement:
          this.lastArrowElement && ElementsCyberia.Data[this.lastArrowElement.type]?.[this.lastArrowElement.id]
            ? this.lastArrowElement
            : undefined,
        newElement: { type, id },
      });
      this.lastArrowElement = newInstance({ type, id });
    };
    PointAndClickMovementCyberia.TargetEvent[idEvent]({ type, id });

    if (!Modal.mobileModal()) {
      Keyboard.Event['focus'] = {
        f: this.focusTarget,
        F: this.focusTarget,
      };
    }
    s(`.main-user-container`).style.display = 'block';
    LoadingAnimation.removeSplashScreen();
  },
  renderCenterRedTriangle: function () {
    // const fontSize = 1;
    if (!this.MainUserCyberiaContainer) {
      const dim = PixiCyberia.MetaData.dim / 5;

      this.MainUserCyberiaContainer = new Container();
      this.MainUserCyberiaContainer.x = PixiCyberia.MetaData.dim / 2 - (dim * 3) / 2;
      this.MainUserCyberiaContainer.y = PixiCyberia.MetaData.dim / 2 - dim / 2;
      this.MainUserCyberiaContainer.width = dim * 3;
      this.MainUserCyberiaContainer.height = dim;
      this.MainUserCyberiaContainer.visible = true;

      // this.MainUserCyberiaBackground = new Sprite(Texture.WHITE);
      // this.MainUserCyberiaBackground.tint = `#ff0000ff`;
      this.MainUserCyberiaBackground = Sprite.from(`${getProxyPath()}assets/util/down-pj-pointer.png`);
      this.MainUserCyberiaBackground.x = 0;
      this.MainUserCyberiaBackground.y = 0;
      this.MainUserCyberiaBackground.width = dim * 3;
      this.MainUserCyberiaBackground.height = dim;
      this.MainUserCyberiaBackground.visible = true;

      this.MainUserCyberiaContainer.addChild(this.MainUserCyberiaBackground);
      this.PixiCyberiaMainUserCyberia.stage.addChild(this.MainUserCyberiaContainer);
    }
  },
  keyBoardFocusCallback: function () {
    const keyBoardFocusQueue = [];
    const posY = round10(ElementsCyberia.Data.user.main.y);
    const posX = round10(ElementsCyberia.Data.user.main.x);
    const radius = 8;

    for (const y of range(posY - radius, posY + radius))
      for (const x of range(posX - radius, posX + radius))
        for (const type of ['user', 'bot']) {
          for (const elementId of Object.keys(ElementsCyberia.Data[type])) {
            if (
              isElementCollision({
                A: { x, y, dim: 1 },
                B: ElementsCyberia.Data[type][elementId],
                dimPaintByCell: MatrixCyberia.Data.dimPaintByCell,
              }) &&
              !keyBoardFocusQueue.find((t) => t.type === type && t.id === elementId) &&
              type !== 'user' &&
              elementId !== 'main'
            ) {
              keyBoardFocusQueue.push({
                type,
                id: elementId,
                distance: getDistance(
                  ElementsCyberia.Data.user.main.x,
                  ElementsCyberia.Data.user.main.y,
                  ElementsCyberia.Data[type][elementId].x,
                  ElementsCyberia.Data[type][elementId].y,
                ),
              });
            }
          }
        }

    MainUserCyberia.keyBoardFocusQueue = orderArrayFromAttrInt(keyBoardFocusQueue, 'distance', true);
  },
  keyBoardFocusQueue: [],
  focusTargetBlock: false,
  focusTarget: function () {
    if (MainUserCyberia.focusTargetBlock) return;
    MainUserCyberia.focusTargetBlock = true;
    QuestManagementCyberia.questClosePanels = [];
    MainUserCyberia.keyBoardFocusCallback();

    if (MainUserCyberia.keyBoardFocusQueue.length > 0)
      PointAndClickMovementCyberia.TriggerTargetEvents(MainUserCyberia.keyBoardFocusQueue.pop());

    setTimeout(() => {
      MainUserCyberia.focusTargetBlock = false;
    }, 500);
  },
  finishSetup: () => {
    setTimeout(async () => {
      s(`.main-body`).classList.add('hide');
      s(`.ssr-loading-bar`).style.display = 'none';
      // htmls('.ssr-loading-info', html`<span style="margin-left: 2px">${Translate.Render('charge-complete')}</span>`);
      htmls('.ssr-loading-info', html``);
      if (s(`.ssr-lore-arrows-container`)) s(`.ssr-lore-arrows-container`).style.display = null;
      htmls(
        `.ssr-play-btn-container`,
        html`
          <!-- <div class="abs cyberia-splash-screen-logo-container">
              <img class="inl logo-cyberia-splash-screen" src="${getProxyPath()}assets/ui-icons/cyberia-yellow.png" />
              C&nbsp; Y&nbsp; B&nbsp; E&nbsp; R&nbsp; I&nbsp; A <br />
          
            </div>-->
          <!-- <span class="cyberia-splash-screen-logo-span"> online</span> -->
          <div class="abs center">
            <!-- style="animation: ssr-blink-animation 1s linear infinite" -->
            <div class="in cyberia-splash-screen-logo-container">
              ${await BtnIcon.Render({
                label: Translate.Render('play'),
                class: 'main-play-btn',
                style: 'width: 80px; background: rgba(0, 0, 0, 0.5);',
              })}
            </div>
          </div>
        `,
      );
      s(`.main-play-btn`).onclick = () => {
        LoadingAnimation.removeSplashScreen('.ssr-background-cyberia-lore', () => {
          SocketIo.Emit('user', {
            status: 'transportBlock',
          });
        });
      };
    }, 2000);
  },
};

export { MainUserCyberia };
