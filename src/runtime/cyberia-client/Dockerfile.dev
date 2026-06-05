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

ARG UNDERPOST_VERSION=3.2.9
RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
        curl git python3 \
        procps-ng strace lsof vim-minimal && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf install -y nodejs && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all

WORKDIR /home/dd/engine/cyberia-client

COPY --from=builder /cyberia-client/server.py ./server.py
COPY --from=builder /cyberia-client/bin       ./bin/

ENV CYBERIA_PORT=8082
ENV CYBERIA_MODE=development

EXPOSE 8081 8082

CMD ["sh", "-c", "exec python3 server.py ${CYBERIA_PORT} bin ${CYBERIA_MODE}"]
