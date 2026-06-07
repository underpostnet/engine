#!/usr/bin/env bash
#
# test-monitor.sh — end-to-end deploy + two-phase monitor smoke test.
#
# Two deployment shapes are supported (see
# src/client/public/nexodev/docs/references/Deploy-Monitor-PRD.md and
# 'Deploy custom instance to K8S.md'):
#
#   --mode runtime   `underpost start` deploy (e.g. dd-test). Monitored with the
#                    HTTP gate: /_internal/ready probes + port-forward status.
#   --mode instance  Custom instances from conf.instances.json (e.g. cyberia
#                    mmo-server / mmo-client). Monitored with the kubernetes gate
#                    (TCP readinessProbe) + exec status transport.
#
# Every variable in the DEFAULTS block below is overridable with a flag of the
# same name (--env, --deploy-id, …). Run with --help for the full list.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ENGINE_DIR"

# ─────────────────────────── DEFAULTS (all overridable) ───────────────────────────
MODE=runtime                                  # runtime | instance
ENV=development                               # development | production
DEPLOY_ID=dd-test                             # deploy id (instance mode: parent of conf.instances.json)
INSTANCE_IDS=                                 # instance mode: csv of ids (default: all in conf.instances.json)
IMAGE=underpost/wp:v3.2.14                    # runtime mode image (instance mode reads image from conf)
VERSIONS=green                                # csv of blue/green versions
REPLICAS=1                                    # replicas per deployment
NAMESPACE=default                             # k8s namespace
CLUSTER=                                      # kind | kubeadm | k3s | "" (auto/none)
TIMEOUT_RESPONSE=300000ms                     # HTTPProxy per-route response timeout
TEMPLATE_REPO=underpostnet/pwa-microservices-template-private  # runtime mode link repo
ENVOY_NAMESPACE=projectcontour                # ingress namespace (instance TLS exposure)
ENVOY_SERVICE=envoy                           # ingress service (instance TLS exposure)
HTTPS_PORT=443                                # local https port for instance TLS exposure

USE_CERT=false                                # runtime: pass --cert to the proxy step
USE_PULL_BUNDLE=false                         # runtime: include --pull-bundle in the start cmd
USE_TLS=false                                 # generate self-signed certs + expose over HTTPS
USE_TEST_REPO=false                           # runtime: publish src to engine-test-<id> + pod clones it (--private-test-repo)
DO_BUILD_TEMPLATE=true                        # run `node bin/build.template --update-private`
DO_CLUSTER_MANIFESTS=true                     # run `node bin run build-cluster-deployment-manifests`
DO_EXPOSE=true                                # expose locally after deploy + monitor

usage() {
  cat <<'EOF'
Usage: scripts/test-monitor.sh [flags]

Modes:
  --mode <runtime|instance>     Deployment shape to test (default: runtime)

Common (every default is overridable):
  --env <development|production>
  --deploy-id <id>
  --instance-ids <csv>          instance mode only; default = all ids in conf.instances.json
  --image <image>               runtime mode only
  --versions <csv>              e.g. green or blue,green
  --replicas <n>
  --namespace <ns>
  --cluster <kind|kubeadm|k3s|none>
  --timeout-response <dur>      e.g. 300000ms
  --template-repo <owner/repo>  runtime mode link repo
  --envoy-namespace <ns>        instance TLS exposure ingress namespace
  --envoy-service <name>        instance TLS exposure ingress service
  --https-port <port>           local https port for instance TLS exposure

Toggles (use --x / --no-x):
  --tls | --no-tls              self-signed certs + HTTPS exposure (default: off)
  --cert | --no-cert            runtime proxy --cert (default: off)
  --pull-bundle | --no-pull-bundle   runtime start --pull-bundle (default: off)
  --test-repo | --no-test-repo  runtime: publish src to engine-test-<id> and have the
                                pod clone it via --private-test-repo (default: off)
  --expose | --no-expose        local exposure after monitor (default: on)
  --build-template | --no-build-template       sync private template (default: on)
  --cluster-manifests | --no-cluster-manifests  rebuild cluster manifests (default: on)

  -h, --help

Examples:
  # Runtime deploy (default), no TLS
  scripts/test-monitor.sh

  # Runtime deploy over HTTPS
  scripts/test-monitor.sh --tls

  # Runtime deploy from a work-in-progress test source repo (engine-test-<id>)
  scripts/test-monitor.sh --test-repo

  # Cyberia instances (both), dev on kind, no TLS
  scripts/test-monitor.sh --mode instance --deploy-id dd-cyberia --cluster kind

  # Only the mmo-server instance, production, over HTTPS
  scripts/test-monitor.sh --mode instance --deploy-id dd-cyberia \
    --instance-ids mmo-server --env production --cluster kubeadm --tls
EOF
}

# ─────────────────────────── flag parsing ───────────────────────────
# Supports `--key value` and `--key=value` for value flags, plus --x/--no-x toggles.
needval() { [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) needval "$@"; MODE="$2"; shift 2;;            --mode=*) MODE="${1#*=}"; shift;;
    --env) needval "$@"; ENV="$2"; shift 2;;              --env=*) ENV="${1#*=}"; shift;;
    --deploy-id) needval "$@"; DEPLOY_ID="$2"; shift 2;;  --deploy-id=*) DEPLOY_ID="${1#*=}"; shift;;
    --instance-ids) needval "$@"; INSTANCE_IDS="$2"; shift 2;; --instance-ids=*) INSTANCE_IDS="${1#*=}"; shift;;
    --image) needval "$@"; IMAGE="$2"; shift 2;;          --image=*) IMAGE="${1#*=}"; shift;;
    --versions) needval "$@"; VERSIONS="$2"; shift 2;;    --versions=*) VERSIONS="${1#*=}"; shift;;
    --replicas) needval "$@"; REPLICAS="$2"; shift 2;;    --replicas=*) REPLICAS="${1#*=}"; shift;;
    --namespace) needval "$@"; NAMESPACE="$2"; shift 2;;  --namespace=*) NAMESPACE="${1#*=}"; shift;;
    --cluster) needval "$@"; CLUSTER="$2"; shift 2;;      --cluster=*) CLUSTER="${1#*=}"; shift;;
    --timeout-response) needval "$@"; TIMEOUT_RESPONSE="$2"; shift 2;; --timeout-response=*) TIMEOUT_RESPONSE="${1#*=}"; shift;;
    --template-repo) needval "$@"; TEMPLATE_REPO="$2"; shift 2;; --template-repo=*) TEMPLATE_REPO="${1#*=}"; shift;;
    --envoy-namespace) needval "$@"; ENVOY_NAMESPACE="$2"; shift 2;; --envoy-namespace=*) ENVOY_NAMESPACE="${1#*=}"; shift;;
    --envoy-service) needval "$@"; ENVOY_SERVICE="$2"; shift 2;; --envoy-service=*) ENVOY_SERVICE="${1#*=}"; shift;;
    --https-port) needval "$@"; HTTPS_PORT="$2"; shift 2;; --https-port=*) HTTPS_PORT="${1#*=}"; shift;;
    --tls) USE_TLS=true; shift;;                          --no-tls) USE_TLS=false; shift;;
    --cert) USE_CERT=true; shift;;                        --no-cert) USE_CERT=false; shift;;
    --pull-bundle) USE_PULL_BUNDLE=true; shift;;          --no-pull-bundle) USE_PULL_BUNDLE=false; shift;;
    --test-repo) USE_TEST_REPO=true; shift;;              --no-test-repo) USE_TEST_REPO=false; shift;;
    --expose) DO_EXPOSE=true; shift;;                     --no-expose) DO_EXPOSE=false; shift;;
    --build-template) DO_BUILD_TEMPLATE=true; shift;;     --no-build-template) DO_BUILD_TEMPLATE=false; shift;;
    --cluster-manifests) DO_CLUSTER_MANIFESTS=true; shift;; --no-cluster-manifests) DO_CLUSTER_MANIFESTS=false; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1;;
  esac
done

# ─────────────────────────── derived flags ───────────────────────────
CLUSTER_FLAG=""
case "$CLUSTER" in
  kind)    CLUSTER_FLAG="--kind";;
  kubeadm) CLUSTER_FLAG="--kubeadm";;
  k3s)     CLUSTER_FLAG="--k3s";;
  ""|none) CLUSTER_FLAG="";;
  *) echo "Unknown --cluster: $CLUSTER (expected kind|kubeadm|k3s|none)" >&2; exit 1;;
esac
DEV_FLAG=""; [ "$ENV" = development ] && DEV_FLAG="--dev"
INSTANCES_CONF="./engine-private/conf/${DEPLOY_ID}/conf.instances.json"
SERVER_CONF="./engine-private/conf/${DEPLOY_ID}/conf.server.json"

echo "[test-monitor] mode=$MODE env=$ENV deploy=$DEPLOY_ID cluster=${CLUSTER:-none} tls=$USE_TLS test-repo=$USE_TEST_REPO expose=$DO_EXPOSE"

# ─────────────────────────── shared helpers ───────────────────────────

# setup_tls_secrets <host> [<host> …] — regenerate self-signed certs and create
# the per-host k8s TLS secret the HTTPProxy references (name == host).
setup_tls_secrets() {
  local ssl_base="${ENGINE_DIR}/engine-private/ssl"
  for host in "$@"; do
    local cert_dir="${ssl_base}/${host}"
    mkdir -p "$cert_dir"
    bash "${SCRIPT_DIR}/ssl.sh" "$cert_dir" "$host"
    local name_safe="${host//[^a-zA-Z0-9_.-]/_}"
    kubectl delete secret "$host" -n "$NAMESPACE" --ignore-not-found
    kubectl create secret tls "$host" \
      --cert="${cert_dir}/${name_safe}.pem" \
      --key="${cert_dir}/${name_safe}-key.pem" \
      -n "$NAMESPACE"
  done
}

# hosts_from <conf.json> — unique hosts declared in a conf.server.json or conf.instances.json.
hosts_from() {
  node -e "
    const c = require('$1');
    const hosts = Array.isArray(c) ? c.map(i => i.host) : Object.keys(c);
    console.log([...new Set(hosts)].join(' '));
  "
}

# ─────────────────────────── pre-steps ───────────────────────────
[ "$DO_CLUSTER_MANIFESTS" = true ] && node bin run build-cluster-deployment-manifests
[ "$DO_BUILD_TEMPLATE" = true ] && node bin/build.template --update-private

# ─────────────────────────── runtime mode ───────────────────────────
run_runtime_mode() {
  local link_cmd="cd /home/dd,underpost clone ${TEMPLATE_REPO},cd /home/dd/${TEMPLATE_REPO##*/},npm install,npm link"
  local deploy_cmd proxy_flag="" expose_flags="" start_flags=""

  # Publish the local engine src to underpostnet/engine-test-<id> so the pod
  # (started with --private-test-repo) clones this work-in-progress source.
  [ "$USE_TEST_REPO" = true ] && node bin/build "$DEPLOY_ID" --update-private

  [ "$USE_PULL_BUNDLE" = true ] && start_flags="${start_flags} --pull-bundle"
  [ "$USE_TEST_REPO" = true ] && start_flags="${start_flags} --private-test-repo"
  deploy_cmd="${link_cmd},underpost start --build --run${start_flags} ${DEPLOY_ID} ${ENV}"

  [ "$USE_CERT" = true ] && proxy_flag="--cert"
  [ "$USE_TLS" = true ] && proxy_flag="--self-signed"

  node bin deploy "$DEPLOY_ID" "$ENV" $CLUSTER_FLAG --sync --build-manifest \
    --image "$IMAGE" --timeout-response "$TIMEOUT_RESPONSE" --versions "$VERSIONS" --replicas "$REPLICAS" --cmd "$deploy_cmd"
  node bin deploy "$DEPLOY_ID" "$ENV" $CLUSTER_FLAG --disable-update-proxy $proxy_flag
  node bin monitor "$DEPLOY_ID" "$ENV" --ready-deployment --promote \
    --timeout-response "$TIMEOUT_RESPONSE" --versions "$VERSIONS" --replicas "$REPLICAS"

  node bin run etc-hosts --deploy-id "$DEPLOY_ID"

  if [ "$USE_TLS" = true ]; then
    setup_tls_secrets $(hosts_from "$SERVER_CONF")
    expose_flags="--tls"
  fi
  [ "$DO_EXPOSE" = true ] && node bin deploy --expose --local-proxy "$DEPLOY_ID" "$ENV" $expose_flags
}

# ─────────────────────────── instance mode ───────────────────────────
run_instance_mode() {
  [ -f "$INSTANCES_CONF" ] || { echo "Missing $INSTANCES_CONF" >&2; exit 1; }
  if [ -z "$INSTANCE_IDS" ]; then
    INSTANCE_IDS=$(node -e "console.log(require('$INSTANCES_CONF').map(i=>i.id).join(','))")
  fi
  local tls_flag=""; [ "$USE_TLS" = true ] && tls_flag="--tls --test"

  # `run instance` builds/pulls the image, applies the manifest, monitors with the
  # kubernetes gate (TCP readinessProbe) + exec status, then promotes traffic.
  IFS=',' read -ra ids <<< "$INSTANCE_IDS"
  for id in "${ids[@]}"; do
    [ -n "$id" ] || continue
    echo "[test-monitor] deploying instance ${DEPLOY_ID},${id}"
    node bin run instance "${DEPLOY_ID},${id},${REPLICAS}" \
      $DEV_FLAG $CLUSTER_FLAG --namespace "$NAMESPACE" --etc-hosts $tls_flag \
      ${IMAGE:+--image-name "$IMAGE"}
  done

  [ "$DO_EXPOSE" = true ] || return 0
  if [ "$USE_TLS" = true ]; then
    # Instances are routed by the Contour ingress; port-forward Envoy so the
    # HTTPProxy host routing (server/client.cyberiaonline.com) works locally.
    echo "[test-monitor] exposing HTTPS via ${ENVOY_NAMESPACE}/${ENVOY_SERVICE} on :${HTTPS_PORT}"
    sudo kubectl port-forward -n "$ENVOY_NAMESPACE" "svc/${ENVOY_SERVICE}" "${HTTPS_PORT}:443" &
  else
    # Plain HTTP: port-forward each instance service port directly.
    for id in "${ids[@]}"; do
      [ -n "$id" ] || continue
      node bin deploy --expose "${DEPLOY_ID}-${id}" "$ENV" --namespace "$NAMESPACE" || true
    done
  fi
}

case "$MODE" in
  runtime)  run_runtime_mode;;
  instance) run_instance_mode;;
  *) echo "Unknown --mode: $MODE (expected runtime|instance)" >&2; exit 1;;
esac

echo "[test-monitor] done (mode=$MODE tls=$USE_TLS)"
