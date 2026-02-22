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
  const jsDocsConfig = JSON.parse(fs.readFileSync(`./jsdoc.json`, 'utf8'));

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

export { buildDocs };
