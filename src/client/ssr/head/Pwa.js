SSRComponent = ({ title, themeColor, ssrPath }) => html`
  <link rel="manifest" href="${ssrPath}site.webmanifest" />
  <link rel="icon" type="image/png" sizes="16x16" href="${ssrPath}favicon-16x16.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="${ssrPath}favicon-32x32.png" />
  <!-- chrome -->
  <link rel="icon" type="image/png" sizes="36x36" href="${ssrPath}android-chrome-36x36.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="${ssrPath}android-chrome-48x48.png" />
  <link rel="icon" type="image/png" sizes="72x72" href="${ssrPath}android-chrome-72x72.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="${ssrPath}android-chrome-96x96.png" />
  <link rel="icon" type="image/png" sizes="144x144" href="${ssrPath}android-chrome-144x144.png" />
  <link rel="icon" type="image/png" sizes="256x256" href="${ssrPath}android-chrome-256x256.png" />
  <link rel="icon" type="image/png" sizes="384x384" href="${ssrPath}android-chrome-384x384.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="${ssrPath}android-chrome-512x512.png" />
  <!-- apple -->
  <link rel="apple-touch-icon" sizes="180x180" href="${ssrPath}apple-touch-icon.png" />
  <link rel="mask-icon" href="${ssrPath}safari-pinned-tab.svg" color="${themeColor}" />
  <meta name="apple-mobile-web-app-title" content="${title}" />
  <link rel="apple-touch-icon" type="image/png" sizes="36x36" href="${ssrPath}android-chrome-36x36.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="48x48" href="${ssrPath}android-chrome-48x48.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="72x72" href="${ssrPath}android-chrome-72x72.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="96x96" href="${ssrPath}android-chrome-96x96.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="144x144" href="${ssrPath}android-chrome-144x144.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="256x256" href="${ssrPath}android-chrome-256x256.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="384x384" href="${ssrPath}android-chrome-384x384.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="512x512" href="${ssrPath}android-chrome-512x512.png" />
  <!-- microsoft -->
  <meta name="msapplication-config" content="${ssrPath}browserconfig.xml" />
  <meta name="application-name" content="${title}" />
  <meta name="msapplication-TileColor" content="${themeColor}" />
  <meta name="msapplication-TileImage" content="${ssrPath}mstile-144x144.png" />
  <meta name="theme-color" content="${themeColor}" />
`;
