'use strict';

/**
 * @module prepare-host.test
 * @description Covers the step order `prepare_host` in `deploy/lib/host.sh` emits. Drives the real
 * shell helper with `deploy_step` stubbed out, so nothing is executed — no host, no root.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostLib = path.join(repoRoot, 'deploy/lib/host.sh');
// Defined before and after the source: the library pulls in the real logging helpers, which
// would otherwise run the steps instead of printing them.
const STUB = `deploy_step() { printf '%s :: %s\\n' "$1" "${'$'}{*:2}"; };`;

const steps = () =>
  execFileSync(
    'bash',
    [
      '-c',
      `deploy_step() { printf '%s :: %s\\n' "$1" "${'$'}{*:2}"; }; source "${hostLib}"; ` +
        `prepare_host /home/dd/engine owner/engine owner/engine-private`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');

describe('a node installs the deploy own package manifest', () => {
  const run = (script) =>
    execFileSync('bash', ['-c', `${STUB} source "${hostLib}"; ${STUB} ${script}`], {
      encoding: 'utf8',
    });

  it('resolves the deploy id from the source repository, without running the CLI', () => {
    // The manifest this resolves is what makes the CLI runnable, so it cannot be resolved by
    // asking the CLI. Test and production sources of one deploy answer the same id.
    const resolved = run(
      'for r in owner/engine-test-cyberia owner/engine-cyberia owner/engine-cyberia-private owner/engine; ' +
        'do printf "[%s]" "$(deploy_id_from_repo "$r")"; done',
    );
    expect(resolved.trim()).to.equal('[dd-cyberia][dd-cyberia][dd-cyberia][]');
  });

  it('installs from engine-private/conf/<deploy-id>/package.json, on both sides of the pull', () => {
    // Regression: a product checkout declares only what it publishes, so installing against its
    // own manifest pruned packages the CLI imports — and the CLI is what pulls the checkout.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-prepare-host-'));
    try {
      fs.outputFileSync(path.join(root, 'engine-private/conf/dd-x/package.json'), '{}');
      const emitted = run(`prepare_host ${root} owner/engine-x owner/engine-private`).trim().split('\n');
      const titles = emitted.map((line) => line.split(' :: ')[0]);

      expect(titles).to.deep.equal([
        'Install dependencies (dd-x)',
        'Link underpost CLI',
        'Pull repository',
        'Install dependencies (dd-x)',
        'Link underpost CLI',
        'Load host config',
      ]);
      for (const index of [0, 3])
        expect(emitted[index]).to.include(
          'cp -a ./engine-private/conf/dd-x/package.json ./package.json && npm install',
        );
    } finally {
      fs.removeSync(root);
    }
  });

  it('installs the checkout own manifest when the deploy ships none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-prepare-host-'));
    try {
      const emitted = run(`install_deploy_dependencies ${root} dd-absent`).trim().split('\n');
      expect(emitted[0]).to.equal(`Install dependencies :: sudo -n -- /bin/bash -lc cd ${root} && npm install`);
      expect(emitted[1]).to.include(`Link underpost CLI :: sudo -n -- /bin/bash -lc cd ${root} && npm link --force`);
    } finally {
      fs.removeSync(root);
    }
  });
});

describe('a node prepares itself from the source its host configuration names', () => {
  // `npm root -g` is stubbed rather than the file read: the store's location is the one thing
  // the helper resolves, and a test that writes into the real global tree is not a unit test.
  const sources = (store) =>
    execFileSync(
      'bash',
      [
        '-c',
        `npm() { printf '%s\\n' "${store}"; }; source "${hostLib}"; ` +
          'printf "[%s][%s]" "$ENGINE_SRC_REPO" "$ENGINE_SRC_PRIVATE_REPO"',
      ],
      { encoding: 'utf8', env: { ...process.env, ENGINE_SRC_REPO: '', ENGINE_SRC_PRIVATE_REPO: '' } },
    );

  it('reads the pair `wireguard --sync` recorded, over the built-in fallback', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-host-config-'));
    try {
      fs.outputFileSync(
        path.join(root, 'underpost/.env'),
        'GITHUB_TOKEN=secret\nENGINE_SRC_REPO="owner/engine-test-lampp"\nENGINE_SRC_PRIVATE_REPO=owner/engine-lampp-private\n',
      );
      expect(sources(root)).to.equal('[owner/engine-test-lampp][owner/engine-lampp-private]');
    } finally {
      fs.removeSync(root);
    }
  });

  it('names no repository of its own, leaving the pairing to the pull that resolves it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-host-config-'));
    try {
      expect(sources(root)).to.equal('[][]');
    } finally {
      fs.removeSync(root);
    }
  });

  it('lets the environment override the store, which is how a deploy script retargets a node', () => {
    const emitted = execFileSync('bash', ['-c', `source "${hostLib}"; printf '%s' "$(deploy_id_from_repo)"`], {
      encoding: 'utf8',
      env: { ...process.env, ENGINE_SRC_REPO: 'owner/engine-test-core' },
    });
    expect(emitted).to.equal('dd-core');
  });
});

const deployRoot = path.join(repoRoot, 'deploy');
// The base template restores `deploy/lib` and nothing that deploys, so a checkout carrying no
// deploy id of its own has no manifest script to hold to this contract. Read as "ships deploy
// ids", not as "the filter below found something" — that stays an assertion, not a skip.
const shipsDeployIds = fs.existsSync(deployRoot) && fs.readdirSync(deployRoot).some((e) => e.startsWith('dd-'));

describe.skipIf(!shipsDeployIds)('every deploy ships a package script for its own manifest', () => {
  // A deploy id directory is one that carries a deploy script; lib/ and the project-scope
  // directories are not deployments.
  const deployDirectories = fs
    .readdirSync(deployRoot)
    .filter((entry) => fs.existsSync(path.join(deployRoot, entry, 'sync-deploy.sh')) || entry.startsWith('cyberia-'));

  it('covers every deploy id and instance directory', () => {
    expect(deployDirectories).to.not.be.empty;
    for (const directory of deployDirectories)
      expect(fs.existsSync(path.join(deployRoot, directory, 'package.sh')), directory).to.equal(true);
  });

  it('names a deploy id and does nothing but install its manifest', () => {
    for (const directory of deployDirectories) {
      const source = fs.readFileSync(path.join(deployRoot, directory, 'package.sh'), 'utf8');
      expect(source, directory).to.match(/^DEPLOY_ID=dd-[a-z0-9-]+$/m);
      expect(source, directory).to.include('install_deploy_dependencies "$ENGINE_ROOT" "$DEPLOY_ID"');
      expect(source, directory).to.not.include('kubectl');
    }
  });
});

describe('node bootstrap installs a runtime a unit can execute', () => {
  // Regression: both scripts said "home-directory runtimes cannot be used by hardened systemd
  // services under SELinux" and then gated on `command -v node`, which an nvm runtime under $HOME
  // satisfies. A node whose operator had nvm Node 24 on PATH was left with no system Node at all,
  // and every supervised service failed 203/EXEC with nothing able to repair it.
  const scripts = ['scripts/kubeadm-node-setup.sh', 'scripts/k3s-node-setup.sh'];

  it('decides on a system path rather than on whatever is on PATH', () => {
    for (const script of scripts) {
      const source = fs.readFileSync(path.join(repoRoot, script), 'utf8');
      expect(source, script).to.include('system_node_path()');
      expect(source, script).to.include('/usr/bin/node /usr/local/bin/node /bin/node');
      expect(source, script).to.not.match(/^\s*if.*command -v node .*grep -q .\^v24/m);
    }
  });

  it('resolves only an executable Node 24 at a system path', () => {
    // The candidate paths are faked under a temp root rather than the real /usr/bin, /usr/local/bin,
    // /bin: the host running this suite may itself have a genuine system Node 24 at one of those
    // paths, which would make the probe correctly resolve it and defeat the regression check below.
    const probe = (bin, candidates) =>
      execFileSync(
        'bash',
        [
          '-c',
          'set -euo pipefail; system_node_path() { local c; for c in ' +
            candidates +
            '; do if [ -x "$c" ] && "$c" --version 2>/dev/null | grep -q "^v24"; then printf "%s" "$c"; return 0; fi; ' +
            `done; return 1; }; PATH=${bin}:$PATH; if p="$(system_node_path)"; then printf 'system:%s' "$p"; ` +
            "else printf 'none'; fi",
        ],
        { encoding: 'utf8' },
      );

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-nvm-'));
    try {
      const home = path.join(root, 'home');
      const candidates = ['/usr/bin', '/usr/local/bin', '/bin'].map((d) => path.join(root, 'fake', d, 'node'));

      // A Node 24 reachable only through PATH, the way nvm publishes one, resolves to nothing.
      fs.outputFileSync(path.join(home, 'node'), '#!/bin/sh\necho v24.15.0\n');
      fs.chmodSync(path.join(home, 'node'), 0o755);
      expect(probe(home, candidates.join(' '))).to.equal('none');
    } finally {
      fs.removeSync(root);
    }
  });
});

describe('the pod bootstrap can write what it installs', () => {
  const bootstrap = (args) =>
    execFileSync('bash', ['-c', `source "${hostLib}"; pod_bootstrap_cmd ${args}`], { encoding: 'utf8' })
      .split(',')
      .map((step) => step.trim());

  it('takes the global npm prefix before installing or linking into it', () => {
    // Regression: the manifest's `install` hook installs global tooling and `npm link` publishes
    // the CLI there, and the image leaves that tree owned by root — both failed with EACCES.
    const steps = bootstrap('dd-cyberia production owner/engine-test-cyberia');
    const grant = steps.findIndex((step) => step.startsWith('sudo chown -R'));

    expect(grant, 'ownership of the npm prefix').to.be.greaterThan(-1);
    expect(steps[grant]).to.include('$(npm prefix -g)/lib/node_modules');
    expect(steps[grant]).to.include('$(npm prefix -g)/bin');
    // Resolved in the container, by the user the container runs as.
    expect(steps[grant]).to.include('$(id -u):$(id -g)');
    expect(grant).to.be.lessThan(steps.indexOf('npm install'));
    expect(steps.indexOf('npm install')).to.be.lessThan(steps.indexOf('npm link --force'));
    const verifyLink = steps.findIndex((step) => step.includes('command -v underpost'));
    const setStatus = steps.findIndex((step) => step.startsWith('underpost state set'));
    expect(verifyLink, 'linked underpost path verification').to.be.greaterThan(steps.indexOf('npm link --force'));
    expect(verifyLink).to.be.lessThan(setStatus);
    expect(steps[verifyLink]).to.include('readlink -f ./bin/index.js');
  });
});

describe('has_changes reads a checkout the caller names', () => {
  const query = (call) =>
    execFileSync('bash', ['-c', `source "${hostLib}"; sudo() { printf '%s\\n' "$*"; }; ${call}`], {
      encoding: 'utf8',
    }).trim();

  it('takes the engine root as an argument, and falls back to the caller own root', () => {
    expect(query('has_changes src/x /tmp/other-root')).to.include('cd /tmp/other-root');
    expect(query('ENGINE_ROOT=/inherited-root; has_changes src/y')).to.include('cd /inherited-root');
    expect(query('has_changes src/z')).to.include('cd /home/dd/engine');
  });

  it('asks the engine for the status of the path it was given', () => {
    expect(query('has_changes src/client/public/cyberia /engine')).to.include(
      'node bin cmt src/client/public/cyberia --has-changes',
    );
  });
});

describe('prepare_host brings a node up in an order it can recover from', () => {
  const emitted = steps();
  const titles = emitted.map((line) => line.split(' :: ')[0]);
  const step = (title) => emitted[titles.indexOf(title)] || '';

  it('installs dependencies before running anything from the checkout', () => {
    // Regression: the pull runs through this checkout's own CLI, so a tree whose node_modules
    // no longer match its package.json failed to import — and the step that would have replaced
    // the source never ran. Only the first install is load-bearing; a node reinstalled after the
    // pull as well is fine.
    expect(titles[0]).to.equal('Install dependencies');
    expect(emitted[0]).to.include('npm install');
    expect(titles.indexOf('Pull repository')).to.be.greaterThan(0);
  });

  it('relinks the checkout CLI after every dependency install', () => {
    const installs = titles.reduce((indexes, title, index) => {
      if (title.startsWith('Install dependencies')) indexes.push(index);
      return indexes;
    }, []);

    expect(installs).to.have.lengthOf(2);
    for (const index of installs) {
      expect(titles[index + 1]).to.equal('Link underpost CLI');
      expect(emitted[index + 1]).to.include('npm link --force');
      expect(emitted[index + 1]).to.include('command -v underpost');
      expect(emitted[index + 1]).to.include('readlink -f ./bin/index.js');
    }
  });

  it('replaces the checkout through the engine CLI, with both repositories named', () => {
    expect(step('Pull repository')).to.include('node bin run pull owner/engine');
    expect(step('Pull repository')).to.include('--repo-engine-private owner/engine-private');
  });

  it('loads the host config last, through the one entry point for that store', () => {
    expect(titles.at(-1)).to.equal('Load host config');
    expect(emitted.at(-1)).to.include('node bin host load');
  });
});
