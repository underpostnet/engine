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
