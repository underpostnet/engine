SrrComponent = ({ backgroundImage }) => html`
  <style>
    .ssr-background-image {
      background-image: url('${backgroundImage}');
    }
    .ssr-top-bar {
      background: #ffffff;
      width: 100%;
      height: 50px;
      top: 0px;
      left: 0px;
    }
    .ssr-bottom-bar {
      background: #ffffff;
      width: 100%;
      height: 50px;
      bottom: 0px;
      left: 0px;
    }
    .ssr-btn {
      height: 40px;
      width: 40px;
    }
    .ssr-btn-0 {
      top: 5px;
      right: 5px;
    }
    .ssr-btn-1 {
      top: 5px;
      right: 55px;
    }
    .ssr-btn-2 {
      top: 5px;
      right: 105px;
    }
    .ssr-btn-3 {
      top: 5px;
      left: 5px;
    }
    .ssr-btn-4 {
      top: 5px;
      left: 5px;
    }
    .ssr-btn-5 {
      top: 5px;
      right: 5px;
      border-radius: 50%;
    }
    .ssr-loader {
      width: auto;
    }

    .loader {
      height: 6px;
      width: 130px;
      --c: no-repeat linear-gradient(#353535 0 0);
      background: var(--c), var(--c), #e1e1e1;
      background-size: 60% 100%;
      animation: l16 3s infinite;
      box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
    }
    @keyframes l16 {
      0% {
        background-position: -150% 0, -150% 0;
      }
      66% {
        background-position: 250% 0, -150% 0;
      }
      100% {
        background-position: 250% 0, 250% 0;
      }
    }
  </style>
  <div class="ssr-background-image"></div>
  <div class="ssr-abs ssr-background" style="opacity: 1">
    <div class="ssr-abs ssr-top-bar">
      ${new Array(3)
        .fill()
        .map(
          (v, i) => html`<div class="ssr-abs ssr-btn ssr-btn-${i + 3}">
            <div class="ssr-shimmer"></div>
          </div>`,
        )
        .join('')}
      <div class="ssr-abs ssr-search-box"><div class="ssr-shimmer-search-box"></div></div>
    </div>
    <div class="ssr-abs ssr-bottom-bar">
      ${new Array(3)
        .fill()
        .map(
          (v, i) => html`<div class="ssr-abs ssr-btn ssr-btn-${i}">
            <div class="ssr-shimmer"></div>
          </div>`,
        )
        .join('')}
    </div>
    <div class="ssr-abs ssr-center ssr-loader"><div class="loader"></div></div>
  </div>
`;
