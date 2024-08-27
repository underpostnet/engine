'use strict';

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

const JSONweb = (data) => 'JSON.parse(`' + JSON.stringify(data) + '`)';

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

const viewFormatted = (src, dists, proxyPath, baseHost = '') => {
  dists.map(
    (dist) =>
      (src = src.replaceAll(dist.import_name, `${proxyPath !== '/' ? `${proxyPath}` : ''}${dist.import_name_build}`)),
  );
  const componentFromFormatted = `from '${baseHost}${proxyPath !== '/' ? `${proxyPath}/` : '/'}`;
  return src.replaceAll(`from './`, componentFromFormatted).replaceAll(`from '../`, componentFromFormatted);
};

export { srcFormatted, JSONweb, componentFormatted, viewFormatted };
