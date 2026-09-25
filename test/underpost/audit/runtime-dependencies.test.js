import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  auditRuntimeDependencies,
  importPackageNameFactory,
  runtimeImportGraphFactory,
} from '../../../src/server/build/package.js';

// The audit bundles the whole engine, so its time is the host's as much as the graph's.
// On a host with CPU to spare the bundle takes a few seconds: past the budget there, the graph
// grew in a way worth a look. On a saturated host a slow audit says nothing about the code.
const AUDIT_BUDGET_MS = 60_000;
const AUDIT_CEILING_MS = 10 * 60_000;
const SATURATED_LOAD_PER_CPU = 1.5;

/** Whether the host was saturated during the audit, and what to report either way. */
const auditTimeVerdict = ({ elapsedMs }) => {
  const cpus = os.availableParallelism();
  const loadPerCpu = os.loadavg()[0] / cpus;
  const saturated = loadPerCpu > SATURATED_LOAD_PER_CPU;
  const seconds = (elapsedMs / 1000).toFixed(1);
  return {
    saturated,
    message: saturated
      ? `INFRASTRUCTURE: the audit took ${seconds}s on a saturated host (load ${loadPerCpu.toFixed(1)} per CPU, ${cpus} CPUs); the result above is valid, the time is the host's`
      : `APPLICATION: the audit took ${seconds}s on a host with CPU to spare (load ${loadPerCpu.toFixed(1)} per CPU); the budget is ${AUDIT_BUDGET_MS / 1000}s`,
  };
};

describe('runtime dependency audit', () => {
  const tree = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-runtime-graph-'));
    fs.outputJsonSync(path.join(root, 'package.json'), {
      dependencies: { express: '^5.0.0', 'fs-extra': '^11.0.0' },
      devDependencies: { vitest: '5.0.0', bumpp: '^12.0.0' },
    });
    fs.outputFileSync(path.join(root, 'bin/index.js'), "import '../src/cli.js';\n");
    fs.outputFileSync(
      path.join(root, 'src/cli.js'),
      [
        "import express from 'express';",
        "import { helper } from './lib';",
        "/** @type {import('typedoc').Options} */",
        "// import legacy from 'legacy-tool';",
        "export const bump = () => import('bumpp');",
        "export * from './lib/index.js';",
        // A module chosen at runtime from a directory this tree does not ship.
        'export const grpc = (name) => import(`./grpc/${name}/grpc-server.js`);',
        // Source text a command writes to disk and runs elsewhere; not an import of this module.
        'export const script = `',
        "  import hre from 'hardhat';",
        '`;',
      ].join('\n'),
    );
    fs.outputFileSync(
      path.join(root, 'src/lib/index.js'),
      "import fs from 'fs-extra';\nimport nodePath from 'node:path';\nimport { readFileSync } from 'fs';\nexport const helper = 1;\n",
    );
    fs.outputFileSync(
      path.join(root, 'src/api/user/user.router.js'),
      "import { run } from 'vitest';\nimport sharp from 'sharp';\n",
    );
    return root;
  };

  it('names the package a specifier imports', () => {
    expect(importPackageNameFactory('express')).to.equal('express');
    expect(importPackageNameFactory('@grpc/grpc-js/build/x.js')).to.equal('@grpc/grpc-js');
    expect(importPackageNameFactory('socket.io/client-dist/socket.io.esm.min.js')).to.equal('socket.io');
    for (const specifier of [
      './x.js',
      '../y.js',
      '/abs.js',
      'node:fs',
      'fs',
      'path',
      'data:text/javascript,1',
      'https://cdn/x.js',
    ])
      expect(importPackageNameFactory(specifier), specifier).to.equal('');
  });

  it('walks the static graph from the entry points and records dynamic imports as lazy', async () => {
    const root = tree();
    try {
      const graph = await runtimeImportGraphFactory({ root });
      expect(graph.files).to.deep.equal([
        'bin/index.js',
        'src/api/user/user.router.js',
        'src/cli.js',
        'src/lib/index.js',
      ]);
      expect(graph.packages).to.deep.equal({
        express: ['src/cli.js'],
        'fs-extra': ['src/lib/index.js'],
        sharp: ['src/api/user/user.router.js'],
        vitest: ['src/api/user/user.router.js'],
      });
      expect(graph.lazyPackages).to.deep.equal({ bumpp: ['src/cli.js'] });
    } finally {
      fs.removeSync(root);
    }
  });

  it('flags a runtime import declared outside dependencies and accepts a catalog pin', async () => {
    const root = tree();
    try {
      const audit = await auditRuntimeDependencies({ root, catalogs: [{ packageDependencies: { sharp: '^0.35.0' } }] });
      expect(audit).to.include({ dependencies: 2, devDependencies: 2 });
      expect(audit.runtime).to.deep.equal(['express', 'fs-extra', 'sharp', 'vitest']);
      expect(audit.lazy).to.deep.equal(['bumpp (devDependencies)']);
      expect(audit.misplaced).to.deep.equal([
        { name: 'vitest', declaredIn: 'devDependencies', importers: ['src/api/user/user.router.js'] },
      ]);
      const unpinned = await auditRuntimeDependencies({ root, catalogs: [] });
      expect(unpinned.misplaced.map(({ name, declaredIn }) => `${name}:${declaredIn}`)).to.deep.equal([
        'sharp:none',
        'vitest:devDependencies',
      ]);
    } finally {
      fs.removeSync(root);
    }
  });

  it(
    'keeps every package this engine imports at runtime in dependencies',
    async () => {
      // A production install omits devDependencies, so a runtime import from there breaks the
      // published CLI at load time. The whole engine is bundled from its real entry points; the
      // result decides the test, the time only tells a slow host from a slow graph.
      const started = performance.now();
      const audit = await auditRuntimeDependencies();
      const elapsedMs = performance.now() - started;

      expect(audit.misplaced).to.deep.equal([]);
      expect(audit.runtime).to.include.members(['commander', 'esbuild', 'express', 'mongoose']);
      expect(audit.runtime).to.not.include.members(['vitest', 'chai', 'nodemon', 'bumpp']);

      const verdict = auditTimeVerdict({ elapsedMs });
      if (verdict.saturated) console.warn(verdict.message);
      else expect(elapsedMs, verdict.message).to.be.below(AUDIT_BUDGET_MS);
    },
    AUDIT_CEILING_MS,
  );
});
