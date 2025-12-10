# Underpost Static Site Generator - Quick Reference

## Basic Commands

### Generate Config Template
```bash
underpost static --generate-config ./static-config.json
```

### Build from Config File
```bash
underpost static --config-file ./static-config.json
```

### Simple Page Generation
```bash
underpost static \
  --page ./src/client/ssr/body/Page.js \
  --output-path ./dist/index.html \
  --title "My Page"
```

## Common CLI Patterns

### Landing Page with SEO
```bash
underpost static \
  --page ./src/client/ssr/body/Landing.js \
  --output-path ./dist/landing.html \
  --title "Welcome" \
  --description "My awesome landing page" \
  --keywords "landing,web,app" \
  --theme-color "#007bff" \
  --canonical-url "https://example.com"
```

### Page with External Scripts
```bash
underpost static \
  --page ./src/client/ssr/body/App.js \
  --output-path ./dist/app.html \
  --head-scripts "https://cdn.example.com/analytics.js" \
  --body-scripts "/app.js,/vendor.js"
```

### Page with Custom Icons
```bash
underpost static \
  --page ./src/client/ssr/body/Home.js \
  --output-path ./dist/index.html \
  --favicon "/favicon.ico" \
  --apple-touch-icon "/apple-touch-icon.png" \
  --manifest "/manifest.json"
```

### Production Build with Deployment
```bash
underpost static \
  --page ./src/client/ssr/body/App.js \
  --output-path ./public/index.html \
  --deploy-id "production-v1" \
  --build-host "example.com" \
  --build-path "/" \
  --build \
  --env production
```

## Configuration File Patterns

### Minimal Config
```json
{
  "page": "./src/client/ssr/body/Page.js",
  "outputPath": "./dist/index.html",
  "metadata": {
    "title": "My Page",
    "description": "Page description"
  }
}
```

### SEO-Optimized Config
```json
{
  "page": "./src/client/ssr/body/Page.js",
  "outputPath": "./dist/index.html",
  "metadata": {
    "title": "My SEO Page",
    "description": "Comprehensive description for SEO",
    "keywords": ["seo", "optimization", "web"],
    "author": "Your Name",
    "canonicalURL": "https://example.com",
    "thumbnail": "https://example.com/og-image.png",
    "themeColor": "#4CAF50"
  }
}
```

### With Scripts and Styles
```json
{
  "page": "./src/client/ssr/body/Page.js",
  "outputPath": "./dist/index.html",
  "scripts": {
    "head": [
      { "src": "https://cdn.example.com/lib.js", "async": true }
    ],
    "body": [
      { "src": "/app.js", "type": "module", "defer": true }
    ]
  },
  "styles": [
    { "href": "/main.css" },
    { "content": "body { margin: 0; }" }
  ]
}
```

### PWA Configuration
```json
{
  "page": "./src/client/ssr/body/App.js",
  "outputPath": "./dist/index.html",
  "metadata": {
    "title": "My PWA",
    "themeColor": "#007bff"
  },
  "icons": {
    "favicon": "/favicon.ico",
    "appleTouchIcon": "/apple-touch-icon.png",
    "manifest": "/manifest.json"
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

### With Structured Data
```json
{
  "page": "./src/client/ssr/body/Page.js",
  "outputPath": "./dist/index.html",
  "metadata": {
    "title": "My Product"
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "My Product",
      "offers": {
        "@type": "Offer",
        "price": "29.99",
        "priceCurrency": "USD"
      }
    }
  ]
}
```

## SSR Component Patterns

### Basic Component
```javascript
SrrComponent = () => html`
  <div class="page">
    <h1>Hello World</h1>
  </div>
`;
```

### Component with Styles
```javascript
SrrComponent = () => html`
  <div class="custom-page">
    <h1>Styled Page</h1>
  </div>
  <style>
    .custom-page {
      padding: 20px;
    }
  </style>
`;
```

### Component with JavaScript
```javascript
SrrComponent = () => html`
  <div class="interactive-page">
    <button id="myButton">Click Me</button>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.getElementById('myButton').addEventListener('click', function() {
        alert('Button clicked!');
      });
    });
  </script>
`;
```

### Component with Dynamic Content
```javascript
SrrComponent = () => html`
  <div class="dynamic-page">
    <h1>Current Year: ${new Date().getFullYear()}</h1>
    <p>Generated at: ${new Date().toISOString()}</p>
  </div>
`;
```

## Environment-Specific Builds

### Development
```bash
underpost static \
  --config-file ./config.json \
  --env development \
  --no-minify \
  --dev
```

### Production
```bash
underpost static \
  --config-file ./config.json \
  --env production \
  --minify
```

## Multi-Page Generation

### Using Script (Bash)
```bash
#!/bin/bash
PAGES=("home" "about" "contact")

for page in "${PAGES[@]}"; do
  underpost static \
    --page "./src/client/ssr/body/${page}.js" \
    --output-path "./dist/${page}.html" \
    --title "$(echo $page | sed 's/.*/\u&/')"
done
```

### Using JavaScript
```javascript
import UnderpostStatic from './src/cli/static.js';

const pages = ['home', 'about', 'contact'];

for (const page of pages) {
  await UnderpostStatic.API.callback({
    page: `./src/client/ssr/body/${page}.js`,
    outputPath: `./dist/${page}.html`,
    metadata: {
      title: page.charAt(0).toUpperCase() + page.slice(1)
    }
  });
}
```

## Metadata Patterns

### Blog Post
```json
{
  "metadata": {
    "title": "How to Build Static Sites",
    "description": "A comprehensive guide to building static sites",
    "keywords": ["static", "guide", "tutorial"],
    "author": "Jane Doe"
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "How to Build Static Sites",
      "author": { "@type": "Person", "name": "Jane Doe" },
      "datePublished": "2024-01-01"
    }
  ]
}
```

### E-commerce Product
```json
{
  "metadata": {
    "title": "Premium Widget - $29.99",
    "description": "High-quality widget with free shipping",
    "thumbnail": "https://shop.com/widget.jpg"
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Premium Widget",
      "image": "https://shop.com/widget.jpg",
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

### Organization
```json
{
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "My Company",
      "url": "https://example.com",
      "logo": "https://example.com/logo.png",
      "sameAs": [
        "https://twitter.com/mycompany",
        "https://linkedin.com/company/mycompany"
      ]
    }
  ]
}
```

## JavaScript API Usage

### Basic Generation
```javascript
import UnderpostStatic from './src/cli/static.js';

await UnderpostStatic.API.callback({
  page: './src/client/ssr/body/Page.js',
  outputPath: './dist/index.html',
  metadata: { title: 'My Page' }
});
```

### Using Template Helpers
```javascript
import { TemplateHelpers } from './src/cli/static.js';

const scriptTag = TemplateHelpers.createScriptTag({
  src: '/app.js',
  defer: true,
  type: 'module'
});

const metaTags = TemplateHelpers.createMetaTags({
  title: 'My Page',
  description: 'Description',
  keywords: ['key1', 'key2']
});
```

### Validation
```javascript
import { ConfigValidator } from './src/cli/static.js';

const result = ConfigValidator.validate(options);
if (!result.isValid) {
  console.error('Errors:', result.errors);
}
```

## Common Script Snippets

### Google Analytics
```json
{
  "scripts": {
    "head": [
      {
        "src": "https://www.googletagmanager.com/gtag/js?id=GA_ID",
        "async": true
      },
      {
        "content": "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GA_ID');"
      }
    ]
  }
}
```

### Service Worker Registration
```json
{
  "scripts": {
    "body": [
      {
        "content": "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').then(reg=>console.log('SW registered',reg)).catch(err=>console.log('SW error',err));}"
      }
    ]
  }
}
```

### App Configuration
```json
{
  "scripts": {
    "head": [
      {
        "content": "window.appConfig={apiUrl:'https://api.example.com',version:'1.0.0',features:{analytics:true,debugging:false}};"
      }
    ]
  }
}
```

## Troubleshooting Quick Fixes

### Component Not Found
```bash
# Check if file exists
ls -la ./src/client/ssr/body/Page.js

# Use absolute path from project root
underpost static --page ./src/client/ssr/body/Page.js --output-path ./dist/index.html
```

### Invalid JSON Config
```bash
# Validate JSON
cat config.json | python -m json.tool

# Or use jq
jq . config.json
```

### Output Directory Missing
```bash
# Create directory first
mkdir -p ./dist/pages

# Then run command
underpost static --config-file ./config.json
```

## Performance Optimization

### Minification
```json
{
  "env": "production",
  "minify": true
}
```

### Async Loading
```json
{
  "scripts": {
    "head": [
      { "src": "/analytics.js", "async": true }
    ],
    "body": [
      { "src": "/app.js", "defer": true }
    ]
  }
}
```

### Critical CSS
```json
{
  "styles": [
    { "content": "body{margin:0;font-family:sans-serif}" },
    { "href": "/main.css" }
  ]
}
```
