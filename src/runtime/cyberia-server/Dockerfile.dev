# cyberia-server DEV runtime image.
#
# Differences vs the production Dockerfile in this same directory:
#   - Builds the Go binary WITHOUT `-trimpath -ldflags="-s -w"` so symbols
#     and source paths survive into the binary for stack traces and pprof.
#   - Keeps -race (CGO-free race detector is not available; we still pass
#     `-gcflags="all=-N -l"` to disable inlining + optimisations so the
#     dlv debugger and live profilers can attach predictably).
#   - Keeps `git`, `procps-ng`, `strace`, `lsof`, `vim`, `curl` in the
#     runtime image so the operator can attach and inspect a misbehaving
#     pod without re-baking the image. Production keeps the runtime
#     layer minimal.
#   - Does NOT strip the npm cache after `npm install -g underpost@…` so
#     `npm upgrade -g underpost` works in a running container.
#
# Selected automatically by `node bin run instance-build-manifest`
# whenever the `--dev` flag is set; the production Dockerfile in the
# same directory is used otherwise.

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

# Build context is the cyberia-server project repo root (see the
# production Dockerfile in this directory for the rationale).
COPY go.mod go.sum ./
RUN go mod download

COPY . ./
# Dev build: keep source paths, disable inlining + optimisations.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
      go build -gcflags="all=-N -l" -o server ./cmd/cyberia-server/ && \
    echo "DEV build complete: $(pwd)/server"

# --- Runtime Image
FROM rockylinux/rockylinux:9 AS runtime

ARG UNDERPOST_VERSION=3.2.9
RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
        curl git \
        procps-ng strace lsof vim-minimal && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf install -y nodejs && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all

WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

# Static SSR dashboard — required by the Go server's findPublicDir() at boot.
# See the production Dockerfile in this directory for the full rationale.
# The same `node bin/cyberia run-workflow build-server-dashboard --dev
# --output-path <project-root>/public/index.html` command is executed by
# the CI workflow before docker build.
COPY public/ ./public/

EXPOSE 8081

ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]
