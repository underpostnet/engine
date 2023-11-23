'use strict';

const srcFormatted = (src) => src.replaceAll('html`', '`').replaceAll('css`', '`');

const pathViewFormatted = (path) => (path === '/' ? path : `${path}/`);

const JSONweb = (data) => 'JSON.parse(`' + JSON.stringify(data) + '`)';

const componentFormatted = (src, module, dists, proxyPath, componentBasePath = '') => {
  dists.map(
    (dist) =>
      (src = src.replaceAll(
        `from '${dist.import_name}'`,
        `from '${proxyPath !== '/' ? `${proxyPath}` : ''}${dist.import_name_build}'`
      ))
  );
  return src
    .replaceAll(
      `from '../`,
      `from '${proxyPath !== '/' ? `${proxyPath}/` : '/'}${componentBasePath === '' ? `` : `${componentBasePath}/`}`
    )
    .replaceAll(
      `from './`,
      `from '${proxyPath !== '/' ? `${proxyPath}/` : '/'}${
        componentBasePath === '' ? `` : `${componentBasePath}/`
      }${module}/`
    );
};

const viewFormatted = (src, dists, proxyPath) => {
  dists.map(
    (dist) =>
      (src = src.replaceAll(dist.import_name, `${proxyPath !== '/' ? `${proxyPath}` : ''}${dist.import_name_build}`))
  );
  return src.replaceAll(`from './`, `from '${proxyPath !== '/' ? `${proxyPath}/` : '/'}`);
};

export { srcFormatted, pathViewFormatted, JSONweb, componentFormatted, viewFormatted };
