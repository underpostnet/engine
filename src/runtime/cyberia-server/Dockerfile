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
RUN chmod +x build.sh && ./build.sh

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime

ARG UNDERPOST_VERSION=3.2.9
RUN dnf -y update && \
    dnf -y install epel-release && \
    dnf -y install --allowerasing curl git && \
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && \
    dnf install -y nodejs && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all && \
    npm cache clean --force

WORKDIR /home/dd/engine/cyberia-server

COPY --from=builder /build/server ./server

COPY public/ ./public/

EXPOSE 8081

ENTRYPOINT ["/home/dd/engine/cyberia-server/server"]