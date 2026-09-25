// Skeleton of a `barMode: 'top-bottom-bar'` app shell as it first paints, with its left
// `slide-menu` closed: a 50px top bar (app icon, search box, profile), a 50px bottom bar (the
// navigator on the right) and the floating column beside the menu. Keep every box on the 50px
// grid the live bars use so nothing jumps when the shell replaces this.
//
// Painted in the theme the app will load — `_theme` in localStorage, the key `Css.loadThemes`
// reads — so a light-theme user does not see a dark skeleton flash. Dark is the default, as it is
// for the app. The script runs before the skeleton markup is parsed, so the class is on <html>
// before anything below it paints.
SSRComponent = ({ backgroundImage }) => html`
  <script>
    (() => {
      let theme = 'dark';
      try {
        if (/light/.test(localStorage.getItem('_theme') || '')) theme = 'light';
      } catch (error) {}
      document.documentElement.classList.add('ssr-theme-' + theme);
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
    /* The body backgrounds the core themes paint (CssCore), keyed on the theme class so a theme
       the app switches to later is never overruled by this earlier paint. */
    html.ssr-theme-dark body {
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
    html.ssr-theme-light body {
      background: #e8e8e8;
    }
    html.ssr-theme-light .ssr-top-bar,
    html.ssr-theme-light .ssr-bottom-bar {
      background: #ffffff;
    }
    html.ssr-theme-light .ssr-shimmer-dark,
    html.ssr-theme-light .ssr-shimmer-dark-search-box {
      background-image: var(--ssr-shimmer-light);
    }
    html.ssr-theme-light .loader {
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
    /* Floating column beside the closed menu (the live .main-body-btn-container, hidden until the
       splash lifts): bars toggle, hamburger and search stacked from 100px down the left edge. */
    .ssr-float-bar {
      top: 100px;
      left: 0px;
      width: 50px;
      height: 150px;
    }
    .ssr-btn-float-0 {
      top: 5px;
    }
    .ssr-btn-float-1 {
      top: 55px;
    }
    .ssr-btn-float-2 {
      top: 105px;
    }
    .ssr-float-bar .ssr-btn {
      left: 5px;
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
      ${['nav-0', 'nav-1', 'nav-2', 'nav-3', 'nav-4']
        .map(
          (id) =>
            html`<div class="ssr-abs ssr-btn ssr-btn-${id}">
              <div class="ssr-shimmer-dark"></div>
            </div>`,
        )
        .join('')}
    </div>
    <div class="ssr-abs ssr-float-bar">
      ${['float-0', 'float-1', 'float-2']
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
