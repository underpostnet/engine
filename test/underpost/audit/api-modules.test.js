// Platform invariants of the API modules, read from the source: each module states the contract of
// `src/api/types.js`, receives no runtime infrastructure, and starts no work outside its lifecycle.

import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileRefDefects } from '../../../src/api/file/file.ref.js';
import { unslicedTree } from '../../support/tree.js';

const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => fs.readFileSync(nodePath.join(ROOT, file), 'utf8');
/** The source without its comments: a `#swagger` comment may name anything. */
const code = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ROUTERS = fs
  .readdirSync(nodePath.join(ROOT, 'src/api'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => `src/api/${name}/${name}.router.js`)
  .filter((file) => fs.existsSync(nodePath.join(ROOT, file)));
const EXTENSIONS = fs
  .readdirSync(nodePath.join(ROOT, 'src/projects'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap(({ name }) =>
    fs
      .readdirSync(nodePath.join(ROOT, 'src/projects', name))
      .filter((file) => file.endsWith('.extension.js'))
      .map((file) => `src/projects/${name}/${file}`),
  );

/** Each rule a router source breaks, with the line that breaks it. */
const RULES = [
  [/\bexport const ApiModule = \{/, 'exports no ApiModule definition', true],
  [/\bApiRouter\b|static router\(/, 'keeps a router factory outside the module contract'],
  [/\bapp\.(use|get|post|put|delete|set|listen)\(/, 'uses an Express application'],
  [/\boptions\.png\b|\bcontext\.png\b|\.png\s*=/, 'keeps a mutable asset cache'],
  [/\(async \(\) => \{/, 'starts asynchronous work outside initialize'],
  [/\bPromise\.resolve\(\)\s*\.then\(/, 'starts asynchronous work outside initialize'],
  [/from '[./]*\/db\/database-provider\.js'/, 'reads the database provider instead of its database service'],
  [/from '[./]*\/mailer\/mailer-provider\.js'/, 'reads the mailer provider instead of its mailer service'],
  [/\bauthMiddleware\b/, 'reads the token check outside the auth service'],
];

describe('the API modules', () => {
  it('hold a router module for each API', () => {
    expect(ROUTERS.length).toBeGreaterThan(0);
  });

  it.each(ROUTERS)('%s states the module contract and receives no runtime infrastructure', (file) => {
    const source = code(file);
    const api = nodePath.basename(file, '.router.js');
    const broken = RULES.filter(([pattern, , required]) => pattern.test(source) !== !!required).map(([, rule]) => rule);
    if (!new RegExp(`\\bid: '${api}',`).test(source)) broken.push(`names an id other than ${api}`);
    expect(broken).toEqual([]);
  });

  it.each(EXTENSIONS)('%s names the API it extends and mounts through the context', (file) => {
    const source = code(file);
    const api = nodePath.basename(file, '.extension.js');
    expect(source).toMatch(new RegExp(`export const api = '${api}';`));
    expect(fs.existsSync(nodePath.join(ROOT, `src/api/${api}/${api}.router.js`))).toBe(true);
    expect(source).toMatch(/export function mount\(router, context\)/);
    expect(source).not.toMatch(/\bauthMiddleware\b/);
  });

  it('types the contract without a bare Object, Function or any', () => {
    const contract = read('src/api/types.js');
    const loose = [];
    for (const { 0: tag, 1: name, index } of contract.matchAll(/@(typedef|property|param|returns) \{/g)) {
      let depth = 1;
      let end = index + tag.length;
      while (depth) depth += { '{': 1, '}': -1 }[contract[end++]] ?? 0;
      const type = contract.slice(index + tag.length, end - 1).replace(/\n\s*\*/g, ' ');
      const bare = /\b(Object|Function)\b(?!<)|\bany\b|\*/.test(type);
      if (bare && !(name === 'typedef' && type === 'Object')) loose.push(`@${name} {${type}}`);
    }
    expect(loose).toEqual([]);
    for (const type of [
      'ApiRuntimeIdentity',
      'ApiAuthPrincipal',
      'ApiRequest',
      'ApiServices',
      'ApiDatabaseService',
      'ApiAuthService',
      'ApiMailerService',
      'ApiAsset',
      'ApiExtension',
      'ApiRouterContext',
      'ApiModuleDefinition',
    ])
      expect(contract).toMatch(new RegExp(`\\}\\s*${type}\\b|\\} ${type}\\n`));
  });

  it('registers every File reference of every model schema', async () => {
    // A sliced tree ships some of the registered APIs.
    const defects = (await fileRefDefects()).filter((defect) => unslicedTree || !defect.includes(': no api model '));
    expect(defects).toEqual([]);
  });
});
