import fs from 'fs-extra';

import { loggerFactory } from '../src/server/logger.js';
import {
  cap,
  getCapVariableName,
  getDirname,
  newInstance,
  uniqueArray,
} from '../src/client/components/core/CommonJs.js';
import { shellCd, shellExec } from '../src/server/process.js';
import walk from 'ignore-walk';
import { validateTemplatePath } from '../src/server/conf.js';
import dotenv from 'dotenv';

const logger = loggerFactory(import.meta);

dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });

logger.info('argv', process.argv);

let [exe, dir, type] = process.argv;
let rawPath = process.argv[3].replaceAll(`'`, '');
let toPath = process.argv[4].replaceAll(`'`, '');
let path = `${rawPath}`.split('/');
path.pop();
path = path.join('/');
const file = `${rawPath}`.split('/').pop();
const ext = file.split('.')[1];
let name = getCapVariableName(file.split('.')[0]);
let content = '';

logger.info('File metadata', { path, file, ext, name });

try {
  switch (type) {
    case 'update-template':
    case 'copy-src':
      console.log({ rawPath, toPath });

      let result = await new Promise((resolve) =>
        walk(
          {
            path: rawPath, // root dir to start in. defaults to process.cwd()
            ignoreFiles: [`.gitignore`], // list of filenames. defaults to ['.ignore']
            includeEmpty: false, // true to include empty dirs, default false
            follow: false, // true to follow symlink dirs, default false
          },
          (...args) => resolve(args[1]),
        ),
      );

      result = result.filter((path) => !path.startsWith('.git'));

      console.log('copy paths', result);

      if (type === 'update-template') {
        if (!fs.existsSync(toPath))
          shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/pwa-microservices-template`);
        else {
          shellExec(`cd ${toPath} && git reset && git checkout . && git clean -f -d`);
          shellExec(`underpost pull ${toPath} ${process.env.GITHUB_USERNAME}/pwa-microservices-template`);
          shellExec(`sudo rm -rf ${toPath}/engine-private`);
          shellExec(`sudo rm -rf ${toPath}/logs`);
        }
      } else {
        fs.removeSync(toPath);
      }

      for (const copyPath of result) {
        if (copyPath === 'NaN') continue;
        const folder = getDirname(`${toPath}/${copyPath}`);
        const absolutePath = `${rawPath}/${copyPath}`;

        if (type === 'update-template' && !validateTemplatePath(absolutePath)) continue;

        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        logger.info('build', `${toPath}/${copyPath}`);

        fs.copyFileSync(absolutePath, `${toPath}/${copyPath}`);
      }

      if (type === 'update-template') {
        fs.copySync(`./.vscode`, `../pwa-microservices-template/.vscode`);
        // fs.copySync(`./.github`, `../pwa-microservices-template/.github`);
        fs.copySync(`./src/client/public/default`, `../pwa-microservices-template/src/client/public/default`);

        for (const checkoutPath of ['README.md', 'package.json'])
          shellExec(`cd ../pwa-microservices-template && git checkout ${checkoutPath}`);

        for (const deletePath of [
          './.github',
          './manifests/deployment/dd-lampp-development',
          './manifests/deployment/dd-cyberia-development',
          './manifests/deployment/dd-core-development',
          './manifests/deployment/dd-template-development',
          './src/server/object-layer.js',
          './src/server/atlas-sprite-sheet-generator.js',
          'bin/cyberia.js',
        ]) {
          if (fs.existsSync(deletePath)) fs.removeSync('../pwa-microservices-template/' + deletePath);
        }

        fs.mkdirSync(`../pwa-microservices-template/.github/workflows`, {
          recursive: true,
        });
        for (const _path of [
          `./.github/workflows/pwa-microservices-template-page.cd.yml`,
          `./.github/workflows/pwa-microservices-template-test.ci.yml`,
          `./.github/workflows/npmpkg.ci.yml`,
          `./.github/workflows/ghpkg.ci.yml`,
          `./.github/workflows/gitlab.ci.yml`,
          `./.github/workflows/publish.ci.yml`,
          `./.github/workflows/release.cd.yml`,
          './src/ws/IoInterface.js',
          './src/ws/IoServer.js',
        ])
          fs.copyFileSync(_path, `../pwa-microservices-template/${_path}`);

        const originPackageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        const templatePackageJson = JSON.parse(fs.readFileSync('../pwa-microservices-template/package.json', 'utf8'));

        const name = templatePackageJson.name;
        const description = templatePackageJson.description;
        const dev = templatePackageJson.scripts.dev;
        const build = templatePackageJson.scripts.build;

        templatePackageJson.dependencies = originPackageJson.dependencies;
        templatePackageJson.devDependencies = originPackageJson.devDependencies;
        templatePackageJson.version = originPackageJson.version;
        templatePackageJson.scripts = originPackageJson.scripts;
        templatePackageJson.overrides = originPackageJson.overrides;
        templatePackageJson.name = name;
        templatePackageJson.description = description;
        // templatePackageJson.scripts.dev = dev;
        // templatePackageJson.scripts.build = build;
        templatePackageJson.keywords = uniqueArray(
          ['pwa', 'microservices', 'template', 'builder'].concat(templatePackageJson.keywords),
        );
        delete templatePackageJson.scripts['update-template'];
        fs.writeFileSync(
          '../pwa-microservices-template/package.json',
          JSON.stringify(templatePackageJson, null, 4),
          'utf8',
        );
        const originPackageLockJson = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));

        const templatePackageLockJson = JSON.parse(
          fs.readFileSync('../pwa-microservices-template/package-lock.json', 'utf8'),
        );

        const originBasePackageLock = newInstance(templatePackageLockJson.packages['']);
        templatePackageLockJson.name = name;
        templatePackageLockJson.version = originPackageLockJson.version;
        templatePackageLockJson.packages = originPackageLockJson.packages;
        templatePackageLockJson.packages[''].name = name;
        templatePackageLockJson.packages[''].version = originPackageLockJson.version;
        templatePackageLockJson.packages[''].hasInstallScript = originBasePackageLock.hasInstallScript;
        templatePackageLockJson.packages[''].license = originBasePackageLock.license;
        fs.writeFileSync(
          '../pwa-microservices-template/package-lock.json',
          JSON.stringify(templatePackageLockJson, null, 4),
          'utf8',
        );
        // Regenerate package-lock.json to match the modified package.json
        // shellExec(`cd ../pwa-microservices-template && npm install --package-lock-only --ignore-scripts`);
        fs.writeFileSync(
          '../pwa-microservices-template/README.md',
          fs
            .readFileSync('./README.md', 'utf8')
            .replace('<!-- template-title -->', '#### Base template for pwa/api-rest projects.'),
          'utf8',
        );
      }

      break;
    case 'create':
      const buildPath = `${path}/${name}${ext ? `.${ext}` : ''}`;
      logger.info('Build path', buildPath);
      fs.mkdirSync(path, { recursive: true });
      fs.writeFileSync(buildPath, content, 'utf8');
    default:
      logger.error('not found operator');
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
