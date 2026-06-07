#! /usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../src/server/logger.js';
import { getCapVariableName } from '../src/client/components/core/CommonJs.js';
import {
  getPathsSSR,
  resolveDeployList,
  syncPrivateConf,
  syncDeployIdSources,
  buildTemplate,
  updatePrivateEngineTestRepo,
} from '../src/server/conf.js';
import { loadDeployCatalog } from '../src/server/catalog.js';
import UnderpostRepository from '../src/cli/repository.js';

const baseConfPath = './engine-private/conf/dd-cron/.env.production';
if (fs.existsSync(baseConfPath)) dotenv.config({ path: baseConfPath, override: true });

const logger = loggerFactory(import.meta);

const basePath = '../pwa-microservices-template';

/**
 * Assembles a single deploy id's public template under {@link basePath}: pulls in
 * its deploy-id-specific public sources, then mirrors the APIs, client components,
 * SSR assets, manifests, and packaging declared by its conf into the template repo.
 * @param {string} confName - A concrete deploy id (e.g. `dd-prototype`).
 */
const buildDeployTemplate = async (confName) => {
  const repoName = `engine-${confName.split('dd-')[1]}`;
  const catalog = await loadDeployCatalog(confName);

  if (catalog.sourceMoves.length) {
    UnderpostRepository.API.sparseCheckoutDirectory(`conf/${confName}`);
    if (catalog.sourceMoves.some(([src]) => !fs.existsSync(src))) UnderpostRepository.API.pullSourceRepo(repoName);
  }
  syncDeployIdSources(catalog.sourceMoves);

  const confDir = `./engine-private/conf/${confName}`;
  const DefaultConf = {
    server: JSON.parse(fs.readFileSync(`${confDir}/conf.server.json`, 'utf8')),
    client: JSON.parse(fs.readFileSync(`${confDir}/conf.client.json`, 'utf8')),
    ssr: JSON.parse(fs.readFileSync(`${confDir}/conf.ssr.json`, 'utf8')),
  };

  for (const host of Object.keys(DefaultConf.server)) {
    for (const path of Object.keys(DefaultConf.server[host])) {
      const { apis, ws } = DefaultConf.server[host][path];
      if (apis)
        for (const api of apis) {
          const apiSrc = `./src/api/${api}`;
          if (fs.existsSync(apiSrc)) {
            logger.info(`Build`, apiSrc);
            fs.copySync(apiSrc, `${basePath}/src/api/${api}`);
          }
          const serviceSrc = `./src/client/services/${api}`;
          if (fs.existsSync(serviceSrc)) {
            logger.info(`Build`, serviceSrc);
            fs.copySync(serviceSrc, `${basePath}/src/client/services/${api}`);
          }
        }

      if (ws && ws !== 'core' && ws !== 'default') {
        fs.copySync(`./src/ws/${ws}`, `${basePath}/src/ws/${ws}`);
      }
    }
  }

  for (const client of Object.keys(DefaultConf.client)) {
    const capName = getCapVariableName(client);
    for (const component of Object.keys(DefaultConf.client[client].components)) {
      const originPath = `./src/client/components/${component}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/components/${component}`);
      }
    }
    {
      const originPath = `./src/client/${capName}.index.js`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copyFileSync(originPath, `${basePath}/src/client/${capName}.index.js`);
      }
    }
    {
      const originPath = `./src/client/public/${client}`;
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/src/client/public/${client}`);
      }
    }
  }

  for (const client of Object.keys(DefaultConf.ssr)) {
    const ssrPaths = getPathsSSR(DefaultConf.ssr[client]);
    for (const originPath of ssrPaths) {
      if (fs.existsSync(originPath)) {
        logger.info(`Build`, originPath);
        fs.copySync(originPath, `${basePath}/${originPath}`);
      }
    }
  }

  if (!fs.existsSync(`${basePath}/.github/workflows`))
    fs.mkdirSync(`${basePath}/.github/workflows`, { recursive: true });

  const originPackageJson = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(`${basePath}/package.json`, 'utf8'));
  packageJson.name = repoName.replace('engine-', '');

  switch (confName) {
    case 'dd-cyberia': {
      fs.copyFileSync(`./bin/cyberia.js`, `${basePath}/bin/cyberia.js`);
      fs.copyFileSync(
        `./.github/workflows/publish.cyberia.ci.yml`,
        `${basePath}/.github/workflows/publish.cyberia.ci.yml`,
      );
      if (packageJson.bin) delete packageJson.bin.underpost;
      if (!packageJson.bin) packageJson.bin = {};
      packageJson.bin.cyberia = 'bin/index.js';
      packageJson.keywords = catalog.keywords;
      packageJson.description = catalog.description;
      const { CyberiaDependencies } = await import(`../src/api/cyberia-server-defaults/cyberia-server-defaults.js`);
      packageJson.dependencies = {
        ...originPackageJson.dependencies,
        ...CyberiaDependencies,
      };
      fs.writeFileSync(`${basePath}/bin/index.js`, fs.readFileSync(`./bin/cyberia.js`, 'utf8'), 'utf8');
      // Canonical Cyberia doc; engine-cyberia/README.md is a generated copy — never hand-edited.
      fs.writeFileSync(
        `${basePath}/README.md`,
        fs.readFileSync(`./src/client/public/cyberia-docs/CYBERIA.md`, 'utf8'),
        'utf8',
      );
      fs.copySync(`./hardhat`, `${basePath}/hardhat`);
      for (const path of catalog.templatePaths) fs.copySync(`.${path}`, `${basePath}${path}`);
      break;
    }
    default:
      break;
  }

  fs.writeFileSync(
    `${basePath}/package.json`,
    JSON.stringify(packageJson, null, 4).replaceAll('pwa-microservices-template', repoName),
    'utf8',
  );

  fs.copySync(`./src/cli`, `${basePath}/src/cli`);
  if (!fs.existsSync(`${basePath}/images`)) fs.mkdirSync(`${basePath}/images`);

  fs.copyFileSync(`./.github/workflows/${repoName}.ci.yml`, `${basePath}/.github/workflows/${repoName}.ci.yml`);
  fs.copyFileSync(`./.github/workflows/${repoName}.cd.yml`, `${basePath}/.github/workflows/${repoName}.cd.yml`);

  if (fs.existsSync(`./typedoc.${confName}.json`)) {
    fs.copyFileSync(`./typedoc.${confName}.json`, `${basePath}/typedoc.json`);
    fs.copyFileSync(`./typedoc.${confName}.json`, `${basePath}/typedoc.${confName}.json`);
  }

  if (fs.existsSync(`./manifests/deployment/${confName}-development`))
    fs.copySync(
      `./manifests/deployment/${confName}-development`,
      `${basePath}/manifests/deployment/${confName}-development`,
    );

  fs.copyFileSync(`./manifests/deployment/${confName}-development/proxy.yaml`, `${basePath}/proxy.yaml`);
  fs.copyFileSync(`./manifests/deployment/${confName}-development/deployment.yaml`, `${basePath}/deployment.yaml`);
  const pvPvcPath = `./manifests/deployment/${confName}-development/pv-pvc.yaml`;
  if (fs.existsSync(pvPvcPath)) fs.copyFileSync(pvPvcPath, `${basePath}/pv-pvc.yaml`);

  if (fs.existsSync(`./src/ws/${confName.split('-')[1]}`)) {
    fs.copySync(`./src/ws/${confName.split('-')[1]}`, `${basePath}/src/ws/${confName.split('-')[1]}`);
  }
  fs.writeFileSync(
    `${basePath}/.gitignore`,
    fs.readFileSync(`.gitignore`, 'utf8').split('# Ignore ERP / CRM custom prototypes src')[0],
  );
};

const program = new Command();

program
  .name('build')
  .description('Assemble deploy id public templates and sync their private configuration repos.')
  .argument('<conf-name>', 'Deploy id, comma-separated list, or the "dd" meta id (fans out via dd.router).')
  .argument('[env]', 'Environment label (informational; kept for CI invocation compatibility).')
  .option('--conf', 'Sync each deploy id private configuration repo and exit (no template assembly).')
  .option(
    '--no-template-rebuild',
    'Skip the from-scratch base template reconstruction before assembly (assemble onto the existing template).',
  )
  .option(
    '--update-private',
    'After assembling each deploy id, publish it to its private test source repo (underpostnet/engine-test-<id>) for isolated test deploys.',
    false,
  )
  .action(async (confName, env, options) => {
    const deployList = resolveDeployList(confName);
    logger.info('Build repository', { confName, basePath, deployList, conf: !!options.conf });

    if (options.conf) {
      for (const deployId of deployList) {
        const { privateConfPaths } = await loadDeployCatalog(deployId);
        syncPrivateConf(deployId, privateConfPaths);
      }
      return;
    }

    // Reconstruct the base template from 0 before assembly so no src from a previous
    // build run leaks into this one. Opt out with --no-template-rebuild.
    if (options.templateRebuild) await buildTemplate({ toPath: basePath });

    for (const deployId of deployList) {
      await buildDeployTemplate(deployId);
      // Publish the just-assembled tree to the deploy id's private test repo so a
      // pod started with `--private-test-repo` clones this work-in-progress source.
      if (options.updatePrivate) await updatePrivateEngineTestRepo(deployId);
    }
  });

await program.parseAsync();
