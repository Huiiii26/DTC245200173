# Đề 24 Hệ thống Quản lý Công việc Task Tracker

Ứng dụng quản lý công việc cá nhân và nhóm, gồm tiêu đề, mô tả, thời hạn, trạng thái, mức ưu tiên và người phụ trách. Toàn bộ hệ thống chạy bằng Docker Compose trên WSL2 Ubuntu, truy cập duy nhất qua Nginx HTTPS.

## Công nghệ

- Node.js 20 và Express 4, giao diện HTML CSS JavaScript thuần.
- PostgreSQL 17 và pgAdmin 4.
- Nginx unprivileged làm reverse proxy, HTTPS tự ký và security headers.
- Prometheus, Grafana, cAdvisor, node-exporter, nginx-exporter và postgres-exporter.
- Loki và Promtail cho log tập trung.

## Chuẩn bị WSL2 Ubuntu

```bash
sudo apt update
sudo apt install -y git openssl ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

Nên đặt repository trong hệ thống tệp Linux, ví dụ `~/task-tracker`, thay vì `/mnt/c` hoặc `/mnt/d` để tránh chậm I/O và lỗi quyền.

## Khởi chạy

```bash
git clone https://github.com/<MSSV>/<MSSV>.git task-tracker
cd task-tracker
chmod +x scripts/*.sh postgres/init/*.sh
./scripts/gen-env.sh
./scripts/gen-cert.sh
docker compose up -d --build
docker compose ps
```

Địa chỉ truy cập:

- Website: https://localhost
- pgAdmin: https://localhost/pgadmin/
- Grafana: https://localhost/grafana/
- Prometheus dành cho quản trị trên máy chủ: http://127.0.0.1:9090

Trình duyệt sẽ cảnh báo vì chứng chỉ được tự ký. Chọn tiếp tục truy cập trong môi trường demo.

## Kết nối pgAdmin với PostgreSQL

Đăng nhập pgAdmin bằng tài khoản trong `.env`, tạo server mới với:

- Host: `postgres`
- Port: `5432`
- Database: giá trị `POSTGRES_DB`
- Username: giá trị `POSTGRES_ADMIN_USER`
- Password: giá trị `POSTGRES_ADMIN_PASSWORD`

PostgreSQL không publish cổng 5432 ra máy chủ và chỉ tồn tại trong mạng `backend` nội bộ.

## Kiểm tra nhanh

```bash
curl -k https://localhost/health
curl -kI https://localhost
docker compose exec app whoami
docker compose exec nginx whoami
docker network inspect tasktracker_backend
docker compose logs --tail=50 app nginx postgres
```

Kết quả mong đợi: health trả về `database: connected`, app chạy bằng user `node`, Nginx chạy bằng user không phải root, header phản hồi có CSP, HSTS và `X-Content-Type-Options`.

## Hardening đã áp dụng

- Container ứng dụng và Nginx chạy non-root, `no-new-privileges`, bỏ toàn bộ Linux capabilities, root filesystem chỉ đọc và `/tmp` dùng `tmpfs`.
- Tách mạng `frontend`, `backend`, `monitoring`; `backend` là mạng nội bộ. PostgreSQL không mở cổng ra ngoài.
- User ứng dụng PostgreSQL chỉ có quyền SELECT, INSERT, UPDATE, DELETE và không có quyền tạo DB/role hay superuser.
- Mật khẩu ngẫu nhiên nằm trong `.env` quyền 600; `.env` và khóa TLS không commit lên Git.
- Nginx bật HTTPS, CSP, HSTS, chống MIME sniffing, hạn chế iframe và rate limit API.
- Image được ghim phiên bản, container có giới hạn bộ nhớ, healthcheck và xoay vòng log.

## Dừng và xóa dữ liệu demo

```bash
docker compose down
# Chỉ dùng khi thật sự muốn xóa toàn bộ dữ liệu:
docker compose down -v
```

## Lịch sử commit theo yêu cầu

1. Commit 1: ứng dụng, PostgreSQL, pgAdmin, Nginx HTTPS và hardening nền tảng.
2. Commit 2: Prometheus, Grafana và dashboard giám sát.
3. Commit 3: Loki, Promtail và các truy vấn LogQL.

## Thông tin sinh viên

- Họ và tên: `<ĐIỀN HỌ TÊN>`
- Mã số sinh viên: `<ĐIỀN MSSV>`
- Repository GitHub: `https://github.com/<MSSV>/<MSSV>`

