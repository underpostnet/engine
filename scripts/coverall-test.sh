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
    test/cluster-instances.test.js
    test/deploy-monitor.test.js
    test/deploy-node-placement.test.js
    test/instance-traffic-plan.test.js
    test/sops-secret-store.test.js
    test/underpost-gateway.test.js
    test/underpost-ingress.test.js
    test/wireguard-edge.test.js
)

c8 "${EXCLUDES[@]}" mocha "${TESTS[@]}"