SrrComponent = ({ title, author, keywords, description, themeColor, canonicalURL, ssrPath, thumbnail }) => html`
  <link rel="manifest" href="${ssrPath}site.webmanifest" />
  <link rel="icon" type="image/png" sizes="16x16" href="${ssrPath}assets/splash/favicon-16x16.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="${ssrPath}assets/splash/favicon-32x32.png" />
  <!-- <link rel="icon" type="image/png" sizes="194x194" href="${ssrPath}assets/splash/favicon-194x194.png" /> -->
  <!-- chrome -->
  <link rel="icon" type="image/png" sizes="36x36" href="${ssrPath}assets/splash/android-chrome-36x36.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="${ssrPath}assets/splash/android-chrome-48x48.png" />
  <link rel="icon" type="image/png" sizes="72x72" href="${ssrPath}assets/splash/android-chrome-72x72.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="${ssrPath}assets/splash/android-chrome-96x96.png" />
  <link rel="icon" type="image/png" sizes="144x144" href="${ssrPath}assets/splash/android-chrome-144x144.png" />
  <link rel="icon" type="image/png" sizes="256x256" href="${ssrPath}assets/splash/android-chrome-256x256.png" />
  <link rel="icon" type="image/png" sizes="384x384" href="${ssrPath}assets/splash/android-chrome-384x384.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="${ssrPath}assets/splash/android-chrome-512x512.png" />
  <!-- apple -->
  <link rel="apple-touch-icon" sizes="180x180" href="${ssrPath}assets/splash/apple-touch-icon.png" />
  <link rel="mask-icon" href="${ssrPath}assets/splash/safari-pinned-tab.svg" color="${themeColor}" />
  <meta name="apple-mobile-web-app-title" content="${title}" />
  <link rel="apple-touch-icon" type="image/png" sizes="36x36" href="${ssrPath}assets/splash/android-chrome-36x36.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="48x48" href="${ssrPath}assets/splash/android-chrome-48x48.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="72x72" href="${ssrPath}assets/splash/android-chrome-72x72.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="96x96" href="${ssrPath}assets/splash/android-chrome-96x96.png" />
  <link
    rel="apple-touch-icon"
    type="image/png"
    sizes="144x144"
    href="${ssrPath}assets/splash/android-chrome-144x144.png"
  />
  <link
    rel="apple-touch-icon"
    type="image/png"
    sizes="256x256"
    href="${ssrPath}assets/splash/android-chrome-256x256.png"
  />
  <link
    rel="apple-touch-icon"
    type="image/png"
    sizes="384x384"
    href="${ssrPath}assets/splash/android-chrome-384x384.png"
  />
  <link
    rel="apple-touch-icon"
    type="image/png"
    sizes="512x512"
    href="${ssrPath}assets/splash/android-chrome-512x512.png"
  />
  <!-- microsoft -->
  <meta name="msapplication-config" content="${ssrPath}browserconfig.xml" />
  <meta name="application-name" content="${title}" />
  <meta name="msapplication-TileColor" content="${themeColor}" />
  <meta name="msapplication-TileImage" content="${ssrPath}assets/splash/mstile-144x144.png" />
  <meta name="theme-color" content="${themeColor}" />
`;
