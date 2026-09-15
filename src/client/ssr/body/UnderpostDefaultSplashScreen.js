// Skeleton of the Underpost app shell as it first paints: `barMode: 'top-bottom-bar'` with a left
// `slide-menu` (closed). Keep the boxes on the 50px grid the live bars use so nothing jumps when
// the shell replaces this.
SSRComponent = ({ backgroundImage }) => html`
  ${backgroundImage
    ? html`<style>
        .ssr-background-image {
          background-image: url('${backgroundImage}');
        }
      </style>`
    : ''}
  <style>
    body {
      background: #222121;
    }
    .ssr-top-bar,
    .ssr-bottom-bar {
      background: #121212;
      width: 100%;
      height: 50px;
      left: 0px;
    }
    .ssr-top-bar {
      top: 0px;
    }
    .ssr-bottom-bar {
      bottom: 0px;
    }
    .ssr-btn {
      top: 5px;
      height: 40px;
      width: 40px;
    }
    /* Top bar: app icon, then the search box beside it, profile on the right. */
    .ssr-btn-app-icon {
      left: 5px;
    }
    .ssr-btn-profile {
      right: 5px;
      border-radius: 50%;
    }
    .ssr-top-bar .ssr-search-box {
      left: 55px;
    }
    /* Bottom bar: the menu hamburger on the left; left/right/home/theme/lang on the right. */
    .ssr-btn-menu {
      left: 5px;
    }
    .ssr-btn-nav-0 {
      right: 5px;
    }
    .ssr-btn-nav-1 {
      right: 55px;
    }
    .ssr-btn-nav-2 {
      right: 105px;
    }
    .ssr-btn-nav-3 {
      right: 155px;
    }
    .ssr-btn-nav-4 {
      right: 205px;
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
        background-position:
          -150% 0,
          -150% 0;
      }
      66% {
        background-position:
          250% 0,
          -150% 0;
      }
      100% {
        background-position:
          250% 0,
          250% 0;
      }
    }
  </style>
  <div class="ssr-background-image"></div>
  <div class="ssr-abs ssr-background" style="opacity: 1">
    <div class="ssr-abs ssr-top-bar">
      ${['app-icon', 'profile']
        .map(
          (id) =>
            html`<div class="ssr-abs ssr-btn ssr-btn-${id}">
              <div class="ssr-shimmer-dark"></div>
            </div>`,
        )
        .join('')}
      <div class="ssr-abs ssr-search-box"><div class="ssr-shimmer-dark-search-box"></div></div>
    </div>
    <div class="ssr-abs ssr-bottom-bar">
      ${['menu', 'nav-0', 'nav-1', 'nav-2', 'nav-3', 'nav-4']
        .map(
          (id) =>
            html`<div class="ssr-abs ssr-btn ssr-btn-${id}">
              <div class="ssr-shimmer-dark"></div>
            </div>`,
        )
        .join('')}
    </div>
    <div class="ssr-abs ssr-center ssr-loader"><div class="loader"></div></div>
  </div>
`;
