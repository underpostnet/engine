'use strict';

/**
 * @module test/support/sandbox
 * @description A Development Sandbox for a suite: stand-ins for `sudo`, `kubectl` and `kind` on PATH,
 * and sessions that this process holds the way `underpost sandbox up` does. The stand-in kubectl
 * answers the identity reads from a fixture and forwards each port to the test server
 * `SANDBOX_UPSTREAMS` names for its remote port, so the session code and its probes run as on a host.
 * Child processes see the sessions when they run with {@link sandboxEnv}.
 */

import fs from 'fs-extra';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../src/index.js';
import { sandboxPlan } from '../../src/cli/sandbox.js';

// Like sudo, it survives a SIGTERM from its own process group and returns when its command ends.
const SUDO = `#!/bin/sh
trap : TERM
exec 3<&0
"$@" <&3 3<&- &
c=$!
while kill -0 "$c" 2>/dev/null; do wait "$c"; done
`;

const KUBECTL = `#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const args = process.argv.slice(2);
if (process.env.SANDBOX_KUBECTL_LOG)
  fs.appendFileSync(process.env.SANDBOX_KUBECTL_LOG, JSON.stringify({ pid: process.pid, args }) + '\\n');
const fixture = JSON.parse(process.env.SANDBOX_FIXTURE || '{}');
const flag = (name) => args[args.indexOf(name) + 1];
if (args.includes('port-forward')) {
  const [local, remote] = args.at(-1).split(':');
  const upstream = JSON.parse(process.env.SANDBOX_UPSTREAMS || '{}')[remote];
  if (!upstream) {
    console.error('error: no upstream for port ' + remote);
    process.exit(1);
  }
  const [host, port] = upstream.split(':');
  net
    .createServer((socket) => {
      const target = net.connect(Number(port), host);
      socket.pipe(target).pipe(socket);
      socket.on('error', () => target.destroy());
      target.on('error', () => socket.destroy());
    })
    .on('error', (error) => {
      console.error(error.message);
      process.exit(1);
    })
    .listen(Number(local), flag('--address'), () =>
      console.log('Forwarding from ' + flag('--address') + ':' + local + ' -> ' + remote),
    );
} else if (args.includes('wait')) process.exit(0);
else if (args.includes('exec')) {
  if (args.includes('mongosh')) console.log(fixture.primary ?? '');
} else if (args.includes('pods'))
  console.log(['NAME READY STATUS', ...(fixture.pods ?? []).map((name) => name + ' 1/1 Running')].join('\\n'));
else if (args.includes('current-context')) console.log(fixture.currentContext ?? '');
else if (args.includes('view')) console.log(fixture.server ?? '');
else if (args.includes('namespace')) console.log((fixture.uids ?? {})[args[args.indexOf('namespace') + 1]] ?? '');
else if (args.includes('statefulset'))
  console.log((fixture.statefulsets ?? []).map((name) => (name.includes('/') ? name : 'default/' + name)).join('\\n'));
else if (args.includes('pvc')) console.log((fixture.pvcs ?? []).join('\\n'));
`;

const KIND = `#!/bin/sh
[ "$1 $2" = "get clusters" ] && printf '%s\\n' $SANDBOX_KIND_CLUSTERS
exit 0
`;

/** A free loopback port. */
export const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/**
 * Installs the stand-ins on PATH and isolates the session records and locks in a scratch directory.
 * @param {Object} [fixture] - What the stand-in kubectl answers: `currentContext`, `server`, `uids`,
 *   `statefulsets`, `pvcs`, `pods` and the MongoDB `primary`; `clusters` for the stand-in kind.
 * @returns {{root:string, directory:string, lockDirectory:string, env:Object, restore:() => void}}
 *   `env` holds the variables a child process needs to see the same sandbox.
 */
export function installSandbox(fixture = {}) {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-sandbox-test-'));
  const bin = nodePath.join(root, 'bin');
  fs.ensureDirSync(bin);
  fs.writeFileSync(nodePath.join(bin, 'sudo'), SUDO, { mode: 0o755 });
  fs.writeFileSync(nodePath.join(bin, 'kubectl'), KUBECTL, { mode: 0o755 });
  fs.writeFileSync(nodePath.join(bin, 'kind'), KIND, { mode: 0o755 });
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    TMPDIR: root,
    SANDBOX_FIXTURE: JSON.stringify(fixture),
    SANDBOX_KIND_CLUSTERS: (fixture.clusters ?? []).join(' '),
    SANDBOX_UPSTREAMS: '{}',
    SANDBOX_KUBECTL_LOG: nodePath.join(root, 'kubectl.log'),
  };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  return {
    root,
    directory: nodePath.join(root, 'underpost-sandbox'),
    lockDirectory: nodePath.join(root, 'underpost-locks'),
    env,
    /** Replaces what the stand-ins answer. */
    answer(next) {
      env.SANDBOX_FIXTURE = JSON.stringify(next);
      env.SANDBOX_KIND_CLUSTERS = (next.clusters ?? []).join(' ');
      Object.assign(process.env, {
        SANDBOX_FIXTURE: env.SANDBOX_FIXTURE,
        SANDBOX_KIND_CLUSTERS: env.SANDBOX_KIND_CLUSTERS,
      });
    },
    /** Each call of the stand-in kubectl: its pid and its arguments. */
    kubectlCalls() {
      return fs.existsSync(env.SANDBOX_KUBECTL_LOG)
        ? fs.readFileSync(env.SANDBOX_KUBECTL_LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
        : [];
    },
    /** Sets the test server a remote port forwards to. */
    upstream(remotePort, hostPort) {
      env.SANDBOX_UPSTREAMS = JSON.stringify({ ...JSON.parse(env.SANDBOX_UPSTREAMS), [remotePort]: hostPort });
      process.env.SANDBOX_UPSTREAMS = env.SANDBOX_UPSTREAMS;
    },
    restore() {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      fs.removeSync(root);
    },
  };
}

/**
 * A sandbox descriptor as {@link UnderpostSandbox.resolve} reads it, for a cluster the suite names.
 * @param {string} sandboxId
 * @param {{kubeSystemUid?:string, nodeName?:string}} [identity]
 * @returns {Object}
 */
export const sandboxDescriptor = (sandboxId, { kubeSystemUid = `${sandboxId}-uid`, nodeName = '' } = {}) => ({
  sandboxId,
  hostname: os.hostname(),
  node: { nodeName, role: nodeName ? 'workstation' : '', peerId: '' },
  provider: 'kind',
  clusterName: sandboxId,
  kubeContext: `kind-${sandboxId}`,
  server: 'https://127.0.0.1:40000',
  kubeSystemUid,
  namespaces: { mongodb: 'default', valkey: 'default', ipfs: 'default' },
  namespaceUids: { default: `${sandboxId}-default` },
  fingerprint: `sha256:${sandboxId}-${kubeSystemUid}`,
});

/**
 * Opens a session that forwards a free loopback port to a MongoDB test server, as the MongoDB of a
 * sandbox. The local port it returns is the database a development command must name.
 * @param {ReturnType<typeof installSandbox>} sandbox
 * @param {{sandboxId:string, mongoHost:string, nodeName?:string, kubeSystemUid?:string}} params
 * @returns {Promise<{session:Object, mongoHost:string}>}
 */
export async function mongoSandboxSession(sandbox, { sandboxId, mongoHost, nodeName, kubeSystemUid }) {
  const remotePort = await freePort();
  sandbox.upstream(remotePort, mongoHost);
  const descriptor = sandboxDescriptor(sandboxId, { nodeName, kubeSystemUid });
  const localPort = await freePort();
  const [plan] = sandboxPlan(descriptor, ['mongodb']);
  const session = await Underpost.sandbox.openSession({
    descriptor,
    plan: [{ ...plan, localPort, remotePort }],
    primary: () => 'mongodb-0',
    reconcileMs: 60000,
    directory: sandbox.directory,
    lockDirectory: sandbox.lockDirectory,
  });
  return { session, mongoHost: `127.0.0.1:${localPort}` };
}
