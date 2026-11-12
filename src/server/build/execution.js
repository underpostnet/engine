/**
 * This module is pure with respect to the environment: it classifies, resolves and
 * decides, but never executes. Enforcement belongs to `src/server/runtime/process.js`,
 * which owns the subprocess boundary.
 *
 * @module src/server/build/execution.js
 * @namespace UnderpostExecution
 */

import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import shell from 'shelljs';

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

// `gh` and `socket` reach a remote service and write to it (`gh secret set`, `socket scan create`),
// so they are a network effect rather than local filesystem work — an unclassified binary would
// default to `fs` and run under HERMETIC_BUILD.
const NET_BINARIES = new Set([
  'curl',
  'wget',
  'ssh',
  'scp',
  'sftp',
  'rsync',
  'nc',
  'ping',
  'dig',
  'nslookup',
  'gh',
  'socket',
]);

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

const unquote = (token = '') => token.replace(/^['"]|['"]$/g, '');

/**
 * The program of one command segment: past `sudo` and its flags, and past the leading `VAR=value`
 * assignments, which are not the command. A quoted binary path (`'/x/.bin/socket' scan`) names the same
 * binary as the bare one.
 * @param {string} segment
 * @returns {{escalated: boolean, assignments: string[], binary: string, rest: string[]}} `rest` starts with
 *   the binary.
 */
const segmentProgram = (segment) => {
  const { tokens, escalated } = stripSudo(`${segment ?? ''}`.trim().split(/\s+/).filter(Boolean));
  let start = 0;
  while (start < tokens.length && /^[A-Z_][A-Z0-9_]*=/i.test(tokens[start])) start++;
  return {
    escalated,
    assignments: tokens.slice(0, start),
    binary: nodePath.basename(unquote(tokens[start] ?? '')),
    rest: tokens.slice(start),
  };
};

const classifySegment = (segment) => {
  const { escalated, binary, rest } = segmentProgram(segment);

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
 * The segments of a command: an argument vector is one, and a heredoc body is data, not commands, so a
 * command string splits on its first line alone.
 * @param {string|string[]} cmd
 * @returns {string[]}
 */
const commandSegments = (cmd) =>
  Array.isArray(cmd) ? [cmd.join(' ')] : `${cmd ?? ''}`.split(/<<-?\s*'?[A-Za-z_]+'?/)[0].split(/&&|\|\||[;|]/);

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
  if (!`${cmd ?? ''}`.trim()) return 'fs';
  let capability = 'fs';
  for (const segment of commandSegments(cmd)) {
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
 * Whether a segment reaches the Kubernetes API as root. `kubectl port-forward` does not count: it needs root
 * only to bind a host port below 1024, and keeps the kubeconfig of the invoking user.
 */
const reachesClusterAsRoot = (segment) => {
  if (!classifySegment(segment).startsWith('cluster:')) return false;
  const { binary, rest } = segmentProgram(segment);
  return !(binary === 'kubectl' && kubectlVerb(rest) === 'port-forward');
};

// Linux root is not the authorization of an API: Kubernetes has RBAC, and LXD authorizes the clients of its socket.
const PRIVILEGED_CLUSTER_REFUSAL =
  'A privileged command never reaches the Kubernetes API: kubectl and helm run as the invoking user, with its kubeconfig and RBAC';
const PRIVILEGED_LXD_REFUSAL =
  'A privileged command never runs the LXD client: lxc runs as the invoking user, with its LXD configuration and project';

/**
 * Decides whether a command may run under the active profile.
 *
 * Returns a decision rather than acting on one; `shellExec` owns the consequence. A privileged command is at
 * least a host write, and is refused when a segment runs `lxc`, or `kubectl` or `helm` apart from `kubectl port-forward`.
 * @param {string|string[]} cmd - The command string, or the argument vector of one program that runs
 *   without a shell.
 * @param {object} [context] - Optional overrides.
 * @param {string} [context.profile] - Profile name, defaulting to the active one.
 * @param {boolean} [context.privileged] - The command runs as root.
 * @returns {{permitted: boolean, capability: string, profile: string, neutral: boolean, refusal: string}} Decision.
 * @memberof UnderpostExecution
 */
const executionDecisionFactory = (cmd, { profile, privileged = false } = {}) => {
  const record = profile ? executionProfileFactory(profile) : activeExecutionProfile();
  const classified = Array.isArray(cmd) ? classifySegment(cmd.join(' ')) : classifyCommand(cmd);
  const capability =
    privileged && capabilityRank(classified) < capabilityRank('host:write') ? 'host:write' : classified;
  const segments = privileged ? commandSegments(cmd) : [];
  return {
    permitted: record.permits.includes(capability),
    capability,
    profile: record.name,
    neutral: record.reads === 'neutral',
    refusal: segments.some(reachesClusterAsRoot)
      ? PRIVILEGED_CLUSTER_REFUSAL
      : segments.some((segment) => segmentProgram(segment).binary === 'lxc')
        ? PRIVILEGED_LXD_REFUSAL
        : '',
  };
};

/**
 * @constant EXECUTION_TARGET_ENV_KEY
 * @description Environment key the cluster target of a command rides on into child processes, as JSON
 * (`UnderpostNamespace.target`). A nested `underpost` invocation of the same environment reaches the same
 * cluster through it.
 * @memberof UnderpostExecution
 */
const EXECUTION_TARGET_ENV_KEY = 'UNDERPOST_CLUSTER_TARGET';

/**
 * @constant VERIFIED_TARGET_ENV_KEY
 * @description Environment key that records the cluster this process tree verified, as JSON
 * `{context, fingerprint, server}`: a nested invocation of the same context verifies it once.
 * @memberof UnderpostExecution
 */
const VERIFIED_TARGET_ENV_KEY = 'UNDERPOST_CLUSTER_VERIFIED';

/**
 * The cluster target of this process.
 * @returns {Object|null} The target `UnderpostNamespace.target` resolved; null when no command resolved one.
 * @memberof UnderpostExecution
 */
const activeExecutionTarget = () => {
  const raw = process.env[EXECUTION_TARGET_ENV_KEY];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Installs the cluster target of this process and of every process it starts.
 * @param {Object|null} target - null removes it.
 * @returns {Object|null}
 * @memberof UnderpostExecution
 */
const setExecutionTarget = (target) => {
  if (target) process.env[EXECUTION_TARGET_ENV_KEY] = JSON.stringify(target);
  else delete process.env[EXECUTION_TARGET_ENV_KEY];
  return target;
};

// Helm verbs that read or write local files only.
const HELM_LOCAL_VERBS = new Set([
  'repo',
  'search',
  'show',
  'template',
  'version',
  'pull',
  'dependency',
  'lint',
  'env',
]);

/**
 * How a command segment reaches a cluster: `none`, `local` (the kubeconfig or charts only), `implicit`
 * (the context of the target), or `explicit` with the `context` it names ('' for a kubeconfig of its own).
 */
const segmentReach = (segment) => {
  const { assignments, binary, rest } = segmentProgram(segment);
  if (assignments.some((assignment) => assignment.startsWith('KUBECONFIG='))) return { reach: 'explicit', context: '' };
  if (!CLUSTER_BINARIES.has(binary)) return { reach: 'none' };
  for (let index = 0; index < rest.length; index++) {
    const [flag, inline] = unquote(rest[index]).split(/=(.*)/s);
    if (flag === '--kubeconfig') return { reach: 'explicit', context: '' };
    if (flag === '--context' || flag === '--kube-context')
      return { reach: 'explicit', context: unquote(inline ?? rest[index + 1]) };
  }
  if (binary === 'kubectl' ? kubectlVerb(rest) === 'config' : HELM_LOCAL_VERBS.has(rest[1])) return { reach: 'local' };
  return { reach: 'implicit' };
};

/**
 * Decides how a cluster command meets the cluster target of this process. A command that names its
 * kubeconfig, or a context other than the one of the target, chooses its cluster itself; any other is
 * refused when the target is, and a change through it is refused while the target has blockers.
 * @param {string|string[]} cmd - A command string, or the argument vector of one program.
 * @param {string} capability - Its {@link classifyCommand} capability.
 * @param {Object|null} [target] - The active target by default.
 * @returns {{refusal:string, verify:boolean}} `verify`: the command changes the cluster of the target, or
 *   the target is an override, so the process boundary verifies and prints the cluster first.
 * @memberof UnderpostExecution
 */
const targetDecisionFactory = (cmd, capability, target = activeExecutionTarget()) => {
  if (!target || !capability.startsWith('cluster:')) return { refusal: '', verify: false };
  const reaches = commandSegments(cmd).map(segmentReach);
  if (target.refusal)
    return { refusal: reaches.some(({ reach }) => reach === 'implicit') ? target.refusal : '', verify: false };
  const own = reaches.some(
    ({ reach, context }) => reach === 'implicit' || (reach === 'explicit' && context && context === target.context),
  );
  if (!own) return { refusal: '', verify: false };
  const change = capability === 'cluster:write';
  if (change && target.blockers?.length)
    return {
      refusal: `The ${target.environment} target refuses a change: ${target.blockers.join('; ')}`,
      verify: false,
    };
  return { refusal: '', verify: change || target.override === true };
};

/**
 * Why a live cluster is not the cluster of a target: it does not answer, or its fingerprint or its API server
 * differs from the identity the target declares. '' when it is, or when the target declares none.
 * @param {Object} target - The cluster target.
 * @param {{server:string, fingerprint:string}} live - What the context of the target reaches.
 * @returns {string}
 * @memberof UnderpostExecution
 */
const targetIdentityRefusal = (target, live) => {
  const { cluster } = target;
  if (!cluster) return '';
  const context = target.context || 'the current context';
  if (!live.fingerprint) return `${context} does not answer: its cluster identity cannot be verified`;
  if (live.fingerprint !== cluster.fingerprint)
    return (
      `${context} reaches the cluster ${live.fingerprint}, and environments.${target.environment}.cluster ` +
      `declares ${cluster.fingerprint}: check the context`
    );
  if (cluster.servers?.length && !cluster.servers.includes(live.server))
    return (
      `${context} reaches the API server ${live.server || 'unknown'}, which environments.${target.environment}` +
      `.cluster.servers does not list (${cluster.servers.join(', ')})`
    );
  return '';
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
  underpostCliCache = shell.which('underpost') ? 'underpost' : localUnderpostCli;
  return underpostCliCache;
};

export {
  activeExecutionProfile,
  activeExecutionTarget,
  CAPABILITIES,
  classifyCommand,
  cli,
  EXECUTION_PROFILE_ENV_KEY,
  EXECUTION_PROFILES,
  EXECUTION_TARGET_ENV_KEY,
  executionDecisionFactory,
  executionProfileFactory,
  PROFILE_ALIAS_FLAGS,
  profileFromOptionsFactory,
  setExecutionProfile,
  setExecutionTarget,
  targetDecisionFactory,
  targetIdentityRefusal,
  VERIFIED_TARGET_ENV_KEY,
  withExecutionProfile,
};
