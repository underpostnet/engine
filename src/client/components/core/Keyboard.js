import { cap, getId } from './CommonJs.js';

const Keyboard = {
  ActiveKey: {},
  Event: {},
  Init: async function (options = { callBackTime: 50 }) {
    const { callBackTime } = options;
    window.onkeydown = (e = new KeyboardEvent()) => {
      this.ActiveKey[e.key] = true;
      // e.composedPath()
      // if (['Tab'].includes(e.key)) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   e.stopImmediatePropagation();
      // }
    };
    window.onkeyup = (e = new KeyboardEvent()) => {
      delete this.ActiveKey[e.key];
    };
    setInterval(() => {
      Object.keys(this.Event).map((key) => {
        Object.keys(this.ActiveKey).map((activeKey) => {
          if (activeKey in this.Event[key]) this.Event[key][activeKey]();
        });
      });
    }, callBackTime);
  },
  instanceMultiPressKeyTokens: {},
  instanceMultiPressKey: (options = { keys: [], id, timePressDelay, eventCallBack: () => {} }) => {
    if (typeof options.keys[0] === 'string') options.keys[0] = [options.keys[0]];
    if (!options.id) options.id = getId(Keyboard.instanceMultiPressKeyTokens, 'key-press-');
    if (!options.timePressDelay) options.timePressDelay = 500;
    const { id, timePressDelay, keys, eventCallBack } = options;
    Keyboard.instanceMultiPressKeyTokens[id] = { ...options };

    let indexCombined = -1;
    for (const combinedKeys of keys) {
      indexCombined++;
      const privateIndexCombined = indexCombined;
      const multiPressKey = {};
      const triggerMultiPressKey = () => {
        for (const key of Object.keys(multiPressKey)) {
          if (!multiPressKey[key].press) return;
        }
        eventCallBack();
      };
      Keyboard.Event[`instanceMultiPressKey-${id}-${privateIndexCombined}`] = {};
      for (const key of combinedKeys) {
        multiPressKey[key] = {
          press: false,
          trigger: function () {
            if (!multiPressKey[key].press) {
              multiPressKey[key].press = true;
              triggerMultiPressKey();
              setTimeout(() => {
                multiPressKey[key].press = false;
              }, timePressDelay);
            }
          },
        };

        Keyboard.Event[`instanceMultiPressKey-${id}-${privateIndexCombined}`][key] = multiPressKey[key].trigger;
        Keyboard.Event[`instanceMultiPressKey-${id}-${privateIndexCombined}`][key.toLowerCase()] =
          multiPressKey[key].trigger;
        Keyboard.Event[`instanceMultiPressKey-${id}-${privateIndexCombined}`][key.toUpperCase()] =
          multiPressKey[key].trigger;
        Keyboard.Event[`instanceMultiPressKey-${id}-${privateIndexCombined}`][cap(key)] = multiPressKey[key].trigger;
      }
    }
  },
};

export { Keyboard };
