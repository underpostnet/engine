
echo "Expanding /dev/sda2 and resizing filesystem..."

if ! command -v parted &>/dev/null; then
  sudo dnf install -y parted
fi

sudo parted /dev/sda ---pretend-input-tty <<EOF
unit s
resizepart 2 100%
Yes
quit
EOF

sudo resize2fs /dev/sda2
echo "Disk resized."

echo "Installing essential packages..."
sudo dnf install -y tar bzip2 git curl jq epel-release
sudo dnf -y update

echo "Loading br_netfilter module..."
sudo modprobe br_netfilter
