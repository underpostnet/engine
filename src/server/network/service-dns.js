/**
 * The DNS name of a Kubernetes Service in its cluster. Every module that names a Service of another
 * namespace uses this rule.
 * @module src/server/network/service-dns.js
 * @namespace ServiceDns
 */

/** The cluster domain of a cluster that sets no other: the kubelet default. */
const DEFAULT_CLUSTER_DOMAIN = 'cluster.local';

/**
 * The fully qualified name of a Service, of one member of its StatefulSet, or of either on a port.
 * @param {Object} params
 * @param {string} params.service - The Service; a headless Service names its StatefulSet members.
 * @param {string} params.namespace - The namespace of the Service.
 * @param {string} [params.clusterDomain] - The DNS domain of the cluster.
 * @param {string} [params.member] - One pod of the StatefulSet the headless Service governs: `mongodb-0`.
 * @param {number|string} [params.port] - A port the name carries: `<name>:<port>`.
 * @returns {string} `[<member>.]<service>.<namespace>.svc.<cluster domain>[:<port>]`.
 * @memberof ServiceDns
 */
const serviceDnsName = ({ service, namespace, clusterDomain = DEFAULT_CLUSTER_DOMAIN, member = '', port = '' }) =>
  `${member ? `${member}.` : ''}${service}.${namespace}.svc.${clusterDomain}${port ? `:${port}` : ''}`;

export { DEFAULT_CLUSTER_DOMAIN, serviceDnsName };
