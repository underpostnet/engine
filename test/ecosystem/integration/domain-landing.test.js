import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import { DOCS_VIEWS, docsDocumentsFactory } from '../../../src/server/build/docs.js';
import { buildDocsReferences } from '../../../src/client-builder/client-build-docs.js';

// A domain's landing is its white paper. The client declares the domain, the build publishes the
// paper, and the shell names it: this pins the three to each other.
const CONF_CLIENT = './engine-private/conf/dd-cyberia/conf.client.json';
const present = fs.existsSync(CONF_CLIENT);
const conf = () => fs.readJsonSync(CONF_CLIENT);
/** Every client of every private deploy conf, by id. */
const clients = () =>
  Object.assign(
    {},
    ...fs
      .readdirSync('./engine-private/conf')
      .map((deployId) => `./engine-private/conf/${deployId}/conf.client.json`)
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readJsonSync(file)),
  );

/** client → the shell that renders its landing. */
const LANDINGS = {
  cryptokoyn: 'src/client/components/cryptokoyn/AppShellCryptokoyn.js',
  itemledger: 'src/client/components/itemledger/AppShellItemledger.js',
  objectlayer: 'src/client/components/objectlayer/AppShellObjectlayer.js',
};

const landingOf = (shell) =>
  fs.readFileSync(shell, 'utf8').match(/MainBodyDocument\.instance\(\{ path: '([^']+)' \}\)/)?.[1];

describe.skipIf(!present)('a domain landing', () => {
  it('names the white paper of a domain its client publishes', () => {
    for (const [client, shell] of Object.entries(LANDINGS)) {
      const landing = landingOf(shell);
      expect(landing, client).toMatch(/^[a-z-]+\/explanation\/white-paper$/);
      const published = docsDocumentsFactory(conf()[client].docs).map(
        (document) => `${document.domain}/${document.category}/${document.slug}`,
      );
      expect(published, client).toContain(landing);
    }
  });

  it('publishes the whole documentation tree from every client that publishes any of it', () => {
    // A subset would leave a cross-domain link pointing at a document the host never serves.
    for (const [client, entry] of Object.entries(conf()))
      if (entry?.docs?.references) expect(entry.docs.references, client).toEqual(['./src/client/public/docs']);
  });

  it('gives every documentation view a client that publishes the tree and routes /docs', () => {
    for (const client of Object.keys(DOCS_VIEWS)) {
      const entry = clients()[client];
      expect(entry, client).toBeTruthy();
      expect(entry.docs?.references, client).toEqual(['./src/client/public/docs']);
      expect(
        entry.views.some((view) => view.path === '/docs'),
        client,
      ).toBe(true);
      for (const component of ['Docs', 'Documentation', 'Markdown'])
        expect(entry.components.core, `${client} ${component}`).toContain(component);
    }
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
      const { docs } = conf().underpost;
      fs.outputFileSync(`${destination}object-layer/explanation/stale.md`, '# stale');
      const { navigation } = await buildDocsReferences({
        docs,
        docsDestination: destination,
        proxyPath: '/',
        client: 'underpost',
      });

      const documents = docsDocumentsFactory(docs);
      for (const document of documents) expect(fs.existsSync(`${destination}${document.url.slice(5)}`)).toBe(true);
      expect(fs.existsSync(`${destination}object-layer/explanation/stale.md`)).toBe(false);

      const manifest = fs.readJsonSync(`${destination}manifest.json`);
      expect(manifest).toEqual(navigation);
      expect(manifest.view).toEqual(['ecosystem', 'underpost']);
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
