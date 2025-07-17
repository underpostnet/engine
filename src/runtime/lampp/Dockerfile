FROM rockylinux:9

RUN dnf install -y --allowerasing bzip2

RUN dnf update -y
RUN dnf install -y epel-release
RUN dnf install -y --allowerasing sudo
RUN dnf install -y --allowerasing curl
RUN dnf install -y --allowerasing net-tools
RUN dnf install -y --allowerasing openssh-server
RUN dnf install -y --allowerasing nano
RUN dnf install -y --allowerasing vim-enhanced
RUN dnf install -y --allowerasing less
RUN dnf install -y --allowerasing openssl-devel
RUN dnf install -y --allowerasing wget
RUN dnf install -y --allowerasing git
RUN dnf install -y --allowerasing gnupg2
RUN dnf clean all

# Install LAMPP (XAMPP)
# Download the XAMPP installer for Linux
RUN curl -Lo xampp-linux-installer.run https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/7.4.33/xampp-linux-x64-7.4.33-0-installer.run?from_af=true
RUN chmod +x xampp-linux-installer.run
# Run the XAMPP installer in silent mode
RUN bash -c './xampp-linux-installer.run --mode unattended'
# Create a symbolic link for easy access to lampp command
RUN ln -sf /opt/lampp/lampp /usr/bin/lampp

# Configure XAMPP
# Enable XAMPP web interface (remove security checks)
RUN sed -i.bak 's/Require local/Require all granted/g' /opt/lampp/etc/extra/httpd-xampp.conf
# Enable error display in php
RUN sed -i.bak 's/display_errors=Off/display_errors=On/g' /opt/lampp/etc/php.ini
# Enable includes of several configuration files for Apache
RUN mkdir -p /opt/lampp/apache2/conf.d
RUN echo "IncludeOptional /opt/lampp/apache2/conf.d/*.conf" >>/opt/lampp/etc/httpd.conf
# Create a /www folder and a symbolic link to it in /opt/lampp/htdocs
# This is convenient because it doesn't interfere with xampp, phpmyadmin or other tools
RUN mkdir /www
RUN ln -s /www /opt/lampp/htdocs

# Install Node.js
RUN curl -fsSL https://rpm.nodesource.com/setup_23.x | bash -
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
