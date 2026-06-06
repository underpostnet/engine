
#!/usr/bin/env bash
set -euo pipefail

ENV=development
DEPLOY_ID=dd-test
IMAGE=underpost/wp:v3.2.14
USE_CERT=false           # Set to true to use --cert, false to use --disable-update-proxy
USE_PULL_BUNDLE=false     # Set to true to include --pull-bundle in start command, false to omit it
USE_TLS=false            # Set to true to generate self-signed certs and expose via HTTPS
VERSIONS=green

# Parse --tls flag from script arguments
for arg in "$@"; do
    case $arg in
        --tls) USE_TLS=true ;;
    esac
done

# Optional to concat in link cmd:
# underpost secret underpost --create-from-env

LINK_CMD="cd /home/dd,underpost clone underpostnet/pwa-microservices-template-private,cd /home/dd/pwa-microservices-template-private,npm install,npm link"
PROXY_FLAG=""
CLUSTER_FLAG=""
EXPOSE_FLAGS=""

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

if [ "$USE_TLS" = true ]; then
    PROXY_FLAG="--self-signed"
fi

node bin deploy $DEPLOY_ID $ENV $CLUSTER_FLAG --sync --build-manifest --image $IMAGE --timeout-response 300000ms --versions $VERSIONS --replicas 1 --cmd "$DEPLOY_CMD"
node bin deploy $DEPLOY_ID $ENV $CLUSTER_FLAG --disable-update-proxy $PROXY_FLAG
node bin monitor $DEPLOY_ID $ENV --ready-deployment --promote --timeout-response 300000ms --versions $VERSIONS --replicas 1

node bin run etc-hosts --deploy-id $DEPLOY_ID

# Generate self-signed TLS certs and create k8s TLS secrets for all hosts
if [ "$USE_TLS" = true ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ENGINE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
    SSL_BASE="${ENGINE_DIR}/engine-private/ssl"
    NAMESPACE=default
    
    # Extract hosts from conf.server.json
    HOSTS=$(node -e "
      const conf = require('./engine-private/conf/${DEPLOY_ID}/conf.server.json');
      console.log(Object.keys(conf).join(' '));
    ")
    
    for HOST in $HOSTS; do
        CERT_DIR="${SSL_BASE}/${HOST}"
        mkdir -p "$CERT_DIR"
        
        # Regenerate self-signed cert (idempotent — overwrites existing files)
        bash "${SCRIPT_DIR}/ssl.sh" "$CERT_DIR" "$HOST"
        
        NAME_SAFE="${HOST//[^a-zA-Z0-9_.-]/_}"
        CERT_FILE="${CERT_DIR}/${NAME_SAFE}.pem"
        KEY_FILE="${CERT_DIR}/${NAME_SAFE}-key.pem"
        
        # Create / replace k8s TLS secret (name matches host, as referenced by HTTPProxy)
        kubectl delete secret "$HOST" -n "$NAMESPACE" --ignore-not-found
        kubectl create secret tls "$HOST" \
        --cert="$CERT_FILE" \
        --key="$KEY_FILE" \
        -n "$NAMESPACE"
    done
    
    EXPOSE_FLAGS="--tls"
fi

node bin deploy --expose --local-proxy $DEPLOY_ID $ENV $EXPOSE_FLAGS
