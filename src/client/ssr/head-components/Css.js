// https://css-loaders.com/pulsing/

SrrComponent = () => html`
  <style>
    body {
      margin: 0;
      padding: 0;
    }

    .ssr-fl {
      position: relative;
      display: flow-root;
    }

    .ssr-abs,
    .ssr-in {
      display: block;
    }

    .ssr-fll {
      float: left;
    }

    .ssr-flr {
      float: right;
    }

    .ssr-abs {
      position: absolute;
    }

    .ssr-in,
    .ssr-inl {
      position: relative;
    }

    .ssr-inl {
      display: inline-table;
      display: -webkit-inline-table;
      display: -moz-inline-table;
      display: -ms-inline-table;
      display: -o-inline-table;
    }

    .ssr-fix {
      position: fixed;
      display: block;
    }

    .ssr-stq {
      position: sticky;
      /* require defined at least top, bottom, left o right */
    }

    .ssr-wfa {
      width: fill-available;
      width: -webkit-fill-available;
      width: -moz-fill-available;
      width: -ms-fill-available;
      width: -o-fill-available;
    }

    .ssr-wft {
      width: fit-content;
      width: -webkit-fit-content;
      width: -moz-fit-content;
      width: -ms-fit-content;
      width: -o-fit-content;
    }

    .ssr-wfm {
      width: max-content;
      width: -webkit-max-content;
      width: -moz-max-content;
      width: -ms-max-content;
      width: -o-max-content;
    }

    .ssr-negative-color {
      filter: invert(1);
      -webkit-filter: invert(1);
      -moz-filter: invert(1);
      -ms-filter: invert(1);
      -o-filter: invert(1);
    }

    .ssr-no-drag {
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

    .ssr-center {
      transform: translate(-50%, -50%);
      top: 50%;
      left: 50%;
      width: 100%;
      text-align: center;
    }
    .ssr-gray {
      filter: grayscale(1);
    }
  </style>
  <style>
    .ssr-background-image {
      background-size: cover;
      background-position: center;
      height: 100vh;
      width: 100vw;
      object-fit: cover;
      z-index: -1;
      top: 0px;
      left: 0px;
      pointer-events: none;
    }
    .ssr-background {
      top: 0px;
      left: 0px;
      height: 100%;
      width: 100%;
      z-index: 11;
    }
    .ssr-shimmer {
      height: 100%;
      background-image: linear-gradient(
        to right,
        rgb(255, 255, 255, 0.5) 0%,
        rgba(200, 200, 200, 0.5) 30%,
        rgba(220, 220, 220, 0.5) 50%,
        rgba(255, 255, 255, 0.5) 100%
      );
      animation: ssr-shimmer 3s linear infinite;
    }
    @keyframes ssr-shimmer {
      0% {
        background-position: -30px 0;
      }
      100% {
        background-position: 80px 0;
      }
    }
    .ssr-lds-dual-ring,
    .ssr-lds-dual-ring:after {
      box-sizing: border-box;
    }
    .ssr-lds-dual-ring {
      display: inline-block;
      width: 80px;
      height: 80px;
    }
    .ssr-lds-dual-ring:after {
      content: ' ';
      display: block;
      width: 64px;
      height: 64px;
      margin: 8px;
      border-radius: 50%;
      border: 6.4px solid currentColor;
      border-color: currentColor transparent currentColor transparent;
      animation: ssr-lds-dual-ring 1.2s linear infinite;
    }
    @keyframes ssr-lds-dual-ring {
      0% {
        transform: rotate(0);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    .ssr-lds-dual-ring-mini,
    .ssr-lds-dual-ring-mini:after {
      box-sizing: border-box;
    }
    .ssr-lds-dual-ring-mini {
      display: inline-block;
      width: 40px;
      height: 40px;
    }
    .ssr-lds-dual-ring-mini:after {
      content: ' ';
      display: block;
      width: 32px;
      height: 32px;
      margin: 4px;
      border-radius: 50%;
      border: 3.2px solid currentColor;
      border-color: currentColor transparent currentColor transparent;
      animation: ssr-lds-dual-ring-mini 1.2s linear infinite;
    }
    @keyframes ssr-lds-dual-ring-mini {
      0% {
        transform: rotate(0);
      }
      100% {
        transform: rotate(360deg);
      }
    }
    .ssr-btn {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
      color: #606060;
      /* box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2), 0 10px 30px 0 rgba(0, 0, 0, 0.3); */
    }
    .ssr-sub-shimmer-loader {
      background: linear-gradient(
          90deg,
          rgba(190, 190, 190, 0.5) 33%,
          rgba(150, 150, 150, 0.5) 50%,
          rgba(190, 190, 190, 0.5) 66%
        )
        rgba(220, 220, 220, 0.5);
      background-size: 300% 100%;
      animation: ssr-sub-shimmer-l1 1s infinite linear;
      border-radius: 5px;
    }
    @keyframes ssr-sub-shimmer-l1 {
      0% {
        background-position: right;
      }
    }
  </style>
`;
