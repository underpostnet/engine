ARG BASE_DEBIAN=buster

USER root

FROM debian:${BASE_DEBIAN}

ENV DEBIAN_FRONTEND=noninteractive

# Set root password to root, format is 'user:password'.
RUN echo 'root:root' | chpasswd

RUN apt-get update --fix-missing
RUN apt-get upgrade -y
# install sudo
RUN apt-get -y install sudo
# net-tools provides netstat commands
RUN apt-get -y install curl net-tools
RUN apt-get -yq install openssh-server supervisor
# Few handy utilities which are nice to have
RUN apt-get -y install nano vim less --no-install-recommends
RUN apt-get clean

# install ssh
RUN mkdir -p /var/run/sshd
# Allow root login via password
RUN sed -ri 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/g' /etc/ssh/sshd_config

# install open ssl git and others tools
RUN apt-get install -yq --no-install-recommends libssl-dev curl wget git gnupg

# install lampp
RUN curl -Lo xampp-linux-installer.run https://sourceforge.net/projects/xampp/files/XAMPP%20Linux/7.4.33/xampp-linux-x64-7.4.33-0-installer.run?from_af=true
RUN chmod +x xampp-linux-installer.run
RUN bash -c './xampp-linux-installer.run'
RUN ln -sf /opt/lampp/lampp /usr/bin/lampp
# Enable XAMPP web interface(remove security checks)
RUN sed -i.bak s'/Require local/Require all granted/g' /opt/lampp/etc/extra/httpd-xampp.conf
# Enable error display in php
RUN sed -i.bak s'/display_errors=Off/display_errors=On/g' /opt/lampp/etc/php.ini
# Enable includes of several configuration files
RUN mkdir /opt/lampp/apache2/conf.d
RUN echo "IncludeOptional /opt/lampp/apache2/conf.d/*.conf" >>/opt/lampp/etc/httpd.conf
# Create a /www folder and a symbolic link to it in /opt/lampp/htdocs. It'll be accessible via http://localhost:[port]/www/
# This is convenient because it doesn't interfere with xampp, phpmyadmin or other tools in /opt/lampp/htdocs
# /opt/lampp/etc/httpd.conf
RUN mkdir /www
RUN ln -s /www /opt/lampp/htdocs

# install nodejs https://github.com/nodesource/distributions/blob/master/README.md#deb
RUN curl -fsSL https://deb.nodesource.com/setup_23.x | bash -
RUN apt-get install -y nodejs build-essential
RUN node --version
RUN npm --version

WORKDIR /home/dd

EXPOSE 22

EXPOSE 80

EXPOSE 443

EXPOSE 3000-3100

EXPOSE 4000-4100
