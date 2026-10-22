#!/usr/bin/env sh
set -eu
mkdir -p nginx/certs
openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 365 \
  -keyout nginx/certs/server.key -out nginx/certs/server.crt \
  -subj "/C=VN/ST=HoChiMinh/L=HoChiMinh/O=TaskTracker/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 600 nginx/certs/server.key
echo "Đã tạo chứng chỉ HTTPS tự ký cho localhost."

