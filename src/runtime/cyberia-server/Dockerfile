# --- Build Image ---
FROM golang:1.24 AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o server ./cmd/cyberia-server/

# --- Runtime Image ---
FROM rockylinux/rockylinux:9 AS runtime
ARG UNDERPOST_VERSION=3.2.9

RUN dnf module install -y nodejs:22/common && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all && \
    npm cache clean --force

WORKDIR /opt/cyberia-server

COPY --from=builder /build/server ./server

COPY public/ ./public/

EXPOSE 8081

ENTRYPOINT ["./server"]