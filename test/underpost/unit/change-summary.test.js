'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
// Named import: js-yaml's ESM build exports no default.
import { load } from 'js-yaml';
import { globSync } from 'node:fs';
import { COMMIT_TYPES, commitMessageFactory } from '../../../src/server/release/commit-message.js';
import {
  CHANGE_SUMMARY_TRAILER,
  changeMarkdown,
  changeMessage,
  changeSummary,
  resolveChangeSummary,
  serializeChangeSummary,
} from '../../../src/server/release/change-summary.js';

const commit = (digit) => digit.repeat(40);

const summary = {
  schema: 1,
  source: { repository: 'underpostnet/engine', revision: commit('a') },
  entries: [
    { scope: 'cli', subject: 'Add the "status" command, `--copy` and $(id) with $HOME', revision: commit('b') },
    { scope: 'test', subject: 'Cover the trailer ✓ ünïcode 日本', revision: commit('c') },
    { scope: 'cli', subject: 'Keep the scope of every entry', revision: commit('d') },
  ],
};

describe('commit messages', () => {
  it('presents a known type with its emoji, and its default description when none is given', () => {
    expect(
      commitMessageFactory({ type: 'ci', scope: 'engine-core-conf', description: 'Update dd-core conf' }),
    ).to.equal('ci(engine-core-conf): ⚙️ Update dd-core conf');
    expect(commitMessageFactory({ type: 'fix' })).to.equal('fix: 🐛 Fix a bug');
  });

  it('takes a custom type with its own description and no emoji', () => {
    expect(commitMessageFactory({ type: 'deps', scope: 'npm', description: 'Bump x' })).to.equal('deps(npm): Bump x');
    expect(() => commitMessageFactory({ type: 'deps' })).to.throw("the custom type 'deps' needs a description");
  });

  it('refuses a subject that is not a Conventional Commit', () => {
    for (const params of [
      { type: 'Feat', description: 'x' },
      { type: 'feat x', description: 'x' },
      { type: 'feat', scope: 'a(b)', description: 'x' },
      { type: '', description: 'x' },
    ])
      expect(() => commitMessageFactory(params), JSON.stringify(params)).to.throw(
        'is not a Conventional Commit subject',
      );
  });

  it('keeps a multi-line description as the subject and the body', () => {
    expect(commitMessageFactory({ type: 'ci', scope: 's', description: 'first\n\nbody' })).to.equal(
      'ci(s): ⚙️ first\n\nbody',
    );
  });

  it('gives every known type an emoji and a description', () => {
    for (const [type, { emoji, description }] of Object.entries(COMMIT_TYPES)) {
      expect(emoji, type).to.not.equal('');
      expect(commitMessageFactory({ type })).to.equal(`${type}: ${emoji} ${description}`);
    }
  });
});

describe('change summary', () => {
  it('serializes one canonical text whatever the key order it was given in', () => {
    const shuffled = {
      entries: summary.entries.map(({ revision, subject, scope }) => ({ revision, subject, scope })),
      source: { revision: commit('a'), repository: 'underpostnet/engine' },
      schema: 1,
    };
    expect(serializeChangeSummary(shuffled)).to.equal(serializeChangeSummary(summary));
    expect(JSON.parse(serializeChangeSummary(summary))).to.deep.equal(summary);
  });

  it('round-trips through the JSON a dispatch input carries', () => {
    expect(resolveChangeSummary(serializeChangeSummary(summary))).to.deep.equal(summary);
  });

  it('reads the summary back from the trailer of a commit, whatever the commit subject wraps it in', () => {
    // A hop commits it through `cmt`, which puts the first entry behind a type, a scope and an emoji;
    // the next hop reads the trailer, never that subject.
    const committed = commitMessageFactory({
      type: 'ci',
      scope: 'package-pwa-microservices-template-ghpkg',
      description: changeMessage(summary),
    });
    expect(resolveChangeSummary(committed)).to.deep.equal(summary);
    // And so does every hop after it, which commits the rendered message as it is.
    expect(resolveChangeSummary(changeMessage(resolveChangeSummary(committed)))).to.deep.equal(summary);
  });

  it('renders one line per entry, each with its own scope and every character it holds, then the trailer', () => {
    expect(changeMessage(summary).split('\n')).to.deep.equal([
      '[cli] Add the "status" command, `--copy` and $(id) with $HOME',
      '[test] Cover the trailer ✓ ünïcode 日本',
      '[cli] Keep the scope of every entry',
      '',
      `${CHANGE_SUMMARY_TRAILER}: ${serializeChangeSummary(summary)}`,
    ]);
  });

  it('takes a plain message as entries, one per line, a tagged line keeping its scope', () => {
    expect(resolveChangeSummary('[a] one\n\n  plain two  \n[b]')).to.deep.equal({
      schema: 1,
      source: {},
      entries: [{ scope: 'a', subject: 'one' }, { subject: 'plain two' }, { subject: '[b]' }],
    });
  });

  it('carries nothing for an empty value, and renders no message for a summary without entries', () => {
    for (const empty of ['', '  \n ', undefined, null]) expect(resolveChangeSummary(empty), `${empty}`).to.equal(null);
    expect(changeMessage({ schema: 1, source: {}, entries: [] })).to.equal('');
  });

  it('refuses a payload of another schema, a corrupted trailer and broken JSON', () => {
    expect(() => resolveChangeSummary('{"schema":2,"entries":[]}')).to.throw('unsupported schema 2');
    expect(() => resolveChangeSummary(`x\n\n${CHANGE_SUMMARY_TRAILER}: {"schema":1,"entries":[{}]}`)).to.throw(
      'every entry needs a subject',
    );
    expect(() => resolveChangeSummary('{"schema":1,"entries":')).to.throw(SyntaxError);
    expect(() => changeSummary({ schema: 1 })).to.throw('entries must be a list');
  });

  it('keeps only revisions that are commit ids', () => {
    expect(
      changeSummary({ schema: 1, source: { revision: 'HEAD' }, entries: [{ subject: 'x', revision: 'main' }] }),
    ).to.deep.equal({ schema: 1, source: {}, entries: [{ subject: 'x' }] });
  });

  it('renders Markdown grouped by scope, each entry linked to its commit in the source repository', () => {
    const link = (digit) => `([${digit.repeat(9)}](https://github.com/underpostnet/engine/commit/${commit(digit)}))`;
    expect(changeMarkdown(summary)).to.equal(
      [
        '### cli',
        '',
        `- Add the "status" command, \`--copy\` and $(id) with $HOME ${link('b')}`,
        `- Keep the scope of every entry ${link('d')}`,
        '',
        '### test',
        '',
        `- Cover the trailer ✓ ünïcode 日本 ${link('c')}`,
        '',
        '',
      ].join('\n'),
    );
    expect(changeMarkdown({ schema: 1, source: {}, entries: [{ subject: 'plain' }] })).to.equal('- plain\n\n');
  });
});

describe('the workflow chain', () => {
  const workflows = globSync('.github/workflows/*.yml').map((file) => ({
    file,
    source: fs.readFileSync(file, 'utf8'),
    document: load(fs.readFileSync(file, 'utf8')),
  }));
  const runScripts = (document) =>
    Object.values(document?.jobs ?? {}).flatMap((job) => (job.steps ?? []).map((step) => step.run).filter(Boolean));
  const dispatchInputs = (document) => Object.keys(document?.on?.workflow_dispatch?.inputs ?? {});

  it('never expands a change summary or a commit message inside a run script', () => {
    // `${{ }}` is substituted into the script before the shell parses it: a summary holding `$` is
    // corrupted, and one holding `$(...)` executes. Every hop reads it from the environment.
    const offences = workflows.flatMap(({ file, document }) =>
      runScripts(document)
        .filter((script) => /\$\{\{[^}]*(change_summary|head_commit\.message|inputs\.message)[^}]*\}\}/.test(script))
        .map(() => file),
    );
    expect(offences).to.deep.equal([]);
  });

  it('commits a received summary only as the CLI resolves it', () => {
    const offences = workflows
      .filter(({ source }) => source.includes('CHANGE_MESSAGE'))
      .filter(({ source }) => !source.includes('release --change-summary --format message'))
      .map(({ file }) => file);
    expect(offences).to.deep.equal([]);
  });

  it('names the payload change_summary wherever a workflow receives one', () => {
    for (const { file, document } of workflows) expect(dispatchInputs(document), file).to.not.include('message');
    expect(workflows.some(({ document }) => dispatchInputs(document).includes('change_summary'))).to.equal(true);
  });

  it('reaches GitHub with no token in a URL, a header or a command argument', () => {
    // The CLI sends the credential: Git through its child environment, the REST API as a header of its own request.
    const offences = workflows.flatMap(({ file, source }) =>
      [/https:\/\/\$\{?\w+\}?@/, /x-access-token/, /Authorization:/i, /api\.github\.com\/repos/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`),
    );
    expect(offences).to.deep.equal([]);
  });
});
