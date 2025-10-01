SrrComponent = ({ title, author, keywords, description, themeColor, ssrPath, canonicalURL, thumbnail }) => html`
  <link rel="canonical" href="${canonicalURL}" />

  <meta name="author" content="${author}" />
  <meta name="keywords" content="${keywords.join(',')}" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="${themeColor}" />

  <meta property="og:title" content="${title}" />
  <meta property="og:type" content="website" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${thumbnail}" />
  <meta property="og:url" content="${canonicalURL}" />
  <meta name="twitter:card" content="summary_large_image" />
`;
