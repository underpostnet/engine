'use strict';

/**
 * Module for building project documentation (JSDoc, Swagger, Coverage).
 * @module src/client-builder/client-build-docs.js
 * @namespace clientBuildDocs
 */

import fs from 'fs-extra';
import * as dir from 'path';
import { shellExec } from '../server/runtime/process.js';
import { loggerFactory } from '../server/ops/logger.js';
import {
  coverageReportCandidates,
  coverageReportsFactory,
  coverageUnavailablePage,
  resolveCoverageReportPath,
} from '../server/build/coverage.js';
import {
  DEFAULT_TYPEDOC_CONFIG_PATH,
  apiDocsModulesFactory,
  docsDocumentsFactory,
  docsNavigationFactory,
  docsReferencesFactory,
  frontMatterOf,
  typedocOptionsFactory,
} from '../server/build/docs.js';
import { JSONweb } from './client-formatted.js';
import { documentationHref } from '../client/components/core/CommonJs.js';
import { ssrFactory } from './ssr.js';
import { API_BASE_PATH } from '../server/domain/api-contract.js';

/**
 * Builds API documentation using Swagger
 * @function buildApiDocs
 * @memberof clientBuildDocs
 * @param {Object} options - Documentation build options
 * @param {string} options.host - The hostname for the API
 * @param {string} options.path - The base path for the API
 * @param {number} options.port - The port number for the API
 * @param {string} [options.apiBaseHost] - Host serving the API when it is split from the client
 * @param {string} [options.apiBaseProxyPath] - Proxy path of the API runtime when it is split from the client
 * @param {Object} options.metadata - Metadata for the API documentation
 * @param {Array<string>} options.apis - The API modules the instance serves
 * @param {Object<string,string>} [options.consumes] - The served modules another domain owns; documented by that domain
 * @param {Object<string,string>} [options.apiExtensions] - api → project whose extension adds this host's routes to that API
 * @param {Object} options.docs - Documentation config from client conf
 * @param {Array<string>} [options.docs.api] - The modules to document, out of the served ones
 * @param {Object} options.packageData - Package.json data
 */
const buildApiDocs = async ({
  host,
  path,
  port,
  apiBaseHost,
  apiBaseProxyPath,
  metadata = {},
  apis = [],
  consumes = {},
  apiExtensions = {},
  docs,
  packageData,
}) => {
  const logger = loggerFactory(import.meta);
  const modules = apiDocsModulesFactory({ docs, apis, consumes });
  const undeclared = (docs?.api ?? []).filter((api) => !modules.includes(api));
  if (undeclared.length > 0) logger.warn('api docs name modules this instance does not serve', undeclared);
  const apiTitle = (api) =>
    api
      .split('-')
      .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
      .join(' ');
  // The spec is rendered by the client instance but exercised against the API runtime;
  // when the two are split the server url must follow the API, not the docs page.
  const apiPath = apiBaseProxyPath ? apiBaseProxyPath : path;
  const basePath = apiPath === '/' ? API_BASE_PATH : `/${API_BASE_PATH}`;

  const doc = {
    info: {
      version: packageData.version,
      title: metadata?.title ? `${metadata.title}` : 'REST API',
      description: metadata?.description ? metadata.description : '',
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === 'development'
            ? `http://${apiBaseHost ? apiBaseHost : `localhost:${port}`}${apiPath}${basePath}`
            : `https://${apiBaseHost ? apiBaseHost : host}${apiPath}${basePath}`,
        description: `${process.env.NODE_ENV} server`,
      },
    ],
    tags: modules.map((api) => ({ name: api, description: `${apiTitle(api)} API operations` })),
    components: {
      schemas: {
        userRequest: {
          type: 'object',
          required: ['username', 'password', 'email'],
          properties: {
            username: { type: 'string', example: 'user123' },
            password: { type: 'string', example: 'Password123!' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
          },
        },
        userResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                token: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7Il9pZCI6IjY2YzM3N2Y1N2Y5OWU1OTY5YjgxZG...',
                },
                user: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
                    email: { type: 'string', format: 'email', example: 'user@example.com' },
                    emailConfirmed: { type: 'boolean', example: false },
                    username: { type: 'string', example: 'user123' },
                    role: { type: 'string', example: 'user' },
                    profileImageId: { type: 'string', example: '66c377f57f99e5969b81de87' },
                  },
                },
              },
            },
          },
        },
        userUpdateResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
                email: { type: 'string', format: 'email', example: 'user@example.com' },
                emailConfirmed: { type: 'boolean', example: false },
                username: { type: 'string', example: 'user123222' },
                role: { type: 'string', example: 'user' },
                profileImageId: { type: 'string', example: '66c377f57f99e5969b81de87' },
              },
            },
          },
        },
        userGetResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
                email: { type: 'string', format: 'email', example: 'user@example.com' },
                emailConfirmed: { type: 'boolean', example: false },
                username: { type: 'string', example: 'user123222' },
                role: { type: 'string', example: 'user' },
                profileImageId: { type: 'string', example: '66c377f57f99e5969b81de87' },
              },
            },
          },
        },
        userLogInRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'Password123!' },
          },
        },
        userBadRequestResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: {
              type: 'string',
              example: 'Bad request. Please check your inputs, and try again',
            },
          },
        },
        objectLayerResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
                data: {
                  type: 'object',
                  properties: {
                    stats: {
                      type: 'object',
                      properties: {
                        effect: { type: 'number', example: 0 },
                        resistance: { type: 'number', example: 0 },
                        agility: { type: 'number', example: 0 },
                        range: { type: 'number', example: 0 },
                        intelligence: { type: 'number', example: 0 },
                        utility: { type: 'number', example: 0 },
                      },
                    },
                    item: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: 'skin-default' },
                        type: { type: 'string', example: 'skin' },
                        description: { type: 'string', example: 'Default skin layer' },
                        activable: { type: 'boolean', example: false },
                      },
                    },
                    render: {
                      type: 'object',
                      properties: {
                        cid: { type: 'string', example: '' },
                        metadataCid: { type: 'string', example: '' },
                      },
                    },
                  },
                },
                schemaVersion: { type: 'number', example: 1 },
                profile: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'cyberia' },
                    version: { type: 'number', example: 2 },
                  },
                },
                cid: { type: 'string', example: 'bafkreigwyjocgnki35vw52b37crc2nvc6cyw3pvvgckthvr5tvrfnk4wda' },
                contentHash: {
                  type: 'string',
                  example: 'd6c25c233548df6b6ee83bf8a22d36a2f0b16dbeb5309533d63d9d6256ab9618',
                },
              },
            },
          },
        },
        itemLedgerBindingResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              properties: {
                _id: { type: 'string', example: '66c377f57f99e5969b81de89' },
                objectLayerCid: {
                  type: 'string',
                  example: 'bafkreigwyjocgnki35vw52b37crc2nvc6cyw3pvvgckthvr5tvrfnk4wda',
                },
                itemId: { type: 'string', example: 'hatchet' },
                chainId: { type: 'number', example: 777771 },
                contractAddress: { type: 'string', example: '0x5fbdb2315678afecb367f032d93f642f64180aa3' },
                tokenId: {
                  type: 'string',
                  example: '97138353837259581315989870626849285076783737027509749410649399343999089350168',
                },
                standard: { type: 'string', example: 'ERC1155' },
                txHash: { type: 'string', example: '' },
                blockNumber: { type: 'number', example: 0 },
              },
            },
          },
        },
        objectLayerBadRequestResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: {
              type: 'string',
              example: 'Bad request. Please check your inputs, and try again',
            },
          },
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

  /**
   * swagger-autogen has no requestBody annotation support — it only handles
   * #swagger.parameters, responses, security, etc.  We define the requestBody
   * objects here and inject them into the generated JSON as a post-processing step.
   *
   * Each key is an "<method> <path>" pair matching the generated paths object.
   * The value is a valid OAS 3.0 requestBody object.
   */
  const requestBodies = {
    'post /user': {
      description: 'User registration data',
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/userRequest' },
        },
      },
    },
    'post /user/auth': {
      description: 'User login credentials',
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/userLogInRequest' },
        },
      },
    },
    'put /user/{id}': {
      description: 'User fields to update',
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/userRequest' },
        },
      },
    },
  };

  logger.warn('build swagger api docs', { ...doc.info, modules });

  // swagger-autogen@2.9.2 bug: getProducesTag, getConsumesTag, getResponsesTag missing __¬¬¬__ decode before eval
  fs.writeFileSync(
    `node_modules/swagger-autogen/src/swagger-tags.js`,
    fs
      .readFileSync(`node_modules/swagger-autogen/src/swagger-tags.js`, 'utf8')
      // getProducesTag and getConsumesTag: already decode &quot; but not __¬¬¬__
      .replaceAll(
        `data.replaceAll('\\n', ' ').replaceAll('\u201c', '\u201d')`,
        `data.replaceAll('\\n', ' ').replaceAll('\u201c', '\u201d').replaceAll('__\u00ac\u00ac\u00ac__', '"')`,
      )
      // getResponsesTag: decodes neither &quot; nor __¬¬¬__
      .replaceAll(
        `data.replaceAll('\\n', ' ');`,
        `data.replaceAll('\\n', ' ').replaceAll('__\u00ac\u00ac\u00ac__', '"');`,
      ),
    'utf8',
  );
  // Imported after the patch above, and awaited: the spec is part of the client build
  // output, so a bundle zipped before it landed shipped without one and the pod that
  // restored that bundle served no `api-docs`.
  const { default: swaggerAutoGen } = await import('swagger-autogen');
  const outputFile = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;

  // One run per router: the generator reads a router on its own, so a route comes out relative
  // to the router unless an annotation names its full path. The runtime mounts every router
  // under its module name, and an operation without a tag belongs to that module.
  // A host's own extension of an API is documented with it, even when another domain owns
  // the API itself.
  const extensionFiles = Object.fromEntries(
    Object.entries(apiExtensions)
      .filter(([api]) => apis.includes(api))
      .map(([api, project]) => [api, `./src/projects/${project}/${api}.extension.js`]),
  );
  const paths = {};
  for (const api of [...new Set([...modules, ...Object.keys(extensionFiles)])]) {
    const routerFiles = [
      modules.includes(api) ? `./src/api/${api}/${api}.router.js` : '',
      extensionFiles[api] ?? '',
    ].filter((file) => file && fs.existsSync(file));
    if (routerFiles.length === 0) continue;
    const partFile = `.swagger.${api}.tmp.json`;
    // The generator rewrites the document it is handed, reading each schema as an example of
    // itself; the document composed below keeps the schemas as authored, so it gets a copy.
    await swaggerAutoGen({ openapi: '3.0.0' })(partFile, routerFiles, structuredClone(doc));
    if (!fs.existsSync(partFile)) continue;
    const part = JSON.parse(fs.readFileSync(partFile, 'utf8'));
    fs.removeSync(partFile);
    for (const [route, operations] of Object.entries(part.paths ?? {})) {
      // The generator also emits a handler's parameter names as routes; a route starts with `/`.
      if (!route.startsWith('/')) continue;
      const mounted =
        route === `/${api}` || route.startsWith(`/${api}/`) ? route : `/${api}${route === '/' ? '' : route}`;
      for (const operation of Object.values(operations)) if (!operation.tags?.length) operation.tags = [api];
      paths[mounted] = { ...(paths[mounted] ?? {}), ...operations };
    }
  }

  // Inject requestBody into operations — swagger-autogen silently ignores #swagger.requestBody
  // annotations and has no internal OAS-3 body support.
  for (const [key, requestBody] of Object.entries(requestBodies)) {
    const [method, ...pathParts] = key.split(' ');
    const operation = paths[pathParts.join(' ')]?.[method];
    if (!operation) continue;
    operation.requestBody = requestBody;
    // Remove any stale in:body entry from parameters (OAS 3.0 doesn't allow it)
    if (Array.isArray(operation.parameters)) operation.parameters = operation.parameters.filter((p) => p.in !== 'body');
  }

  // The document carries the schemas its operations reference, and the ones those reference.
  const referenced = new Set();
  const collect = (value) => {
    for (const name of `${JSON.stringify(value)}`.matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g))
      referenced.add(name[1]);
  };
  collect(paths);
  for (let size = -1; size !== referenced.size;) {
    size = referenced.size;
    for (const name of referenced) if (doc.components.schemas[name]) collect(doc.components.schemas[name]);
  }
  const schemas = Object.fromEntries(Object.entries(doc.components.schemas).filter(([name]) => referenced.has(name)));

  fs.outputFileSync(
    outputFile,
    JSON.stringify({ openapi: '3.0.0', ...doc, paths, components: { ...doc.components, schemas } }, null, 2),
    'utf8',
  );
};

/**
 * Builds API documentation using TypeDoc (generates a modern static site from JSDoc-annotated JS).
 * Options come from the engine default config, overridden by the client `docs.typedoc` block,
 * merged with runtime values, written to a temporary file, and deleted after the build — no
 * config file is mutated on disk.
 * @function buildJsDocs
 * @memberof clientBuildDocs
 * @param {Object} options - TypeDoc build options
 * @param {string} options.host - The hostname for the documentation
 * @param {string} options.path - The base path for the documentation
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {Object} options.docs - Documentation config from client conf
 * @param {string} options.docsDestination - Resolved output path for the generated docs
 */
const buildJsDocs = async ({ host, path, metadata = {}, docs, docsDestination }) => {
  const logger = loggerFactory(import.meta);

  const baseConfig = typedocOptionsFactory({ docs });
  if (!baseConfig) {
    logger.warn('typedoc config not found, skipping', DEFAULT_TYPEDOC_CONFIG_PATH);
    return;
  }
  logger.info('using typedoc config', DEFAULT_TYPEDOC_CONFIG_PATH);

  // Build runtime config in memory — never mutate the base config file
  // tsconfig must be absolute so TypeDoc resolves it regardless of where the
  // tmp config file is located on disk.
  const runtimeConfig = {
    ...baseConfig,
    tsconfig: fs.realpathSync(baseConfig.tsconfig || './tsconfig.docs.json'),
    out: docsDestination,
    name: metadata?.title || baseConfig.name,
    favicon: `./public/${host}${path === '/' ? '/' : `${path}/`}favicon.ico`,
  };

  // Include the declared reference directories as TypeDoc document pages
  // TypeDoc 0.28+: option is `projectDocuments`, not `documents`
  const references = docsReferencesFactory(docs);
  if (references.length > 0) {
    runtimeConfig.projectDocuments = references;
    logger.info('typedoc documents', references);
  }

  const tmpConfigPath = `.typedoc.tmp.json`;
  fs.writeFileSync(tmpConfigPath, JSON.stringify(runtimeConfig, null, 2), 'utf8');
  logger.warn('build typedoc view', docsDestination);

  // Non-fatal like every other docs surface: a typedoc failure leaves the reference site
  // unpublished, it does not take a rollout down with it.
  const result = shellExec(`node_modules/.bin/typedoc --options ${tmpConfigPath}`, {
    silent: true,
    silentOnError: true,
  });

  fs.removeSync(tmpConfigPath);

  if (fs.existsSync(`${docsDestination}index.html`)) return;
  logger.warn('typedoc produced no HTML index', {
    docsDestination,
    code: result?.code,
    stderr: `${result?.stderr ?? ''}`.trim().split('\n').slice(-1)[0],
  });
};

/**
 * Publishes every coverage HTML report the deploy declares, each at `docs/coverage/<id>`.
 *
 * Never generates one: a report belongs to the test stage, which bundles it into the
 * deploy artifact (see {@link module:src/server/build/coverage.js}). A client build that
 * shelled out to `npm test` here spent minutes of a pod's build phase on a runner the
 * workload has no business holding, and every expected non-zero exit of that suite latched
 * `container-status=error`, failing the deployment monitor on a healthy rollout.
 * @function buildCoverage
 * @memberof clientBuildDocs
 * @param {Object} options - Coverage build options
 * @param {Object} options.docs - Documentation config from client conf
 * @param {Array<{id: string, label?: string, suite?: string, path?: string}>} [options.docs.coverage] - Declared reports
 * @param {string} options.docsDestination - Resolved output path where docs were built
 */
const buildCoverage = async ({ docs, docsDestination }) => {
  const logger = loggerFactory(import.meta);
  const reports = coverageReportsFactory(docs);
  if (reports.length === 0) return;
  // The route holds exactly the declared reports: one dropped from the conf leaves with it.
  fs.emptyDirSync(`${docsDestination}coverage`);
  for (const report of reports) {
    const coverageBuildPath = `${docsDestination}coverage/${report.id}`;
    const reportPath = resolveCoverageReportPath(report);

    if (!reportPath) {
      fs.outputFileSync(`${coverageBuildPath}/index.html`, coverageUnavailablePage(report), 'utf8');
      logger.warn('no coverage report bundled, publishing the unavailable page', {
        id: report.id,
        searched: coverageReportCandidates(report),
        published: coverageBuildPath,
      });
      continue;
    }

    fs.copySync(reportPath, coverageBuildPath);
    logger.warn('build coverage', coverageBuildPath);
  }
};

/**
 * The docs-view link a source document link resolves to. An authored link is relative to the
 * document that holds it, which is how it resolves in an editor and in the generated reference
 * site; published, the same target opens in the documentation view.
 * @function documentLinkFactory
 * @memberof clientBuildDocs
 * @param {import('../server/build/docs.js').DocsDocument} document - The document holding the link
 * @param {string} target - The link target, as authored
 * @param {string} proxyPath - The instance's proxy path
 * @returns {string|null} The rewritten link, or null when the target is not an authored document
 */
const documentLinkFactory = (document, target, proxyPath) => {
  if (!document.domain || /^[a-z]+:|^\/\//i.test(target) || target.startsWith('#')) return null;
  const [path, fragment = ''] = target.split('#');
  if (!path.toLowerCase().endsWith('.md')) return null;
  const resolved = dir
    .normalize(`${document.domain}/${document.category}/${path}`)
    .replace(/\.md$/i, '')
    .replace(/\\/g, '/');
  return documentationHref(proxyPath, resolved, fragment);
};

/**
 * Publishes the documents a client declares, and the navigation they make.
 *
 * A document is published at the path its identity gives it, `/docs/<domain>/<category>/<slug>.md`,
 * with its front matter removed and its links rewritten to the documentation view. The navigation
 * is written beside them as `/docs/manifest.json`, so the view derives its structure from the
 * documentation tree rather than from links inside the prose.
 * @function buildDocsReferences
 * @memberof clientBuildDocs
 * @param {Object} options - Reference publish options
 * @param {Object} options.docs - Documentation config from client conf
 * @param {string} options.docsDestination - Resolved `/docs/` output path of the host
 * @param {string} [options.proxyPath] - The instance's proxy path
 * @returns {{documents: number, navigation: object}} What was published
 */
const buildDocsReferences = async ({ docs, docsDestination, proxyPath = '/' }) => {
  const logger = loggerFactory(import.meta);
  const documents = docsDocumentsFactory(docs);
  if (documents.length === 0) return { documents: 0, navigation: { domains: [] } };

  // The route holds exactly the declared documents: one dropped from the conf leaves with it.
  for (const domain of new Set(documents.map((document) => document.domain || 'references')))
    fs.emptyDirSync(`${docsDestination}${domain}`);

  for (const document of documents) {
    const { body } = frontMatterOf(fs.readFileSync(document.path, 'utf8'));
    const published = body.replace(/\]\(<?([^)>]+)>?\)/g, (match, target) => {
      const link = documentLinkFactory(document, target, proxyPath);
      return link ? `](${link})` : match;
    });
    fs.outputFileSync(`${docsDestination}${document.url.replace(/^docs\//, '')}`, published.trimStart(), 'utf8');
  }

  const navigation = docsNavigationFactory(documents);
  fs.outputFileSync(`${docsDestination}manifest.json`, JSON.stringify(navigation, null, 2), 'utf8');
  logger.warn('build docs', {
    published: docsDestination,
    documents: documents.length,
    domains: navigation.domains.map((domain) => domain.id),
  });
  return { documents: documents.length, navigation };
};

/**
 * Main function to build all documentation
 * @function buildDocs
 * @memberof clientBuildDocs
 * @param {Object} options - Documentation build options
 * @param {string} options.host - The hostname
 * @param {string} options.path - The base path
 * @param {number} options.port - The port number
 * @param {string} [options.apiBaseHost] - Host serving the API when it is split from the client
 * @param {string} [options.apiBaseProxyPath] - Proxy path of the API runtime when it is split from the client
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {Array<string>} options.apis - The API modules the instance serves
 * @param {Object} options.packageData - Package.json data
 * @param {Object} options.docs - Documentation config from client conf
 */
const buildDocs = async ({
  host,
  path,
  port,
  apiBaseHost,
  apiBaseProxyPath,
  metadata = {},
  apis = [],
  consumes = {},
  apiExtensions = {},
  packageData,
  docs,
}) => {
  const pathPrefix = path === '/' ? '/' : `${path}/`;
  // TypeDoc output is versioned: served at /docs/engine/{version}/
  const version = (packageData?.version || '').replace(/^v/, '');
  const jsDocsDestination = `./public/${host}${pathPrefix}docs/engine/${version}/`;
  // Coverage reports at /docs/coverage/<id>/
  const coverageBaseDestination = `./public/${host}${pathPrefix}docs/`;
  await buildJsDocs({ host, path, metadata, docs, docsDestination: jsDocsDestination });
  await buildCoverage({ docs, docsDestination: coverageBaseDestination });
  await buildDocsReferences({ docs, docsDestination: coverageBaseDestination, proxyPath: pathPrefix });
  await buildApiDocs({
    host,
    path,
    port,
    apiBaseHost,
    apiBaseProxyPath,
    metadata,
    apis,
    consumes,
    apiExtensions,
    docs,
    packageData,
  });
};

/**
 * Builds Swagger UI customization options by rendering the SwaggerDarkMode SSR body component.
 * Returns the customCss and customJsStr strings required by swagger-ui-express to enable
 * a dark/light mode toggle button with a black/gray gradient dark theme.
 * @function buildSwaggerUiOptions
 * @memberof clientBuildDocs
 * @returns {Promise<{customCss: string, customJsStr: string}>} Swagger UI setup options
 */
const buildSwaggerUiOptions = async () => {
  const swaggerDarkMode = await ssrFactory('./src/client/ssr/body/SwaggerDarkMode.js');
  const { css, js } = swaggerDarkMode();
  return { customCss: css, customJsStr: js };
};

export { buildCoverage, buildDocs, buildDocsReferences, buildSwaggerUiOptions };
