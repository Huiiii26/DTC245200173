#!/usr/bin/env sh
set -eu

if [ -f .env ]; then
  echo ".env đã tồn tại; không ghi đè."
  exit 0
fi

random_secret() { openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-28; }
cat > .env <<EOF
COMPOSE_PROJECT_NAME=tasktracker
HOST_GID=$(id -g)
POSTGRES_DB=tasktracker
POSTGRES_ADMIN_USER=task_admin
POSTGRES_ADMIN_PASSWORD=$(random_secret)
POSTGRES_APP_USER=task_app
POSTGRES_APP_PASSWORD=$(random_secret)
POSTGRES_EXPORTER_USER=task_exporter
POSTGRES_EXPORTER_PASSWORD=$(random_secret)
PGADMIN_DEFAULT_EMAIL=admin@tasktracker.vn
PGADMIN_DEFAULT_PASSWORD=$(random_secret)
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(random_secret)
EOF
chmod 600 .env
echo "Đã tạo .env với mật khẩu ngẫu nhiên và quyền 600."

