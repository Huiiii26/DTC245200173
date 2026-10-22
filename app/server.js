'use strict';

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_APP_USER,
  password: process.env.POSTGRES_APP_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

client.collectDefaultMetrics({ prefix: 'tasktracker_' });
const httpDuration = new client.Histogram({
  name: 'tasktracker_http_request_duration_seconds',
  help: 'Thoi gian xu ly HTTP request',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});
const taskOperations = new client.Counter({
  name: 'tasktracker_task_operations_total',
  help: 'So thao tac tren cong viec',
  labelNames: ['operation', 'status']
});
const overdueTasks = new client.Gauge({
  name: 'tasktracker_overdue_tasks',
  help: 'So cong viec qua han chua hoan thanh'
});

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  const startedAt = Date.now();
  res.on('finish', () => {
    const route = req.route?.path || (req.path.startsWith('/api/tasks/') ? '/api/tasks/:id' : req.path);
    end({ method: req.method, route, status_code: res.statusCode });
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt
    }));
  });
  next();
});

const validStatuses = new Set(['todo', 'in_progress', 'done']);
const asId = (value) => {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'healthcheck_failed', error: error.message }));
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/metrics', async (_req, res) => {
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM tasks WHERE status <> 'done' AND deadline < CURRENT_DATE");
  overdueTasks.set(result.rows[0].count);
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/members', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT id, full_name, email FROM members ORDER BY full_name');
    res.json(result.rows);
  } catch (error) { next(error); }
});

const memberPayload = (body) => {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!fullName || fullName.length > 120 || !validEmail || email.length > 180) return null;
  return { fullName, email };
};

app.post('/api/members', async (req, res, next) => {
  try {
    const member = memberPayload(req.body);
    if (!member) return res.status(400).json({ error: 'Họ tên hoặc email không hợp lệ' });
    const result = await pool.query(
      'INSERT INTO members (full_name, email) VALUES ($1, $2) RETURNING id, full_name, email',
      [member.fullName, member.email]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email đã được sử dụng' });
    next(error);
  }
});

app.put('/api/members/:id', async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    const member = memberPayload(req.body);
    if (!id || !member) return res.status(400).json({ error: 'Thông tin thành viên không hợp lệ' });
    const result = await pool.query(
      'UPDATE members SET full_name=$1, email=$2 WHERE id=$3 RETURNING id, full_name, email',
      [member.fullName, member.email, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email đã được sử dụng' });
    next(error);
  }
});

app.delete('/api/members/:id', async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID không hợp lệ' });
    const result = await pool.query('DELETE FROM members WHERE id=$1 RETURNING id', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/tasks', async (req, res, next) => {
  try {
    const values = [];
    const filters = [];
    if (req.query.status && validStatuses.has(req.query.status)) {
      values.push(req.query.status);
      filters.push(`t.status = $${values.length}`);
    }
    if (req.query.q) {
      values.push(`%${String(req.query.q).slice(0, 100)}%`);
      filters.push(`(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT t.id, t.title, t.description, t.deadline, t.status, t.priority,
             t.assignee_id, m.full_name AS assignee_name, t.created_at, t.updated_at
      FROM tasks t LEFT JOIN members m ON m.id = t.assignee_id
      ${where}
      ORDER BY CASE t.status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
               t.deadline NULLS LAST, t.id DESC`, values);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/stats', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status <> 'done' AND deadline < CURRENT_DATE)::int AS overdue
      FROM tasks`);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    const { title, description = '', deadline = null, status = 'todo', priority = 'medium', assignee_id = null } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length > 200) {
      return res.status(400).json({ error: 'Tieu de bat buoc va toi da 200 ky tu' });
    }
    if (!validStatuses.has(status) || !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Trang thai hoac muc uu tien khong hop le' });
    }
    const result = await pool.query(`
      INSERT INTO tasks (title, description, deadline, status, priority, assignee_id)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title.trim(), String(description).slice(0, 2000), deadline || null, status, priority, assignee_id || null]);
    taskOperations.inc({ operation: 'create', status });
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.put('/api/tasks/:id', async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID khong hop le' });
    const { title, description = '', deadline = null, status, priority, assignee_id = null } = req.body;
    if (!title || !validStatuses.has(status) || !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Du lieu cong viec khong hop le' });
    }
    const result = await pool.query(`
      UPDATE tasks SET title=$1, description=$2, deadline=$3, status=$4, priority=$5,
        assignee_id=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [String(title).trim().slice(0, 200), String(description).slice(0, 2000), deadline || null, status, priority, assignee_id || null, id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Khong tim thay cong viec' });
    taskOperations.inc({ operation: 'update', status });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID khong hop le' });
    const result = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING status', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Khong tim thay cong viec' });
    taskOperations.inc({ operation: 'delete', status: result.rows[0].status });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));
app.use((error, _req, res, _next) => {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'request_failed', error: error.message }));
  res.status(500).json({ error: 'Loi he thong' });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'server_started', port }));
});

const shutdown = async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

