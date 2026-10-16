// The splash uses the shell's 50px bars and the stored theme.
SSRComponent = ({ backgroundImage }) => html`
  <script>
    (() => {
      let theme = document.documentElement.dataset.theme;
      try {
        if (/light/.test(localStorage.getItem('_theme') || '')) theme = 'light';
      } catch (error) {}
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  ${
    backgroundImage
      ? html`<style class="style-ssr-background-image">
          .ssr-background-image {
            background-image: url('${backgroundImage}');
          }
        </style>`
      : html`<style class="style-ssr-background-image"></style>`
  }
  <style>
    html[data-theme='dark'] body {
      background: #191919;
    }
    .ssr-top-bar,
    .ssr-bottom-bar {
      background: #121212;
      width: 100%;
      height: 50px;
      left: 0px;
    }
    /* Light theme: the app's #e8e8e8 body under white bars, with the light shimmer band. */
    html[data-theme='light'] body {
      background: #e8e8e8;
    }
    html[data-theme='light'] .ssr-top-bar,
    html[data-theme='light'] .ssr-bottom-bar {
      background: #ffffff;
    }
    html[data-theme='light'] .ssr-shimmer-dark,
    html[data-theme='light'] .ssr-shimmer-dark-search-box {
      background-image: var(--ssr-shimmer-light);
    }
    html[data-theme='light'] .loader {
      --c: no-repeat linear-gradient(#9a9a9a 0 0);
      background: var(--c), var(--c), #c9c9c9;
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
    /* Top bar: navigation toggle, app icon and search box; profile and search toggle on the right. */
    .ssr-btn-nav-toggle {
      left: 5px;
    }
    .ssr-btn-app-icon {
      left: 55px;
    }
    .ssr-btn-profile {
      right: 55px;
      border-radius: 50%;
    }
    .ssr-btn-search-toggle {
      right: 5px;
    }
    .ssr-top-bar .ssr-search-box {
      left: 105px;
    }
    .ssr-btn-chrome-toggle {
      left: 5px;
    }
    /* Bottom bar: the navigator on the right — left, right, home, theme, lang. */
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
      ${['nav-toggle', 'app-icon', 'profile', 'search-toggle']
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
      ${['chrome-toggle', 'nav-0', 'nav-1', 'nav-2', 'nav-3', 'nav-4']
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
