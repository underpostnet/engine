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
        libatomic.x86_64 \
        golang && \
    dnf clean all

# ── underpost CLI ──────────────────────────────────────────────────────────────
RUN npm install -g underpost

# Runtime root expected by startup/build scripts.
WORKDIR /home/dd

RUN mkdir -p /home/dd/engine/cyberia-server
COPY cyberia-server/ /home/dd/engine/cyberia-server/

RUN cd /home/dd/engine/cyberia-server && \
    go mod download && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o server .

EXPOSE 8081

CMD ["/home/dd/engine/cyberia-server/server"]

