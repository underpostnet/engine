#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/github-actions-logging.sh"
source "$SCRIPT_DIR/../lib/host.sh"

DEPLOY_ID=dd-cyberia
DEPLOY_ENV="${DEPLOY_ENV:-production}"
TARGET_NODE="${TARGET_NODE:-$HOST_NODE}"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-underpost/engine-cyberia:latest}"
# The source the pod bootstraps from, and the private configuration each side reads: the host
# takes the monorepo conf, the pod takes this deploy's own conf repository.
ENGINE_SRC_REPO="${ENGINE_SRC_REPO:-underpostnet/engine-test-cyberia}"
ENGINE_SRC_PRIVATE_REPO="${ENGINE_SRC_PRIVATE_REPO:-underpostnet/engine-private}"
POD_SRC_PRIVATE_REPO="${POD_SRC_PRIVATE_REPO:-underpostnet/engine-cyberia-private}"

CYBERIA_ASSETS=src/client/public/cyberia
UNDERPOST_ASSETS=src/client/public/underpost

# Bundle mode: the host builds the client once and uploads the zip parts, and the pod restores
# that artifact instead of compiling the client itself. Set BUNDLE_MODE=0 to have the pod build
# from source, which is the behaviour this script had before bundle mode existed.
BUNDLE_MODE="${BUNDLE_MODE:-1}"
BUNDLE_SPLIT="${BUNDLE_SPLIT:-8}"
# Where push-bundle records the uploaded keys, relative to a conf checkout root.
BUNDLE_MANIFEST_PATH="conf/$DEPLOY_ID/storage.bundle.json"
# `mv` into a directory that already exists nests the checkout inside it rather than replacing
# it, and the pod would then load whatever conf the image carried.
POD_SRC_PRIVATE_DIR="${POD_SRC_PRIVATE_REPO##*/}"
# Sibling of the engine checkout, so the publish work tree is never part of it.
POD_PRIVATE_CHECKOUT="../$POD_SRC_PRIVATE_DIR"

main() {
    deploy_start "Starting remote sync and deploy"

    prepare_host "$ENGINE_ROOT"

    deploy_step "Clean cyberia public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run clean $CYBERIA_ASSETS"

    deploy_step "Clean underpost public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run clean $UNDERPOST_ASSETS"

    deploy_step "Initialize cyberia assets repository" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt $CYBERIA_ASSETS --init-repo"

    deploy_step "Initialize underpost assets repository" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin cmt $UNDERPOST_ASSETS --init-repo"

    deploy_step "Pull cyberia public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs $CYBERIA_ASSETS \
          --deploy-id $DEPLOY_ID \
          --pull \
          --tracked"

    deploy_step "Pull underpost public assets" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin fs $UNDERPOST_ASSETS \
          --deploy-id $DEPLOY_ID \
          --pull \
          --tracked \
          --storage-id underpost"

    if [ "$(has_changes $CYBERIA_ASSETS "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit cyberia public assets" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && git -C $CYBERIA_ASSETS add . && node bin cmt $CYBERIA_ASSETS feat 'Update cyberia public assets'"
    fi

    if [ "$(has_changes $UNDERPOST_ASSETS "$ENGINE_ROOT")" = "1" ]; then
        deploy_step "Commit underpost public assets" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && git -C $UNDERPOST_ASSETS add . && node bin cmt $UNDERPOST_ASSETS feat 'Update underpost public assets'"
    fi


    deploy_step "Reinstall dependencies" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && npm install"

    deploy_step "Install $DEPLOY_ID catalog dependencies" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin package $DEPLOY_ID --install"

    deploy_step "Clean build artifacts" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run clean"

    deploy_step "Load $DEPLOY_ID $DEPLOY_ENV environment" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID"

    deploy_step "Build cyberia manifests" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin/cyberia run-workflow build-manifest"

    # Follows the manifest step: the client renders from the conf.ssr.json that build-manifest
    # writes, so a bundle pushed before it would ship the previous SSR views. The uploaded keys
    # are recorded in engine-private/conf/$DEPLOY_ID/storage.bundle.json, which the pod reads
    # back through its own conf repository.
    if [ "$BUNDLE_MODE" = "1" ]; then
        deploy_step "Push $DEPLOY_ID client bundle" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && node bin run push-bundle \
              --deploy-id $DEPLOY_ID \
              --split $BUNDLE_SPLIT"

        # push-bundle records the keys in the host's own conf checkout, but the pod replaces
        # ./engine-private with a clone of its conf repository — so the manifest is published
        # there too, or the pod reads an empty one and restores nothing. Cloning from the engine
        # root keeps `underpost clone` reading this checkout's credentials, and the work tree is
        # then moved out so it is never part of the engine checkout.
        deploy_step "Stage $DEPLOY_ID bundle manifest" \
            sudo -n -- /bin/bash -lc \
            "cd $ENGINE_ROOT && rm -rf $POD_PRIVATE_CHECKOUT \
              && node bin clone $POD_SRC_PRIVATE_REPO \
              && mv ./$POD_SRC_PRIVATE_DIR $POD_PRIVATE_CHECKOUT \
              && mkdir -p $POD_PRIVATE_CHECKOUT/conf/$DEPLOY_ID \
              && cp ./engine-private/$BUNDLE_MANIFEST_PATH $POD_PRIVATE_CHECKOUT/$BUNDLE_MANIFEST_PATH"

        # A rerun that uploads the same keys leaves the manifest byte-identical, and committing
        # nothing fails the step.
        if [ "$(has_changes $POD_PRIVATE_CHECKOUT "$ENGINE_ROOT")" = "1" ]; then
            deploy_step "Publish $DEPLOY_ID bundle manifest" \
                sudo -n -- /bin/bash -lc \
                "cd $ENGINE_ROOT && node bin cmt $POD_PRIVATE_CHECKOUT feat 'Update $DEPLOY_ID bundle manifest' \
                  && node bin push $POD_PRIVATE_CHECKOUT $POD_SRC_PRIVATE_REPO"
        fi
    fi

    # Two commands, one bootstrap: `pod_bootstrap_cmd` replaces the image's engine with this
    # deploy's source and repoints the global bin at it — without that, the first step needing
    # the current CLI answered `unknown command 'app'`. `start --build` then owns the rest
    # (dependencies, `app load`, client bundle), while `--skip-pull-repo-base` and
    # `--skip-pull-private-repo` tell it the source and the conf are already in place, so each is
    # fetched exactly once. The conf is cloned here rather than left to `--build` because the
    # steps below it — `app load` and every `bin/cyberia` import — read that conf first.
    local pod_cmd
    # In bundle mode `--pull-bundle` replaces the pod's client build with a download of the
    # artifact the host just pushed; without it `--build` compiles the client in the pod.
    local start_flags="--build --run --skip-pull-repo-base --skip-pull-private-repo"
    if [ "$BUNDLE_MODE" = "1" ]; then
        start_flags="$start_flags --pull-bundle"
    fi
    pod_cmd="$(pod_bootstrap_cmd $DEPLOY_ID $DEPLOY_ENV "$ENGINE_SRC_REPO"), \
        underpost clone ${POD_SRC_PRIVATE_REPO}, \
        sudo rm -rf ./engine-private, \
        sudo mv ./${POD_SRC_PRIVATE_DIR} ./engine-private, \
        underpost app load --env $DEPLOY_ENV --args deploy-id=$DEPLOY_ID, \
        node bin/cyberia ol --drop --env-path .env, \
        node bin/cyberia run-workflow drop-db --env-path .env, \
        node bin/cyberia instance amethyst-strata-expansion --import --env-path .env, \
        node bin/cyberia instance FOREST --import --env-path .env, \
        node bin/cyberia instance TEST --import --env-path .env, \
        underpost start $DEPLOY_ID $DEPLOY_ENV $start_flags"

    deploy_step "Sync $DEPLOY_ID cluster" \
        sudo -n -- /bin/bash -lc \
        "cd $ENGINE_ROOT && node bin run sync \
          --deploy-id $DEPLOY_ID \
          --replicas 1 \
          --image '${DEPLOY_IMAGE}' \
          --kubeadm \
          --deploy-id-cron-jobs none \
          --timeout-response 10000ms \
          ${TARGET_NODE:+--node-name ${TARGET_NODE}} \
          --gateway-api \
          --ingress-node ${INGRESS_NODE} \
          --ssh-key-path ${DEPLOY_SSH_KEY_PATH} \
          --image-pull-policy Always \
          --cmd '${pod_cmd}'"
}

main "$@"
