import { cap, getId } from './CommonJs.js';
class Keyboard {
  static ActiveKey = {};
  static Event = {};
  static async Init() {
    const callBackTime = 45;
    window.onkeydown = (e = new KeyboardEvent()) => {
      Keyboard.ActiveKey[e.key] = true;
      // e.composedPath()
      // if (['Tab'].includes(e.key)) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   e.stopImmediatePropagation();
      // }
    };
    window.onkeyup = (e = new KeyboardEvent()) => {
      delete Keyboard.ActiveKey[e.key];
    };
    setInterval(() => {
      Object.keys(Keyboard.Event).map((key) => {
        Object.keys(Keyboard.ActiveKey).map((activeKey) => {
          if (activeKey in Keyboard.Event[key]) Keyboard.Event[key][activeKey]();
        });
      });
    }, callBackTime);
  }
  static instanceMultiPressKeyTokens = {};
  static instanceMultiPressKey = (options = { keys: [], id, timePressDelay, eventCallBack: () => {} }) => {
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
  };
}
export { Keyboard };
