# Use Rocky Linux 9 as the base image
FROM rockylinux:9

# Set environment variable for non-interactive mode (though less critical for DNF than APT)
ENV DNF_ASSUMEYES=1

# Set root password to root
RUN echo 'root:root' | chpasswd

# Update system packages and install EPEL, then essential tools
# DNF is the package manager for Rocky Linux (RHEL-based)
RUN dnf update -y
RUN dnf install -y epel-release
RUN dnf install -y --allowerasing sudo
RUN dnf install -y --allowerasing curl
RUN dnf install -y --allowerasing net-tools
RUN dnf install -y --allowerasing openssh-server
RUN dnf install -y --allowerasing supervisor
RUN dnf install -y --allowerasing nano
RUN dnf install -y --allowerasing vim-enhanced
RUN dnf install -y --allowerasing less
RUN dnf install -y --allowerasing openssl-devel
RUN dnf install -y --allowerasing wget
RUN dnf install -y --allowerasing git
RUN dnf install -y --allowerasing gnupg2
RUN dnf clean all

# Configure SSH
RUN mkdir -p /var/run/sshd
# Allow root login via password
RUN sed -ri 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/g' /etc/ssh/sshd_config

# Install Node.js
# Add NodeSource repository for Node.js 23.x (for RHEL-based systems)
RUN curl -fsSL https://rpm.nodesource.com/setup_23.x | bash -
# Install Node.js
RUN dnf install -y nodejs
RUN dnf clean all

# Verify Node.js and npm versions
RUN node --version
RUN npm --version

# Install underpost ci/cd cli
RUN npm install -g underpost
RUN underpost --version

# Set working directory
WORKDIR /home/dd

# Expose necessary ports
EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 3000-3100
EXPOSE 4000-4100

# Default command to start SSH and XAMPP (Apache and MySQL)
# Using supervisord to manage multiple processes
CMD ["/usr/bin/supervisord", "-n"]
