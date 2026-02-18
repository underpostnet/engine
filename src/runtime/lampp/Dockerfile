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

# --- Download and install XAMPP
RUN curl -L -o /tmp/xampp-linux-installer.run "https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/7.4.33/xampp-linux-x64-7.4.33-0-installer.run" && \
    chmod +x /tmp/xampp-linux-installer.run && \
    bash -c "/tmp/xampp-linux-installer.run --mode unattended" && \
    ln -sf /opt/lampp/lampp /usr/bin/lampp

# --- Create /xampp/htdocs (static root) and set permissions
RUN mkdir -p /opt/lampp/htdocs && \
    chown -R root:root /opt/lampp/htdocs && \
    chmod -R a+rX /opt/lampp/htdocs

# Install Node.js
RUN curl -fsSL https://rpm.nodesource.com/setup_24.x | bash -
RUN dnf install nodejs -y
RUN dnf clean all

# Verify Node.js and npm versions
RUN node --version
RUN npm --version

# Set working directory
WORKDIR /home/dd

EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 3000-3100
EXPOSE 4000-4100
