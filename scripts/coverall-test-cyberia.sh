#!/usr/bin/env bash
set -u -o pipefail

EXCLUDES=(
    --exclude="test/cluster-instances.test.js"
    --exclude="test/deploy-monitor.test.js"
    --exclude="test/deploy-node-placement.test.js"
    --exclude="test/instance-traffic-plan.test.js"
    --exclude="test/sops-secret-store.test.js"
    --exclude="test/underpost-gateway.test.js"
    --exclude="test/underpost-ingress.test.js"
    --exclude="test/wireguard-edge.test.js"
)

TESTS=(
    test/cyberia-instance-conf-defaults.test.js
    test/cyberia-load.test.js
    test/object-layer-item-id.test.js
    test/api.test.js
    test/crypto.test.js
    test/shape-generator.test.js
)

c8 "${EXCLUDES[@]}" mocha "${TESTS[@]}"
