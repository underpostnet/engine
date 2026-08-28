/**
 * Shared command surface for the four domains.
 *
 * `secret`, `host`, `app` and `state` are registered from one factory, so the action list and the
 * option list exist exactly once. Symmetry is not a convention the four commands agree to follow
 * — it is structural: a verb or a flag added here appears on all four, and one that is not here
 * cannot appear on any of them.
 *
 * The three configuration domains carry a durable source; `state` is the runtime monitoring /
 * telemetry layer and carries none, so its actions read and export a live observation instead.
 * The verbs are the same either way — see {@link UnderpostState} for what each means there.
 * @module src/cli/domains.js
 * @namespace UnderpostDomains
 */

/**
 * The canonical action set. Every domain implements all of these with the same meaning:
 *
 * | action  | direction                         |
 * |---------|-----------------------------------|
 * | setup   | onboard the domain, idempotently  |
 * | load    | durable store  -> local runtime   |
 * | publish | local runtime  -> durable store   |
 * | apply   | durable store  -> live cluster    |
 * | status  | read-only report                  |
 * | rotate  | replace the current projection    |
 * | clean   | withdraw local traces             |
 * @constant {Array<{name: string, summary: string}>}
 * @memberof UnderpostDomains
 */
const DOMAIN_ACTIONS = [
  { name: 'setup', summary: 'Onboards the domain: provisions whatever it needs, then converges it. Idempotent.' },
  { name: 'load', summary: 'Loads the durable source into the local runtime environment.' },
  { name: 'publish', summary: 'Writes the local runtime environment into the durable source.' },
  { name: 'apply', summary: 'Projects the durable source into the live cluster.' },
  { name: 'status', summary: 'Read-only report of the domain: sources, keys, and drift from the cluster.' },
  { name: 'rotate', summary: 'Replaces the current projection or encryption identity.' },
  { name: 'clean', summary: 'Withdraws the domain traces from the local filesystem.' },
];

/**
 * The canonical option set, identical on every action of every domain.
 *
 * Deliberately five. Everything a single domain used to carry its own flag for — an Age
 * recipient, a secret name list, a sub-configuration — passes through `--args` instead, so the
 * visible surface does not grow when one domain gains a parameter.
 * @constant {Array<{flags: string, description: string}>}
 * @memberof UnderpostDomains
 */
const DOMAIN_OPTIONS = [
  { flags: '--env <env>', description: 'Target environment: development | production | test (default: production).' },
  { flags: '--namespace <namespace>', description: 'Kubernetes namespace to act on (default: default).' },
  {
    flags: '--args <key=value-list>',
    description:
      'Comma-separated domain parameters, e.g. `names=postgres-secret`, `recipient=age1...`, `sub-conf=nexodev`.',
  },
  { flags: '--dry-run', description: 'Reports what the action would change without changing anything.' },
  { flags: '--force', description: 'Confirms the irreversible variant of the action.' },
];

/**
 * Key-level operators a domain may register alongside the canonical seven.
 *
 * They are not part of {@link DOMAIN_ACTIONS} on purpose: the canonical set is a bulk-lifecycle
 * verb set, symmetric across every domain, with no place for per-key reads and writes. A domain
 * that owns a key-value store opts into these instead of getting a command of its own — the host
 * configuration store is the host domain's, so `underpost host get KEY` is where it is read.
 * @constant {Array<string>}
 * @memberof UnderpostDomains
 */
const DOMAIN_STORE_OPERATORS = ['get', 'set', 'delete', 'list'];

const DOMAIN_STORE_OPTIONS = [
  { flags: '--plain', description: 'Prints the value in plain text (get).' },
  { flags: '--filter <keyword>', description: 'Filters by matching key or value (list).' },
  { flags: '--copy', description: 'Copies the value to the clipboard (get).' },
];

/**
 * Parses `--args key=value,key=value` into an object.
 *
 * Values may contain `=` (an Age recipient does not, a password can), so only the first
 * separator splits. A bare `key` is the boolean shorthand for `key=true`.
 * @param {string} [value] - Raw `--args` string.
 * @returns {Object<string, string|boolean>} Parsed parameters.
 * @memberof UnderpostDomains
 */
const parseDomainArgs = (value) => {
  // Idempotent: an already-parsed object passes through, so normalizing a context twice — once
  // at the CLI boundary, once inside the action a programmatic caller invoked directly — is safe.
  if (value && typeof value === 'object') return { ...value };
  return Object.fromEntries(
    `${value ?? ''}`
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf('=');
        return index === -1 ? [entry, true] : [entry.slice(0, index).trim(), entry.slice(index + 1)];
      }),
  );
};

/**
 * Normalizes the parsed options handed to a domain action, so every domain receives the same
 * shape and none of them re-derives a default of its own.
 * @param {object} [options] - Commander options for the invocation.
 * @returns {{env: string, namespace: string, args: object, dryRun: boolean, force: boolean}} Normalized context.
 * @memberof UnderpostDomains
 */
const domainContextFactory = (options = {}) => ({
  env: `${options.env ?? ''}`.trim() || 'production',
  namespace: `${options.namespace ?? ''}`.trim() || 'default',
  args: parseDomainArgs(options.args),
  dryRun: options.dryRun === true,
  force: options.force === true,
});

/**
 * Registers one domain as a top-level command carrying the full canonical surface.
 *
 * The action is a required argument rather than a flag so the three commands read as
 * `underpost <domain> <action>`, and an unknown action fails against the shared list instead of
 * silently doing nothing.
 * @param {object} program - The commander program.
 * @param {object} domain - Domain registration.
 * @param {string} domain.name - Command name (`secret`, `host`, `app`, `state`).
 * @param {boolean} [domain.store] - Whether this domain owns a key-value store, and so carries
 *   the key-level operators alongside the canonical actions.
 * @param {string} domain.description - One-line command description.
 * @param {Function} domain.api - Returns the domain API implementing every canonical action.
 * @returns {object} The registered commander command.
 * @memberof UnderpostDomains
 */
const registerDomainCommand = (program, { name, description, api, store = false }) => {
  const actions = DOMAIN_ACTIONS.map((action) => action.name);
  const operators = store ? DOMAIN_STORE_OPERATORS : [];
  const command = program
    .command(name)
    .argument(
      '<action>',
      `Action to run. One of: ${[...actions, ...operators].join(', ')}.\n` +
        DOMAIN_ACTIONS.map((action) => `  ${action.name.padEnd(8)} ${action.summary}`).join('\n') +
        (store ? `\n  ${'get|set|delete|list'.padEnd(8)} Key-level access to the store this domain owns.` : ''),
    )
    .description(description);
  // Only a store-owning domain takes a key and a value; the others keep the bare action surface.
  if (store) {
    command.argument('[key]', 'Key to act on, for the key-level operators.');
    command.argument('[value]', 'Value to write, for the `set` operator.');
  }
  // Commander hands the action `(...arguments, options, command)`, so the options object is
  // second from the end no matter how many positionals this domain declared.
  command.action((...received) => {
    const options = received[received.length - 2];
    const [action, key, value] = received;
    if (operators.includes(action)) {
      if (action !== 'list' && !key) throw new Error(`${name} ${action} requires a key`);
      if (action === 'set' && value === undefined) throw new Error(`${name} set requires a value`);
      return api()[action](key, value, options);
    }
    if (!actions.includes(action))
      throw new Error(`Unknown ${name} action: ${action} (expected ${[...actions, ...operators].join(', ')})`);
    const implementation = api()[action];
    // Guards the contract at the boundary: a domain that has not implemented the full
    // canonical set fails here by name, rather than as `undefined is not a function`.
    if (typeof implementation !== 'function')
      throw new Error(`Domain '${name}' does not implement the '${action}' action`);
    return implementation(domainContextFactory(options));
  });
  for (const option of DOMAIN_OPTIONS) command.option(option.flags, option.description);
  if (store) for (const option of DOMAIN_STORE_OPTIONS) command.option(option.flags, option.description);
  return command;
};

export {
  DOMAIN_ACTIONS,
  DOMAIN_OPTIONS,
  DOMAIN_STORE_OPERATORS,
  domainContextFactory,
  parseDomainArgs,
  registerDomainCommand,
};
