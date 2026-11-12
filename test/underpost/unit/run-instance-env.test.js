import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import Underpost from '../../../src/index.js';
import UnderpostRun from '../../../src/cli/run.js';

const DEPLOY_ID = 'dd-fixture';
const TRAFFIC_PLAN = 'traffic plan reached';

describe('run instance projects each instance env file into its Secret', () => {
  const cwd = process.cwd();
  let root;
  let applied;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-run-instance-env-'));
    process.chdir(root);
    const conf = `engine-private/conf/${DEPLOY_ID}`;
    fs.outputJsonSync(`${conf}/conf.instances.json`, [
      {
        id: 'game',
        host: 'game.example.com',
        cmd: { production: ['exec game'] },
        multiInstance: { variants: ['/', '/test'] },
      },
    ]);
    fs.outputFileSync(`${conf}/instances/game/env/production.env`, 'GAME_KEY=value\n');

    applied = [];
    vi.spyOn(Underpost.ingress, 'provider').mockReturnValue('contour');
    vi.spyOn(Underpost.host, 'apply').mockReturnValue({});
    vi.spyOn(Underpost.app, 'apply').mockImplementation(async (context) => applied.push(context));
    vi.spyOn(Underpost.deploy, 'getCurrentTraffic').mockImplementation(() => {
      throw new Error(TRAFFIC_PLAN);
    });
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  const run = (options = {}) =>
    UnderpostRun.RUNNERS.instance('', {
      deployId: DEPLOY_ID,
      instanceId: 'game',
      namespace: 'fixture-workloads',
      ...options,
    });

  it('applies the Secret of each variant that has an env file, before the traffic plan', async () => {
    await expect(run()).rejects.toThrow(TRAFFIC_PLAN);
    expect(applied.map(({ env, args }) => ({ env, args }))).toEqual([
      { env: 'production', args: { 'deploy-id': DEPLOY_ID, 'instance-id': 'game' } },
    ]);
  });

  it('applies nothing when the run only exposes the instances', async () => {
    await expect(run({ expose: true })).rejects.toThrow(TRAFFIC_PLAN);
    expect(applied).toEqual([]);
    expect(Underpost.host.apply).not.toHaveBeenCalled();
  });
});
