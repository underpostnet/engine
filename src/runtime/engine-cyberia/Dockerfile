# syntax=docker/dockerfile:1.7
#
# engine-cyberia — PRODUCTION image (underpost/engine-cyberia).
#
# Secure multi-stage build. The dd-cyberia deploy is assembled from a PRIVATE
# GitHub repository at build time, but the published image is PUBLIC, so no
# credential, token, private-repo VCS metadata, cache, or temp artifact may
# survive into the final stage. See Dockerfile.dev for the full security
# rationale — this file is the production counterpart (NODE_ENV=production).

# ---------------------------------------------------------------------------
# Stage 1 — builder: clone the private deploy, build it, then scrub secrets.
# ---------------------------------------------------------------------------
FROM rockylinux/rockylinux:9 AS builder
ARG UNDERPOST_VERSION=3.2.30
# Pin Node to an exact patch: dnf's nodejs:24 module lags (24.14.1) while
# underpost's dependencies require >=24.15.0, so install the official binary.
ARG NODE_VERSION=24.15.0
ENV NODE_ENV=production

RUN set -eux; \
    # `sudo` is required because underpost's build steps shell out to
    # `sudo cp`/`sudo rm` (src/server/start.js); the build runs as root so sudo
    # is just a passthrough, but the binary must exist.
    dnf install -y git openssl tar xz sudo; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) node_arch=x64 ;; \
      aarch64) node_arch=arm64 ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1; \
    node --version; npm --version; \
    npm install -g underpost@${UNDERPOST_VERSION}; \
    dnf clean all; rm -rf /var/cache/dnf; \
    npm cache clean --force

WORKDIR /home/dd

# Single hermetic RUN: GitHub credentials are mounted as secrets (readable only
# here, never persisted), used to clone + build the private dd-cyberia deploy,
# then every credential/secret/VCS trace is removed BEFORE this layer commits.
RUN --mount=type=secret,id=github_token \
    --mount=type=secret,id=github_username \
    --mount=type=secret,id=cloudinary_cloud_name \
    --mount=type=secret,id=cloudinary_api_key \
    --mount=type=secret,id=cloudinary_api_secret \
    set -eu; \
    export GITHUB_TOKEN="$(cat /run/secrets/github_token)"; \
    export GITHUB_USERNAME="$(cat /run/secrets/github_username)"; \
    # Cloudinary creds power the `node bin fs --pull` asset downloads below; they
    # are optional (empty when not provided) so builds that don't need assets
    # still work.
    export CLOUDINARY_CLOUD_NAME="$(cat /run/secrets/cloudinary_cloud_name 2>/dev/null || true)"; \
    export CLOUDINARY_API_KEY="$(cat /run/secrets/cloudinary_api_key 2>/dev/null || true)"; \
    export CLOUDINARY_API_SECRET="$(cat /run/secrets/cloudinary_api_secret 2>/dev/null || true)"; \
    \
    # --- fetch sources under our control, then build WITHOUT itc-scripts -----
    # itc-scripts are DEPLOY-time provisioning; the DB-seeding parts (`cyberia
    # ol --drop`, `instance --import`) and the in-cluster .env rewrite cannot run
    # in a hermetic build, so we strip the scripts and replay ONLY the build-safe
    # provisioning steps inline (asset pulls, ffmpeg, hardhat deps, cyberia-server
    # clone). Pre-clone so privateEngineRepoFactory no-ops and --skip-pull-base
    # reuses the tree.
    cd /home/dd; \
    underpost clone "$GITHUB_USERNAME/engine-cyberia"; \
    mkdir -p /home/dd/engine; \
    cp -a ./engine-cyberia/. /home/dd/engine/; \
    rm -rf ./engine-cyberia; \
    cd /home/dd/engine; \
    rm -rf ./engine-private; \
    underpost clone "$GITHUB_USERNAME/engine-cyberia-private"; \
    mv ./engine-cyberia-private ./engine-private; \
    rm -rf ./engine-private/itc-scripts; \
    \
    # --- install deps + env, then replay build-safe itc provisioning ----------
    npm install; \
    node bin env dd-cyberia production; \
    node bin fs --pull --recursive --deploy-id dd-cyberia --storage-file-path './engine-private/conf/dd-cyberia/storage.engine-cyberia.json'; \
    ( cd /home/dd/engine/hardhat && npm install --include=dev ); \
    ( cd /home/dd/engine && underpost clone underpostnet/cyberia-server ); \
    \
    # --- build the client bundle (assets are now in place) --------------------
    node bin client dd-cyberia; \
    \
    # --- bake NON-secret env (placeholders; real creds come from runtime env) -
    CONF=/home/dd/engine/engine-private/conf/dd-cyberia; \
    cp -a "$CONF/docker-compose/cyberia/compose.env" "$CONF/.env.development"; \
    cp -a "$CONF/docker-compose/cyberia/compose.env" "$CONF/.env.production"; \
    cp -a "$CONF/docker-compose/cyberia/compose.env" "$CONF/.env.test"; \
    cp -a "$CONF/docker-compose/cyberia/compose.env" /home/dd/engine/.env; \
    \
    # --- drop build-only / non-runtime private material ----------------------
    rm -rf /home/dd/engine/engine-private/itc-scripts "$CONF/build" "$CONF/instances"; \
    \
    # --- CREDENTIAL SCRUB (defense in depth, while secrets are still in scope) -
    # 1) Redact every real secret value from any file it may have reached.
    for _secret in "$GITHUB_TOKEN" "$CLOUDINARY_API_SECRET" "$CLOUDINARY_API_KEY"; do \
      [ -n "$_secret" ] || continue; \
      grep -rlF --exclude-dir=node_modules --exclude-dir=.git "$_secret" /home/dd/engine 2>/dev/null \
        | xargs -r sed -i "s#${_secret}#__REDACTED__#g" || true; \
    done; \
    unset GITHUB_TOKEN GITHUB_USERNAME CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; \
    # 2) Every .git dir — clone URLs embed the token in .git/config, and the
    #    private history itself must not ship.
    find /home/dd/engine -type d -name .git -prune -exec rm -rf {} + 2>/dev/null || true; \
    # 3) User-level credential stores possibly written during the build.
    rm -rf /root/.gitconfig /root/.git-credentials /root/.config/git \
           /root/.netrc /root/.ssh /root/.npm /root/.cache /root/.node-gyp; \
    # 4) The underpost global env store may hold GITHUB_TOKEN.
    rm -f "$(underpost root)/underpost/.env" 2>/dev/null || true; \
    # 5) Build caches, temp, and build-only toolchains. hardhat is contract
    #    build/CLI tooling (used only to build the coverage docs above); the
    #    runtime server never imports it, so its dev node_modules is pure bloat.
    npm cache clean --force 2>/dev/null || true; \
    rm -rf /home/dd/engine/hardhat/node_modules \
           /home/dd/engine/.npm /tmp/* /var/tmp/* /var/cache/dnf

# ---------------------------------------------------------------------------
# Stage 2 — runtime: clean base + pinned Node toolchain + scrubbed app tree.
# ---------------------------------------------------------------------------
FROM rockylinux/rockylinux:9 AS runtime
ENV NODE_ENV=production

# Node + npm + the underpost CLI (exact pinned version) from the builder — no
# re-download, no git/build toolchain. libstdc++ is the only runtime lib the
# prebuilt Node binary needs beyond the base image.
COPY --from=builder /usr/local/ /usr/local/
RUN dnf install -y libstdc++ git && dnf clean all && rm -rf /var/cache/dnf && \
    useradd --create-home --home-dir /home/dd --shell /usr/sbin/nologin dd && \
    # underpost persists its global env at $(npm root -g)/underpost/.env; the
    # non-root runtime user must be able to write it (fixes EACCES on start).
    chown -R dd:dd /usr/local/lib/node_modules/underpost

# Copy ONLY the scrubbed runtime tree — no .git, no token, no caches.
COPY --from=builder --chown=dd:dd /home/dd/engine /home/dd/engine

RUN chmod +x /home/dd/engine/scripts/rpmfusion-ffmpeg-setup.sh && \
    /home/dd/engine/scripts/rpmfusion-ffmpeg-setup.sh

USER dd
WORKDIR /home/dd/engine

EXPOSE 3005
EXPOSE 50051

CMD ["/bin/sh", "-c", "underpost start --run dd-cyberia production"]