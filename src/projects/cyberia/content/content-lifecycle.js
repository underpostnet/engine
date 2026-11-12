/**
 * The Cyberia content lifecycle: one durable cycle of content maintenance and release across the
 * nodes of a deployment, from the infrastructure backup to the runtime convergence.
 *
 * A cycle keeps an append-only journal of every operation a host runs for it, and the projection of
 * that journal: one execution of a stage per execution target, and the ids of the records each domain
 * owns. A target is the deployment, a Development Sandbox of one workstation, or a content checkout of
 * one workstation, so a stage complete for one target never completes it for another. An execution is
 * current only while the execution it was recorded against keeps its evidence, and while its target
 * keeps the fingerprint it was recorded on. A host runs only the stages that its Underpost node role,
 * the capabilities of that role and its environment allow; the lifecycle never runs a stage on
 * another host.
 *
 * @module src/projects/cyberia/content/content-lifecycle.js
 * @namespace CyberiaContentLifecycle
 */
import crypto from 'node:crypto';
import { MongooseDB } from '../../../db/mongo/mongoose-db.js';
import { roleHasCapability } from '../../../server/network/node-capability.js';

/** The APIs of the lifecycle records: the cycle and its journal. */
export const LIFECYCLE_APIS = Object.freeze(['cyberia-content-lifecycle', 'cyberia-content-lifecycle-event']);

/**
 * The stage execution policy: each responsibility a host takes in a cycle, the Underpost role that
 * takes it, the capability that role must hold, and the environment or checkout the command needs.
 * A context is not a node role: the role is the machine, the context is its work in a cycle.
 * @memberof CyberiaContentLifecycle
 */
export const CONTEXT_POLICY = Object.freeze({
  'infrastructure-control': Object.freeze({
    role: 'control',
    capability: 'kubernetes-administration',
    needs: ['the engine-private checkout', 'kubectl on the cluster'],
  }),
  'production-deployment': Object.freeze({
    role: 'control',
    capability: 'kubernetes-administration',
    environment: 'production',
    needs: ['the production env of the deploy (--env-path)'],
  }),
  'content-development': Object.freeze({
    role: 'workstation',
    capability: 'wireguard-spoke',
    environment: 'development',
    needs: [
      'a WireGuard tunnel to the hub',
      'a Development Sandbox session that serves the development MongoDB (underpost sandbox up)',
    ],
  }),
  'source-authoring': Object.freeze({
    role: 'workstation',
    capability: 'wireguard-spoke',
    sources: true,
    needs: ['the cyberia-content and cyberia-deployment checkouts', 'git push access to both'],
  }),
});

/** The responsibilities a host takes in a cycle. */
export const EXECUTION_CONTEXTS = Object.freeze(Object.keys(CONTEXT_POLICY));

/** What a host needs to take each context, from {@link CONTEXT_POLICY}. */
export const CONTEXT_REQUIREMENTS = Object.freeze(
  Object.fromEntries(
    Object.entries(CONTEXT_POLICY).map(([context, { role, environment, sources }]) => [
      context,
      [
        `a ${role} node`,
        environment && `in the ${environment} environment${environment === 'development' ? ' (--dev)' : ''}`,
        sources && 'with a cyberia-content checkout',
      ]
        .filter(Boolean)
        .join(', '),
    ]),
  ),
);

/** The context that keeps the cycles of a production deployment and shares them. */
const STORE_CONTEXT = 'infrastructure-control';

/** The variable that names a share of the cycles on another host: `http://<token>@<address>:<port>`. */
export const SHARE_ENV = 'CYBERIA_LIFECYCLE_SHARE';

/** How a lifecycle command ends: a refused precondition is `blocked`, apart from a failure. */
export const LIFECYCLE_EXIT = Object.freeze({ succeeded: 0, failed: 1, blocked: 3 });

/**
 * The kinds of execution target a stage runs against, by the noun a message names them with: the
 * deployment of the cycle, a Development Sandbox of one workstation with the database it serves, or a
 * cyberia-content checkout of one workstation.
 * @memberof CyberiaContentLifecycle
 */
export const TARGET_KINDS = Object.freeze({
  deployment: 'deployment',
  sandbox: 'Development Sandbox',
  source: 'cyberia-content checkout',
});

/** The operations the source release records in the journal, one for each of its commands. */
export const RELEASE_OPERATIONS = Object.freeze({
  build: 'source.build',
  lock: 'source.lock',
  publish: 'source.publish',
});

/** A command of a stage, and the operation it records in the journal when it records one. */
const step = (run, operation = '') => Object.freeze({ run, operation });

/** A Cyberia command as an operator runs it in the engine checkout. */
const cyberia = (args) => `node bin/cyberia ${args}`;

/** A Cyberia command of the control node: it names the deploy of the cycle, not the deploy of the host. */
const onControl = (args, { deployId, environment }) =>
  `${cyberia(args)} --env-path ./engine-private/conf/${deployId}/.env.${environment}`;

const stage = ({ id, label, target, contexts, commands, references = [], holds = () => true }) =>
  Object.freeze({ id, label, target, contexts, commands, references: Object.freeze(references), holds });

/**
 * The stages of a cycle in order. Each depends on the one before it. `target` is the kind of
 * execution target a stage completes for; `contexts` are all required on the host that records it;
 * `commands` are the steps that host runs, in order, the last one recording the stage; `references`
 * are the record ids of the cycle that only this stage sets; `holds` checks the evidence against the
 * target this host observes now.
 * @memberof CyberiaContentLifecycle
 */
export const LIFECYCLE_STAGES = Object.freeze([
  stage({
    id: 'preflight',
    label: 'Preflight',
    target: 'deployment',
    contexts: [],
    commands: (values) => [step(onControl(`content lifecycle doctor ${values.cycleId}`, values))],
  }),
  stage({
    id: 'infrastructure-backup',
    label: 'Infrastructure backup',
    target: 'deployment',
    contexts: ['infrastructure-control'],
    commands: (values) => [
      step(`node bin db ${values.deployId} --kubeadm --export --prune`),
      step(`node bin db ${values.deployId} --kubeadm --verify --restore-test`),
      step(onControl(`content lifecycle verify infrastructure-backup --cycle ${values.cycleId}`, values)),
    ],
    references: ['backupId'],
  }),
  stage({
    id: 'baseline-capture',
    label: 'Production baseline capture',
    target: 'deployment',
    contexts: ['production-deployment'],
    commands: (values) => [step(onControl(`content baseline capture --cycle ${values.cycleId}`, values))],
    references: ['baselineId', 'baselineReleaseId'],
  }),
  stage({
    id: 'baseline-verify',
    label: 'Baseline verification',
    target: 'deployment',
    contexts: ['production-deployment'],
    commands: (values) => [step(onControl(`content baseline verify --cycle ${values.cycleId}`, values))],
  }),
  stage({
    id: 'baseline-restore',
    label: 'Development baseline restore',
    target: 'sandbox',
    contexts: ['content-development'],
    commands: ({ cycleId, baselineId }) => [
      step(cyberia(`content baseline restore ${baselineId} --confirm ${baselineId} --cycle ${cycleId} --dev`)),
    ],
    // A dropped release database is a restore that no longer holds.
    holds: (evidence, target) => !target.databases || target.databases.includes(evidence.database),
  }),
  stage({
    id: 'source-export',
    label: 'Live content export to source',
    target: 'source',
    contexts: ['content-development', 'source-authoring'],
    commands: ({ cycleId, baselineId }) => [
      step(cyberia(`content source export-live --baseline ${baselineId} --dev`)),
      step(cyberia(`content source export-live --baseline ${baselineId} --apply --cycle ${cycleId} --dev`)),
    ],
  }),
  stage({
    id: 'workspace-reset',
    label: 'Development workspace reset',
    target: 'sandbox',
    contexts: ['content-development'],
    commands: ({ cycleId, deployId }) => [
      step('git -C cyberia-content commit  # the export, with the Baseline: line it prints'),
      step('(cd cyberia-content && node bin/cyberia-content.js build)'),
      step(cyberia(`content workspace reset --confirm ${deployId} --cycle ${cycleId} --dev`)),
    ],
  }),
  stage({
    id: 'source-review',
    label: 'Source review',
    target: 'source',
    contexts: ['source-authoring'],
    commands: ({ cycleId }) => [
      step(cyberia('instance snapshot <instance-code> --export --dev  # each world edited in the Studio')),
      step('git -C cyberia-content commit  # the reviewed change'),
      step(cyberia(`content lifecycle verify source-review --cycle ${cycleId}`)),
    ],
    references: ['contentRevision'],
    // A commit after the review is a change nobody reviewed.
    holds: (evidence, target) => !target.revision || evidence.contentRevision === target.revision,
  }),
  stage({
    id: 'source-release',
    label: 'Source build, lock and publication',
    target: 'source',
    contexts: ['source-authoring'],
    commands: ({ cycleId }) => [
      step(cyberia(`release build --commit --cycle ${cycleId}`), RELEASE_OPERATIONS.build),
      step(cyberia(`release lock --commit --cycle ${cycleId}`), RELEASE_OPERATIONS.lock),
      step(cyberia(`release publish --private --cycle ${cycleId}`), RELEASE_OPERATIONS.publish),
      step(cyberia(`content lifecycle verify source-release --cycle ${cycleId}`)),
    ],
    references: ['lockDigest', 'contentDigest'],
  }),
  stage({
    id: 'production-deploy',
    label: 'Production deployment',
    target: 'deployment',
    contexts: ['production-deployment'],
    // The cycle exported the live changes of the release its baseline captured: the deploy discards them.
    commands: (values) => [
      step(
        `DISCARD_LIVE_CHANGES=${values.baselineReleaseId} DISCARD_REASON="exported in cycle ${values.cycleId}" ` +
          `./deploy/${values.deployId}/sync-deploy.sh`,
      ),
      step(onControl(`content lifecycle verify production-deploy --cycle ${values.cycleId}`, values)),
    ],
    references: ['releaseId'],
  }),
  stage({
    id: 'runtime-verify',
    label: 'Runtime convergence',
    target: 'deployment',
    contexts: ['production-deployment'],
    commands: (values) => [
      step(onControl(`content lifecycle verify runtime-verify --cycle ${values.cycleId}`, values)),
    ],
  }),
]);

/**
 * Whether a host with these contexts runs a stage that completes for a target of this kind.
 * @param {string[]} contexts - The contexts of the host.
 * @param {string} kind - A key of {@link TARGET_KINDS}.
 * @returns {boolean}
 * @memberof CyberiaContentLifecycle
 */
export const runsTargetKind = (contexts, kind) =>
  LIFECYCLE_STAGES.some(
    ({ target, contexts: needed }) => target === kind && needed.every((context) => contexts.includes(context)),
  );

/** The stage ids in order: a cycle stores the order it starts with, and runs only under that order. */
export const LIFECYCLE_STAGE_ORDER = Object.freeze(LIFECYCLE_STAGES.map(({ id }) => id));

const followsStageOrder = (cycle) => cycle.stageOrder?.join() === LIFECYCLE_STAGE_ORDER.join();

const stageOf = (id) => {
  const found = LIFECYCLE_STAGES.find((entry) => entry.id === id);
  if (!found)
    throw failure('failed', `Unknown stage ${id}: one of ${LIFECYCLE_STAGES.map(({ id: known }) => known).join(', ')}`);
  return found;
};

/**
 * An error a lifecycle command reports with its outcome: `blocked` for a refused precondition.
 * @param {'failed'|'blocked'} outcome
 * @param {string} message
 * @returns {Error}
 * @memberof CyberiaContentLifecycle
 */
export const failure = (outcome, message) =>
  Object.assign(new Error(message), { outcome, status: outcome === 'blocked' ? 409 : 400, expected: true });

/** The sha256 of a JSON value, keys sorted at every level. */
const digest = (value) => {
  const canonical = (entry) =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry && typeof entry === 'object' && !(entry instanceof Date)
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, canonical(entry[key])]),
          )
        : entry;
  return `sha256:${crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(value) ?? null))
    .digest('hex')}`;
};

/**
 * The contexts a host may take under {@link CONTEXT_POLICY}. A flag that selects an environment never
 * grants a context, and a host with no node document takes none.
 * @param {Object} params
 * @param {string} params.role - The Underpost role of this host's node document; '' without one.
 * @param {string} params.environment - `development`, `production` or `test`.
 * @param {boolean} params.sources - Whether this host has a writable cyberia-content checkout.
 * @returns {string[]}
 * @memberof CyberiaContentLifecycle
 */
export function hostContexts({ role, environment, sources }) {
  return EXECUTION_CONTEXTS.filter((context) => {
    const policy = CONTEXT_POLICY[context];
    return (
      role === policy.role &&
      roleHasCapability(role, policy.capability) &&
      (!policy.environment || policy.environment === environment) &&
      (!policy.sources || sources === true)
    );
  });
}

/**
 * The lifecycle models on a runtime connection.
 * @param {import('mongoose').Connection} connection
 * @returns {Promise<{CyberiaContentLifecycle: import('mongoose').Model, CyberiaContentLifecycleEvent: import('mongoose').Model}>}
 * @memberof CyberiaContentLifecycle
 */
export const lifecycleModels = async (connection) => ({
  CyberiaContentLifecycle: await MongooseDB.bindModel(connection, 'cyberia-content-lifecycle'),
  CyberiaContentLifecycleEvent: await MongooseDB.bindModel(connection, 'cyberia-content-lifecycle-event'),
});

/**
 * An execution target: its kind, an id stable across its recreations, and the fingerprint of the
 * incarnation the identity describes. The identity holds no secret.
 * @param {string} kind - One of {@link TARGET_KINDS}.
 * @param {string} name - Unique within the kind.
 * @param {Object} identity
 * @returns {{kind:string, id:string, fingerprint:string, identity:Object}}
 * @memberof CyberiaContentLifecycle
 */
export const executionTarget = (kind, name, identity) => ({
  kind,
  id: `${kind}:${name}`,
  fingerprint: digest(identity),
  identity,
});

/**
 * The deployment target of a cycle.
 * @param {{deployId:string, environment:string}} cycle
 * @returns {ReturnType<typeof executionTarget>}
 * @memberof CyberiaContentLifecycle
 */
export const deploymentTarget = ({ deployId, environment }) =>
  executionTarget('deployment', `${deployId}/${environment}`, { deployId, environment });

/** The key of an execution in a cycle: one per stage and target. */
const executionKey = ({ stage: stageId, targetId }) => `${stageId}@${targetId}`;

const newest = (a, b) => new Date(b.at) - new Date(a.at);

/**
 * The state of every execution of a cycle by key. A completed execution is current while the
 * execution it was recorded against is current with the evidence it was recorded against, and while
 * its target, where this host observes it, has its fingerprint and holds its evidence.
 */
function executionStates(cycle, targets) {
  const executions = new Map((cycle.executions ?? []).map((execution) => [executionKey(execution), execution]));
  const states = new Map();
  const stateOf = (execution) => {
    const key = executionKey(execution);
    if (states.has(key)) return states.get(key);
    // A link back to itself never completes.
    states.set(key, 'stale');
    const definition = stageOf(execution.stage);
    const observed = targets[definition.target];
    const input = execution.inputExecution ? executions.get(execution.inputExecution) : null;
    let state = execution.status;
    if (state === 'completed') {
      if (observed?.id === execution.targetId) {
        if (
          observed.fingerprint !== execution.targetFingerprint ||
          !definition.holds(execution.evidence ?? {}, observed)
        )
          state = 'stale';
      }
      if (LIFECYCLE_STAGES.indexOf(definition) > 0 && (!input || stateOf(input) !== 'completed')) state = 'stale';
      else if (input && digest(input.evidenceDigest) !== execution.inputFingerprint) state = 'stale';
    }
    states.set(key, state);
    return state;
  };
  for (const execution of executions.values()) stateOf(execution);
  return { executions: [...executions.values()], states, stateOf };
}

/**
 * The state of each stage of a cycle for a host. A stage takes the execution of the target this host
 * holds of its kind; for a kind this host holds no target of, the newest current execution, or the
 * newest one. A stage with no such execution is `pending`. `executions` lists every execution of the
 * stage, each with its own target and state.
 * @param {Object} cycle - A stored cycle.
 * @param {Object<string, {id:string, fingerprint:string}>} [targets] - The targets this host
 *   observes, by kind; the deployment of the cycle is always one.
 * @returns {Array<{id:string, label:string, target:string, contexts:string[], state:string,
 *   targetId:string, record:?Object, executions:Object[]}>}
 * @memberof CyberiaContentLifecycle
 */
export function stageStates(cycle, targets = {}) {
  const observed = { ...targets, deployment: deploymentTarget(cycle) };
  const { executions, states } = executionStates(cycle, observed);
  return LIFECYCLE_STAGES.map(({ id, label, target, contexts }) => {
    const own = executions.filter((execution) => execution.stage === id).sort(newest);
    const record = observed[target]
      ? (own.find(({ targetId }) => targetId === observed[target].id) ?? null)
      : (own.find((execution) => states.get(executionKey(execution)) === 'completed') ?? own[0] ?? null);
    return {
      id,
      label,
      target,
      contexts,
      state: record ? states.get(executionKey(record)) : 'pending',
      targetId: record?.targetId ?? observed[target]?.id ?? '',
      record,
      executions: own.map((execution) => ({ ...execution, state: states.get(executionKey(execution)) })),
    };
  });
}

/** The status of a cycle from the state of its stages; `superseded` when it started under another stage order. */
const statusOf = (cycle, states) => {
  if (cycle.status === 'cancelled') return 'cancelled';
  if (!followsStageOrder(cycle)) return cycle.status === 'completed' ? 'completed' : 'superseded';
  if (states.at(-1).state === 'completed') return 'completed';
  const next = states.find(({ state }) => state !== 'completed');
  return next.state === 'failed' ? 'failed' : next.state === 'blocked' ? 'blocked' : 'in-progress';
};

/** What a plan shows of an execution: never its evidence digest or its input link. */
const executionView = ({
  targetId,
  targetKind,
  targetFingerprint,
  target,
  state,
  status,
  attempts,
  at,
  node,
  eventId,
  error,
  evidence,
}) => ({
  targetId,
  targetKind,
  targetFingerprint,
  target: target ?? {},
  state: state ?? status,
  attempts,
  at,
  node,
  eventId,
  error: error || undefined,
  evidence,
});

/**
 * The commands of a stage that already ran since the execution it depends on, and the ones left. A
 * command ran once the operation it records succeeded after the command before it; the rest follow
 * the first one that has not.
 * @param {Object} cycle - A stored cycle.
 * @param {Object} definition - A stage of {@link LIFECYCLE_STAGES}.
 * @param {Object} values - The values its commands name.
 * @param {?Object} input - The execution of the stage before it.
 * @returns {{done:string[], commands:string[]}}
 */
const stageProgress = (cycle, definition, values, input) => {
  const steps = definition.commands(values);
  let since = input ? new Date(input.at) : null;
  let ran = 0;
  for (const { operation } of steps) {
    const outcome = operation && (cycle.operations ?? []).find((entry) => entry.operation === operation);
    if (outcome?.status !== 'succeeded' || (since && new Date(outcome.at) <= since)) break;
    since = new Date(outcome.at);
    ran++;
  }
  return { done: steps.slice(0, ran).map(({ run }) => run), commands: steps.slice(ran).map(({ run }) => run) };
};

/**
 * The plan of a cycle: the state of each stage, and the next one with the contexts, target and
 * commands that record it, those that already ran apart. With a host, each stage is evaluated against the targets this host
 * observes, and says whether this host may record it, and why not.
 * @param {Object} cycle - A stored cycle.
 * @param {{contexts?:string[], targets?:Object}} [host] - This host; without contexts, the plan only
 *   evaluates its targets.
 * @returns {Object}
 * @memberof CyberiaContentLifecycle
 */
export function lifecyclePlan(cycle, host) {
  const targets = host?.targets ?? {};
  const states = stageStates(cycle, targets);
  const values = {
    cycleId: cycle.cycleId,
    deployId: cycle.deployId,
    environment: cycle.environment,
    baselineId: cycle.references?.baselineId || '<baseline-id>',
    baselineReleaseId: cycle.references?.baselineReleaseId || '<active-release-id>',
  };
  const reasonOf = ({ contexts, target }) => {
    if (!host?.contexts) return undefined;
    const missing = contexts.filter((context) => !host.contexts.includes(context));
    if (missing.length) return `this host is not ${missing.join(' and ')}`;
    return target === 'deployment' || targets[target] ? '' : `this host observes no ${TARGET_KINDS[target]}`;
  };
  const stages = states.map(({ id, label, target, contexts, state, targetId, record, executions }) => ({
    id,
    label,
    target,
    contexts,
    state,
    targetId,
    ...(record && {
      at: record.at,
      node: record.node,
      eventId: record.eventId,
      attempts: record.attempts,
      error: record.error || undefined,
    }),
    executions: executions.map(executionView),
    ...(host?.contexts && {
      here: reasonOf({ contexts, target }) === '',
      reason: reasonOf({ contexts, target }) || undefined,
    }),
  }));
  const next = stages.find(({ state }) => state !== 'completed');
  const status = statusOf(cycle, states);
  return {
    cycleId: cycle.cycleId,
    deployId: cycle.deployId,
    environment: cycle.environment,
    status,
    scope: cycle.scope,
    references: cycle.references ?? {},
    targets: { deployment: deploymentTarget(cycle), ...targets },
    stages,
    next:
      next && !['cancelled', 'superseded'].includes(status)
        ? {
            ...next,
            role: CONTEXT_POLICY[next.contexts[0]]?.role ?? '',
            requirements: next.contexts.map((context) => CONTEXT_REQUIREMENTS[context]),
            needs: [...new Set(next.contexts.flatMap((context) => CONTEXT_POLICY[context].needs))],
            ...stageProgress(
              cycle,
              stageOf(next.id),
              values,
              states[LIFECYCLE_STAGE_ORDER.indexOf(next.id) - 1]?.record,
            ),
          }
        : null,
  };
}

/**
 * What a list of cycles shows of one: its status, scope, progress and next stage, for the targets a
 * host observes.
 * @param {Object} cycle - A stored cycle.
 * @param {{targets?:Object}} [host] - The targets this host observes.
 * @returns {Object}
 * @memberof CyberiaContentLifecycle
 */
export function lifecycleSummary(cycle, host) {
  const { status, scope, stages, next } = lifecyclePlan(cycle, host && { targets: host.targets });
  return {
    cycleId: cycle.cycleId,
    deployId: cycle.deployId,
    environment: cycle.environment,
    status,
    scope,
    completed: stages.filter(({ state }) => state === 'completed').length,
    stages: stages.length,
    targets: [...new Set((cycle.executions ?? []).map(({ targetId }) => targetId))].length,
    next: next && { id: next.id, label: next.label, target: next.target, contexts: next.contexts, state: next.state },
    createdBy: cycle.createdBy,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

/** What the plan of a cycle that takes no next stage says, by status. */
const CLOSED_PLAN = Object.freeze({
  cancelled: 'Cancelled.',
  superseded: 'It started under an earlier stage order: cancel it and start a new cycle.',
});

/**
 * The plan of a cycle as text for the operator of the next host.
 * @param {Object} plan - {@link lifecyclePlan} output.
 * @param {?{hubHost:string, hosts:Array<{nodeName:string, peerId:string, address:string}>}} [enrollment] -
 *   The enrolled nodes of the role the next stage needs, on the hub of this host; null off the tunnel.
 * @returns {string}
 * @memberof CyberiaContentLifecycle
 */
export function handoffText(plan, enrollment = null) {
  const hosts = enrollment?.hosts ?? [];
  const completed = plan.stages
    .filter(({ state }) => state === 'completed')
    .map(({ label, targetId }) => `  ${label} for ${targetId}`);
  const lines = [
    `Lifecycle: ${plan.cycleId} (${plan.deployId}, ${plan.environment}): ${plan.status}`,
    ...(plan.references.baselineId ? [`Baseline: ${plan.references.baselineId}`] : []),
    '',
    'Completed:',
  ];
  lines.push(...(completed.length ? completed : ['  none']), '');
  if (!plan.next) return [...lines, CLOSED_PLAN[plan.status] ?? 'Every stage is complete.'].join('\n');
  const { next } = plan;
  lines.push(
    'Next:',
    `  ${next.label} (${next.id})${next.state === 'pending' ? '' : `: ${next.state}`}`,
    `  for ${next.targetId || TARGET_KINDS[next.target]}`,
    '',
  );
  lines.push(
    'Required host:',
    ...(next.contexts.length
      ? next.contexts.map((context, index) => `  ${context}: ${next.requirements[index]}`)
      : ['  any host']),
    ...next.needs.map((need) => `  needs ${need}`),
    '',
  );
  if (next.role && enrollment)
    lines.push(
      `Enrolled ${next.role} nodes:`,
      ...(hosts.length
        ? hosts.map(({ nodeName, peerId, address }) => `  ${nodeName}: peer ${peerId}, tunnel address ${address}`)
        : [
            `  none on hub ${enrollment.hubHost}: enroll one with`,
            `  node bin wireguard --node-config --node-role ${next.role} --hub-host ${enrollment.hubHost} --peer-id <peer-id>`,
          ]),
      '',
    );
  if (next.reason !== undefined) lines.push('This host:', `  ${next.here ? 'may run it' : next.reason}`, '');
  if (next.error) lines.push('Last error:', `  ${next.error}`, '');
  // A host of another role reaches the cycles of production through a share of the control node.
  if (
    plan.environment === 'production' &&
    next.here !== true &&
    next.role &&
    next.role !== CONTEXT_POLICY[STORE_CONTEXT].role
  )
    lines.push(
      'Connect that host first:',
      `  On the control node: ${cyberia(`content lifecycle share ${plan.cycleId} --peer-id ${hosts.length === 1 ? hosts[0].peerId : '<peer-id>'}`)} \\`,
      `    --env-path ./engine-private/conf/${plan.deployId}/.env.${plan.environment}`,
      `  On that host: export ${SHARE_ENV}=<the value the share prints>`,
      '',
    );
  if (next.done.length) lines.push('Done:', ...next.done.map((command) => `  ${command}`), '');
  lines.push('Commands:', ...next.commands.map((command) => `  ${command}`));
  return lines.join('\n');
}

/**
 * A new cycle id: the deploy id, the minute and a random suffix.
 * @param {string} deployId
 * @param {Date} [now]
 * @returns {string}
 * @memberof CyberiaContentLifecycle
 */
export const cycleIdFactory = (deployId, now = new Date()) =>
  `${deployId}-${now.toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${crypto.randomBytes(3).toString('hex')}`;

/**
 * Reads a cycle.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {string} cycleId
 * @returns {Promise<Object>}
 * @throws {Error} When no cycle has this id.
 * @memberof CyberiaContentLifecycle
 */
export async function readLifecycle({ CyberiaContentLifecycle }, cycleId) {
  const cycle = await CyberiaContentLifecycle.findOne({ cycleId }).lean();
  if (!cycle) throw Object.assign(failure('failed', `No content lifecycle ${cycleId}`), { status: 404 });
  return cycle;
}

/**
 * Appends one event to the journal of a cycle. An event with the idempotency key of a stored one is
 * not appended: the stored one answers.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {Object} event - The event fields; `cycleId` and `operation` at least.
 * @returns {Promise<{event:Object, duplicate:boolean}>}
 * @memberof CyberiaContentLifecycle
 */
export async function appendEvent({ CyberiaContentLifecycle, CyberiaContentLifecycleEvent }, event) {
  const stored = () =>
    CyberiaContentLifecycleEvent.findOne({ cycleId: event.cycleId, idempotencyKey: event.idempotencyKey }).lean();
  if (event.idempotencyKey) {
    const found = await stored();
    if (found) return { event: found, duplicate: true };
  }
  const counter = await CyberiaContentLifecycle.findOneAndUpdate(
    { cycleId: event.cycleId },
    { $inc: { sequence: 1 } },
    { returnDocument: 'after', projection: { sequence: 1 } },
  ).lean();
  if (!counter) throw Object.assign(failure('failed', `No content lifecycle ${event.cycleId}`), { status: 404 });
  try {
    const created = await CyberiaContentLifecycleEvent.create({
      ...event,
      eventId: crypto.randomUUID(),
      seq: counter.sequence,
      completedAt: event.completedAt ?? new Date(),
    });
    return { event: created.toObject(), duplicate: false };
  } catch (error) {
    if (error.code === 11000 && event.idempotencyKey) return { event: await stored(), duplicate: true };
    throw error;
  }
}

/** Writes a change of the projection against the revision it read; a concurrent write makes it read again. */
async function project({ CyberiaContentLifecycle }, cycleId, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cycle = await CyberiaContentLifecycle.findOne({ cycleId }).lean();
    const next = change(cycle);
    const states = stageStates(next);
    const { matchedCount } = await CyberiaContentLifecycle.updateOne(
      { cycleId, revision: cycle.revision },
      {
        $set: {
          executions: next.executions,
          operations: next.operations ?? [],
          references: next.references,
          status: statusOf(next, states),
        },
        $inc: { revision: 1 },
      },
    );
    if (matchedCount) return;
  }
  throw failure('failed', `Cycle ${cycleId} changed on every try: record the stage again`);
}

/**
 * Starts a cycle and records its first event.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {Object} params
 * @param {string} params.deployId
 * @param {string} params.environment
 * @param {{sagas?:string[], instances?:string[], maps?:string[], items?:string[], cids?:string[]}} [params.scope]
 * @param {Object} params.host - {@link hostContexts} with `node` and `actor`.
 * @param {string} [params.commandId]
 * @returns {Promise<Object>} The stored cycle.
 * @memberof CyberiaContentLifecycle
 */
export async function startLifecycle(models, { deployId, environment, scope = {}, host, commandId = '' }) {
  const startedAt = new Date();
  const cycleId = cycleIdFactory(deployId, startedAt);
  await models.CyberiaContentLifecycle.create({
    cycleId,
    deployId,
    environment,
    stageOrder: LIFECYCLE_STAGE_ORDER,
    scope,
    origin: host.node,
    createdBy: host.actor,
  });
  await appendEvent(models, {
    cycleId,
    operation: 'lifecycle.start',
    status: 'succeeded',
    ...eventHost(host, deployId),
    commandId,
    startedAt,
    resultSummary: { scope },
  });
  return await readLifecycle(models, cycleId);
}

/** The fields of an event that name the host, its actor and the share it came through. */
const eventHost = (host, deployId) => ({
  actor: host.actor,
  node: host.node,
  environment: host.environment,
  executionContext: host.contexts.join(','),
  deployId,
  shareId: host.shareId ?? '',
});

/**
 * Refuses a cycle that takes no more operations: a cancelled or a completed one, and one that started
 * under another stage order.
 * @param {Object} cycle - A stored cycle.
 * @throws {Error} `blocked`.
 * @memberof CyberiaContentLifecycle
 */
export function assertCycleOpen(cycle) {
  if (['cancelled', 'completed'].includes(cycle.status))
    throw failure('blocked', `Cycle ${cycle.cycleId} is ${cycle.status}: start a new cycle`);
  if (!followsStageOrder(cycle))
    throw failure(
      'blocked',
      `Cycle ${cycle.cycleId} started under an earlier stage order: cancel it and start a new cycle`,
    );
}

/**
 * Whether this host may note an operation in a cycle: the cycle is open and the host takes part in it,
 * that is, it holds a context of {@link CONTEXT_POLICY}.
 * @param {Object} cycle - A stored cycle.
 * @param {string} operation
 * @param {{contexts:string[], node:Object, environment:string}} host
 * @throws {Error} `blocked` with the reason.
 * @memberof CyberiaContentLifecycle
 */
export function assertOperationReady(cycle, operation, host) {
  assertCycleOpen(cycle);
  if (!host.contexts.length)
    throw failure(
      'blocked',
      `${operation} in cycle ${cycle.cycleId} needs a host that takes part in it; this one takes no context (node ${host.node.nodeName || 'unknown'}, role ${host.node.role || 'none'}, ${host.environment})`,
    );
}

/** Why a host may not record a stage for lack of a target of its kind. */
const unobservedReason = (definition, host) =>
  `${definition.label} runs for one ${TARGET_KINDS[definition.target]}; this host observes none` +
  (host.unobserved?.[definition.target] ? `: ${host.unobserved[definition.target]}` : '');

/**
 * The target a stage of this host runs against: the deployment of the cycle, or the target of its
 * kind this host observes.
 * @param {Object} cycle - A stored cycle.
 * @param {string} stageId
 * @param {{targets?:Object}} host
 * @returns {?{kind:string, id:string, fingerprint:string, identity:Object}}
 * @memberof CyberiaContentLifecycle
 */
const stageTarget = (cycle, stageId, host) => {
  const { target } = stageOf(stageId);
  return target === 'deployment' ? deploymentTarget(cycle) : (host.targets?.[target] ?? null);
};

/**
 * Whether this host may record a stage now: the cycle is open, this host holds every context of the
 * stage and a target of its kind, and the stage before it is complete for this host. With `rerun`
 * false, a stage complete and current for that target refuses too: an operation with side effects
 * runs again only as an explicit new attempt.
 * @param {Object} cycle - A stored cycle.
 * @param {string} stageId
 * @param {{contexts:string[], node:Object, environment:string, targets?:Object}} host
 * @param {{rerun?:boolean}} [options]
 * @throws {Error} `blocked` with the reason.
 * @memberof CyberiaContentLifecycle
 */
export function assertStageReady(cycle, stageId, host, { rerun = true } = {}) {
  const definition = stageOf(stageId);
  assertCycleOpen(cycle);
  const missing = definition.contexts.filter((context) => !host.contexts.includes(context));
  if (missing.length)
    throw failure(
      'blocked',
      `${definition.label} needs a host that is ${missing.join(' and ')}; this one is ${host.contexts.join(', ') || 'none'} (node ${host.node.nodeName || 'unknown'}, role ${host.node.role || 'none'}, ${host.environment})`,
    );
  const target = stageTarget(cycle, stageId, host);
  if (!target) throw failure('blocked', unobservedReason(definition, host));
  const states = stageStates(cycle, host.targets);
  const index = LIFECYCLE_STAGES.indexOf(definition);
  const previous = states[index - 1];
  if (previous && previous.state !== 'completed')
    throw failure(
      'blocked',
      `${definition.label} waits for ${previous.label} (${previous.id}) for ${previous.targetId || TARGET_KINDS[previous.target]}: it is ${previous.state}`,
    );
  if (!rerun && states[index].state === 'completed')
    throw failure(
      'blocked',
      `${definition.label} is complete for ${target.id} (event ${states[index].record.eventId}): pass --new-attempt to run it again`,
    );
}

/**
 * The execution a record of a stage makes on this host, before the journal names its event: its
 * target, the execution of the stage before it that this host resolves with the digest of that
 * evidence, and its attempt. `state` is the state of the stage for that target before the record.
 * @param {Object} cycle - A stored cycle.
 * @param {string} stageId
 * @param {Object} host - With the `targets` it observes; it must hold a target of the stage kind.
 * @param {{status:'succeeded'|'failed'|'blocked', evidence?:Object, error?:string}} outcome
 * @returns {{execution:Object, state:string}}
 * @memberof CyberiaContentLifecycle
 */
export function stageExecution(cycle, stageId, host, { status, evidence = {}, error = '' }) {
  const definition = stageOf(stageId);
  const target = stageTarget(cycle, stageId, host);
  const states = stageStates(cycle, host.targets);
  const index = LIFECYCLE_STAGES.indexOf(definition);
  const input = states[index - 1]?.record ?? null;
  const inputFingerprint = input ? digest(input.evidenceDigest) : '';
  const stored = (cycle.executions ?? []).find(
    (execution) => execution.stage === stageId && execution.targetId === target.id,
  );
  return {
    state: states[index].state,
    execution: {
      stage: stageId,
      targetId: target.id,
      targetKind: target.kind,
      targetFingerprint: target.fingerprint,
      target: target.identity,
      status: status === 'succeeded' ? 'completed' : status,
      attempts:
        stored && stored.inputFingerprint === inputFingerprint && stored.targetFingerprint === target.fingerprint
          ? stored.attempts + 1
          : 1,
      inputExecution: input ? executionKey(input) : '',
      inputFingerprint,
      evidenceDigest: status === 'succeeded' ? digest(evidence) : '',
      evidence,
      error,
    },
  };
}

/**
 * Records the outcome of a stage on this host for its target: one journal event and the execution of
 * that stage and target. The execution links the execution of the stage before it that this host
 * resolves, and the evidence that one holds. A completed execution with the same target, input and
 * evidence as a stored one appends nothing. A failed or blocked attempt on an execution that is
 * complete and current stays in the journal only. The cycle keeps only the references the stage owns.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {Object} params
 * @param {Object} params.cycle - The cycle as {@link assertStageReady} read it.
 * @param {string} params.stageId
 * @param {Object} params.host - With the `targets` it observes.
 * @param {'succeeded'|'failed'|'blocked'} params.status
 * @param {Object} [params.evidence] - What the stage proved, for a completed stage.
 * @param {Object} [params.references] - The domain record ids to keep on the cycle.
 * @param {string} [params.error]
 * @param {string} [params.commandId]
 * @param {Date} [params.startedAt]
 * @returns {Promise<{event:Object, duplicate:boolean}>}
 * @throws {Error} `blocked` when this host has no target for the stage.
 * @memberof CyberiaContentLifecycle
 */
export async function recordStage(
  models,
  { cycle, stageId, host, status, evidence = {}, references = {}, error = '', commandId = '', startedAt = new Date() },
) {
  const definition = stageOf(stageId);
  const target = stageTarget(cycle, stageId, host);
  if (!target) {
    if (status === 'succeeded') throw failure('blocked', unobservedReason(definition, host));
    // An attempt with no target of its kind has no execution: the journal keeps it.
    return await appendEvent(models, {
      cycleId: cycle.cycleId,
      stage: stageId,
      operation: 'stage.refused',
      status,
      ...eventHost(host, cycle.deployId),
      commandId,
      startedAt,
      resultSummary: { stage: stageId },
      error,
    });
  }
  const { execution, state } = stageExecution(cycle, stageId, host, { status, evidence, error });
  const owned = Object.fromEntries(Object.entries(references).filter(([key]) => definition.references.includes(key)));
  const appended = await appendEvent(models, {
    cycleId: cycle.cycleId,
    stage: stageId,
    operation: 'stage.record',
    status,
    ...eventHost(host, cycle.deployId),
    commandId,
    startedAt,
    attempt: execution.attempts,
    executionTargetId: execution.targetId,
    targetKind: execution.targetKind,
    targetFingerprint: execution.targetFingerprint,
    target: execution.target,
    inputExecution: execution.inputExecution,
    idempotencyKey:
      status === 'succeeded'
        ? `${stageId}:${execution.targetId}:${execution.targetFingerprint}:${execution.inputFingerprint}:${execution.evidenceDigest}`
        : '',
    inputFingerprint: execution.inputFingerprint,
    resultSummary: evidence,
    references: owned,
    error,
  });
  if (appended.duplicate || (status !== 'succeeded' && state === 'completed')) return appended;
  await project(models, cycle.cycleId, (current) => ({
    ...current,
    executions: [
      ...(current.executions ?? []).filter(
        (stored) => !(stored.stage === stageId && stored.targetId === execution.targetId),
      ),
      { ...execution, eventId: appended.event.eventId, node: host.node, at: appended.event.completedAt },
    ],
    references: { ...current.references, ...(status === 'succeeded' ? owned : {}) },
  }));
  return appended;
}

/**
 * Records an operation a host ran for a cycle outside the stage chain, such as a saga import or a
 * provider synchronization: one journal event, the newest outcome of that operation on the cycle, and
 * what it names added to the scope of the cycle.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {Object} params
 * @param {string} params.cycleId
 * @param {string} params.operation
 * @param {Object} params.host
 * @param {'succeeded'|'failed'} params.status
 * @param {Object} [params.summary]
 * @param {Object} [params.references]
 * @param {Object} [params.scope] - Saga, instance, map, item and CID lists to add to the scope.
 * @param {string} [params.error]
 * @param {string} [params.commandId]
 * @param {Date} [params.startedAt]
 * @returns {Promise<{event:Object, duplicate:boolean}>}
 * @memberof CyberiaContentLifecycle
 */
export async function noteOperation(
  models,
  {
    cycleId,
    operation,
    host,
    status,
    summary = {},
    references = {},
    scope = {},
    error = '',
    commandId = '',
    startedAt = new Date(),
  },
) {
  const cycle = await readLifecycle(models, cycleId);
  assertCycleOpen(cycle);
  const appended = await appendEvent(models, {
    cycleId,
    operation,
    status,
    ...eventHost(host, cycle.deployId),
    commandId,
    startedAt,
    resultSummary: summary,
    references,
    error,
  });
  const { completedAt: at, eventId } = appended.event;
  await project(models, cycleId, (current) => ({
    ...current,
    operations: [
      ...(current.operations ?? []).filter((entry) => entry.operation !== operation),
      { operation, status, at, eventId },
    ],
  }));
  const additions = Object.entries(scope).filter(([, values]) => values?.length);
  if (additions.length)
    await models.CyberiaContentLifecycle.updateOne(
      { cycleId },
      { $addToSet: Object.fromEntries(additions.map(([key, values]) => [`scope.${key}`, { $each: values }])) },
    );
  return appended;
}

/**
 * Cancels a cycle with a reason: it takes no stage and no operation after this.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {{cycleId:string, reason:string, host:Object, commandId?:string}} params
 * @returns {Promise<Object>} The event.
 * @memberof CyberiaContentLifecycle
 */
export async function cancelLifecycle(models, { cycleId, reason, host, commandId = '' }) {
  if (!String(reason ?? '').trim()) throw failure('blocked', 'A cancellation needs a reason');
  const cycle = await readLifecycle(models, cycleId);
  if (cycle.status === 'cancelled') throw failure('blocked', `Cycle ${cycleId} is cancelled already`);
  const { event } = await appendEvent(models, {
    cycleId,
    operation: 'lifecycle.cancel',
    status: 'cancelled',
    ...eventHost(host, cycle.deployId),
    commandId,
    startedAt: new Date(),
    resultSummary: { reason },
  });
  await models.CyberiaContentLifecycle.updateOne({ cycleId }, { $set: { status: 'cancelled' }, $inc: { revision: 1 } });
  return event;
}
