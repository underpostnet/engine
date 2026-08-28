'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { globSync } from 'node:fs';

// CLI surface added after the published baseline that images in service were built from.
// A command or flag listed here does not exist inside a pod until every image has been rebuilt.
//
// `app` and `host` left this list when the deprecated `env` alias was removed: the `--cmd`
// payloads now name `app load`, so an image whose baked engine predates the domain commands
// cannot run them and must be rebuilt. That is the intended breaking change — re-adding the
// alias would hide a pod failure rather than prevent one. `state` stays: nothing in a payload
// needs it yet, so there is no reason to spend the same compatibility break twice.
const POST_BASELINE = [/\bnode bin state\b/, /\bunderpost state\b/, /\bclient\s+\S+\s+--env\b/];

/**
 * Extracts every string that ends up executed inside the workload pod.
 *
 * Three sources, because a payload is not always a literal at the `--cmd` site: a script may
 * assemble it into `pod_cmd` first, and the shared `pod_bootstrap_cmd` helper in lib/host.sh
 * emits the prefix every such payload starts with. Scanning only `--cmd '...'` would see
 * `${pod_cmd}` and silently stop guarding the commands it stands for.
 */
const inPodCommands = (source) => [
  ...[...source.matchAll(/--cmd\s+(['"])([\s\S]*?)\1/g)].map((match) => match[2]),
  ...[...source.matchAll(/^\s*pod_cmd=(['"])([\s\S]*?)\1/gm)].map((match) => match[2]),
  ...[...source.matchAll(/pod_bootstrap_cmd\(\)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[1]),
];

const sources = () =>
  [...globSync('deploy/**/*.sh'), ...globSync('src/cli/*.js')].map((file) => ({
    file,
    // Comments describe the surface; only executable lines have to respect the baseline.
    source: fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(#|\/\/|\*)/.test(line))
      .join('\n'),
  }));

describe('in-pod CLI surface', () => {
  it('finds the `--cmd` payloads it is meant to guard', () => {
    const found = sources().flatMap(({ source }) => inPodCommands(source));
    expect(found.length, 'no --cmd payloads located; the extractor has drifted').to.be.greaterThan(0);
  });

  it('resolves a payload assembled into a variable, not just a literal at the --cmd site', () => {
    // Regression guard for the guard: `--cmd '${pod_cmd}'` is opaque to a literal-only scan, so
    // the commands it stands for have to be reachable from the assignment and from the shared
    // helper that builds its prefix.
    const all = sources().flatMap(({ source }) => inPodCommands(source));
    expect(all.some((command) => command.includes('pod_bootstrap_cmd'))).to.equal(true);
    expect(all.some((command) => command.includes('npm link --force'))).to.equal(true);
    expect(all.some((command) => command.includes('underpost start'))).to.equal(true);
  });

  it('never names surface a deployed image cannot have', () => {
    // A `--cmd` payload runs against the engine baked into the image, not this checkout. Naming
    // a newer command there fails the container after it has already pulled and installed.
    const offences = [];
    for (const { file, source } of sources())
      for (const command of inPodCommands(source))
        for (const pattern of POST_BASELINE)
          if (pattern.test(command)) offences.push(`${file}: ${pattern} matched in --cmd payload`);
    expect(offences, offences.join('\n')).to.deep.equal([]);
  });

  it('keeps the pod entry command to `start` alone', () => {
    const deploySource = fs.readFileSync(new URL('../../../../src/cli/deploy.js', import.meta.url), 'utf8');
    const block = deploySource.slice(deploySource.indexOf('if (!cmd)'), deploySource.indexOf('const packageJson'));
    expect([...new Set([...block.matchAll(/`underpost ([a-z-]+)/g)].map((m) => m[1]))]).to.deep.equal(['start']);
  });
});
