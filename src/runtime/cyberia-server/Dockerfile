FROM rockylinux:9

# ── System packages 
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


# Install underpost CLI 
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

