'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, pathViewFormatted, viewFormatted } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import { cap, newInstance, titleFormatted } from '../client/components/core/CommonJs.js';
import UglifyJS from 'uglify-js';
import { minify } from 'html-minifier-terser';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import * as dir from 'path';
import { shellExec } from './process.js';
import swaggerAutoGen from 'swagger-autogen';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';

dotenv.config();

// Static Site Generation (SSG)

const buildAcmeChallengePath = (acmeChallengeFullPath = '') => {
  fs.mkdirSync(acmeChallengeFullPath, {
    recursive: true,
  });
  fs.writeFileSync(`${acmeChallengeFullPath}/.gitkeep`, '', 'utf8');
};

const fullBuild = async ({ logger, client, db, dists, rootClientPath, acmeChallengeFullPath }) => {
  logger.warn('Full build', rootClientPath);

  fs.removeSync(rootClientPath);

  buildAcmeChallengePath(acmeChallengeFullPath);

  if (fs.existsSync(`./src/client/public/${client}`)) {
    fs.copySync(
      `./src/client/public/${client}`,
      rootClientPath /* {
          filter: function (name) {
            console.log(name);
            return true;
          },
        } */,
    );
  } else if (fs.existsSync(`./engine-private/src/client/public/${client}`)) {
    switch (client) {
      case 'mysql_test':
        if (db) {
          fs.copySync(`./engine-private/src/client/public/${client}`, rootClientPath);
          fs.writeFileSync(
            `${rootClientPath}/index.php`,
            fs
              .readFileSync(`${rootClientPath}/index.php`, 'utf8')
              .replace('test_servername', 'localhost')
              .replace('test_username', db.user)
              .replace('test_password', db.password)
              .replace('test_dbname', db.name),
            'utf8',
          );
        }
        break;

      default:
        break;
    }
  }
  if (dists)
    for (const dist of dists) {
      if ('folder' in dist) {
        fs.mkdirSync(`${rootClientPath}${dist.public_folder}`, { recursive: true });
        fs.copySync(dist.folder, `${rootClientPath}${dist.public_folder}`);
      }
      if ('styles' in dist) {
        fs.mkdirSync(`${rootClientPath}${dist.public_styles_folder}`, { recursive: true });
        fs.copySync(dist.styles, `${rootClientPath}${dist.public_styles_folder}`);
      }
    }
};

const buildClient = async () => {
  const logger = loggerFactory(import.meta);
  const confClient = JSON.parse(fs.readFileSync(`./conf/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const confSSR = JSON.parse(fs.readFileSync(`./conf/conf.ssr.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;
  let currentPort = parseInt(process.env.PORT) + 1;
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { runtime, client, directory, disabledRebuild, minifyBuild, db, redirect, apis } = confServer[host][path];
      if (!confClient[client]) confClient[client] = {};
      const { components, dists, views, services, metadata } = confClient[client];
      if (metadata) {
        if (metadata.thumbnail) metadata.thumbnail = `${path}${metadata.thumbnail}`;
      }
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;
      const port = newInstance(currentPort);
      currentPort++;

      const acmeChallengeFullPath = directory
        ? `${directory}${acmeChallengePath}`
        : `${publicPath}/${host}${acmeChallengePath}`;

      buildAcmeChallengePath(acmeChallengeFullPath);

      if (redirect || disabledRebuild) continue;

      if (runtime === 'lampp' && client === 'wordpress') {
        shellExec(`node bin/install linux wordpress ${host}${path}`);
        shellExec(`node bin/db ${host}${path} create`);
        continue;
      }

      if (process.argv[2] !== 'l' && !(confServer[host]['/'] && confServer[host]['/'].lightBuild))
        await fullBuild({
          logger,
          client,
          db,
          dists,
          rootClientPath,
          acmeChallengeFullPath,
        });

      if (components)
        Object.keys(components).map((module) => {
          if (!fs.existsSync(`${rootClientPath}/components/${module}`))
            fs.mkdirSync(`${rootClientPath}/components/${module}`, { recursive: true });

          components[module].map((component) => {
            const jsSrc = componentFormatted(
              srcFormatted(fs.readFileSync(`./src/client/components/${module}/${component}.js`, 'utf8')),
              module,
              dists,
              path,
              'components',
            );
            fs.writeFileSync(
              `${rootClientPath}/components/${module}/${component}.js`,
              minifyBuild ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );
          });
        });

      if (services)
        for (const module of services) {
          if (!fs.existsSync(`${rootClientPath}/services/${module}`))
            fs.mkdirSync(`${rootClientPath}/services/${module}`, { recursive: true });

          const jsSrc = componentFormatted(
            srcFormatted(fs.readFileSync(`./src/client/services/${module}/${module}.service.js`, 'utf8')),
            module,
            dists,
            path,
            'services',
          );
          fs.writeFileSync(
            `${rootClientPath}/services/${module}/${module}.service.js`,
            minifyBuild ? UglifyJS.minify(jsSrc).code : jsSrc,
            'utf8',
          );
        }

      const buildId = `index.${client}`;
      const siteMapLinks = [];

      if (views)
        for (const view of views) {
          const buildPath = `${
            rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
          }${pathViewFormatted(view.path)}`;

          if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

          logger.info('View build', buildPath);

          const jsSrc = viewFormatted(
            srcFormatted(fs.readFileSync(`./src/client/${view.client}.js`, 'utf8')),
            dists,
            path,
          );

          const minifyJsSrc = UglifyJS.minify(jsSrc);

          // console.log(minifyJsSrc);

          fs.writeFileSync(`${buildPath}${buildId}.js`, minifyBuild ? minifyJsSrc.code : jsSrc, 'utf8');

          const title = `${metadata && metadata.title ? metadata.title : cap(client)}${
            view.title ? ` | ${view.title}` : view.path !== '/' ? ` | ${titleFormatted(view.path)}` : ''
          }`;

          const canonicalURL = `https://${host}${path}${
            view.path === '/' ? (path === '/' ? '' : '/') : path === '/' ? `${view.path.slice(1)}/` : `${view.path}/`
          }`;
          const ssrPath = path === '/' ? path : `${path}/`;

          let ssrHeadComponents = ``;
          let ssrBodyComponents = ``;
          if ('ssr' in view) {
            // https://metatags.io/

            for (const ssrHeadComponent of confSSR[view.ssr].head) {
              let SrrComponent;
              eval(srcFormatted(fs.readFileSync(`./src/client/ssr/head-components/${ssrHeadComponent}.js`, 'utf8')));

              switch (ssrHeadComponent) {
                case 'Pwa':
                  if (
                    metadata &&
                    path === '/' &&
                    view.path === '/' &&
                    // fs.existsSync(`./src/client/sw/${client}.sw.js`) &&
                    fs.existsSync(`./src/client/public/${client}/browserconfig.xml`) &&
                    fs.existsSync(`./src/client/public/${client}/site.webmanifest`)
                  ) {
                    // build webmanifest
                    fs.writeFileSync(
                      `${buildPath}site.webmanifest`,
                      fs.readFileSync(`./src/client/public/${client}/site.webmanifest`, 'utf8'),
                      'utf8',
                    );
                    // build browserconfig
                    fs.writeFileSync(
                      `${buildPath}browserconfig.xml`,
                      fs.readFileSync(`./src/client/public/${client}/browserconfig.xml`, 'utf8'),
                      'utf8',
                    );
                    // build service worker
                    if (fs.existsSync(`./src/client/sw/${client}.sw.js`)) {
                      const jsSrc = fs.readFileSync(`./src/client/sw/${client}.sw.js`, 'utf8');
                      const minifyJsSrc = UglifyJS.minify(jsSrc);
                      fs.writeFileSync(`${buildPath}sw.js`, minifyBuild ? minifyJsSrc.code : jsSrc, 'utf8');
                    }

                    ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                  }

                  break;
                case 'Seo':
                  if (metadata) {
                    ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                  }
                  break;
                case 'Microdata':
                  if (
                    fs.existsSync(`./src/client/public/${client}/microdata.json`) &&
                    path === '/' &&
                    view.path === '/'
                  ) {
                    const microdata = JSON.parse(
                      fs.readFileSync(`./src/client/public/${client}/microdata.json`, 'utf8'),
                    );
                    ssrHeadComponents += SrrComponent({ microdata });
                  }
                  break;
                case 'CryptokoynScripts':
                case 'DogmadualScripts':
                case 'NexodevScripts':
                case 'UnderpostScripts':
                case 'CyberiaScripts':
                  ssrHeadComponents += SrrComponent({ ssrPath });
                  break;
                default:
                  break;
              }
            }

            for (const ssrBodyComponent of confSSR[view.ssr].body) {
              let SrrComponent;
              eval(srcFormatted(fs.readFileSync(`./src/client/ssr/body-components/${ssrBodyComponent}.js`, 'utf8')));
              ssrBodyComponents += SrrComponent();
            }
          }

          let Render = () => '';
          eval(srcFormatted(fs.readFileSync(`./src/client/ssr/Render.js`, 'utf8')));

          const htmlSrc = Render({
            title,
            buildId,
            ssrPath,
            ssrHeadComponents,
            ssrBodyComponents,
          });

          /** @type {import('sitemap').SitemapItem} */
          const siteMapLink = {
            url: `${path === '/' ? '' : path}${view.path}`,
            changefreq: 'daily',
            priority: 0.8,
          };
          siteMapLinks.push(siteMapLink);

          fs.writeFileSync(
            `${buildPath}index.html`,
            minifyBuild
              ? await minify(htmlSrc, {
                  minifyCSS: true,
                  minifyJS: true,
                  collapseBooleanAttributes: true,
                  collapseInlineTagWhitespace: true,
                  collapseWhitespace: true,
                })
              : htmlSrc,
            'utf8',
          );
        }

      // Create a stream to write to
      /** @type {import('sitemap').SitemapStreamOptions} */
      const sitemapOptions = { hostname: `https://${host}`, xslUrl: `${path === '/' ? '' : path}/sitemap.xsl` };

      const siteMapStream = new SitemapStream(sitemapOptions);
      let siteMapSrc = await new Promise((resolve) =>
        streamToPromise(Readable.from(siteMapLinks).pipe(siteMapStream)).then((data) => resolve(data.toString())),
      );
      switch (client) {
        case 'underpost':
          siteMapSrc = siteMapSrc.replaceAll(
            `</urlset>`,
            `${fs.readFileSync(`./src/client/public/underpost/sitemap-template.txt`, 'utf8')} </urlset>`,
          );
          break;

        default:
          break;
      }
      // Return a promise that resolves with your XML string
      fs.writeFileSync(`${rootClientPath}/sitemap.xml`, siteMapSrc, 'utf8');
      fs.writeFileSync(
        `${rootClientPath}/sitemap.xsl`,
        fs.readFileSync(`${rootClientPath}/sitemap.xsl`, 'utf8').replaceAll('{{web-url}}', `https://${host}${path}`),
        'utf8',
      );

      if (process.argv[4] === 'docs') {
        const jsDocsConfig = JSON.parse(fs.readFileSync(`./jsdoc.json`, 'utf8'));
        jsDocsConfig.opts.destination = `./public/${host}${path}docs/`;
        fs.writeFileSync(`./jsdoc.json`, JSON.stringify(jsDocsConfig, null, 4), 'utf8');
        shellExec(`npm run docs`);

        const doc = {
          info: {
            swagger: '2.0',
            title: metadata?.title ? `${metadata.title}` : 'Api Docs',
            description: metadata?.description ? metadata.description : undefined,
          },
          host:
            process.env.NODE_ENV === 'development'
              ? `localhost:${port}${path}${process.env.BASE_API}`
              : `${host}${path}${process.env.BASE_API}`,
        };

        logger.warn('build swagger api docs', doc);

        const outputFile = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
        const routes = [];
        for (const api of apis) routes.push(`./src/api/${api}/${api}.router.js`);

        /* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

        await swaggerAutoGen(outputFile, routes, doc);
      }
      if (process.argv[2] === 'build-full-client-zip') {
        logger.warn('build zip', rootClientPath);

        if (!fs.existsSync('./build')) fs.mkdirSync('./build');

        const zip = new AdmZip();
        const files = await fs.readdir(rootClientPath, { recursive: true });

        for (const relativePath of files) {
          const filePath = dir.resolve(`${rootClientPath}/${relativePath}`);
          if (!fs.lstatSync(filePath).isDirectory()) {
            const folder = dir.relative(`public/${host}${path}`, dir.dirname(filePath));
            zip.addLocalFile(filePath, folder);
          }
        }

        const buildId = `${host}-${path.replaceAll('/', '')}`;

        logger.warn('write zip', `./build/${buildId}.zip`);

        zip.writeZip(`./build/${buildId}.zip`);
      }
    }
  }
};

export { buildClient };
