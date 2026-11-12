/**
 * Storage placement: where the data of a workload lives, and whether a set of nodes reaches it. A host path,
 * and a local or host path PersistentVolume, keep data on the nodes they name, never on shared storage.
 * Every command that places pods asks this planner before it moves them; it reads no cluster.
 *
 * @module src/server/runtime/storage-placement.js
 * @namespace StoragePlacement
 */
import { HOSTNAME_LABEL } from './pod-scheduling.js';

/**
 * The record of a PersistentVolume: its claim, its host path, the nodes its data lives on, its reclaim policy.
 * `affinity` is `none`, `hostname` (the nodes are known) or `other` (a topology this planner cannot read).
 * A volume without a host path keeps its data on storage that each node attaches.
 * @param {Object} item - A PersistentVolume as the API returns it.
 * @returns {{name:string, storageClass:string, claim:string, hostPath:string, nodes:string[], affinity:string,
 *   attachable:boolean, reclaim:string, phase:string}}
 * @memberof StoragePlacement
 */
const volumeRecord = (item) => {
  const terms = item.spec?.nodeAffinity?.required?.nodeSelectorTerms ?? [];
  const expressions = terms.flatMap(({ matchExpressions = [] }) => matchExpressions);
  const named = expressions.filter(({ key, operator }) => key === HOSTNAME_LABEL && operator === 'In');
  const hostPath = item.spec?.hostPath?.path ?? item.spec?.local?.path ?? '';
  return {
    name: item.metadata.name,
    storageClass: item.spec?.storageClassName ?? '',
    claim: item.spec?.claimRef ? `${item.spec.claimRef.namespace}/${item.spec.claimRef.name}` : '',
    hostPath,
    nodes: [...new Set(named.flatMap(({ values = [] }) => values))].sort(),
    affinity: !terms.length ? 'none' : named.length === expressions.length && terms.length === 1 ? 'hostname' : 'other',
    attachable: !hostPath,
    reclaim: item.spec?.persistentVolumeReclaimPolicy ?? '',
    phase: item.status?.phase ?? '',
  };
};

/** The volumes of a pod spec that a container writes to. */
const writtenVolumes = (pod) =>
  new Set(
    [...(pod.initContainers ?? []), ...(pod.containers ?? [])].flatMap((container) =>
      (container.volumeMounts ?? []).filter(({ readOnly }) => readOnly !== true).map(({ name }) => name),
    ),
  );

/**
 * The data of a controller that stays on nodes: each host path volume of its pod template, and each claim of
 * its template or of its claim templates bound to a host path or local volume.
 * @param {Object} params
 * @param {Object} params.controller - The controller as the API returns it.
 * @param {Object[]} params.claims - Its namespace's PersistentVolumeClaims as the API returns them.
 * @param {Object[]} params.volumes - {@link volumeRecord} of every PersistentVolume.
 * @param {string[]} params.podNodes - The nodes its pods run on now.
 * @returns {Array<{volume:string, claim:string, persistentVolume:string, hostPath:string, nodes:string[],
 *   source:string, written:boolean}>} `nodes` is empty when no live object names them; `source` is
 *   `host-path`, `local-volume` or `unknown-topology`.
 * @memberof StoragePlacement
 */
const controllerData = ({ controller, claims = [], volumes = [], podNodes = [] }) => {
  const template = controller.spec?.jobTemplate?.spec?.template ?? controller.spec?.template ?? {};
  const pod = template.spec ?? {};
  const written = writtenVolumes(pod);
  const name = controller.metadata.name;
  const namespace = controller.metadata.namespace;
  const observed = [...new Set(podNodes)].sort();
  const bound = (volume, claimName) => {
    const claim = claims.find(({ metadata }) => metadata.name === claimName);
    const record = volumes.find(
      ({ name: id, claim: ref }) => id === claim?.spec?.volumeName || ref === `${namespace}/${claimName}`,
    );
    if (!record || record.attachable) return [];
    return [
      {
        volume,
        claim: `${namespace}/${claimName}`,
        persistentVolume: record.name,
        hostPath: record.hostPath,
        nodes: record.affinity === 'none' ? observed : record.nodes,
        source: record.affinity === 'other' ? 'unknown-topology' : 'local-volume',
        written: written.has(volume),
      },
    ];
  };
  const ordinals = controller.kind === 'StatefulSet' ? Math.max(controller.spec?.replicas ?? 1, 1) : 0;
  return [
    ...(pod.volumes ?? []).flatMap((volume) => {
      if (volume.hostPath)
        return [
          {
            volume: volume.name,
            claim: '',
            persistentVolume: '',
            hostPath: volume.hostPath.path,
            nodes: observed,
            source: 'host-path',
            written: written.has(volume.name),
          },
        ];
      return volume.persistentVolumeClaim ? bound(volume.name, volume.persistentVolumeClaim.claimName) : [];
    }),
    ...(controller.spec?.volumeClaimTemplates ?? []).flatMap(({ metadata }) =>
      Array.from({ length: ordinals }, (_, ordinal) =>
        bound(metadata.name, `${metadata.name}-${name}-${ordinal}`),
      ).flat(),
    ),
  ];
};

/**
 * Why a set of nodes cannot take a controller: a node-bound volume the nodes do not hold, a volume whose
 * topology the planner cannot read, a host path no live pod locates, and a StatefulSet whose ordinals
 * share a written volume of its pod template. Underpost moves no data between nodes.
 * @param {Object} params
 * @param {Object} params.controller - The controller as the API returns it.
 * @param {ReturnType<typeof controllerData>} params.data
 * @param {string[]} params.nodes - The nodes that would run its pods.
 * @returns {string[]} Empty when the nodes reach every volume.
 * @memberof StoragePlacement
 */
const storageRefusals = ({ controller, data, nodes }) => {
  const id = `${controller.kind}/${controller.metadata.namespace}/${controller.metadata.name}`;
  const where = ({ hostPath, persistentVolume, claim }) =>
    `${hostPath ? `${hostPath}` : 'its data'}${persistentVolume ? ` (PersistentVolume ${persistentVolume} of ${claim})` : ''}`;
  const reasons = data.flatMap((entry) => {
    if (entry.source === 'unknown-topology')
      return [`${id} keeps ${where(entry)} on a node topology Underpost cannot read: place it by hand`];
    if (!entry.nodes.length)
      return [`${id} keeps ${where(entry)} on a node no live pod or volume names: start it on that node first`];
    const outside = nodes.filter((node) => !entry.nodes.includes(node));
    return outside.length
      ? [
          `${id} keeps ${where(entry)} on ${entry.nodes.join(', ')}, and ${outside.join(', ')} does not hold it: ` +
            'Underpost moves no data between nodes',
        ]
      : [];
  });
  const shared = (controller.spec?.template?.spec?.volumes ?? []).filter(
    (volume) => (volume.hostPath || volume.persistentVolumeClaim) && data.some((entry) => entry.volume === volume.name),
  );
  if (controller.kind === 'StatefulSet' && (controller.spec?.replicas ?? 1) > 1)
    for (const volume of shared.filter(({ name }) => data.find((entry) => entry.volume === name)?.written))
      reasons.push(`the ordinals of ${id} share the written volume ${volume.name}: give each one a claim template`);
  return reasons;
};

export { controllerData, storageRefusals, volumeRecord };
