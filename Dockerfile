ARG BASE_DEBIAN=buster

FROM debian:${BASE_DEBIAN}

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /code

# Set root password to root, format is 'user:password'.
RUN echo 'root:root' | chpasswd

RUN apt-get update --fix-missing &&
    apt-get upgrade -y &&
    # install sudo
    apt-get -y install sudo &&
    # net-tools provides netstat commands
    apt-get -y install curl net-tools &&
    apt-get -yq install openssh-server supervisor &&
    # Few handy utilities which are nice to have
    apt-get -y install nano vim less --no-install-recommends &&
    apt-get clean

# install ssh
RUN mkdir -p /var/run/sshd &&
    # Allow root login via password
    sed -ri 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/g' /etc/ssh/sshd_config

# copy supervisor config file to start openssh-server
COPY supervisord-openssh-server.conf /etc/supervisor/conf.d/supervisord-openssh-server.conf

# install open ssl git and others tools
RUN apt-get install -yq --no-install-recommends \
    libssl-dev \
    curl \ 
wget \
    git \
    gnupg

# install nodejs https://github.com/nodesource/distributions/blob/master/README.md#deb
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - &&
    apt-get install -y nodejs \
        build-essential &&
    node --version && \ 
npm --version

# local test

# COPY . .

# RUN npm install

# VOLUME [ "/code/logs" ]
# EXPOSE 22

# EXPOSE 4000-4004
# CMD [ "npm", "run", "dev" ]

# EXPOSE 3000-3004
# CMD [ "npm", "start" ]

# package

# Install underpost cli

RUN npm install -g underpost
RUN npm install shelljs
COPY startup.cjs /code/startup.cjs

VOLUME [ "/code/app/logs" ]

EXPOSE 22 80 443 3306 27017
# EXPOSE 22
EXPOSE 4000-4004

CMD [ "node", "./startup.cjs" ]
