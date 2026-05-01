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

# Verify Node.js and npm versions
RUN node --version
RUN npm --version

# Install underpost CLI 
RUN npm install -g underpost
RUN underpost --version

# Runtime root expected by startup/build scripts.
WORKDIR /home/dd

RUN underpost clone underpostnet/engine-cyberia && \
    mv /home/dd/engine-cyberia /home/dd/engine && \
    cd /home/dd/engine && npm install

RUN mkdir -p /home/dd/engine/cyberia-server
COPY cyberia-server/ /home/dd/engine/cyberia-server/

RUN cd /home/dd/engine/cyberia-server && \
    go mod download && \
    chmod +x build.sh && \
    ./build.sh

EXPOSE 8081

CMD ["/home/dd/engine/cyberia-server/server"]

