# --- Build Image ---
FROM golang:1.24 AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o server ./cmd/cyberia-server/

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime
ARG UNDERPOST_VERSION=3.2.30
ARG NODE_VERSION=24.15.0

RUN set -eux; \
    dnf install -y git tar xz; \
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

# Path is the contract with conf.instances.json mmo-server cmd, which execs
# /home/dd/engine/cyberia-server/server in both development and production.
# Keep this identical to Dockerfile.dev so prod and dev images are interchangeable.
WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

COPY public/ ./public/

EXPOSE 8081

ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]