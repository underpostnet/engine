
#!/usr/bin/env bash
set -euo pipefail

ENV=development
DEPLOY_ID=dd-test
IMAGE=underpost/wp:v3.2.14
USE_CERT=false           # Set to true to use --cert, false to use --disable-update-proxy
USE_PULL_BUNDLE=false     # Set to true to include --pull-bundle in start command, false to omit it
VERSIONS=green

# Optional to concat in link cmd:
# underpost secret underpost --create-from-env

LINK_CMD="cd /home/dd,underpost clone underpostnet/pwa-microservices-template-private,cd /home/dd/pwa-microservices-template-private,npm install,npm link"
PROXY_FLAG=""
CLUSTER_FLAG=""

node bin run build-cluster-deployment-manifests
node bin/build.template --update-private

if [ "$USE_PULL_BUNDLE" = true ]; then
    DEPLOY_CMD="$LINK_CMD,underpost start --build --run --pull-bundle $DEPLOY_ID $ENV"
else
    DEPLOY_CMD="$LINK_CMD,underpost start --build --run $DEPLOY_ID $ENV"
fi

if [ "$USE_CERT" = true ]; then
    PROXY_FLAG="--cert"
fi

node bin deploy $DEPLOY_ID $ENV $CLUSTER_FLAG --sync --build-manifest --image $IMAGE --timeout-response 300000ms --versions $VERSIONS --replicas 1 --cmd "$DEPLOY_CMD"
node bin deploy $DEPLOY_ID $ENV $CLUSTER_FLAG --disable-update-proxy $PROXY_FLAG
node bin monitor $DEPLOY_ID $ENV --ready-deployment --promote --timeout-response 300000ms --versions $VERSIONS --replicas 1
