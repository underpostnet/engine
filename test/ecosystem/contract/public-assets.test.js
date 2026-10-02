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

// The directories the storage manifests fill with private assets.
const privateDirectories = [
  ...['breastplate', 'coin', 'custom-biome', 'floor', 'joy', 'lore', 'quest', 'skill', 'skin', 'weapon'].map(
    (name) => `src/client/public/cyberia/assets/${name}`,
  ),
  ...['background', 'pixel-gif'].map((name) => `src/client/public/underpost/assets/${name}`),
];
const privatePaths = privateDirectories.map((directory) => `${directory}/private.png`);

// A sliced tree that carries no application source has no assets to own.
const carriesApplications = fs.existsSync(new URL('src/client/public/cyberia', root));

describe.skipIf(!carriesApplications)('application asset ownership', () => {
  it.each(['cyberia', 'underpost'])('tracks the %s application source in engine', (client) => {
    const base = `src/client/public/${client}`;
    for (const file of ['favicon.ico', 'browserconfig.xml', 'site.webmanifest', 'microdata.json', 'sitemap']) {
      expect(tracked).toContain(`${base}/${file}`);
      expect(fs.statSync(new URL(`${base}/${file}`, root)).isFile()).toBe(true);
    }
    expect(fs.existsSync(new URL(`${base}/.git`, root))).toBe(false);
    const head = read(`src/client/ssr/head/Pwa${client[0].toUpperCase()}${client.slice(1)}.js`);
    const linked = [...head.matchAll(/href="\$\{ssrPath\}([^"]+)"/g)].map(([, file]) => `${base}/${file}`);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((file) => !tracked.includes(file))).toEqual([]);
  });

  it('excludes private files from Git', () => {
    expect(git('check-ignore', '--no-index', '--', ...privatePaths).split('\n')).toEqual(privatePaths);
    expect(tracked.filter((file) => privateDirectories.some((directory) => file.startsWith(`${directory}/`)))).toEqual(
      [],
    );
  });

  it.skipIf(!fs.existsSync(conf))('excludes every asset of the storage manifests from Git', () => {
    const keys = ['storage.json', 'storage.underpost.json'].flatMap((name) =>
      Object.keys(JSON.parse(fs.readFileSync(new URL(name, conf), 'utf8'))),
    );
    const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: root,
      encoding: 'utf8',
      input: keys.join('\n'),
    });
    expect(ignored.trim().split('\n')).toEqual(keys);
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

  it.each(['Dockerfile', 'Dockerfile.dev', 'Dockerfile.test'])('%s uses source assets and pinned content', (file) => {
    const source = read(`src/runtime/engine-cyberia/${file}`);
    expect(source).not.toMatch(/cyberia-deployment\/public|node bin fs|cloudinary_cloud_name|storage-id/);
    const pinned = source.indexOf('release list --locked');
    expect(pinned).toBeGreaterThan(source.indexOf('npm install;'));
    expect(source.indexOf('checkout --detach "$CONTENT_REVISION"')).toBeGreaterThan(pinned);
    expect(source.indexOf('node bin/cyberia release verify')).toBeGreaterThan(source.indexOf('tar -xzf'));
    // The engine-cyberia tree carries the application assets into the image.
    expect(source).toContain('cp -a ./"$ENGINE_CYBERIA_REPO"/. /home/dd/engine/');
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
