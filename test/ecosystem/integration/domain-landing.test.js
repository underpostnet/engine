import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import { docsDocumentsFactory } from '../../../src/server/build/docs.js';
import { buildDocsReferences } from '../../../src/client-builder/client-build-docs.js';

// A domain's landing is its overview document. The client declares the domain, the build
// publishes its overview, and the shell names the domain: this pins the three to each other.
const CONF_CLIENT = './engine-private/conf/dd-cyberia/conf.client.json';
const present = fs.existsSync(CONF_CLIENT);
const conf = () => fs.readJsonSync(CONF_CLIENT);

/** client → the shell that renders its landing. */
const LANDINGS = {
  cryptokoyn: 'src/client/components/cryptokoyn/AppShellCryptokoyn.js',
  itemledger: 'src/client/components/itemledger/AppShellItemledger.js',
  objectlayer: 'src/client/components/objectlayer/AppShellObjectlayer.js',
};

const domainOf = (shell) =>
  fs.readFileSync(shell, 'utf8').match(/MainBodyDocument\.instance\(\{ domain: '([^']+)' \}\)/)?.[1];

describe.skipIf(!present)('a domain landing', () => {
  it('names a domain whose overview its client publishes', () => {
    for (const [client, shell] of Object.entries(LANDINGS)) {
      const domain = domainOf(shell);
      expect(domain, client).toBeTruthy();
      const published = docsDocumentsFactory(conf()[client].docs).map(
        (document) => `${document.domain}/${document.category}/${document.slug}`,
      );
      expect(published, client).toContain(`${domain}/overview/index`);
    }
  });

  it('publishes the whole documentation tree from every client that publishes any of it', () => {
    // A subset would leave a cross-domain link pointing at a document the host never serves.
    for (const [client, entry] of Object.entries(conf()))
      if (entry?.docs?.references) expect(entry.docs.references, client).toEqual(['./src/client/public/docs']);
  });

  it('ships the landing, the documentation view, the renderer and the parser together', () => {
    for (const client of Object.keys(LANDINGS)) {
      const { components, dists } = conf()[client];
      for (const component of ['MainBodyDocument', 'Documentation', 'Markdown'])
        expect(components.core, `${client} ${component}`).toContain(component);
      expect(
        dists.some((dist) => dist.import_name === 'marked'),
        client,
      ).toBe(true);
    }
  });

  it('gives the parser to every client that renders Markdown', () => {
    for (const [client, entry] of Object.entries(conf())) {
      const core = entry?.components?.core ?? [];
      if (!['Content', 'Panel', 'PanelForm', 'MainBodyDocument', 'Documentation'].some((name) => core.includes(name)))
        continue;
      expect(core, client).toContain('Markdown');
      expect(
        entry.dists.some((dist) => dist.import_name === 'marked'),
        client,
      ).toBe(true);
    }
  });

  it('publishes the declared documents, their navigation, and nothing a conf no longer names', async () => {
    const destination = `${fs.mkdtempSync('/tmp/engine-landing-')}/docs/`;
    try {
      const { docs } = conf().objectlayer;
      fs.outputFileSync(`${destination}object-layer/explanation/stale.md`, '# stale');
      const { navigation } = await buildDocsReferences({ docs, docsDestination: destination, proxyPath: '/' });

      const documents = docsDocumentsFactory(docs);
      for (const document of documents) expect(fs.existsSync(`${destination}${document.url.slice(5)}`)).toBe(true);
      expect(fs.existsSync(`${destination}object-layer/explanation/stale.md`)).toBe(false);

      const manifest = fs.readJsonSync(`${destination}manifest.json`);
      expect(manifest).toEqual(navigation);
      expect(manifest.domains.map((domain) => domain.id)).toEqual([
        'ecosystem',
        'object-layer',
        'item-ledger',
        'cyberia',
        'cryptokoyn',
        'nexodev',
        'underpost',
      ]);

      // Published without front matter, and with every document link pointing at the view.
      const overview = fs.readFileSync(`${destination}object-layer/overview/index.md`, 'utf8');
      expect(overview.startsWith('# Object Layer')).toBe(true);
      const landscape = fs.readFileSync(`${destination}ecosystem/architecture/landscape.md`, 'utf8');
      expect(landscape).toContain('](/docs?cid=guide&doc=object-layer/overview/index)');
      expect(landscape).not.toMatch(/\]\([^)]*\.md[)#]/);
    } finally {
      fs.removeSync(destination);
    }
  });
});
