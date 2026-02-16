import { ssrFactory } from '../server/ssr.js';

/**
 * Module for handling the rendering and styling of HTML emails using SSR components.
 * @module src/mailer/EmailRender.js
 * @namespace EmailRenderService
 */

/**
 * @class
 * @alias EmailRenderService
 * @memberof EmailRenderService
 * @classdesc Utility class for managing CSS styles and rendering email templates using
 * Server-Side Rendering (SSR) components.
 */
class EmailRenderService {
  /**
   * Defines the base CSS styles for different elements within the email template.
   * Keys are CSS selectors (or class names), and values are objects of CSS properties.
   * @type {object.<string, object.<string, string>>}
   * @property {object} body - Styles for the main email body wrapper.
   * @property {object} .container - Styles for the main content container.
   * @property {object} h1 - Styles for primary headings.
   * @property {object} p - Styles for standard paragraphs.
   * @property {object} button - Styles for call-to-action buttons.
   * @property {object} .footer - Styles for the email footer.
   */
  style = {
    body: {
      'font-family': 'Arial, sans-serif',
      'background-color': '#f4f4f4',
      margin: 0,
      padding: '20px',
      'min-height': '300px',
      width: '100%',
      'max-width': '700px',
      display: 'block',
    },
    '.container': {
      'max-width': '600px',
      margin: '0 auto',
      'background-color': '#ffffff',
      padding: '20px',
      'border-radius': '5px',
      // 'box-shadow': '0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19)',
    },
    h1: {
      'font-size': '24px',
      'margin-bottom': '20px',
      color: '#333333',
    },
    p: {
      'font-size': '16px',
      'line-height': 1.5,
      'margin-bottom': '20px',
      color: '#666666',
    },
    button: {
      display: 'inline-block',
      padding: '10px 20px',
      'background-color': '#007bff',
      color: '#ffffff',
      'text-decoration': 'none',
      'border-radius': '5px',
      'font-size': '16px',
    },
    '.footer': {
      'text-align': 'center',
      padding: '20px',
      'font-size': '14px',
      color: '#999999',
    },
  };

  /**
   * Converts a style object defined in the `this.style` property into a CSS style string.
   *
   * @param {string} classObj - The key corresponding to a style object in `this.style`.
   * @returns {string} A string containing inline CSS properties (e.g., ` property: value;`).
   */
  renderStyle(classObj) {
    if (!this.style[classObj]) return '';
    return Object.keys(this.style[classObj])
      .map((classKey) => ` ${classKey}: ${this.style[classObj][classKey]};`)
      .join(``);
  }

  /**
   * Loads and renders email templates using the SSR factory.
   *
   * @async
   * @param {object} [options] - Options containing the template names.
   * @param {object.<string, string>} [options.templates={}] - Map of template keys to their SSR component file names.
   * @returns {Promise<object.<string, string>>} A promise that resolves to an object map of rendered HTML email strings.
   */
  async getTemplates(options = { templates: {} }) {
    const templates = {};
    for (const templateKey of Object.keys(options.templates)) {
      const ssrEmailComponent = options.templates[templateKey];
      // Note: ssrFactory is assumed to load and return a functional component/function
      const SrrComponent = await ssrFactory(`./src/client/ssr/mailer/${ssrEmailComponent}.js`);
      templates[templateKey] = SrrComponent(this, options);
    }
    return templates;
  }
}

/**
 * Singleton instance of the EmailRenderService class for backward compatibility.
 * @alias EmailRender
 * @memberof EmailRenderService
 * @type {EmailRenderService}
 */
const EmailRender = new EmailRenderService();

export { EmailRender, EmailRenderService as EmailRenderClass };
