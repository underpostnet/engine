# --- Build Image
FROM rockylinux/rockylinux:9 AS builder

RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
    git \
    make \
    golang && \
    dnf clean all

WORKDIR /build

# Cache dependency downloads independently of source changes
COPY cyberia-server/go.mod cyberia-server/go.sum ./
RUN go mod download

COPY cyberia-server/ ./
RUN chmod +x build.sh && ./build.sh

# --- Runtime Image
FROM rockylinux/rockylinux:9 AS runtime

# Runtime needs:
#   - the compiled Go binary (cyberia-server itself)
#   - nodejs + the underpost CLI globally, for the container-status
#     lifecycle hooks (`underpost config set container-status ...`) that
#     the conf.instances.json cmd invokes before / after launching the
#     server binary. Installing it at build time avoids the slow
#     `npm install -g` startup the K8S cmd would otherwise have to do
#     on every pod boot.
ARG UNDERPOST_VERSION=3.2.9
RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing curl git && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf install -y nodejs && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all && \
    npm cache clean --force

WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

# Static SSR dashboard rendered by `node bin/cyberia run-workflow
# build-server-dashboard` from engine's CyberiaServerMetrics.js view. The
# Go server's findPublicDir() hard-requires public/index.html at boot and
# log.Fatalf's without it. CI builds the dashboard into
# cyberia-server/public/ before the docker build picks it up here; local
# devs run the same command from the engine repo root.
COPY cyberia-server/public/ ./public/

EXPOSE 8081

# Default entrypoint when the image is run directly (not via K8S cmd).
# In K8S deploys conf.instances.json supplies its own cmd that wraps env
# sourcing + container-status hooks + this same binary.
ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]