const Keyboard = {
  ActiveKey: {},
  Event: {},
  Init: async function () {
    window.onkeydown = (e) => {
      this.ActiveKey[e.key] = true;
    };
    window.onkeyup = (e) => {
      delete this.ActiveKey[e.key];
    };
    setInterval(() => {
      Object.keys(this.Event).map((key) => {
        Object.keys(this.ActiveKey).map((activeKey) => {
          if (activeKey in this.Event[key]) this.Event[key][activeKey]();
        });
      });
    }, window.eventCallbackTime);
  },
};

export { Keyboard };
