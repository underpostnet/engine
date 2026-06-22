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
ARG UNDERPOST_VERSION=3.2.9

RUN dnf module install -y nodejs:22/common && \
    dnf install -y python3 && \
    npm install -g underpost@${UNDERPOST_VERSION} && \
    dnf clean all && \
    npm cache clean --force

WORKDIR /opt/cyberia-client

COPY --from=builder /cyberia-client/bin .

ENV PYTHONUNBUFFERED=1

EXPOSE 8081

CMD ["python3", "-m", "http.server", "-b", "0.0.0.0", "8081"]