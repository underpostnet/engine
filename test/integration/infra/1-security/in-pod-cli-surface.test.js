'use strict';

import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import { globSync } from 'node:fs';

// CLI surface added after the published baseline that images in service were built from.
// A command or flag listed here does not exist inside a pod until every image has been rebuilt.
//
// `app` and `host` left this list when the deprecated `env` alias was removed: the payloads
// name `app load`, so an image predating the domain commands must be rebuilt.
//
// `underpost state <operator>` is allowed because the bootstrap stamps `container-status` only
// after `npm link --force`, where `underpost` resolves to the pulled checkout rather than the
// image. Stamping earlier failed with `unknown command 'state'`. `node bin state` stays listed
// for the same reason inverted: it needs the checkout, which exists only after the clone.
const POST_BASELINE = [/\bnode bin state\b/, /\bunderpost state (?!get|set|delete|list)\b/, /\bclient\s+\S+\s+--env\b/];

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
  // To the closing quote at end of line, not to the first quote seen: the assignment embeds
  // quoted words (`"$ENGINE_SRC_REPO"`), and stopping at those truncated the payload to its
  // first few characters — the guard kept passing while seeing almost none of it.
  ...[...source.matchAll(/^[ \t]*pod_cmd="([\s\S]*?)"[ \t]*$/gm)].map((match) => match[1]),
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

// The reroute notice is diagnostic output, so it must not reach stdout: a caller reading a value
// out of `--plain` would otherwise parse the banner as the value. Spawning the real CLI is the
// only way to observe the two streams apart, which is why it lives in this tier rather than
// beside the source assertions in the unit suite.
describe('rerouted plain reads stay machine-readable', () => {
  const CYBERIA_CLI = 'bin/cyberia.js';
  const repoRoot = new URL('../../../../', import.meta.url);

  it.skipIf(!fs.existsSync(new URL(CYBERIA_CLI, repoRoot)))(
    'prints nothing for a key the store lacks',
    () => {
      const stdout = execFileSync(
        process.execPath,
        [CYBERIA_CLI, 'host', 'get', '--plain', 'UNDERPOST_TEST_MISSING_KEY'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect(stdout.trim()).to.equal('');
      // A cold CLI start imports the whole command surface; the budget is for the import, not the
      // read, and is stated here rather than left to the runner default a loaded machine exceeds.
    },
    60000,
  );
});
