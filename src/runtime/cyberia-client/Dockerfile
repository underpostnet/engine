# BUILD_MODE: RELEASE | DEBUG
ARG BUILD_MODE=RELEASE

# --- Build Image ---
FROM emscripten/emsdk:5.0.6 AS builder

ARG BUILD_MODE=RELEASE

WORKDIR /cyberia-client

COPY . .

RUN make -f Web.mk clean all BUILD_MODE=${BUILD_MODE} OUTPUT_DIR=bin/

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime
ARG UNDERPOST_VERSION=3.2.70
ARG NODE_VERSION=24.15.0

RUN set -eux; \
    dnf install -y python3 git tar xz; \
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

# Path + server layout is the contract with conf.instances.json mmo-client cmd,
# which execs `python3 /home/dd/engine/cyberia-client/docker-driver.py <port>
# /home/dd/engine/cyberia-client/bin` in both development and production.
# Keep this identical to Dockerfile.dev so prod and dev images are interchangeable.
WORKDIR /home/dd/engine/cyberia-client

COPY --from=builder /cyberia-client/docker-driver.py ./docker-driver.py
COPY --from=builder /cyberia-client/bin              ./bin/

ENV PYTHONUNBUFFERED=1
ENV CYBERIA_PORT=8081

EXPOSE 8081

CMD ["sh", "-c", "exec python3 docker-driver.py ${CYBERIA_PORT} bin"]
