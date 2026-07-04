# cyberia-client DEV runtime image.

ARG BUILD_MODE=DEBUG

# --- Build Image ---
FROM rockylinux/rockylinux:9 AS builder
ARG BUILD_MODE=DEBUG

RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
    git curl wget openssl-devel libnsl perl gnupg2 bzip2 && \
    dnf clean all

RUN dnf groupinstall -y "Development Tools" && \
    dnf install -y \
        cmake unzip python3 python3.11 \
        alsa-lib-devel mesa-libGL-devel mesa-libGLU-devel \
        libX11-devel libXrandr-devel libXi-devel libXcursor-devel \
        libXinerama-devel libXfixes-devel \
        freeglut-devel glfw-devel libatomic.x86_64 && \
    dnf clean all && \
    alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 2 && \
    alternatives --set python3 /usr/bin/python3.11

ENV EMSDK=/opt/emsdk
ENV PATH="${EMSDK}:${EMSDK}/upstream/emscripten:${PATH}"

ARG EMSDK_VERSION=5.0.6
WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git ${EMSDK}
WORKDIR ${EMSDK}
RUN ./emsdk install ${EMSDK_VERSION} && \
    ./emsdk activate ${EMSDK_VERSION}

WORKDIR /cyberia-client

COPY . .

# Dev build: BUILD_MODE=DEBUG keeps symbols, asserts, source maps.
RUN make -f Web.mk all BUILD_MODE=${BUILD_MODE} OUTPUT_DIR=bin/

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime

ARG UNDERPOST_VERSION=3.2.30
ARG NODE_VERSION=24.15.0
RUN set -eux; \
    dnf -y update; \
    dnf -y install epel-release; \
    dnf -y install --allowerasing \
        curl git python3 tar xz \
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

WORKDIR /home/dd/engine/cyberia-client

COPY --from=builder /cyberia-client/docker-driver.py ./docker-driver.py
COPY --from=builder /cyberia-client/bin              ./bin/

ENV CYBERIA_PORT=8082

EXPOSE 8081 8082

CMD ["sh", "-c", "exec python3 docker-driver.py ${CYBERIA_PORT} bin"]
