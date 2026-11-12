import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { program } from '../../../bin/cyberia.js';

// The command tree of the Cyberia CLI is its one registry: one name per command, and the overview of
// the CLI reference lists exactly what it holds.
const bin = new URL('../../../bin/cyberia.js', import.meta.url);
const reference = fs.readFileSync(
  new URL('../../../src/client/public/docs/cyberia/reference/cyberia-cli.md', import.meta.url),
  'utf8',
);
const overview = reference.slice(0, reference.indexOf('\n---\n'));
const listed = [...overview.matchAll(/^\| `([^`]+)` +\|/gm)].map(([, cell]) => cell);
const names = (command) => command.commands.map((child) => child.name()).filter((name) => name !== 'help');
const resolve = (path) =>
  path.reduce((command, name) => command?.commands.find((child) => child.name() === name), program);
const paths = (command, at = []) =>
  command.commands.flatMap((child) => [[...at, child.name()], ...paths(child, [...at, child.name()])]);
const longOptions = (path) => resolve(path).options.map((option) => option.long);

describe('the Cyberia command registry', () => {
  it('lists every root command and every group command in the CLI reference', () => {
    expect(listed.filter((cell) => !cell.includes(' ')).sort()).toEqual(names(program).sort());
    for (const group of ['content', 'instance'])
      expect(listed.filter((cell) => cell.startsWith(`${group} `)).sort()).toEqual(
        names(resolve([group]))
          .map((name) => `${group} ${name}`)
          .sort(),
      );
  });

  it('gives each command one name: no alias and no rewritten command line', () => {
    for (const path of paths(program)) expect(resolve(path).aliases(), path.join(' ')).toEqual([]);
    expect(fs.readFileSync(bin, 'utf8')).not.toMatch(/LEGACY_COMMANDS|canonicalArgv/);
  });

  it('lets each command a content lifecycle records take --cycle', () => {
    for (const path of [
      ['content', 'baseline', 'capture'],
      ['content', 'baseline', 'verify'],
      ['content', 'baseline', 'restore'],
      ['content', 'workspace', 'import'],
      ['content', 'workspace', 'drop'],
      ['content', 'workspace', 'reset'],
      ['content', 'source', 'export-live'],
      ['content', 'import'],
      ['content', 'saga', 'sync'],
      ['content', 'release', 'validate'],
      ['release', 'build'],
      ['release', 'lock'],
      ['release', 'publish'],
    ])
      expect(longOptions(path), path.join(' ')).toContain('--cycle');
  });

  it('keeps the read-only commands free of write options', () => {
    for (const path of [
      ['content', 'saga', 'list'],
      ['content', 'saga', 'inspect'],
      ['content', 'saga', 'check'],
      ['content', 'status'],
      ['content', 'lifecycle', 'list'],
      ['content', 'lifecycle', 'doctor'],
      ['content', 'lifecycle', 'plan'],
      ['content', 'lifecycle', 'handoff'],
      ['content', 'lifecycle', 'inspect'],
      ['instance', 'list'],
    ])
      expect(
        longOptions(path).filter((long) => ['--apply', '--rebind', '--drop', '--import', '--confirm'].includes(long)),
        path.join(' '),
      ).toEqual([]);
    expect(longOptions(['content', 'saga', 'sync'])).toContain('--apply');
    expect(longOptions(['content', 'workspace', 'reset'])).toEqual(expect.arrayContaining(['--confirm', '--dry-run']));
  });
});
