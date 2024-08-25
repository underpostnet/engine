SrrComponent = ({ base64BackgroundImage }) => html`
  <style>
    .ssr-background-image {
      background-image: url('${base64BackgroundImage}');
    }
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
    .ssr-lds-dual-ring {
      color: #cfcfcf;
    }
    .ssr-search-box {
      width: 290px;
      height: 33.3px;
      top: 8.5px;
      left: 100px;
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

      <div class="ssr-abs ssr-search-box"><div class="ssr-shimmer"></div></div>
    </div>

    <!-- <div class="ssr-abs ssr-center"><div class="ssr-lds-dual-ring"></div></div> -->
  </div>
`;
