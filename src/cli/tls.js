/**
 * TLS: the certificate lifecycle of the hosts the deployments declare. An environment terminates TLS by the
 * policy `environments.<env>.tls` of conf.cluster.json: `cert-manager` issues each certificate from the ACME
 * ClusterIssuer the policy names, `self-signed` issues a certificate this machine trusts, and `none` serves
 * HTTP only. Each host has one TLS Secret in the namespace of the routing object that serves it, named after
 * the host. In the cert-manager mode, one Certificate there renews it.
 * @module src/cli/tls.js
 * @namespace UnderpostTls
 */

import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { load as yamlLoad } from 'js-yaml';
import { loggerFactory } from '../server/ops/logger.js';
import { environmentValueFactory } from '../server/runtime/environment.js';
import { LOCAL_SSL_ROOT, SSL_RENEW_MS, TLS } from '../server/network/tls.js';
import { CERT_MANAGER_RELEASES } from './cluster.js';
import { assertChange, listOf, ownerLabel } from './ingress.js';
import { findingLines, kubectlFactory, objectId, print, readClusterConf, refusal } from './namespace.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @constant TLS_ISSUERS
 * @description The ACME ClusterIssuers Underpost ships, each from `manifests/<name>.yaml`: the Let's Encrypt
 * production and staging directories. The cert-manager policy of an environment names one.
 * @memberof UnderpostTls
 */
export const TLS_ISSUERS = Object.freeze(['letsencrypt-prod', 'letsencrypt-staging']);

/** The TLS policies an environment can name, as JSON. */
export const TLS_POLICIES =
  '{"mode": "cert-manager", "issuer": "letsencrypt-prod"}, {"mode": "self-signed"} or {"mode": "none"}';

/**
 * The base manifest of a ClusterIssuer of {@link TLS_ISSUERS}: its ACME server and its account key Secret.
 * @param {string} name
 * @returns {string}
 * @memberof UnderpostTls
 */
export const issuerManifestPath = (name) => fileURLToPath(new URL(`../../manifests/${name}.yaml`, import.meta.url));

/** Whether a `vX.Y.Z` release is older than another; an unreadable release is not. */
const olderRelease = (release, than) => {
  const parse = (value) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(`${value}`)?.slice(1).map(Number);
  const [a, b] = [parse(release), parse(than)];
  if (!a || !b) return false;
  const index = a.findIndex((part, position) => part !== b[position]);
  return index >= 0 && a[index] < b[index];
};

/**
 * The findings of a cert-manager release against {@link CERT_MANAGER_RELEASES}: older than the minimum is an
 * error; a minor line upstream no longer supports, and a release without Underpost evidence, are warnings each.
 */
const releaseFindings = (version, found) => {
  const { installed, minimum, supported, tested } = CERT_MANAGER_RELEASES;
  if (olderRelease(version, minimum)) {
    found(
      'error',
      'cert-manager-unsupported',
      `cert-manager runs ${version}, older than ${minimum}, the first release that enables its Gateway API solver`,
    );
    return;
  }
  const minor = /^v?(\d+\.\d+)\./.exec(version)?.[1];
  if (!supported.includes(minor))
    found(
      'warning',
      'cert-manager-end-of-life',
      `cert-manager runs ${version}; upstream supports ${supported.join(' and ')} only ` +
        `(https://cert-manager.io/docs/releases)${version === installed ? ', and node bin cluster --cert-manager installs this release' : ''}`,
    );
  if (!tested.includes(version))
    found(
      'warning',
      'cert-manager-untested',
      `cert-manager runs ${version}, and Underpost has evidence for ${tested.join(', ')} only: run the ACME staging ` +
        'steps of verify-on-a-disposable-cluster.md on it',
    );
};

/** The ACME solver of a routing provider: a Gateway API HTTPRoute, or a Contour Ingress. */
const solverOf = (provider) => (provider === 'gateway-api' ? 'gateway' : 'ingress');

/** The kubectl resource of each kind TLS changes. */
const RESOURCES = Object.freeze({
  Certificate: 'certificates.cert-manager.io',
  Challenge: 'challenges.acme.cert-manager.io',
});

/** A pending ACME Challenge older than this is stuck. */
const CHALLENGE_STUCK_MS = 10 * 60 * 1000;

/** How long a reconcile waits for the Certificates it creates. */
const READY_TIMEOUT = '3m';

/** The operations of `underpost tls`. */
const TLS_OPERATIONS = Object.freeze(['status', 'audit', 'reconcile', 'renew', 'issuer']);

/** The labels of a TLS object a deployment owns. */
const labelsOf = (owner) => ({ 'app.kubernetes.io/managed-by': 'underpost', 'deploy-id': owner });

/**
 * The names and the expiry of a certificate.
 * @param {Buffer|string} pem
 * @returns {{names:string[], notAfter:string, certificate:crypto.X509Certificate}}
 * @memberof UnderpostTls
 */
export const certificateFacts = (pem) => {
  const certificate = new crypto.X509Certificate(pem);
  return {
    certificate,
    names: `${certificate.subjectAltName ?? ''}`
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith('DNS:'))
      .map((entry) => entry.slice(4)),
    notAfter: new Date(certificate.validTo).toISOString(),
  };
};

/** Whether a certificate name covers a hostname: equal, or a wildcard of its first label. */
const covers = (names, hostname) =>
  names.some(
    (name) => name === hostname || (name.startsWith('*.') && hostname.slice(hostname.indexOf('.')) === name.slice(1)),
  );

/** Refuses a TLS Secret a copy would carry: it must hold a certificate and its key, unexpired, naming each host. */
const assertTlsSecret = ({ type, data = {} }, hostnames, label) => {
  if (type !== 'kubernetes.io/tls' || !data['tls.crt'] || !data['tls.key'])
    throw new Error(`${label} is not a kubernetes.io/tls Secret with tls.crt and tls.key`);
  const { certificate, names, notAfter } = certificateFacts(Buffer.from(data['tls.crt'], 'base64'));
  if (!certificate.checkPrivateKey(crypto.createPrivateKey(Buffer.from(data['tls.key'], 'base64'))))
    throw new Error(`${label}: its key does not match its certificate`);
  if (new Date(notAfter) <= new Date()) throw new Error(`${label}: its certificate expired on ${notAfter}`);
  const missing = hostnames.filter((hostname) => !covers(names, hostname));
  if (missing.length) throw new Error(`${label}: its certificate does not name ${missing.join(', ')}`);
};

/**
 * The Certificate that renews the TLS Secret of a host from a ClusterIssuer.
 * @param {{host:string, namespace:string, name?:string, owner:string, issuer:string}} params - `name` is the
 *   Secret; the host by default.
 * @returns {Object}
 * @memberof UnderpostTls
 */
export const certificateManifest = ({ host, namespace, name = host, owner, issuer }) => ({
  apiVersion: 'cert-manager.io/v1',
  kind: 'Certificate',
  metadata: { name, namespace, labels: labelsOf(owner) },
  spec: {
    commonName: host,
    dnsNames: [host],
    issuerRef: { name: issuer, kind: 'ClusterIssuer' },
    secretName: name,
  },
});

/**
 * A Let's Encrypt ClusterIssuer of {@link TLS_ISSUERS}. The base manifest fixes the ACME server and the account
 * key; `GITHUB_EMAIL` is the account email. The `gateway` solver answers each HTTP-01 challenge through an
 * HTTPRoute on the Gateways of `parentRefs`; without one, the issuer registers the account and solves nothing.
 * The `ingress` solver answers through the Contour Ingress class.
 * @param {{name:string, solver:'gateway'|'ingress', parentRefs?:Array<{namespace:string, name:string}>,
 *   basePath?:string}} params
 * @returns {Object}
 * @memberof UnderpostTls
 */
export const issuerManifest = ({ name, solver, parentRefs = [], basePath = issuerManifestPath(name) }) => {
  const issuer = yamlLoad(fs.readFileSync(basePath, 'utf8'));
  const email = environmentValueFactory('GITHUB_EMAIL');
  if (email) issuer.spec.acme = { email, ...issuer.spec.acme };
  issuer.spec.acme.solvers =
    solver === 'ingress'
      ? [{ http01: { ingress: { class: 'contour' } } }]
      : parentRefs.length
        ? [
            {
              http01: {
                gatewayHTTPRoute: {
                  parentRefs: parentRefs.map(({ name, namespace }) => ({ name, namespace, kind: 'Gateway' })),
                },
              },
            },
          ]
        : [];
  return issuer;
};

/** A parent reference as text: `namespace/name`, or `name` when it names no namespace. */
const refText = ({ namespace, name }) => (namespace ? `${namespace}/${name}` : name);

/**
 * The Gateways the issuer can attach a challenge route to: each live Gateway Underpost labels, of the
 * Gateway class, that the controller programs, with an HTTP listener on port 80 it accepts and that admits a
 * route of its own namespace. The issuer is cluster-scoped, so the inventory covers every environment the
 * cluster serves.
 * @param {Object} observation - {@link UnderpostNamespace.observe}.
 * @param {string} gatewayClass
 * @returns {{eligible:Array<{namespace:string, name:string}>, excluded:Array<{ref:string, reason:string}>}}
 * @memberof UnderpostTls
 */
export const issuerInventory = (observation, gatewayClass) => {
  const eligible = [];
  const excluded = [];
  for (const gateway of (observation.routing.gateways ?? []).filter((entry) => ownerLabel(entry))) {
    const ref = `${gateway.namespace}/${gateway.name}`;
    const http = gateway.listeners.filter(({ protocol, port }) => protocol === 'HTTP' && port === 80);
    const accepted = http.filter(({ conditions }) => conditions.Accepted?.status !== 'False');
    if (gateway.className !== gatewayClass)
      excluded.push({ ref, reason: `its class is ${gateway.className}, not ${gatewayClass}` });
    else if (gateway.conditions.Programmed?.status === 'False')
      excluded.push({ ref, reason: `it is not programmed: ${gateway.conditions.Programmed.reason}` });
    else if (!http.length) excluded.push({ ref, reason: 'it has no HTTP listener on port 80' });
    else if (!accepted.length) excluded.push({ ref, reason: 'the controller accepts none of its HTTP listeners' });
    else if (!accepted.some(({ allowedRoutes }) => ['Same', 'All'].includes(allowedRoutes)))
      excluded.push({ ref, reason: 'no HTTP listener admits a route of its own namespace' });
    else eligible.push({ namespace: gateway.namespace, name: gateway.name });
  }
  return { eligible, excluded };
};

/**
 * The ClusterIssuer against the cluster: its state, its solver and the Gateways it lists, and the Gateways it
 * should list: the {@link issuerInventory}, and each Gateway it lists that still exists. It never drops a live
 * Gateway, so a targeted change never removes the reference of another deployment.
 * @param {{observation:Object, name:string, solver:'gateway'|'ingress', gatewayClass:string}} params - `name`
 *   is the ClusterIssuer.
 * @returns {Object}
 * @memberof UnderpostTls
 */
export const issuerState = ({ observation, name, solver, gatewayClass }) => {
  const installed = Array.isArray(observation.routing.issuers);
  const issuer = (observation.routing.issuers ?? []).find((entry) => entry.name === name);
  const { eligible, excluded } = issuerInventory(observation, gatewayClass);
  const live = new Set((observation.routing.gateways ?? []).map(({ namespace, name }) => `${namespace}/${name}`));
  const current = issuer?.parentRefs ?? [];
  const byText = new Map(
    [...eligible, ...current.filter((ref) => !ref.namespace || live.has(refText(ref)))].map((ref) => [
      refText(ref),
      ref,
    ]),
  );
  const refs = [...byText.keys()].sort().map((key) => byText.get(key));
  const listed = current.map(refText);
  const solvers = issuer?.solvers ?? [];
  return {
    name,
    installed,
    present: Boolean(issuer),
    ready: issuer?.conditions.Ready?.status === 'True',
    reason: issuer?.conditions.Ready
      ? `${issuer.conditions.Ready.reason} ${issuer.conditions.Ready.message}`.trim()
      : '',
    solver,
    solvers,
    matches: solver === 'gateway' ? solvers.every((kind) => kind === 'gateway') : solvers.includes('ingress'),
    parentRefs: listed,
    desired: refs.map(refText),
    added: refs.map(refText).filter((ref) => !listed.includes(ref)),
    removed: listed.filter((ref) => !byText.has(ref)),
    excluded,
    refs,
  };
};

/**
 * The TLS of each target against an observation: the state of its Secret and its Certificate, the ACME
 * challenge of its host, the issuer, the steps of a reconcile and the findings of an audit.
 *
 * A Secret is valid when it holds an unexpired certificate that names the host; in the self-signed mode it
 * must also stay valid beyond the renewal window. A reconcile copies a valid Secret from another namespace and
 * keeps one in place. It creates a Certificate where a challenge can be answered, or where a valid Secret makes
 * one unnecessary: never for a host no routing object serves without a valid Secret. It corrects the spec of a
 * Certificate its deployment owns, and removes, after the Certificate that replaces it is Ready, a Certificate
 * of the host that renews a Secret nothing in its namespace serves. Its Secret stays.
 * @param {Object} params
 * @param {Object} params.observation - {@link UnderpostNamespace.observe}.
 * @param {Object[]} params.targets - `{host, deployId, owner, consumer}`; `consumer` is {@link UnderpostIngress.consumer}.
 * @param {{mode:'cert-manager'|'self-signed'|'none', issuer?:string}} params.policy - The TLS policy of the environment.
 * @param {'gateway-api'|'contour'} params.provider - The routing provider of the environment.
 * @param {string} params.gatewayClass
 * @param {string[]} [params.retired] - Ids of Gateways a reconcile of the routing removes: they consume nothing.
 * @param {{installed:boolean, gatewayApi:boolean}} [params.certManager] - The cert-manager controller, when read.
 * @param {number} [params.now]
 * @returns {{mode:string, entries:Object[], issuer:Object|null, steps:Object[], findings:Object[]}}
 * @memberof UnderpostTls
 */
export const tlsPlan = ({
  observation,
  targets,
  policy,
  provider,
  gatewayClass,
  retired = [],
  certManager,
  now = Date.now(),
}) => {
  const { environment } = observation;
  const { mode, issuer: issuerName } = policy;
  if (mode === 'none')
    return {
      mode,
      entries: targets.map((target) => ({ ...entryBase(target), state: 'http-only' })),
      issuer: null,
      steps: [],
      findings: [],
    };
  const secrets = observation.config.secrets.filter(({ type }) => type === 'kubernetes.io/tls');
  const facts = observation.config.tls ?? [];
  const certificates = observation.routing.certificates ?? [];
  const challenges = observation.routing.challenges ?? [];
  const gateways = (observation.routing.gateways ?? []).filter((gateway) => !retired.includes(objectId(gateway)));
  const proxies = observation.routing.proxies ?? [];
  const margin = mode === 'self-signed' ? SSL_RENEW_MS : 0;
  const factOf = (namespace, name) => facts.find((entry) => entry.namespace === namespace && entry.name === name);
  const validFor = (fact, host) =>
    Boolean(fact?.notAfter) && new Date(fact.notAfter).getTime() - now > margin && covers(fact.names, host);
  const held = (namespace, name) => secrets.some((secret) => secret.namespace === namespace && secret.name === name);
  const consumed = (namespace, name) =>
    gateways.some(
      (gateway) =>
        gateway.namespace === namespace &&
        gateway.listeners.some(({ certificates: refs }) => refs.includes(`${namespace}/${name}`)),
    ) || proxies.some((proxy) => proxy.namespace === namespace && [name, `${namespace}/${name}`].includes(proxy.tls));
  const issuer =
    mode === 'cert-manager'
      ? issuerState({ observation, name: issuerName, solver: solverOf(provider), gatewayClass })
      : null;
  const listed = new Set(issuer?.parentRefs ?? []);
  const steps = [];
  const findings = [];
  const found = (severity, code, message, deployId) => findings.push({ severity, code, message, deployId });
  const unrouted = new Set();
  const unlisted = new Set();

  const entries = targets.map((target) => {
    const { host, deployId, owner, consumer } = target;
    const [namespace, name] = consumer.secret.split('/');
    const present = held(namespace, name);
    const fact = factOf(namespace, name);
    const valid = present && validFor(fact, host);
    const certificate = certificates.find((entry) => entry.namespace === namespace && entry.secretName === name);
    const source = present
      ? undefined
      : secrets.find(
          (secret) =>
            secret.name === name && secret.namespace !== namespace && validFor(factOf(secret.namespace, name), host),
        );
    const entry = {
      ...entryBase(target),
      secret: {
        id: `Secret/${namespace}/${name}`,
        present,
        valid,
        names: fact?.names ?? [],
        notAfter: fact?.notAfter ?? '',
      },
      certificate: certificate ? certificateState(certificate) : null,
    };
    const secretId = `${namespace}/${name}`;
    if (consumer.live) consumerFindings({ entry, consumer, observation, found });
    if (mode === 'self-signed') {
      if (certificate)
        found(
          'warning',
          'certificate-unexpected',
          `${objectId(certificate)} renews ${secretId}, but ${environment} issues self-signed certificates: ` +
            `it replaces the Secret. Remove it, or set environments.${environment}.tls.mode to cert-manager`,
          deployId,
        );
      if (valid) return { ...entry, state: 'ready' };
      steps.push({ action: 'issue', object: `Secret/${namespace}/${name}`, host, owner, deployId });
      found(
        'error',
        present ? 'tls-invalid' : 'tls-secret-missing',
        `${secretId} ${present ? 'holds no valid certificate for its host' : 'does not exist'}: reconcile issues a self-signed one`,
        deployId,
      );
      return { ...entry, state: present ? 'invalid' : 'missing' };
    }

    const ours = (object) => !ownerLabel(object) || ownerLabel(object) === owner;
    const foreign = certificate && !ours(certificate);
    const routed = consumer.live;
    let certified = false;
    const certify = () => {
      certified = true;
      steps.push({
        action: 'certify',
        object: `Certificate/${namespace}/${name}`,
        manifest: certificateManifest({ host, namespace, name, owner, issuer: issuerName }),
        deployId,
      });
    };
    let state;
    if (foreign) {
      state = 'foreign';
      found(
        'error',
        'certificate-foreign',
        `${objectId(certificate)} belongs to ${ownerLabel(certificate)}, not ${owner}: nothing changes it`,
        deployId,
      );
    } else if (certificate) {
      const spec = certificate.dnsNames.includes(host) && certificate.issuer === `ClusterIssuer/${issuerName}`;
      if (!spec) {
        certify();
        found(
          'warning',
          'certificate-spec',
          `${objectId(certificate)} does not name ${host} from ClusterIssuer/${issuerName}: reconcile corrects it`,
          deployId,
        );
      }
      state = certificateFindings({ certificate, entry, environment, now, found });
    } else if (valid) {
      state = 'unrenewed';
      certify();
      found('error', 'tls-unrenewed', `${secretId} has no Certificate that renews it: reconcile creates it`, deployId);
    } else if (source) {
      state = 'misplaced';
      steps.push({
        action: 'copy',
        object: `Secret/${source.namespace}/${name}`,
        to: namespace,
        hostnames: [host],
        deployId,
      });
      certify();
      found(
        'error',
        'tls-misplaced',
        `${consumer.id} names ${secretId}, which ${source.namespace} holds: reconcile copies it and creates its Certificate`,
        deployId,
      );
    } else if (routed) {
      state = present ? 'invalid' : 'missing';
      certify();
      found(
        'error',
        present ? 'tls-invalid' : 'tls-secret-missing',
        `${secretId} ${present ? 'holds no valid certificate for its host' : 'does not exist'}: reconcile creates its Certificate`,
        deployId,
      );
    } else {
      state = 'unrouted';
      unrouted.add(deployId);
    }
    if (routed && provider === 'gateway-api' && !foreign)
      challengeFindings({ entry, consumer, challenges, listed, unlisted, now, steps, found });
    if (certified || state === 'ready')
      for (const duplicate of certificates.filter(
        (other) =>
          other !== certificate &&
          other.namespace !== namespace &&
          ours(other) &&
          (other.secretName === name || other.dnsNames.includes(host)) &&
          !consumed(other.namespace, other.secretName),
      )) {
        steps.push({
          action: 'retire',
          object: objectId(duplicate),
          keep: `Secret/${duplicate.namespace}/${duplicate.secretName}`,
          after: `Certificate/${namespace}/${name}`,
          deployId,
        });
        found(
          'warning',
          'certificate-duplicate',
          `${objectId(duplicate)} renews a Secret nothing in ${duplicate.namespace} serves, while ${secretId} serves ` +
            `${host}: reconcile removes it once Certificate/${namespace}/${name} is Ready, and keeps its Secret`,
          deployId,
        );
      }
    return { ...entry, state };
  });

  for (const deployId of unrouted)
    found(
      'warning',
      'tls-unrouted',
      `No routing object serves ${deployId} in ${environment}, and its hosts hold no valid TLS Secret: ` +
        `node bin deploy ${deployId} ${environment}, then node bin tls reconcile --deploy-id ${deployId} --env ${environment} --apply`,
      deployId,
    );
  if (issuer && targets.length) issuerFindings({ issuer, unlisted, provider, certManager, steps, found });
  // Without cert-manager, its objects have no API to apply to.
  return { mode, entries, issuer, steps: issuer?.installed === false ? [] : orderOf(steps), findings };
};

/** The fields of a target every entry carries. */
const entryBase = ({ host, deployId, consumer }) => ({
  host,
  deployId,
  consumer: { id: consumer.id, live: consumer.live, secret: consumer.secret },
});

/** The record of a Certificate in an entry. */
const certificateState = ({ kind, namespace, name, conditions, notAfter, renewalTime }) => ({
  id: objectId({ kind, namespace, name }),
  ready: conditions.Ready?.status === 'True',
  issuing: conditions.Issuing?.status === 'True',
  notAfter,
  renewalTime,
});

/** The state of a Certificate, and its findings: a failure, an overdue renewal, or a pending issue. */
const certificateFindings = ({ certificate, entry, environment, now, found }) => {
  const { Ready, Issuing } = certificate.conditions;
  const id = objectId(certificate);
  const describe = `kubectl describe certificate ${certificate.name} -n ${certificate.namespace}`;
  if (Issuing?.status === 'False' && Issuing.reason === 'Failed') {
    found('error', 'certificate-failed', `${id} failed to issue: ${Issuing.message}`, entry.deployId);
    return 'failed';
  }
  if (Issuing?.status !== 'True' && certificate.renewalTime && new Date(certificate.renewalTime).getTime() < now)
    found(
      'warning',
      'certificate-renewal-overdue',
      `${id} was due for renewal on ${certificate.renewalTime} and is not renewing: ` +
        `node bin tls renew --host ${entry.host} --env ${environment} --apply`,
      entry.deployId,
    );
  if (Ready?.status === 'True') return 'ready';
  found(
    'warning',
    Issuing?.status === 'True' ? 'tls-issuing' : 'certificate-not-ready',
    `${id} ${Issuing?.status === 'True' ? 'is issuing' : `is not Ready${Ready ? `: ${`${Ready.reason} ${Ready.message}`.trim()}` : ''}`}: ${describe} names its pending step`,
    entry.deployId,
  );
  return Issuing?.status === 'True' ? 'issuing' : 'not-ready';
};

/** The findings of the routing object that serves a host: its TLS listener, and the grant of a Secret in another namespace. */
const consumerFindings = ({ entry, consumer, observation, found }) => {
  const [namespace, name] = consumer.secret.split('/');
  if (consumer.kind === 'Gateway') {
    const https = consumer.gateway.listeners.some(
      ({ hostname, protocol }) => hostname === entry.host && protocol === 'HTTPS',
    );
    if (!https)
      found(
        'error',
        'listener-tls-missing',
        `${consumer.id} has no HTTPS listener for ${entry.host}: ` +
          `node bin deploy ${entry.deployId} ${observation.environment} --disable-update-deployment`,
        entry.deployId,
      );
  }
  if (namespace !== consumer.namespace) {
    const granted = (observation.routing.grants ?? []).some(
      (grant) =>
        grant.namespace === namespace &&
        grant.from.includes(`${consumer.kind}/${consumer.namespace}`) &&
        (grant.to.includes(`Secret/${name}`) || grant.to.includes('Secret/*')),
    );
    if (!granted)
      found(
        'error',
        'tls-reference-ungranted',
        `${consumer.id} names ${consumer.secret}, and no ReferenceGrant in ${namespace} admits it`,
        entry.deployId,
      );
  }
};

/**
 * The findings of the HTTP-01 challenge of a host on the Gateway API: the HTTP listener that answers it, the
 * issuer reference to its Gateway, and its ACME Challenges. A pending Challenge whose solver does not name the
 * Gateway never resolves: a reconcile removes it, and cert-manager creates it again from the issuer.
 */
const challengeFindings = ({ entry, consumer, challenges, listed, unlisted, now, steps, found }) => {
  const { host, deployId } = entry;
  const gateway = `${consumer.namespace}/${consumer.name}`;
  const http = consumer.gateway.listeners.some(
    ({ protocol, port, hostname, allowedRoutes }) =>
      protocol === 'HTTP' && port === 80 && (!hostname || hostname === host) && ['Same', 'All'].includes(allowedRoutes),
  );
  if (!http)
    found(
      'error',
      'challenge-listener-missing',
      `${consumer.id} has no HTTP listener on port 80 for ${host} that admits the challenge route of its namespace`,
      deployId,
    );
  if (!listed.has(gateway)) unlisted.add(gateway);
  for (const challenge of challenges.filter(
    (other) => other.namespace === consumer.namespace && other.dnsName === host && other.state !== 'valid',
  )) {
    const id = objectId(challenge);
    if (challenge.state === 'pending' && challenge.parentRefs.length && !challenge.parentRefs.includes(gateway)) {
      steps.push({ action: 'rechallenge', object: id, deployId });
      found(
        'error',
        'acme-challenge-stale',
        `${id} routes its challenge through ${challenge.parentRefs.join(', ')}, not ${gateway}: ` +
          'reconcile removes it, and cert-manager creates it again from the issuer',
        deployId,
      );
    } else if (
      ['invalid', 'errored'].includes(challenge.state) ||
      (challenge.created && now - new Date(challenge.created).getTime() > CHALLENGE_STUCK_MS)
    )
      found(
        'warning',
        'acme-challenge-stuck',
        `${id} is ${challenge.state || 'pending'}${challenge.reason ? `: ${challenge.reason}` : ''}. ` +
          `Check that http://${host}/.well-known/acme-challenge/ reaches ${consumer.id} from the internet`,
        deployId,
      );
  }
};

/** The findings of the issuer and of the cert-manager controller, and the issuer step a target needs. */
const issuerFindings = ({ issuer, unlisted, provider, certManager, steps, found }) => {
  const id = `ClusterIssuer/${issuer.name}`;
  if (!issuer.installed) {
    found('error', 'cert-manager-missing', 'cert-manager is not installed: node bin cluster --cert-manager');
    return;
  }
  if (certManager?.installed && provider === 'gateway-api' && !certManager.gatewayApi)
    found(
      'error',
      'cert-manager-gateway-api-disabled',
      'cert-manager runs without its Gateway API support, so no gateway challenge route is created: ' +
        'node bin cluster --cert-manager',
    );
  else if (certManager?.installed && provider === 'gateway-api' && certManager.stale)
    found(
      'error',
      'cert-manager-restart-needed',
      'cert-manager started before the Gateway API CRDs were installed, so it creates no gateway challenge route: ' +
        `kubectl rollout restart deployment cert-manager -n ${certManager.namespace}`,
    );
  if (certManager?.version) releaseFindings(certManager.version, found);
  const missing = [...unlisted];
  const solverMismatch = issuer.present && !issuer.matches;
  if (!issuer.present) found('error', 'issuer-missing', `${id} does not exist: reconcile creates it`);
  else if (!issuer.ready) found('error', 'issuer-not-ready', `${id} is not Ready: ${issuer.reason || 'no reason'}`);
  if (solverMismatch)
    found(
      'error',
      'issuer-solver-mismatch',
      `${id} solves challenges through ${issuer.solvers.join(', ')}, but the routing provider is ${provider}: reconcile replaces its solver`,
    );
  const addable = missing.filter((gateway) => issuer.desired.includes(gateway));
  for (const gateway of missing)
    found(
      'error',
      'issuer-gateway-missing',
      `${id} does not list the Gateway ${gateway}, so its challenges are never answered: ` +
        (addable.includes(gateway)
          ? 'reconcile adds it'
          : `it is not eligible: ${issuer.excluded.find(({ ref }) => ref === gateway)?.reason ?? 'it does not exist'}`),
    );
  if (!issuer.present || solverMismatch || addable.length)
    steps.push({ action: 'issuer', name: issuer.name, solver: issuer.solver, parentRefs: issuer.refs });
};

/** The steps in the order a reconcile runs them: the issuer, then each Secret and Certificate, then the removals. */
const orderOf = (steps) => {
  const rank = { issuer: 0, copy: 1, certify: 2, issue: 2, renew: 3, rechallenge: 4, retire: 5 };
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => rank[a.step.action] - rank[b.step.action] || a.index - b.index)
    .map(({ step }) => step);
};

/**
 * Copies a TLS Secret into another namespace with the fields that define it: no status, no server metadata, no
 * owner reference. Its content passes from kubectl to kubectl, and no log holds it. It copies only when its
 * certificate and key match, it has not expired, and it names each of `hostnames`.
 * @param {Function} kubectl - {@link kubectlFactory}.
 * @param {{namespace:string, name:string}} source
 * @param {string} to - The namespace of the copy.
 * @param {{apply?:boolean, hostnames?:string[]}} [options] - Without `apply`, the API server validates only.
 * @returns {Promise<void>}
 * @memberof UnderpostTls
 */
export const copySecret = async (kubectl, { namespace, name }, to, { apply = true, hostnames = [] } = {}) => {
  const { stdout } = await kubectl(['get', 'secret', name, '-n', namespace, '-o', 'json']);
  const object = JSON.parse(stdout);
  assertTlsSecret(object, hostnames, `Secret/${namespace}/${name}`);
  const { 'kubectl.kubernetes.io/last-applied-configuration': applied, ...annotations } =
    object.metadata.annotations ?? {};
  await kubectl(['apply', '-f', '-', ...(apply ? [] : ['--dry-run=server'])], {
    input: JSON.stringify({
      apiVersion: object.apiVersion,
      kind: object.kind,
      type: object.type,
      data: object.data,
      metadata: { name, namespace: to, labels: object.metadata.labels ?? {}, annotations },
    }),
  });
};

/**
 * Issues the self-signed certificate of a host on this machine and applies it as its TLS Secret in one apply:
 * the Secret is never deleted first. The certificate stays in the local store of this machine, outside Git;
 * `rotate` issues a new one.
 * @param {Function} kubectl - {@link kubectlFactory}.
 * @param {{host:string, namespace:string, name:string, owner:string, rotate?:boolean}} params
 * @returns {Promise<void>}
 * @memberof UnderpostTls
 */
const issueSelfSigned = async (kubectl, { host, namespace, name, owner, rotate = false }) => {
  TLS.ensureLocalCertificate(host, { renew: rotate });
  const { key, cert } = TLS.locateSslFiles(host, LOCAL_SSL_ROOT);
  if (!key || !cert) throw new Error(`No local certificate for ${host} in ${LOCAL_SSL_ROOT}`);
  await kubectl(['apply', '-f', '-'], {
    input: JSON.stringify({
      apiVersion: 'v1',
      kind: 'Secret',
      type: 'kubernetes.io/tls',
      metadata: { name, namespace, labels: labelsOf(owner) },
      data: { 'tls.crt': fs.readFileSync(cert).toString('base64'), 'tls.key': fs.readFileSync(key).toString('base64') },
    }),
  });
};

/** Marks a Certificate for renewal: cert-manager issues it again, and the Certificate and its Secret stay. */
const renewCertificate = async (kubectl, { namespace, name }, apply) => {
  const certificate = JSON.parse(
    (await kubectl(['get', RESOURCES.Certificate, name, '-n', namespace, '-o', 'json'])).stdout,
  );
  const conditions = certificate.status?.conditions ?? [];
  if (conditions.some(({ type, status }) => type === 'Issuing' && status === 'True')) return false;
  const issuing = {
    type: 'Issuing',
    status: 'True',
    reason: 'ManuallyTriggered',
    message: 'Certificate re-issuance manually triggered by underpost tls renew',
    lastTransitionTime: new Date().toISOString(),
    observedGeneration: certificate.metadata.generation,
  };
  await kubectl([
    'patch',
    RESOURCES.Certificate,
    name,
    '-n',
    namespace,
    '--subresource=status',
    '--type=json',
    '-p',
    JSON.stringify([
      { op: 'test', path: '/metadata/resourceVersion', value: certificate.metadata.resourceVersion },
      {
        op: certificate.status?.conditions ? 'replace' : 'add',
        path: certificate.status ? '/status/conditions' : '/status',
        value: certificate.status
          ? [...conditions.filter(({ type }) => type !== 'Issuing'), issuing]
          : { conditions: [issuing] },
      },
    ]),
    ...(apply ? [] : ['--dry-run=server']),
  ]);
  return true;
};

/** The Certificates of a namespace that are Ready, by name. */
const readyIn = async (kubectl, namespace, names) => {
  await kubectl(
    [
      'wait',
      '--for=condition=Ready',
      ...names.map((name) => `${RESOURCES.Certificate}/${name}`),
      '-n',
      namespace,
      `--timeout=${READY_TIMEOUT}`,
    ],
    { silentOnError: true },
  );
  const { stdout } = await kubectl(['get', RESOURCES.Certificate, '-n', namespace, '-o', 'json'], {
    silentOnError: true,
  });
  return new Set(
    (stdout.trim() ? JSON.parse(stdout).items : [])
      .filter((item) =>
        (item.status?.conditions ?? []).some(({ type, status }) => type === 'Ready' && status === 'True'),
      )
      .map(({ metadata }) => metadata.name),
  );
};

/**
 * Applies the steps of {@link tlsPlan}: the issuer, each Secret copy, each Certificate, each self-signed Secret,
 * each renewal and each stale Challenge; then it waits until each Certificate it created is Ready, and removes
 * each Certificate a Ready one replaces, with `--cascade=orphan`, so its Secret stays.
 * @param {Function} kubectl - {@link kubectlFactory}.
 * @param {Object[]} steps
 * @param {boolean} apply - Without it, the API server validates each change only, and nothing is issued.
 * @returns {Promise<{done:Object[], unready:string[]}>} The steps it ran, and the Certificates that are not Ready.
 * @memberof UnderpostTls
 */
export const applyTlsSteps = async (kubectl, steps, apply) => {
  const dryRun = apply ? [] : ['--dry-run=server'];
  const parse = (id) => {
    const [kind, namespace, name] = id.split('/');
    return { kind, namespace, name };
  };
  const verb = (done, would) => (apply ? done : `Dry run: ${would}`);
  for (const step of steps.filter(({ action }) => action !== 'retire')) {
    const { namespace, name } = step.object ? parse(step.object) : {};
    if (step.action === 'issuer') {
      await kubectl(['apply', '-f', '-', ...dryRun], {
        input: JSON.stringify(issuerManifest({ name: step.name, solver: step.solver, parentRefs: step.parentRefs })),
      });
      logger.info(`${verb('Applied', 'apply')} ClusterIssuer/${step.name}`, {
        solver: step.solver,
        gateways: step.parentRefs.map(refText),
      });
    } else if (step.action === 'copy') {
      await copySecret(kubectl, { namespace, name }, step.to, { apply, hostnames: step.hostnames });
      logger.info(`${verb('Copied', 'copy')} ${step.object} into ${step.to}`);
    } else if (step.action === 'certify') {
      await kubectl(['apply', '-f', '-', ...dryRun], { input: JSON.stringify(step.manifest) });
      logger.info(`${verb('Applied', 'apply')} ${step.object}`);
    } else if (step.action === 'issue') {
      if (apply)
        await issueSelfSigned(kubectl, { host: step.host, namespace, name, owner: step.owner, rotate: step.rotate });
      logger.info(`${verb('Issued', 'issue')} a self-signed ${step.object}`);
    } else if (step.action === 'renew') {
      const marked = await renewCertificate(kubectl, { namespace, name }, apply);
      logger.info(
        marked ? `${verb('Marked', 'mark')} ${step.object} for renewal` : `${step.object} is issuing already`,
      );
    } else if (step.action === 'rechallenge') {
      await kubectl(['delete', RESOURCES.Challenge, name, '-n', namespace, '--ignore-not-found', ...dryRun]);
      logger.info(`${verb('Removed', 'remove')} ${step.object}`);
    }
  }
  const unready = [];
  if (apply)
    for (const [namespace, created] of Map.groupBy(
      steps.filter(({ action }) => action === 'certify').map(({ object }) => parse(object)),
      ({ namespace: own }) => own,
    )) {
      const ready = await readyIn(
        kubectl,
        namespace,
        created.map(({ name }) => name),
      );
      for (const { name } of created) if (!ready.has(name)) unready.push(`Certificate/${namespace}/${name}`);
    }
  const done = steps.filter((step) => step.action !== 'retire' || !unready.includes(step.after));
  for (const step of done.filter(({ action }) => action === 'retire')) {
    const { namespace, name } = parse(step.object);
    await kubectl([
      'delete',
      RESOURCES.Certificate,
      name,
      '-n',
      namespace,
      '--cascade=orphan',
      '--wait=true',
      '--timeout=5m',
      '--ignore-not-found',
      ...dryRun,
    ]);
    logger.info(`${verb('Removed', 'remove')} ${step.object}; ${step.keep} stays`);
  }
  return { done, unready };
};

/** The names of the TLS Secrets and of the Secrets the Certificates of a namespace renew. */
const placedIn = async (kubectl, namespace) => {
  const names = async (resource, field, ...filters) => {
    const { stdout = '' } = await kubectl(
      ['get', resource, ...filters, '-n', namespace, '-o', `jsonpath={.items[*].${field}}`],
      { silentOnError: true },
    ).catch(() => ({}));
    return new Set(stdout.split(/\s+/).filter(Boolean));
  };
  return {
    secrets: await names('secrets', 'metadata.name', '--field-selector', 'type=kubernetes.io/tls'),
    certificates: await names(RESOURCES.Certificate, 'spec.secretName'),
  };
};

/**
 * The cert-manager controller: whether it runs, its release, whether its Gateway API support is on, and whether
 * a controller pod started before the HTTPRoute CRD existed: such a pod watches no HTTPRoute until it restarts.
 */
const certManagerOf = async (kubectl, environment) => {
  const namespace = Underpost.namespace.of('certManager', { environment });
  const read = (args) => kubectl(args, { silentOnError: true }).catch(() => ({ code: 1, stdout: '' }));
  const container = (field) =>
    read([
      'get',
      'deployment',
      'cert-manager',
      '-n',
      namespace,
      '-o',
      `jsonpath={.spec.template.spec.containers[0].${field}}`,
    ]);
  const [args, image, config, started, crd] = await Promise.all([
    container('args'),
    container('image'),
    read(['get', 'configmap', 'cert-manager', '-n', namespace, '-o', 'jsonpath={.data.config\\.yaml}']),
    read([
      'get',
      'pods',
      '-n',
      namespace,
      '-l',
      'app.kubernetes.io/component=controller',
      '-o',
      'jsonpath={.items[*].status.startTime}',
    ]),
    read(['get', 'crd', 'httproutes.gateway.networking.k8s.io', '-o', 'jsonpath={.metadata.creationTimestamp}']),
  ]);
  const created = Date.parse(crd.stdout.trim());
  return {
    namespace,
    installed: args.code === 0 && Boolean(args.stdout.trim()),
    version: /:(v\d+\.\d+\.\d+)/.exec(image.stdout)?.[1] ?? '',
    gatewayApi: /enableGatewayAPI:\s*true/.test(config.stdout) || args.stdout.includes('--enable-gateway-api'),
    stale: started.stdout
      .split(/\s+/)
      .filter(Boolean)
      .some((time) => Date.parse(time) < created),
  };
};

/** The finding codes a dry run of a reconcile plans to change; they are not left over. */
const PLANNED = Object.freeze([
  'tls-unrenewed',
  'tls-misplaced',
  'tls-secret-missing',
  'tls-invalid',
  'issuer-missing',
  'issuer-gateway-missing',
  'issuer-solver-mismatch',
  'acme-challenge-stale',
]);

/**
 * The TLS findings a reconcile leaves: each error and each stuck challenge. A dry run leaves out what its
 * plan changes.
 * @param {Object[]} findings - {@link tlsPlan} findings.
 * @param {boolean} apply - Whether the findings were read after an apply.
 * @returns {Object[]}
 * @memberof UnderpostTls
 */
export const unchangedOf = (findings, apply) =>
  findings.filter(
    ({ severity, code }) =>
      (severity === 'error' || code === 'acme-challenge-stuck') && (apply || !PLANNED.includes(code)),
  );

/**
 * One step of {@link tlsPlan} as text.
 * @param {Object} step
 * @param {boolean} applied
 * @returns {string}
 * @memberof UnderpostTls
 */
export const stepText = (step, applied) => {
  const would = (done, verb) => (applied ? done : `would ${verb}`);
  return {
    issuer: () =>
      `${would('applied', 'apply')} ClusterIssuer/${step.name} (${step.solver}` +
      `${step.parentRefs.length ? `: ${step.parentRefs.map(refText).join(', ')}` : ''})`,
    copy: () => `${would('copied', 'copy')} ${step.object} into ${step.to}`,
    certify: () => `${would('applied', 'apply')} ${step.object}`,
    issue: () => `${would('issued', 'issue')} a self-signed ${step.object}`,
    renew: () => `${would('marked', 'mark')} ${step.object} for renewal`,
    rechallenge: () => `${would('removed', 'remove')} ${step.object}`,
    retire: () => `${would('removed', 'remove')} ${step.object}; ${step.keep} stays`,
  }[step.action]();
};

/** The observation of a command, the cert-manager controller and the {@link tlsPlan} of its selection. */
const inspect = async (params) => {
  const { options = {} } = params;
  const selection = Underpost.ingress.select({ deployIds: listOf(options.deployId), hosts: listOf(options.host) });
  const observation = await Underpost.namespace.observe(params);
  const certManager = await certManagerOf(kubectlFactory(observation.context), observation.environment);
  return { observation, plan: UnderpostTls.API.plan({ observation, selection, options, certManager }) };
};

/**
 * @class UnderpostTls
 * @description The TLS lifecycle authority: Certificates, TLS Secrets, the ACME issuer and self-signed TLS.
 * @memberof UnderpostTls
 */
class UnderpostTls {
  static API = {
    /**
     * The TLS policy of an environment: `environments.<env>.tls` of conf.cluster.json.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {{mode:'cert-manager'|'self-signed'|'none', issuer?:string}}
     * @throws {Error} When the environment names no TLS policy.
     * @memberof UnderpostTls
     */
    policy(params = {}) {
      const { environment, tls } = Underpost.namespace.cluster(params);
      if (!tls)
        throw refusal(
          `conf.cluster.json names no TLS policy for ${environment}: set environments.${environment}.tls to ${TLS_POLICIES}`,
        );
      return tls;
    },

    /**
     * The TLS mode of an environment ({@link UnderpostTls.policy}).
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {'cert-manager'|'self-signed'|'none'}
     * @memberof UnderpostTls
     */
    mode(params = {}) {
      return UnderpostTls.API.policy(params).mode;
    },

    /**
     * Whether the routing of an environment terminates TLS: an HTTPS listener and a TLS virtual host for each host.
     * @param {{environment?:string, options?:Object}} [params]
     * @returns {boolean}
     * @memberof UnderpostTls
     */
    terminates(params = {}) {
      return UnderpostTls.API.mode(params) !== 'none';
    },

    /**
     * The environments the ClusterIssuer of an environment serves: each environment of conf.cluster.json in
     * the cert-manager mode with the same issuer and the same cluster (the same context, or the same declared
     * cluster fingerprint), with its routing provider. A ClusterIssuer has one solver: a change to it reaches
     * each of them.
     * @param {{environment?:string, options?:Object, path?:string}} [params]
     * @returns {{issuer:string, provider:string, consumers:Array<{environment:string, provider:string}>}}
     * @throws {Error} When the environment issues no ACME certificate, or two of its consumers route
     *   through two providers.
     * @memberof UnderpostTls
     */
    issuerConsumers(params = {}) {
      const { environment, context, cluster } = Underpost.namespace.cluster(params);
      const policy = UnderpostTls.API.policy(params);
      if (policy.mode !== 'cert-manager')
        throw refusal(
          `${environment} issues no ACME certificate: environments.${environment}.tls.mode is ${policy.mode}`,
        );
      const sections = readClusterConf(params.path);
      const sameCluster = (section) =>
        (context && section.context === context) || (cluster && section.cluster?.fingerprint === cluster.fingerprint);
      const consumers = Object.entries(sections)
        .filter(
          ([name, section]) =>
            name === environment ||
            (section.tls?.mode === 'cert-manager' && section.tls.issuer === policy.issuer && sameCluster(section)),
        )
        .map(([name, section]) => ({ environment: name, provider: section.routing?.provider ?? '' }));
      const provider = Underpost.ingress.provider(params);
      const others = consumers.filter((consumer) => consumer.provider && consumer.provider !== provider);
      if (others.length)
        throw refusal(
          `ClusterIssuer ${policy.issuer} serves ${consumers.map((consumer) => `${consumer.environment} (${consumer.provider})`).join(', ')}: ` +
            'one ClusterIssuer has one solver; give each provider its own issuer, or one provider to every environment of the cluster',
        );
      return { issuer: policy.issuer, provider, consumers };
    },

    /**
     * The TLS of the selected hosts against an observation: {@link tlsPlan} with the TLS policy and the routing
     * provider of the environment and the Gateway class of the options.
     * @param {{observation:Object, selection:Object[], options?:Object, path?:string, retired?:string[],
     *   certManager?:Object}} params - `selection` is {@link UnderpostIngress.select}; `path` is conf.cluster.json.
     * @returns {Object}
     * @memberof UnderpostTls
     */
    plan({ observation, selection, options = {}, path, retired, certManager }) {
      const { environment } = observation;
      const policy = UnderpostTls.API.policy({ environment, options, path });
      return tlsPlan({
        observation,
        targets: selection.map(({ host, deployId }) => ({
          host,
          deployId,
          owner: Underpost.ingress.gatewayNameFactory({ deployId, env: environment }),
          consumer: Underpost.ingress.consumer({ host, deployId, environment, options, observation, path }),
        })),
        policy,
        provider:
          policy.mode === 'cert-manager'
            ? UnderpostTls.API.issuerConsumers({ environment, options, path }).provider
            : Underpost.ingress.provider({ environment, options, path }),
        gatewayClass: Underpost.ingress.gatewayApiConfigFactory(options).gatewayClassName,
        retired,
        certManager,
      });
    },

    applySteps: applyTlsSteps,
    unchanged: unchangedOf,
    stepText,

    /**
     * The TLS of the hosts of `--deploy-id` or `--host`, else of every deployment: the mode, the routing
     * stack, the issuer, the state of each host and the findings. Reads only.
     * @param {{options?:Object}} [params]
     * @returns {Promise<Object>}
     * @memberof UnderpostTls
     */
    async status(params = {}) {
      const { observation, plan } = await inspect(params);
      return {
        environment: observation.environment,
        context: observation.context,
        mode: plan.mode,
        provider: Underpost.ingress.provider({ environment: observation.environment, options: params.options }),
        issuer: plan.issuer,
        hosts: plan.entries,
        findings: plan.findings,
      };
    },

    /**
     * The findings of {@link UnderpostTls.status}. Reads only.
     * @param {{options?:Object}} [params]
     * @returns {Promise<{environment:string, context:string, mode:string, findings:Object[]}>}
     * @memberof UnderpostTls
     */
    async audit(params = {}) {
      const { environment, context, mode, findings } = await UnderpostTls.API.status(params);
      return { environment, context, mode, findings };
    },

    /**
     * Brings the TLS of the selected hosts in line with their environment: the issuer lists the Gateway of each,
     * each valid Secret stays or is copied where its routing object reads it, each Certificate exists with its
     * spec, each self-signed Secret is issued, each stale Challenge goes, and each duplicate Certificate goes once
     * its replacement is Ready. It reads the cluster again after it applies. A dry run sends each change as a
     * server dry run; a change needs `--env`, and `--deploy-id`, `--host` or `--all`.
     * @param {{apply?:boolean, options?:Object}} [params]
     * @returns {Promise<Object>} `plan` holds the steps, `unready` the Certificates not Ready, `unchanged` what remains.
     * @memberof UnderpostTls
     */
    async reconcile({ apply = false, ...params } = {}) {
      const { options = {} } = params;
      if (apply)
        assertChange({
          options,
          selected: listOf(options.deployId).length + listOf(options.host).length > 0,
          command: 'tls reconcile',
        });
      const { observation, plan } = await inspect(params);
      const { environment, context } = observation;
      if (apply) logger.info(`Reconcile the TLS of ${environment} in the context ${context || '(current)'}`);
      const { done, unready } = await applyTlsSteps(kubectlFactory(context), plan.steps, apply);
      const after = apply && done.length ? (await inspect({ ...params, context })).plan : plan;
      return {
        environment,
        context,
        mode: plan.mode,
        plan: done.map(({ manifest, ...step }) => step),
        applied: apply,
        unready,
        unchanged: [
          ...after.findings.filter(({ code }) => code === 'tls-unrouted'),
          ...unchangedOf(after.findings, apply),
        ].map(({ message }) => message),
      };
    },

    /**
     * Renews the certificate of each host of `--host`: cert-manager issues its Certificate again, or this
     * machine issues a new self-signed certificate. No Certificate or Secret is deleted.
     * @param {{apply?:boolean, options?:Object}} [params]
     * @returns {Promise<Object>}
     * @throws {Error} Without `--host`, in the `none` mode, or on a host whose Certificate does not exist.
     * @memberof UnderpostTls
     */
    async renew({ apply = false, ...params } = {}) {
      const { options = {} } = params;
      const hosts = listOf(options.host);
      if (!hosts.length) throw refusal('tls renew needs --host: name each host it renews');
      if (apply) assertChange({ options, selected: true, command: 'tls renew' });
      const { environment, context, mode, hosts: entries } = await UnderpostTls.API.status(params);
      if (mode === 'none')
        throw refusal(`${environment} serves HTTP only: environments.${environment}.tls.mode is none`);
      const steps = entries.map(({ host, deployId, consumer, certificate }) => {
        const [namespace, name] = consumer.secret.split('/');
        if (mode === 'self-signed')
          return {
            action: 'issue',
            object: `Secret/${namespace}/${name}`,
            host,
            owner: Underpost.ingress.gatewayNameFactory({ deployId, env: environment }),
            rotate: true,
          };
        if (!certificate)
          throw refusal(
            `No Certificate renews ${host}: node bin tls reconcile --host ${host} --env ${environment} --apply`,
          );
        return { action: 'renew', object: certificate.id };
      });
      if (apply) logger.info(`Renew in ${environment}, context ${context || '(current)'}: ${hosts.join(', ')}`);
      const { done } = await applyTlsSteps(kubectlFactory(context), steps, apply);
      return { environment, context, mode, plan: done, applied: apply, unready: [], unchanged: [] };
    },

    /**
     * The ClusterIssuer of the TLS policy of an environment: `status` reads it against the Gateway inventory;
     * `reconcile` applies the solver of the routing provider and the Gateways of {@link issuerState}. A dry run
     * sends the change as a server dry run.
     * @param {string} action - `status` or `reconcile`.
     * @param {{apply?:boolean, options?:Object}} [params]
     * @returns {Promise<Object>}
     * @throws {Error} When the TLS policy of the environment is not cert-manager.
     * @memberof UnderpostTls
     */
    async issuer(action = 'status', { apply = false, ...params } = {}) {
      const { options = {} } = params;
      if (!['status', 'reconcile'].includes(action)) throw refusal('issuer takes status or reconcile');
      if (apply && !options.env)
        throw refusal('tls issuer reconcile --apply needs --env: name the environment it serves');
      const { issuer, provider, consumers } = UnderpostTls.API.issuerConsumers(params);
      const observation = await Underpost.namespace.observe(params);
      const state = issuerState({
        observation,
        name: issuer,
        solver: solverOf(provider),
        gatewayClass: Underpost.ingress.gatewayApiConfigFactory(options).gatewayClassName,
      });
      const { refs, ...report } = {
        environment: observation.environment,
        context: observation.context,
        consumers,
        stagingVerified: CERT_MANAGER_RELEASES.solvers.includes(provider),
        ...state,
      };
      if (action === 'status') return report;
      if (!state.installed) throw refusal('cert-manager is not installed: node bin cluster --cert-manager');
      const changed = !state.present || !state.matches || state.added.length > 0 || state.removed.length > 0;
      if (apply && changed)
        logger.info(`Reconcile ClusterIssuer/${state.name} in the context ${observation.context || '(current)'}`);
      await applyTlsSteps(
        kubectlFactory(observation.context),
        changed ? [{ action: 'issuer', name: state.name, solver: state.solver, parentRefs: refs }] : [],
        apply,
      );
      return { ...report, applied: apply && changed, changed };
    },

    /**
     * Prepares the TLS of hosts in a namespace before their routing moves there: it copies each valid Secret
     * the namespace lacks, issues each self-signed one, and creates each Certificate where a valid Secret is
     * placed. It verifies that each Secret placed there has its Certificate.
     * @param {{kubectl:Function, observation:Object, hosts:string[], to:string, options?:Object}} params
     * @returns {Promise<string[]>} What it did.
     * @throws {Error} On a host no deployment declares, or a Secret placed without its Certificate.
     * @memberof UnderpostTls
     */
    async prepare({ kubectl, observation, hosts, to, options = {} }) {
      const { environment } = observation;
      const policy = UnderpostTls.API.policy({ environment, options });
      if (policy.mode === 'none' || !hosts.length) return [];
      const inventory = Underpost.ingress.hosts();
      const targets = hosts.map((host) => {
        const deployId = Underpost.ingress.owner(host, { inventory });
        const name = Underpost.ingress.gatewayNameFactory({ deployId, env: environment });
        return {
          host,
          deployId,
          owner: name,
          consumer: {
            kind: 'Gateway',
            namespace: to,
            name,
            id: `Gateway/${to}/${name}`,
            live: false,
            secret: `${to}/${host}`,
          },
        };
      });
      const { steps } = tlsPlan({
        observation,
        targets,
        policy,
        provider: Underpost.ingress.provider({ environment, options }),
        gatewayClass: Underpost.ingress.gatewayApiConfigFactory(options).gatewayClassName,
      });
      const { done } = await applyTlsSteps(
        kubectl,
        steps.filter(({ action }) => ['copy', 'certify', 'issue'].includes(action)),
        true,
      );
      const placed = await placedIn(kubectl, to);
      const unrenewed = hosts.filter((host) => placed.secrets.has(host) && !placed.certificates.has(host));
      if (policy.mode === 'cert-manager' && unrenewed.length)
        throw new Error(`${to} holds the TLS Secret of ${unrenewed.join(', ')} without a Certificate that renews it`);
      return done.map(({ action, object, to: into }) =>
        action === 'copy' ? `copy ${object} into ${into}` : `${action === 'issue' ? 'issue' : 'apply'} ${object}`,
      );
    },

    /**
     * The hosts of a deployment whose TLS is not in place in its namespace: no TLS Secret, or, in the
     * cert-manager mode, no Certificate. Reads only.
     * @param {{deployId:string, environment:string, namespace:string, options?:Object}} params
     * @returns {Promise<string[]>}
     * @memberof UnderpostTls
     */
    async missing({ deployId, environment, namespace, options = {} }) {
      const mode = UnderpostTls.API.mode({ environment, options });
      if (mode === 'none') return [];
      const placed = await placedIn(kubectlFactory(Underpost.namespace.target({ environment }).context), namespace);
      return Underpost.ingress
        .hosts({ deployIds: [deployId] })
        .map(({ host }) => host)
        .filter((host) => !placed.secrets.has(host) || (mode === 'cert-manager' && !placed.certificates.has(host)));
    },

    /**
     * The `underpost tls` command.
     * @param {string} operation - `status`, `audit`, `reconcile`, `renew` or `issuer`.
     * @param {string} [action] - For issuer: `status` (the default) or `reconcile`.
     * @param {Object} [options]
     * @memberof UnderpostTls
     */
    async callback(operation, action, options = {}) {
      try {
        const params = { options };
        const apply = options.apply === true;
        if (apply && options.dryRun) throw refusal('Use --dry-run or --apply, not both');
        const run = {
          status: async () => print(await UnderpostTls.API.status(params), options, statusText),
          audit: async () => {
            const report = await UnderpostTls.API.audit(params);
            print(report, options, auditText);
            process.exitCode = report.findings.some(({ severity }) => severity === 'error') ? 3 : 0;
          },
          reconcile: async () => print(await UnderpostTls.API.reconcile({ ...params, apply }), options, changeText),
          renew: async () => print(await UnderpostTls.API.renew({ ...params, apply }), options, changeText),
          issuer: async () =>
            print(await UnderpostTls.API.issuer(action ?? 'status', { ...params, apply }), options, issuerText),
        }[operation];
        if (!run) throw refusal(`Unknown operation ${operation}: ${TLS_OPERATIONS.join(', ')}`);
        await run();
      } catch (error) {
        logger.error(error.message);
        if (error.stderr?.trim()) logger.error(error.stderr.trim());
        process.exitCode = error.expected ? 3 : 1;
      }
    },
  };
}

const headerLines = ({ environment, context, mode }) => [
  `Environment  ${environment}`,
  `Context      ${context || 'current'}`,
  `TLS          ${mode}`,
];

const issuerLine = (issuer) =>
  !issuer
    ? []
    : [
        `Issuer       ClusterIssuer/${issuer.name} ${!issuer.installed ? 'cert-manager is not installed' : !issuer.present ? 'missing' : issuer.ready ? 'Ready' : `not Ready (${issuer.reason})`}` +
          `${issuer.present ? `, solver ${issuer.solvers.join(', ') || 'none'}, ${issuer.parentRefs.length} Gateways` : ''}`,
      ];

/** What a status or an audit checks: the cluster objects, never the certificate a client receives. */
const SCOPE_LINE =
  'Checks       the Kubernetes objects only; public HTTPS: openssl s_client -connect <host>:443 -servername <host>';

const statusText = (report) =>
  [
    ...headerLines(report),
    `Routing      ${report.provider === 'gateway-api' ? 'Gateway API' : 'Contour HTTPProxy'}`,
    ...issuerLine(report.issuer),
    SCOPE_LINE,
    '',
    `${'HOST'.padEnd(34)} ${'DEPLOYMENT'.padEnd(14)} ${'OBJECTS'.padEnd(11)} ${'SECRET'.padEnd(52)} EXPIRES`,
    ...report.hosts.map(
      ({ host, deployId, state, consumer, secret }) =>
        `${host.padEnd(34)} ${deployId.padEnd(14)} ${state.padEnd(11)} ${consumer.secret.padEnd(52)} ${secret?.notAfter?.slice(0, 10) || '-'}` +
        `${consumer.live ? '' : ' (no routing object)'}`,
    ),
    '',
    'Findings:',
    ...findingLines(report.findings),
  ].join('\n');

const auditText = (report) =>
  [...headerLines(report), SCOPE_LINE, 'Findings:', ...findingLines(report.findings)].join('\n');

const changeText = ({ environment, context, mode, plan: steps, applied, unready, unchanged }) =>
  [
    ...headerLines({ environment, context, mode }),
    '',
    ...(steps.length ? steps.map((step) => stepText(step, applied)) : ['Nothing to change']),
    ...(applied || !steps.length ? [] : ['Run again with --apply to make these changes']),
    ...unready.map((id) => `${id} is not Ready yet: node bin tls status names its pending step`),
    ...(unchanged.length ? ['Not changed here:', ...unchanged.map((message) => `  ${message}`)] : []),
  ].join('\n');

const issuerText = (report) =>
  [
    `Environment  ${report.environment}`,
    `Context      ${report.context || 'current'}`,
    ...issuerLine(report),
    `Solver       ${report.solver}${report.stagingVerified ? '' : ' (no ACME staging evidence for this provider)'}`,
    `Serves       ${report.consumers.map(({ environment, provider }) => `${environment} (${provider})`).join(', ')}`,
    `Listed       ${report.parentRefs.join(', ') || 'none'}`,
    `Inventory    ${report.desired.join(', ') || 'none'}`,
    ...(report.added.length ? [`Adds         ${report.added.join(', ')}`] : []),
    ...(report.removed.length ? [`Drops        ${report.removed.join(', ')} (gone)`] : []),
    ...report.excluded.map(({ ref, reason }) => `Excluded     ${ref}: ${reason}`),
    ...('changed' in report
      ? [
          report.changed
            ? report.applied
              ? 'Applied.'
              : 'Run again with --apply to make this change.'
            : 'Nothing to change.',
        ]
      : []),
  ].join('\n');

export default UnderpostTls;
