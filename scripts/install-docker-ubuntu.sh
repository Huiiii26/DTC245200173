#!/usr/bin/env sh
set -eu

if ! grep -qi ubuntu /etc/os-release; then
  echo "Script này chỉ hỗ trợ Ubuntu trong WSL2." >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" |
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo service docker start

echo "Đã cài Docker Engine và Compose plugin."
echo "Đóng cửa sổ Ubuntu, chạy 'wsl --shutdown' trong PowerShell rồi mở lại Ubuntu để nhận quyền nhóm docker."

