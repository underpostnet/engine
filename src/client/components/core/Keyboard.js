const Keyboard = {
  ActiveKey: {},
  Event: {},
  Init: async function (options = { callBackTime: 50 }) {
    const { callBackTime } = options;
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
    }, callBackTime);
  },
};

export { Keyboard };
