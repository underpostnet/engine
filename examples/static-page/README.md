# Underpost Static Site Generator - Examples

This directory contains comprehensive examples and documentation for the Underpost Static Site Generator.

## Contents

### Documentation

- **[STATIC-GENERATOR-GUIDE.md](./STATIC-GENERATOR-GUIDE.md)** - Complete guide covering all features, best practices, and advanced usage patterns

### Configuration Examples

- **[static-config-example.json](./static-page/static-config-example.json)** - Fully documented configuration file template with all available options

### SSR Component Examples

- **[ssr-components/CustomPage.js](./ssr-components/CustomPage.js)** - Complete example of a custom landing page with:
  - Semantic HTML structure
  - Accessibility features
  - Responsive design
  - Progressive enhancement
  - Inline critical CSS
  - Interactive JavaScript

## Quick Start

### 1. Generate a Config Template

```bash
underpost static --generate-config ./my-static-config.json
```

This creates a template configuration file with all available options documented.

### 2. Customize Your Config

Edit the generated config file with your specific requirements:

```json
{
  "page": "./src/client/ssr/body/YourPage.js",
  "outputPath": "./dist/index.html",
  "metadata": {
    "title": "Your App Title",
    "description": "Your app description"
  }
}
```

### 3. Build Your Static Page

```bash
underpost static --config-file ./my-static-config.json
```

## Example Usage Scenarios

### Basic Static Page

```bash
underpost static \
  --page ./src/client/ssr/body/DefaultSplashScreen.js \
  --output-path ./dist/index.html \
  --title "My App"
```

### Landing Page with SEO

```bash
underpost static \
  --page ./examples/static-page/ssr-components/CustomPage.js \
  --output-path ./dist/landing.html \
  --title "Welcome to My App" \
  --description "The best app for your needs" \
  --keywords "app,solution,innovation" \
  --theme-color "#667eea" \
  --canonical-url "https://myapp.com"
```

### Complete Customization

Use the provided `static-config-example.json`:

```bash
# Copy the example
cp ./examples/static-page/static-config-example.json ./my-config.json

# Edit with your settings
nano ./my-config.json

# Build
underpost static --config-file ./my-config.json
```

## Available Examples

### 1. Complete Configuration Example

**File:** `static-config-example.json`

**What it demonstrates:**
- Complete metadata configuration
- Script injection (head and body)
- Stylesheet management
- Icon configuration
- SSR component inclusion
- Microdata/structured data
- Custom payload injection

**Use case:** Production-ready web application with full SEO and PWA support

### 2. Custom Landing Page Component

**File:** `ssr-components/CustomPage.js`

**What it demonstrates:**
- Hero section with call-to-action
- Feature showcase grid
- Content sections
- Contact form
- Footer with links
- Responsive design
- Accessibility features
- Progressive enhancement

**Use case:** Marketing landing page or product showcase

## Configuration Options Reference

### Metadata Options

```json
{
  "metadata": {
    "title": "Page title",
    "description": "SEO description",
    "keywords": ["keyword1", "keyword2"],
    "author": "Author name",
    "themeColor": "#ffffff",
    "canonicalURL": "https://example.com",
    "thumbnail": "https://example.com/image.png",
    "locale": "en-US",
    "siteName": "Site Name"
  }
}
```

### Script Options

```json
{
  "scripts": {
    "head": [
      {
        "src": "https://cdn.example.com/script.js",
        "async": true,
        "integrity": "sha384-...",
        "crossorigin": "anonymous"
      },
      {
        "content": "window.config = {};",
        "type": "text/javascript"
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

### Style Options

```json
{
  "styles": [
    { "href": "/main.css" },
    { "content": "body { margin: 0; }" },
    { "href": "/print.css", "media": "print" }
  ]
}
```

### Icon Options

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
      }
    ]
  }
}
```

### Component Options

```json
{
  "headComponents": [
    "./src/client/ssr/head/Seo.js",
    "./src/client/ssr/head/Pwa.js"
  ],
  "bodyComponents": [
    "./src/client/ssr/body/Header.js"
  ]
}
```

### Structured Data (Microdata)

```json
{
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "My Site",
      "url": "https://example.com"
    }
  ]
}
```

## Common Use Cases

### 1. Simple Blog Post

```json
{
  "page": "./src/client/ssr/body/BlogPost.js",
  "outputPath": "./dist/blog/my-post.html",
  "metadata": {
    "title": "My Blog Post Title",
    "description": "Summary of the blog post",
    "author": "John Doe",
    "keywords": ["blogging", "tutorial"]
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "My Blog Post Title",
      "author": {
        "@type": "Person",
        "name": "John Doe"
      },
      "datePublished": "2024-01-01"
    }
  ]
}
```

### 2. E-commerce Product Page

```json
{
  "page": "./src/client/ssr/body/ProductPage.js",
  "outputPath": "./dist/products/widget.html",
  "metadata": {
    "title": "Premium Widget - Buy Now",
    "description": "High-quality widget with free shipping",
    "thumbnail": "https://shop.com/widget.jpg"
  },
  "microdata": [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Premium Widget",
      "offers": {
        "@type": "Offer",
        "price": "29.99",
        "priceCurrency": "USD"
      }
    }
  ]
}
```

### 3. Documentation Page

```json
{
  "page": "./src/client/ssr/body/DocsPage.js",
  "outputPath": "./dist/docs/index.html",
  "headComponents": [
    "./src/client/ssr/head/Seo.js"
  ],
  "styles": [
    { "href": "/docs/prism.css" },
    { "href": "/docs/docs.css" }
  ],
  "scripts": {
    "body": [
      { "src": "/docs/prism.js", "defer": true },
      { "src": "/docs/search.js", "defer": true }
    ]
  }
}
```

### 4. Multi-language Pages

```bash
# English version
underpost static --config-file ./config-en.json --lang en --dir ltr

# Spanish version
underpost static --config-file ./config-es.json --lang es --dir ltr

# Arabic version
underpost static --config-file ./config-ar.json --lang ar --dir rtl
```

## Best Practices

### 1. SEO Optimization

✅ Always include title, description, and keywords
✅ Use canonical URLs
✅ Add Open Graph metadata
✅ Include structured data (JSON-LD)
✅ Optimize images in metadata

### 2. Performance

✅ Minify HTML in production
✅ Use async/defer for scripts
✅ Inline critical CSS
✅ Optimize asset loading order

### 3. Accessibility

✅ Use semantic HTML
✅ Include ARIA labels
✅ Ensure keyboard navigation
✅ Test with screen readers

### 4. Progressive Enhancement

✅ Ensure content works without JavaScript
✅ Add interactive features progressively
✅ Test on various devices
✅ Provide fallbacks

## Advanced Techniques

### Custom SSR Component Template

```javascript
/**
 * Custom Component Template
 * @description Brief description of the component
 */
SrrComponent = () => html`
  <div class="custom-component">
    <!-- Your HTML here -->
  </div>
  
  <style>
    /* Component-specific styles */
  </style>
  
  <script>
    // Component-specific JavaScript
    document.addEventListener('DOMContentLoaded', function() {
      // Your code here
    });
  </script>
`;
```

### Programmatic Usage

```javascript
import UnderpostStatic from './src/cli/static.js';

// Generate multiple pages
const pages = [
  { slug: 'home', title: 'Home' },
  { slug: 'about', title: 'About' },
  { slug: 'contact', title: 'Contact' }
];

for (const page of pages) {
  await UnderpostStatic.API.callback({
    page: `./src/client/ssr/body/${page.slug}.js`,
    outputPath: `./dist/${page.slug}.html`,
    metadata: {
      title: page.title
    }
  });
}
```
