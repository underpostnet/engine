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
      if (['user'].includes(api)) routes.push(`./src/api/${api}/${api}.router.js`);
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
 */
const buildJsDocs = async ({ host, path, metadata = {}, publicClientId }) => {
  const logger = loggerFactory(import.meta);

  // Detect custom jsdoc.<deployId>.json by matching host against deploy server configs
  let customJsDocPath = '';
  const privateConfBase = `./engine-private/conf`;
  if (fs.existsSync(privateConfBase)) {
    for (const deployId of fs.readdirSync(privateConfBase)) {
      const candidatePath = `./jsdoc.${deployId}.json`;
      if (!fs.existsSync(candidatePath)) continue;

      // Check if this deployId's server config contains the current host
      const serverConfPath = `${privateConfBase}/${deployId}/conf.server.json`;
      if (fs.existsSync(serverConfPath)) {
        try {
          const serverConf = JSON.parse(fs.readFileSync(serverConfPath, 'utf8'));
          if (serverConf[host]) {
            customJsDocPath = candidatePath;
            logger.info('detected custom jsdoc config', { deployId, host, path: candidatePath });
            break;
          }
        } catch (e) {
          // skip invalid JSON
        }
      }

      // Fallback: also check dev server configs
      if (!customJsDocPath) {
        const devConfFiles = fs
          .readdirSync(`${privateConfBase}/${deployId}`)
          .filter((f) => f.match(/^conf\.server\.dev\..*\.json$/));
        for (const devFile of devConfFiles) {
          try {
            const devConf = JSON.parse(fs.readFileSync(`${privateConfBase}/${deployId}/${devFile}`, 'utf8'));
            if (devConf[host]) {
              customJsDocPath = candidatePath;
              logger.info('detected custom jsdoc config (dev)', { deployId, host, path: candidatePath });
              break;
            }
          } catch (e) {
            // skip invalid JSON
          }
        }
      }
      if (customJsDocPath) break;
    }
  }

  const jsDocSourcePath = customJsDocPath || `./jsdoc.json`;
  const jsDocsConfig = JSON.parse(fs.readFileSync(jsDocSourcePath, 'utf8'));
  logger.info('using jsdoc config', jsDocSourcePath);

  jsDocsConfig.opts.destination = `./public/${host}${path === '/' ? path : `${path}/`}docs/`;
  jsDocsConfig.opts.theme_opts.title = metadata?.title ? metadata.title : undefined;
  jsDocsConfig.opts.theme_opts.favicon = `./public/${host}${path === '/' ? '/' : `${path}/`}favicon.ico`;

  const tutorialsPath = `./src/client/public/${publicClientId}/docs/references`;
  if (fs.existsSync(tutorialsPath)) {
    jsDocsConfig.opts.tutorials = tutorialsPath;
    if (jsDocsConfig.opts.theme_opts.sections && !jsDocsConfig.opts.theme_opts.sections.includes('Tutorials')) {
      jsDocsConfig.opts.theme_opts.sections.push('Tutorials');
    }
    logger.info('build jsdoc tutorials', tutorialsPath);
  } else {
    delete jsDocsConfig.opts.tutorials;
  }

  fs.writeFileSync(`./jsdoc.json`, JSON.stringify(jsDocsConfig, null, 4), 'utf8');
  logger.warn('build jsdoc view', jsDocsConfig.opts.destination);

  shellExec(`npm run docs`, { silent: true });
};

/**
 * Builds test coverage documentation
 * @function buildCoverage
 * @memberof clientBuildDocs
 * @param {Object} options - Coverage build options
 * @param {string} options.host - The hostname for the coverage
 * @param {string} options.path - The base path for the coverage
 */
const buildCoverage = async ({ host, path }) => {
  const logger = loggerFactory(import.meta);
  const jsDocsConfig = JSON.parse(fs.readFileSync(`./jsdoc.json`, 'utf8'));

  if (!fs.existsSync(`./coverage`)) {
    shellExec(`npm test`);
  }

  const coverageBuildPath = `${jsDocsConfig.opts.destination}coverage`;
  fs.mkdirSync(coverageBuildPath, { recursive: true });
  fs.copySync(`./coverage`, coverageBuildPath);

  logger.warn('build coverage', coverageBuildPath);

  // Include hardhat coverage for cyberia-related builds
  const hardhatCoveragePath = `./hardhat/coverage`;
  if (fs.existsSync(hardhatCoveragePath) && fs.readdirSync(hardhatCoveragePath).length > 0) {
    const hardhatCoverageBuildPath = `${jsDocsConfig.opts.destination}hardhat-coverage`;
    fs.mkdirSync(hardhatCoverageBuildPath, { recursive: true });
    fs.copySync(hardhatCoveragePath, hardhatCoverageBuildPath);
    logger.warn('build hardhat coverage', hardhatCoverageBuildPath);
  } else if (fs.existsSync(`./hardhat/package.json`)) {
    // Attempt to generate hardhat coverage if the hardhat project exists
    try {
      const hardhatPkg = JSON.parse(fs.readFileSync(`./hardhat/package.json`, 'utf8'));
      if (hardhatPkg.scripts && hardhatPkg.scripts.coverage) {
        logger.info('generating hardhat coverage report');
        shellExec(`cd ./hardhat && npx hardhat coverage`, { silent: true });
        if (fs.existsSync(hardhatCoveragePath) && fs.readdirSync(hardhatCoveragePath).length > 0) {
          const hardhatCoverageBuildPath = `${jsDocsConfig.opts.destination}hardhat-coverage`;
          fs.mkdirSync(hardhatCoverageBuildPath, { recursive: true });
          fs.copySync(hardhatCoveragePath, hardhatCoverageBuildPath);
          logger.warn('build hardhat coverage (generated)', hardhatCoverageBuildPath);
        }
      }
    } catch (e) {
      logger.warn('hardhat coverage generation skipped', e.message);
    }
  }

  // Copy hardhat README and WHITE-PAPER as markdown docs
  const docsDestBase = jsDocsConfig.opts.destination;
  const hardhatReadmePath = `./hardhat/README.md`;
  const hardhatWhitePaperPath = `./hardhat/WHITE-PAPER.md`;
  if (fs.existsSync(hardhatReadmePath)) {
    fs.copySync(hardhatReadmePath, `${docsDestBase}hardhat-README.md`);
    logger.info('copied hardhat README.md to docs');
  }
  if (fs.existsSync(hardhatWhitePaperPath)) {
    fs.copySync(hardhatWhitePaperPath, `${docsDestBase}hardhat-WHITE-PAPER.md`);
    logger.info('copied hardhat WHITE-PAPER.md to docs');
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
}) => {
  await buildJsDocs({ host, path, metadata, publicClientId });
  await buildCoverage({ host, path });
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
