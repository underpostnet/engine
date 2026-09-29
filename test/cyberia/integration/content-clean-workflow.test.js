import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

// This suite runs the CLI with temporary child commands and needs no live services.
describe('content cleanup workflow', () => {
  const cli = new URL('../../../bin/cyberia.js', import.meta.url).pathname;
  let workspace;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-clean-workflow-'));
    fs.outputFileSync(
      path.join(workspace, 'bin/cyberia'),
      `const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('steps.jsonl', JSON.stringify(args) + '\\n');
process.exit(Number(args[0] === 'run-workflow' ? process.env.TEST_DROP_EXIT : process.env.TEST_PURGE_EXIT));
`,
    );
  });

  afterEach(() => fs.removeSync(workspace));

  const run = (args, exits = [0, 0]) => {
    const result = spawnSync(process.execPath, [cli, 'run-workflow', 'import-content', '--clean', ...args], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 50000,
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
        npm_config_prefix: path.join(workspace, 'npm-global'),
        CYBERIA_CONTENT_ROOT: path.join(workspace, 'absent-content'),
        DEFAULT_DEPLOY_ID: 'dd-clean-test',
        DEFAULT_DEPLOY_HOST: 'cleanup.test',
        DEFAULT_DEPLOY_PATH: '/',
        TEST_DROP_EXIT: String(exits[0]),
        TEST_PURGE_EXIT: String(exits[1]),
      },
    });
    expect(result.error).to.equal(undefined);
    const stepsPath = path.join(workspace, 'steps.jsonl');
    const steps = fs.existsSync(stepsPath) ? fs.readFileSync(stepsPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
    return { ...result, output: `${result.stdout}${result.stderr}`, steps };
  };

  it.each([
    [0, 0],
    [7, 0],
    [0, 9],
    [7, 9],
  ])(
    'runs both steps and reports failures for exit codes %i and %i',
    (dropExit, purgeExit) => {
      const flags = ['--confirm', 'dd-clean-test', '--dev', '--mongo-host', '127.0.0.1:27099'];
      const result = run(flags, [dropExit, purgeExit]);
      expect(result.steps).to.deep.equal([
        ['run-workflow', 'drop-db', ...flags],
        ['ol', '--drop', ...flags],
      ]);
      expect(result.status).to.equal(dropExit || purgeExit ? 1 : 0);
      const failures = result.output.split('\n').filter((line) => line.includes('Clean step failed; rerun:'));
      const expected = [...(dropExit ? ['run-workflow drop-db'] : []), ...(purgeExit ? ['ol --drop'] : [])];
      expect(failures).to.have.length(expected.length);
      expected.forEach((step, index) => {
        expect(failures[index]).to.include(`rerun: node bin/cyberia ${step} ${flags.join(' ')}`);
      });
    },
    60000,
  );

  it('omits optional flags when they are absent', () => {
    const result = run(['--confirm', 'dd-clean-test']);
    expect(result.status).to.equal(0);
    expect(result.steps).to.deep.equal([
      ['run-workflow', 'drop-db', '--confirm', 'dd-clean-test'],
      ['ol', '--drop', '--confirm', 'dd-clean-test'],
    ]);
  }, 60000);

  it('rejects missing confirmation before either step runs', () => {
    const result = run([]);
    expect(result.status).to.equal(1);
    expect(result.steps).to.deep.equal([]);
    expect(result.output).to.include('Pass --confirm <deploy-id>');
  }, 60000);

  it('rejects the wrong deploy confirmation in both real child commands', () => {
    fs.removeSync(path.join(workspace, 'bin/cyberia'));
    fs.symlinkSync(cli, path.join(workspace, 'bin/cyberia'));
    fs.outputJsonSync(path.join(workspace, 'engine-private/conf/dd-clean-test/conf.server.json'), {
      'cleanup.test': {
        '/': { db: { provider: 'mongoose', host: '127.0.0.1:1', name: 'cleanup-test' } },
      },
    });
    const result = run(['--confirm', 'another-deploy', '--dev']);
    expect(result.status).to.equal(1);
    for (const step of ['drop-db', 'ol --drop']) {
      expect(result.output).to.include(`${step} destroys data of dd-clean-test. Pass --confirm dd-clean-test`);
    }
    expect(result.output.split('\n').filter((line) => line.includes('Clean step failed; rerun:'))).to.have.length(2);
  }, 60000);
});
