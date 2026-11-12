/**
 * Pod scheduling of an Underpost manifest: a node affinity on the `kubernetes.io/hostname` label of the
 * nodes of a group, required or preferred, and a toleration of the control-plane taint when a node of the
 * group carries it. No other taint is tolerated: a node with one does not take the resource.
 *
 * @module src/server/runtime/pod-scheduling.js
 * @namespace PodScheduling
 */
import { dump } from 'js-yaml';

/** The taint kubeadm puts on a control-plane node. */
const CONTROL_PLANE_TAINT = 'node-role.kubernetes.io/control-plane';

/** The node label a scheduling selects on. */
const HOSTNAME_LABEL = 'kubernetes.io/hostname';

/** The effects that keep a pod off a node. */
const BLOCKING_EFFECTS = Object.freeze(['NoSchedule', 'NoExecute']);

/**
 * The scheduling fields of a pod spec for the nodes of a group.
 * @param {{hostnames?:string[], mode?:'required'|'preferred'|'scheduler', taints?:Array<{key:string, effect:string}>}}
 *   params - The `kubernetes.io/hostname` labels of the nodes, the mode, and the taints of every node.
 * @returns {{affinity?:Object, tolerations?:Object[]}} Empty without a node or in the scheduler mode.
 * @memberof PodScheduling
 */
const podSchedulingFactory = ({ hostnames = [], mode = 'required', taints = [] } = {}) => {
  if (!hostnames.length || mode === 'scheduler') return {};
  const term = { matchExpressions: [{ key: HOSTNAME_LABEL, operator: 'In', values: [...new Set(hostnames)] }] };
  const nodeAffinity =
    mode === 'preferred'
      ? { preferredDuringSchedulingIgnoredDuringExecution: [{ weight: 100, preference: term }] }
      : { requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [term] } };
  const tolerations = [
    ...new Set(
      taints
        .filter(({ key, effect }) => key === CONTROL_PLANE_TAINT && BLOCKING_EFFECTS.includes(effect))
        .map(({ effect }) => effect),
    ),
  ].map((effect) => ({ key: CONTROL_PLANE_TAINT, operator: 'Exists', effect }));
  return { affinity: { nodeAffinity }, ...(tolerations.length ? { tolerations } : {}) };
};

/**
 * The taints of a node that keep the pods of a scheduling off it: every blocking taint but the one its
 * tolerations accept.
 * @param {Array<{key:string, effect:string}>} taints
 * @returns {string[]} `key:effect` of each.
 * @memberof PodScheduling
 */
const blockingTaints = (taints = []) =>
  taints
    .filter(({ key, effect }) => BLOCKING_EFFECTS.includes(effect) && key !== CONTROL_PLANE_TAINT)
    .map(({ key, effect }) => `${key}:${effect}`);

/**
 * The scheduling fields as YAML lines of a pod spec.
 * @param {{affinity?:Object, tolerations?:Object[]}} scheduling
 * @param {number} indent - The indentation of the pod spec keys.
 * @returns {string} Lines that end with a newline; empty without a field.
 * @memberof PodScheduling
 */
const podSchedulingYaml = ({ affinity, tolerations = [] } = {}, indent) => {
  const fields = { ...(affinity ? { affinity } : {}), ...(tolerations.length ? { tolerations } : {}) };
  if (!Object.keys(fields).length) return '';
  const pad = ' '.repeat(indent);
  return dump(fields, { lineWidth: -1 })
    .split('\n')
    .filter(Boolean)
    .map((line) => `${pad}${line}\n`)
    .join('');
};

/**
 * A Kubernetes object with the scheduling in its pod template. A DaemonSet keeps its own: it runs on
 * every eligible node.
 * @param {Object} object - A Deployment, StatefulSet, Job, CronJob or any other object.
 * @param {{affinity?:Object, tolerations?:Object[]}} scheduling
 * @returns {Object} A copy; the object itself when it has no pod template to schedule.
 * @memberof PodScheduling
 */
const schedulePodTemplate = (object, scheduling) => {
  const path = { Deployment: ['spec'], StatefulSet: ['spec'], Job: ['spec'], CronJob: ['spec', 'jobTemplate', 'spec'] }[
    object?.kind
  ];
  if (!path || !scheduling.affinity) return object;
  const copy = structuredClone(object);
  const spec = path.reduce((node, key) => node[key], copy).template.spec;
  spec.affinity = { ...spec.affinity, nodeAffinity: scheduling.affinity.nodeAffinity };
  if (scheduling.tolerations) spec.tolerations = [...(spec.tolerations ?? []), ...scheduling.tolerations];
  return copy;
};

/** Whether a toleration accepts a taint. */
const tolerates = (toleration, taint) =>
  (!toleration.effect || toleration.effect === taint.effect) &&
  (toleration.operator === 'Exists'
    ? !toleration.key || toleration.key === taint.key
    : toleration.key === taint.key && (toleration.value ?? '') === (taint.value ?? ''));

/** Whether node labels and a node name satisfy one node selector requirement. */
const satisfies = ({ key, operator, values = [] }, labels) => {
  const value = labels[key];
  if (operator === 'In') return value !== undefined && values.includes(value);
  if (operator === 'NotIn') return value === undefined || !values.includes(value);
  if (operator === 'Exists') return value !== undefined;
  if (operator === 'DoesNotExist') return value === undefined;
  if (operator === 'Gt' || operator === 'Lt')
    return (
      value !== undefined && (operator === 'Gt' ? Number(value) > Number(values[0]) : Number(value) < Number(values[0]))
    );
  return false;
};

/**
 * Why a node cannot run the pods of a pod spec once the `replaced` nodeSelector keys change: it is not Ready
 * or cordoned, it has a blocking taint the pods do not tolerate, its labels miss another nodeSelector key, or
 * the required node affinity excludes it.
 * @param {{pod:Object, node:Object, replaced?:string[]}} params - The pod spec, the Node as the API returns it,
 *   and the nodeSelector keys the change sets.
 * @returns {string[]}
 * @memberof PodScheduling
 */
const admissionRefusals = ({ pod, node, replaced = [] }) => {
  const name = node.metadata.name;
  const labels = node.metadata.labels ?? {};
  const ready = (node.status?.conditions ?? []).some(({ type, status }) => type === 'Ready' && status === 'True');
  const reasons = [
    ...(ready ? [] : [`node ${name} is not Ready`]),
    ...(node.spec?.unschedulable ? [`node ${name} is cordoned`] : []),
    ...(node.spec?.taints ?? [])
      .filter((taint) => BLOCKING_EFFECTS.includes(taint.effect))
      .filter((taint) => !(pod.tolerations ?? []).some((toleration) => tolerates(toleration, taint)))
      .map((taint) => `node ${name} has the taint ${taint.key}:${taint.effect}, which the pods do not tolerate`),
    ...Object.entries(pod.nodeSelector ?? {})
      .filter(([key, value]) => !replaced.includes(key) && labels[key] !== value)
      .map(([key, value]) => `the nodeSelector ${key}=${value} excludes node ${name}`),
  ];
  const terms = pod.affinity?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms ?? [];
  const fields = { 'metadata.name': name };
  const admitted = terms.some(
    ({ matchExpressions = [], matchFields = [] }) =>
      (matchExpressions.length || matchFields.length) &&
      matchExpressions.every((requirement) => satisfies(requirement, labels)) &&
      matchFields.every((requirement) => satisfies(requirement, fields)),
  );
  if (terms.length && !admitted) reasons.push(`the required node affinity excludes node ${name}`);
  return reasons;
};

export {
  HOSTNAME_LABEL,
  admissionRefusals,
  blockingTaints,
  podSchedulingFactory,
  podSchedulingYaml,
  schedulePodTemplate,
};
