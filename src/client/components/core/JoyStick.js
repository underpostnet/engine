import JoystickController from 'joystick-controller';
import { getDirection, getId } from './CommonJs.js';
import { append, s } from './VanillaJs.js';
import { getProxyPath } from './Router.js';

const logger = loggerFactory(import.meta);

const JoyStick = {
  Tokens: {},
  Render: async function (options = { id: '', callback: ({ joyDataSet }) => {}, callBackTime: 50 }) {
    const { callback, callBackTime } = options;
    const id = options.id ? options.id : getId(this.Tokens, 'joystick-');
    this.Tokens[id] = { callback };
    append(
      'body',
      html`
        <style>
          .dynamic-joystick-container-${id} {
            /* border: 2px solid red; */
            left: 5px;
            bottom: 5px;
            height: 175px;
            width: 175px;
            z-index: 3;
          }
          .joy-img-background-${id} {
            width: 50%;
            height: 50%;
            opacity: 0.8;
            transition: 0.1;
          }
          .dynamic-joystick-container-${id}:hover {
          }
          .joy-img-background-${id}:hover {
            width: 54%;
            height: 54%;
            opacity: 1;
          }
        </style>
        <div class="abs dynamic-joystick-container-${id}">
          <img class="abs center joy-img-background-${id}" src="${getProxyPath()}assets/joy/joy_alpha.png" />
        </div>
      `,
    );

    this.Tokens[id].instance = new JoystickController(
      {
        maxRange: 70,
        level: 10,
        radius: 70,
        joystickRadius: 50,
        opacity: 0.5,
        // containerClass: 'joystick-container',
        // controllerClass: 'joystick-controller',
        // joystickClass: 'joystick',
        distortion: true,
        dynamicPosition: true,
        dynamicPositionTarget: s(`.dynamic-joystick-container-${id}`),
        mouseClickButton: 'ALL',
        hideContextMenu: true,
        // x: '120px',
        // y: '120px',
      },
      (args = { x, y, leveledX, leveledY, distance, angle }) => {
        const { angle } = args;
        if (angle === 0) return (this.Tokens[id].joyDataSet = undefined);
        const radians = parseFloat(angle);
        const direction = getDirection({ radians });
        this.Tokens[id].joyDataSet = { ...args, radians, direction };
        // logger.info(this.Tokens[id].joyDataSet, id);
      },
    );
    setInterval(() => {
      if (!this.Tokens[id].joyDataSet || !this.Tokens[id].joyDataSet.direction) return;
      this.Tokens[id].callback({ joyDataSet: this.Tokens[id].joyDataSet });
    }, callBackTime);
  },
};

export { JoyStick };
