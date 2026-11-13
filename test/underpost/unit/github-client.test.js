'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { githubCredential, isGithubHttpsUrl } from '../../../src/server/github/github-credential.js';
import {
  dispatchWorkflow,
  downloadDirectory,
  githubRequest,
  repositoryMetadata,
} from '../../../src/server/github/github-client.js';
import UnderpostGithub from '../../../src/cli/github.js';
import { githubSlug, remoteUrl } from '../../../src/server/git/git.js';

// The Underpost env store is the last credential source: the tests decide what it holds.
const store = vi.hoisted(() => ({ token: '' }));
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  environmentValueFactory: (key) => (key === 'GITHUB_TOKEN' ? store.token : ''),
}));

const TOKEN = 'ghp_fixturefixturefixturefixture0001';

/** A GitHub API stand-in: answers each `METHOD /route` from the table and records every request. */
const github = (routes) => {
  const requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const route = `${init.method ?? 'GET'} ${url.replace('https://api.github.com', '')}`;
      requests.push({ route, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
      const answer = routes[route] ?? { status: 404, body: { message: 'Not Found' } };
      const { status = 200, body, headers = {} } = typeof answer === 'function' ? answer() : answer;
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body === undefined ? '' : JSON.stringify(body));
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(headers),
        arrayBuffer: async () => bytes,
      };
    }),
  );
  return requests;
};

beforeEach(() => {
  store.token = '';
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.stubEnv('GH_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GitHub credential', () => {
  it('resolves in one order: explicit, GITHUB_TOKEN, GH_TOKEN, then the Underpost env store', () => {
    expect(githubCredential()).to.equal(null);
    store.token = 'store-token';
    expect(githubCredential()).to.deep.equal({ token: 'store-token', source: 'underpost-env' });
    vi.stubEnv('GH_TOKEN', 'gh-token');
    expect(githubCredential()).to.deep.equal({ token: 'gh-token', source: 'GH_TOKEN' });
    vi.stubEnv('GITHUB_TOKEN', ' actions-token ');
    expect(githubCredential()).to.deep.equal({ token: 'actions-token', source: 'GITHUB_TOKEN' });
    expect(githubCredential({ token: 'operation-token' })).to.deep.equal({
      token: 'operation-token',
      source: 'explicit',
    });
  });

  it('is sent to GitHub over HTTPS only', () => {
    for (const url of ['https://github.com/o/r', 'https://GitHub.com/o/r.git'])
      expect(isGithubHttpsUrl(url), url).to.equal(true);
    for (const url of [
      'http://github.com/o/r',
      'https://github.com.example.test/o/r',
      'https://gitlab.com/o/r',
      'git@github.com:o/r.git',
      'ssh://git@github.com/o/r',
      'o/r',
      '',
    ])
      expect(isGithubHttpsUrl(url), url).to.equal(false);
  });
});

describe('GitHub REST client', () => {
  it('authenticates with a bearer header only, and pins the API version', async () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const requests = github({ 'GET /repos/o/r': { body: { full_name: 'o/r', default_branch: 'trunk' } } });
    await githubRequest('GET', '/repos/o/r');
    expect(requests[0].headers).to.include({ Authorization: `Bearer ${TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' });
    expect(requests[0].route).to.not.include(TOKEN);
  });

  it('sends no authorization without a credential', async () => {
    const requests = github({ 'GET /repos/o/r': { body: {} } });
    await githubRequest('GET', '/repos/o/r');
    expect(requests[0].headers).to.not.have.property('Authorization');
  });

  it('tells an authorization problem from a missing resource, a refused input and an outage', async () => {
    const cases = {
      'GET /a': [{ status: 401, body: { message: 'Bad credentials' } }, 'authentication'],
      'GET /b': [{ status: 403, body: { message: 'Resource not accessible by integration' } }, 'forbidden'],
      'GET /c': [{ status: 403, body: { message: 'rate' }, headers: { 'x-ratelimit-remaining': '0' } }, 'rate-limited'],
      'GET /d': [{ status: 404, body: { message: 'Not Found' } }, 'not-found'],
      'GET /e': [{ status: 422, body: { message: 'No ref found for: nope' } }, 'invalid'],
      'GET /f': [{ status: 502, body: 'Bad gateway' }, 'unavailable'],
    };
    github(Object.fromEntries(Object.entries(cases).map(([route, [answer]]) => [route, answer])));
    for (const [route, [answer, reason]] of Object.entries(cases)) {
      const error = await githubRequest('GET', route.slice(4)).catch((thrown) => thrown);
      expect(error.reason, route).to.equal(reason);
      expect(error.status, route).to.equal(answer.status);
    }
    const error = await githubRequest('GET', '/e').catch((thrown) => thrown);
    expect(error.message).to.equal('GET /e: 422 No ref found for: nope');
  });

  it('reads the metadata of a repository named by a slug or a URL', async () => {
    github({
      'GET /repos/o/r': {
        body: {
          full_name: 'o/r',
          default_branch: 'main',
          visibility: 'private',
          archived: false,
          permissions: { push: true },
          html_url: 'https://github.com/o/r',
        },
      },
    });
    for (const reference of ['o/r', 'https://github.com/o/r.git', 'git@github.com:o/r.git'])
      expect(await repositoryMetadata(reference), reference).to.deep.equal({
        repository: 'o/r',
        defaultBranch: 'main',
        visibility: 'private',
        archived: false,
        permissions: { push: true },
        url: 'https://github.com/o/r',
      });
    await expect(repositoryMetadata('https://gitlab.com/o/r')).rejects.toThrow('names no GitHub repository');
  });
});

describe('workflow dispatch', () => {
  it('dispatches on the default branch with string inputs, and names the run GitHub created', async () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const requests = github({
      'GET /repos/o/r': { body: { full_name: 'o/r', default_branch: 'trunk' } },
      'POST /repos/o/r/actions/workflows/engine-core.ci.yml/dispatches': {
        body: { workflow_run_id: 42, html_url: 'https://github.com/o/r/actions/runs/42' },
      },
    });
    const output = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => output.push(`${chunk}`) || true);
    const run = await dispatchWorkflow({
      repository: 'o/r',
      workflow: 'engine-core.ci.yml',
      inputs: { sync: true, deploy_type: '', change_summary: '{"schema":1}', job: undefined },
    });
    vi.mocked(process.stdout.write).mockRestore();
    expect(run).to.deep.equal({
      repository: 'o/r',
      workflow: 'engine-core.ci.yml',
      ref: 'trunk',
      runId: 42,
      url: 'https://github.com/o/r/actions/runs/42',
    });
    expect(requests.at(-1).body).to.deep.equal({
      ref: 'trunk',
      inputs: { sync: 'true', change_summary: '{"schema":1}' },
      return_run_details: true,
    });
    expect(output.join('')).to.not.include(TOKEN);
  });

  it('reports an accepted dispatch without a run as accepted, never as completed', async () => {
    github({ 'POST /repos/o/r/actions/workflows/x.yml/dispatches': { status: 204 } });
    expect(await dispatchWorkflow({ repository: 'o/r', workflow: 'x.yml', ref: 'main' })).to.deep.equal({
      repository: 'o/r',
      workflow: 'x.yml',
      ref: 'main',
      runId: null,
      url: 'https://github.com/o/r/actions/workflows/x.yml',
    });
  });

  it('fails on a missing workflow or an invalid ref, and refuses a workflow name that is a path', async () => {
    github({
      'POST /repos/o/r/actions/workflows/missing.yml/dispatches': { status: 404, body: { message: 'Not Found' } },
      'POST /repos/o/r/actions/workflows/x.yml/dispatches': {
        status: 422,
        body: { message: 'No ref found for: nope' },
      },
    });
    expect(
      (await dispatchWorkflow({ repository: 'o/r', workflow: 'missing.yml', ref: 'main' }).catch((e) => e)).reason,
    ).to.equal('not-found');
    expect(
      (await dispatchWorkflow({ repository: 'o/r', workflow: 'x.yml', ref: 'nope' }).catch((e) => e)).reason,
    ).to.equal('invalid');
    await expect(dispatchWorkflow({ repository: 'o/r', workflow: '../x.yml' })).rejects.toThrow(
      'is not a workflow file name',
    );
  });

  it('takes repeated --input entries whose values hold separators, newlines and JSON', async () => {
    const requests = github({ 'POST /repos/o/r/actions/workflows/x.yml/dispatches': { status: 204 } });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await UnderpostGithub.API.dispatch('o/r', 'x.yml', {
      ref: 'main',
      input: ['change_summary={"a":"b=c, d"}', 'message=one\ntwo'],
    });
    expect(requests[0].body.inputs).to.deep.equal({ change_summary: '{"a":"b=c, d"}', message: 'one\ntwo' });
    await expect(UnderpostGithub.API.dispatch('o/r', 'x.yml', { input: ['novalue'] })).rejects.toThrow(
      "--input takes key=value, not 'novalue'",
    );
  });
});

describe('repository contents', () => {
  let root;
  beforeEach(() => (root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-contents-'))));
  afterEach(() => fs.removeSync(root));

  it('downloads a directory recursively, bytes as they are, at the ref asked for', async () => {
    const requests = github({
      'GET /repos/o/r/contents/images/rocky?ref=main': {
        body: [
          { name: 'a.json', path: 'images/rocky/a.json', type: 'file' },
          { name: 'sub', path: 'images/rocky/sub', type: 'dir' },
          { name: 'link', path: 'images/rocky/link', type: 'symlink' },
        ],
      },
      'GET /repos/o/r/contents/images/rocky/a.json?ref=main': { body: Buffer.from([0, 255, 1]) },
      'GET /repos/o/r/contents/images/rocky/sub?ref=main': {
        body: [{ name: 'b.txt', path: 'images/rocky/sub/b.txt', type: 'file' }],
      },
      'GET /repos/o/r/contents/images/rocky/sub/b.txt?ref=main': { body: Buffer.from('b') },
    });
    const target = path.join(root, 'rocky');
    const { files } = await downloadDirectory({ repository: 'o/r', directory: 'images/rocky', target, ref: 'main' });
    expect(files).to.deep.equal([path.join(target, 'a.json'), path.join(target, 'sub/b.txt')]);
    expect([...fs.readFileSync(path.join(target, 'a.json'))]).to.deep.equal([0, 255, 1]);
    expect(requests.filter(({ headers }) => headers.Accept === 'application/vnd.github.raw+json')).to.have.length(2);
  });

  it('refuses an existing target, and removes a partial one when the download fails', async () => {
    github({ 'GET /repos/o/r/contents/d': { body: [{ name: 'x', path: 'd/x', type: 'file' }] } });
    await expect(downloadDirectory({ repository: 'o/r', directory: 'd', target: root })).rejects.toThrow('exists');
    const target = path.join(root, 'partial');
    const error = await downloadDirectory({ repository: 'o/r', directory: 'd', target }).catch((thrown) => thrown);
    expect(error.reason).to.equal('not-found');
    expect(fs.existsSync(target)).to.equal(false);
  });
});

describe('the github command', () => {
  it('acts on the GitHub origin of the working directory when no repository is named', async () => {
    const origin = githubSlug(remoteUrl('.'));
    if (!origin) return;
    github({
      [`GET /repos/${origin}`]: {
        body: { full_name: origin, default_branch: 'trunk', visibility: 'public', archived: false, html_url: 'u' },
      },
    });
    const printed = [];
    vi.spyOn(console, 'log').mockImplementation((line) => printed.push(line));
    expect(await UnderpostGithub.API.repo()).to.include({ repository: origin, defaultBranch: 'trunk' });
    expect(JSON.parse(printed[0])).to.include({ repository: origin });
  });

  it('asks for a repository outside a GitHub checkout', async () => {
    const previous = process.cwd();
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-no-origin-'));
    process.chdir(plain);
    try {
      await expect(UnderpostGithub.API.repo()).rejects.toThrow('Name a repository');
    } finally {
      process.chdir(previous);
      fs.removeSync(plain);
    }
  });
});
