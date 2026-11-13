'use strict';

import { expect } from 'chai';
import { gitAuth, githubSlug, remoteUrlFactory, syncScript } from '../../../src/server/git/git.js';

const store = vi.hoisted(() => ({ token: '' }));
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  environmentValueFactory: (key) => (key === 'GITHUB_TOKEN' ? store.token : ''),
}));

const TOKEN = 'github-token-fixture';
const header = (value) => Buffer.from(value.split(' ').pop(), 'base64').toString();

beforeEach(() => {
  store.token = '';
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.stubEnv('GH_TOKEN', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('repository references', () => {
  it('names a GitHub repository over HTTPS for a slug, and keeps every other reference as given', () => {
    expect(remoteUrlFactory('underpostnet/engine')).to.equal('https://github.com/underpostnet/engine');
    expect(remoteUrlFactory('owner/spark-template.g8')).to.equal('https://github.com/owner/spark-template.g8');
    for (const reference of [
      'https://github.com/underpostnet/engine.git',
      'git@github.com:underpostnet/engine.git',
      'ssh://git@gitlab.example.test:2222/team/app.git',
      'file:///srv/git/app.git',
      '/srv/git/app.git',
      './relative.git',
      '../sibling',
    ])
      expect(remoteUrlFactory(reference), reference).to.equal(reference);
  });

  it('drops the credential an HTTP reference embeds, never the user of an SSH one', () => {
    expect(remoteUrlFactory('https://x-access-token:stale@github.com/o/r.git')).to.equal('https://github.com/o/r.git');
    expect(remoteUrlFactory('http://user@example.test/r.git')).to.equal('http://example.test/r.git');
    expect(remoteUrlFactory('ssh://git@github.com/o/r')).to.equal('ssh://git@github.com/o/r');
  });

  it('refuses what names no repository', () => {
    for (const reference of ['', 'engine', 'a/b/c', '--upload-pack=x', undefined])
      expect(() => remoteUrlFactory(reference), `${reference}`).to.throw(
        'is not an owner/repo reference or a clone URL',
      );
  });

  it('reads the slug of a GitHub remote in any transport, and none of another host', () => {
    for (const url of [
      'https://github.com/o/r',
      'https://github.com/o/r.git',
      'https://github.com/o/r/',
      'git@github.com:o/r.git',
      'ssh://git@github.com/o/r.git',
    ])
      expect(githubSlug(url), url).to.equal('o/r');
    for (const url of ['https://gitlab.com/o/r', 'https://github.com/o', 'file:///o/r', '', undefined])
      expect(githubSlug(url), `${url}`).to.equal('');
  });
});

describe('Git authentication', () => {
  it('sends the GitHub credential to GitHub HTTPS remotes only, as a header scoped to the host', () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const { credential, variables } = gitAuth('https://github.com/o/r.git', { env: {} });
    expect(credential).to.equal('GITHUB_TOKEN');
    expect(variables).to.deep.include({
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '3',
      // Only this host's stored accounts are reset: no other account answers in place of the credential.
      GIT_CONFIG_KEY_0: 'credential.https://github.com.helper',
      GIT_CONFIG_VALUE_0: '',
      // An inherited header, such as the one actions/checkout persists, is reset before this one.
      GIT_CONFIG_KEY_1: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_1: '',
      GIT_CONFIG_KEY_2: 'http.https://github.com/.extraheader',
    });
    expect(header(variables.GIT_CONFIG_VALUE_2)).to.equal(`x-access-token:${TOKEN}`);
    expect(JSON.stringify(variables)).to.not.include(TOKEN);
  });

  it('reaches a GitHub SSH remote over HTTPS with the credential, for the command only', () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    for (const url of ['git@github.com:o/r.git', 'ssh://git@github.com/o/r']) {
      const { credential, variables } = gitAuth(url, { env: {} });
      expect(credential, url).to.equal('GITHUB_TOKEN');
      expect(variables, url).to.deep.include({
        GIT_CONFIG_COUNT: '5',
        GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
        GIT_CONFIG_VALUE_0: 'git@github.com:',
        GIT_CONFIG_KEY_1: 'url.https://github.com/.insteadOf',
        GIT_CONFIG_VALUE_1: 'ssh://git@github.com/',
        GIT_CONFIG_KEY_2: 'credential.https://github.com.helper',
        GIT_CONFIG_KEY_4: 'http.https://github.com/.extraheader',
      });
      expect(header(variables.GIT_CONFIG_VALUE_4), url).to.equal(`x-access-token:${TOKEN}`);
    }
  });

  it('keeps the native authentication of other hosts, and of a GitHub SSH remote without a credential', () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    for (const url of ['https://gitlab.com/o/r.git', 'git@gitlab.com:o/r.git', 'file:///r.git', undefined])
      expect(gitAuth(url, { env: {} }), `${url}`).to.deep.equal({
        credential: 'none',
        variables: { GIT_TERMINAL_PROMPT: '0' },
      });
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '');
    expect(gitAuth('git@github.com:o/r.git', { env: {} })).to.deep.equal({
      credential: 'none',
      variables: { GIT_TERMINAL_PROMPT: '0' },
    });
  });

  it('leaves the stored accounts of a GitHub remote alone when no credential is configured', () => {
    expect(gitAuth('https://github.com/o/r', { env: {} })).to.deep.equal({
      credential: 'none',
      variables: { GIT_TERMINAL_PROMPT: '0' },
    });
  });

  it('appends after the Git configuration the environment already carries', () => {
    const { variables } = gitAuth('https://github.com/o/r', {
      token: TOKEN,
      env: { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_KEY_1: 'c.d' },
    });
    expect(variables.GIT_CONFIG_COUNT).to.equal('5');
    expect(Object.keys(variables).filter((key) => key.startsWith('GIT_CONFIG_KEY_'))).to.deep.equal([
      'GIT_CONFIG_KEY_2',
      'GIT_CONFIG_KEY_3',
      'GIT_CONFIG_KEY_4',
    ]);
  });

  it('takes the credential of the operation over the environment', () => {
    vi.stubEnv('GITHUB_TOKEN', 'environment-token');
    const { credential, variables } = gitAuth('https://github.com/o/r', { token: TOKEN, env: {} });
    expect(credential).to.equal('explicit');
    expect(header(variables.GIT_CONFIG_VALUE_2)).to.equal(`x-access-token:${TOKEN}`);
  });
});

describe('the checkout replacement a node runs with plain Git', () => {
  it('points origin at the repository, fetches the branch and replaces the tree, in a subshell of its own', () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const script = syncScript({ repository: 'o/r', path: './engine-private', branch: 'main' });
    expect(script).to.match(/^\( export GIT_TERMINAL_PROMPT='0' GIT_CONFIG_KEY_0=/);
    expect(script).to.match(/ \)$/);
    const steps = script.slice(script.indexOf(' && ') + 4, -2).split(' && ');
    expect(steps).to.deep.equal([
      "{ git -C './engine-private' 'remote' 'set-url' 'origin' 'https://github.com/o/r' || git -C './engine-private' 'remote' 'add' 'origin' 'https://github.com/o/r'; }",
      "git -C './engine-private' 'fetch' '--quiet' '--force' 'origin' '+refs/heads/main:refs/remotes/origin/main'",
      "git -C './engine-private' 'checkout' '--quiet' '--force' '-B' 'main' '--track' 'refs/remotes/origin/main'",
      "git -C './engine-private' 'clean' '--quiet' '-f' '-d'",
    ]);
    expect(script).to.not.include(TOKEN);
  });

  it('refuses a branch that an argument parser would read as an option or a revision expression', () => {
    for (const branch of ['--upload-pack=touch /tmp/x', 'a..b', 'a b', 'main~1', 'x.lock', ''])
      expect(() => syncScript({ repository: 'o/r', path: '.', branch }), branch).to.throw('is not a valid branch name');
  });
});
