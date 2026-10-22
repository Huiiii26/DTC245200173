# Đề 24 Hệ thống Quản lý Công việc Task Tracker

Ứng dụng quản lý công việc cá nhân và nhóm, gồm tiêu đề, mô tả, thời hạn, trạng thái, mức ưu tiên và người phụ trách. Toàn bộ hệ thống chạy bằng Docker Compose trên WSL2 Ubuntu, truy cập duy nhất qua Nginx HTTPS.

## Công nghệ

- Node.js 20 và Express 4, giao diện HTML CSS JavaScript thuần.
- PostgreSQL 17 và pgAdmin 4.
- Nginx unprivileged làm reverse proxy, HTTPS tự ký và security headers.
- Prometheus, Grafana, cAdvisor, node-exporter, nginx-exporter và postgres-exporter.
- Loki và Promtail cho log tập trung.

## Chuẩn bị WSL2 Ubuntu không dùng Docker Desktop

Mở PowerShell bằng quyền Administrator:

```powershell
wsl --install -d Ubuntu
wsl --set-default-version 2
```

Khởi động lại Windows nếu được yêu cầu, mở ứng dụng Ubuntu và tạo user Linux. Sau đó chạy trong Ubuntu:

```bash
sudo apt update
sudo apt install -y git openssl ca-certificates curl
git clone https://github.com/DTC245200173/DTC245200173.git ~/task-tracker
cd ~/task-tracker
chmod +x scripts/*.sh postgres/init/*.sh
./scripts/install-docker-ubuntu.sh
```

Đóng Ubuntu, chạy `wsl --shutdown` trong PowerShell rồi mở Ubuntu lại. Kiểm tra:

```bash
cd ~/task-tracker
sudo service docker start
docker version
docker compose version
```

Repository phải nằm trong hệ thống tệp Linux (`~/task-tracker`), không chạy trực tiếp từ `/mnt/c` hoặc `/mnt/d`, để tránh chậm I/O và lỗi quyền. Dự án sử dụng Docker Engine cài trực tiếp trong Ubuntu, không phụ thuộc Docker Desktop.

## Khởi chạy

```bash
git clone https://github.com/DTC245200173/DTC245200173.git task-tracker
cd task-tracker
chmod +x scripts/*.sh postgres/init/*.sh
./scripts/gen-env.sh
./scripts/gen-cert.sh
docker compose up -d --build
docker compose ps
./scripts/verify-system.sh
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

## Giám sát bằng Prometheus và Grafana

Prometheus thu thập metrics 15 giây một lần từ sáu nguồn: ứng dụng, Nginx, PostgreSQL, cAdvisor, node-exporter và chính Prometheus. Dashboard `Task Tracker - Giám sát hệ thống` được Grafana nạp tự động, không cần import thủ công.

```bash
curl http://127.0.0.1:9090/-/healthy
curl http://127.0.0.1:9090/api/v1/targets
docker compose logs --tail=30 prometheus grafana
```

Các biểu đồ chính gồm trạng thái dịch vụ, CPU/RAM container, CPU/RAM máy chủ, request HTTP theo status, độ trễ p95, kết nối và giao dịch PostgreSQL. Prometheus cũng có cảnh báo khi dịch vụ ngừng, tỷ lệ HTTP 5xx cao hoặc xuất hiện công việc quá hạn.

## Log tập trung với Loki và Promtail

Promtail tự phát hiện các container thuộc project `tasktracker` qua Docker socket chỉ đọc, bóc lớp log Docker, gắn nhãn `service`, `container`, `stream`, `level`, `status` rồi gửi tới Loki. Loki lưu dữ liệu bảy ngày. Truy vấn tại Grafana → Explore → chọn datasource Loki.

```logql
# 1. Toàn bộ log của ứng dụng trong 30 phút gần nhất
{service="app"}

# 2. Log lỗi hoặc cảnh báo của ứng dụng
{service="app"} | json | level=~"error|warn"

# 3. Request lỗi 4xx và 5xx qua Nginx
{service="nginx"} | json | status >= 400

# 4. Tìm thao tác tạo, sửa hoặc xóa công việc
{service="app"} |~ "POST|PUT|DELETE"

# 5. Năm URL được truy cập nhiều nhất trong 15 phút
topk(5, sum by (path) (count_over_time({service="app"} | json | __error__="" [15m])))
```

Tạo dữ liệu demo và kiểm tra:

```bash
curl -k https://localhost/api/tasks
curl -k https://localhost/khong-ton-tai
docker compose logs --tail=30 promtail loki
```

Panel `Log lỗi ứng dụng và Nginx` được provision sẵn trong dashboard Grafana.

## Hardening đã áp dụng

- Container ứng dụng và Nginx chạy non-root, `no-new-privileges`, bỏ toàn bộ Linux capabilities, root filesystem chỉ đọc và `/tmp` dùng `tmpfs`.
- Tách mạng `frontend`, `backend`, `monitoring`; `backend` là mạng nội bộ. PostgreSQL không mở cổng ra ngoài.
- User ứng dụng PostgreSQL chỉ có quyền SELECT, INSERT, UPDATE, DELETE; user exporter chỉ có role `pg_monitor`. Cả hai đều không có quyền tạo DB/role hay superuser.
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
- Mã số sinh viên: `DTC245200173`
- Repository GitHub dự kiến: `https://github.com/DTC245200173/DTC245200173`

