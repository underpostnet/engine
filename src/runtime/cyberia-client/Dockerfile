FROM rockylinux:9

# System packages 
RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing \
    bzip2 \
    sudo \
    curl \
    net-tools \
    openssh-server \
    nano \
    vim-enhanced \
    less \
    openssl-devel \
    wget \
    git \
    gnupg2 \
    libnsl \
    perl && \
    dnf clean all

# Install Node.js
RUN curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
RUN dnf install nodejs -y
RUN dnf clean all

# System packages (raylib gfx + build dependencies)
RUN dnf groupinstall -y "Development Tools" && \
    dnf install -y \
        cmake \
        unzip \
        python3 \
        python3.11 \
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

# Install underpost CLI 
RUN npm install -g underpost

# Install Emscripten SDK for WebAssembly compilation of raylib client.
ENV EMSDK=/opt/emsdk
ENV PATH="${EMSDK}:${EMSDK}/upstream/emscripten:${PATH}"
WORKDIR /
RUN git clone https://github.com/emscripten-core/emsdk.git ${EMSDK}
WORKDIR ${EMSDK}
RUN ./emsdk install latest && \
    ./emsdk activate latest

# Runtime root expected by startup/build scripts.
WORKDIR /home/dd

RUN mkdir -p /home/dd/engine/cyberia-client
COPY cyberia-client/ /home/dd/engine/cyberia-client/

# Compile both build modes at image build-time to minimize service startup time.
WORKDIR /home/dd/engine/cyberia-client
RUN make -f Web.mk all BUILD_MODE=RELEASE
RUN make -f Web.mk all BUILD_MODE=DEBUG


ENV CYBERIA_PORT=8081
ENV CYBERIA_WEB_ROOT=/home/dd/engine/cyberia-client/bin/web/release
ENV CYBERIA_MODE=production

EXPOSE 8081 8082

CMD ["sh", "-c", "python3 /home/dd/engine/cyberia-client/server.py ${CYBERIA_PORT} ${CYBERIA_WEB_ROOT} ${CYBERIA_MODE}"]
