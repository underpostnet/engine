# Static Page Example

Generate static HTML pages using the `underpost static` CLI.

## Quick Start

```sh
# From the project root directory:
underpost static --page ./examples/static-page/ssr-components/CustomPage.js \
                 --output-path ./dist/example/index.html
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

## Preview with Static Server

Use `--run-sv` to start a standalone Express static file server that serves the build output directory, so you can preview your generated pages in a browser.

```sh
# Build and serve on default port 5000:
underpost static --page ./examples/static-page/ssr-components/CustomPage.js \
                 --output-path ./dist/index.html \
                 --run-sv

# Build and serve on a custom port:
underpost static --page ./examples/static-page/ssr-components/CustomPage.js \
                 --output-path ./dist/index.html \
                 --run-sv 3000

# Serve an existing build directory without rebuilding:
underpost static --output-path ./dist/index.html --run-sv

# Serve the current working directory:
underpost static --run-sv 8080
```

When `--output-path` is provided, the server serves the directory containing the output file (e.g. `./dist/`). Otherwise it serves the current working directory.

## Build Manifest

Every page links its Underpost Build Manifest, then inlines it. The build writes
`underpost.manifest` at the site root, the directory the site serves at `buildPath`:

- `siteRoot` (`--site-root`) names the site root. It is the output directory by default, the
  directory `--run-sv` serves. A page in a sub-directory, such as `404/index.html`, names the site
  root of its site.
- `application` (`--application`) names the application the manifest describes. It is the page
  component name by default. The pages of one site name one application, so they share one
  manifest.

A page written into the tree of another application writes over that application's manifest. Build
such a page into a site of its own.

See `src/client/public/docs/nexodev/reference/build-manifest.md`.

## Config File Reference

See [`static-config-example.json`](./static-config-example.json) for a complete working example.

| Field            | Type      | Description                                                                                                 |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `page`           | `string`  | Path to the SSR component to render                                                                         |
| `outputPath`     | `string`  | Output HTML file path                                                                                       |
| `buildPath`      | `string`  | Base path for static documents or assets (default: `"/"`)                                                   |
| `siteRoot`       | `string`  | Directory the site serves at `buildPath`, where `underpost.manifest` is written (default: output directory) |
| `application`    | `string`  | Application the build manifest names (default: the page component name)                                     |
| `env`            | `string`  | `"production"` or `"development"`                                                                           |
| `minify`         | `boolean` | Minify HTML output                                                                                          |
| `lang`           | `string`  | HTML `lang` attribute                                                                                       |
| `dir`            | `string`  | HTML `dir` attribute (`ltr`/`rtl`)                                                                          |
| `metadata`       | `object`  | SEO metadata (title, description, keywords, author, themeColor, canonicalURL, thumbnail, locale, siteName)  |
| `scripts`        | `object`  | `{ head: [...], body: [...] }` — inline or external scripts                                                 |
| `styles`         | `array`   | Inline (`content`) or external (`href`) stylesheets                                                         |
| `icons`          | `object`  | `favicon`, `appleTouchIcon`, `manifest` paths                                                               |
| `headComponents` | `array`   | SSR component paths injected into `<head>`                                                                  |
| `bodyComponents` | `array`   | SSR component paths injected into `<body>`                                                                  |
| `microdata`      | `array`   | JSON-LD structured data objects                                                                             |

## CLI Flags

Flags override config file values when both are provided.

### Build & Output

```sh
underpost static --page <path>                  # SSR component path
                 --output-path <path>           # Output file
                 --build-path <path>            # Base path for assets (default: "/")
                 --site-root <dir>              # Directory the site serves at --build-path
                 --application <name>           # Application the build manifest names
                 --config-file <path>           # JSON config file
                 --generate-config [path]       # Generate a template config file
                 --env <env>                    # production | development
                 --minify / --no-minify         # Toggle minification
                 --lang <lang>                  # HTML lang attribute (default: en)
                 --dir <dir>                    # HTML dir attribute (default: ltr)
                 --dev                          # Development mode
```

### Metadata & SEO

```sh
                 --title <title>                # Page title (deprecated: use --config-file)
                 --description <text>           # Meta description
                 --keywords <a,b,c>             # Comma-separated keywords
                 --author <name>                # Meta author
                 --theme-color <color>          # Theme color for mobile browsers
                 --canonical-url <url>          # Canonical URL for SEO
                 --thumbnail <url>              # Open Graph thumbnail image URL
                 --locale <locale>              # Page locale (default: en-US)
                 --site-name <name>             # Site name for Open Graph
```

### Scripts & Styles

```sh
                 --head-scripts <paths>         # Comma-separated script paths for <head>
                 --body-scripts <paths>         # Comma-separated script paths for <body>
                 --styles <paths>               # Comma-separated stylesheet paths
```

### Icons

```sh
                 --favicon <path>               # Favicon path
                 --apple-touch-icon <path>      # Apple touch icon path
                 --manifest <path>              # Web manifest path
```

### SSR Components

```sh
                 --head-components <paths>      # Comma-separated SSR head component paths
                 --body-components <paths>      # Comma-separated SSR body component paths
```

### Static Server

```sh
                 --run-sv [port]                # Start Express static server (default port: 5000)
```

## SSR Component

The page content is defined in an SSR component file. See [`ssr-components/CustomPage.js`](./ssr-components/CustomPage.js) for an example.

A component exports an `SSRComponent` function that returns an HTML template literal:

```js
SSRComponent = () => html`
  <div>
    <h1>Hello World</h1>
    <p>Your page content here.</p>
  </div>
`;
```
