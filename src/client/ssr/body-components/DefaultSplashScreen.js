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
      color: #f7f7f7;
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
  <style>
    .ssr-background {
      margin: auto;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: auto;
      background: linear-gradient(
        315deg,
        rgba(101, 0, 94, 1) 3%,
        rgba(60, 132, 206, 1) 38%,
        rgba(48, 238, 226, 1) 68%,
        rgba(255, 25, 25, 1) 98%
      );
      animation: gradient 15s ease infinite;
      background-size: 400% 400%;
      background-attachment: fixed;
    }

    @keyframes gradient {
      0% {
        background-position: 0% 0%;
      }
      50% {
        background-position: 100% 100%;
      }
      100% {
        background-position: 0% 0%;
      }
    }

    .wave {
      background: rgb(255 255 255 / 25%);
      border-radius: 1000% 1000% 0 0;
      position: fixed;
      width: 400%;
      height: 100%;
      animation: wave 10s -3s linear infinite;
      transform: translate3d(0, 0, 0);
      opacity: 0.8;
      left: 0;
      top: 20%;
    }

    .wave:nth-of-type(2) {
      animation: wave 18s linear reverse infinite;
      opacity: 0.8;
      top: 50%;
    }

    .wave:nth-of-type(3) {
      animation: wave 20s -1s reverse infinite;
      opacity: 0.9;
      top: 70%;
    }

    @keyframes wave {
      2% {
        transform: translateX(1);
      }

      25% {
        transform: translateX(-25%);
      }

      50% {
        transform: translateX(-50%);
      }

      75% {
        transform: translateX(-25%);
      }

      100% {
        transform: translateX(1);
      }
    }
  </style>
  <div>
    <div class="wave"></div>
    <div class="wave"></div>
    <div class="wave"></div>
  </div>
  <div class="ssr-center">
    <!-- <img class="ssr-logo" /> -->
    <div class="lds-dual-ring"></div>
  </div>
</div>`;
