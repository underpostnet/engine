/**
 * Domain ownership of the dd-cyberia deploy: which host owns which API, which client serves
 * which host, and the checks a deploy runs before it builds anything.
 *
 * @module src/projects/cyberia/domain-ownership.js
 * @namespace CyberiaDomainOwnership
 */
import fs from 'node:fs';
import { apiExtensionUrl, ownsApi } from '../../server/domain/consumed-api.js';
import { domainOrigin } from '../../server/domain/domain-client.js';
import { CONTENT_PARTITION } from './content-release.js';

/** Hosts of the deploy, their main client, and the domain key other domains address them by. */
export const DOMAIN_HOSTS = Object.freeze({
  'underpost.net': { client: 'underpost', domain: '' },
  'objectlayer.org': { client: 'objectlayer', domain: 'object-layer' },
  'itemledger.com': { client: 'itemledger', domain: 'item-ledger' },
  'cryptokoyn.net': { client: 'cryptokoyn', domain: '' },
  'www.cyberiaonline.com': { client: 'cyberia-portal', domain: 'cyberia' },
});

/** The APIs each domain owns. An API no domain lists here is shared platform infrastructure. */
export const DOMAIN_APIS = Object.freeze({
  'object-layer': Object.freeze(['object-layer', 'object-layer-render-frames', 'atlas-sprite-sheet', 'ipfs']),
  'item-ledger': Object.freeze([
    'item-ledger',
    'item-ledger-transfer',
    'item-ledger-balance',
    'item-ledger-checkpoint',
  ]),
});

/** Cyberia records that are runtime state: never inside a content release. */
export const CYBERIA_RUNTIME_APIS = Object.freeze([
  'cyberia-quest-progress',
  'cyberia-server-registry',
  'cyberia-global-map-code-registry',
  'cyberia-content-release',
]);

/** Object Layer APIs the Cyberia Studio extends on the Cyberia host (`apiExtensions`). */
export const CYBERIA_STUDIO_EXTENSIONS = Object.freeze(['object-layer', 'atlas-sprite-sheet']);

/** Domain names retired from the ecosystem. None may appear in any configuration. */
export const STALE_DOMAINS = Object.freeze([/itemledger\.org/, /object-layer\.org/, /cryptokoin\.net/]);

/** Client components each client must carry, and the ones it must not. */
export const CLIENT_COMPONENTS = Object.freeze({
  objectlayer: {
    required: { 'object-layer': ['ObjectLayerProtocol', 'ObjectLayerEngine', 'ObjectLayerEngineViewer'] },
  },
  // ItemLedger projects ownership of a definition; the definition itself is read at its authority.
  itemledger: { forbidden: { 'object-layer': ['*'] } },
  cryptokoyn: {
    required: { wallet: ['WalletProvider', 'EmbeddedWallet', 'WalletView'] },
    forbidden: { 'object-layer': ['*'] },
  },
  'cyberia-portal': {
    required: { cyberia: ['ObjectLayerProfileCyberia'], 'object-layer': ['ObjectLayerEngineViewer'] },
  },
  underpost: { forbidden: { 'object-layer': ['*'], wallet: ['*'] } },
});

const ownerDomainOf = (api) => Object.keys(DOMAIN_APIS).find((domain) => DOMAIN_APIS[domain].includes(api)) ?? '';
const hostOfDomain = (domain) => Object.keys(DOMAIN_HOSTS).find((host) => DOMAIN_HOSTS[host].domain === domain) ?? '';

/**
 * Checks the deploy's configuration against the ownership table.
 *
 * @param {Object} params
 * @param {Object} params.confServer - Resolved `conf.server.json`.
 * @param {Object} params.confClient - `conf.client.json`.
 * @param {string} [params.env='development'] - Deploy environment; production also checks the cross-domain wiring.
 * @returns {string[]} One line per defect; empty when the configuration is consistent.
 * @memberof CyberiaDomainOwnership
 */
export function validateDomainConf({ confServer, confClient, env = 'development' }) {
  const errors = [];
  const text = JSON.stringify({ confServer, confClient });
  for (const stale of STALE_DOMAINS) if (stale.test(text)) errors.push(`stale domain ${stale.source} in configuration`);

  const clientsServed = new Map();
  for (const [host, expected] of Object.entries(DOMAIN_HOSTS)) {
    const hostConf = confServer[host]?.['/'];
    if (!hostConf) {
      errors.push(`${host}: missing from conf.server.json`);
      continue;
    }
    if (hostConf.client !== expected.client)
      errors.push(`${host}: main client is "${hostConf.client}", expected "${expected.client}"`);
    clientsServed.set(hostConf.client, host);

    for (const api of hostConf.apis ?? []) {
      const owner = ownerDomainOf(api);
      if (!owner || owner === expected.domain) continue;
      if (hostConf.consumes?.[api] !== owner)
        errors.push(`${host}: mounts ${api}, owned by ${owner}, without declaring it consumed from ${owner}`);
    }
    for (const [api, domain] of Object.entries(hostConf.consumes ?? {})) {
      if (ownerDomainOf(api) !== domain) errors.push(`${host}: consumes ${api} from ${domain}, which does not own it`);
      if (domain === 'item-ledger')
        errors.push(`${host}: mounts ItemLedger API ${api}; read it over the ItemLedger API instead`);
      if (env === 'production' && !domainOrigin(domain))
        errors.push(`${host}: consumes ${domain} but its API origin is not configured`);
    }
    for (const [api, project] of Object.entries(hostConf.apiExtensions ?? {})) {
      if (!(hostConf.apis ?? []).includes(api)) errors.push(`${host}: extends ${api}, which it does not mount`);
      if (project === 'cyberia' && expected.domain !== 'cyberia')
        errors.push(`${host}: carries the Cyberia extension of ${api}`);
      try {
        if (!fs.existsSync(apiExtensionUrl(api, project)))
          errors.push(`${host}: extension ${project}/${api} does not exist`);
      } catch (error) {
        errors.push(`${host}: ${error.message}`);
      }
    }
    if (env === 'production' && Object.keys(hostConf.consumes ?? {}).length && !process.env.DOMAIN_API_SERVICE_KEY)
      errors.push(`${host}: consumes another domain but DOMAIN_API_SERVICE_KEY is not configured`);
  }

  const cyberia = confServer['www.cyberiaonline.com']?.['/'];
  if (cyberia) {
    for (const api of CYBERIA_STUDIO_EXTENSIONS)
      if ((cyberia.apis ?? []).includes(api) && cyberia.apiExtensions?.[api] !== 'cyberia')
        errors.push(`www.cyberiaonline.com: mounts ${api} without its Cyberia Studio extension`);
    const partition = cyberia.db?.partitions?.[CONTENT_PARTITION];
    if (!partition?.name) errors.push(`www.cyberiaonline.com: no "${CONTENT_PARTITION}" database partition`);
    else {
      for (const api of partition.apis ?? []) {
        if (!(cyberia.apis ?? []).includes(api))
          errors.push(`www.cyberiaonline.com: content partition names unmounted api ${api}`);
        if (CYBERIA_RUNTIME_APIS.includes(api))
          errors.push(`www.cyberiaonline.com: runtime api ${api} is inside the content partition`);
        if (ownerDomainOf(api) && ownsApi(cyberia, api))
          errors.push(`www.cyberiaonline.com: owned authority ${api} is inside the content partition`);
      }
      for (const api of cyberia.apis ?? []) {
        if (api.startsWith('cyberia-') && !CYBERIA_RUNTIME_APIS.includes(api) && !partition.apis?.includes(api))
          errors.push(`www.cyberiaonline.com: content api ${api} is outside the content partition`);
      }
      if (partition.name === cyberia.db.name)
        errors.push('www.cyberiaonline.com: content and runtime share one database');
    }
  }

  for (const [clientId, client] of Object.entries(confClient)) {
    if (!client || typeof client !== 'object') continue;
    const host = clientsServed.get(clientId);
    const hostConf = host ? confServer[host]['/'] : null;

    const paths = (client.views ?? []).map((view) => view.path);
    for (const path of new Set(paths.filter((path, index) => paths.indexOf(path) !== index)))
      errors.push(`${clientId}: duplicate view ${path}`);

    const rules = CLIENT_COMPONENTS[clientId] ?? {};
    for (const [group, names] of Object.entries(rules.required ?? {})) {
      for (const name of names)
        if (!client.components?.[group]?.includes(name)) errors.push(`${clientId}: missing component ${group}/${name}`);
    }
    for (const [group, names] of Object.entries(rules.forbidden ?? {})) {
      const present = client.components?.[group] ?? [];
      for (const name of names.includes('*') ? present : names.filter((name) => present.includes(name)))
        errors.push(`${clientId}: carries component ${group}/${name} it does not use`);
    }

    if (!hostConf) continue;
    const ownDomain = DOMAIN_HOSTS[host].domain;
    for (const service of client.services ?? []) {
      const owner = ownerDomainOf(service);
      if (!owner || (hostConf.apis ?? []).includes(service)) continue;
      const ownerHost = hostOfDomain(owner);
      if (client.apiHosts?.[service] !== ownerHost)
        errors.push(`${clientId}: service ${service} is ${owner}'s; map it to ${ownerHost} in apiHosts`);
    }
    for (const [service, apiHost] of Object.entries(client.apiHosts ?? {})) {
      const origins = confServer[apiHost]?.['/']?.origins ?? [];
      if (!origins.includes(`https://${host}`))
        errors.push(`${clientId}: ${apiHost} does not allow the origin https://${host} for ${service}`);
    }

    const docs = client.docs ?? {};
    for (const entry of docs.typedoc?.entryPoints ?? []) {
      const api = /\.\/src\/api\/([^/]+)/.exec(entry)?.[1];
      const owner = api ? ownerDomainOf(api) : '';
      if (owner && owner !== ownDomain) errors.push(`${clientId}: typedoc documents ${api}, owned by ${owner}`);
    }
    for (const api of docs.api ?? []) {
      const owner = ownerDomainOf(api);
      if (owner && owner !== ownDomain) errors.push(`${clientId}: api docs list ${api}, owned by ${owner}`);
    }
  }

  return errors;
}
