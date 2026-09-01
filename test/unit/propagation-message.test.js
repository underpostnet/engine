'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
// Named import: js-yaml's ESM build exports no default.
import { load } from 'js-yaml';
import { globSync } from 'node:fs';
import Underpost from '../../src/index.js';

const wrapped = (body) => `ci(package-pwa-microservices-template-ghpkg): ⚙️ ${body}`;

const workflows = () =>
  globSync('.github/workflows/*.yml').map((file) => ({
    file,
    source: fs.readFileSync(file, 'utf8'),
    document: load(fs.readFileSync(file, 'utf8')),
  }));

const runScripts = (document) =>
  Object.values(document?.jobs ?? {}).flatMap((job) => (job.steps ?? []).map((step) => step.run).filter(Boolean));

describe('propagation message', () => {
  describe('resolvePropagationMessage', () => {
    it('keeps every entry of a payload a previous hop committed', () => {
      // The regression this guards: each hop commits the payload through `cmt`, which puts the
      // newest entry on the subject line after the type prefix. Dropping the subject line — the
      // obvious way to strip the prefix — silently propagated only the older entries onward.
      const resolved = Underpost.repo.resolvePropagationMessage(
        wrapped(
          '[cli-repository] Add fastForwardEnginePair method\n[test] Fix coverall\n[package] Remove clean script',
        ),
      );
      expect(resolved.split('\n')).to.deep.equal([
        '[cli-repository] Add fastForwardEnginePair method',
        '[test] Fix coverall',
        '[package] Remove clean script',
      ]);
    });

    it('carries characters a shell would have eaten', () => {
      const resolved = Underpost.repo.resolvePropagationMessage(wrapped('[cli] Add $HOME lookup\n[test] Fix "quoted"'));
      expect(resolved).to.equal('[cli] Add $HOME lookup\n[test] Fix "quoted"');
    });

    it('leaves an unwrapped payload alone and drops blank lines', () => {
      expect(Underpost.repo.resolvePropagationMessage('[a] one\n\n  [b] two  ')).to.equal('[a] one\n[b] two');
    });

    it('reports nothing to propagate for an empty payload', () => {
      expect(Underpost.repo.resolvePropagationMessage('')).to.equal('');
      expect(Underpost.repo.resolvePropagationMessage(undefined)).to.equal('');
      expect(Underpost.repo.resolvePropagationMessage(wrapped(''))).to.equal('');
    });
  });

  describe('workflow chain', () => {
    it('never expands a propagated message inside a run script', () => {
      // `${{ }}` is substituted into the script before the shell parses it, so a multi-line
      // payload holding `$` is corrupted and one holding `$(...)` executes. Every hop has to
      // read it from the environment instead.
      const offences = [];
      for (const { file, document } of workflows())
        for (const script of runScripts(document))
          if (/\$\{\{[^}]*\.message[^}]*\}\}/.test(script)) offences.push(`${file}: message expanded in a run script`);
      expect(offences, offences.join('\n')).to.deep.equal([]);
    });

    it('resolves every propagated commit message through the CLI', () => {
      // One resolver for the whole chain: a workflow that rebuilds the payload with its own shell
      // parsing is how the entries drifted apart between repositories.
      const offences = [];
      for (const { file, source } of workflows())
        if (source.includes('LAST_COMMIT_MESSAGE=') && !source.includes('cmt --propagate-msg'))
          offences.push(`${file}: builds a commit message without \`cmt --propagate-msg\``);
      expect(offences, offences.join('\n')).to.deep.equal([]);
    });
  });
});
