FROM rockylinux:9

# ── System packages (build tools + raylib web dependencies) ───────────────────
RUN dnf install -y epel-release && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf groupinstall -y "Development Tools" && \
    dnf install -y \
        cmake git wget unzip \
        python3 python3.11 \
        nodejs \
        alsa-lib-devel \
        mesa-libGL-devel \
        mesa-libGLU-devel \
        libX11-devel \
        libXrandr-devel \
        libXi-devel \
        libXcursor-devel \
        libXinerama-devel \
        libXfixes-devel \
        freeglut-devel \
        glfw-devel \
        libatomic.x86_64 && \
    dnf clean all

# ── underpost CLI ──────────────────────────────────────────────────────────────
RUN npm install -g underpost

ENV EMSDK=/home/dd/.emsdk
ENV EMSDK_QUIET=1
ENV EMSDK_PYTHON=/usr/bin/python3.11
ENV PATH="${EMSDK}:${EMSDK}/upstream/emscripten:${PATH}"

RUN git clone --depth=1 https://github.com/emscripten-core/emsdk.git ${EMSDK} && \
    cd ${EMSDK} && \
    ./emsdk install latest && \
    ./emsdk activate latest

# Runtime root expected by startup/build scripts.
WORKDIR /home/dd

RUN mkdir -p /home/dd/engine/cyberia-client
COPY cyberia-client/ /home/dd/engine/cyberia-client/

# Compile both build modes at image build-time to minimize service startup time.
RUN bash -lc "source ${EMSDK}/emsdk_env.sh && \
    cd /home/dd/engine/cyberia-client && \
    make -j\"$(nproc)\" -f Web.mk all BUILD_MODE=RELEASE && \
    make -j\"$(nproc)\" -f Web.mk all BUILD_MODE=DEBUG"

ENV CYBERIA_PORT=8081
ENV CYBERIA_WEB_ROOT=/home/dd/engine/cyberia-client/bin/web/release
ENV CYBERIA_MODE=production

EXPOSE 8081 8082

CMD ["sh", "-c", "python3 /home/dd/engine/cyberia-client/server.py ${CYBERIA_PORT} ${CYBERIA_WEB_ROOT} ${CYBERIA_MODE}"]
