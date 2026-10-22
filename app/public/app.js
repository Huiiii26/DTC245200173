'use strict';

const state = { tasks: [], members: [] };
const board = document.querySelector('#board');
const dialog = document.querySelector('#taskDialog');
const form = document.querySelector('#taskForm');
const fields = Object.fromEntries(['taskId','title','description','deadline','assignee','taskStatus','priority','formError'].map(id => [id, document.querySelector(`#${id}`)]));
const labels = { todo: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành' };
const priorityLabels = { low: 'Ưu tiên thấp', medium: 'Ưu tiên vừa', high: 'Ưu tiên cao' };

const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const api = async (url, options) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Yêu cầu thất bại'); }
  return response.status === 204 ? null : response.json();
};

async function load() {
  const q = encodeURIComponent(document.querySelector('#search').value.trim());
  const status = document.querySelector('#statusFilter').value;
  [state.tasks, state.members] = await Promise.all([api(`/api/tasks?q=${q}&status=${status}`), api('/api/members')]);
  renderBoard();
  renderMembers();
  const stats = await api('/api/stats');
  document.querySelector('#stats').innerHTML = [
    ['Tổng công việc',stats.total],['Cần làm',stats.todo],['Đang làm',stats.in_progress],['Hoàn thành',stats.done],['Quá hạn',stats.overdue]
  ].map(([label,value]) => `<article class="stat"><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function renderMembers() {
  fields.assignee.innerHTML = '<option value="">Chưa phân công</option>' + state.members.map(m => `<option value="${m.id}">${escapeHtml(m.full_name)}</option>`).join('');
}

function renderBoard() {
  board.innerHTML = Object.entries(labels).map(([status,label]) => {
    const tasks = state.tasks.filter(t => t.status === status);
    const cards = tasks.length ? tasks.map(t => {
      const overdue = t.deadline && status !== 'done' && new Date(`${t.deadline.slice(0,10)}T23:59:59`) < new Date();
      return `<article class="task"><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description || 'Không có mô tả')}</p><div class="meta"><span class="badge ${t.priority}">${priorityLabels[t.priority]}</span>${t.assignee_name ? `<span class="badge">${escapeHtml(t.assignee_name)}</span>` : ''}</div><p class="${overdue ? 'overdue' : ''}">${t.deadline ? `Hạn: ${new Date(t.deadline).toLocaleDateString('vi-VN')}` : 'Chưa đặt hạn'}</p><div class="task-actions"><button data-edit="${t.id}">Sửa</button><button data-delete="${t.id}">Xóa</button></div></article>`;
    }).join('') : '<p class="empty">Chưa có công việc</p>';
    return `<section class="column"><h2>${label} · ${tasks.length}</h2>${cards}</section>`;
  }).join('');
}

function openTask(task) {
  form.reset(); fields.formError.textContent = '';
  fields.taskId.value = task?.id || '';
  fields.title.value = task?.title || '';
  fields.description.value = task?.description || '';
  fields.deadline.value = task?.deadline?.slice(0,10) || '';
  fields.taskStatus.value = task?.status || 'todo';
  fields.priority.value = task?.priority || 'medium';
  fields.assignee.value = task?.assignee_id || '';
  document.querySelector('#dialogTitle').textContent = task ? 'Cập nhật công việc' : 'Thêm công việc';
  dialog.showModal();
}

form.addEventListener('submit', async e => {
  e.preventDefault(); fields.formError.textContent = '';
  const id = fields.taskId.value;
  const body = JSON.stringify({ title: fields.title.value, description: fields.description.value, deadline: fields.deadline.value || null, status: fields.taskStatus.value, priority: fields.priority.value, assignee_id: fields.assignee.value ? Number(fields.assignee.value) : null });
  try { await api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PUT' : 'POST', body }); dialog.close(); await load(); }
  catch (error) { fields.formError.textContent = error.message; }
});

board.addEventListener('click', async e => {
  const editId = Number(e.target.dataset.edit); const deleteId = Number(e.target.dataset.delete);
  if (editId) openTask(state.tasks.find(t => t.id === editId));
  if (deleteId && confirm('Xóa công việc này?')) { await api(`/api/tasks/${deleteId}`, { method: 'DELETE' }); await load(); }
});
document.querySelector('#newTask').addEventListener('click', () => openTask());
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancelDialog').addEventListener('click', () => dialog.close());
document.querySelector('#statusFilter').addEventListener('change', load);
let timer; document.querySelector('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
load().catch(error => { board.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; });

