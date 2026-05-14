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

# Cache dependency downloads independently of source changes
COPY cyberia-server/go.mod cyberia-server/go.sum ./
RUN go mod download

COPY cyberia-server/ ./
RUN chmod +x build.sh && ./build.sh

# --- Runtime Image
FROM rockylinux/rockylinux:9 AS runtime

RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing curl git && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf install -y nodejs && \
    dnf clean all

WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

EXPOSE 8081

ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]