import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import { ssrFactory } from '../../../src/client-builder/ssr.js';
import { rebaseIconManifests } from '../../../src/client-builder/client-icons.js';

const HEADS = './src/client/ssr/head';

describe('assets of a sub-path build', () => {
  it('roots the icon manifests at the base path, and leaves a root build as it is', () => {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'icon-manifests-'));
    try {
      const write = (name, text) => fs.writeFileSync(`${root}/${name}`, text);
      write(
        'manifest.webmanifest',
        '{"scope": "/", "start_url": "/?homescreen=1", "icons": [{"src": "/android-chrome-36x36.png"}]}',
      );
      write('browserconfig.xml', '<square70x70logo src="/mstile-70x70.png"/>');
      write('yandex-browser-manifest.json', '{"layout": {"logo": "/yandex-browser-50x50.png"}}');
      rebaseIconManifests({ rootClientPath: root, basePath: '/' });
      expect(fs.readFileSync(`${root}/browserconfig.xml`, 'utf8')).toContain('src="/mstile-70x70.png"');
      rebaseIconManifests({ rootClientPath: root, basePath: '/site' });
      expect(JSON.parse(fs.readFileSync(`${root}/manifest.webmanifest`, 'utf8'))).toEqual({
        scope: '/site/',
        start_url: '/site/?homescreen=1',
        icons: [{ src: '/site/android-chrome-36x36.png' }],
      });
      expect(fs.readFileSync(`${root}/browserconfig.xml`, 'utf8')).toBe(
        '<square70x70logo src="/site/mstile-70x70.png"/>',
      );
      expect(fs.readFileSync(`${root}/yandex-browser-manifest.json`, 'utf8')).toContain(
        '"/site/yandex-browser-50x50.png"',
      );
    } finally {
      fs.removeSync(root);
    }
  });

  it.each(fs.readdirSync(HEADS).filter((name) => /^Pwa[A-Z]/.test(name)))(
    'roots the icon links of %s at the base path',
    async (name) => {
      const head = (await ssrFactory(`${HEADS}/${name}`))({ ssrPath: '/site/' });
      const hrefs = [...head.matchAll(/\b(?:href|content)="(\/[^"]*)"/g)].map(([, value]) => value);
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.filter((value) => !value.startsWith('/site/'))).toEqual([]);
    },
  );
});
