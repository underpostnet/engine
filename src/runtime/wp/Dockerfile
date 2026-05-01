FROM rockylinux:9

# System packages (build tools + raylib web dependencies) ───────────────────
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
        libatomic.x86_64 && \
    dnf clean all

# Download and install XAMPP (PHP 8.2)
RUN curl -L -o /tmp/xampp-linux-installer.run "https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/8.2.12/xampp-linux-x64-8.2.12-0-installer.run" && \
    chmod +x /tmp/xampp-linux-installer.run && \
    bash -c "/tmp/xampp-linux-installer.run --mode unattended" && \
    ln -sf /opt/lampp/lampp /usr/bin/lampp

# Create /xampp/htdocs (static root) and set permissions
RUN mkdir -p /opt/lampp/htdocs && \
    chown -R root:root /opt/lampp/htdocs && \
    chmod -R a+rX /opt/lampp/htdocs

# Add XAMPP binaries and /usr/local/bin to PATH for all shells
ENV PATH="/opt/lampp/bin:/usr/local/bin:${PATH}"
RUN echo 'export PATH="/opt/lampp/bin:/usr/local/bin:${PATH}"' > /etc/profile.d/lampp.sh

# Provide a no-op sendmail so WP plugins don't error on mail calls
RUN printf '#!/bin/sh\ncat > /dev/null\n' > /usr/sbin/sendmail && chmod +x /usr/sbin/sendmail

# Install WP-CLI
RUN curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp && \
    chmod +x /usr/local/bin/wp && \
    wp --info --allow-root

# Install underpost CLI 
RUN npm install -g underpost

# Runtime root expected by startup/build scripts.
WORKDIR /home/dd

EXPOSE 22
EXPOSE 80
EXPOSE 443
EXPOSE 3000-3100
EXPOSE 4000-4100

