#!/usr/bin/env bash
# gen-fqdns.sh - generate a readable plain table with FQDNs for all services and pods in the cluster

set -euo pipefail

CLUSTER_DOMAIN="${CLUSTER_DOMAIN:-cluster.local}"

# Services: <service>.<namespace>.svc.<cluster-domain>
kubectl get svc --all-namespaces -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name --no-headers \
  | awk -v cd="$CLUSTER_DOMAIN" '{printf "%-20s %-34s %-6s %s.%s.svc.%s\n", $1, $2, "svc", $2, $1, cd}'

# Pods: <pod>.<namespace>.pod.<cluster-domain>
kubectl get pods --all-namespaces -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name --no-headers \
  | awk -v cd="$CLUSTER_DOMAIN" '{printf "%-20s %-34s %-6s %s.%s.pod.%s\n", $1, $2, "pod", $2, $1, cd}'
