'use strict';

/**
 * @module test/support/saga-content
 * @description A cyberia-content source checkout for the Saga Engine suites: one saga package and a
 * `bin/cyberia-content.js` that answers `saga step` and `saga check` with the contract of the real
 * CLI, without Gemini and without content rules. The prompt of a request steers a step:
 * `refuse` refuses the request (exit 2), `fail-once:<step>` fails that step once (exit 1), and
 * `hang:<step>` runs that step until the process is stopped. A check finds a definition whose id
 * ends in `broken`.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The steps of the stub generator, in order. */
export const STUB_STEPS = Object.freeze([
  'theme',
  'composition',
  'maps',
  'quests',
  'dialogues',
  'actions',
  'abilities',
  'package',
]);

/** A saga package of the stub: one quest. */
export const stubPackage = (code = 'frontier', extra = []) => ({
  schemaVersion: 2,
  foundationVersion: '3.0.0',
  saga: { code, name: `Saga ${code}`, description: `The ${code} saga.` },
  references: ['character.drift-merchant'],
  definitions: [
    {
      id: 'quest.relay-first',
      name: 'Relay First',
      description: 'Talk to the merchant.',
      role: 'The first quest.',
      provider: 'character.drift-merchant',
    },
    ...extra,
  ],
});

const CLI = `import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const steps = ${JSON.stringify(STUB_STEPS)};
const [, , group, command, , file, write] = process.argv;
const save = (target, value) => {
  fs.writeFileSync(target + '.next', value);
  fs.renameSync(target + '.next', target);
};
if (group === 'saga' && command === 'step') {
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  const step = steps.find((id) => !state.done.includes(id));
  if (!step) process.exit(0);
  const prompt = state.request.prompt ?? '';
  if (prompt === 'refuse') {
    console.error('Unknown definitions to reuse: weapon.nothing');
    process.exit(2);
  }
  if (prompt === 'hang:' + step) setInterval(() => {}, 1000);
  else {
    const marker = path.join(root, '.failed-' + step);
    if (prompt === 'fail-once:' + step && !fs.existsSync(marker)) {
      fs.writeFileSync(marker, '');
      console.error('Gemini answered 503');
      process.exit(1);
    }
    console.log('Stage ' + step);
    const code = state.request.saga?.code || 'relay-watch';
    const pkg = ${'${PACKAGE}'};
    save(file, JSON.stringify({ ...state, steps, done: [...state.done, step], ...(step === 'package' && { package: pkg, findings: [] }) }));
  }
} else if (group === 'saga' && command === 'check') {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = (pkg.definitions ?? [])
    .filter(({ id }) => id.endsWith('broken'))
    .map(({ id }) => ({ id, message: 'provider names unknown definition character.nobody' }));
  let written = null;
  if (write === '--write' && findings.length === 0) {
    written = path.join(root, 'src', 'content', 'sagas', pkg.saga.code + '.json');
    save(written, JSON.stringify(pkg, null, 2) + '\\n');
  }
  process.stdout.write(JSON.stringify({ findings, file: written }));
} else process.exit(64);
`;

/**
 * Writes the stub checkout to `root`: `src/content/sagas/<code>.json` for each package, and the CLI.
 * @param {string} root
 * @param {Object[]} [packages]
 * @returns {string} The root.
 */
export function writeSagaContent(root, packages = [stubPackage()]) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'content', 'sagas'), { recursive: true });
  const generated = `({ ...${JSON.stringify(stubPackage())}, saga: { code, name: 'Generated ' + code, description: 'A generated saga.' } })`;
  fs.writeFileSync(path.join(root, 'bin', 'cyberia-content.js'), CLI.replace('${PACKAGE}', generated));
  for (const pkg of packages)
    fs.writeFileSync(
      path.join(root, 'src', 'content', 'sagas', `${pkg.saga.code}.json`),
      JSON.stringify(pkg, null, 2) + '\n',
    );
  return root;
}
