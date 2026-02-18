FROM rockylinux:9

# Update and install required packages
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

# Set working directory
WORKDIR /home/dd

# Expose necessary ports
EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 3000-3100
EXPOSE 4000-4100
