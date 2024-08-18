SrrComponent = () => html` <div class="ssr-background" style="opacity: 1">
  <style>
    .lds-dual-ring,
    .lds-dual-ring:after {
      box-sizing: border-box;
    }
    .lds-dual-ring {
      display: inline-block;
      width: 80px;
      height: 80px;
    }
    .lds-dual-ring:after {
      content: ' ';
      display: block;
      width: 64px;
      height: 64px;
      margin: 8px;
      border-radius: 50%;
      border: 6.4px solid currentColor;
      border-color: currentColor transparent currentColor transparent;
      animation: lds-dual-ring 1.2s linear infinite;
    }
    @keyframes lds-dual-ring {
      0% {
        transform: rotate(0);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  </style>
  <style>
    .ssr-background {
      position: absolute;
      display: block;
      background: #ececec;
      color: #5f5f5f;
      width: 100%;
      height: 100%;
      top: 0px;
      left: 0px;
      z-index: 10;
      transition: 0.3s;
      font-size: 18px;
      font-weight: bold;
      font-family: monospace;
      overflow: hidden;
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
    .ssr-logo {
      display: inline-table;
      position: relative;
      width: 100px;
      height: 100px;

      user-drag: none;
      -webkit-user-drag: none;
      -moz-user-drag: none;
      -ms-user-drag: none;
      -o-user-drag: none;

      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      -o-user-select: none;
    }
  </style>
  <div class="ssr-center">
    <!-- <img class="ssr-logo" /> -->
    <div class="lds-dual-ring"></div>
  </div>
</div>`;
