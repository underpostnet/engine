'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, viewFormatted } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import { cap, newInstance, orderArrayFromAttrInt, titleFormatted } from '../client/components/core/CommonJs.js';
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

const fullBuild = async ({ logger, client, db, dists, rootClientPath, acmeChallengeFullPath, publicClientId }) => {
  logger.warn('Full build', rootClientPath);

  fs.removeSync(rootClientPath);

  buildAcmeChallengePath(acmeChallengeFullPath);

  if (fs.existsSync(`./src/client/public/${publicClientId}`)) {
    fs.copySync(
      `./src/client/public/${publicClientId}`,
      rootClientPath /* {
          filter: function (name) {
            console.log(name);
            return true;
          },
        } */,
    );
  } else if (fs.existsSync(`./engine-private/src/client/public/${publicClientId}`)) {
    switch (publicClientId) {
      case 'mysql_test':
        if (db) {
          fs.copySync(`./engine-private/src/client/public/${publicClientId}`, rootClientPath);
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
    const paths = orderArrayFromAttrInt(Object.keys(confServer[host]), 'length', 'asc');
    for (const path of paths) {
      const { runtime, client, directory, disabledRebuild, minifyBuild, db, redirect, apis } = confServer[host][path];
      if (!confClient[client]) confClient[client] = {};
      const { components, dists, views, services, metadata, publicRef } = confClient[client];
      if (metadata) {
        if (metadata.thumbnail) metadata.thumbnail = `${path === '/' ? path : `${path}/`}${metadata.thumbnail}`;
      }
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;
      const port = newInstance(currentPort);
      const publicClientId = publicRef ? publicRef : client;
      // const baseHost = process.env.NODE_ENV === 'production' ? `https://${host}` : `http://localhost:${port}`;
      const baseHost = ''; // process.env.NODE_ENV === 'production' ? `https://${host}` : ``;
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

      if (process.argv[2] !== 'l' && !confServer[host][path].lightBuild)
        //  !(confServer[host]['/'] && confServer[host]['/'].lightBuild)
        await fullBuild({
          logger,
          client,
          db,
          dists,
          rootClientPath,
          acmeChallengeFullPath,
          publicClientId,
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
              baseHost,
            );
            fs.writeFileSync(
              `${rootClientPath}/components/${module}/${component}.js`,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
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
            baseHost,
          );
          fs.writeFileSync(
            `${rootClientPath}/services/${module}/${module}.service.js`,
            minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
            'utf8',
          );
        }

      const buildId = `${client}.index`;
      const siteMapLinks = [];

      if (views)
        for (const view of views) {
          const buildPath = `${
            rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
          }${view.path === '/' ? view.path : `${view.path}/`}`;

          if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

          logger.info('View build', buildPath);

          const jsSrc = viewFormatted(
            srcFormatted(fs.readFileSync(`./src/client/${view.client}.js`, 'utf8')),
            dists,
            path,
            baseHost,
          );

          fs.writeFileSync(
            `${buildPath}${buildId}.js`,
            minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
            'utf8',
          );

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
            if (process.env.NODE_ENV === 'production' && !confSSR[view.ssr].head.includes('Production'))
              confSSR[view.ssr].head.unshift('Production');

            for (const ssrHeadComponent of confSSR[view.ssr].head) {
              let SrrComponent;
              eval(srcFormatted(fs.readFileSync(`./src/client/ssr/head-components/${ssrHeadComponent}.js`, 'utf8')));

              switch (ssrHeadComponent) {
                case 'Pwa':
                  const validPwaBuild =
                    metadata &&
                    fs.existsSync(`./src/client/public/${publicClientId}/browserconfig.xml`) &&
                    fs.existsSync(`./src/client/public/${publicClientId}/site.webmanifest`);

                  if (view.path === '/' && validPwaBuild) {
                    // build webmanifest
                    const webmanifestJson = JSON.parse(
                      fs.readFileSync(`./src/client/public/${publicClientId}/site.webmanifest`, 'utf8'),
                    );
                    if (metadata.title) {
                      webmanifestJson.name = metadata.title;
                      webmanifestJson.short_name = metadata.title;
                    }
                    if (metadata.description) {
                      webmanifestJson.description = metadata.description;
                    }
                    if (metadata.themeColor) {
                      webmanifestJson.theme_color = metadata.themeColor;
                      webmanifestJson.background_color = metadata.themeColor;
                    }
                    fs.writeFileSync(
                      `${buildPath}site.webmanifest`,
                      JSON.stringify(webmanifestJson, null, 4).replaceAll(`: "/`, `: "${ssrPath}`),
                      'utf8',
                    );
                    // build browserconfig
                    fs.writeFileSync(
                      `${buildPath}browserconfig.xml`,
                      fs
                        .readFileSync(`./src/client/public/${publicClientId}/browserconfig.xml`, 'utf8')
                        .replaceAll(
                          `<TileColor></TileColor>`,
                          metadata.themeColor
                            ? `<TileColor>${metadata.themeColor}</TileColor>`
                            : `<TileColor>#e0e0e0</TileColor>`,
                        )
                        .replaceAll(`src="/`, `src="${ssrPath}`),
                      'utf8',
                    );
                    // build service worker
                    if (path === '/') {
                      const jsSrc = viewFormatted(
                        srcFormatted(
                          fs.existsSync(`./src/client/sw/${publicClientId}.sw.js`)
                            ? fs.readFileSync(`./src/client/sw/${publicClientId}.sw.js`, 'utf8')
                            : fs.readFileSync(`./src/client/sw/default.sw.js`, 'utf8'),
                        ),
                        dists,
                        path,
                        baseHost,
                      );
                      fs.writeFileSync(
                        `${buildPath}sw.js`,
                        minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
                        'utf8',
                      );
                    }

                    // Android play store example:
                    //
                    // "related_applications": [
                    //   {
                    //     "platform": "play",
                    //     "url": "https://play.google.com/store/apps/details?id=cheeaun.hackerweb"
                    //   }
                    // ],
                    // "prefer_related_applications": true
                  }
                  if (validPwaBuild) ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                  break;
                case 'Seo':
                  if (metadata) {
                    ssrHeadComponents += SrrComponent({ title, ssrPath, canonicalURL, ...metadata });
                  }
                  break;
                case 'Microdata':
                  if (
                    fs.existsSync(`./src/client/public/${publicClientId}/microdata.json`) // &&
                    // path === '/' &&
                    // view.path === '/'
                  ) {
                    const microdata = JSON.parse(
                      fs.readFileSync(`./src/client/public/${publicClientId}/microdata.json`, 'utf8'),
                    );
                    ssrHeadComponents += SrrComponent({ microdata });
                  }
                  break;
                default:
                  ssrHeadComponents += SrrComponent({ ssrPath });
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
            minifyBuild || process.env.NODE_ENV === 'production'
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
      if (siteMapLinks.length > 0) {
        const xslUrl = fs.existsSync(`${rootClientPath}/sitemap`)
          ? `${path === '/' ? '' : path}/sitemap.xsl`
          : undefined;
        // Create a stream to write to
        /** @type {import('sitemap').SitemapStreamOptions} */
        const sitemapOptions = { hostname: `https://${host}`, xslUrl };

        const siteMapStream = new SitemapStream(sitemapOptions);
        let siteMapSrc = await new Promise((resolve) =>
          streamToPromise(Readable.from(siteMapLinks).pipe(siteMapStream)).then((data) => resolve(data.toString())),
        );
        switch (publicClientId) {
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
        if (xslUrl)
          fs.writeFileSync(
            `${rootClientPath}/sitemap.xsl`,
            fs.readFileSync(`${rootClientPath}/sitemap`, 'utf8').replaceAll('{{web-url}}', `https://${host}${path}`),
            'utf8',
          );

        fs.writeFileSync(
          `${rootClientPath}/robots.txt`,
          `User-agent: *
Sitemap: https://${host}${path === '/' ? '' : path}/sitemap.xml`,
          'utf8',
        );
      }

      if (process.argv[4] === 'docs') {
        const jsDocsConfig = JSON.parse(fs.readFileSync(`./jsdoc.json`, 'utf8'));
        jsDocsConfig.opts.destination = `./public/${host}${path === '/' ? path : `${path}/`}docs/`;
        fs.writeFileSync(`./jsdoc.json`, JSON.stringify(jsDocsConfig, null, 4), 'utf8');
        shellExec(`npm run docs`);

        const doc = {
          info: {
            swagger: '2.0',
            title: metadata?.title ? `${metadata.title}` : 'Api Docs',
            description: metadata?.description ? metadata.description : undefined,
            version: '2.0.0',
          },
          schemes: ['https', 'http'], // by default: ['http']
          basePath: path === '/' ? `${process.env.BASE_API}` : `/${process.env.BASE_API}`,
          host: process.env.NODE_ENV === 'development' ? `localhost:${port}${path}` : `${host}${path}`,
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
