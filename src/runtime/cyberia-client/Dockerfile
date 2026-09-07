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
    dnf clean all; rm -rf /var/cache/dnf


COPY underpost-cli.tgz /tmp/underpost-cli.tgz
RUN set -eux; \
    npm install -g /tmp/underpost-cli.tgz --omit=dev; \
    rm -f /tmp/underpost-cli.tgz; \
    npm cache clean --force; \
    underpost --version

# Path + server layout is the contract with conf.instances.json mmo-client cmd,
# which execs `python3 /home/dd/engine/cyberia-client/wasm-driver.py --port=<port>
# --directory=/home/dd/engine/cyberia-client/bin --data-server-url=<url>` in both
# development and production.
# Keep this identical to Dockerfile.dev so prod and dev images are interchangeable.
WORKDIR /home/dd/engine/cyberia-client

COPY --from=builder /cyberia-client/wasm-driver.py ./wasm-driver.py
COPY --from=builder /cyberia-client/bin              ./bin/

ENV PYTHONUNBUFFERED=1
ENV CYBERIA_PORT=8081
# Mirrors the --data-server-url default in wasm-driver.py: the CMD below always passes the flag,
# so leaving this unset would hand the client an empty origin rather than that default.
ENV CYBERIA_DATA_SERVER_URL=https://cyberiaonline.com

EXPOSE 8081

CMD ["sh", "-c", "exec python3 wasm-driver.py --port=${CYBERIA_PORT} --directory=bin --data-server-url=${CYBERIA_DATA_SERVER_URL}"]
