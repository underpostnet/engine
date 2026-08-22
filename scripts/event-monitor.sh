#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-default}"
TARGET_URL="${TARGET_URL:-https://underpost.net/}"
ENVOY_NAMESPACE="${ENVOY_NAMESPACE:-envoy-gateway-system}"

COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_NC='\033[0m'

echo -e "${COLOR_CYAN}=== 1. Active Probes Status (Prometheus Instant Query) ===${COLOR_NC}"
kubectl exec -n "$NAMESPACE" deployment/prometheus -c prometheus -- \
promtool query instant http://localhost:9090 'probe_success' || true

echo -e "\n${COLOR_CYAN}=== 2. Currently Firing Alerts ===${COLOR_NC}"
kubectl exec -n "$NAMESPACE" deployment/prometheus -c prometheus -- \
promtool query instant http://localhost:9090 'ALERTS{alertstate="firing"}' || true

echo -e "\n${COLOR_CYAN}=== 3. Blackbox Exporter Live Test (${TARGET_URL}) ===${COLOR_NC}"
ENCODED_URL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TARGET_URL', safe=''))" 2>/dev/null || echo "https%3A%2F%2Funderpost.net%2F")
kubectl get --raw "/api/v1/namespaces/$NAMESPACE/services/blackbox-exporter:9115/proxy/probe?module=http_2xx&target=${ENCODED_URL}" | grep -E "probe_success|probe_http_status_code" || true

echo -e "\n${COLOR_CYAN}=== 4. Prometheus Logs (Rule Evaluation & Scraping) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=prometheus --tail=50 --all-containers=true

echo -e "\n${COLOR_CYAN}=== 5. Alertmanager Logs (Notifications & Dispatch) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=alertmanager --tail=50 --all-containers=true

echo -e "\n${COLOR_CYAN}=== 6. Blackbox Exporter Logs (ICMP/HTTP Probes Execution) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=blackbox-exporter --tail=50 --all-containers=true

echo -e "\n${COLOR_CYAN}=== 7. WireGuard Interface Status ===${COLOR_NC}"
if command -v wg &> /dev/null; then
    echo -e "${COLOR_YELLOW}[Host WireGuard Status]${COLOR_NC}"
    wg show || true
    
    echo -e "\n${COLOR_YELLOW}[WireGuard Systemd Services]${COLOR_NC}"
    systemctl list-units --type=service 'wg-quick*' --no-pager || true
else
    echo -e "${COLOR_YELLOW}'wg' CLI tool is not installed on the host.${COLOR_NC}"
fi

echo -e "\n${COLOR_CYAN}=== 8. Ingress & Gateway Diagnostics ===${COLOR_NC}"
if kubectl get ns "$ENVOY_NAMESPACE" &>/dev/null; then
    echo -e "${COLOR_YELLOW}[Targeting namespace: ${ENVOY_NAMESPACE}]${COLOR_NC}"
    kubectl get pods -n "$ENVOY_NAMESPACE" || true
else
    echo -e "${COLOR_YELLOW}[Namespace '${ENVOY_NAMESPACE}' not found. Searching cluster-wide for Ingress/Envoy resources...]${COLOR_NC}"
    kubectl get pods -A -l "app.kubernetes.io/name in (envoy-gateway, envoy, ingress-nginx, ingress)" 2>/dev/null || \
    kubectl get pods -A | grep -E "envoy|ingress|gateway" || true
fi

echo -e "\n${COLOR_GREEN}Done checking cluster monitoring state.${COLOR_NC}"