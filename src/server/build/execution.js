/**
 * This module is pure with respect to the environment: it classifies, resolves and
 * decides, but never executes. Enforcement belongs to `src/server/runtime/process.js`,
 * which owns the subprocess boundary.
 *
 * @module src/server/build/execution.js
 * @namespace UnderpostExecution
 */

import { execFileSync } from 'node:child_process';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * @constant EXECUTION_PROFILE_ENV_KEY
 * @description Environment key the active profile rides on into child processes. Reading it
 * back is what makes a nested `underpost` invocation stay inside its parent's profile.
 * @memberof UnderpostExecution
 */
const EXECUTION_PROFILE_ENV_KEY = 'UNDERPOST_EXECUTION_PROFILE';

/**
 * @constant CAPABILITIES
 * @description The side-effect classes a command can exercise, ordered least to most
 * privileged. The order is load-bearing: a compound command takes the capability of its
 * most privileged segment, so `kubectl create … | kubectl apply -f -` is a cluster write
 * rather than a cluster read.
 * @memberof UnderpostExecution
 */
const CAPABILITIES = ['fs', 'git', 'net', 'cluster:read', 'host:write', 'cluster:write'];

const capabilityRank = (capability) => CAPABILITIES.indexOf(capability);

/**
 * @constant EXECUTION_PROFILES
 * @description The profile table. `permits` is the closed set of capabilities a run may
 * exercise; everything else is elided.
 *
 * `reads: 'neutral'` is what lets a denied read stay invisible to its caller: a blocked
 * `cluster:read` returns the empty result that 200+ `silentOnError` call sites already
 * treat as "not present", so no caller needs to learn a new failure mode.
 * @memberof UnderpostExecution
 */
const EXECUTION_PROFILES = {
  // Full access. The default, and the only profile that may mutate a cluster or a host.
  LIVE_CLUSTER: {
    name: 'LIVE_CLUSTER',
    permits: [...CAPABILITIES],
    reads: 'live',
    description: 'Full access: cluster and host mutation permitted.',
  },
  // Manifest and artifact generation. Filesystem and git are build outputs, not
  // environment mutation, so they stay permitted — a build that regenerates manifests
  // and commits them is doing its job.
  HERMETIC_BUILD: {
    name: 'HERMETIC_BUILD',
    permits: ['fs', 'git'],
    reads: 'neutral',
    description: 'Build outputs only: no cluster, host or network side effects.',
  },
  // Nothing executes. Every effect is reported as the intent it would have carried out.
  OFFLINE_DRY_RUN: {
    name: 'OFFLINE_DRY_RUN',
    permits: [],
    reads: 'neutral',
    description: 'Nothing executes; every command is reported as intent.',
  },
};

const DEFAULT_PROFILE = 'LIVE_CLUSTER';

/**
 * @constant PROFILE_ALIAS_FLAGS
 * @description Legacy bypass flags mapped onto the profile that subsumes them, so an
 * operator who already knows the old flag lands in the right profile without learning a
 * new one. The flags stay on the CLI surface — they are published entrypoints.
 *
 * Each alias is guarded by `when`, because a bypass flag is only equivalent to a profile
 * in the mode it was written for. `--disable-update-underpost-config` means "skip one
 * projection step" during a live deploy, but means "this run cannot reach a cluster at
 * all" during a manifest build; aliasing it unconditionally would silently turn a real
 * deploy into a no-op. Flags that are step toggles in every mode are deliberately absent:
 * they keep their own guards, which the profile gate sits underneath rather than replaces.
 * @memberof UnderpostExecution
 */
const PROFILE_ALIAS_FLAGS = {
  disableUpdateUnderpostConfig: {
    profile: 'HERMETIC_BUILD',
    when: (options) => options?.buildManifest === true,
  },
};

// Verbs that only read cluster state. Everything else kubectl accepts is treated as a
// write: an unrecognised verb must not be assumed harmless.
const KUBECTL_READ_VERBS = new Set([
  'get',
  'describe',
  'logs',
  'top',
  'explain',
  'api-resources',
  'api-versions',
  'version',
  'cluster-info',
  'config',
  'auth',
  'diff',
]);

// kubectl flags that consume the token after them, which would otherwise be mistaken
// for the verb (`kubectl -n default get pods`).
const KUBECTL_VALUE_FLAGS = new Set(['-n', '--namespace', '--context', '--kubeconfig', '--server', '--user']);

const HOST_WRITE_BINARIES = new Set([
  'systemctl',
  'journalctl',
  'dnf',
  'yum',
  'apt',
  'apt-get',
  'rpm',
  'firewall-cmd',
  'setenforce',
  'semanage',
  'restorecon',
  'chcon',
  'mount',
  'umount',
  'mkfs',
  'parted',
  'lvcreate',
  'modprobe',
  'sysctl',
  'useradd',
  'groupadd',
  'usermod',
  'lxc',
  'lxd',
  'virsh',
  'virt-install',
  'docker',
  'podman',
  'crictl',
  'kind',
  'kubeadm',
  'k3s',
  'wg',
  'wg-quick',
  'ip',
  'iptables',
  'nft',
  'haproxy',
]);

// `gh` reaches a remote service and writes to it (`gh secret set`, `gh release create`), so it
// is a network effect rather than local filesystem work — an unclassified binary would default
// to `fs` and run under HERMETIC_BUILD.
const NET_BINARIES = new Set(['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ping', 'dig', 'nslookup', 'gh']);

const CLUSTER_BINARIES = new Set(['kubectl', 'helm']);

// Binaries that re-enter the engine. They are classified as local process work because
// the child resolves its own profile from the environment — gating them here would stop
// a hermetic build from reaching the very stages it exists to run.
const NESTED_CLI_BINARIES = new Set(['node', 'npm', 'npx', 'underpost']);

const stripSudo = (tokens) => {
  if (tokens[0] !== 'sudo') return { tokens, escalated: false };
  let index = 1;
  // `sudo -u dd -E cmd` — step over sudo's own flags and their values.
  while (index < tokens.length && tokens[index].startsWith('-')) {
    const consumesValue = tokens[index] === '-u' || tokens[index] === '--user' || tokens[index] === '-g';
    index += consumesValue ? 2 : 1;
  }
  return { tokens: tokens.slice(index), escalated: true };
};

const kubectlVerb = (tokens) => {
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (KUBECTL_VALUE_FLAGS.has(token)) {
      index++;
      continue;
    }
    if (token.startsWith('-')) continue;
    return token;
  }
  return '';
};

const classifySegment = (segment) => {
  const tokens = `${segment ?? ''}`.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'fs';

  const { tokens: bare, escalated } = stripSudo(tokens);
  if (bare.length === 0) return escalated ? 'host:write' : 'fs';

  // Leading `VAR=value` assignments are not the command.
  let start = 0;
  while (start < bare.length && /^[A-Z_][A-Z0-9_]*=/i.test(bare[start])) start++;
  const binary = nodePath.basename(bare[start] ?? '');
  const rest = bare.slice(start);

  if (CLUSTER_BINARIES.has(binary)) {
    if (binary === 'helm') {
      const verb = rest[1] ?? '';
      return verb === 'list' || verb === 'get' || verb === 'status' ? 'cluster:read' : 'cluster:write';
    }
    return KUBECTL_READ_VERBS.has(kubectlVerb(rest)) ? 'cluster:read' : 'cluster:write';
  }
  if (NESTED_CLI_BINARIES.has(binary)) return 'fs';
  if (binary === 'git') return 'git';
  if (HOST_WRITE_BINARIES.has(binary)) return 'host:write';
  if (NET_BINARIES.has(binary)) return 'net';

  // An escalated command we do not otherwise recognise is a host mutation by definition.
  return escalated ? 'host:write' : 'fs';
};

/**
 * Classifies the side effect a command exercises.
 *
 * Compound commands resolve to their most privileged segment, so a pipeline cannot
 * launder a write through a read.
 * @param {string} cmd - The command string.
 * @returns {string} One of {@link CAPABILITIES}.
 * @memberof UnderpostExecution
 */
const classifyCommand = (cmd = '') => {
  const text = `${cmd ?? ''}`;
  if (!text.trim()) return 'fs';
  // Heredoc bodies are data, not commands: `kubectl apply -f - <<'EOF' … EOF` must be
  // classified on its first line alone, or YAML content would be parsed as a pipeline.
  const [head] = text.split(/<<-?\s*'?[A-Za-z_]+'?/);
  const segments = `${head}`.split(/&&|\|\||[;|]/);
  let capability = 'fs';
  for (const segment of segments) {
    const segmentCapability = classifySegment(segment);
    if (capabilityRank(segmentCapability) > capabilityRank(capability)) capability = segmentCapability;
  }
  return capability;
};

/**
 * Resolves a profile by name, falling back to the default rather than throwing on an
 * unknown value — an unreadable environment variable must not brick every command.
 * @param {string} [name] - Profile name.
 * @returns {object} The profile record.
 * @memberof UnderpostExecution
 */
const executionProfileFactory = (name = '') => {
  const key = `${name ?? ''}`.trim().toUpperCase().replace(/-/g, '_');
  return EXECUTION_PROFILES[key] ?? EXECUTION_PROFILES[DEFAULT_PROFILE];
};

/**
 * Maps a CLI options object onto the profile it selects.
 *
 * An explicit `--profile` wins. Otherwise a legacy bypass flag selects the profile that
 * subsumes it, but only in the mode where the two actually mean the same thing.
 * @param {object} [options] - Commander options.
 * @returns {string} Profile name.
 * @memberof UnderpostExecution
 */
const profileFromOptionsFactory = (options = {}) => {
  const explicit = `${options?.profile ?? ''}`.trim();
  if (explicit) return executionProfileFactory(explicit).name;
  for (const [flag, alias] of Object.entries(PROFILE_ALIAS_FLAGS))
    if (options?.[flag] === true && alias.when(options)) return alias.profile;
  return '';
};

/**
 * The profile in effect for this process.
 * @returns {object} The active profile record.
 * @memberof UnderpostExecution
 */
const activeExecutionProfile = () => executionProfileFactory(process.env[EXECUTION_PROFILE_ENV_KEY]);

/**
 * Installs a profile as the process-wide default.
 *
 * Writing the environment variable is the propagation mechanism: children inherit the
 * environment, so a nested `underpost` invocation resolves the same profile with no
 * command-string threading.
 * @param {string} name - Profile name.
 * @returns {object} The profile now in effect.
 * @memberof UnderpostExecution
 */
const setExecutionProfile = (name) => {
  const profile = executionProfileFactory(name);
  process.env[EXECUTION_PROFILE_ENV_KEY] = profile.name;
  return profile;
};

/**
 * Runs `fn` under `name`, restoring the previous profile afterwards.
 *
 * Restores through a `finally` and awaits a thenable result, so a throwing or async
 * stage cannot leak a hermetic profile into the rest of the process.
 * @param {string} name - Profile to run under.
 * @param {Function} fn - Work to run.
 * @returns {*} Whatever `fn` returns.
 * @memberof UnderpostExecution
 */
const withExecutionProfile = (name, fn) => {
  const previous = process.env[EXECUTION_PROFILE_ENV_KEY];
  const restore = () => {
    if (previous === undefined) delete process.env[EXECUTION_PROFILE_ENV_KEY];
    else process.env[EXECUTION_PROFILE_ENV_KEY] = previous;
  };
  setExecutionProfile(name);
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
};

/**
 * Decides whether a command may run under the active profile.
 *
 * Returns a decision rather than acting on one; `shellExec` owns the consequence.
 * @param {string} cmd - The command string.
 * @param {object} [context] - Optional overrides.
 * @param {string} [context.profile] - Profile name, defaulting to the active one.
 * @returns {{permitted: boolean, capability: string, profile: string, neutral: boolean}} Decision.
 * @memberof UnderpostExecution
 */
const executionDecisionFactory = (cmd, { profile } = {}) => {
  const record = profile ? executionProfileFactory(profile) : activeExecutionProfile();
  const capability = classifyCommand(cmd);
  return {
    permitted: record.permits.includes(capability),
    capability,
    profile: record.name,
    neutral: record.reads === 'neutral',
  };
};

const localUnderpostCli = `node ${packageRoot}/bin/index.js`;
let underpostCliCache;

/**
 * Resolves how to invoke a CLI from a subprocess.
 *
 * Two different questions hide behind "run underpost", and conflating them runs the
 * wrong codebase:
 *
 *   - `local: true` — re-enter the package this process is running from, resolved through
 *     `import.meta.url`. From a checkout that is the checkout; from a global install it is
 *     that same global install, so a deployed node is unaffected. Every multi-stage runner
 *     wants this: a stage that re-enters `underpost` must run the code its parent runs, or
 *     the two disagree about layout. A stale global install reading credential seeds from a
 *     directory this version moved is what that skew looks like in practice.
 *   - default — whichever CLI this machine is meant to use: the globally linked binary
 *     when one exists, otherwise this checkout by absolute path, so a build box without a
 *     global install still works and callers that `cd` elsewhere keep resolving the same
 *     CLI.
 *
 * This replaces the `options.dev ? 'node bin' : 'underpost'` branch copied across 14 call
 * sites, none of which agreed on what happened when neither resolved.
 * @param {string} [name] - CLI to resolve.
 * @param {object} [options] - Resolution options.
 * @param {boolean} [options.local] - Re-enter this checkout instead of a global install.
 * @returns {string} Command prefix to invoke it with.
 * @memberof UnderpostExecution
 */
const cli = (name = 'underpost', { local = false } = {}) => {
  if (name !== 'underpost') return name;
  if (local) return localUnderpostCli;
  if (underpostCliCache) return underpostCliCache;
  try {
    execFileSync('sh', ['-c', 'command -v underpost'], { stdio: 'ignore' });
    underpostCliCache = 'underpost';
  } catch {
    underpostCliCache = localUnderpostCli;
  }
  return underpostCliCache;
};

export {
  activeExecutionProfile,
  CAPABILITIES,
  classifyCommand,
  cli,
  EXECUTION_PROFILE_ENV_KEY,
  EXECUTION_PROFILES,
  executionDecisionFactory,
  executionProfileFactory,
  PROFILE_ALIAS_FLAGS,
  profileFromOptionsFactory,
  setExecutionProfile,
  withExecutionProfile,
};
