ARG BASE_DEBIAN=buster

FROM debian:${BASE_DEBIAN}

ENV DEBIAN_FRONTEND noninteractive

WORKDIR /code

# Set root password to root, format is 'user:password'.
RUN echo 'root:root' | chpasswd

RUN apt-get update --fix-missing && \
    apt-get upgrade -y && \
    # install sudo
    apt-get -y install sudo && \
    # net-tools provides netstat commands
    apt-get -y install curl net-tools && \
    apt-get -yq install openssh-server supervisor && \
    # Few handy utilities which are nice to have
    apt-get -y install nano vim less --no-install-recommends && \
    apt-get clean

# install ssh
RUN mkdir -p /var/run/sshd && \
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
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs \
    build-essential && \
    node --version && \ 
    npm --version


# Install mongodb necessary libs
RUN apt-get update && apt-get install -y apt-utils wget gnupg gnupg2 curl

# Install mongodb
RUN wget -qO - https://www.mongodb.org/static/pgp/server-4.2.asc | apt-key add -
RUN echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.2.list
RUN apt-get update
RUN apt-get install -y mongodb-org

# BIND TO ALL ADAPTERS IN CONTAINER
RUN sed -i "s,\\(^[[:blank:]]*bindIp:\\) .*,\\1 0.0.0.0," /etc/mongod.conf

# Bundle app source
COPY . .

RUN npm install

VOLUME [ "/code/logs" ]

EXPOSE 22 80 443 27017
EXPOSE 3000-3020

CMD [ "node", "startup" ]