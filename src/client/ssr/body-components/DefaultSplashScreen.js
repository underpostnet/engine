SrrComponent = ({ base64BackgroundImage, metadata }) => html`
  ${base64BackgroundImage
    ? html`<style>
        .ssr-background-image {
          background-image: url('${base64BackgroundImage}');
        }
      </style>`
    : metadata?.themeColor
    ? html`<style>
        .ssr-background-image {
          background: ${metadata.themeColor};
        }
      </style>`
    : ''}

  <style>
    .ssr-top-bar {
      background: #ffffff;
      height: 100px;
    }
    .ssr-btn {
      height: 40px;
      width: 40px;
    }
    .ssr-btn-0 {
      top: 55px;
      right: 5px;
    }
    .ssr-btn-1 {
      top: 55px;
      right: 55px;
    }
    .ssr-btn-2 {
      top: 55px;
      right: 105px;
    }
    .ssr-btn-3 {
      top: 55px;
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
    <div class="ssr-in ssr-top-bar">
      ${new Array(6)
        .fill()
        .map(
          (v, i) => html`<div class="ssr-abs ssr-btn ssr-btn-${i}">
            <div class="ssr-shimmer"></div>
          </div>`,
        )
        .join('')}

      <div class="ssr-abs ssr-search-box"><div class="ssr-shimmer-search-box"></div></div>
    </div>
    <div class="ssr-abs ssr-center ssr-loader"><div class="loader"></div></div>
  </div>
`;
