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
 * Builds JSDoc documentation
 * @function buildJsDocs
 * @memberof clientBuildDocs
 * @param {Object} options - JSDoc build options
 * @param {string} options.host - The hostname for the documentation
 * @param {string} options.path - The base path for the documentation
 * @param {Object} options.metadata - Metadata for the documentation
 * @param {string} options.publicClientId - Client ID used to resolve the tutorials/references directory
 * @param {Object} options.docs - Documentation config from server conf
 * @param {string} options.docs.jsJsonPath - Path to the JSDoc JSON config file
 */
const buildJsDocs = async ({ host, path, metadata = {}, publicClientId, docs }) => {
  const logger = loggerFactory(import.meta);

  const jsDocSourcePath = docs.jsJsonPath;
  if (!fs.existsSync(jsDocSourcePath)) {
    logger.warn('jsdoc config not found, skipping', jsDocSourcePath);
    return;
  }
  const jsDocsConfig = JSON.parse(fs.readFileSync(jsDocSourcePath, 'utf8'));
  logger.info('using jsdoc config', jsDocSourcePath);

  jsDocsConfig.opts.destination = `./public/${host}${path === '/' ? path : `${path}/`}docs/`;
  jsDocsConfig.opts.theme_opts.title = metadata?.title ? metadata.title : undefined;
  jsDocsConfig.opts.theme_opts.favicon = `./public/${host}${path === '/' ? '/' : `${path}/`}favicon.ico`;

  const tutorialsPath = `./src/client/public/${publicClientId}/docs/references`;

  if (Array.isArray(docs.references) && docs.references.length > 0) {
    fs.mkdirSync(tutorialsPath, { recursive: true });
    for (const refPath of docs.references) {
      if (fs.existsSync(refPath)) {
        const fileName = refPath.split('/').pop();
        fs.copySync(refPath, `${tutorialsPath}/${fileName}`);
        logger.info('copied reference to tutorials', refPath);
      }
    }
  }

  if (fs.existsSync(tutorialsPath) && fs.readdirSync(tutorialsPath).length > 0) {
    jsDocsConfig.opts.tutorials = tutorialsPath;
    if (jsDocsConfig.opts.theme_opts.sections && !jsDocsConfig.opts.theme_opts.sections.includes('Tutorials')) {
      jsDocsConfig.opts.theme_opts.sections.push('Tutorials');
    }
    logger.info('build jsdoc tutorials', tutorialsPath);
  } else {
    delete jsDocsConfig.opts.tutorials;
  }

  fs.writeFileSync(jsDocSourcePath, JSON.stringify(jsDocsConfig, null, 4), 'utf8');
  logger.warn('build jsdoc view', jsDocsConfig.opts.destination);

  shellExec(`npx jsdoc -c ${jsDocSourcePath}`, { silent: true });
};

/**
 * Builds test coverage documentation
 * @function buildCoverage
 * @memberof clientBuildDocs
 * @param {Object} options - Coverage build options
 * @param {string} options.host - The hostname for the coverage
 * @param {string} options.path - The base path for the coverage
 * @param {Object} options.docs - Documentation config from server conf
 * @param {string} options.docs.coveragePath - Directory where to run npm run coverage
 */
const buildCoverage = async ({ host, path, docs }) => {
  const logger = loggerFactory(import.meta);
  const jsDocSourcePath = docs.jsJsonPath;
  const jsDocsConfig = JSON.parse(fs.readFileSync(jsDocSourcePath, 'utf8'));
  const coveragePath = docs.coveragePath;
  const coverageOutputDir = docs.coverageOutputDir || 'coverage';

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
    const coverageBuildPath = `${jsDocsConfig.opts.destination}${coverageOutputDir}`;
    fs.mkdirSync(coverageBuildPath, { recursive: true });
    fs.copySync(coverageOutputPath, coverageBuildPath);
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
  await buildJsDocs({ host, path, metadata, publicClientId, docs });
  await buildCoverage({ host, path, docs });
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
