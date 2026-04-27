'use strict';

/**
 * Module for building project documentation (JSDoc, Swagger, Coverage).
 * @module src/server/client-build-docs.js
 * @namespace clientBuildDocs
 */

import fs from 'fs-extra';
import { shellExec } from './process.js';
import { loggerFactory } from './logger.js';
import { JSONweb } from './client-formatted.js';
import { ssrFactory } from './ssr.js';

/**
 * Builds API documentation using Swagger
 * @function buildApiDocs
 * @memberof clientBuildDocs
 * @param {Object} options - Documentation build options
 * @param {string} options.host - The hostname for the API
 * @param {string} options.path - The base path for the API
 * @param {number} options.port - The port number for the API
 * @param {Object} options.metadata - Metadata for the API documentation
 * @param {Array<string>} options.apis - List of API modules to document
 * @param {string} options.publicClientId - Client ID for the public documentation
 * @param {string} options.rootClientPath - Root path for client files
 * @param {Object} options.packageData - Package.json data
 */
const buildApiDocs = async ({
  host,
  path,
  port,
  metadata = {},
  apis = [],
  publicClientId,
  rootClientPath,
  packageData,
}) => {
  const logger = loggerFactory(import.meta);
  const basePath = path === '/' ? `${process.env.BASE_API}` : `/${process.env.BASE_API}`;

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
            ? `http://localhost:${port}${path}${basePath}`
            : `https://${host}${path}${basePath}`,
        description: `${process.env.NODE_ENV} server`,
      },
    ],
    tags: [
      {
        name: 'user',
        description: 'User API operations',
      },
      {
        name: 'object-layer',
        description: 'Object Layer API operations',
      },
    ],
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
                  ledger: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', example: 'semi-fungible' },
                      address: { type: 'string', example: '0x0000000000000000000000000000000000000000' },
                      tokenId: { type: 'string', example: '' },
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
              cid: { type: 'string', example: '' },
              sha256: { type: 'string', example: 'abc123def456...' },
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

  logger.warn('build swagger api docs', doc.info);

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
  setTimeout(async () => {
    const { default: swaggerAutoGen } = await import('swagger-autogen');
    const outputFile = `./public/${host}${path === '/' ? path : `${path}/`}swagger-output.json`;
    const routes = [];
    for (const api of apis) {
      if (['user', 'object-layer'].includes(api)) routes.push(`./src/api/${api}/${api}.router.js`);
    }

    await swaggerAutoGen({ openapi: '3.0.0' })(outputFile, routes, doc);

    // Post-process: inject requestBody into operations — swagger-autogen silently
    // ignores #swagger.requestBody annotations and has no internal OAS-3 body support.
    if (fs.existsSync(outputFile)) {
      const swaggerJson = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      let patched = false;

      for (const [key, requestBody] of Object.entries(requestBodies)) {
        const [method, ...pathParts] = key.split(' ');
        const opPath = pathParts.join(' ');
        if (swaggerJson.paths?.[opPath]?.[method]) {
          swaggerJson.paths[opPath][method].requestBody = requestBody;
          // Remove any stale in:body entry from parameters (OAS 3.0 doesn't allow it)
          if (Array.isArray(swaggerJson.paths[opPath][method].parameters)) {
            swaggerJson.paths[opPath][method].parameters = swaggerJson.paths[opPath][method].parameters.filter(
              (p) => p.in !== 'body',
            );
          }
          patched = true;
        }
      }

      if (patched) {
        fs.writeFileSync(outputFile, JSON.stringify(swaggerJson, null, 2), 'utf8');
        // logger.warn('swagger post-process: requestBody injected', Object.keys(requestBodies));
      }
    }
  });
};

/**
 * Builds API documentation using TypeDoc (generates a modern static site from JSDoc-annotated JS).
 * Config is read from the base typedoc JSON, merged with runtime values, written to a temporary
 * file, and deleted after the build — the base config file is never mutated on disk.
 * @function buildJsDocs
 * @memberof clientBuildDocs
 * @param {Object} options - TypeDoc build options
 * @param {string} options.host - The hostname for the documentation
 * @param {string} options.path - The base path for the documentation
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {string} options.publicClientId - Client ID used to resolve the references directory
 * @param {Object} options.docs - Documentation config from server conf
 * @param {string} options.docs.jsJsonPath - Path to the base typedoc JSON config file
 * @param {string} options.docsDestination - Resolved output path for the generated docs
 */
const buildJsDocs = async ({ host, path, metadata = {}, publicClientId, docs, docsDestination }) => {
  const logger = loggerFactory(import.meta);

  const typedocConfigPath = docs.jsJsonPath;
  if (!fs.existsSync(typedocConfigPath)) {
    logger.warn('typedoc config not found, skipping', typedocConfigPath);
    return;
  }
  const baseConfig = JSON.parse(fs.readFileSync(typedocConfigPath, 'utf8'));
  logger.info('using typedoc config', typedocConfigPath);

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

  // Include extra reference documents as TypeDoc document pages
  // TypeDoc 0.28+: option is `projectDocuments`, not `documents`
  if (Array.isArray(docs.references) && docs.references.length > 0) {
    runtimeConfig.projectDocuments = docs.references.filter((p) => fs.existsSync(p));
    if (runtimeConfig.projectDocuments.length > 0) logger.info('typedoc documents', runtimeConfig.projectDocuments);
  }

  const tmpConfigPath = `.typedoc.tmp.json`;
  fs.writeFileSync(tmpConfigPath, JSON.stringify(runtimeConfig, null, 2), 'utf8');
  logger.warn('build typedoc view', docsDestination);

  shellExec(`node_modules/.bin/typedoc --options ${tmpConfigPath}`, { silent: true });

  fs.removeSync(tmpConfigPath);
};

/**
 * Builds test coverage documentation
 * @function buildCoverage
 * @memberof clientBuildDocs
 * @param {Object} options - Coverage build options
 * @param {Object} options.docs - Documentation config from server conf
 * @param {string} options.docs.coveragePath - Directory where coverage reports are generated
 * @param {string} options.docsDestination - Resolved output path where docs were built
 */
const buildCoverage = async ({ docs, docsDestination }) => {
  const logger = loggerFactory(import.meta);
  const { coveragePath, coverageOutputDir = 'coverage' } = docs;

  const coverageOutputPath = `${coveragePath}/coverage`;
  if (!fs.existsSync(coverageOutputPath)) {
    const pkgPath = `${coveragePath}/package.json`;
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.coverage) {
        logger.info('generating coverage report', coveragePath);
        shellExec(`cd ${coveragePath} && npm run coverage`, { silent: true });
      } else if (pkg.scripts && pkg.scripts.test) {
        logger.info('generating coverage via test', coveragePath);
        shellExec(`cd ${coveragePath} && npm test`, { silent: true });
      }
    }
  }

  if (fs.existsSync(coverageOutputPath) && fs.readdirSync(coverageOutputPath).length > 0) {
    const coverageBuildPath = `${docsDestination}${coverageOutputDir}`;
    fs.mkdirSync(coverageBuildPath, { recursive: true });
    // Hardhat 3 outputs HTML to coverage/html/; Hardhat 2 / c8 output directly to coverage/
    const coverageHtmlSubdir = `${coverageOutputPath}/html`;
    if (fs.existsSync(coverageHtmlSubdir) && fs.existsSync(`${coverageHtmlSubdir}/index.html`)) {
      fs.copySync(coverageHtmlSubdir, coverageBuildPath);
    } else {
      fs.copySync(coverageOutputPath, coverageBuildPath);
    }
    logger.warn('build coverage', coverageBuildPath);
  } else {
    logger.warn('no coverage output found, skipping', coverageOutputPath);
  }
};

/**
 * Main function to build all documentation
 * @function buildDocs
 * @memberof clientBuildDocs
 * @param {Object} options - Documentation build options
 * @param {string} options.host - The hostname
 * @param {string} options.path - The base path
 * @param {number} options.port - The port number
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {Array<string>} options.apis - List of API modules to document
 * @param {string} options.publicClientId - Client ID for the public documentation
 * @param {string} options.rootClientPath - Root path for client files
 * @param {Object} options.packageData - Package.json data
 * @param {Object} options.docs - Documentation config from server conf
 */
const buildDocs = async ({
  host,
  path,
  port,
  metadata = {},
  apis = [],
  publicClientId,
  rootClientPath,
  packageData,
  docs,
}) => {
  const pathPrefix = path === '/' ? '/' : `${path}/`;
  // TypeDoc output is versioned: served at /docs/engine/{version}/
  const version = (packageData?.version || '').replace(/^v/, '');
  const jsDocsDestination = `./public/${host}${pathPrefix}docs/engine/${version}/`;
  // Coverage output at /docs/coverage/ (or /docs/{coverageOutputDir}/)
  const coverageBaseDestination = `./public/${host}${pathPrefix}docs/`;
  await buildJsDocs({ host, path, metadata, publicClientId, docs, docsDestination: jsDocsDestination });
  await buildCoverage({ docs, docsDestination: coverageBaseDestination });
  await buildApiDocs({
    host,
    path,
    port,
    metadata,
    apis,
    publicClientId,
    rootClientPath,
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

export { buildDocs, buildSwaggerUiOptions };
