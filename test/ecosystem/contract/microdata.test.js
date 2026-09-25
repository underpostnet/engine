'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { unslicedTree } from '../../support/tree.js';

/**
 * Structured data a client publishes: `src/client/public/<publicClientId>/microdata.json`, which
 * the `Microdata` SSR head component writes into the page as JSON-LD. Every domain is a
 * sub-organization of Underpost, and the search engine reads that from here.
 */
const PUBLIC_ROOT = './src/client/public';
const ORGANIZATION_URL = 'https://github.com/underpost';
/** Where an entity may point outside its own host: the organization and the package registry. */
const EXTERNAL = ['https://github.com/', 'https://www.npmjs.com/', 'https://opensource.org/'];
const DEPLOYS = ['dd-cyberia', 'dd-core'];

const microdataClients = () =>
  fs
    .readdirSync(PUBLIC_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(`${PUBLIC_ROOT}/${entry.name}/microdata.json`))
    .map((entry) => ({
      id: entry.name,
      entities: fs.readJsonSync(`${PUBLIC_ROOT}/${entry.name}/microdata.json`),
    }));

/** Every nested object of an entity tree, so a reference at any depth is checked. */
const objectsOf = (value, skip = []) => {
  if (!value || typeof value !== 'object') return [];
  const children = Object.entries(value)
    .filter(([key]) => !skip.includes(key))
    .flatMap(([, child]) => objectsOf(child, skip));
  return Array.isArray(value) ? children : [value, ...children];
};

const deploys = DEPLOYS.filter((deploy) => fs.existsSync(`./engine-private/conf/${deploy}/conf.client.json`));

describe('client microdata', () => {
  const clients = microdataClients();

  it('finds the clients that publish structured data', () => {
    // A product tree carries only its own clients, and a private client keeps its public directory out.
    const carried = ['cryptokoyn', 'itemledger', 'nexodev', 'objectlayer'].filter((id) =>
      fs.existsSync(`${PUBLIC_ROOT}/${id}`),
    );
    // The engine tree carries every one; a base template carries none.
    if (unslicedTree) expect(carried).to.have.length(4);
    expect(clients.map(({ id }) => id).sort()).to.include.members(carried);
  });

  it('states a schema.org type over HTTPS in every entity', () => {
    for (const { id, entities } of clients) {
      expect(entities, id).to.be.an('array').that.is.not.empty;
      for (const entity of entities) {
        expect(entity['@context'], `${id} context`).to.equal('https://schema.org');
        expect(entity['@type'], `${id} type`).to.be.a('string').that.is.not.empty;
      }
    }
  });

  it('names Underpost with the organization link wherever it credits it', () => {
    for (const { id, entities } of clients) {
      const references = objectsOf(entities).filter((object) => object.name === 'Underpost');
      expect(references, `${id} credits Underpost`).to.not.be.empty;
      for (const reference of references) {
        const links = [reference.url, ...(reference.sameAs ?? [])];
        expect(links, `${id} Underpost links`).to.include(ORGANIZATION_URL);
      }
    }
  });

  it('places every product domain under Underpost', () => {
    for (const { id, entities } of clients) {
      if (id === 'underpost') continue;
      const organization = entities.find((entity) => entity['@type'] === 'Organization');
      expect(organization, `${id} organization`).to.be.an('object');
      expect(organization.parentOrganization?.name, `${id} parent`).to.equal('Underpost');
    }
  });

  it('rates no domain by itself', () => {
    // A rating a domain writes about itself is not evidence, and a search engine treats it as spam.
    for (const { id, entities } of clients)
      for (const object of objectsOf(entities)) {
        expect(object.aggregateRating, `${id} aggregateRating`).to.equal(undefined);
        expect(object.review, `${id} review`).to.equal(undefined);
      }
  });

  describe.skipIf(deploys.length === 0)('against the deploy configuration', () => {
    /** Client id → its public directory and the host it is served at. */
    const served = () => {
      const entries = [];
      for (const deploy of deploys) {
        const confClient = fs.readJsonSync(`./engine-private/conf/${deploy}/conf.client.json`);
        const confServer = fs.readJsonSync(`./engine-private/conf/${deploy}/conf.server.json`);
        const confSSR = fs.readJsonSync(`./engine-private/conf/${deploy}/conf.ssr.json`);
        for (const [host, paths] of Object.entries(confServer))
          for (const [path, instance] of Object.entries(paths)) {
            const client = confClient[instance.client];
            if (!client) continue;
            entries.push({
              deploy,
              client: instance.client,
              origin: `https://${host}${path === '/' ? '' : path}`,
              publicId: client.publicRef ?? instance.client,
              head: [...new Set((client.views ?? []).flatMap((view) => confSSR[view.ssr]?.head ?? []))],
            });
          }
      }
      return entries;
    };

    it('renders the structured data of every client that publishes it', () => {
      const missing = [];
      for (const { client, publicId, head } of served()) {
        const published = fs.existsSync(`${PUBLIC_ROOT}/${publicId}/microdata.json`);
        if (published && !head.includes('Microdata')) missing.push(`${client}: publishes microdata, renders none`);
        if (!published && head.includes('Microdata')) missing.push(`${client}: renders microdata, publishes none`);
      }
      expect(missing).to.deep.equal([]);
    });

    it('addresses every entity at the host its client is served at', () => {
      const wrong = [];
      for (const { client, publicId, origin } of served()) {
        const path = `${PUBLIC_ROOT}/${publicId}/microdata.json`;
        if (!fs.existsSync(path)) continue;
        // A sub-organization is another domain, at its own host: only the parent lists them.
        for (const object of objectsOf(fs.readJsonSync(path), ['subOrganization']))
          for (const url of [object.url, object.logo, object.image, object.screenshot])
            if (typeof url === 'string' && !EXTERNAL.some((external) => url.startsWith(external)))
              if (!url.startsWith(origin)) wrong.push(`${client}: ${url} is not under ${origin}`);
      }
      expect(wrong).to.deep.equal([]);
    });
  });
});
