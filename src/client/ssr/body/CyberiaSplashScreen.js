SrrComponent = ({ host, path }) => html` <div class="ssr-background" style="opacity: 1">
  <style>
    .ssr-background {
      position: absolute;
      display: block;
      background: #1a1a1a;
      color: #ffcc00;
      width: 100%;
      height: 100%;
      top: 0px;
      left: 0px;
      z-index: 10;
      transition: 0.3s;
      font-size: 18px;
      font-weight: bold;
      font-family: monospace;
    }
    .ssr-center {
      position: absolute;
      display: block;
      transform: translate(-50%, -50%);
      top: 50%;
      left: 50%;
      width: 100%;
      text-align: center;
    }
    .ssr-logo-cyberia {
      display: inline-table;
      position: relative;
      width: 100px;
      height: 100px;
      user-drag: none;
      -webkit-user-drag: none;
      user-select: none;
      -moz-user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
    }
    .ssr-loading-bar {
      display: inline-table;
      position: relative;
      width: 100px;
      border: 2px solid #333333;
      border-radius: 5px;
    }
    .ssr-loading-bar-block {
      display: block;
      position: relative;
      border: 2px solid #333333;
      border-radius: 5px;
      margin: 2px;
      width: 12px;
      height: 12px;
      background: #ffcc00;
      float: left;
    }
    .ssr-loading-info {
      display: block;
      position: relative;
      text-align: center;
      width: 200px;
      margin: auto;
      font-size: 10px;
    }
    @keyframes ssr-blink-animation {
      50% {
        opacity: 0;
      }
    }
    .ssr-blink-bar {
      animation: ssr-blink-animation 1s linear infinite;
    }
  </style>
  <div class="ssr-center">
    <img
      class="ssr-logo-cyberia"
      alt="CYBERIA ONLINE"
      src="data:image/png;base64,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"
    />
    <br /><br />
    <div class="ssr-loading-bar"><div class="ssr-loading-bar-block ssr-blink-bar"></div></div>
    <br /><br />
    <div class="ssr-loading-info">
      <span style="color: white">connecting </span>
      ...${`${host}${path}`.slice(-30)}
    </div>
  </div>
</div>`;
