'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { globSync } from 'node:fs';

// CLI surface added after the published baseline that images in service were built from.
// A command or flag listed here does not exist inside a pod until every image has been rebuilt.
const POST_BASELINE = [
  /\bnode bin app\b/,
  /\bnode bin host\b/,
  /\bnode bin state\b/,
  /\bunderpost app\b/,
  /\bunderpost host\b/,
  /\bunderpost state\b/,
  /\bclient\s+\S+\s+--env\b/,
];

/** Extracts every `--cmd '...'` payload: these strings are executed inside the workload pod. */
const inPodCommands = (source) => [...source.matchAll(/--cmd\s+(['"])([\s\S]*?)\1/g)].map((match) => match[2]);

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
