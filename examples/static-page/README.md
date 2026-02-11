# Static Page Example

Generate static HTML pages using the `underpost static` CLI.

## Quick Start

```sh
# From the project root directory:
underpost static --page ./examples/static-page/ssr-components/CustomPage.js \
                 --output-path ./public/default.net/example.html
```

## Using a Config File

A JSON config file lets you define all options in one place instead of passing CLI flags.

**Generate a starter config:**

```sh
underpost static --generate-config ./static-config.json
```

**Build from the included example config:**

```sh
underpost static --config-file ./examples/static-page/static-config-example.json
```

## Config File Reference

See [`static-config-example.json`](./static-config-example.json) for a complete working example.

| Field | Type | Description |
|-------|------|-------------|
| `page` | `string` | Path to the SSR component to render |
| `outputPath` | `string` | Output HTML file path |
| `env` | `string` | `"production"` or `"development"` |
| `minify` | `boolean` | Minify HTML output |
| `lang` | `string` | HTML `lang` attribute |
| `dir` | `string` | HTML `dir` attribute (`ltr`/`rtl`) |
| `metadata` | `object` | SEO metadata (title, description, keywords, author, themeColor, canonicalURL, thumbnail, locale, siteName) |
| `scripts` | `object` | `{ head: [...], body: [...] }` — inline or external scripts |
| `styles` | `array` | Inline (`content`) or external (`href`) stylesheets |
| `icons` | `object` | `favicon`, `appleTouchIcon`, `manifest` paths |
| `headComponents` | `array` | SSR component paths injected into `<head>` |
| `bodyComponents` | `array` | SSR component paths injected into `<body>` |
| `microdata` | `array` | JSON-LD structured data objects |
| `customPayload` | `object` | Arbitrary data injected into the render payload |

## CLI Flags

Flags override config file values when both are provided.

```sh
underpost static --page <path>            # SSR component path
                 --output-path <path>     # Output file
                 --config-file <path>     # JSON config file
                 --env <env>              # production | development
                 --minify / --no-minify   # Toggle minification
                 --title <title>          # Page title
                 --description <text>     # Meta description
                 --keywords <a,b,c>       # Comma-separated keywords
                 --author <name>          # Meta author
                 --favicon <path>         # Favicon path
                 --lang <lang>            # HTML lang attribute
                 --dir <dir>              # HTML dir attribute
                 --dev                    # Development mode
```

## SSR Component

The page content is defined in an SSR component file. See [`ssr-components/CustomPage.js`](./ssr-components/CustomPage.js) for an example.

A component exports an `SrrComponent` function that returns an HTML template literal:

```js
SrrComponent = () => html`
  <div>
    <h1>Hello World</h1>
    <p>Your page content here.</p>
  </div>
`;
```
