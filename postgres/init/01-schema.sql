CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id BIGINT REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

INSERT INTO members (full_name, email) VALUES
  ('Nguyễn An', 'an@example.local'),
  ('Trần Bình', 'binh@example.local'),
  ('Lê Chi', 'chi@example.local')
ON CONFLICT (email) DO NOTHING;

INSERT INTO tasks (title, description, deadline, status, priority, assignee_id)
SELECT * FROM (VALUES
  ('Hoàn thiện giao diện', 'Kiểm tra hiển thị trên điện thoại', CURRENT_DATE + 3, 'in_progress', 'high', 1::bigint),
  ('Viết README', 'Bổ sung hướng dẫn chạy trên WSL2', CURRENT_DATE + 5, 'todo', 'medium', 2::bigint),
  ('Thiết kế cơ sở dữ liệu', 'Tạo bảng và ràng buộc dữ liệu', CURRENT_DATE - 1, 'done', 'high', 3::bigint)
) AS seed(title, description, deadline, status, priority, assignee_id)
WHERE NOT EXISTS (SELECT 1 FROM tasks);

