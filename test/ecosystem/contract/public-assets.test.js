import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const tracked = git('ls-files', 'src/client/public/cyberia', 'src/client/public/underpost').split('\n');
const conf = new URL('engine-private/conf/dd-cyberia/', root);
const deployment = new URL('cyberia-deployment/', root);

const privatePaths = [
  ...['lore', 'custom-biome', 'skin', 'weapon', 'quest', 'joy'].map(
    (name) => `src/client/public/cyberia/assets/${name}/private.png`,
  ),
  ...['pixel-gif', 'background'].map((name) => `src/client/public/underpost/assets/${name}/private.png`),
  'src/client/public/cyberia/assets/ui-icons/private.png',
  'src/client/public/underpost/private.json',
];

describe('application asset ownership', () => {
  it.each(['cyberia', 'underpost'])('tracks the %s application source in engine', (client) => {
    const base = `src/client/public/${client}`;
    for (const file of ['favicon.ico', 'browserconfig.xml', 'site.webmanifest', 'microdata.json', 'sitemap']) {
      expect(tracked).toContain(`${base}/${file}`);
      expect(fs.statSync(new URL(`${base}/${file}`, root)).isFile()).toBe(true);
    }
    expect(fs.existsSync(new URL(`${base}/.git`, root))).toBe(false);
    expect(tracked.some((file) => file.startsWith(`${base}/assets/splash/`))).toBe(true);
  });

  it('excludes private files from Git', () => {
    expect(git('check-ignore', '--no-index', '--', ...privatePaths).split('\n')).toEqual(privatePaths);
    expect(
      tracked.some((file) => /\/assets\/(lore|custom-biome|skin|weapon|quest|joy|pixel-gif|background)\//.test(file)),
    ).toBe(false);
  });

  it('does not synchronize public source during deployment', () => {
    const script = read('deploy/dd-cyberia/sync-deploy.sh');
    expect(script).not.toMatch(/CYBERIA_ASSETS|UNDERPOST_ASSETS|node bin fs|src\/client\/public/);
    const cli = read('bin/cyberia.js');
    expect(cli).not.toContain('--git-clean');
    expect(cli).not.toMatch(
      /publishPublicAssets|PUBLIC_ASSET_SYNC|command\('cp-assets'\)|\$\{deployment(?:Root)?\}\/public/,
    );
  });

  it('refreshes application assets from engine source during cluster startup', () => {
    const source = read('src/cli/run.js');
    for (const client of ['cyberia', 'underpost'])
      expect(source).toContain(
        `cp -a ./engine-cyberia/src/client/public/${client}/. /home/dd/engine/src/client/public/${client}/`,
      );
  });

  it.each(['Dockerfile', 'Dockerfile.dev', 'Dockerfile.test'])('%s uses source assets and pinned content', (file) => {
    const source = read(`src/runtime/engine-cyberia/${file}`);
    expect(source).not.toMatch(/cyberia-deployment\/public|node bin fs|cloudinary_cloud_name|storage-id/);
    expect(source).toContain('content-lock.json').toContain('sourceRevision');
    expect(source).toContain('node bin/cyberia content status --lock');
  });

  it.skipIf(!fs.existsSync(deployment))('keeps deployment state free of application and semantic content trees', () => {
    for (const name of ['public', 'instances', 'sagas']) expect(fs.existsSync(new URL(name, deployment))).toBe(false);
    expect(
      execFileSync('git', ['ls-files', 'public', 'instances', 'sagas'], { cwd: deployment, encoding: 'utf8' }).trim(),
    ).toBe('');
  });

  it.skipIf(!fs.existsSync(conf))('keeps only private assets in active storage manifests', () => {
    expect(fs.existsSync(new URL('storage.engine-cyberia.json', conf))).toBe(false);
    for (const name of fs.readdirSync(conf).filter((file) => /^storage(?:\.[\w-]+)?\.json$/.test(file))) {
      const keys = Object.keys(JSON.parse(fs.readFileSync(new URL(name, conf), 'utf8')));
      expect(keys.filter((key) => tracked.includes(path.normalize(key)))).toEqual([]);
    }
    for (const name of ['storage.json', 'storage.underpost.json'])
      expect(Object.keys(JSON.parse(fs.readFileSync(new URL(name, conf), 'utf8'))).length).toBeGreaterThan(0);
    const volumes = JSON.parse(fs.readFileSync(new URL('conf.volume.json', conf), 'utf8'));
    for (const { volumeMountPath } of volumes)
      for (const client of ['cyberia', 'underpost'])
        expect(`/home/dd/engine/src/client/public/${client}/`.startsWith(`${volumeMountPath}/`)).toBe(false);
  });
});
