#!/usr/bin/env bash
set -u -o pipefail

EXCLUDES=(
    --exclude="test/cyberia-instance-conf-defaults.test.js"
    --exclude="test/cyberia-load.test.js"
    --exclude="test/object-layer-item-id.test.js"
    --exclude="test/api.test.js"
    --exclude="test/crypto.test.js"
    --exclude="test/shape-generator.test.js"
)

TESTS=(
    # --- LAYER 1: Base System & OS Security ---
    # System security policies, base OS services, and secret management.
    test/selinux.test.js
    test/systemd-service.test.js
    test/sops-secret-store.test.js
    
    # --- LAYER 2: Core Networking ---
    # Secure edge connectivity and networking tunnels required for cluster communication.
    test/wireguard-edge.test.js
    
    # --- LAYER 3: Compute & Cluster Provisioning ---
    # Instance clustering, node assignment, and compute scheduling.
    test/cluster-instances.test.js
    test/deploy-node-placement.test.js
    
    # --- LAYER 4: Ingress, Gateways & Traffic Routing ---
    # Ingress controllers, API gateways, deployment routes, and traffic management.
    test/underpost-gateway.test.js
    test/underpost-ingress.test.js
    test/deploy-routes.test.js
    test/instance-traffic-plan.test.js
    
    # --- LAYER 5: Monitoring, Observability & Remediation ---
    # System health tracking, monitoring deployments, event notifications, and auto-healing.
    test/monitoring-stack.test.js
    test/deploy-monitor.test.js
    test/event-notification.test.js
    test/event-remediation.test.js
)
c8 "${EXCLUDES[@]}" mocha "${TESTS[@]}"