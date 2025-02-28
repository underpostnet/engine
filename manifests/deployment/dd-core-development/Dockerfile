ARG BASE_DEBIAN=buster

USER root

FROM debian:${BASE_DEBIAN}

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /home/dd

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

# copy supervisor config file to start openssh-server
COPY supervisord-openssh-server.conf /etc/supervisor/conf.d/supervisord-openssh-server.conf

# install open ssl git and others tools
RUN apt-get install -yq --no-install-recommends libssl-dev curl wget git gnupg

# install nodejs https://github.com/nodesource/distributions/blob/master/README.md#deb
RUN curl -fsSL https://deb.nodesource.com/setup_23.x | bash -
RUN apt-get install -y nodejs build-essential
RUN node --version
RUN npm --version

RUN npm install -g underpost

COPY ./.env.underpost ./.env.underpost

RUN underpost secret underpost --create-from-file ./.env.underpost

RUN sudo rm -rf ./.env.underpost

RUN underpost clone underpostnet/engine-core

RUN sudo mv ./engine-core ./engine

WORKDIR /home/dd/engine

RUN underpost clone underpostnet/engine-core-private

RUN sudo mv ./engine-core-private ./engine-private

RUN underpost install

RUN underpost dockerfile-node-script dd-core development

VOLUME [ "/home/dd/engine/logs" ]

EXPOSE 22

EXPOSE 4013-4032

CMD [ "npm", "run", "dev-img", "dd-core", "deploy" ]
