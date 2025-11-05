/**
 * Manages the client-side build process, including full builds and incremental builds.
 * @module server/client-build.js
 * @namespace clientBuild
 */

'use strict';

import fs from 'fs-extra';
import { srcFormatted, componentFormatted, viewFormatted, JSONweb } from './client-formatted.js';
import { loggerFactory } from './logger.js';
import {
  getCapVariableName,
  newInstance,
  orderArrayFromAttrInt,
  uniqueArray,
} from '../client/components/core/CommonJs.js';
import UglifyJS from 'uglify-js';
import { minify } from 'html-minifier-terser';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import * as dir from 'path';
import { shellExec } from './process.js';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { buildIcons } from './client-icons.js';
import Underpost from '../index.js';
import { buildDocs } from './client-build-docs.js';
import { ssrFactory } from './ssr.js';

dotenv.config();

// Static Site Generation (SSG)

/**
 * Recursively copies files from source to destination, but only files that don't exist in destination.
 * @function copyNonExistingFiles
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 * @returns {void}
 * @memberof clientBuild
 */
const copyNonExistingFiles = (src, dest) => {
  // Ensure source exists
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  // Get stats for source
  const srcStats = fs.statSync(src);

  // If source is a file, copy only if it doesn't exist in destination
  if (srcStats.isFile()) {
    if (!fs.existsSync(dest)) {
      const destDir = dir.dirname(dest);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
    }
    return;
  }

  // If source is a directory, create destination if it doesn't exist
  if (srcStats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Read all items in source directory
    const items = fs.readdirSync(src);

    // Recursively process each item
    for (const item of items) {
      const srcPath = dir.join(src, item);
      const destPath = dir.join(dest, item);
      copyNonExistingFiles(srcPath, destPath);
    }
  }
};

/**
 * @async
 * @function buildClient
 * @memberof clientBuild
 * @param {Object} options - Options for the build process.
 * @param {Array} options.liveClientBuildPaths - List of paths to build incrementally.
 * @param {Array} options.instances - List of instances to build.
 * @returns {Promise<void>} - Promise that resolves when the build is complete.
 * @throws {Error} - If the build fails.
 * @memberof clientBuild
 */
const buildClient = async (options = { liveClientBuildPaths: [], instances: [] }) => {
  const logger = loggerFactory(import.meta);
  const confClient = JSON.parse(fs.readFileSync(`./conf/conf.client.json`, 'utf8'));
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  const confSSR = JSON.parse(fs.readFileSync(`./conf/conf.ssr.json`, 'utf8'));
  const packageData = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
  const acmeChallengePath = `/.well-known/acme-challenge`;
  const publicPath = `./public`;

  /**
   * @async
   * @function buildAcmeChallengePath
   * @memberof clientBuild
   * @param {string} acmeChallengeFullPath - Full path to the acme-challenge directory.
   * @returns {void}
   * @throws {Error} - If the directory cannot be created.
   * @memberof clientBuild
   */
  const buildAcmeChallengePath = (acmeChallengeFullPath = '') => {
    fs.mkdirSync(acmeChallengeFullPath, {
      recursive: true,
    });
    fs.writeFileSync(`${acmeChallengeFullPath}/.gitkeep`, '', 'utf8');
  };

  /**
   * @async
   * @function fullBuild
   * @memberof clientBuild
   * @param {Object} options - Options for the full build process.
   * @param {string} options.path - Path to the client directory.
   * @param {Object} options.logger - Logger instance.
   * @param {string} options.client - Client name.
   * @param {Object} options.db - Database configuration.
   * @param {Array} options.dists - List of distributions to build.
   * @param {string} options.rootClientPath - Full path to the client directory.
   * @param {string} options.acmeChallengeFullPath - Full path to the acme-challenge directory.
   * @param {string} options.publicClientId - Public client ID.
   * @param {boolean} options.iconsBuild - Whether to build icons.
   * @param {Object} options.metadata - Metadata for the client.
   * @param {boolean} options.publicCopyNonExistingFiles - Whether to copy non-existing files from public directory.
   * @returns {Promise<void>} - Promise that resolves when the full build is complete.
   * @throws {Error} - If the full build fails.
   * @memberof clientBuild
   */
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
    publicCopyNonExistingFiles,
  }) => {
    logger.warn('Full build', rootClientPath);

    buildAcmeChallengePath(acmeChallengeFullPath);

    if (publicClientId && publicClientId.startsWith('html-website-templates')) {
      if (!fs.existsSync(`/home/dd/html-website-templates/`))
        shellExec(`cd /home/dd && git clone https://github.com/designmodo/html-website-templates.git`);
      if (!fs.existsSync(`${rootClientPath}/index.php`)) {
        fs.copySync(`/home/dd/html-website-templates/${publicClientId.split('-publicClientId-')[1]}`, rootClientPath);
        shellExec(`cd ${rootClientPath} && git init && git add . && git commit -m "Base template implementation"`);
        // git remote add origin git@github.com:<username>/<repo>.git
        fs.writeFileSync(`${rootClientPath}/.git/.htaccess`, `Deny from all`, 'utf8');
      }
      return;
    }

    fs.removeSync(rootClientPath);

    if (fs.existsSync(`./src/client/public/${publicClientId}`)) {
      if (iconsBuild === true) await buildIcons({ publicClientId, metadata });

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
          if (fs.statSync(dist.folder).isDirectory()) {
            fs.mkdirSync(`${rootClientPath}${dist.public_folder}`, { recursive: true });
            fs.copySync(dist.folder, `${rootClientPath}${dist.public_folder}`);
          } else {
            const folder = dist.public_folder.split('/');
            folder.pop();
            fs.mkdirSync(`${rootClientPath}${folder.join('/')}`, { recursive: true });
            fs.copyFileSync(dist.folder, `${rootClientPath}${dist.public_folder}`);
          }
        }
        if ('styles' in dist) {
          fs.mkdirSync(`${rootClientPath}${dist.public_styles_folder}`, { recursive: true });
          fs.copySync(dist.styles, `${rootClientPath}${dist.public_styles_folder}`);
        }
      }

    if (publicCopyNonExistingFiles)
      copyNonExistingFiles(`./src/client/public/${publicCopyNonExistingFiles}`, rootClientPath);
  };

  // { srcBuildPath, publicBuildPath }
  const enableLiveRebuild =
    options && options.liveClientBuildPaths && options.liveClientBuildPaths.length > 0 ? true : false;

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
        offlineBuild,
      } = confServer[host][path];
      if (singleReplica) continue;
      if (!confClient[client]) confClient[client] = {};
      const { components, dists, views, services, metadata, publicRef, publicCopyNonExistingFiles } =
        confClient[client];
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

      if (fullBuildEnabled)
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
          publicCopyNonExistingFiles,
        });

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
      const ssrPath = path === '/' ? path : `${path}/`;
      const Render = await ssrFactory();

      if (views) {
        const jsSrcPath = fs.existsSync(`./src/client/sw/${publicClientId}.sw.js`)
          ? `./src/client/sw/${publicClientId}.sw.js`
          : `./src/client/sw/default.sw.js`;

        const jsPublicPath = `${rootClientPath}/sw.js`;

        if (!(enableLiveRebuild && !options.liveClientBuildPaths.find((p) => p.srcBuildPath === jsSrcPath))) {
          const jsSrc = viewFormatted(await srcFormatted(fs.readFileSync(jsSrcPath, 'utf8')), dists, path, baseHost);

          fs.writeFileSync(
            jsPublicPath,
            minifyBuild || process.env.NODE_ENV === 'production' ? UglifyJS.minify(jsSrc).code : jsSrc,
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
            const title = metadata.title ? metadata.title : title;

            const canonicalURL = `https://${host}${path}${
              view.path === '/' ? (path === '/' ? '' : '/') : path === '/' ? `${view.path.slice(1)}/` : `${view.path}/`
            }`;

            let ssrHeadComponents = ``;
            let ssrBodyComponents = ``;
            if ('ssr' in view) {
              // https://metatags.io/
              if (process.env.NODE_ENV === 'production' && !confSSR[view.ssr].head.includes('Production'))
                confSSR[view.ssr].head.unshift('Production');

              for (const ssrHeadComponent of confSSR[view.ssr].head) {
                const SrrComponent = await ssrFactory(`./src/client/ssr/head/${ssrHeadComponent}.js`);

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
                const SrrComponent = await ssrFactory(`./src/client/ssr/body/${ssrBodyComponent}.js`);
                switch (ssrBodyComponent) {
                  case 'UnderpostDefaultSplashScreen':
                  case 'CyberiaDefaultSplashScreen':
                  case 'NexodevSplashScreen':
                  case 'DefaultSplashScreen':
                    if (backgroundImage)
                      ssrHeadComponents += SrrComponent({
                        ...metadata,
                        backgroundImage: (path === '/' ? path : `${path}/`) + backgroundImage,
                      });
                    else ssrHeadComponents += SrrComponent({ metadata });
                    break;

                  case 'CyberiaSplashScreenLore': {
                    ssrBodyComponents += SrrComponent({
                      ssrPath,
                      host,
                      path,
                      ttiLoadTimeLimit,
                    });
                    break;
                  }

                  default:
                    ssrBodyComponents += SrrComponent({
                      ssrPath,
                      host,
                      path,
                      ttiLoadTimeLimit,
                      version: Underpost.version,
                    });
                    break;
                }
              }
            }

            /** @type {import('sitemap').SitemapItem} */
            const siteMapLink = {
              url: `${path === '/' ? '' : path}${view.path}`,
              changefreq: 'daily',
              priority: 0.8,
            };
            siteMapLinks.push(siteMapLink);

            const htmlSrc = Render({
              title,
              buildId,
              ssrPath,
              ssrHeadComponents,
              ssrBodyComponents,
              renderPayload: {
                apiBaseProxyPath,
                apiBaseHost,
                apiBasePath: process.env.BASE_API,
                version: Underpost.version,
                dev: options.liveClientBuildPaths && options.liveClientBuildPaths.length > 0,
              },
              renderApi: {
                JSONweb,
              },
            });

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

      if (fullBuildEnabled && !enableLiveRebuild && !process.argv.includes('l') && docsBuild) {
        await buildDocs({
          host,
          path,
          port,
          metadata,
          apis,
          publicClientId,
          rootClientPath,
          packageData,
        });
      }

      if (client) {
        let PRE_CACHED_RESOURCES = [];

        if (views && offlineBuild && fs.existsSync(`${rootClientPath}/sw.js`)) {
          PRE_CACHED_RESOURCES = await fs.readdir(rootClientPath, { recursive: true });
          PRE_CACHED_RESOURCES = views
            .map((view) => `${path === '/' ? '' : path}${view.path}`)
            .concat(
              PRE_CACHED_RESOURCES.map((p) => `/${p}`).filter(
                (p) => p[1] !== '.' && !fs.statSync(`${rootClientPath}${p}`).isDirectory(),
              ),
            );
        }

        for (const pageType of ['offline', 'pages']) {
          if (confSSR[getCapVariableName(client)] && confSSR[getCapVariableName(client)][pageType]) {
            for (const page of confSSR[getCapVariableName(client)][pageType]) {
              const SsrComponent = await ssrFactory(`./src/client/ssr/${pageType}/${page.client}.js`);

              const htmlSrc = Render({
                title: page.title,
                ssrPath,
                ssrHeadComponents: '',
                ssrBodyComponents: SsrComponent(),
                renderPayload: {
                  apiBaseProxyPath,
                  apiBaseHost,
                  apiBasePath: process.env.BASE_API,
                  version: Underpost.version,
                  dev: options.liveClientBuildPaths && options.liveClientBuildPaths.length > 0,
                },
                renderApi: {
                  JSONweb,
                },
              });

              const buildPath = `${
                rootClientPath[rootClientPath.length - 1] === '/' ? rootClientPath.slice(0, -1) : rootClientPath
              }${page.path === '/' ? page.path : `${page.path}/`}`;

              PRE_CACHED_RESOURCES.push(`${path === '/' ? '' : path}${page.path === '/' ? '' : page.path}/index.html`);

              if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath, { recursive: true });

              const buildHtmlPath = `${buildPath}index.html`;

              logger.info('ssr page build', buildHtmlPath);

              fs.writeFileSync(
                buildHtmlPath,
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
        }

        {
          const renderPayload = {
            PRE_CACHED_RESOURCES: uniqueArray(PRE_CACHED_RESOURCES),
            PROXY_PATH: path,
          };
          fs.writeFileSync(
            `${rootClientPath}/sw.js`,
            `self.renderPayload = ${JSONweb(renderPayload)};
${fs.readFileSync(`${rootClientPath}/sw.js`, 'utf8')}`,
            'utf8',
          );
        }
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

export { buildClient, copyNonExistingFiles };
