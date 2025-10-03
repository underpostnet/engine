/**
 * Module for formatting client-side code
 * @module src/server/client-formatted.js
 * @namespace clientFormatted
 */

'use strict';

/**
 * Formats a source code string by removing 'html`' and 'css`' tags from template literals.
 * @param {string} src - The source code string.
 * @returns {string} The formatted source code.
 * @memberof clientFormatted
 */
const srcFormatted = (src) =>
  src
    .replaceAll(' html`', '`')
    .replaceAll(' css`', '`')
    .replaceAll('{html`', '{`')
    .replaceAll('{css`', '{`')
    .replaceAll('(html`', '(`')
    .replaceAll('(css`', '(`')
    .replaceAll('[html`', '[`')
    .replaceAll('[css`', '[`');

/**
 * Converts a JavaScript object into a string that can be embedded in client-side code
 * and parsed back into an object (e.g., 'JSON.parse(`{...}`)').
 * @param {*} data - The data to be stringified.
 * @returns {string} A string representing the code to parse the JSON data.
 * @memberof clientFormatted
 */
const JSONweb = (data) => 'JSON.parse(`' + JSON.stringify(data) + '`)';

/**
 * Formats a component's source code by rewriting its import paths to be absolute for browser consumption.
 * @param {string} src - The source code of the component.
 * @param {string} module - The name of the module/component.
 * @param {Array<object>} dists - An array of distribution objects with import names.
 * @param {string} proxyPath - The proxy path for the application.
 * @param {string} [componentBasePath=''] - The base path for components.
 * @param {string} [baseHost=''] - The base host URL.
 * @returns {string} The formatted source code with updated import paths.
 * @memberof clientFormatted
 */
const componentFormatted = (src, module, dists, proxyPath, componentBasePath = '', baseHost = '') => {
  dists.map(
    (dist) =>
      (src = src.replaceAll(
        `from '${dist.import_name}'`,
        `from '${baseHost}${proxyPath !== '/' ? `${proxyPath}` : ''}${dist.import_name_build}'`,
      )),
  );
  return src
    .replaceAll(
      `from '../`,
      `from '${baseHost}${proxyPath !== '/' ? `${proxyPath}/` : '/'}${
        componentBasePath === '' ? `` : `${componentBasePath}/`
      }`,
    )
    .replaceAll(
      `from './`,
      `from '${baseHost}${proxyPath !== '/' ? `${proxyPath}/` : '/'}${
        componentBasePath === '' ? `` : `${componentBasePath}/`
      }${module}/`,
    );
};

/**
 * Formats a view's source code by rewriting its import paths.
 * @param {string} src - The source code of the view.
 * @param {Array<object>} dists - An array of distribution objects with import names.
 * @param {string} proxyPath - The proxy path for the application.
 * @param {string} [baseHost=''] - The base host URL.
 * @returns {string} The formatted source code with updated import paths.
 * @memberof clientFormatted
 */
const viewFormatted = (src, dists, proxyPath, baseHost = '') => {
  dists.map(
    (dist) =>
      (src = src.replaceAll(dist.import_name, `${proxyPath !== '/' ? `${proxyPath}` : ''}${dist.import_name_build}`)),
  );
  const componentFromFormatted = `from '${baseHost}${proxyPath !== '/' ? `${proxyPath}/` : '/'}`;
  return src.replaceAll(`from './`, componentFromFormatted).replaceAll(`from '../`, componentFromFormatted);
};

export { srcFormatted, JSONweb, componentFormatted, viewFormatted };
