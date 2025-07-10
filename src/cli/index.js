import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost from '../index.js';
import { getNpmRootPath, getUnderpostRootPath, loadConf } from '../server/conf.js';
import fs from 'fs-extra';
import { commitData } from '../client/components/core/CommonJs.js';
import { shellExec } from '../server/process.js';
import UnderpostLxd from './lxd.js';

const underpostRootPath = getUnderpostRootPath();
fs.existsSync(`${underpostRootPath}/.env`)
  ? dotenv.config({ path: `${underpostRootPath}/.env`, override: true })
  : dotenv.config();

const program = new Command();

program.name('underpost').description(`underpost ci/cd cli ${Underpost.version}`).version(Underpost.version);

program
  .command('new')
  .argument('<app-name>', 'Application name')
  .description('Create a new project')
  .action(Underpost.repo.new);

program
  .command('start')
  .argument('<deploy-id>', 'Deploy configuration id')
  .argument('[env]', 'Optional environment, for default is development')
  .option('--run', 'Run app servers and monitor health server')
  .option('--build', 'Build app client')
  .action(Underpost.start.callback)
  .description('Start up server, build pipelines, or services');

program
  .command('clone')
  .argument(`<uri>`, 'e.g. username/repository')
  .option('--bare', 'Clone only .git files')
  .option('-g8', 'Use g8 repo extension')
  .description('Clone github repository')
  .action(Underpost.repo.clone);

program
  .command('pull')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<uri>`, 'e.g. username/repository')
  .description('Pull github repository')
  .option('-g8', 'Use g8 repo extension')
  .action(Underpost.repo.pull);

program
  .command('cmt')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<commit-type>`, `Options: ${Object.keys(commitData)}`)
  .argument(`[module-tag]`, 'Optional set module tag')
  .argument(`[message]`, 'Optional set additional message')
  .option('--empty', 'Allow empty files')
  .option('--copy', 'Copy to clipboard message')
  .option('--info', 'Info commit types')
  .description('Commit github repository')
  .action(Underpost.repo.commit);

program
  .command('push')
  .argument('<path>', 'Absolute or relative directory')
  .argument(`<uri>`, 'e.g. username/repository')
  .option('-f', 'Force push overwriting repository')
  .option('-g8', 'Use g8 repo extension')
  .description('Push github repository')
  .action(Underpost.repo.push);

program
  .command('env')
  .argument('<deploy-id>', `deploy configuration id, if 'clean' restore default`)
  .argument('[env]', 'Optional environment, for default is production')
  .description('Set environment variables files and conf related to <deploy-id>')
  .action(loadConf);

program
  .command('config')
  .argument('operator', `Options: ${Object.keys(Underpost.env)}`)
  .argument('[key]', 'Config key')
  .argument('[value]', 'Config value')
  .description(`Manage configuration, operators`)
  .action((...args) => Underpost.env[args[0]](args[1], args[2]));

program
  .command('root')
  .description('Get npm root path')
  .action(() => console.log(getNpmRootPath()));

program
  .command('cluster')
  .argument('[pod-name]', 'Optional pod name filter')
  .option('--reset', `Delete all clusters and prune all data and caches`)
  .option('--mariadb', 'Init with mariadb statefulset')
  .option('--mysql', 'Init with mysql statefulset')
  .option('--mongodb', 'Init with mongodb statefulset')
  .option('--postgresql', 'Init with postgresql statefulset')
  .option('--mongodb4', 'Init with mongodb 4.4 service')
  //  .option('--istio', 'Init base istio service mesh')
  .option('--valkey', 'Init with valkey service')
  .option('--contour', 'Init with project contour base HTTPProxy and envoy')
  .option('--cert-manager', 'Init with letsencrypt-prod ClusterIssuer')
  .option('--dedicated-gpu', 'Init with dedicated gpu base resources env')
  .option('--info', 'Get all kinds objects deployed')
  .option('--full', 'Init with all statefulsets and services available')
  .option('--ns-use <ns-name>', 'Switches current context to namespace')
  .option('--kubeadm', 'Init with kubeadm controlplane management')
  .option('--dev', 'init with dev cluster')
  .option('--list-pods', 'Display list pods information')
  .option('--info-capacity', 'display current total machine capacity info')
  .option('--info-capacity-pod', 'display current machine capacity pod info')
  .option('--pull-image', 'Set optional pull associated image')
  .option('--init-host', 'Install k8s node necessary cli env: kind, kubeadm, docker, podman, helm')
  .option('--config', 'Set k8s base node config')
  .option('--worker', 'Set worker node context')
  .option('--chown', 'Set k8s kube chown')
  .option('--k3s', 'Initialize the cluster using K3s')
  .action(Underpost.cluster.init)
  .description('Manage cluster, for default initialization base kind cluster');

program
  .command('deploy')
  .argument('[deploy-list]', 'Deploy id list, e.g. default-a,default-b')
  .argument('[env]', 'Optional environment, for default is development')
  .option('--remove', 'Delete deployments and services')
  .option('--sync', 'Sync deployments env, ports, and replicas')
  .option('--info-router', 'Display router structure')
  .option('--expose', 'Expose service match deploy-list')
  .option('--info-util', 'Display kubectl util management commands')
  .option('--cert', 'Reset tls/ssl certificate secrets')
  .option('--build-manifest', 'Build kind yaml manifests: deployments, services, proxy and secrets')
  .option('--dashboard-update', 'Update dashboard instance data with current router config')
  .option('--replicas <replicas>', 'Set custom number of replicas')
  .option('--versions <deployment-versions>', 'Comma separated custom deployment versions')
  .option('--traffic <traffic-versions>', 'Comma separated custom deployment traffic')
  .option('--disable-update-deployment', 'Disable update deployments')
  .option('--info-traffic', 'get traffic conf form current resources deployments')
  .option('--kubeadm', 'Enable kubeadm context')
  .option('--restore-hosts', 'Restore defautl etc hosts')
  .option(
    '--rebuild-clients-bundle',
    'Inside container, rebuild clients bundle, only static public or storage client files',
  )
  .description('Manage deployment, for default deploy development pods')
  .action(Underpost.deploy.callback);

program
  .command('secret')
  .argument('<platform>', `Options: ${Object.keys(Underpost.secret)}`)
  .option('--init', 'Init secrets platform environment')
  .option('--create-from-file <path-env-file>', 'Create secret from env file')
  .option('--list', 'Lists secrets')
  // .option('--delete [secret-key]', 'Delete key secret, if not set, are default delete all')
  // .option('--create [secret-key] [secret-value]', 'Create secret key, with secret value')
  .description(`Manage secrets`)
  .action((...args) => {
    if (args[1].createFromFile) return Underpost.secret[args[0]].createFromEnvFile(args[1].createFromFile);
    if (args[1].list) return Underpost.secret[args[0]].list();
    if (args[1].init) return Underpost.secret[args[0]].init();
  });

program
  .command('dockerfile-image-build')
  .option('--path [path]', 'Dockerfile path')
  .option('--image-name [image-name]', 'Set image name')
  .option('--image-path [image-path]', 'Set tar image path')
  .option('--dockerfile-name [dockerfile-name]', 'set Dockerfile name')
  .option('--podman-save', 'Export tar file from podman')
  .option('--kind-load', 'Import tar image to Kind cluster')
  .option('--kubeadm-load', 'Import tar image to Kubeadm cluster')
  .option('--secrets', 'Dockerfile env secrets')
  .option('--secrets-path [secrets-path]', 'Dockerfile custom path env secrets')
  .option('--reset', 'Build without using cache')
  .option('--k3s-load', 'Load image into K3s cluster.')
  .description('Build image from Dockerfile')
  .action(Underpost.image.dockerfile.build);

program
  .command('dockerfile-pull-base-images')
  .option('--path [path]', 'Dockerfile path')
  .option('--kind-load', 'Import tar image to Kind cluster')
  .option('--kubeadm-load', 'Import tar image to Kubeadm cluster')
  .option('--version', 'Set custom version')
  .option('--k3s-load', 'Load image into K3s cluster.')
  .description('Pull underpost dockerfile images requirements')
  .action(Underpost.image.dockerfile.pullBaseImages);

program
  .command('install')
  .description('Fast import underpost npm dependencies')
  .action(() => {
    fs.copySync(`${underpostRootPath}/node_modules`, './node_modules');
  });

program
  .command('db')
  .argument('<deploy-list>', 'Deploy id list, e.g. default-a,default-b')
  .option('--import', 'Import container backups from repositories')
  .option('--export', 'Export container backups to repositories')
  .option('--pod-name <pod-name>', 'Optional pod context')
  .option('--collections <collections>', 'Comma separated collections')
  .option('--out-path <out-path>', 'Custom out path backup')
  .option('--drop', 'Drop databases')
  .option('--preserveUUID', 'Preserve Ids')
  .option('--git', 'Upload to github')
  .option('--hosts <hosts>', 'Comma separated hosts')
  .option('--paths <paths>', 'Comma separated paths')
  .option('--ns <ns-name>', 'Optional name space context')
  .description('Manage databases')
  .action(Underpost.db.callback);

program
  .command('script')
  .argument('operator', `Options: ${Object.keys(Underpost.script)}`)
  .argument('<script-name>', 'Script name')
  .argument('[script-value]', 'Literal command, or path')
  .option('--itc', 'Inside container execution context')
  .option('--itc-path', 'Inside container path options')
  .option('--ns <ns-name>', 'Options name space context')
  .option('--pod-name <pod-name>')
  .description(
    'Supports a number of built-in underpost global scripts and their preset life cycle events as well as arbitrary scripts',
  )
  .action((...args) => Underpost.script[args[0]](args[1], args[2], args[3]));

program
  .command('cron')
  .argument('[deploy-list]', 'Deploy id list, e.g. default-a,default-b')
  .argument('[job-list]', `Deploy id list, e.g. ${Object.keys(Underpost.cron)}, for default all available jobs`)
  .option('--itc', 'Inside container execution context')
  .option('--init', 'Init cron jobs for cron job default deploy id')
  .option('--git', 'Upload to github')
  .option('--dashboard-update', 'Update dashboard cron data with current jobs config')
  .description('Cron jobs management')
  .action(Underpost.cron.callback);

program
  .command('fs')
  .argument('[path]', 'Absolute or relative directory')
  .option('--rm', 'Remove file')
  .option('--git', 'Current git changes')
  .option('--recursive', 'Upload files recursively')
  .option('--deploy-id <deploy-id>', 'Deploy configuration id')
  .option('--pull', 'Download file')
  .option('--force', 'Force action')
  .option('--storage-file-path <storage-file-path>', 'custom file storage path')
  .description('File storage management, for default upload file')
  .action(Underpost.fs.callback);

program
  .command('test')
  .argument('[deploy-list]', 'Deploy id list, e.g. default-a,default-b')
  .description('Manage Test, for default run current underpost default test')
  .option('--itc', 'Inside container execution context')
  .option('--sh', 'Copy to clipboard, container entrypoint shell command')
  .option('--logs', 'Display container logs')
  .option('--pod-name <pod-name>')
  .option('--pod-status <pod-status>')
  .option('--kind-type <kind-type>')
  .action(Underpost.test.callback);

program
  .command('monitor')
  .argument('<deploy-id>', 'Deploy configuration id')
  .argument('[env]', 'Optional environment, for default is development')
  .option('--ms-interval <ms-interval>', 'Custom ms interval delta time')
  .option('--now', 'Exec immediately monitor script')
  .option('--single', 'Disable recurrence')
  .option('--replicas <replicas>', 'Set custom number of replicas')
  .option('--type <type>', 'Set custom monitor type')
  .option('--sync', 'Sync with current proxy deployments proxy traffic')
  .description('Monitor health server management')
  .action(Underpost.monitor.callback);

program
  .command('lxd')
  .option('--init', 'Init lxd')
  .option('--reset', 'Reset lxd on current machine')
  .option('--install', 'Install lxd on current machine')
  .option('--dev', 'Set dev context env')
  .option('--create-virtual-network', 'Create lxd virtual network bridge')
  .option('--create-admin-profile', 'Create admin profile for lxd management')
  .option('--control', 'set control node vm context')
  .option('--worker', 'set worker node context')
  .option('--create-vm <vm-id>', 'Create default virtual machines')
  .option('--init-vm <vm-id>', 'Get init vm underpost script')
  .option('--info-vm <vm-id>', 'Get all info vm')
  .option('--test <vm-id>', 'Test health, status and network connectivity for a VM')
  .option('--root-size <gb-size>', 'Set root size vm')
  .option('--k3s', 'Flag to indicate K3s cluster type for VM initialization')
  .option('--join-node <nodes>', 'Comma separated worker and control node e. g. k8s-worker-1,k8s-control')
  .option(
    '--expose <vm-name-ports>',
    'Vm name and : separated with Comma separated vm port to expose e. g. k8s-control:80,443',
  )
  .option(
    '--delete-expose <vm-name-ports>',
    'Vm name and : separated with Comma separated vm port to remove expose e. g. k8s-control:80,443',
  )
  .option('--auto-expose-k8s-ports <vm-id>', 'Automatically expose common Kubernetes ports for the VM.')
  .description('Lxd management')
  .action(UnderpostLxd.API.callback);

const buildCliDoc = () => {
  let md = shellExec(`node bin help`, { silent: true, stdout: true }).split('Options:');
  const baseOptions =
    `## ${md[0].split(`\n`)[2]}

### Usage: ` +
    '`' +
    md[0].split(`\n`)[0].split('Usage: ')[1] +
    '`' +
    `
  ` +
    '```\n Options:' +
    md[1] +
    ' \n```';
  md =
    baseOptions +
    `

## Commands:
    `;
  program.commands.map((o) => {
    md +=
      `

` +
      '### `' +
      o._name +
      '` :' +
      `
` +
      '```\n ' +
      shellExec(`node bin help ${o._name}`, { silent: true, stdout: true }) +
      ' \n```' +
      `
  `;
  });
  fs.writeFileSync(`./src/client/public/nexodev/docs/references/Command Line Interface.md`, md, 'utf8');
  fs.writeFileSync(`./cli.md`, md, 'utf8');
  const readmeSplit = `pwa-microservices-template</a>`;
  const readme = fs.readFileSync(`./README.md`, 'utf8').split(readmeSplit);
  fs.writeFileSync(
    './README.md',
    readme[0] +
      readmeSplit +
      `

` +
      baseOptions +
      `
      
<a target="_top" href="https://github.com/underpostnet/pwa-microservices-template/blob/master/cli.md">See complete CLI Docs here.</a>
      
`,
    'utf8',
  );
};

export { program, buildCliDoc };
