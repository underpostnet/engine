sudo apt update
sudo apt upgrade

# Install the MongoDB 4.4 GPG key:
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -

# Add the source location for the MongoDB packages:
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
echo "deb [ arch=arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.2 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.2.list

# Download the package details for the MongoDB packages:
sudo apt-get update

# Install MongoDB:
sudo apt-get install -y mongodb-org
# sudo apt-get install mongodb

# Ensure mongod config is picked up:
sudo systemctl daemon-reload

# Tell systemd to run mongod on reboot:
sudo systemctl enable mongod

# Start up mongod!
sudo systemctl start mongod