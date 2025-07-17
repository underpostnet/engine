FROM rockylinux:9

RUN dnf install -y --allowerasing bzip2
RUN dnf clean all


# Install Node.js
RUN curl -fsSL https://rpm.nodesource.com/setup_23.x | bash -
RUN dnf install nodejs -y
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
