# syntax=docker/dockerfile:1.7
#
# engine-cyberia — PRODUCTION image (underpost/engine-cyberia).
#
# ---------------------------------------------------------------------------
# Stage 1 — builder: clone the private deploy, build it, then scrub secrets.
# ---------------------------------------------------------------------------
FROM rockylinux/rockylinux:9 AS builder
ARG UNDERPOST_VERSION=3.3.73
# Pin Node to an exact patch: dnf's nodejs:24 module lags (24.14.1) while
# underpost's dependencies require >=24.15.0, so install the official binary.
ARG NODE_VERSION=24.15.0
ENV NODE_ENV=production

RUN set -eux; \
    # `sudo` is required because underpost's build steps shell out to
    # `sudo cp`/`sudo rm` (src/server/runtime/start.js); the build runs as root so sudo
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
    dnf clean all; rm -rf /var/cache/dnf; \
    npm cache clean --force


# The builder's own `underpost clone` calls below run on this same CLI, and the runtime stage
# inherits it through `COPY --from=builder /usr/local/`.
COPY underpost-cli.tgz /tmp/underpost-cli.tgz
RUN set -eux; \
    npm install -g /tmp/underpost-cli.tgz --omit=dev; \
    rm -f /tmp/underpost-cli.tgz; \
    npm cache clean --force; \
    underpost --version; \
    # The staged package must be the pinned release: a drift here would ship a CLI the
    # deployment manifests were not built against.
    underpost --version | grep -Fq "${UNDERPOST_VERSION}"

WORKDIR /home/dd

# Comma-separated instance codes to provision (backup dir + optional saga).
# `node bin/cyberia run-workflow build-manifest` rewrites this default from the
# conf.instances.json multiInstance variants; override at build with
# `--build-arg INSTANCE_CODES=...`. Declared as an ARG (not a marker-wrapped
# shell string) so the value is clean — a `/** … */` literal in the shell would
# glob-expand in the `for` loop below.
ARG INSTANCE_CODES="amethyst-strata-expansion,FOREST,TEST"

RUN --mount=type=secret,id=github_username \
    # --mount=type=secret,id=github_token \
    set -eu; \
    export GITHUB_USERNAME="$(cat /run/secrets/github_username)"; \
    # export GITHUB_TOKEN="$(cat /run/secrets/github_token)"; \
    export ENGINE_CYBERIA_REPO="engine-cyberia"; \
    cd /home/dd; \
    underpost clone "$GITHUB_USERNAME/$ENGINE_CYBERIA_REPO"; \
    mkdir -p /home/dd/engine; \
    cp -a ./"$ENGINE_CYBERIA_REPO"/. /home/dd/engine/; \
    rm -rf ./"$ENGINE_CYBERIA_REPO"; \
    cd /home/dd; \
    underpost clone "$GITHUB_USERNAME/cyberia-instances"; \
    rm -rf /home/dd/engine/engine-private; \
    mkdir -p /home/dd/engine/engine-private/conf/dd-cyberia; \
    cp -a ./cyberia-instances/conf/dd-cyberia/. /home/dd/engine/engine-private/conf/dd-cyberia/.; \
    cp -a /home/dd/engine/engine-private/conf/dd-cyberia/package.json /home/dd/engine/package.json; \
    # Per instance code: copy its backup dir and, when present, its top-level
    # saga (cyberia-instances/sagas/<code>.json). The engine boot seed
    # (`run-workflow import-default-items`) reads engine-private/cyberia-sagas/
    # <code>.json — without it generate-saga fails and the engine crash-loops.
    # A code with no top-level saga is imported from its backup dir instead.
    mkdir -p /home/dd/engine/engine-private/cyberia-instances; \
    mkdir -p /home/dd/engine/engine-private/cyberia-sagas; \
    for _ic in $(echo "$INSTANCE_CODES" | tr ',' ' '); do \
      cp -a ./cyberia-instances/instances/"$_ic" /home/dd/engine/engine-private/cyberia-instances/"$_ic"; \
      if [ -f ./cyberia-instances/sagas/"$_ic".json ]; then \
        cp -a ./cyberia-instances/sagas/"$_ic".json /home/dd/engine/engine-private/cyberia-sagas/"$_ic".json; \
      fi; \
    done; \
    mkdir -p /home/dd/engine/src/client/public/cyberia; \
    cp -a ./cyberia-instances/public/cyberia/. /home/dd/engine/src/client/public/cyberia/.; \
    # The engine gRPC server loads its schema at runtime from
    # cyberia-server/gen/proto/cyberia.proto (src/grpc/cyberia/grpc-server.js);
    # fetch just that file so the engine can bind :50051 / :4005 without the
    # full cyberia-server repo.
    underpost clone "$GITHUB_USERNAME/cyberia-server"; \
    mkdir -p /home/dd/engine/cyberia-server/gen/proto; \
    cp -a ./cyberia-server/gen/proto/cyberia.proto /home/dd/engine/cyberia-server/gen/proto/cyberia.proto; \
    rm -rf ./cyberia-server; \
    cd /home/dd/engine; \
    # --- install deps + env, then replay build-safe itc provisioning ----------
    npm install; \
    node bin app load --env production --args deploy-id=dd-cyberia; \
    ( cd /home/dd/engine/hardhat && npm install --include=dev ); \
    # --- build the client bundle (assets are now in place) --------------------
    cd /home/dd/engine; \
    node bin client dd-cyberia; \
    # --- CREDENTIAL SCRUB (defense in depth, while secrets are still in scope) -
    # 1) Redact every real secret value from any file it may have reached.
    # for _secret in "$GITHUB_TOKEN" "$CLOUDINARY_API_SECRET" "$CLOUDINARY_API_KEY"; do \
    for _secret in "$GITHUB_USERNAME"; do \
    # for _secret in "$GITHUB_USERNAME" "$GITHUB_TOKEN"; do \
      [ -n "$_secret" ] || continue; \
      grep -rlF --exclude-dir=node_modules --exclude-dir=.git "$_secret" /home/dd/engine 2>/dev/null \
        | xargs -r sed -i "s#${_secret}#__REDACTED__#g" || true; \
    done; \
    # unset GITHUB_TOKEN GITHUB_USERNAME; \
    # unset GITHUB_TOKEN GITHUB_USERNAME CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; \
    unset GITHUB_USERNAME; \

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
    rm -rf /home/dd/cyberia-instances \
           /home/dd/engine/src/client/public/itemledger \
           /home/dd/engine/src/client/public/cryptokoyn \
           /home/dd/engine/src/client/components/cryptokoyn \
           /home/dd/engine/src/client/components/itemledger \
           /home/dd/engine/src/client/Itemledger.index.js \
           /home/dd/engine/src/client/Cryptokoyn.index.js \
           /home/dd/engine/hardhat/node_modules \
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
RUN dnf install -y libstdc++ git sudo && dnf clean all && rm -rf /var/cache/dnf && \
    useradd --create-home --home-dir /home/dd --shell /usr/sbin/nologin dd && \
    # The runtime runs as `dd`, but `underpost start --build` shells out to `sudo cp`/`sudo rm`
    # (src/server/runtime/start.js). Grant passwordless sudo so those succeed without a TTY/password.
    printf 'dd ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/dd && chmod 0440 /etc/sudoers.d/dd && \
    # underpost persists its global env and container state under
    # `$(npm root -g)/underpost` (getUnderpostRootPath). That path is a STORE directory, not
    # the CLI package tree: the staged package installs under its own package name, and
    # `underpost start --build` re-links the bin at the pulled checkout without moving the
    # store (src/server/runtime/start.js#linkRuntimeCli). Create it here — the non-root
    # runtime user cannot mkdir inside /usr/local itself (EACCES on the first state write).
    mkdir -p "$(npm root -g)/underpost" && chown -R dd:dd "$(npm root -g)/underpost"

# Copy ONLY the scrubbed runtime tree — no .git, no token, no caches.
COPY --from=builder --chown=dd:dd /home/dd/engine /home/dd/engine

RUN chmod +x /home/dd/engine/scripts/rpmfusion-ffmpeg-setup.sh && \
    /home/dd/engine/scripts/rpmfusion-ffmpeg-setup.sh

# Explicit re-chown: PVC-backed mounts under src/client/public land here at
# pod start and may override the COPY --chown above with root ownership.
RUN chown -R dd:dd /home/dd/engine/src/client/public

USER dd
WORKDIR /home/dd/engine

EXPOSE 3005
EXPOSE 50051

CMD ["/bin/sh", "-c", "underpost start --run dd-cyberia production"]