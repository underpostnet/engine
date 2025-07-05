#!/bin/bash

set -e

# Expand /dev/sda2 partition and resize filesystem automatically

# Check if parted is installed
if ! command -v parted &>/dev/null; then
    echo "parted not found, installing..."
    dnf install -y parted
fi

# Get start sector of /dev/sda2
START_SECTOR=$(parted /dev/sda -ms unit s print | awk -F: '/^2:/{print $2}' | sed 's/s//')

# Resize the partition
parted /dev/sda ---pretend-input-tty <<EOF
unit s
resizepart 2 100%
Yes
quit
EOF

# Resize the filesystem
resize2fs /dev/sda2

echo "Disk and filesystem resized successfully."

mkdir -p /home/dd
sudo dnf install -y tar
sudo dnf install -y bzip2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
nvm install 23.8.0
nvm use 23.8.0
npm install -g underpost
chmod +x /root/.nvm/versions/node/v23.8.0/bin/underpost
sudo modprobe br_netfilter
