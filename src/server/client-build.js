'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, viewFormatted, ssrFactory } from './client-formatted.js';
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
import { buildIcons, buildTextImg, getBufferPngText } from './client-icons.js';

dotenv.config();

// Static Site Generation (SSG)

const buildAcmeChallengePath = (acmeChallengeFullPath = '') => {
  fs.mkdirSync(acmeChallengeFullPath, {
    recursive: true,
  });
  fs.writeFileSync(`${acmeChallengeFullPath}/.gitkeep`, '', 'utf8');
};

const fullBuild = async ({
  path,
  logger,
  client,
  db,
  dists,
  rootClientPath,
  acmeChallengeFullPath,
  publicClientId,
  iconsBuild,
  metadata,
}) => {
  logger.warn('Full build', rootClientPath);

  fs.removeSync(rootClientPath);

  buildAcmeChallengePath(acmeChallengeFullPath);

  if (fs.existsSync(`./src/client/public/${publicClientId}`)) {
    if (iconsBuild) {
      const defaultBaseIconFolderPath = `src/client/public/${publicClientId}/assets/logo`;
      if (!fs.existsSync(defaultBaseIconFolderPath)) fs.mkdirSync(defaultBaseIconFolderPath, { recursive: true });
      const defaultBaseIconPath = `${defaultBaseIconFolderPath}/base-icon.png`;
      if (!fs.existsSync(defaultBaseIconPath))
        await buildTextImg(metadata.title, { debugFilename: defaultBaseIconPath });

      if (!fs.existsSync(`./src/client/public/${publicClientId}/site.webmanifest`))
        await buildIcons({ publicClientId, metadata });
    }
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
        } else logger.error('not provided db config');
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

const buildClient = async (options = { liveClientBuildPaths: [], instances: [] }) => {
  const logger = loggerFactory(import.meta);
  const confClient = JSON.parse(fs.readFileSync(`./conf/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const confSSR = JSON.parse(fs.readFileSync(`./conf/conf.ssr.json`, 'utf8'));
  const packageData = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;

  // { srcBuildPath, publicBuildPath }
  const enableLiveRebuild =
    options && options.liveClientBuildPaths && options.liveClientBuildPaths.length > 0 ? true : false;

  // common ssr components
  let jsSsrCommonComponents = '';
  {
    const files = await fs.readdir(`./src/client/ssr/common`);
    for (const relativePath of files)
      jsSsrCommonComponents += await srcFormatted(
        fs.readFileSync(`./src/client/ssr/common/${relativePath}`, 'utf8').split('export')[0],
      );
  }

  let currentPort = parseInt(process.env.PORT) + 1;
  for (const host of Object.keys(confServer)) {
    const paths = orderArrayFromAttrInt(Object.keys(confServer[host]), 'length', 'asc');
    for (const path of paths) {
      if (
        options &&
        options.instances &&
        options.instances.length > 0 &&
        !options.instances.find((i) => i.path === path && i.host === host)
      )
        continue;
      const {
        runtime,
        client,
        directory,
        disabledRebuild,
        minifyBuild,
        db,
        redirect,
        apis,
        iconsBuild,
        docsBuild,
        apiBaseProxyPath,
        apiBaseHost,
        ttiLoadTimeLimit,
        singleReplica,
      } = confServer[host][path];
      if (singleReplica) continue;
      if (!confClient[client]) confClient[client] = {};
      const { components, dists, views, services, metadata, publicRef } = confClient[client];
      let backgroundImage;
      if (metadata) {
        backgroundImage = metadata.backgroundImage;
        if (metadata.thumbnail) metadata.thumbnail = `${path === '/' ? path : `${path}/`}${metadata.thumbnail}`;
      }
      const rootClientPath = directory ? directory : `${publicPath}/${host}${path}`;
      const port = newInstance(currentPort);
      const publicClientId = publicRef ? publicRef : client;
      const fullBuildEnabled = !process.argv.includes('l') && !confServer[host][path].liteBuild && !enableLiveRebuild;
      // const baseHost = process.env.NODE_ENV === 'production' ? `https://${host}` : `http://localhost:${port}`;
      const baseHost = process.env.NODE_ENV === 'production' ? `https://${host}` : ``;
      // ''; // process.env.NODE_ENV === 'production' ? `https://${host}` : ``;
      currentPort++;

      const acmeChallengeFullPath = directory
        ? `${directory}${acmeChallengePath}`
        : `${publicPath}/${host}${acmeChallengePath}`;

      if (!enableLiveRebuild) buildAcmeChallengePath(acmeChallengeFullPath);

      if (redirect || disabledRebuild) continue;

      if (fullBuildEnabled) {
        //  !(confServer[host]['/'] && confServer[host]['/'].liteBuild)
        await fullBuild({
          path,
          logger,
          client,
          db,
          dists,
          rootClientPath,
          acmeChallengeFullPath,
          publicClientId,
          iconsBuild,
          metadata,
        });
        if (apis)
          for (const apiBuildScript of apis) {
            const scriptPath = `src/api/${apiBuildScript}/${apiBuildScript}.build.js`;
            if (fs.existsSync(`./${scriptPath}`)) {
              shellExec(`node ${scriptPath}`);
            }
          }
      }

      if (components)
        for (const module of Object.keys(components)) {
          if (!fs.existsSync(`${rootClientPath}/components/${module}`))
            fs.mkdirSync(`${rootClientPath}/components/${module}`, { recursive: true });

          for (const component of components[module]) {
            const jsSrcPath = `./src/client/components/${module}/${component}.js`;
            const jsPublicPath = `${rootClientPath}/components/${module}/${component}.js`;

            if (enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath)) continue;

            const jsSrc = componentFormatted(
              await srcFormatted(fs.readFileSync(jsSrcPath, 'utf8')),
              module,
              dists,
              path,
              'components',
              baseHost,
            );
            fs.writeFileSync(
              jsPublicPath,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );
          }
        }

      if (services) {
        for (const module of services) {
          if (!fs.existsSync(`${rootClientPath}/services/${module}`))
            fs.mkdirSync(`${rootClientPath}/services/${module}`, { recursive: true });

          if (fs.existsSync(`./src/client/services/${module}/${module}.service.js`)) {
            const jsSrcPath = `./src/client/services/${module}/${module}.service.js`;
            const jsPublicPath = `${rootClientPath}/services/${module}/${module}.service.js`;
            if (enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath)) continue;

            let jsSrc = componentFormatted(
              await srcFormatted(fs.readFileSync(jsSrcPath, 'utf8')),
              module,
              dists,
              path,
              'services',
              baseHost,
            );
            if (module === 'core' && (process.env.NODE_ENV === 'production' || process.argv.includes('static'))) {
              if (apiBaseHost)
                jsSrc = jsSrc.replace(
                  'const getBaseHost = () => location.host;',
                  `const getBaseHost = () => '${apiBaseHost}';`,
                );
              if (apiBaseProxyPath) {
                jsSrc = jsSrc.replace('${getProxyPath()}api/', `${apiBaseProxyPath}${process.env.BASE_API}/`);
                jsSrc = jsSrc.replace(
                  "const getWsBasePath = () => (getProxyPath() !== '/' ? `${getProxyPath()}socket.io/` : undefined);",
                  `const getWsBasePath = () => '${apiBaseProxyPath}socket.io/';`,
                );
              }
            }
            fs.writeFileSync(
              jsPublicPath,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );
          }
        }

        for (const module of services) {
          if (fs.existsSync(`./src/client/services/${module}/${module}.management.js`)) {
            const jsSrcPath = `./src/client/services/${module}/${module}.management.js`;
            const jsPublicPath = `${rootClientPath}/services/${module}/${module}.management.js`;
            if (enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath)) continue;

            const jsSrc = componentFormatted(
              await srcFormatted(fs.readFileSync(jsSrcPath, 'utf8')),
              module,
              dists,
              path,
              'services',
              baseHost,
            );
            fs.writeFileSync(
              jsPublicPath,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );
          }
        }
      }

      const buildId = `${client}.index`;
      const siteMapLinks = [];
      let Render = () => '';
      eval(await srcFormatted(fs.readFileSync(`./src/client/ssr/Render.js`, 'utf8')));

      if (views) {
        const buildJsSrcPage = async (jsSrcPath, jsPublicPath) => {
          if (!(enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath))) {
            let jsSrc = viewFormatted(await srcFormatted(fs.readFileSync(jsSrcPath, 'utf8')), dists, path, baseHost);
            if (jsSrc.split('/*imports*/')[1]) jsSrc = jsSrc.split('/*imports*/')[1];

            fs.writeFileSync(
              jsPublicPath,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );
          }
        };

        // service woker
        await buildJsSrcPage(
          fs.existsSync(`./src/client/sw/${publicClientId}.sw.js`)
            ? `./src/client/sw/${publicClientId}.sw.js`
            : `./src/client/sw/default.sw.js`,
          `${rootClientPath}/sw.js`,
        );

        // offline html
        {
          await buildJsSrcPage(
            fs.existsSync(`./src/client/ssr/offline/${publicClientId}.index.js`)
              ? `./src/client/ssr/offline/${publicClientId}.index.js`
              : `./src/client/ssr/offline/default.index.js`,
            `${rootClientPath}/offline.js`,
          );

          const htmlSrc = Render({
            title: metadata?.title ? metadata.title : cap(client),
            ssrPath: '/',
            ssrHeadComponents: '',
            ssrBodyComponents: '',
            baseSsrLib: jsSsrCommonComponents + fs.readFileSync(`${rootClientPath}/offline.js`, 'utf8'),
          });

          fs.writeFileSync(
            `${rootClientPath}/offline.html`,
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
        // ssr pages
        for (const page of await fs.readdir('./src/client/ssr/pages')) {
          await buildJsSrcPage(`./src/client/ssr/pages/${page}`, `${rootClientPath}/${page}`);

          const htmlSrc = Render({
            title: metadata?.title ? metadata.title : cap(client),
            ssrPath: '/',
            ssrHeadComponents: '',
            ssrBodyComponents: '',
            baseSsrLib: jsSsrCommonComponents + fs.readFileSync(`${rootClientPath}/${page}`, 'utf8'),
          });

          fs.writeFileSync(
            `${rootClientPath}/${page.slice(0, -3)}.html`,
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

        if (
          !(
            enableLiveRebuild &&
            !options.liveClientBuildPaths.find(
              (p) => p.srcBuildPath.startsWith(`./src/client/ssr`) || p.srcBuildPath.slice(-9) === '.index.js',
            )
          )
        )
          for (const view of views) {
            const buildPath = `${
              rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
            }${view.path === '/' ? view.path : `${view.path}/`}`;

            if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

            logger.info('View build', buildPath);

            const jsSrc = viewFormatted(
              await srcFormatted(fs.readFileSync(`./src/client/${view.client}.index.js`, 'utf8')),
              dists,
              path,
              baseHost,
            );

            fs.writeFileSync(
              `${buildPath}${buildId}.js`,
              minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
              'utf8',
            );

            // const title = `${metadata && metadata.title ? metadata.title : cap(client)}${
            //   view.title ? ` | ${view.title}` : view.path !== '/' ? ` | ${titleFormatted(view.path)}` : ''
            // }`;

            const title = `${
              view.title ? `${view.title} | ` : view.path !== '/' ? `${titleFormatted(view.path)} | ` : ''
            }${metadata && metadata.title ? metadata.title : cap(client)}`;

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
                const SrrComponent = await ssrFactory(
                  `./src/client/ssr/components/head/${ssrHeadComponent}.js`,
                  jsSsrCommonComponents,
                );

                switch (ssrHeadComponent) {
                  case 'Pwa':
                    const validPwaBuild =
                      metadata &&
                      fs.existsSync(`./src/client/public/${publicClientId}/browserconfig.xml`) &&
                      fs.existsSync(`./src/client/public/${publicClientId}/site.webmanifest`);

                    if (validPwaBuild) {
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
                    ssrHeadComponents += SrrComponent({ ssrPath, host, path });
                    break;
                }
              }

              for (const ssrBodyComponent of confSSR[view.ssr].body) {
                const SrrComponent = await ssrFactory(
                  `./src/client/ssr/components/body/${ssrBodyComponent}.js`,
                  jsSsrCommonComponents,
                );
                switch (ssrBodyComponent) {
                  case 'UnderpostDefaultSplashScreen':
                  case 'CyberiaDefaultSplashScreen':
                  case 'NexodevSplashScreen':
                  case 'DefaultSplashScreen':
                    if (backgroundImage) {
                      ssrHeadComponents += SrrComponent({
                        base64BackgroundImage: `data:image/${backgroundImage.split('.').pop()};base64,${fs
                          .readFileSync(backgroundImage)
                          .toString('base64')}`,
                      });
                      break;
                    } else {
                      ssrHeadComponents += SrrComponent({ metadata });
                      break;
                      const bufferBackgroundImage = await getBufferPngText({
                        text: ' ',
                        textColor: metadata?.themeColor ? metadata.themeColor : '#ececec',
                        size: '100x100',
                        bgColor: metadata?.themeColor ? metadata.themeColor : '#ececec',
                      });
                      ssrHeadComponents += SrrComponent({
                        base64BackgroundImage: `data:image/png;base64,${bufferBackgroundImage.toString('base64')}`,
                      });
                    }

                  case 'CyberiaSplashScreenLore': {
                    ssrBodyComponents += SrrComponent({
                      ssrPath,
                      host,
                      path,
                      ttiLoadTimeLimit,
                      storage: {
                        // 'space-background': fs.readFileSync('./src/client/public/cyberia/space-background', 'utf8'),
                        lore0: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore0.jpeg')
                          .toString('base64')}`,
                        lore1: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore1.jpeg')
                          .toString('base64')}`,
                        lore2: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore2.jpeg')
                          .toString('base64')}`,
                        lore3: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore3.jpeg')
                          .toString('base64')}`,
                        lore4: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore4.jpeg')
                          .toString('base64')}`,
                        lore5: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore5.jpeg')
                          .toString('base64')}`,
                        lore6: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore6.jpeg')
                          .toString('base64')}`,
                        lore7: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore7.jpeg')
                          .toString('base64')}`,
                        lore8: `data:image/jpeg;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/lore/lore8.jpeg')
                          .toString('base64')}`,
                        ['arrow-left']: `data:image/png;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/ui-icons/arrow-left.png')
                          .toString('base64')}`,
                        ['arrow-right']: `data:image/png;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/ui-icons/arrow-right.png')
                          .toString('base64')}`,
                        ['fullscreen']: `data:image/png;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/ui-icons/fullscreen.png')
                          .toString('base64')}`,
                        ['cyberia-logo']: `data:image/png;base64,${fs
                          .readFileSync('./src/client/public/cyberia/assets/util/cyberia-retro-banner.png')
                          .toString('base64')}`,
                      },
                    });
                    break;
                  }

                  default:
                    ssrBodyComponents += SrrComponent({ ssrPath, host, path, ttiLoadTimeLimit });
                    break;
                }
              }
            }
            const htmlSrc = Render({
              title,
              buildId,
              ssrPath,
              ssrHeadComponents,
              ssrBodyComponents,
              baseSsrLib: jsSsrCommonComponents,
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
      }
      if (!enableLiveRebuild && siteMapLinks.length > 0) {
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

      if (!enableLiveRebuild && !process.argv.includes('l') && !process.argv.includes('deploy') && docsBuild) {
        // https://www.pullrequest.com/blog/leveraging-jsdoc-for-better-code-documentation-in-javascript/
        // https://jsdoc.app/about-configuring-jsdoc
        // https://jsdoc.app/ Block tags

        const jsDocsConfig = JSON.parse(fs.readFileSync(`./jsdoc.json`, 'utf8'));
        jsDocsConfig.opts.destination = `./public/${host}${path === '/' ? path : `${path}/`}docs/`;
        jsDocsConfig.opts.theme_opts.title = metadata && metadata.title ? metadata.title : undefined;
        jsDocsConfig.opts.theme_opts.favicon = `./public/${host}${path === '/' ? path : `${path}/favicon.ico`}`;
        fs.writeFileSync(`./jsdoc.json`, JSON.stringify(jsDocsConfig, null, 4), 'utf8');
        logger.warn('build jsdoc view', jsDocsConfig.opts.destination);
        shellExec(`npm run docs`, { silent: true });

        // coverage
        if (!fs.existsSync(`./coverage`)) {
          shellExec(`npm test`);
        }
        const coverageBuildPath = `${jsDocsConfig.opts.destination}/coverage`;
        fs.mkdirSync(coverageBuildPath, { recursive: true });
        fs.copySync(`./coverage`, coverageBuildPath);

        // uml
        shellExec(`node bin/deploy uml ${host} ${path}`);

        // https://swagger-autogen.github.io/docs/

        const basePath = path === '/' ? `${process.env.BASE_API}` : `/${process.env.BASE_API}`;

        const doc = {
          info: {
            version: packageData.version, // by default: '1.0.0'
            title: metadata?.title ? `${metadata.title}` : 'REST API', // by default: 'REST API'
            description: metadata?.description ? metadata.description : '', // by default: ''
          },
          servers: [
            {
              url:
                process.env.NODE_ENV === 'development'
                  ? `http://localhost:${port}${path}${basePath}`
                  : `https://${host}${path}${basePath}`, // by default: 'http://localhost:3000'
              description: `${process.env.NODE_ENV} server`, // by default: ''
            },
          ],
          tags: [
            // by default: empty Array
            {
              name: 'user', // Tag name
              description: 'User API operations', // Tag description
            },
          ],
          components: {
            schemas: {
              userRequest: {
                username: 'user123',
                password: 'Password123',
                email: 'user@example.com',
              },
              userResponse: {
                status: 'success',
                data: {
                  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjY2YzM3N2Y1N2Y5OWU1OTY5YjgxZG...',
                  user: {
                    _id: '66c377f57f99e5969b81de89',
                    email: 'user@example.com',
                    emailConfirmed: false,
                    username: 'user123',
                    role: 'user',
                    profileImageId: '66c377f57f99e5969b81de87',
                  },
                },
              },
              userUpdateResponse: {
                status: 'success',
                data: {
                  _id: '66c377f57f99e5969b81de89',
                  email: 'user@example.com',
                  emailConfirmed: false,
                  username: 'user123222',
                  role: 'user',
                  profileImageId: '66c377f57f99e5969b81de87',
                },
              },
              userGetResponse: {
                status: 'success',
                data: {
                  _id: '66c377f57f99e5969b81de89',
                  email: 'user@example.com',
                  emailConfirmed: false,
                  username: 'user123222',
                  role: 'user',
                  profileImageId: '66c377f57f99e5969b81de87',
                },
              },
              userLogInRequest: {
                email: 'user@example.com',
                password: 'Password123',
              },
              userBadRequestResponse: {
                status: 'error',
                message: 'Bad request. Please check your inputs, and try again',
              },
            },
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
              },
            },
          },
        };

        // plantuml
        logger.info('copy plantuml', `${rootClientPath}/docs/plantuml`);
        fs.copySync(`./src/client/public/default/plantuml`, `${rootClientPath}/docs/plantuml`);

        logger.warn('build swagger api docs', doc.info);

        const outputFile = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
        const routes = [];
        for (const api of apis) {
          if (['user'].includes(api)) routes.push(`./src/api/${api}/${api}.router.js`);
        }

        /* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

        await swaggerAutoGen({ openapi: '3.0.0' })(outputFile, routes, doc);
      }
      if (!enableLiveRebuild && process.argv.includes('zip')) {
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
