SrrComponent = ({ title, author, keywords, description, themeColor, canonicalURL, ssrPath, thumbnail }) => html`
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/splash/favicon-16x16.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/splash/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="194x194" href="/assets/splash/favicon-194x194.png" />
  <!-- chrome -->
  <link rel="icon" type="image/png" sizes="36x36" href="/assets/splash/android-chrome-36x36.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/splash/android-chrome-48x48.png" />
  <link rel="icon" type="image/png" sizes="72x72" href="/assets/splash/android-chrome-72x72.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/splash/android-chrome-96x96.png" />
  <link rel="icon" type="image/png" sizes="144x144" href="/assets/splash/android-chrome-144x144.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/splash/android-chrome-192x192.png" />
  <link rel="icon" type="image/png" sizes="256x256" href="/assets/splash/android-chrome-256x256.png" />
  <link rel="icon" type="image/png" sizes="384x384" href="/assets/splash/android-chrome-384x384.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/splash/android-chrome-512x512.png" />
  <!-- apple -->
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/splash/apple-touch-icon.png" />
  <link rel="mask-icon" href="/assets/splash/safari-pinned-tab.svg" color="${themeColor}" />
  <meta name="apple-mobile-web-app-title" content="${title}" />
  <link rel="apple-touch-icon" type="image/png" sizes="36x36" href="/assets/splash/android-chrome-36x36.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="48x48" href="/assets/splash/android-chrome-48x48.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="72x72" href="/assets/splash/android-chrome-72x72.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="96x96" href="/assets/splash/android-chrome-96x96.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="144x144" href="/assets/splash/android-chrome-144x144.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="192x192" href="/assets/splash/android-chrome-192x192.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="256x256" href="/assets/splash/android-chrome-256x256.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="384x384" href="/assets/splash/android-chrome-384x384.png" />
  <link rel="apple-touch-icon" type="image/png" sizes="512x512" href="/assets/splash/android-chrome-512x512.png" />
  <!-- microsoft -->
  <link rel="shortcut icon" href="/assets/splash/favicon-194x194.png" type="image/png" />
  <meta name="msapplication-config" content="/browserconfig.xml" />
  <meta name="application-name" content="${title}" />
  <meta name="msapplication-TileColor" content="${themeColor}" />
  <meta name="msapplication-TileImage" content="/assets/splash/mstile-144x144.png" />
  <meta name="theme-color" content="${themeColor}" />
`;
