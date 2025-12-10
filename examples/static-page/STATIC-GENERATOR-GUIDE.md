# Underpost Static Site Generator - Comprehensive Guide

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [CLI Usage](#cli-usage)
4. [Configuration File](#configuration-file)
5. [Metadata Customization](#metadata-customization)
6. [Scripts and Styles](#scripts-and-styles)
7. [Icons and PWA](#icons-and-pwa)
8. [SSR Components](#ssr-components)
9. [Advanced Examples](#advanced-examples)
10. [Best Practices](#best-practices)
11. [API Reference](#api-reference)

---

## Overview

The Underpost Static Site Generator is a powerful tool for creating highly customizable static HTML pages with:

- **Comprehensive SEO metadata** (Open Graph, Twitter Cards, Schema.org)
- **Custom script and stylesheet injection**
- **Icon and PWA manifest support**
- **Server-side rendering (SSR) components**
- **Structured data (JSON-LD) support**
- **Production-ready minification**
- **Flexible configuration via CLI or JSON files**

---

## Quick Start

### Basic Usage

Generate a simple static page:

```bash
underpost static \
  --page ./src/client/ssr/body/DefaultSplashScreen.js \
  --output-path ./dist/index.html \
  --title "My App"
```

### Using a Configuration File

1. Generate a template config:

```bash
underpost static --generate-config ./my-config.json
```

2. Edit the generated `my-config.json` file

3. Build with the config:

```bash
underpost static --config-file ./my-config.json
```

---

## CLI Usage

### Complete CLI Options

```bash
underpost static [options]
```

#### Page and Output Options

- `--page <path>` - SSR component path to render
- `--output-path <path>` - Where to save the generated HTML
- `--env <env>` - Environment: `development` or `production` (default: `production`)
- `--minify` / `--no-minify` - Control HTML minification

#### Metadata Options

- `--title <title>` - Page title
- `--description <desc>` - Page description for SEO
- `--keywords <keywords>` - Comma-separated keywords
- `--author <author>` - Page author
- `--theme-color <color>` - Theme color (hex format)
- `--canonical-url <url>` - Canonical URL
- `--thumbnail <url>` - Open Graph thumbnail URL
- `--locale <locale>` - Page locale (e.g., `en-US`)
- `--site-name <name>` - Site name for Open Graph

#### Script and Style Options

- `--head-scripts <paths>` - Comma-separated script URLs for `<head>`
- `--body-scripts <paths>` - Comma-separated script URLs for `<body>`
- `--styles <paths>` - Comma-separated stylesheet URLs

#### Icon Options

- `--favicon <path>` - Favicon path
- `--apple-touch-icon <path>` - Apple touch icon path
- `--manifest <path>` - Web manifest path

#### Component Options

- `--head-components <paths>` - Comma-separated SSR head component paths
- `--body-components <paths>` - Comma-separated SSR body component paths

#### Build Options

- `--deploy-id <id>` - Deployment identifier
- `--build` - Trigger build process
- `--build-host <host>` - Build host URL
- `--build-path <path>` - Build path (default: `/`)

#### Configuration Options

- `--config-file <path>` - Load configuration from JSON file
- `--generate-config [path]` - Generate template config file
- `--lang <lang>` - HTML lang attribute (default: `en`)
- `--dir <dir>` - HTML dir attribute (default: `ltr`)

---

## Configuration File

### Structure

```json
{
  "page": "./src/client/ssr/body/CustomPage.js",
  "outputPath": "./dist/index.html",
  "env": "production",
  "minify": true,
  "lang": "en",
  "dir": "ltr",
  
  "metadata": { /* ... */ },
  "scripts": { /* ... */ },
  "styles": [ /* ... */ ],
  "icons": { /* ... */ },
  "headComponents": [ /* ... */ ],
  "bodyComponents": [ /* ... */ ],
  "microdata": [ /* ... */ ],
  "customPayload": { /* ... */ }
}
```

### Generate Template

```bash
underpost static --generate-config ./static-config.json
```

This creates a fully documented template with all available options.

---

## Metadata Customization

### Basic Metadata

```json
{
  "metadata": {
    "title": "My Application",
    "description": "A comprehensive description of my application",
    "keywords": ["web app", "progressive", "modern"],
    "author": "Jane Developer",
    "themeColor": "#4CAF50",
    "canonicalURL": "https://example.com",
    "thumbnail": "https://example.com/images/og-image.png",
    "locale": "en-US",
    "siteName": "My Site"
  }
}
```

### Advanced Open Graph

```json
{
  "metadata": {
    "title": "My App",
    "description": "App description",
    "openGraph": {
      "type": "website",
      "image:width": "1200",
      "image:height": "630",
      "image:alt": "App screenshot"
    }
  }
}
```

### Twitter Cards

```json
{
  "metadata": {
    "title": "My App",
    "twitter": {
      "card": "summary_large_image",
      "site": "@myhandle",
      "creator": "@developerhandle"
    }
  }
}
```

### CLI Example

```bash
underpost static \
  --page ./src/client/ssr/body/HomePage.js \
  --output-path ./dist/index.html \
  --title "My App" \
  --description "A modern web application" \
  --keywords "web,app,modern" \
  --author "John Doe" \
  --theme-color "#007bff" \
  --canonical-url "https://myapp.com" \
  --thumbnail "https://myapp.com/og-image.png"
```

---

## Scripts and Styles

### External Scripts

```json
{
  "scripts": {
    "head": [
      {
        "src": "https://cdn.example.com/analytics.js",
        "async": true
      }
    ],
    "body": [
      {
        "src": "/app.js",
        "type": "module",
        "defer": true
      }
    ]
  }
}
```

### Inline Scripts

```json
{
  "scripts": {
    "head": [
      {
        "content": "window.config = { apiUrl: 'https://api.example.com' };",
        "type": "text/javascript"
      }
    ]
  }
}
```

### Advanced Script Options

```json
{
  "scripts": {
    "head": [
      {
        "src": "https://cdn.example.com/lib.js",
        "async": true,
        "integrity": "sha384-...",
        "crossorigin": "anonymous",
        "attributes": {
          "data-custom": "value"
        }
      }
    ]
  }
}
```

### Stylesheets

```json
{
  "styles": [
    {
      "href": "/styles/main.css"
    },
    {
      "href": "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
    },
    {
      "content": "body { margin: 0; padding: 0; }",
      "_comment": "Critical CSS inline"
    },
    {
      "href": "/styles/print.css",
      "media": "print"
    }
  ]
}
```

### CLI Example

```bash
underpost static \
  --page ./src/client/ssr/body/App.js \
  --output-path ./dist/index.html \
  --head-scripts "https://cdn.example.com/analytics.js,/config.js" \
  --body-scripts "/app.js" \
  --styles "/main.css,/theme.css"
```

---

## Icons and PWA

### Basic Icons

```json
{
  "icons": {
    "favicon": "/favicon.ico",
    "appleTouchIcon": "/apple-touch-icon.png",
    "manifest": "/manifest.json"
  }
}
```

### Advanced Icons

```json
{
  "icons": {
    "favicon": "/favicon.ico",
    "appleTouchIcon": "/apple-touch-icon.png",
    "manifest": "/manifest.json",
    "additional": [
      {
        "rel": "icon",
        "type": "image/png",
        "sizes": "32x32",
        "href": "/favicon-32x32.png"
      },
      {
        "rel": "icon",
        "type": "image/png",
        "sizes": "16x16",
        "href": "/favicon-16x16.png"
      },
      {
        "rel": "mask-icon",
        "href": "/safari-pinned-tab.svg",
        "color": "#4CAF50"
      }
    ]
  }
}
```

### CLI Example

```bash
underpost static \
  --page ./src/client/ssr/body/App.js \
  --output-path ./dist/index.html \
  --favicon "/favicon.ico" \
  --apple-touch-icon "/apple-touch-icon.png" \
  --manifest "/manifest.json"
```

---

## SSR Components

### Head Components

Create custom SSR components for reusable head content:

```javascript
// src/client/ssr/head/CustomMeta.js
SrrComponent = ({ title, author, themeColor }) => html`
  <meta name="author" content="${author}" />
  <meta name="theme-color" content="${themeColor}" />
  <meta name="custom-meta" content="custom-value" />
`;
```

Use in configuration:

```json
{
  "headComponents": [
    "./src/client/ssr/head/Seo.js",
    "./src/client/ssr/head/Pwa.js",
    "./src/client/ssr/head/CustomMeta.js"
  ]
}
```

### Body Components

```javascript
// src/client/ssr/body/CustomSplash.js
SrrComponent = () => html`
  <div class="splash-screen">
    <div class="logo"></div>
    <div class="loading">Loading...</div>
  </div>
`;
```

### CLI Example

```bash
underpost static \
  --page ./src/client/ssr/body/MainPage.js \
  --output-path ./dist/index.html \
  --head-components "./src/client/ssr/head/Seo.js,./src/client/ssr/head/Pwa.js" \
  --body-components "./src/client/ssr/body/Header.js,./src/client/ssr/body/Footer.js"
```

---

## Advanced Examples

### Example 1: Landing Page with Analytics

```json
{
  "page": "./src/client/ssr/body/LandingPage.js",
  "outputPath": "./dist/landing.html",
  "env": "production",
  "metadata": {
    "title": "Welcome to Our Product",
    "description": "The best product for your needs",
    "keywords": ["product", "solution", "innovation"],
    "themeColor": "#007bff",
    "canonicalURL": "https://product.com/landing"
  },
  "scripts": {
    "head": [
      {
        "src": "https://www.googletagmanager.com/gtag/js?id=GA_ID",
        "async": true
      },
      {
        "content": "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_ID');"
      }
    ],
    "body": [
      {
        "src": "/landing.js",
        "defer": true
      }
    ]
  }
}
```

### Example 2: Documentation Site

```json
{
  "page": "./src/client/ssr/body/DocsPage.js",
  "outputPath": "./dist/docs/index.html",
  "metadata": {
    "title": "Documentation - My API",
    "description": "Complete API documentation",
    "author": "API Team"
  },
  "headComponents": [
    "./src/client/ssr/head/Seo.js",
    "./src/client/ssr/head/DocsStyles.js"
  ],
  "styles": [
    {
      "href": "/docs/prism.css"
    },
    {
      "href": "/docs/docs.css"
    }
  ],
  "scripts": {
    "body": [
      {
        "src": "/docs/prism.js",
        "defer": true
      }
    ]
  }
}
```

### Example 3: E-commerce Product Page

```json
{
  "page": "./src/client/ssr/body/ProductPage.js",
  "outputPath": "./dist/product.html",
  "metadata": {
    "title": "Premium Widget - Buy Now",
    "description": "High-quality premium widget with free shipping",
    "thumbnail": "https://shop.com/products/widget/image.jpg",
    "openGraph": {
      "type": "product",
      "price:amount": "29.99",
      "price:currency": "USD"
    }
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Premium Widget",
      "image": "https://shop.com/products/widget/image.jpg",
      "description": "High-quality premium widget",
      "offers": {
        "@type": "Offer",
        "price": "29.99",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      }
    }
  ]
}
```

### Example 4: Multi-language Site

```bash
# Generate English version
underpost static \
  --config-file ./config-en.json \
  --output-path ./dist/en/index.html \
  --lang en \
  --dir ltr

# Generate Arabic version
underpost static \
  --config-file ./config-ar.json \
  --output-path ./dist/ar/index.html \
  --lang ar \
  --dir rtl
```

---

## Best Practices

### 1. SEO Optimization

- Always include `title`, `description`, and `keywords`
- Use canonical URLs to avoid duplicate content
- Add structured data (JSON-LD) for rich snippets
- Include Open Graph and Twitter Card metadata

```json
{
  "metadata": {
    "title": "Unique, descriptive title",
    "description": "150-160 character description",
    "keywords": ["relevant", "keywords"],
    "canonicalURL": "https://example.com/page"
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Page Name"
    }
  ]
}
```

### 2. Performance

- Minify HTML in production (`minify: true`)
- Use `async` or `defer` for scripts
- Inline critical CSS
- Optimize images referenced in metadata

```json
{
  "env": "production",
  "minify": true,
  "scripts": {
    "head": [
      { "src": "/analytics.js", "async": true }
    ],
    "body": [
      { "src": "/app.js", "defer": true }
    ]
  },
  "styles": [
    { "content": "/* Critical CSS */" },
    { "href": "/main.css" }
  ]
}
```

### 3. Progressive Web Apps

- Include web manifest
- Add various icon sizes
- Set theme color
- Register service worker

```json
{
  "icons": {
    "favicon": "/favicon.ico",
    "manifest": "/manifest.json"
  },
  "metadata": {
    "themeColor": "#007bff"
  },
  "scripts": {
    "body": [
      {
        "content": "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}"
      }
    ]
  }
}
```

### 4. Security

- Use Subresource Integrity (SRI) for external resources
- Set appropriate CORS headers
- Validate all user inputs in custom payloads

```json
{
  "scripts": {
    "head": [
      {
        "src": "https://cdn.example.com/lib.js",
        "integrity": "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC",
        "crossorigin": "anonymous"
      }
    ]
  }
}
```

### 5. Configuration Management

- Use config files for complex setups
- Version control your config files
- Create environment-specific configs
- Document custom configurations

```bash
# Development
underpost static --config-file ./config.dev.json

# Production
underpost static --config-file ./config.prod.json
```

### 6. Component Reusability

Create reusable SSR components for common patterns:

```javascript
// src/client/ssr/head/Analytics.js
SrrComponent = ({ gaId }) => html`
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}');
  </script>
`;
```

---

## API Reference

### JavaScript API

```javascript
import UnderpostStatic from './src/cli/static.js';

// Generate static page programmatically
await UnderpostStatic.API.callback({
  page: './src/client/ssr/body/Page.js',
  outputPath: './dist/index.html',
  metadata: { /* ... */ },
  // ... other options
});

// Generate config template
UnderpostStatic.API.generateConfigTemplate('./my-config.json');

// Use helper functions
import { TemplateHelpers } from './src/cli/static.js';

const scriptTag = TemplateHelpers.createScriptTag({
  src: '/app.js',
  defer: true
});

const metaTags = TemplateHelpers.createMetaTags({
  title: 'My Page',
  description: 'Description'
});
```

### Template Helpers

- `TemplateHelpers.createScriptTag(options)` - Generate script tags
- `TemplateHelpers.createStyleTag(options)` - Generate style/link tags
- `TemplateHelpers.createIconTags(icons)` - Generate icon link tags
- `TemplateHelpers.createMetaTags(metadata)` - Generate meta tags
- `TemplateHelpers.createMicrodataTags(microdata)` - Generate JSON-LD tags

### Config Validator

```javascript
import { ConfigValidator } from './src/cli/static.js';

const result = ConfigValidator.validate(options);
if (!result.isValid) {
  console.error('Validation errors:', result.errors);
}
```

### Config Loader

```javascript
import { ConfigLoader } from './src/cli/static.js';

// Load config
const config = ConfigLoader.load('./config.json');

// Save config
ConfigLoader.save('./config.json', configObject);
```

### Debug Mode

Use `--dev` flag for development mode with additional logging:

```bash
underpost static --config-file ./config.json --dev
```
