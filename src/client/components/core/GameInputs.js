import EventEmitter from 'eventemitter3';

// https://github.com/fenomas/game-inputs

function DefaultOptions() {
  this.preventDefaults = false;
  this.stopPropagation = false;
  this.allowContextMenu = false;
  this.disabled = false;
}

class GameInputs {
  /**
   *   Simple inputs manager to abstract key/mouse inputs.
   *
   * @param {HTMLElement} domElement
   * @param {DefaultOptions} options
   */

  constructor(domElement, options) {
    let opts = Object.assign({}, new DefaultOptions(), options || {});

    // settings
    /** The HTMLElement that `inputs` is bound to. */
    this.element = domElement || document;
    /** When true, all key events with bindings will call `preventDefaults`. */
    this.preventDefaults = !!opts.preventDefaults;
    /** When true, all key events with bindings will call `stopPropagation`. */
    this.stopPropagation = !!opts.stopPropagation;
    /** When this is false, the context menu will be prevented from opening if there is a binding to the right mouse button. */
    this.allowContextMenu = !!opts.allowContextMenu;
    /** When disabled, no binding events will fire. */
    this.disabled = !!opts.disabled;

    /**
     * Optional filter function. Useful if you want to, e.g.,
     * ignore a key binding if ctrl/alt are pressed, but allow that
     * same binding if it originated from a mouse event.
     * @param {KeyboardEvent & MouseEvent} ev
     * @param {string} bindingName
     */
    this.filterEvents = (ev, bindingName) => true;

    // emitters
    /**
     * Event emitter for binding **press** events.
     * The original mouse or key event will be passed as an argument.
     */
    this.down = new EventEmitter();
    /**
     * Event emitter for binding **release** events.
     * The original mouse or key event will be passed as an argument.
     */
    this.up = new EventEmitter();

    /**
     * The boolean state of whether each binding is currently pressed.
     *
     * `inputs.state['move-left'] // true if a bound key is pressed`
     * @type {{ [key:string]: boolean }}
     */
    this.state = {};

    /**
     * Numeric counters representing accumulated pointer/scroll inputs
     * since the last time `tick` was called.
     */
    this.pointerState = {
      dx: 0,
      dy: 0,
      scrollx: 0,
      scrolly: 0,
      scrollz: 0,
    };

    /**
     * How many times each binding has been **pressed**
     * since the last time `tick` was called.
     * @type {{ [key:string]: number }}
     */
    this.pressCount = {};

    /**
     * How many times each binding has been **released**
     * since the last time `tick` was called.
     * @type {{ [key:string]: number }}
     */
    this.releaseCount = {};

    // internal state
    /** @private @type {{ [key:string]: string[] }}   code -> [...binding names] */
    this._keyBindmap = {};
    /** @private @type {{ [key:string]: boolean }} code -> isDown */
    this._keyStates = {};
    /** @private @type {{ [key:string]: number }}  bindingName -> currCt */
    this._bindPressCount = {};
    /** @private */
    this._touches = { lastX: 0, lastY: 0, currID: null };

    /** @private For a macOs bug workaround */
    this._pressedDuringMeta = {};

    // register for ALL THE dom events
    if (document.readyState !== 'loading') {
      initEvents(this);
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        (ev) => {
          initEvents(this);
        },
        { once: true },
      );
    }
  }

  /**
   * Binds one or more physical keys to an arbitrary binding name.
   * Key strings should align to `KeyboardEvent.code` strings -
   * e.g. `KeyA`, `ArrowDown`, etc.
   *
   * `inputs.bind('move-player-left', 'KeyW', 'ArrowLeft')
   *
   * @param {string} bindingName
   * @param {...string} keys
   */
  bind(bindingName, ...keys) {
    keys.forEach((code) => {
      let bindings = this._keyBindmap[code] || [];
      if (bindings.includes(bindingName)) return;
      bindings.push(bindingName);
      this._keyBindmap[code] = bindings;
    });
    this.state[bindingName] = !!this.state[bindingName];
    this.pressCount[bindingName] = this.pressCount[bindingName] || 0;
    this.releaseCount[bindingName] = this.releaseCount[bindingName] || 0;
  }

  /**
   * Removes all key bindings for a given binding name.
   *
   * `inputs.unbind('move-player-left')
   */
  unbind(bindingName) {
    for (let code in this._keyBindmap) {
      let bindings = this._keyBindmap[code];
      let i = bindings.indexOf(bindingName);
      if (i > -1) {
        bindings.splice(i, 1);
      }
    }
  }

  /**
   * Returns a copy of all existing bindings, in the format:
   * ```js
   *   {
   *      bindingName: [ keyCode1, keyCode2, ... ]
   *      ...
   *   }
   * ```
   */
  getBindings() {
    let res = {};
    for (let code in this._keyBindmap) {
      let bindings = this._keyBindmap[code];
      bindings.forEach((bindingName) => {
        res[bindingName] = res[bindingName] || [];
        res[bindingName].push(code);
      });
    }
    return res;
  }

  /**
   * Tick function - clears out all cumulative counters
   */
  tick() {
    zeroAllProperties(this.pointerState);
    zeroAllProperties(this.pressCount);
    zeroAllProperties(this.releaseCount);
  }
}

function zeroAllProperties(obj) {
  for (let key in obj) obj[key] = 0;
}

/*
 *
 *   PRIVATE FUNCTIONS
 *
 */

/** @param {GameInputs} inputs */
function initEvents(inputs) {
  // keys
  window.addEventListener('keydown', onKeyEvent.bind(null, inputs, true), false);
  window.addEventListener('keyup', onKeyEvent.bind(null, inputs, false), false);

  // pointer/mouse events
  let pointerOpts = { passive: true };
  if (window.PointerEvent) {
    inputs.element.addEventListener('pointerdown', onPointerEvent.bind(null, inputs, true), pointerOpts);
    window.document.addEventListener('pointerup', onPointerEvent.bind(null, inputs, false), pointerOpts);
    inputs.element.addEventListener('pointermove', onPointerMove.bind(null, inputs), pointerOpts);
  } else {
    inputs.element.addEventListener('mousedown', onPointerEvent.bind(null, inputs, true), pointerOpts);
    window.document.addEventListener('mouseup', onPointerEvent.bind(null, inputs, false), pointerOpts);
    inputs.element.addEventListener('mousemove', onPointerMove.bind(null, inputs), pointerOpts);
  }
  inputs.element.addEventListener('wheel', onWheelEvent.bind(null, inputs), pointerOpts);
  inputs.element.addEventListener('contextmenu', onContextMenu.bind(null, inputs), false);

  // doc-level blur event for edge cases
  window.addEventListener('blur', onWindowBlur.bind(null, inputs), false);
}

/*
 *
 *
 *      INTERNALS - DOM EVENT HANDLERS
 *
 *
 */

function onKeyEvent(inputs, nowDown, ev) {
  handleKeyEvent(ev.code, nowDown, inputs, ev);
  workaroundMacBug(nowDown, inputs, ev);
}

function onPointerEvent(inputs, nowDown, ev) {
  // if pointer events supported, only track the first
  if ('pointerId' in ev) {
    if (nowDown) {
      if (inputs._touches.currID !== null) return;
      inputs._touches.currID = ev.pointerId;
    } else {
      if (inputs._touches.currID !== ev.pointerId) return;
      inputs._touches.currID = null;
    }
  }
  let button = 'button' in ev ? ev.button + 1 : 1;
  handleKeyEvent('Mouse' + button, nowDown, inputs, ev);
  return false;
}

function onPointerMove(inputs, ev) {
  // if a touch exists, ignore movement of other touches
  if ('pointerId' in ev && inputs._touches.currID !== null) {
    if (inputs._touches.currID !== ev.pointerId) return;
  }
  // fire no events, just expose the state data
  let dx = ev.movementX || ev.mozMovementX || 0,
    dy = ev.movementY || ev.mozMovementY || 0;
  inputs.pointerState.dx += dx;
  inputs.pointerState.dy += dy;
}

/*
 *
 *      mousewheel / scroll handling...
 *
 */

function onWheelEvent(inputs, ev) {
  let scale = 1;
  switch (ev.deltaMode) {
    case 0:
      scale = 1;
      break; // Pixel
    case 1:
      scale = 12;
      break; // Line
    case 2: // page
      // TODO: investigate when this happens, what correct handling is
      scale = inputs.element.clientHeight || window.innerHeight;
      break;
  }
  // accumulate state
  inputs.pointerState.scrollx += (ev.deltaX || 0) * scale;
  inputs.pointerState.scrolly += (ev.deltaY || 0) * scale;
  inputs.pointerState.scrollz += (ev.deltaZ || 0) * scale;
}

/*
 *
 *          Edge cases...
 *
 */

function onContextMenu(inputs, ev) {
  if (!inputs.allowContextMenu) {
    ev.preventDefault();
    return false;
  }
}

function onWindowBlur(inputs) {
  // at least some browsers handle mouse events correctly here
  // but not keys, so on window blur simulate a keyUp for all pressed keys
  // there may be a better way to handle this someday..
  for (let code in inputs._keyStates) {
    if (!inputs._keyStates[code]) continue;
    if (/^Mouse\d/.test(code)) continue;
    handleKeyEvent(code, false, inputs, {
      code: code,
      note: `This is a mocked KeyboardEvent made by the 'game-inputs' module`,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
  }
}

/*
 *
 *
 *          FINAL KEY BIND HANDLING
 *
 *
 */

// tracks the state/counts of individual physical keys
function handleKeyEvent(code, nowDown, inputs, ev) {
  let bindings = inputs._keyBindmap[code];
  if (!bindings) return;

  // if the key state has changed, handle the event for all bindings
  let prevState = inputs._keyStates[code];
  if (XOR(prevState, nowDown)) {
    inputs._keyStates[code] = nowDown;
    bindings.forEach((bindingName) => {
      // allow client to filter events if applicable
      let allow = inputs.filterEvents ? inputs.filterEvents(ev, bindingName) : true;
      if (!allow) return;
      // finally emit the event
      handleBindingEvent(bindingName, nowDown, inputs, ev);
    });
  }

  // prevent/stop only for non-mouse events
  if (!('button' in ev)) {
    if (inputs.preventDefaults && !ev.defaultPrevented) {
      ev.preventDefault();
    }
    if (inputs.stopPropagation) ev.stopPropagation();
  }
}

// tracks the state/counts of virtual bindings
function handleBindingEvent(bindingName, pressed, inputs, ev) {
  // externally, track *cumulative* press/release counts
  let counter = pressed ? inputs.pressCount : inputs.releaseCount;
  counter[bindingName] = (counter[bindingName] || 0) + 1;
  // internally, track *current* press count (to handle overlapping keybinds)
  let ct = inputs._bindPressCount[bindingName] || 0;
  ct += pressed ? 1 : -1;
  if (ct < 0) {
    ct = 0;
  } // shouldn't happen
  inputs._bindPressCount[bindingName] = ct;

  // emit event if binding's state has changed
  let currstate = inputs.state[bindingName];
  if (XOR(currstate, ct)) {
    inputs.state[bindingName] = ct > 0;
    let emitter = pressed ? inputs.down : inputs.up;
    if (!inputs.disabled) emitter.emit(bindingName, ev);
  }
}

/*
 *
 *
 *    HELPERS
 *
 *
 */

// how is this not part of Javascript?
function XOR(a, b) {
  return a ? !b : b;
}

/*
 *
 *
 *    MEHHHH
 *
 *
 */

function workaroundMacBug(down, inputs, ev) {
  let isMeta = /^Meta/.test(ev.code);
  if (ev.metaKey && !isMeta && down) {
    // remember any key codes that were pressed while meta is down
    inputs._pressedDuringMeta[ev.code] = true;
  } else if (isMeta && !down) {
    // when meta released, maybe issue keyUps for them
    for (let code in inputs._pressedDuringMeta) {
      if (!inputs._keyStates[code]) continue;
      if (/^Mouse\d/.test(code)) continue;
      handleKeyEvent(code, false, inputs, {
        code: code,
        note: `This is a mocked KeyboardEvent made by the 'game-inputs' module`,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }
    inputs._pressedDuringMeta = {};
  }
}

const GameInputTestRender = (domElement, timeInterval) => {
  // instantiate
  // let domElement = s(`.${id}`);

  let inputs = new GameInputs(domElement, {
    preventDefaults: true,
    allowContextMenu: false,
  });

  // bind an arbitrary event name to one or more physical key codes
  inputs.bind('move-fwd', 'KeyW');
  inputs.bind('move-left', 'KeyA', 'ArrowLeft');

  // listen to that event name for press/release events
  inputs.down.on('move-fwd', (ev) => {
    console.log('move-fwd', ev);
    // startMovingFwd();
  });
  inputs.up.on('move-fwd', (ev) => {
    console.log('move-fwd', ev);
    // stopMovingFwd();
  });

  // mouse/pointer buttons are bindable as `Mouse1`, `Mouse2`, ...
  inputs.bind('shoot', 'Mouse1');
  inputs.bind('RMB', 'Mouse3');

  // you can also query various input states in the game loop
  function myGameLoop() {
    console.log('---');

    // current boolean state of a key or mouse button
    let leftCurrentlyPressed = inputs.state['move-left'];
    let shootButtonPressed = inputs.state['shoot'];
    console.log(JSON.stringify({ leftCurrentlyPressed, shootButtonPressed }, null, 4));

    // pointer movement and scroll/wheel data
    let mouseMovedBy = [inputs.pointerState.dx, inputs.pointerState.dy];
    let scrolledBy = inputs.pointerState.scrolly;
    console.log(JSON.stringify({ mouseMovedBy, scrolledBy }, null, 4));

    // accumulated number of presses/releases since the last tick
    let fwdPresses = inputs.pressCount['move-fwd'];
    let fwdReleases = inputs.releaseCount['move-fwd'];
    console.log(JSON.stringify({ fwdPresses, fwdReleases }, null, 4));

    // {
    //   "leftCurrentlyPressed": false,
    //   "shootButtonPressed": false
    // }
    // SkillCyberia.js:56 {
    //     "mouseMovedBy": [
    //         0,
    //         0
    //     ],
    //     "scrolledBy": 0
    // }
    // SkillCyberia.js:60 {
    //     "fwdPresses": 0,
    //     "fwdReleases": 0
    // }

    // calling tick() zeroes out cumulative mouse/scroll/press/release values
    inputs.tick();
  }

  // you can optionally filter events before they occur - e.g. if you want
  // keyboard events not to fire if control keys are pressed
  inputs.filterEvents = (ev, bindingName) => {
    if (/^Key/.test(ev.code) && ev.ctrlKey) return false;
    return true;
  };

  setInterval(
    () => {
      myGameLoop();
    },
    timeInterval ? timeInterval : 500,
  );
};

export { GameInputs, GameInputTestRender };