ARG BASE_DEBIAN=buster

FROM debian:${BASE_DEBIAN}

LABEL maintainer="Francisco Verdugo<fcoverdugoa (at) underpost (dot) net>"

ENV DEBIAN_FRONTEND noninteractive

# Set root password to root, format is 'user:password'.
RUN echo 'root:root' | chpasswd

RUN apt-get update --fix-missing && \
    apt-get upgrade -y && \
    # net-tools provides netstat commands
    apt-get -y install curl net-tools && \
    apt-get -yq install openssh-server supervisor && \
    # Few handy utilities which are nice to have
    apt-get -y install nano vim less --no-install-recommends && \
    apt-get clean

# install sudo
RUN apt-get -y install sudo

# SSH server
RUN mkdir -p /var/run/sshd && \
    # Allow root login via password
    sed -ri 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/g' /etc/ssh/sshd_config

# copy supervisor config file to start openssh-server
COPY supervisord-openssh-server.conf /etc/supervisor/conf.d/supervisord-openssh-server.conf

# copy a startup script
COPY startup.sh /startup.sh

# install open ssl git and others tools
RUN apt-get install -yq --no-install-recommends \
    libssl-dev \
    curl \ 
    wget \
    git \
    gnupg

# install nodejs 14 https://github.com/nodesource/distributions/blob/master/README.md#deb
RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash - && \
    apt-get install -y nodejs \
    build-essential && \
    node --version && \ 
    npm --version

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY ./package*.json ./
COPY ./.env.dev ./
COPY ./nodemon.json ./
COPY ./underpost.js ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

VOLUME [ "/usr/src/app/data" ]

EXPOSE 5500
EXPOSE 5501
EXPOSE 22

CMD ["sh", "/startup.sh"]