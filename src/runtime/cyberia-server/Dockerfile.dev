# cyberia-server DEV runtime image.

# --- Build Image ---
FROM rockylinux/rockylinux:9 AS builder

RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
    git \
    make \
    golang && \
    dnf clean all

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
      go build -gcflags="all=-N -l" -o server ./cmd/cyberia-server/ && \
    echo "DEV build complete: $(pwd)/server"

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime

ARG UNDERPOST_VERSION=3.2.70
ARG NODE_VERSION=24.15.0
RUN set -eux; \
    dnf -y update; \
    dnf -y install epel-release; \
    dnf -y install --allowerasing \
        curl git tar xz \
        procps-ng strace lsof vim-minimal; \
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
    dnf clean all

WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

COPY public/ ./public/

EXPOSE 8081

ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]
