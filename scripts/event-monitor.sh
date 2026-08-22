#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-default}"
COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_NC='\033[0m'

echo -e "${COLOR_CYAN}=== 1. Active Probes Status (Prometheus Instant Query) ===${COLOR_NC}"
kubectl exec -n "$NAMESPACE" deployment/prometheus -c prometheus -- \
promtool query instant http://localhost:9090 'probe_success' || true

echo -e "\n${COLOR_CYAN}=== 2. Currently Firing Alerts ===${COLOR_NC}"
kubectl exec -n "$NAMESPACE" deployment/prometheus -c prometheus -- \
promtool query instant http://localhost:9090 'ALERTS{alertstate="firing"}' || true

echo -e "\n${COLOR_CYAN}=== 3. Blackbox Exporter Live Test (underpost.net) ===${COLOR_NC}"
kubectl get --raw "/api/v1/namespaces/$NAMESPACE/services/blackbox-exporter:9115/proxy/probe?module=http_2xx&target=https%3A%2F%2Funderpost.net%2F" | grep -E "probe_success|probe_http_status_code" || true

echo -e "\n${COLOR_CYAN}=== 4. Prometheus Logs (Rule Evaluation & Scraping) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=prometheus --tail=50 --all-containers=true

echo -e "\n${COLOR_CYAN}=== 5. Alertmanager Logs (Notifications & Dispatch) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=alertmanager --tail=50 --all-containers=true

echo -e "\n${COLOR_CYAN}=== 6. Blackbox Exporter Logs (ICMP/HTTP Probes Execution) ===${COLOR_NC}"
kubectl logs -n "$NAMESPACE" -l app=blackbox-exporter --tail=50 --all-containers=true

echo -e "\n${COLOR_GREEN}Done checking cluster monitoring state.${COLOR_NC}"