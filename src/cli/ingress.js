/**
 * Ingress: the routing of the deployments and of the platform. It owns which deployment declares each host, the
 * routing provider of each environment (`environments.<env>.routing.provider`: `gateway-api` or `contour`), the
 * manifests of every routing object (GatewayClass, Gateway, HTTPRoute, HTTPProxy, ReferenceGrant and the Envoy
 * Gateway policies), the paths platform components publish, and the live routing objects against where the
 * deployments run. A routing object is a
 * deployment's when its labels say so: `app.kubernetes.io/managed-by: underpost` and the `deploy-id` of the
 * deployment. An unlabeled object is a deployment's only when it copies the routing of the deployment's
 * labeled Gateway: it names that Gateway, and that Gateway serves each of its hostnames.
 * @module src/cli/ingress.js
 * @namespace UnderpostIngress
 */

import crypto from 'node:crypto';
import { loggerFactory } from '../server/ops/logger.js';
import { readDeployRoutes } from '../server/network/router.js';
import { statusPageAssetPathFactory, UNDERPOST_GATEWAY } from '../server/network/underpost-gateway.js';
import { shellExec } from '../server/runtime/process.js';
import { deployHostsFactory } from '../server/runtime/conf.js';
import {
  baseOf,
  findingLines,
  kubectlFactory,
  objectId,
  ownerOf,
  print,
  refusal,
  routingRecordsOf,
} from './namespace.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';
const GATEWAY_API_GROUP_VERSION = `${GATEWAY_API_GROUP}/v1`;
// QUIC/HTTP3 listener config and direct-response status pages are the two route
// behaviours core Gateway API leaves to the implementation. Both are expressed
// through the Envoy Gateway extension group, so retargeting another Gateway API
// implementation is a change to these two constants and nothing else.
const GATEWAY_EXTENSION_GROUP = 'gateway.envoyproxy.io';
const GATEWAY_EXTENSION_GROUP_VERSION = `${GATEWAY_EXTENSION_GROUP}/v1alpha1`;
const GATEWAY_CONTROLLER_NAME = `${GATEWAY_EXTENSION_GROUP}/gatewayclass-controller`;
// The class `cluster --gateway-api` provisions and the class every generated
// Gateway references: one name, resolved through gatewayApiConfigFactory, so an
// override reaches the installer and the manifests together.
const GATEWAY_CLASS_DEFAULT = 'eg';

const GATEWAY_DURATION_UNITS = [
  ['h', 3600000],
  ['m', 60000],
  ['s', 1000],
  ['ms', 1],
];

/**
 * Converts an HTTPProxy duration (`10000ms`, `10s`, `infinity`) into a Gateway
 * API Duration. The Gateway API grammar allows at most 5 digits per component,
 * so a value that overflows in one unit is re-expressed in a coarser one
 * (`10000ms` → `5m`); `infinity` maps to `0s`, which disables the timeout.
 * @param {string|number} value - Source duration.
 * @returns {string|null} Gateway API Duration, or null when unset/unparsable.
 */
const gatewayDurationFactory = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const raw = `${value}`.trim();
  if (raw === 'infinity' || raw === '0') return '0s';
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(raw);
  if (!match) return null;
  const factor = Object.fromEntries(GATEWAY_DURATION_UNITS)[match[2] || 'ms'];
  const ms = Math.round(parseFloat(match[1]) * factor);
  for (const [suffix, unit] of GATEWAY_DURATION_UNITS)
    if (ms % unit === 0 && ms / unit <= 99999) return `${ms / unit}${suffix}`;
  return `${Math.ceil(ms / 1000)}s`;
};

/** The metadata labels of a routing object: Underpost manages it, and `deploy-id` names the deployment that owns it. */
const routingLabelsYaml = (owner) =>
  `  labels:\n    app.kubernetes.io/managed-by: underpost${owner ? `\n    deploy-id: ${owner}` : ''}`;

/** The kubectl resource of each kind a reconcile changes. */
const RESOURCES = Object.freeze({
  ClientTrafficPolicy: 'clienttrafficpolicies.gateway.envoyproxy.io',
  BackendTrafficPolicy: 'backendtrafficpolicies.gateway.envoyproxy.io',
  Gateway: 'gateways.gateway.networking.k8s.io',
  HTTPRoute: 'httproutes.gateway.networking.k8s.io',
  HTTPProxy: 'httpproxies.projectcontour.io',
});

/** The operations of `underpost ingress`. */
const INGRESS_OPERATIONS = Object.freeze(['status', 'audit', 'reconcile']);

/** The finding codes of the routing a deployment leaves in a namespace where it no longer runs. */
const STALE_CODES = Object.freeze(['gateway-stale', 'routing-stale', 'routing-orphaned', 'routing-unowned']);

/** The deployment that owns a routing object, from its labels; '' when Underpost does not manage it. */
export const ownerLabel = ({ labels = {} }) =>
  labels['app.kubernetes.io/managed-by'] === 'underpost' ? (labels['deploy-id'] ?? '') : '';

/** Splits a comma-separated option into its entries. */
export const listOf = (value) =>
  `${value ?? ''}`
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Whether a deployment runs a workload in a namespace: a controller whose `deploy-id` label belongs to it. */
const runsFactory =
  ({ controllers, deploymentOf }) =>
  (deployment, namespace) =>
    controllers.some(
      ({ namespace: own, labels = {} }) => own === namespace && deploymentOf(labels['deploy-id'] ?? '') === deployment,
    );

/**
 * The routing a deployment leaves in a namespace where none of its workloads runs, while its labeled Gateway
 * serves it where it runs, grouped by the Gateway it names there: that Gateway when it still exists, the routes
 * and policies it owns that attach only to such Gateways, the routes that keep a live parent, and the leftovers
 * Underpost cannot prove it owns. A Gateway it cannot prove it owns keeps its group.
 */
const staleRouting = ({ gateways, routes, policies, controllers, deploymentOf }) => {
  const runs = runsFactory({ controllers, deploymentOf });
  const hostnamesOf = ({ listeners }) => listeners.map(({ hostname }) => hostname).filter(Boolean);
  const targetsOf = ({ namespace, targets }) =>
    targets.filter((target) => target.startsWith('Gateway/')).map((target) => `${namespace}/${target.slice(8)}`);
  const named = new Set([
    ...gateways.map(({ namespace, name }) => `${namespace}/${name}`),
    ...routes.flatMap(({ parents }) => parents),
    ...policies.flatMap(targetsOf),
  ]);
  const groups = [...named].flatMap((key) => {
    const [namespace, name] = key.split('/');
    const deployment = deploymentOf(name);
    const servedBy =
      deployment && !runs(deployment, namespace)
        ? gateways.find(
            (other) => other.namespace !== namespace && ownerLabel(other) === name && runs(deployment, other.namespace),
          )
        : undefined;
    if (!servedBy) return [];
    const served = hostnamesOf(servedBy);
    const copies = (hostnames) => hostnames.length > 0 && hostnames.every((hostname) => served.includes(hostname));
    const own = (object, copy) => ownerLabel(object) === name || (!ownerLabel(object) && copy);
    const gateway = gateways.find((entry) => entry.namespace === namespace && entry.name === name);
    return [
      {
        key,
        namespace,
        name,
        deployment,
        servedBy,
        gateway,
        own,
        copies,
        owned: !gateway || own(gateway, copies(hostnamesOf(gateway))),
      },
    ];
  });
  const retired = groups.filter(({ owned }) => owned).map(({ key }) => key);
  const onlyRetired = (keys) => keys.length > 0 && keys.every((key) => retired.includes(key));
  return {
    stale: groups
      .filter(({ owned }) => owned)
      .map(({ key, namespace, name, deployment, servedBy, gateway, own, copies }) => {
        const attached = routes.filter((route) => route.namespace === namespace && route.parents.includes(key));
        const targeting = policies.filter(
          (policy) => policy.namespace === namespace && targetsOf(policy).includes(key),
        );
        const policyOwned = (policy) =>
          onlyRetired(targetsOf(policy)) &&
          policy.targets.length === targetsOf(policy).length &&
          own(policy, policy.name === name || policy.name.startsWith(`${name}-`));
        return {
          namespace,
          name,
          deployment,
          servedBy,
          gateway,
          routes: attached.filter((route) => onlyRetired(route.parents) && own(route, copies(route.hostnames))),
          detached: gateway ? attached.filter((route) => !onlyRetired(route.parents)) : [],
          orphaned: gateway
            ? [
                ...attached.filter((route) => onlyRetired(route.parents) && !own(route, copies(route.hostnames))),
                ...targeting.filter((policy) => !policyOwned(policy)),
              ]
            : [],
          policies: targeting.filter(policyOwned),
        };
      }),
    unowned: groups.filter(({ owned }) => !owned),
  };
};

/**
 * The findings of the live status of the routing objects: each Gateway and listener the controller does not
 * accept or program, each route it does not accept, each backend that names no Service, each HTTPProxy Contour
 * marks invalid, each policy section no listener has, and each labeled Gateway of another class.
 */
const statusFindings = ({ gateways, routes, proxies, policies, services, retired, deploymentOf, gatewayClass }) => {
  const clash = (gateway, listener) =>
    gateways
      .filter(
        (other) =>
          other !== gateway &&
          other.className === gateway.className &&
          other.listeners.some(
            (own) =>
              own.hostname === listener.hostname && own.port === listener.port && own.protocol === listener.protocol,
          ),
      )
      .map(objectId);
  const condition = (object, type) => object.conditions[type]?.status === 'False' && object.conditions[type];
  const service = new Set(services.map(({ namespace, name }) => `${namespace}/${name}`));
  return [
    ...gateways
      .filter((gateway) => !retired.includes(objectId(gateway)))
      .flatMap((gateway) =>
        [
          ...(gatewayClass && ownerLabel(gateway) && gateway.className !== gatewayClass
            ? [
                {
                  severity: 'warning',
                  code: 'gateway-class-mismatch',
                  message: `${objectId(gateway)} has the class ${gateway.className}, not ${gatewayClass}: node bin deploy ${deploymentOf(gateway.name) || '<deploy-id>'}`,
                },
              ]
            : []),
          ...(condition(gateway, 'Accepted')
            ? [
                {
                  severity: 'error',
                  code: 'gateway-not-accepted',
                  message:
                    `${objectId(gateway)} is not accepted: ${gateway.conditions.Accepted.reason} ${gateway.conditions.Accepted.message}`.trim(),
                },
              ]
            : []),
          ...(gateway.conditions.Programmed?.status === 'False'
            ? [
                {
                  severity: 'error',
                  code: 'gateway-not-programmed',
                  message:
                    `${objectId(gateway)} is not programmed: ${gateway.conditions.Programmed.reason} ${gateway.conditions.Programmed.message}`.trim(),
                },
              ]
            : []),
          ...gateway.listeners.flatMap((listener) => [
            ...(condition(listener, 'Accepted')
              ? [
                  {
                    severity: 'error',
                    code: 'listener-not-accepted',
                    message: `${objectId(gateway)} listener ${listener.name} is not accepted: ${listener.conditions.Accepted.reason}`,
                  },
                ]
              : []),
            ...(listener.conditions.Conflicted?.status === 'True'
              ? [
                  {
                    severity: 'error',
                    code: 'listener-conflicted',
                    message:
                      `${objectId(gateway)} listener ${listener.name} conflicts (${listener.conditions.Conflicted.reason})` +
                      `${clash(gateway, listener).length ? ` with ${clash(gateway, listener).join(', ')}` : ''}`,
                  },
                ]
              : []),
            ...(listener.conditions.ResolvedRefs?.status === 'False'
              ? [
                  {
                    severity: 'error',
                    code: 'listener-unresolved',
                    message: `${objectId(gateway)} listener ${listener.name} does not resolve its references: ${listener.conditions.ResolvedRefs.reason}`,
                  },
                ]
              : []),
          ]),
        ].map((entry) => ({ ...entry, deployId: deploymentOf(gateway.name) })),
      ),
    ...routes
      .filter((route) => route.unresolved)
      .map((route) => ({
        severity: 'warning',
        code: 'route-unresolved',
        message: `${objectId(route)} is not accepted, or does not resolve its references, by ${route.parents.join(', ')}`,
        deployId: deploymentOf(route.parents[0]?.split('/')[1] ?? ''),
      })),
    ...routes.flatMap((route) =>
      [...new Set((route.backends ?? []).map((backend) => backend.split(':')[0]))]
        .filter((backend) => !service.has(backend))
        .map((backend) => ({
          severity: 'error',
          code: 'route-backend-missing',
          message: `${objectId(route)} sends requests to the Service ${backend}, which does not exist: they answer 500`,
          deployId: deploymentOf(route.parents[0]?.split('/')[1] ?? ''),
        })),
    ),
    ...proxies
      .filter(({ status }) => status && status !== 'valid')
      .map((proxy) => ({
        severity: 'error',
        code: 'proxy-invalid',
        message: `${objectId(proxy)} is ${proxy.status}${proxy.description ? `: ${proxy.description}` : ''}`,
      })),
    ...policies.flatMap((policy) =>
      (policy.sections ?? [])
        .map((section) => section.split('/'))
        .filter(([kind, name, section]) => {
          const gateway =
            kind === 'Gateway' && gateways.find((entry) => entry.namespace === policy.namespace && entry.name === name);
          return gateway && !gateway.listeners.some((listener) => listener.name === section);
        })
        .map(([, name, section]) => ({
          severity: 'error',
          code: 'policy-section-missing',
          message: `${objectId(policy)} targets the listener ${section} of Gateway/${policy.namespace}/${name}, which has none`,
          deployId: deploymentOf(name),
        })),
    ),
  ];
};

/**
 * The routing of an observation against where its deployments run: the stale routing objects of each
 * deployment, the leftovers Underpost cannot prove it owns, the live status, the steps of a reconcile and the
 * findings of an audit. Each finding and step names the deployment it belongs to, when one does.
 * @param {Object} observation - {@link UnderpostNamespace.observe}.
 * @param {string[]} deployments - The deployments of the route table: a stale object needs a known owner.
 * @param {{gatewayClass?:string}} [expected] - The GatewayClass of the labeled Gateways.
 * @returns {{stale:Object[], retired:string[], steps:Object[], findings:Object[]}} `retired` holds the ids of
 *   the Gateways a reconcile removes.
 * @memberof UnderpostIngress
 */
export const routingPlan = ({ environment, controllers, routing, services = [] }, deployments = [], expected = {}) => {
  const gateways = routing.gateways ?? [];
  const routes = routing.routes ?? [];
  const policies = routing.policies ?? [];
  const proxies = routing.proxies ?? [];
  const deploymentOf = (name) => ownerOf(baseOf(name, environment), deployments);
  const { stale, unowned } = staleRouting({ gateways, routes, policies, controllers, deploymentOf });
  const retired = stale.filter(({ gateway }) => gateway).map(({ gateway }) => objectId(gateway));
  const steps = [
    ...stale.flatMap(({ deployment, detached }) =>
      detached.map((route) => ({
        action: 'detach',
        object: objectId(route),
        parents: route.parents.filter((parent) => retired.some((id) => id === `Gateway/${parent}`)),
        refs: route.parents,
        deployId: deployment,
      })),
    ),
    ...stale.flatMap(({ deployment, gateway, routes: owned, policies: ownedPolicies }) =>
      [...owned, ...ownedPolicies, ...(gateway ? [gateway] : [])].map((object) => ({
        action: 'retire',
        object: objectId(object),
        deployId: deployment,
      })),
    ),
  ];
  const exists = (namespace, name) =>
    gateways.some((gateway) => gateway.namespace === namespace && gateway.name === name);
  const removed = stale.flatMap(({ routes: owned, policies: ownedPolicies, orphaned }) =>
    [...owned, ...ownedPolicies, ...orphaned].map(objectId),
  );
  const dangling = [
    ...routes.filter(({ parents }) => parents.length && parents.every((parent) => !exists(...parent.split('/')))),
    ...policies.filter(
      ({ namespace, targets }) =>
        targets.length &&
        targets.every((target) => target.startsWith('Gateway/') && !exists(namespace, target.slice('Gateway/'.length))),
    ),
  ].filter((object) => !removed.includes(objectId(object)));
  const findings = [
    ...dangling.map((object) => ({
      severity: 'warning',
      code: 'routing-dangling',
      message: `${objectId(object)} attaches to no live Gateway: remove it by hand if nothing else uses it`,
      deployId: deploymentOf((object.parents?.[0] ?? object.targets?.[0] ?? '').split('/').pop()),
    })),
    ...stale.flatMap(({ namespace, name, deployment, gateway, servedBy, routes: owned, policies: ownedPolicies }) =>
      gateway
        ? [
            {
              severity: 'error',
              code: 'gateway-stale',
              message:
                `${objectId(gateway)} belongs to ${name}, which runs no workload in ${namespace} and is served by ` +
                `${objectId(servedBy)}: reconcile removes it with the routes and policies it owns`,
              deployId: deployment,
            },
          ]
        : [...owned, ...ownedPolicies].map((object) => ({
            severity: 'warning',
            code: 'routing-stale',
            message:
              `${objectId(object)} names the Gateway ${namespace}/${name}, which is gone, while ${objectId(servedBy)} ` +
              'serves its deployment: reconcile removes it',
            deployId: deployment,
          })),
    ),
    ...stale.flatMap(({ deployment, orphaned }) =>
      orphaned.map((object) => ({
        severity: 'warning',
        code: 'routing-orphaned',
        message: `${objectId(object)} attaches only to a stale Gateway, and Underpost cannot prove its owner: remove it by hand if nothing else uses it`,
        deployId: deployment,
      })),
    ),
    ...unowned.map(({ gateway, servedBy, deployment }) => ({
      severity: 'warning',
      code: 'routing-unowned',
      message:
        `${objectId(gateway)} has no Underpost ownership label, and ${objectId(servedBy)} serves the deployment of its ` +
        'name without each of its hosts: if nothing else uses it, remove it by hand: ' +
        `kubectl delete gateway ${gateway.name} -n ${gateway.namespace}`,
      deployId: deployment,
    })),
    ...statusFindings({
      gateways,
      routes,
      proxies,
      policies,
      services,
      retired,
      deploymentOf,
      gatewayClass: expected.gatewayClass,
    }),
  ];
  return { stale, retired, steps, findings };
};

/** Each host the inventory gives more than one owner, with its owners. */
const duplicateHosts = (inventory) =>
  [...Map.groupBy(inventory, ({ host }) => host)]
    .map(([host, entries]) => ({ host, owners: [...new Set(entries.map(({ deployId }) => deployId))] }))
    .filter(({ owners }) => owners.length > 1);

const duplicateText = ({ host, owners }) =>
  `${host} is declared by ${owners.join(' and ')}: one deployment owns a host`;

/**
 * The hosts the route kind of a provider serves: an HTTPRoute accepted by a programmed Gateway, or a valid
 * HTTPProxy. An object that exists does not serve until its controller accepts it.
 * @param {{gateways?:Object[], routes?:Object[], proxies?:Object[]}} routing - Routing records of an observation.
 * @param {'gateway-api'|'contour'} provider
 * @returns {Set<string>}
 * @memberof UnderpostIngress
 */
export const servedHostsOf = (routing, provider) => {
  const programmed = new Set(
    (routing.gateways ?? [])
      .filter(({ conditions }) => conditions.Programmed?.status === 'True')
      .map(({ namespace, name }) => `${namespace}/${name}`),
  );
  return new Set(
    provider === 'gateway-api'
      ? (routing.routes ?? [])
          .filter(({ accepted, parents }) => accepted && parents.some((parent) => programmed.has(parent)))
          .flatMap(({ hostnames }) => hostnames)
      : (routing.proxies ?? []).filter(({ status }) => status === 'valid').map(({ fqdn }) => fqdn),
  );
};

/**
 * The provider transition of each host: the route kind of the provider of the environment (an HTTPRoute, or
 * an HTTPProxy) replaces the route of the other provider in stages. The old route keeps serving until the
 * new one serves: an HTTPRoute accepted by a programmed Gateway, or a valid HTTPProxy. Then the old one is
 * retired, unless it also serves a host that has not moved. The host inventory names the owner of a host;
 * the live objects only show where its transition stands.
 * @param {Object} observation - {@link UnderpostNamespace.observe}.
 * @param {Array<{host:string, deployId:string}>} hosts - The hosts of the selection.
 * @param {'gateway-api'|'contour'} provider - The routing provider of the environment.
 * @returns {{steps:Object[], findings:Object[]}}
 * @memberof UnderpostIngress
 */
export const providerTransition = ({ environment, routing }, hosts, provider) => {
  const routesOf = (host) => (routing.routes ?? []).filter(({ hostnames }) => hostnames.includes(host));
  const proxiesOf = (host) => (routing.proxies ?? []).filter(({ fqdn }) => fqdn === host);
  const served = servedHostsOf(routing, provider);
  const moved = new Set(hosts.map(({ host }) => host).filter((host) => served.has(host)));
  const steps = [];
  const findings = [];
  for (const { host, deployId } of hosts) {
    const [active, inactive] =
      provider === 'gateway-api' ? [routesOf(host), proxiesOf(host)] : [proxiesOf(host), routesOf(host)];
    if (!inactive.length) continue;
    const old = inactive.map(objectId).join(', ');
    if (!moved.has(host)) {
      findings.push({
        severity: 'warning',
        code: 'provider-transition',
        message:
          `${host} is served by ${old}, and environments.${environment}.routing.provider is ${provider}: ` +
          (active.length
            ? `${active.map(objectId).join(', ')} does not serve it yet, so ${old} stays`
            : `node bin deploy ${deployId} ${environment} publishes its route, and ${old} stays until it serves`),
        deployId,
      });
      continue;
    }
    const retired = inactive.filter((object) => (object.hostnames ?? [object.fqdn]).every((name) => moved.has(name)));
    findings.push({
      severity: 'error',
      code: 'provider-conflict',
      message:
        `${host} is served by ${active.map(objectId).join(', ')} of ${provider} and by ${old}: ` +
        (retired.length
          ? `reconcile removes ${retired.map(objectId).join(', ')}`
          : `${old} also serves a host that has not moved, so it stays`),
      deployId,
    });
    steps.push(...retired.map((object) => ({ action: 'retire', object: objectId(object), deployId })));
  }
  return {
    steps: [...new Map(steps.map((step) => [step.object, step])).values()],
    findings,
  };
};

/**
 * Applies the steps of {@link routingPlan}: detaches the routes that keep a live parent, then removes the
 * stale routing objects.
 * @param {Function} kubectl - {@link kubectlFactory}.
 * @param {Object[]} steps
 * @param {boolean} apply - Without it, the API server validates each change only.
 * @returns {Promise<Object[]>} The steps it ran.
 * @memberof UnderpostIngress
 */
export const applyRoutingSteps = async (kubectl, steps, apply) => {
  const dryRun = apply ? [] : ['--dry-run=server'];
  for (const step of steps.filter(({ action }) => action === 'detach')) {
    const [, namespace, name] = step.object.split('/');
    // Highest index first, each guarded by a test of the parent it removes.
    const patch = step.refs
      .map((ref, index) => ({ ref, index }))
      .filter(({ ref }) => step.parents.includes(ref))
      .reverse()
      .flatMap(({ ref, index }) => [
        { op: 'test', path: `/spec/parentRefs/${index}/name`, value: ref.split('/')[1] },
        { op: 'remove', path: `/spec/parentRefs/${index}` },
      ]);
    await kubectl([
      'patch',
      RESOURCES.HTTPRoute,
      name,
      '-n',
      namespace,
      '--type=json',
      '-p',
      JSON.stringify(patch),
      ...dryRun,
    ]);
    logger.info(`${apply ? 'Detached' : 'Dry run: detach'} ${step.object} from ${step.parents.join(', ')}`);
  }
  for (const step of steps.filter(({ action }) => action === 'retire')) {
    const [kind, namespace, name] = step.object.split('/');
    await kubectl([
      'delete',
      RESOURCES[kind],
      name,
      '-n',
      namespace,
      '--wait=true',
      '--timeout=5m',
      '--ignore-not-found',
      ...dryRun,
    ]);
    logger.info(`${apply ? 'Removed' : 'Dry run: remove'} ${step.object}`);
  }
  return steps;
};

/**
 * The routing of each host of a deployment in an observation: its listeners or HTTPProxy, its routes, and its
 * state. An object that exists is not one that serves: `programmed` needs a listener, an accepted route and a
 * programmed Gateway; `valid` an HTTPProxy Contour accepts. Whether the host answers from the internet is the
 * external probe of `underpost monitor`.
 */
const hostRouting = ({ host, consumer, observation }) => {
  if (consumer.kind === 'HTTPProxy') {
    const proxy = (observation.routing.proxies ?? []).find(
      (entry) => entry.namespace === consumer.namespace && entry.name === consumer.name,
    );
    return {
      host,
      served: consumer.live,
      routes: consumer.live ? [consumer.id] : [],
      state: !consumer.live ? 'unrouted' : proxy?.status && proxy.status !== 'valid' ? 'invalid' : 'valid',
    };
  }
  const gateway = consumer.gateway;
  const listeners = gateway?.listeners.filter(({ hostname }) => hostname === host) ?? [];
  const routes = (observation.routing.routes ?? []).filter(
    (route) =>
      route.namespace === consumer.namespace &&
      route.hostnames.includes(host) &&
      route.parents.includes(`${consumer.namespace}/${consumer.name}`),
  );
  const unresolved = routes.filter(({ unresolved: refused }) => refused).map(objectId);
  return {
    host,
    served: listeners.length > 0,
    listeners: listeners.map(({ protocol, port }) => `${protocol}/${port}`),
    routes: routes.map(objectId),
    unresolved,
    state: !gateway
      ? 'unrouted'
      : !listeners.length
        ? 'no-listener'
        : !routes.length
          ? 'no-route'
          : unresolved.length
            ? 'not-accepted'
            : gateway.conditions.Programmed?.status !== 'True'
              ? 'not-programmed'
              : 'programmed',
  };
};

/** The findings of the hosts of one deployment: a deployment no routing object serves, a host without a listener or a route. */
const deploymentFindings = ({ deployId, environment, provider, consumer, hosts }) => {
  if (!consumer.live)
    return [
      {
        severity: 'warning',
        code: provider === 'gateway-api' ? 'gateway-missing' : 'proxy-missing',
        message:
          `${provider === 'gateway-api' ? `No Gateway ${consumer.name}` : 'No HTTPProxy'} serves ${deployId} in ${environment}: ` +
          `node bin deploy ${deployId} ${environment}`,
        deployId,
      },
    ];
  return hosts.flatMap(({ host, served, routes }) => [
    ...(served
      ? []
      : [
          {
            severity: 'error',
            code: 'listener-missing',
            message:
              `${objectId(consumer)} has no listener for ${host}: ` +
              `node bin deploy ${deployId} ${environment} --disable-update-deployment`,
            deployId,
          },
        ]),
    ...(served && !routes.length
      ? [
          {
            severity: 'warning',
            code: 'route-missing',
            message: `No HTTPRoute of ${objectId(consumer)} serves ${host}: requests to it answer 404`,
            deployId,
          },
        ]
      : []),
  ]);
};

/**
 * The routing findings a reconcile leaves: each leftover Underpost cannot prove it owns, each host whose
 * provider transition waits, and each error. A dry run leaves out the stale Gateways and the old routes its
 * plan removes.
 * @param {Object[]} findings - {@link routingPlan} findings.
 * @param {boolean} apply - Whether the findings were read after an apply.
 * @returns {Object[]}
 * @memberof UnderpostIngress
 */
export const unchangedOf = (findings, apply) =>
  findings.filter(
    ({ severity, code }) =>
      ['routing-unowned', 'routing-orphaned', 'routing-dangling', 'provider-transition'].includes(code) ||
      (severity === 'error' && (apply || !['gateway-stale', 'provider-conflict'].includes(code))),
  );

/**
 * Whether a command acts on a deployment: each one with `--deploy-id` or `--host`, else every one.
 * @param {Object} options
 * @param {Array<{deployId:string}>} selected - {@link UnderpostIngress.select}.
 * @returns {(deployId:string) => boolean}
 */
const chosenOf = (options, selected) => {
  if (!listOf(options.deployId).length && !listOf(options.host).length) return () => true;
  const deployIds = new Set(selected.map(({ deployId }) => deployId));
  return (deployId) => deployIds.has(deployId);
};

/**
 * One step of {@link routingPlan} as text.
 * @param {Object} step
 * @param {boolean} applied
 * @returns {string}
 * @memberof UnderpostIngress
 */
export const stepText = ({ action, object, parents }, applied) =>
  action === 'detach'
    ? `${applied ? 'detached' : 'would detach'} ${object} from ${parents.join(', ')}`
    : `${applied ? 'removed' : 'would remove'} ${object}`;

/**
 * Refuses a change a command was not asked for precisely: it needs `--env`, and a selection or `--all`.
 * @param {{options:Object, selected:boolean, command:string}} params
 * @throws {Error}
 * @memberof UnderpostIngress
 */
export const assertChange = ({ options, selected, command }) => {
  if (!options.env) throw refusal(`${command} --apply needs --env: name the environment it changes`);
  if (!selected && !options.all)
    throw refusal(`${command} --apply needs --deploy-id or --host, or --all for every deployment of the route table`);
};

/**
 * @class UnderpostIngress
 * @description The routing inventory and ownership authority: hosts, their owners, their routing objects.
 * @memberof UnderpostIngress
 */
class UnderpostIngress {
  static API = {
    /**
     * Every host the deployments declare, with its deployment: the hosts of `conf.server.json`, its `www` and
     * redirect hosts included, and the hosts of `conf.instances.json`.
     * @param {{deployIds?:string[]}} [params] - The route table by default.
     * @returns {Array<{host:string, deployId:string}>}
     * @memberof UnderpostIngress
     */
    hosts({ deployIds = readDeployRoutes() } = {}) {
      return deployIds.flatMap((deployId) => deployHostsFactory(deployId).map((host) => ({ host, deployId })));
    },

    /**
     * The one deployment of the route table that declares a host, among `deployIds` when it names some.
     * @param {string} host
     * @param {{deployIds?:string[], inventory?:Object[]}} [params] - `inventory` is {@link UnderpostIngress.hosts}.
     * @returns {string}
     * @throws {Error} When no deployment, or more than one, declares the host.
     * @memberof UnderpostIngress
     */
    owner(host, { deployIds = [], inventory = UnderpostIngress.API.hosts() } = {}) {
      const declared = inventory.filter((entry) => entry.host === host).map(({ deployId }) => deployId);
      const owners = deployIds.length ? declared.filter((deployId) => deployIds.includes(deployId)) : declared;
      if (owners.length === 1) return owners[0];
      if (owners.length > 1)
        throw refusal(`${host} is declared by ${owners.join(' and ')}: name its deployment with --deploy-id`);
      throw refusal(
        declared.length
          ? `${host} is declared by ${declared.join(', ')}, not by ${deployIds.join(', ')}`
          : `${host} is declared by no deployment of the route table`,
      );
    },

    /**
     * Refuses each host of the deployments that another deployment of the route table also declares: one
     * deployment owns a host. A deploy calls it before it changes anything.
     * @param {string[]} deployIds
     * @throws {Error} On a host with more than one owner.
     * @memberof UnderpostIngress
     */
    assertOwnership(deployIds) {
      const duplicates = duplicateHosts(
        UnderpostIngress.API.hosts({ deployIds: [...new Set([...readDeployRoutes(), ...deployIds])] }),
      ).filter(({ owners }) => owners.some((owner) => deployIds.includes(owner)));
      if (duplicates.length) throw refusal(duplicates.map(duplicateText).join('; '));
    },

    /**
     * The hosts a command acts on: each host of `--host`, with its one owner; else each host of the deployments
     * of `--deploy-id`; else, with `all` or when the command only reads, each host of the route table.
     * @param {{deployIds?:string[], hosts?:string[], all?:boolean}} selection
     * @returns {Array<{host:string, deployId:string}>}
     * @throws {Error} On a deployment outside the route table, a host it does not declare, or `all` with a selector.
     * @memberof UnderpostIngress
     */
    select({ deployIds = [], hosts = [], all = false } = {}) {
      const routes = readDeployRoutes();
      if (all && (deployIds.length || hosts.length))
        throw refusal('--all selects every deployment: give no other selector');
      const unknown = deployIds.filter((deployId) => !routes.includes(deployId));
      if (unknown.length)
        throw refusal(`${unknown.join(', ')} is not in engine-private/deploy/dd.routes: ${routes.join(', ')}`);
      if (hosts.length) {
        const inventory = UnderpostIngress.API.hosts({ deployIds: routes });
        return hosts.map((host) => ({ host, deployId: UnderpostIngress.API.owner(host, { deployIds, inventory }) }));
      }
      return UnderpostIngress.API.hosts({ deployIds: deployIds.length ? deployIds : routes });
    },

    /**
     * The routing provider of an environment: `environments.<env>.routing.provider` of conf.cluster.json.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {'gateway-api'|'contour'}
     * @throws {Error} When the environment names no routing provider.
     * @memberof UnderpostIngress
     */
    provider(params = {}) {
      const { environment, routing } = Underpost.namespace.cluster(params);
      if (!routing)
        throw refusal(
          `conf.cluster.json names no routing provider for ${environment}: set environments.${environment}.routing ` +
            'to {"provider": "gateway-api"} or {"provider": "contour"}',
        );
      return routing.provider;
    },

    /**
     * Removes the Gateway API objects an earlier model of this deploy left behind, so
     * they stop competing with the consolidated `<deployId>-<env>` Gateway.
     *
     * The per-host model emitted one Gateway and one `<host>-http3` ClientTrafficPolicy
     * per hostname. Left in place they duplicate that hostname's listeners in the same
     * merged set, and the oldest resource retains traffic. `undefined` / `undefined-http3`
     * is the same problem under a different name: the consolidated objects were briefly
     * emitted with an unresolved host in their metadata, and merged listeners are
     * configured by the oldest policy that targets them.
     *
     * The namespace is listed once and only objects that exist are deleted: a sweep that
     * issued a blind delete per host per kind spent two dozen `kubectl` round-trips per
     * sync on names that were gone after the first migration, and buried the one line
     * that mattered when something was actually removed.
     * @param {object} params
     * @param {string[]} params.hosts - Hostnames the deploy's `conf.server.json` declares.
     * @param {string} params.namespace - Namespace the deploy's Gateway objects live in.
     * @returns {{gateways: string[], policies: string[]}} Names removed, per kind.
     * @memberof UnderpostIngress
     */
    sweepLegacyGatewayObjects({ hosts = [], namespace = 'default' }) {
      const existing = (kind) =>
        new Set(
          `${
            shellExec(`kubectl get ${kind} -n ${namespace} -o name --ignore-not-found`, {
              stdout: true,
              silent: true,
              silentOnError: true,
              disableLog: true,
            }) ?? ''
          }`
            .split('\n')
            .map((line) => line.trim().split('/').pop())
            .filter(Boolean),
        );
      const legacy = [...new Set(hosts.filter(Boolean)), 'undefined'];
      const gateways = existing('Gateway');
      const policies = existing('ClientTrafficPolicy');
      const removed = {
        gateways: legacy.filter((name) => gateways.has(name)),
        policies: legacy.map((name) => `${name}-http3`).filter((name) => policies.has(name)),
      };
      for (const name of removed.gateways)
        shellExec(`kubectl delete Gateway ${name} -n ${namespace} --ignore-not-found`);
      for (const name of removed.policies)
        shellExec(`kubectl delete ClientTrafficPolicy ${name} -n ${namespace} --ignore-not-found`);
      if (removed.gateways.length > 0 || removed.policies.length > 0)
        logger.warn('Legacy per-host Gateway API objects removed', { namespace, ...removed });
      return removed;
    },

    /**
     * Removes the route of the inactive provider of each host, once the route of the active provider serves
     * it ({@link servedHostsOf}). A host whose new route does not serve yet keeps its old one: the next
     * deploy or `node bin ingress reconcile` completes its transition.
     * @param {Array<string>} hosts - Hostnames, which name their route objects.
     * @param {boolean} gatewayApi - Whether HTTPRoute is the route kind of the active provider.
     * @param {string} namespace - Kubernetes namespace.
     * @returns {{retired:string[], kept:string[]}}
     * @memberof UnderpostIngress
     */
    removeInactiveHostRoutes({ hosts = [], gatewayApi, namespace = 'default' }) {
      const kind = gatewayApi ? 'HTTPProxy' : 'HTTPRoute';
      const served = UnderpostIngress.API.servedHosts(gatewayApi ? 'gateway-api' : 'contour');
      const unique = [...new Set(hosts.filter(Boolean))];
      const retired = unique.filter((host) => served.has(host));
      const kept = unique.filter((host) => !served.has(host));
      for (const host of retired)
        shellExec(`kubectl delete ${RESOURCES[kind]} ${host} -n ${namespace} --ignore-not-found`, { silent: true });
      if (kept.length)
        logger.warn(`The ${kind} of each host stays until the new route serves it: node bin ingress reconcile`, {
          hosts: kept,
          namespace,
        });
      return { retired, kept };
    },

    /**
     * Creates a base YAML configuration for an HTTPProxy resource.
     * @param {string} host - Hostname for which the HTTPProxy is being created.
     * @param {string} env - Environment for which the HTTPProxy is being created.
     * @param {object} options - Options for the HTTPProxy creation.
     * @param {string} [options.namespace] - The legacy namespace override; conf.cluster.json places each resource without it.
     * @returns {string} - Base YAML configuration for the HTTPProxy resource.
     * @memberof UnderpostIngress
     */
    baseProxyYamlFactory({ host, env, options }) {
      const includeTls = Underpost.tls.terminates({ environment: env, options });
      return `
---
apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${host}
  namespace: ${Underpost.namespace.of('workloads', { environment: env, options })}
spec:
  virtualhost:
    fqdn: ${host}${
      includeTls
        ? `
    tls:
      secretName: ${host}`
        : ''
    }
  routes:`;
    },

    /**
     * Resolves the Gateway API transport settings shared by every generated
     * Gateway and HTTPRoute: the gateway class, whether QUIC/HTTP3 is enabled,
     * the UDP port QUIC is served on, and the `Alt-Svc` value that advertises
     * it. Single source of truth — no other factory reads these options. QUIC
     * rides on the HTTPS listener, so `http3` needs an environment that
     * terminates TLS ({@link UnderpostTls.terminates}).
     * @param {object} [options] - Deploy/run options.
     * @param {string} [options.gatewayClass] - GatewayClass name (env: UNDERPOST_GATEWAY_CLASS, default `contour`).
     * @param {boolean} [options.disableHttp3] - Disables QUIC/HTTP3 listener config and `Alt-Svc` advertisement.
     * @param {number|string} [options.quicPort] - UDP port QUIC is served on (env: UNDERPOST_QUIC_PORT, default 443).
     * @param {number|string} [options.altSvcMaxAge] - `Alt-Svc` max-age in seconds (default 86400).
     * @param {string} [environment] - The environment of the routes; without it, `http3` is false.
     * @returns {{ gatewayClassName: string, http3: boolean, quicPort: number, altSvc: string }} Resolved config.
     * @memberof UnderpostIngress
     */
    gatewayApiConfigFactory(options = {}, environment = '') {
      const quicPort = parseInt(options.quicPort || process.env.UNDERPOST_QUIC_PORT || 443, 10);
      return {
        gatewayClassName: options.gatewayClass || process.env.UNDERPOST_GATEWAY_CLASS || GATEWAY_CLASS_DEFAULT,
        http3:
          options.disableHttp3 !== true && Boolean(environment) && Underpost.tls.terminates({ environment, options }),
        quicPort,
        altSvc: `h3=":${quicPort}"; ma=${parseInt(options.altSvcMaxAge || 86400, 10)}`,
      };
    },

    /**
     * Creates the cluster-scoped Gateway API provisioning objects: the
     * GatewayClass every generated Gateway attaches to, and the EnvoyProxy that
     * decides how the data plane is reachable from outside the cluster.
     *
     * Exposure differs by environment because the access path does:
     *   - development — the node *is* the operator's machine, so Envoy binds the
     *     listener ports on the host network. With the `/etc/hosts` entries the
     *     `cluster` runner writes, `https://<host>` resolves to 127.0.0.1 and
     *     reaches the gateway directly, and QUIC gets UDP/443 for free.
     *   - production — NodePort, mirroring the ports the Contour envoy service
     *     already publishes (`manifests/envoy-service-nodeport.yaml`).
     *
     * `sharedIngress` overrides the development binding: with Contour also
     * installed the node's 80/443 belong to the shared edge, and a data plane on
     * the host network would be competing for the port it is meant to sit behind.
     * The listener ports are unchanged — only where they are published moves.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (gateway class override, shared edge).
     * @returns {string} GatewayClass + EnvoyProxy YAML.
     * @memberof UnderpostIngress
     */
    gatewayClassYamlFactory({ env, options = {} }) {
      const { gatewayClassName } = Underpost.ingress.gatewayApiConfigFactory(options);
      const namespace = 'envoy-gateway-system';
      const hostBound = env === 'development' && options.sharedIngress !== true;
      // `hostNetwork` is not a field of EnvoyProxy's KubernetesPodSpec — the
      // deployment `patch` (StrategicMerge) is the supported way to set plain
      // PodSpec fields. `dnsPolicy` must move with it: on the host network the
      // pod would otherwise inherit the node's resolv.conf and lose the cluster
      // DNS it needs to reach the xDS control plane.
      //
      // `useListenerPortAsContainerPort: true` stops Envoy Gateway remapping
      // privileged ports into the ephemeral range, which is what puts 80/443 on
      // the host — and by its own contract requires CAP_NET_BIND_SERVICE. The
      // development profile also runs Envoy as root: ambient capabilities are
      // not expressible in a Kubernetes securityContext, so a non-root process
      // cannot reliably hold that capability. Production keeps the hardened
      // upstream defaults and is reached through NodePort instead.
      const developmentProvider = `
      useListenerPortAsContainerPort: true
      envoyDeployment:
        patch:
          type: StrategicMerge
          value:
            spec:
              template:
                spec:
                  hostNetwork: true
                  dnsPolicy: ClusterFirstWithHostNet
        container:
          securityContext:
            runAsNonRoot: false
            runAsUser: 0
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              add:
                - NET_BIND_SERVICE
      envoyService:
        type: ClusterIP`;
      const productionProvider = `
      useListenerPortAsContainerPort: false
      envoyService:
        type: NodePort`;
      // Behind the shared edge the data plane is reached by ClusterIP, so it
      // needs neither the host network nor a node port — it is an ordinary
      // upstream, and publishing it anywhere else would only re-create the
      // contention the edge exists to remove.
      const sharedProvider = `
      useListenerPortAsContainerPort: false
      envoyService:
        type: ClusterIP`;
      return `
---
apiVersion: ${GATEWAY_EXTENSION_GROUP_VERSION}
kind: EnvoyProxy
metadata:
  name: ${gatewayClassName}-proxy-config
  namespace: ${namespace}
spec:
  # A deploy's hosts share one Gateway, but a cluster can hold more than one
  # deploy — and each Gateway would otherwise be provisioned its own data plane,
  # every one contending for the same node ports, so at most one could bind and
  # the rest would crash-loop. Merging collapses them onto a single Envoy fleet.
  # Every generated listener is hostname-scoped because the merge key is
  # (port, protocol, hostname). This lets many deploy-scoped Gateways coexist
  # in this fleet without an older hostname-less listener shadowing the rest.
  mergeGateways: true
  provider:
    type: Kubernetes
    kubernetes:${options.sharedIngress === true ? sharedProvider : hostBound ? developmentProvider : productionProvider}
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: GatewayClass
metadata:
  name: ${gatewayClassName}
spec:
  controllerName: ${GATEWAY_CONTROLLER_NAME}
  parametersRef:
    group: ${GATEWAY_EXTENSION_GROUP}
    kind: EnvoyProxy
    name: ${gatewayClassName}-proxy-config
    namespace: ${namespace}
`;
    },

    /**
     * Creates the one Gateway a deploy's HTTPRoutes attach to.
     *
     * Envoy Gateway's `mergeGateways` mode merges every Gateway of the class
     * into one data plane. Its required uniqueness key is (port, protocol,
     * hostname), so every host needs its own listener pair. Hostname-less
     * listeners from separate deploy Gateways conflict: the older listener is
     * served and newer hosts receive its certificate and 404 route table.
     *
     * The HTTPS listener is emitted when the environment terminates TLS
     * ({@link UnderpostTls.terminates}); QUIC is only wired when that listener
     * exists, since HTTP/3 has no cleartext transport.
     * @param {string} name - Gateway name, from {@link UnderpostDeploy.gatewayNameFactory}.
     * @param {Array<string>} hosts - Every hostname the deploy terminates; each becomes a certificate ref.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (namespace, gateway/QUIC settings).
     * @returns {string} Gateway YAML.
     * @memberof UnderpostIngress
     */
    gatewayYamlFactory({ hosts = [], name, env, options = {} }) {
      const namespace = Underpost.namespace.of('workloads', { options });
      const { gatewayClassName } = Underpost.ingress.gatewayApiConfigFactory(options);
      const includeTls = Underpost.tls.terminates({ environment: env, options });
      const uniqueHosts = [...new Set(hosts.filter(Boolean))].sort();
      const allowedRoutes = `      allowedRoutes:
        namespaces:
          from: Same`;
      const listeners = uniqueHosts
        .flatMap((host) => {
          const http = `    - name: ${Underpost.ingress.gatewayListenerNameFactory({ protocol: 'http', host })}
      hostname: ${JSON.stringify(host)}
      protocol: HTTP
      port: 80
${allowedRoutes}`;
          if (!includeTls) return [http];
          return [
            http,
            `    - name: ${Underpost.ingress.gatewayListenerNameFactory({ protocol: 'https', host })}
      hostname: ${JSON.stringify(host)}
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - group: ""
            kind: Secret
            name: ${host}
${allowedRoutes}`,
          ];
        })
        .join('\n');
      return `
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: Gateway
metadata:
  name: ${name}
  namespace: ${namespace}
${routingLabelsYaml(name)}
spec:
  gatewayClassName: ${gatewayClassName}
  listeners:
${listeners}
`;
    },

    /**
     * Produces a stable DNS-label listener name for a hostname and protocol.
     * The content hash prevents two hosts that normalize to the same label from
     * colliding, while truncation keeps the Gateway API SectionName at 63 chars.
     * @param {object} input - Listener identity.
     * @param {string} input.protocol - `http` or `https`.
     * @param {string} input.host - Listener hostname.
     * @returns {string} Stable Kubernetes DNS label.
     * @memberof UnderpostIngress
     */
    gatewayListenerNameFactory({ protocol, host }) {
      const prefix = `${protocol || 'http'}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const normalized =
        `${host || 'host'}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'host';
      const hash = crypto
        .createHash('sha1')
        .update(`${host || ''}`)
        .digest('hex')
        .slice(0, 8);
      const hostLength = 63 - prefix.length - hash.length - 2;
      return `${prefix}-${normalized.slice(0, hostLength).replace(/-+$/g, '')}-${hash}`;
    },

    /**
     * Name of the Gateway a deploy's hosts share. The Gateway is consolidated
     * per deploy, while its listener pairs remain hostname-scoped so merged
     * Gateways have distinct traffic selectors.
     * @param {string} deployId - Deploy id.
     * @param {string} env - `development` | `production`.
     * @returns {string} Gateway name.
     * @memberof UnderpostIngress
     */
    gatewayNameFactory({ deployId, env }) {
      return `${deployId}-${env}`;
    },

    /**
     * Creates the QUIC/HTTP3 ClientTrafficPolicy for the merged data plane.
     *
     * Emitted once per Gateway with one targetRef for each hostname-scoped HTTPS
     * listener. A single policy object avoids same-scope policy competition,
     * while section-specific targets enable QUIC on every distinct listener.
     * @param {string} name - Gateway the policy attaches to, from {@link UnderpostDeploy.gatewayNameFactory}.
     * @param {string} [sectionName] - Backward-compatible single listener target.
     * @param {Array<string>} [sectionNames] - HTTPS listeners the policy targets.
     * @param {string} env - `development` | `production`.
     * @param {object} [options] - Deploy/run options (namespace, QUIC settings).
     * @returns {string} ClientTrafficPolicy YAML, or an empty string when HTTP/3 has no TLS transport.
     * @memberof UnderpostIngress
     */
    clientTrafficPolicyYamlFactory({ name, sectionName, sectionNames = [], env, options = {} }) {
      const namespace = Underpost.namespace.of('workloads', { options });
      if (!Underpost.ingress.gatewayApiConfigFactory(options, env).http3) return '';
      const targets = [...new Set([...sectionNames, sectionName].filter(Boolean))];
      if (targets.length === 0) return '';
      // Scoped to the HTTPS section, not the whole Gateway. QUIC only concerns
      // the TLS listener, and an unscoped policy is applied to every listener of
      // the merged set — including the plain-HTTP ones, which the implementation
      // rejects outright ("applied to multiple http (non https) listeners on the
      // same port"), leaving HTTP/3 silently off.
      //
      return `
---
apiVersion: ${GATEWAY_EXTENSION_GROUP_VERSION}
kind: ClientTrafficPolicy
metadata:
  name: ${name}-http3
  namespace: ${namespace}
${routingLabelsYaml(name)}
spec:
  targetRefs:
${targets
  .map(
    (target) => `    - group: ${GATEWAY_API_GROUP}
      kind: Gateway
      name: ${name}
      sectionName: ${target}`,
  )
  .join('\n')}
  http3: {}
`;
    },

    /**
     * Renders one HTTPRoute rule. Websockets need no opt-in here (unlike the
     * HTTPProxy `enableWebsockets` flag) — Gateway API forwards the upgrade by
     * default. A rule carrying `extensionRef` short-circuits at the gateway and
     * therefore emits no backendRefs.
     *
     * The HTTPProxy `timeoutPolicy.idle` has no Gateway API rule-level
     * equivalent (idle timeouts are listener/backend scoped) and is dropped.
     * @param {string} path - Match value.
     * @param {string} [matchType] - `PathPrefix` (default) | `Exact`.
     * @param {number} [port] - Backend service port.
     * @param {string} [deployId] - Deployment id used to derive the service name.
     * @param {string} [env] - Environment used to derive the service name.
     * @param {Array<string>} [deploymentVersions] - Traffic colours; the first carries all weight.
     * @param {string} [serviceId] - Explicit backend service name (overrides the derived one).
     * @param {string} [serviceNamespace] - The namespace of `serviceId` when it is not the namespace of
     *   the route; a ReferenceGrant there admits the reference.
     * @param {Array<object>} [pathRewritePolicy] - HTTPProxy-shaped prefix rewrite, mapped to ReplacePrefixMatch.
     * @param {string} [replaceFullPath] - Rewrites the request to a fixed path (a single static document).
     * @param {string} [replacePrefixMatch] - Rewrites the matched prefix onto a static directory, so the
     *   document and everything beside it resolve through one rule.
     * @param {object} [extensionRef] - `{ group, kind, name }` of a direct-response filter.
     * @param {object} [timeoutPolicy] - `{ response }` mapped to Gateway API timeouts.
     * @param {object} [retryPolicy] - `{ count, perTryTimeout }` mapped to retry.attempts / timeouts.backendRequest.
     * @param {string} [altSvc] - `Alt-Svc` value advertising the QUIC endpoint.
     * @returns {string} Rule YAML (indented for `spec.rules`).
     * @memberof UnderpostIngress
     */
    httpRouteRuleFactory({
      path,
      matchType = 'PathPrefix',
      port,
      deployId,
      env,
      deploymentVersions = ['blue'],
      serviceId,
      serviceNamespace,
      pathRewritePolicy,
      replaceFullPath,
      replacePrefixMatch,
      extensionRef,
      timeoutPolicy,
      retryPolicy,
      altSvc,
    }) {
      const lines = [
        `    - matches:`,
        `        - path:`,
        `            type: ${matchType}`,
        `            value: ${path}`,
      ];
      const filters = [];
      const prefixRewrite =
        replacePrefixMatch ?? (pathRewritePolicy?.length ? pathRewritePolicy[0].replacement : undefined);
      if (replaceFullPath || prefixRewrite) {
        filters.push(`        - type: URLRewrite`, `          urlRewrite:`, `            path:`);
        if (replaceFullPath)
          filters.push(`              type: ReplaceFullPath`, `              replaceFullPath: ${replaceFullPath}`);
        else
          filters.push(`              type: ReplacePrefixMatch`, `              replacePrefixMatch: ${prefixRewrite}`);
      }
      if (extensionRef)
        filters.push(
          `        - type: ExtensionRef`,
          `          extensionRef:`,
          `            group: ${extensionRef.group}`,
          `            kind: ${extensionRef.kind}`,
          `            name: ${extensionRef.name}`,
        );
      if (altSvc)
        filters.push(
          `        - type: ResponseHeaderModifier`,
          `          responseHeaderModifier:`,
          `            set:`,
          `              - name: Alt-Svc`,
          `                value: '${altSvc}'`,
        );
      if (filters.length > 0) lines.push(`      filters:`, ...filters);

      const timeouts = [];
      const request = gatewayDurationFactory(timeoutPolicy?.response);
      const backendRequest = gatewayDurationFactory(retryPolicy?.perTryTimeout ?? timeoutPolicy?.response);
      if (request) timeouts.push(`        request: ${request}`);
      if (backendRequest) timeouts.push(`        backendRequest: ${backendRequest}`);
      if (timeouts.length > 0) lines.push(`      timeouts:`, ...timeouts);

      const attempts = parseInt(retryPolicy?.count, 10);
      if (!isNaN(attempts)) lines.push(`      retry:`, `        attempts: ${attempts}`);

      // A backend is declared even for a rule the direct-response filter
      // short-circuits: the filter answers before the backend is ever dialled,
      // but a rule that resolves to nothing at all risks the whole route being
      // rejected — which takes every other path on that hostname down with it,
      // and shows up only as a bare 404 from the gateway.
      if (port !== undefined && (serviceId || deployId)) {
        lines.push(`      backendRefs:`);
        for (const [i, version] of (serviceId ? [null] : deploymentVersions).entries())
          lines.push(
            `        - name: ${serviceId ? serviceId : `${deployId}-${env}-${version}-service`}`,
            ...(serviceId && serviceNamespace ? [`          namespace: ${serviceNamespace}`] : []),
            `          port: ${port}`,
            `          weight: ${i === 0 ? 100 : 0}`,
          );
      }
      return `${lines.join('\n')}\n`;
    },

    /**
     * Wraps rendered rules in an HTTPRoute attached to the host Gateway. The
     * object is named after the host, exactly like the HTTPProxy it mirrors, so
     * an apply of a per-instance fragment replaces the host route set the same
     * way — the complete multi-instance set is assembled by `instance-promote`.
     * @param {string} host - Hostname (Gateway name and route hostname).
     * @param {object} options - Deploy/run options (namespace).
     * @param {string} rules - Rendered rules from {@link UnderpostDeploy.httpRouteRuleFactory}.
     * @param {string} [name] - Route name override.
     * @param {string} [parentName] - Gateway the route attaches to; defaults to the host's own Gateway.
     * @param {string} [owner] - The `deploy-id` of the deployment that owns the route.
     * @returns {string} HTTPRoute YAML, or an empty string when there are no rules.
     * @memberof UnderpostIngress
     */
    httpRouteYamlFactory({ host, options = {}, rules, name, parentName, owner }) {
      if (!rules || !rules.trim()) return '';
      const namespace = Underpost.namespace.of('workloads', { options });
      return `
---
apiVersion: ${GATEWAY_API_GROUP_VERSION}
kind: HTTPRoute
metadata:
  name: ${name || host}
  namespace: ${namespace}
${routingLabelsYaml(owner)}
spec:
  parentRefs:
    - group: ${GATEWAY_API_GROUP}
      kind: Gateway
      name: ${parentName || host}
      namespace: ${namespace}
  hostnames:
    - ${host}
  rules:
${rules}`;
    },

    /**
     * The backend of a route the shared gateway serves: its Service, and its namespace when the platform
     * runs apart from the routes.
     * @param {object} [options] - Deploy/run options, with `env`.
     * @returns {{serviceId: string, port: number, serviceNamespace?: string}}
     * @memberof UnderpostIngress
     */
    gatewayBackendFactory(options = {}) {
      const platform = Underpost.namespace.of('platform', { options });
      return {
        serviceId: UNDERPOST_GATEWAY.serviceName,
        port: UNDERPOST_GATEWAY.port,
        ...(platform === Underpost.namespace.of('workloads', { options }) ? {} : { serviceNamespace: platform }),
      };
    },

    /**
     * The ReferenceGrant that lets the HTTPRoutes of one namespace reach Services of another. The
     * Gateway admits routes of its own namespace only, so a backend apart from them needs it.
     * @param {object} params
     * @param {string} params.namespace - The namespace of the Services.
     * @param {string} params.fromNamespace - The namespace of the routes.
     * @param {string[]} params.services - The Services the routes reach.
     * @returns {string} The YAML document; empty when both namespaces are one.
     * @memberof UnderpostIngress
     */
    referenceGrantYamlFactory({ namespace, fromNamespace, services }) {
      if (namespace === fromNamespace) return '';
      return `
---
apiVersion: ${GATEWAY_API_GROUP}/v1beta1
kind: ReferenceGrant
metadata:
  name: routes-from-${fromNamespace}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/managed-by: underpost
spec:
  from:
    - group: ${GATEWAY_API_GROUP}
      kind: HTTPRoute
      namespace: ${fromNamespace}
  to:
${services.map((name) => `    - group: ''\n      kind: Service\n      name: ${name}`).join('\n')}
`;
    },

    /**
     * Grants the HTTPRoutes of a namespace the shared gateway in the platform namespace. The publisher of
     * a route that crosses namespaces owns its grant; one namespace for both needs none.
     * @param {object} params
     * @param {string} params.namespace - The namespace of the routes.
     * @param {string} params.env - `development` | `production`.
     * @param {object} [params.options] - Deploy options.
     * @memberof UnderpostIngress
     */
    applyGatewayGrant({ namespace, env, options = {} }) {
      const grant = Underpost.ingress.referenceGrantYamlFactory({
        namespace: Underpost.namespace.of('platform', { environment: env, options }),
        fromNamespace: namespace,
        services: [UNDERPOST_GATEWAY.serviceName],
      });
      if (grant) shellExec(`kubectl apply -f - <<'EOF'\n${grant}\nEOF\n`);
    },

    /**
     * Renders the HTTPRoute rules that serve an instance's status pages at the
     * gateway. Each declared page gets a canonical route under the instance's
     * own sub-path (`/404`, `/FOREST/404`), so a status document is reachable
     * and cacheable per instance without ever reaching the workload.
     *
     * With `catchAll`, the same filter is additionally bound to `/`. That rule
     * is only ever requested by the host assembly when no instance claims the
     * root path — two rules with identical matches would otherwise make gateway
     * precedence ambiguous.
     * @param {string} deployId - Instance-scoped deploy id.
     * @param {string} basePath - The instance's URL sub-path.
     * @param {Array<object>} statusPages - `customStatusPages` entries.
     * @param {string} [altSvc] - `Alt-Svc` value advertising the QUIC endpoint.
     * @param {boolean} [catchAll] - Also bind the first page (404 when present) to `/`.
     * @param {string} [host] - Hostname the documents were placed under; falls back to `deployId`.
     * @param {Array<string>} [servedStatuses] - Statuses whose document reached the static tree. Undefined means "all declared".
     * @param {object} [options] - Deploy/run options, with `env`: where the routes and the gateway run.
     * @returns {string} Rule YAML.
     * @memberof UnderpostIngress
     */
    statusPageRouteRulesFactory({
      deployId,
      basePath = '/',
      statusPages = [],
      altSvc,
      catchAll = false,
      host,
      servedStatuses,
      options = {},
    }) {
      // Only statuses whose document was actually placed in the static tree get
      // a rule; a rewrite to a missing file would answer with the shared default
      // page instead of the host's own.
      const pages = statusPages.filter(
        (page) =>
          page?.status && page?.hostPath && (servedStatuses === undefined || servedStatuses.includes(`${page.status}`)),
      );
      if (pages.length === 0) return '';
      const prefix = !basePath || basePath === '/' ? '' : basePath.replace(/\/$/, '');
      // Served by the static utility rather than carried in the gateway config:
      // a rendered page is far past the direct-response ceiling, and exceeding
      // it fails the whole route.
      const location = (status) => statusPageAssetPathFactory({ host: host || deployId, path: basePath, status });
      const staticRule = (path, rewrite) =>
        Underpost.ingress.httpRouteRuleFactory({
          path,
          ...rewrite,
          ...Underpost.ingress.gatewayBackendFactory(options),
          altSvc,
        });
      let rules = '';
      // Canonical routes rewrite onto the directory so assets beside the
      // document resolve too; the catch-all cannot, because a prefix rewrite of
      // `/` would carry the rest of the request path into the target.
      for (const page of pages)
        rules += staticRule(`${prefix}/${page.status}`, { replacePrefixMatch: location(page.status).dir });
      if (catchAll) {
        const fallback = pages.find((page) => `${page.status}` === '404') || pages[0];
        rules += staticRule('/', { replaceFullPath: location(fallback.status).url });
      }
      return rules;
    },

    /**
     * Publishes a path of a host to a Service of a platform component: an HTTPRoute on the Gateway of the
     * deployment that declares the host, with the ownership labels of that deployment, and the ReferenceGrant a
     * Service of another namespace needs. The Gateway already terminates the TLS of the host.
     * @param {{name:string, host:string, path:string, service:string, serviceNamespace:string, port:number,
     *   environment:string, options?:Object}} params - `name` is the route.
     * @returns {{route:string, deployId:string, gateway:string}}
     * @throws {Error} When no deployment, or more than one, declares the host, or the environment routes through Contour.
     * @memberof UnderpostIngress
     */
    publishPath({ name, host, path, service, serviceNamespace, port, environment, options = {} }) {
      const deployId = UnderpostIngress.API.owner(host);
      const gateway = UnderpostIngress.API.consumer({ host, deployId, environment, options });
      if (gateway.kind !== 'Gateway')
        throw refusal(`${environment} routes through Contour: a published path needs the Gateway API provider`);
      const route = UnderpostIngress.API.httpRouteYamlFactory({
        host,
        name,
        parentName: gateway.name,
        owner: gateway.name,
        options: { ...options, env: environment },
        rules: UnderpostIngress.API.httpRouteRuleFactory({
          path,
          matchType: 'PathPrefix',
          serviceId: service,
          ...(serviceNamespace === gateway.namespace ? {} : { serviceNamespace }),
          port,
        }),
      });
      const grant = UnderpostIngress.API.referenceGrantYamlFactory({
        namespace: serviceNamespace,
        fromNamespace: gateway.namespace,
        services: [service],
      });
      shellExec(`kubectl apply -f - <<'EOF'\n${route}${grant}\nEOF\n`);
      return { route: `HTTPRoute/${gateway.namespace}/${name}`, deployId, gateway: gateway.id };
    },

    /**
     * Removes a route {@link UnderpostIngress.publishPath} published.
     * @param {{name:string, environment:string, options?:Object}} params
     * @memberof UnderpostIngress
     */
    retractPath({ name, environment, options = {} }) {
      const namespace = Underpost.namespace.of('workloads', { environment, options });
      shellExec(`kubectl delete httproute ${name} -n ${namespace} --ignore-not-found`);
    },

    /**
     * The hosts the route kind of a provider serves in the cluster of the target ({@link servedHostsOf}).
     * @param {'gateway-api'|'contour'} provider
     * @returns {Set<string>}
     * @memberof UnderpostIngress
     */
    servedHosts(provider) {
      const list = (crd) =>
        routingRecordsOf(
          crd,
          JSON.parse(
            shellExec(`kubectl get ${crd} --all-namespaces -o json`, {
              stdout: true,
              silent: true,
              silentOnError: true,
              disableLog: true,
            }) || '{}',
          ).items ?? [],
        );
      return servedHostsOf(
        provider === 'gateway-api'
          ? { gateways: list(RESOURCES.Gateway), routes: list(RESOURCES.HTTPRoute) }
          : { proxies: list(RESOURCES.HTTPProxy) },
        provider,
      );
    },

    plan: routingPlan,
    applySteps: applyRoutingSteps,
    unchanged: unchangedOf,
    stepText,

    /**
     * The routing object that serves a host and terminates its TLS: the Gateway of its deployment, or its
     * HTTPProxy. It is the live object when one serves the host: the one where the deployment runs, else the
     * one in the namespace of its placement; else the one a deploy creates there. `secret` is the TLS Secret it
     * names, `namespace/name`.
     * @param {{host:string, deployId:string, environment:string, options?:Object, observation?:Object,
     *   path?:string}} params - `path` is conf.cluster.json.
     * @returns {{kind:string, namespace:string, name:string, id:string, live:boolean, secret:string, gateway?:Object}}
     * @memberof UnderpostIngress
     */
    consumer({ host, deployId, environment, options = {}, observation, path }) {
      const placed = Underpost.namespace.of('workloads', { environment, options, deployId, path });
      const routes = readDeployRoutes();
      const runs = runsFactory({
        controllers: observation?.controllers ?? [],
        deploymentOf: (label) => ownerOf(baseOf(label, environment), routes),
      });
      const prefer = (live) =>
        live.find(({ namespace }) => runs(deployId, namespace)) ??
        live.find(({ namespace }) => namespace === placed) ??
        live[0];
      if (UnderpostIngress.API.provider({ environment, options, path }) === 'contour') {
        const proxy = prefer((observation?.routing.proxies ?? []).filter(({ fqdn }) => fqdn === host));
        const namespace = proxy?.namespace ?? placed;
        const name = proxy?.name ?? host;
        return {
          kind: 'HTTPProxy',
          namespace,
          name,
          id: objectId({ kind: 'HTTPProxy', namespace, name }),
          live: Boolean(proxy),
          secret: proxy?.tls
            ? proxy.tls.includes('/')
              ? proxy.tls
              : `${namespace}/${proxy.tls}`
            : `${namespace}/${host}`,
        };
      }
      const name = Underpost.ingress.gatewayNameFactory({ deployId, env: environment });
      const gateway = prefer(
        (observation?.routing.gateways ?? []).filter(
          (entry) => entry.name === name && entry.listeners.some(({ hostname }) => hostname === host),
        ),
      );
      const namespace = gateway?.namespace ?? placed;
      const reference = gateway?.listeners.find(({ hostname, protocol }) => hostname === host && protocol === 'HTTPS')
        ?.certificates[0];
      return {
        kind: 'Gateway',
        namespace,
        name,
        id: objectId({ kind: 'Gateway', namespace, name }),
        live: Boolean(gateway),
        secret: reference ?? `${namespace}/${host}`,
        ...(gateway ? { gateway } : {}),
      };
    },

    /**
     * The routing of the selected deployments: the routing object of each, the listeners and routes of each
     * host, and the routing provider. Reads only.
     * @param {{options?:Object}} [params] - `options.deployId` and `options.host` select; `--env` names the environment.
     * @returns {Promise<Object>}
     * @memberof UnderpostIngress
     */
    async status(params = {}) {
      const { options = {} } = params;
      const observation = await Underpost.namespace.observe(params);
      const { environment } = observation;
      const provider = UnderpostIngress.API.provider({ environment, options });
      const selected = UnderpostIngress.API.select({
        deployIds: listOf(options.deployId),
        hosts: listOf(options.host),
      });
      const chosen = chosenOf(options, selected);
      const deployments = [...Map.groupBy(selected, ({ deployId }) => deployId)].map(([deployId, entries]) => {
        const consumers = entries.map(({ host }) =>
          UnderpostIngress.API.consumer({ host, deployId, environment, options, observation }),
        );
        const consumer = consumers.find(({ live }) => live) ?? consumers[0];
        return {
          deployId,
          consumer: { id: consumer.id, live: consumer.live },
          hosts: entries.map(({ host }, index) => hostRouting({ host, consumer: consumers[index], observation })),
        };
      });
      const plan = routingPlan(observation, readDeployRoutes(), {
        gatewayClass: UnderpostIngress.API.gatewayApiConfigFactory(options).gatewayClassName,
      });
      return {
        environment,
        context: observation.context,
        provider,
        deployments,
        findings: [
          ...duplicateHosts(UnderpostIngress.API.hosts())
            .filter(({ owners }) => owners.some(chosen))
            .map((duplicate) => ({
              severity: 'error',
              code: 'host-duplicate',
              message: duplicateText(duplicate),
              deployId: duplicate.owners[0],
            })),
          ...plan.findings.filter(({ deployId }) => chosen(deployId)),
          ...providerTransition(observation, selected, provider).findings,
          ...deployments.flatMap(({ deployId, consumer, hosts }) =>
            deploymentFindings({ deployId, environment, provider, consumer, hosts }),
          ),
        ],
      };
    },

    /**
     * The routing a deployment leaves in a namespace where it no longer runs, as findings. A Gateway left there
     * conflicts with the listeners of its live Gateway, and the hosts answer 404. Reads only.
     * @param {{deployId:string, environment:string, options?:Object}} params
     * @returns {Promise<Object[]>}
     * @memberof UnderpostIngress
     */
    async stale({ deployId, environment, options = {} }) {
      const observation = await Underpost.namespace.observe({ environment, options });
      return routingPlan(observation, readDeployRoutes()).findings.filter(
        (finding) => finding.deployId === deployId && STALE_CODES.includes(finding.code),
      );
    },

    /**
     * Compares the live routing objects with the deployments: the status of {@link UnderpostIngress.status}
     * as findings. Reads only.
     * @param {{options?:Object}} [params]
     * @returns {Promise<{environment:string, context:string, findings:Object[]}>}
     * @memberof UnderpostIngress
     */
    async audit(params = {}) {
      const { environment, context, findings } = await UnderpostIngress.API.status(params);
      return { environment, context, findings };
    },

    /**
     * Removes the stale routing of the selected deployments: each owned Gateway that stays where its
     * deployment no longer runs, with the routes and policies it owns, and detaches each route that keeps a live
     * parent. It never removes a shared object, an object it cannot prove it owns, or a workload. A dry run
     * sends each change as a server dry run; a change needs a selection and `--env`.
     * @param {{apply?:boolean, options?:Object}} [params]
     * @returns {Promise<{context:string, plan:Object[], applied:boolean, unchanged:string[]}>}
     * @memberof UnderpostIngress
     */
    async reconcile({ apply = false, ...params } = {}) {
      const { options = {} } = params;
      const selectors = listOf(options.deployId).length + listOf(options.host).length > 0;
      if (apply) assertChange({ options, selected: selectors, command: 'ingress reconcile' });
      const selected = UnderpostIngress.API.select({
        deployIds: listOf(options.deployId),
        hosts: listOf(options.host),
      });
      const chosen = chosenOf(options, selected);
      const observation = await Underpost.namespace.observe(params);
      const { context, environment } = observation;
      const provider = UnderpostIngress.API.provider({ environment, options });
      const planOf = (observed) => {
        const plan = routingPlan(observed, readDeployRoutes());
        const transition = providerTransition(observed, selected, provider);
        return {
          steps: [...plan.steps.filter(({ deployId }) => chosen(deployId)), ...transition.steps],
          findings: [...plan.findings.filter(({ deployId }) => chosen(deployId)), ...transition.findings],
        };
      };
      const plan = planOf(observation);
      if (apply) logger.info(`Reconcile the routing of ${environment} in the context ${context || '(current)'}`);
      await applyRoutingSteps(kubectlFactory(context), plan.steps, apply);
      const after = apply ? planOf(await Underpost.namespace.observe({ ...params, context })) : plan;
      return {
        context,
        plan: plan.steps,
        applied: apply,
        unchanged: unchangedOf(after.findings, apply).map(({ message }) => message),
      };
    },

    /**
     * The `underpost ingress` command.
     * @param {string} operation - `status`, `audit` or `reconcile`.
     * @param {Object} [options]
     * @memberof UnderpostIngress
     */
    async callback(operation, options = {}) {
      try {
        const params = { options };
        if (options.apply && options.dryRun) throw refusal('Use --dry-run or --apply, not both');
        const run = {
          status: async () => print(await UnderpostIngress.API.status(params), options, statusText),
          audit: async () => {
            const report = await UnderpostIngress.API.audit(params);
            print(report, options, findingsText);
            process.exitCode = report.findings.some(({ severity }) => severity === 'error') ? 3 : 0;
          },
          reconcile: async () =>
            print(
              await UnderpostIngress.API.reconcile({ ...params, apply: options.apply === true }),
              options,
              reconcileText,
            ),
        }[operation];
        if (!run) throw refusal(`Unknown operation ${operation}: ${INGRESS_OPERATIONS.join(', ')}`);
        await run();
      } catch (error) {
        logger.error(error.message);
        if (error.stderr?.trim()) logger.error(error.stderr.trim());
        process.exitCode = error.expected ? 3 : 1;
      }
    },
  };
}

const statusText = ({ environment, context, provider, deployments, findings }) =>
  [
    `Environment  ${environment}`,
    `Context      ${context || 'current'}`,
    `Routing      ${provider === 'gateway-api' ? 'Gateway API (Envoy Gateway)' : 'Contour HTTPProxy'}`,
    '',
    ...deployments.flatMap(({ deployId, consumer, hosts }) => [
      `${deployId}  ${consumer.id}${consumer.live ? '' : ' (not deployed)'}`,
      ...hosts.map(
        ({ host, state, listeners = [], routes, unresolved = [] }) =>
          `  ${host.padEnd(36)} ${state.padEnd(15)} ${listeners.join(' ') || '-'}  ` +
          `${routes.join(', ') || 'no route'}${unresolved.length ? ` (not accepted: ${unresolved.join(', ')})` : ''}`,
      ),
    ]),
    '',
    'Findings:',
    ...findingLines(findings),
  ].join('\n');

const findingsText = ({ environment, context, findings }) =>
  [`Environment ${environment}, context ${context || 'current'}`, 'Findings:', ...findingLines(findings)].join('\n');

const reconcileText = ({ context, plan: steps, applied, unchanged }) =>
  [
    `Context ${context || '(current)'}`,
    ...(steps.length ? steps.map((step) => stepText(step, applied)) : ['Nothing to reconcile']),
    ...(applied || !steps.length ? [] : ['Run again with --apply to make these changes']),
    ...(unchanged.length ? ['Not reconciled here:', ...unchanged.map((message) => `  ${message}`)] : []),
  ].join('\n');

export default UnderpostIngress;
