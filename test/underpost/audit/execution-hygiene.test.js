// Platform invariants of placement and execution, read from the source: one namespace resolver, one
// DNS rule, deploy scripts that ask the CLI, one privilege boundary, and one subprocess boundary.

import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');

/** The one module that elevates: it runs a `privileged` command as root, or through `sudo`. */
const PRIVILEGE_BOUNDARY = 'src/server/runtime/process.js';

/**
 * The host administration modules that still embed `sudo`, and why each runs commands as root. Each one
 * moves to the `privileged` option of the process executors, then leaves this list.
 */
const HOST_ADMINISTRATION = Object.freeze({
  'src/cli/wireguard.js': 'configures the WireGuard interfaces of the host',
  'src/server/network/dns.js': 'configures the network and the DNS of the host',
  'src/cli/ssh.js': 'manages the SSH users and keys of the host, and elevates on the hosts it reaches',
  'src/cli/image.js': 'builds and loads images in the container storage of root',
  'src/cli/system.js': 'renders the provisioning commands of an image',
  'src/cli/maas-database.js': 'administers the MAAS database',
  'src/cli/cloud-init.js': 'writes cloud-init provisioning',
  'src/server/ops/systemd.js': 'renders systemd unit commands',
  'src/cli/run.js': 'runs host administration: packages, services, the firewall and process inspection',
  'src/cli/event.js': 'installs the event dispatcher service and its firewall port',
  'src/cli/monitor.js': 'installs Cockpit and the node-exporter host service',
  'src/server/ops/monitoring.js': 'renders the node-exporter install script of a hub, which elevates on the hub',
  'src/runtime/lampp/lampp.js': 'installs the system packages of the LAMPP runtime',
});

/** The modules that start a process themselves, and why the process boundary does not run it. */
const DIRECT_PROCESS_MODULES = Object.freeze({
  'src/server/runtime/process.js': 'is the process boundary',
  'src/server/runtime/environment.js': 'resolves the npm root before any execution profile exists',
  'src/server/runtime/linux-resources.js': 'probes and holds the systemd scopes of the resource governor',
  'src/server/runtime/managed-process.js': 'supervises long-running children with their own signals',
  'src/server/runtime/watch-runner.js': 'restarts a detached watcher process group',
  'src/projects/cyberia/content/content-artifact.js': 'reads the git revision of the content checkout',
  'src/projects/cyberia/saga/content-cli.js': 'streams the cyberia-content CLI',
  'src/projects/cyberia/stats/stat-contract-generator.js': 'formats and generates the Go stat contract',
});

/** The scripts the bare-metal and LXD commands run, and whether they run as root on a host. */
const PROVISIONING_SCRIPTS = Object.freeze({
  'scripts/maas-setup.sh': 'root',
  'scripts/maas-nat-firewalld.sh': 'root',
  'scripts/packer-setup.sh': 'root',
  'scripts/lxd-vm-setup.sh': 'root',
  'scripts/k3s-node-setup.sh': 'root',
  'scripts/maas-upload-boot-resource.sh': 'MAAS CLI profile of root',
  'scripts/ipxe-setup.sh': 'invoking user',
});

/** A command shown to the operator, which this process never runs. */
const instruction = ({ text }) => /\bpbcopy\(/.test(text);

const sources = (directory, extension) =>
  fs
    .readdirSync(nodePath.join(ROOT, directory), { recursive: true })
    .filter((file) => file.endsWith(extension))
    .map((file) => nodePath.join(directory, file));

const CODE = [...sources('src', '.js'), ...sources('bin', '.js')].filter((file) => !file.includes('/public/'));
const SCRIPTS = sources('deploy', '.sh');

/** The lines of a file that are code: neither a comment nor documentation. */
const codeLines = (file) =>
  fs
    .readFileSync(nodePath.join(ROOT, file), 'utf8')
    .split('\n')
    .map((text, index) => ({ file, line: index + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*|#)/.test(text));

/** Each line of the files that matches, as `file:line text`. */
const offenders = (files, pattern, allowed = () => false) =>
  files
    .flatMap(codeLines)
    .filter((entry) => pattern.test(entry.text) && !allowed(entry))
    .map(({ file, line, text }) => `${file}:${line} ${text.trim()}`);

/** The text of each call of a process executor, from its name to its closing parenthesis. */
const executorCalls = (file) => {
  const text = fs.readFileSync(nodePath.join(ROOT, file), 'utf8');
  const calls = [];
  for (const match of text.matchAll(/\b(shellExec|runCommand)\(/g)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    calls.push({ file, line: text.slice(0, match.index).split('\n').length, call: text.slice(match.index, end + 1) });
  }
  return calls;
};

describe('placement and execution invariants', () => {
  it('reaches the cluster as the invoking user: no sudo kubectl or helm', () => {
    expect(offenders([...CODE, ...SCRIPTS], /\bsudo\s+(-E\s+)?(kubectl|helm)\b/)).toEqual([]);
  });

  it('builds cluster DNS names in one module, with the configured domain', () => {
    expect(
      offenders([...CODE, ...SCRIPTS], /cluster\.local/, ({ file }) => file === 'src/server/network/service-dns.js'),
    ).toEqual([]);
  });

  it('resolves namespaces through the placement only: no default namespace in commands or fallbacks', () => {
    expect(offenders(CODE, /namespace\s*(\|\||\?\?)\s*'default'|-n default\b|--namespace[ =]default\b/)).toEqual([]);
    expect(offenders(SCRIPTS, /--namespace\b|-n default\b|CONTENT_NAMESPACE/)).toEqual([]);
  });

  it('runs kubectl in deploy scripts through cluster_kubectl, in the context of their environment', () => {
    expect(
      offenders(SCRIPTS, /\bkubectl\b/, ({ text }) =>
        /cluster_kubectl|KUBECONFIG="\$UNDERPOST_KUBECONFIG" kubectl/.test(text),
      ),
    ).toEqual([]);
  });

  it('elevates only in the privilege boundary, or in a host administration module that still embeds sudo', () => {
    const embedded = /(^|[\s`'"|&;(!])sudo\s/;
    const application = CODE.filter((file) => !HOST_ADMINISTRATION[file] && file !== PRIVILEGE_BOUNDARY);
    expect(offenders(application, embedded, instruction)).toEqual([]);
    for (const [file, reason] of Object.entries(HOST_ADMINISTRATION)) {
      expect(fs.existsSync(nodePath.join(ROOT, file)), file).toBe(true);
      expect(reason, file).toMatch(/^[a-z]/);
      expect(offenders([file], embedded, instruction).length, `${file} embeds no sudo: remove it`).toBeGreaterThan(0);
    }
  });

  // `kubectl port-forward` needs root only to bind a host port below 1024. LXD authorizes `lxc` itself.
  it('gives each privileged command a reason, and runs no lxc, kubectl or helm as root but a port-forward', () => {
    const privileged = CODE.flatMap(executorCalls).filter(({ call }) => /\bprivileged:/.test(call));
    expect(privileged.length).toBeGreaterThan(0);
    const describe = ({ file, line, call }) => `${file}:${line} ${call.split('\n')[0]}`;
    const unexplained = privileged.filter(({ call }) => /\bprivileged:\s*(true|false|''|""|``)/.test(call));
    expect(unexplained.map(describe)).toEqual([]);
    const api = privileged.filter(({ call }) => /^\w+\(\s*[`'"](kubectl\s+(?!port-forward\b)|helm\s|lxc\s)/.test(call));
    expect(api.map(describe)).toEqual([]);
    const lxd = fs.readFileSync(nodePath.join(ROOT, 'src/cli/lxd.js'), 'utf8');
    expect(lxd.match(/_lxc\(\[[^\]]*\],\s*\{[^}]*privileged/g) ?? []).toEqual([]);
  });

  it('starts processes only through the process boundary', () => {
    const importers = CODE.filter((file) =>
      /from '(node:)?child_process'|require\('(node:)?child_process'\)/.test(
        fs.readFileSync(nodePath.join(ROOT, file), 'utf8'),
      ),
    );
    expect(importers.filter((file) => !DIRECT_PROCESS_MODULES[file])).toEqual([]);
    expect(offenders(Object.keys(DIRECT_PROCESS_MODULES), /\b(spawn|spawnSync|execFileSync)\(\s*'sudo'/)).toEqual([]);
  });

  it('runs each provisioning script under one privilege: root scripts check for root and embed no sudo', () => {
    for (const [script, runAs] of Object.entries(PROVISIONING_SCRIPTS)) {
      expect(offenders([script], /(^|[\s`'"|&;(!])sudo\s/), script).toEqual([]);
      if (runAs === 'root') expect(fs.readFileSync(nodePath.join(ROOT, script), 'utf8'), script).toMatch(/id -u/);
    }
  });

  // A protected path uses the host file operations of the boundary, which run the program as root.
  it('uses the file system API for files, never a shell file command', () => {
    expect(
      CODE.filter((file) => file !== PRIVILEGE_BOUNDARY)
        .flatMap(executorCalls)
        .filter(({ call }) => /^\w+\(\s*[`'"](sudo\s+)?(mkdir|rm|cp|mv|chmod|chown|touch|ln)\s/.test(call))
        .map(({ file, line, call }) => `${file}:${line} ${call.split('\n')[0]}`),
    ).toEqual([]);
  });
});
