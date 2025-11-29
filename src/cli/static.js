/**
 * Static site generation module with enhanced customization capabilities
 * @module src/cli/static.js
 * @namespace UnderpostStatic
 *
 * @example
 * // Basic usage - generate a simple page
 * import UnderpostStatic from './static.js';
 *
 * await UnderpostStatic.API.callback({
 *   page: './src/client/ssr/body/DefaultSplashScreen.js',
 *   title: 'My App',
 *   outputPath: './dist/index.html'
 * });
 *
 * @example
 * // Advanced usage - full customization
 * await UnderpostStatic.API.callback({
 *   page: './src/client/ssr/body/CustomPage.js',
 *   outputPath: './dist/custom.html',
 *   metadata: {
 *     title: 'My Custom Page',
 *     description: 'A fully customized static page',
 *     keywords: ['static', 'generator', 'custom'],
 *     author: 'John Doe',
 *     themeColor: '#007bff',
 *     canonicalURL: 'https://example.com/custom',
 *     thumbnail: 'https://example.com/thumb.png'
 *   },
 *   scripts: {
 *     head: [
 *       { src: '/vendor/library.js', async: true },
 *       { content: 'console.log("Inline script");', type: 'module' }
 *     ],
 *     body: [
 *       { src: '/app.js', defer: true }
 *     ]
 *   },
 *   styles: [
 *     { href: '/custom.css' },
 *     { content: 'body { margin: 0; }' }
 *   ],
 *   headComponents: [
 *     './src/client/ssr/head/Seo.js',
 *     './src/client/ssr/head/Pwa.js'
 *   ],
 *   icons: {
 *     favicon: '/custom-favicon.ico',
 *     appleTouchIcon: '/apple-touch-icon.png'
 *   },
 *   env: 'production',
 *   minify: true
 * });
 */

import fs from 'fs-extra';
import path from 'path';
import { ssrFactory } from '../server/ssr.js';
import { shellExec } from '../server/process.js';
import Underpost from '../index.js';
import { JSONweb } from '../server/client-formatted.js';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @typedef {Object} MetadataOptions
 * @memberof UnderpostStatic
 * @property {string} [title='Home'] - Page title
 * @property {string} [description=''] - Page description for SEO
 * @property {string[]} [keywords=[]] - Keywords for SEO
 * @property {string} [author=''] - Page author
 * @property {string} [themeColor='#ffffff'] - Theme color for mobile browsers
 * @property {string} [canonicalURL=''] - Canonical URL for SEO
 * @property {string} [thumbnail=''] - Open Graph thumbnail image URL
 * @property {string} [locale='en-US'] - Page locale
 * @property {string} [siteName=''] - Site name for Open Graph
 * @property {Object} [openGraph={}] - Additional Open Graph metadata
 * @property {Object} [twitter={}] - Twitter card metadata
 */

/**
 * @typedef {Object} ScriptOptions
 * @memberof UnderpostStatic
 * @property {string} [src] - External script source URL
 * @property {string} [content] - Inline script content
 * @property {string} [type='text/javascript'] - Script type
 * @property {boolean} [async=false] - Async loading flag
 * @property {boolean} [defer=false] - Defer loading flag
 * @property {string} [integrity] - Subresource integrity hash
 * @property {string} [crossorigin] - CORS settings
 * @property {Object} [attributes={}] - Additional HTML attributes
 */

/**
 * @typedef {Object} StyleOptions
 * @memberof UnderpostStatic
 * @property {string} [href] - External stylesheet URL
 * @property {string} [content] - Inline style content
 * @property {string} [media='all'] - Media query
 * @property {string} [integrity] - Subresource integrity hash
 * @property {string} [crossorigin] - CORS settings
 */

/**
 * @typedef {Object} IconOptions
 * @memberof UnderpostStatic
 * @property {string} [favicon] - Favicon path
 * @property {string} [appleTouchIcon] - Apple touch icon path
 * @property {string} [manifest] - Web manifest path
 * @property {Object[]} [additional=[]] - Additional icon definitions
 */

/**
 * @typedef {Object} StaticGenerationOptions
 * @memberof UnderpostStatic
 * @property {string} [page=''] - SSR component path to render
 * @property {string} [title='Home'] - Page title (deprecated: use metadata.title)
 * @property {string} [outputPath='.'] - Output file path
 * @property {string} [deployId=''] - Deployment identifier
 * @property {string} [buildHost=''] - Build host URL
 * @property {string} [buildPath='/'] - Build path
 * @property {string} [env='production'] - Environment (development/production)
 * @property {boolean} [build=false] - Whether to trigger build
 * @property {boolean} [dev=false] - Development mode flag
 * @property {boolean} [minify=true] - Minify HTML output
 * @property {MetadataOptions} [metadata={}] - Comprehensive metadata options
 * @property {Object} [scripts={}] - Script injection options
 * @property {ScriptOptions[]} [scripts.head=[]] - Scripts for head section
 * @property {ScriptOptions[]} [scripts.body=[]] - Scripts for body section
 * @property {StyleOptions[]} [styles=[]] - Stylesheet options
 * @property {string[]} [headComponents=[]] - Array of SSR head component paths
 * @property {string[]} [bodyComponents=[]] - Array of SSR body component paths
 * @property {IconOptions} [icons={}] - Icon configuration
 * @property {Object} [customPayload={}] - Custom data to inject into renderPayload
 * @property {Object} [templateHelpers={}] - Custom helper functions for templates
 * @property {string} [configFile=''] - Path to JSON config file
 * @property {string} [lang='en'] - HTML lang attribute
 * @property {string} [dir='ltr'] - HTML dir attribute
 * @property {Object} [microdata=[]] - Structured data (JSON-LD)
 */

/**
 * Template helper functions for common SSR patterns
 * @namespace TemplateHelpers
 */
const TemplateHelpers = {
  /**
   * Generates a script tag from options
   * @param {ScriptOptions} options - Script options
   * @returns {string} HTML script tag
   * @memberof TemplateHelpers
   *
   * @example
   * // External script with async
   * TemplateHelpers.createScriptTag({ src: '/app.js', async: true })
   * // Returns: <script async src="/app.js"></script>
   *
   * @example
   * // Inline module script
   * TemplateHelpers.createScriptTag({
   *   content: 'console.log("Hello");',
   *   type: 'module'
   * })
   * // Returns: <script type="module">console.log("Hello");</script>
   */
  createScriptTag(options) {
    const attrs = [];

    if (options.type && options.type !== 'text/javascript') {
      attrs.push(`type="${options.type}"`);
    }
    if (options.async) attrs.push('async');
    if (options.defer) attrs.push('defer');
    if (options.src) attrs.push(`src="${options.src}"`);
    if (options.integrity) attrs.push(`integrity="${options.integrity}"`);
    if (options.crossorigin) attrs.push(`crossorigin="${options.crossorigin}"`);

    // Add custom attributes
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        attrs.push(`${key}="${value}"`);
      });
    }

    const attrString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
    const content = options.content || '';

    return `<script${attrString}>${content}</script>`;
  },

  /**
   * Generates a link/style tag from options
   * @param {StyleOptions} options - Style options
   * @returns {string} HTML link or style tag
   * @memberof TemplateHelpers
   *
   * @example
   * // External stylesheet
   * TemplateHelpers.createStyleTag({ href: '/styles.css' })
   * // Returns: <link rel="stylesheet" href="/styles.css" media="all">
   *
   * @example
   * // Inline styles
   * TemplateHelpers.createStyleTag({ content: 'body { margin: 0; }' })
   * // Returns: <style>body { margin: 0; }</style>
   */
  createStyleTag(options) {
    if (options.content) {
      return `<style>${options.content}</style>`;
    }

    const attrs = [`rel="stylesheet"`];
    if (options.href) attrs.push(`href="${options.href}"`);
    if (options.media) attrs.push(`media="${options.media}"`);
    if (options.integrity) attrs.push(`integrity="${options.integrity}"`);
    if (options.crossorigin) attrs.push(`crossorigin="${options.crossorigin}"`);

    return `<link ${attrs.join(' ')}>`;
  },

  /**
   * Generates icon link tags
   * @param {IconOptions} icons - Icon options
   * @returns {string} HTML icon link tags
   * @memberof TemplateHelpers
   *
   * @example
   * TemplateHelpers.createIconTags({
   *   favicon: '/favicon.ico',
   *   appleTouchIcon: '/apple-touch-icon.png',
   *   manifest: '/manifest.json'
   * })
   */
  createIconTags(icons) {
    const tags = [];

    if (icons.favicon) {
      tags.push(`<link rel="icon" type="image/x-icon" href="${icons.favicon}">`);
    }
    if (icons.appleTouchIcon) {
      tags.push(`<link rel="apple-touch-icon" href="${icons.appleTouchIcon}">`);
    }
    if (icons.manifest) {
      tags.push(`<link rel="manifest" href="${icons.manifest}">`);
    }
    if (icons.additional && Array.isArray(icons.additional)) {
      icons.additional.forEach((icon) => {
        const attrs = Object.entries(icon)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        tags.push(`<link ${attrs}>`);
      });
    }

    return tags.join('\n');
  },

  /**
   * Generates meta tags from metadata object
   * @param {MetadataOptions} metadata - Metadata options
   * @returns {string} HTML meta tags
   * @memberof TemplateHelpers
   *
   * @example
   * TemplateHelpers.createMetaTags({
   *   description: 'My page description',
   *   keywords: ['web', 'app'],
   *   author: 'John Doe'
   * })
   */
  createMetaTags(metadata) {
    const tags = [];

    if (metadata.description) {
      tags.push(`<meta name="description" content="${metadata.description}">`);
    }
    if (metadata.keywords && metadata.keywords.length > 0) {
      tags.push(`<meta name="keywords" content="${metadata.keywords.join(', ')}">`);
    }
    if (metadata.author) {
      tags.push(`<meta name="author" content="${metadata.author}">`);
    }
    if (metadata.themeColor) {
      tags.push(`<meta name="theme-color" content="${metadata.themeColor}">`);
    }

    // Open Graph
    if (metadata.title) {
      tags.push(`<meta property="og:title" content="${metadata.title}">`);
    }
    if (metadata.description) {
      tags.push(`<meta property="og:description" content="${metadata.description}">`);
    }
    if (metadata.thumbnail) {
      tags.push(`<meta property="og:image" content="${metadata.thumbnail}">`);
    }
    if (metadata.canonicalURL) {
      tags.push(`<meta property="og:url" content="${metadata.canonicalURL}">`);
      tags.push(`<link rel="canonical" href="${metadata.canonicalURL}">`);
    }
    if (metadata.siteName) {
      tags.push(`<meta property="og:site_name" content="${metadata.siteName}">`);
    }
    if (metadata.locale) {
      tags.push(`<meta property="og:locale" content="${metadata.locale}">`);
    }

    // Twitter Card
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
    if (metadata.twitter) {
      Object.entries(metadata.twitter).forEach(([key, value]) => {
        tags.push(`<meta name="twitter:${key}" content="${value}">`);
      });
    }

    // Additional Open Graph
    if (metadata.openGraph) {
      Object.entries(metadata.openGraph).forEach(([key, value]) => {
        tags.push(`<meta property="og:${key}" content="${value}">`);
      });
    }

    return tags.join('\n');
  },

  /**
   * Generates JSON-LD structured data script tags
   * @param {Object[]} microdata - Array of structured data objects
   * @returns {string} HTML script tags with JSON-LD
   * @memberof TemplateHelpers
   *
   * @example
   * TemplateHelpers.createMicrodataTags([
   *   {
   *     '@context': 'https://schema.org',
   *     '@type': 'WebSite',
   *     'name': 'My Site',
   *     'url': 'https://example.com'
   *   }
   * ])
   */
  createMicrodataTags(microdata) {
    if (!microdata || !Array.isArray(microdata) || microdata.length === 0) {
      return '';
    }

    return microdata
      .map((data) => `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`)
      .join('\n');
  },
};

/**
 * Configuration validator
 * @namespace ConfigValidator
 */
const ConfigValidator = {
  /**
   * Validates static generation options
   * @param {StaticGenerationOptions} options - Options to validate
   * @returns {Object} Validation result with isValid flag and errors array
   * @memberof ConfigValidator
   */
  validate(options) {
    const errors = [];

    // Validate page path
    if (options.page && !fs.existsSync(options.page)) {
      errors.push(`Page component does not exist: ${options.page}`);
    }

    // Validate head components
    if (options.headComponents && Array.isArray(options.headComponents)) {
      options.headComponents.forEach((comp) => {
        if (!fs.existsSync(comp)) {
          errors.push(`Head component does not exist: ${comp}`);
        }
      });
    }

    // Validate body components
    if (options.bodyComponents && Array.isArray(options.bodyComponents)) {
      options.bodyComponents.forEach((comp) => {
        if (!fs.existsSync(comp)) {
          errors.push(`Body component does not exist: ${comp}`);
        }
      });
    }

    // Validate environment
    if (options.env && !['development', 'production'].includes(options.env)) {
      logger.warn(`Invalid environment: ${options.env}. Using 'production' as default.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Configuration file loader
 * @namespace ConfigLoader
 */
const ConfigLoader = {
  /**
   * Loads configuration from a JSON file
   * @param {string} configPath - Path to config file
   * @returns {Object} Configuration object
   * @memberof ConfigLoader
   *
   * @example
   * // static-config.json
   * {
   *   "metadata": {
   *     "title": "My App",
   *     "description": "My application description"
   *   },
   *   "env": "production"
   * }
   *
   * // Usage
   * const config = ConfigLoader.load('./static-config.json');
   */
  load(configPath) {
    try {
      if (!fs.existsSync(configPath)) {
        logger.error(`Config file not found: ${configPath}`);
        return {};
      }

      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Error loading config file: ${error.message}`);
      return {};
    }
  },

  /**
   * Saves configuration to a JSON file
   * @param {string} configPath - Path to save config
   * @param {Object} config - Configuration object
   * @memberof ConfigLoader
   */
  save(configPath, config) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      logger.info(`Config saved to: ${configPath}`);
    } catch (error) {
      logger.error(`Error saving config file: ${error.message}`);
    }
  },
};

/**
 * @class UnderpostStatic
 * @description Enhanced static site generation class with comprehensive customization
 * @memberof UnderpostStatic
 */
class UnderpostStatic {
  static API = {
    /**
     * Generate static HTML file with enhanced customization options
     *
     * @param {StaticGenerationOptions} options - Options for static generation
     * @returns {Promise<void>}
     * @memberof UnderpostStatic
     *
     * @example
     * // Minimal usage
     * await UnderpostStatic.API.callback({
     *   page: './src/client/ssr/body/DefaultSplashScreen.js',
     *   outputPath: './dist/index.html'
     * });
     *
     * @example
     * // Full customization with metadata and scripts
     * await UnderpostStatic.API.callback({
     *   page: './src/client/ssr/body/CustomPage.js',
     *   outputPath: './dist/page.html',
     *   metadata: {
     *     title: 'My Custom Page',
     *     description: 'A fully customized page',
     *     keywords: ['custom', 'static', 'page'],
     *     author: 'Jane Developer',
     *     themeColor: '#4CAF50',
     *     canonicalURL: 'https://example.com/page',
     *     thumbnail: 'https://example.com/images/thumbnail.png',
     *     locale: 'en-US',
     *     siteName: 'My Website'
     *   },
     *   scripts: {
     *     head: [
     *       { src: 'https://cdn.example.com/analytics.js', async: true },
     *       { content: 'window.config = { apiUrl: "https://api.example.com" };' }
     *     ],
     *     body: [
     *       { src: '/app.js', type: 'module', defer: true }
     *     ]
     *   },
     *   styles: [
     *     { href: '/main.css' },
     *     { content: 'body { font-family: sans-serif; }' }
     *   ],
     *   icons: {
     *     favicon: '/favicon.ico',
     *     appleTouchIcon: '/apple-touch-icon.png',
     *     manifest: '/manifest.json'
     *   },
     *   headComponents: [
     *     './src/client/ssr/head/Seo.js',
     *     './src/client/ssr/head/Pwa.js'
     *   ],
     *   microdata: [
     *     {
     *       '@context': 'https://schema.org',
     *       '@type': 'WebPage',
     *       'name': 'My Custom Page',
     *       'url': 'https://example.com/page'
     *     }
     *   ],
     *   customPayload: {
     *     apiEndpoint: 'https://api.example.com',
     *     features: ['feature1', 'feature2']
     *   },
     *   env: 'production',
     *   minify: true
     * });
     *
     * @example
     * // Using a config file
     * await UnderpostStatic.API.callback({
     *   configFile: './static-config.json',
     *   outputPath: './dist/index.html'
     * });
     *
     * @example
     * // Generate with build trigger
     * await UnderpostStatic.API.callback({
     *   page: './src/client/ssr/body/DefaultSplashScreen.js',
     *   outputPath: './public/index.html',
     *   deployId: 'production-v1',
     *   buildHost: 'example.com',
     *   buildPath: '/',
     *   build: true,
     *   env: 'production'
     * });
     */
    async callback(options = {}) {
      // Load config from file if specified
      if (options.configFile) {
        const fileConfig = ConfigLoader.load(options.configFile);
        options = { ...fileConfig, ...options }; // CLI options override file config
      }

      // Set defaults
      if (!options.outputPath) options.outputPath = '.';
      if (!options.buildPath) options.buildPath = '/';
      if (!options.env) options.env = 'production';
      if (options.minify === undefined) options.minify = options.env === 'production';
      if (!options.metadata) options.metadata = {};
      if (!options.lang) options.lang = 'en';
      if (!options.dir) options.dir = 'ltr';

      // Merge title for backwards compatibility
      if (options.title && !options.metadata.title) {
        options.metadata.title = options.title;
      }
      if (!options.metadata.title) {
        options.metadata.title = 'Home';
      }

      // Validate options
      const validation = ConfigValidator.validate(options);
      if (!validation.isValid) {
        logger.error('Validation errors:');
        validation.errors.forEach((err) => logger.error(`  - ${err}`));
        if (validation.errors.some((err) => err.includes('does not exist'))) {
          return; // Exit if critical path errors
        }
      }

      // Generate page HTML
      if (options.page) {
        try {
          logger.info(`Generating static page: ${options.page}`);

          const Render = await ssrFactory();
          const SsrComponent = await ssrFactory(options.page);

          // Build head components
          let ssrHeadComponents = '';

          // Add custom meta tags
          if (options.metadata) {
            ssrHeadComponents += TemplateHelpers.createMetaTags(options.metadata);
          }

          // Add custom icons
          if (options.icons) {
            ssrHeadComponents += '\n' + TemplateHelpers.createIconTags(options.icons);
          }

          // Add custom styles
          if (options.styles && Array.isArray(options.styles)) {
            ssrHeadComponents += '\n' + options.styles.map((style) => TemplateHelpers.createStyleTag(style)).join('\n');
          }

          // Add custom head scripts
          if (options.scripts?.head && Array.isArray(options.scripts.head)) {
            ssrHeadComponents +=
              '\n' + options.scripts.head.map((script) => TemplateHelpers.createScriptTag(script)).join('\n');
          }

          // Add microdata/structured data
          if (options.microdata && Array.isArray(options.microdata)) {
            ssrHeadComponents += '\n' + TemplateHelpers.createMicrodataTags(options.microdata);
          }

          // Load additional head components
          if (options.headComponents && Array.isArray(options.headComponents)) {
            for (const compPath of options.headComponents) {
              try {
                const HeadComponent = await ssrFactory(compPath);
                // Pass metadata and other options to component
                const componentData = {
                  ...options.metadata,
                  ssrPath: options.buildPath === '/' ? '/' : `${options.buildPath}/`,
                  microdata: options.microdata || [],
                };
                ssrHeadComponents += '\n' + HeadComponent(componentData);
              } catch (error) {
                logger.error(`Error loading head component ${compPath}: ${error.message}`);
              }
            }
          }

          // Build body components
          let ssrBodyComponents = SsrComponent();

          // Load additional body components
          if (options.bodyComponents && Array.isArray(options.bodyComponents)) {
            for (const compPath of options.bodyComponents) {
              try {
                const BodyComponent = await ssrFactory(compPath);
                ssrBodyComponents += '\n' + BodyComponent();
              } catch (error) {
                logger.error(`Error loading body component ${compPath}: ${error.message}`);
              }
            }
          }

          // Add custom body scripts
          if (options.scripts?.body && Array.isArray(options.scripts.body)) {
            ssrBodyComponents +=
              '\n' + options.scripts.body.map((script) => TemplateHelpers.createScriptTag(script)).join('\n');
          }

          // Build render payload
          const renderPayload = {
            version: Underpost.version,
            ...(options.env === 'development' ? { dev: true } : undefined),
            ...options.customPayload,
          };

          // Generate HTML
          const htmlSrc = Render({
            title: options.metadata.title,
            ssrPath: options.buildPath === '/' ? '/' : `${options.buildPath}/`,
            ssrHeadComponents,
            ssrBodyComponents,
            renderPayload,
            renderApi: {
              JSONweb,
            },
          });

          // Write output file
          const outputDir = path.dirname(options.outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          fs.writeFileSync(options.outputPath, htmlSrc, 'utf8');
          logger.info(`Static page generated: ${options.outputPath}`);
        } catch (error) {
          logger.error(`Error generating static page: ${error.message}`);
          logger.error(error.stack);
          throw error;
        }
      }

      // Trigger build if requested
      if (options.deployId && options.build) {
        try {
          logger.info(`Triggering build for deployment: ${options.deployId}`);

          shellExec(`underpost env ${options.deployId} ${options.env}`);
          shellExec(
            `npm run build ${options.deployId}${options.buildHost ? ` ${options.buildHost} ${options.buildPath}` : ``}`,
          );

          logger.info('Build completed successfully');
        } catch (error) {
          logger.error(`Build error: ${error.message}`);
          throw error;
        }
      }
    },

    /**
     * Helper method to generate a config template file
     *
     * @param {string} outputPath - Where to save the template config
     * @returns {void}
     * @memberof UnderpostStatic
     *
     * @example
     * // Generate a template configuration file
     * UnderpostStatic.API.generateConfigTemplate('./my-static-config.json');
     */
    generateConfigTemplate(outputPath = './static-config.json') {
      const template = {
        page: './src/client/ssr/body/DefaultSplashScreen.js',
        outputPath: './dist/index.html',
        env: 'production',
        minify: true,
        lang: 'en',
        dir: 'ltr',
        metadata: {
          title: 'My Application',
          description: 'A description of my application',
          keywords: ['keyword1', 'keyword2', 'keyword3'],
          author: 'Your Name',
          themeColor: '#ffffff',
          canonicalURL: 'https://example.com',
          thumbnail: 'https://example.com/images/thumbnail.png',
          locale: 'en-US',
          siteName: 'My Site',
        },
        scripts: {
          head: [
            {
              src: 'https://example.com/analytics.js',
              async: true,
              comment: 'Analytics script',
            },
            {
              content: 'window.config = { apiUrl: "https://api.example.com" };',
              comment: 'App configuration',
            },
          ],
          body: [
            {
              src: '/app.js',
              type: 'module',
              defer: true,
            },
          ],
        },
        styles: [
          {
            href: '/styles/main.css',
          },
          {
            content: 'body { margin: 0; padding: 0; }',
          },
        ],
        icons: {
          favicon: '/favicon.ico',
          appleTouchIcon: '/apple-touch-icon.png',
          manifest: '/manifest.json',
        },
        headComponents: ['./src/client/ssr/head/Seo.js', './src/client/ssr/head/Pwa.js'],
        microdata: [
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'My Site',
            url: 'https://example.com',
          },
        ],
        customPayload: {
          apiEndpoint: 'https://api.example.com',
          customFeature: true,
        },
      };

      ConfigLoader.save(outputPath, template);
      logger.info(`Config template generated: ${outputPath}`);
    },
  };

  /**
   * Export template helpers for external use
   * @static
   * @memberof UnderpostStatic
   */
  static TemplateHelpers = TemplateHelpers;

  /**
   * Export config validator for external use
   * @static
   * @memberof UnderpostStatic
   */
  static ConfigValidator = ConfigValidator;

  /**
   * Export config loader for external use
   * @static
   * @memberof UnderpostStatic
   */
  static ConfigLoader = ConfigLoader;
}

export default UnderpostStatic;
export { TemplateHelpers, ConfigValidator, ConfigLoader };
