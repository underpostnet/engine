/**
 * Ownership of configuration keys, and the projections that carry a value out of its owner.
 *
 * The platform's domains are `app`, `host`, `secret` and `state`; this module does not add a
 * fifth. What it adds is the missing half of the host domain's model: its durable source is one
 * env file, but the values in it answer to different concerns with different consumers and very
 * different blast radii. Provisioning credentials, registry credentials and the cron jobs' own
 * connection settings were reaching every workload that read that file, because "the host
 * environment" was the only granularity the system had.
 *
 * Ownership and visibility are separate questions, and only ownership is answered by pattern.
 *
 * {@link CONFIG_OWNERSHIP} says where a key lives. A family pattern is right for that: a new
 * `MAAS_` key is a provisioning key wherever it came from.
 *
 * {@link SCOPE_ENTITLEMENTS} says what a workload may read, and is an exact key list. A pattern
 * there would mean the next credential added to a family silently inherits that family's audience
 * — `GITHUB_NEW_SENSITIVE_TOKEN` becoming cron-visible because `GITHUB_` once was. So the policy
 * is readable from the table alone: what cron can see is what the table names, and nothing a
 * naming convention implies.
 *
 * Classification is closed at both ends: {@link classifyConfigKeys} reports anything it cannot
 * place instead of defaulting it into a scope, and an entitlement the table does not name is
 * refused. An unknown key is a design question, not a value to guess at.
 *
 * @module src/server/runtime/config-scope.js
 * @namespace ConfigScope
 */

/**
 * @constant CONFIG_SCOPES
 * @description The scopes a configuration key can belong to, and what consumes each.
 * @memberof ConfigScope
 */
const CONFIG_SCOPES = Object.freeze({
  runtime: 'Process settings a manifest states about a workload; never carried by a projection.',
  host: 'Node-level operation: the edge, the observability stack, cluster mail and deployment targets.',
  cron: 'The scheduled jobs: their APIs, their DNS providers and the connection they reach the fleet on.',
  baremetal: 'Machine provisioning: MAAS, its database, and the network a commissioned node boots on.',
  publishing: 'Release identities: the registries and package indexes a publish authenticates to.',
  app: "A deployment's own runtime: its database, its sessions, its integrations.",
});

/**
 * @constant CONFIG_OWNERSHIP
 * @description Key patterns in resolution order, each naming its owner and the scopes it is
 * projected into. First match wins, so a specific rule is placed above the family it narrows.
 * @memberof ConfigScope
 */
const CONFIG_OWNERSHIP = Object.freeze([
  { match: /^(NODE_ENV|NODE_OPTIONS|DOTENV_CONFIG_QUIET|ENABLE_FILE_LOGS|TIME_ZONE)$/, owner: 'runtime' },

  { match: /^(VULTR_|DDNS_|HTTP_PLAIN_IP_URL$)/, owner: 'cron' },

  { match: /^(MAAS_|DB_PG_MAAS_)/, owner: 'baremetal' },
  { match: /^(TFTP_ROOT|NETMASK|NFS_EXPORT_PATH)$/, owner: 'baremetal' },

  { match: /^(NPM_|DOCKER_HUB_|POSTMAN_)/, owner: 'publishing' },

  { match: /^(GITHUB_|DEFAULT_SSH_|FORWARD_PROXY_|DEFAULT_DEPLOY_)/, owner: 'host' },
  { match: /^(GF_SECURITY_|CLUSTER_MAILER_)/, owner: 'host' },
  { match: /^UNDERPOST_EVENT_TOKEN$/, owner: 'host' },

  { match: /^(DB_|MARIADB_|VALKEY_)/, owner: 'app' },
  { match: /^(JWT_SECRET|ACCESS_EXPIRE_MINUTES|REFRESH_EXPIRE_MINUTES|PORT|DEPLOY_ID)$/, owner: 'app' },
  { match: /^(DEFAULT_ADMIN_|CLOUDINARY_|WP_)/, owner: 'app' },
  { match: /^(GEMINI_API_KEY|NVIDIA_API_KEY)$/, owner: 'app' },
]);

/**
 * @constant SCOPE_ENTITLEMENTS
 * @description Exactly what each workload scope may read, by key name.
 *
 * Every entry is a key some code in this repository reads. A value the workload does not consume
 * is not listed, because projecting one is not merely waste: `*_SSH_KEY_PATH` named a path that
 * only exists on a host, and handing it to a pod made the resolver prefer it over the Secret
 * mount holding the actual key.
 * @memberof ConfigScope
 */
const SCOPE_ENTITLEMENTS = Object.freeze({
  cron: Object.freeze([
    // vultr: the API it meters against, and the edge it toggles egress on.
    'VULTR_API_KEY',
    'VULTR_INSTANCE_ID',
    'VULTR_BANDWIDTH_THRESHOLD',
    'VULTR_VPS_IP',
    'VULTR_SSH_USER',
    'VULTR_SSH_PORT',
    'FORWARD_PROXY_API_KEY',
    'FORWARD_PROXY_HOST',
    'FORWARD_PROXY_PORT',
    // backup and vultr: the connection out of the pod. The key itself is a Secret volume.
    'DEFAULT_SSH_USER',
    'DEFAULT_SSH_HOST',
    'DEFAULT_SSH_PORT',
    // backup: the identity its git operations authenticate as.
    'GITHUB_TOKEN',
    'GITHUB_USERNAME',
    // dns: the provider it updates and the host it probes.
    'DDNS_HOST',
    'DDNS_PROVIDER',
    'DDNS_API_KEY',
    'DDNS_USER',
    'HTTP_PLAIN_IP_URL',
    'DEFAULT_DEPLOY_HOST',
  ]),
});

/**
 * The owning scope of a key, and the scopes it reaches.
 * @param {string} key - Environment variable name.
 * @returns {{owner: string, projectedTo: string[]}|null} Ownership, or null when unclassified.
 * @memberof ConfigScope
 */
const configOwnershipFactory = (key) => {
  const name = `${key || ''}`;
  const rule = CONFIG_OWNERSHIP.find((entry) => entry.match.test(name));
  if (!rule) return null;
  const projectedTo = Object.entries(SCOPE_ENTITLEMENTS)
    .filter(([scope, keys]) => scope !== rule.owner && keys.includes(name))
    .map(([scope]) => scope);
  return { owner: rule.owner, projectedTo };
};

/**
 * Whether a scope receives a key.
 *
 * A scope with an entitlement list reads that list and nothing else — owning a key is not by
 * itself permission to ship it to a workload, which is what keeps a new member of an owned family
 * from arriving in a pod unreviewed. Scopes without a list are host-side and read what they own.
 *
 * `runtime` is never a pass-through: process settings are what a manifest states about the
 * workload it defines, not credentials a projection carries.
 * @param {string} key - Environment variable name.
 * @param {string} scope - Scope name.
 * @returns {boolean} True when the scope may see the key.
 * @memberof ConfigScope
 */
const scopeReceivesKey = (key, scope) => {
  const ownership = configOwnershipFactory(key);
  if (!ownership) return false;
  const entitlement = SCOPE_ENTITLEMENTS[scope];
  if (entitlement) return entitlement.includes(`${key || ''}`);
  return ownership.owner === scope;
};

/**
 * Splits an environment into the scopes that receive each key.
 *
 * `unclassified` is the fail-closed half: a key no rule places is reported rather than dropped
 * into a default scope, because the two wrong answers — hiding it from a consumer that needs it,
 * or handing a credential to a workload that does not — are both silent.
 * @param {Object<string, string>} values - Parsed environment.
 * @returns {{scopes: Object<string, string[]>, unclassified: string[]}} Key names per scope.
 * @memberof ConfigScope
 */
const classifyConfigKeys = (values = {}) => {
  const scopes = Object.fromEntries(Object.keys(CONFIG_SCOPES).map((scope) => [scope, []]));
  const unclassified = [];

  for (const key of Object.keys(values)) {
    const ownership = configOwnershipFactory(key);
    if (!ownership) {
      unclassified.push(key);
      continue;
    }
    scopes[ownership.owner].push(key);
  }

  return { scopes, unclassified };
};

/**
 * The subset of an environment a scope is entitled to.
 * @param {Object<string, string>} values - Parsed environment.
 * @param {string} scope - Scope name.
 * @returns {Object<string, string>} Entitled key/value pairs.
 * @memberof ConfigScope
 */
const scopeValuesFactory = (values = {}, scope = '') =>
  Object.fromEntries(Object.entries(values).filter(([key]) => scopeReceivesKey(key, scope)));

/**
 * Renders a scope rejection without disclosing the value that caused it.
 * @param {object} params - Rejection context.
 * @param {string} params.domain - Domain reporting the rejection.
 * @param {string} [params.deployId] - Deploy the source belongs to.
 * @param {string} [params.env] - Environment selector.
 * @param {string} params.key - Key that was rejected.
 * @param {string} params.reason - Why it was rejected.
 * @returns {string} Diagnostic line, values omitted by construction.
 * @memberof ConfigScope
 */
const configRejectionFactory = ({ domain, deployId = '', env = '', key, reason }) =>
  [
    'configuration source rejected:',
    `domain=${domain}`,
    deployId ? `deploy=${deployId}` : '',
    env ? `env=${env}` : '',
    `key=${key}`,
    `reason=${reason}`,
  ]
    .filter(Boolean)
    .join(' ');

export {
  CONFIG_OWNERSHIP,
  CONFIG_SCOPES,
  SCOPE_ENTITLEMENTS,
  classifyConfigKeys,
  configOwnershipFactory,
  configRejectionFactory,
  scopeReceivesKey,
  scopeValuesFactory,
};
