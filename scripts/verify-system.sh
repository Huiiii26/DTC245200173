#!/usr/bin/env sh
set -eu

echo "== Trạng thái container =="
docker compose ps

echo "== Health ứng dụng =="
curl -ksS https://localhost/health
printf '\n'

echo "== Security headers Nginx =="
curl -ksSI https://localhost | grep -Ei 'strict-transport-security|content-security-policy|x-content-type-options|x-frame-options|referrer-policy'

echo "== User trong container =="
printf 'app: '; docker compose exec -T app whoami
printf 'nginx: '; docker compose exec -T nginx whoami

echo "== PostgreSQL không publish cổng 5432 =="
if docker compose port postgres 5432 2>/dev/null | grep -Eq ':[1-9][0-9]*$'; then
  echo "LỖI: PostgreSQL đang publish cổng 5432" >&2
  exit 1
else
  echo "Đạt: không có cổng host."
fi

echo "== Prometheus targets =="
curl -fsS http://127.0.0.1:9090/api/v1/targets | grep -o '"health":"up"' | wc -l

echo "== Loki sẵn sàng =="
docker compose exec -T loki wget -qO- http://127.0.0.1:3100/ready

echo "== Mạng backend nội bộ =="
docker network inspect tasktracker_backend --format '{{.Internal}}'

echo "Kiểm chứng cơ bản hoàn tất."

