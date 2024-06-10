import { Keyboard } from '../core/Keyboard.js';
import { BiomeCyberiaEngine } from './BiomeCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';
import { getDirection, newInstance, objectEquals } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { Account } from '../core/Account.js';
import { append, getProxyPath, s } from '../core/VanillaJs.js';
import { JoyStick } from '../core/JoyStick.js';
import { CyberiaParams, updateMovementDirection } from './CommonCyberia.js';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { SkillCyberia } from './SkillCyberia.js';
import { BagCyberia, Slot } from './BagCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { QuestManagementCyberia } from './QuestCyberia.js';

const logger = loggerFactory(import.meta);

const MainUserCyberia = {
  PixiCyberiaMainUserCyberia: {},
  Render: async function () {
    append(
      'body',
      html` <div class="fix center main-user-container">
        <canvas class="abs main-user-pixi-container"></canvas>
      </div>`,
    );

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
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = ElementsCyberia.Data[type][id].x - ElementsCyberia.Data[type][id].vel;
        const y = ElementsCyberia.Data[type][id].y;
        if (BiomeCyberiaEngine.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].x = x;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowRight: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = ElementsCyberia.Data[type][id].x + ElementsCyberia.Data[type][id].vel;
        const y = ElementsCyberia.Data[type][id].y;
        if (BiomeCyberiaEngine.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].x = x;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowUp: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = ElementsCyberia.Data[type][id].x;
        const y = ElementsCyberia.Data[type][id].y - ElementsCyberia.Data[type][id].vel;
        if (BiomeCyberiaEngine.isBiomeCyberiaCollision({ type, id, x, y })) return;
        ElementsCyberia.Data[type][id].y = y;
        PixiCyberia.updatePosition({ type, id });
      },
      ArrowDown: () => {
        if (JoyStick.Tokens['cyberia-joystick'].joyDataSet) return;
        const x = ElementsCyberia.Data[type][id].x;
        const y = ElementsCyberia.Data[type][id].y + ElementsCyberia.Data[type][id].vel;
        if (BiomeCyberiaEngine.isBiomeCyberiaCollision({ type, id, x, y })) return;
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
    await InteractionPanelCyberia.PanelRender.element({ type, id });
    PixiCyberia.topLevelCallBack({ type, id });

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
};

export { MainUserCyberia };
