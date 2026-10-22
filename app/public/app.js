'use strict';

const state = { tasks: [], members: [] };
const board = document.querySelector('#board');
const dialog = document.querySelector('#taskDialog');
const form = document.querySelector('#taskForm');
const fields = Object.fromEntries(['taskId','title','description','deadline','assignee','taskStatus','priority','formError'].map(id => [id, document.querySelector(`#${id}`)]));
const memberDialog = document.querySelector('#memberDialog');
const memberForm = document.querySelector('#memberForm');
const memberFields = Object.fromEntries(['memberId','memberName','memberEmail','memberError'].map(id => [id, document.querySelector(`#${id}`)]));
const labels = { todo: 'Cần làm', in_progress: 'Đang làm', done: 'Hoàn thành' };
const priorityLabels = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };

const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const api = async (url, options) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Yêu cầu thất bại'); }
  return response.status === 204 ? null : response.json();
};

async function load() {
  const q = encodeURIComponent(document.querySelector('#search').value.trim());
  const status = document.querySelector('#statusFilter').value;
  const [tasks, members, stats] = await Promise.all([
    api(`/api/tasks?q=${q}&status=${status}`), api('/api/members'), api('/api/stats')
  ]);
  state.tasks = tasks;
  state.members = members;
  renderBoard();
  renderMembers();
  renderOverview(stats);
  renderTeam();
}

function renderMembers() {
  fields.assignee.innerHTML = '<option value="">Chưa phân công</option>' + state.members.map(m => `<option value="${m.id}">${escapeHtml(m.full_name)}</option>`).join('');
}

function renderOverview(stats) {
  const items = [
    ['Tổng công việc', stats.total], ['Cần làm', stats.todo], ['Đang làm', stats.in_progress],
    ['Hoàn thành', stats.done], ['Quá hạn', stats.overdue]
  ];
  document.querySelector('#overviewStats').innerHTML = items
    .map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join('');

  const recent = state.tasks.slice(0, 5);
  document.querySelector('#recentTasks').innerHTML = recent.length
    ? `<table class="task-table"><thead><tr><th>Công việc</th><th>Người phụ trách</th><th>Trạng thái</th></tr></thead><tbody>${recent.map(task => `<tr><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.assignee_name || 'Chưa phân công')}</td><td><span class="badge status-${task.status}">${labels[task.status]}</span></td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Chưa có công việc.</p>';
}

function renderTeam() {
  document.querySelector('#memberList').innerHTML = state.members.length
    ? `<table class="task-table"><thead><tr><th>Họ và tên</th><th>Email</th><th></th></tr></thead><tbody>${state.members.map(member => `<tr><td><span class="person"><span class="person-mark">${escapeHtml(member.full_name.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase())}</span>${escapeHtml(member.full_name)}</span></td><td class="member-email">${escapeHtml(member.email)}</td><td><div class="row-actions"><button data-member-edit="${member.id}">Sửa</button><button class="delete" data-member-delete="${member.id}">Xóa</button></div></td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Chưa có thành viên.</p>';
}

function renderBoard() {
  if (!state.tasks.length) {
    board.innerHTML = '<p class="empty">Chưa có công việc phù hợp với bộ lọc.</p>';
    return;
  }
  const rows = state.tasks.map(t => {
    const overdue = t.deadline && t.status !== 'done' && new Date(`${t.deadline.slice(0,10)}T23:59:59`) < new Date();
    const person = t.assignee_name || 'Chưa phân công';
    const initials = t.assignee_name
      ? t.assignee_name.split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()
      : '—';
    return `<tr>
      <td class="task-title"><strong>${escapeHtml(t.title)}</strong><small title="${escapeHtml(t.description || '')}">${escapeHtml(t.description || 'Không có mô tả')}</small></td>
      <td><span class="person"><span class="person-mark">${escapeHtml(initials)}</span>${escapeHtml(person)}</span></td>
      <td class="deadline ${overdue ? 'overdue' : ''}">${t.deadline ? new Date(t.deadline).toLocaleDateString('vi-VN') : 'Chưa đặt'}</td>
      <td><span class="badge priority-${t.priority}">${priorityLabels[t.priority]}</span></td>
      <td><span class="badge status-${t.status}">${labels[t.status]}</span></td>
      <td><div class="row-actions"><button data-edit="${t.id}">Sửa</button><button class="delete" data-delete="${t.id}">Xóa</button></div></td>
    </tr>`;
  }).join('');
  board.innerHTML = `<table class="task-table">
    <thead><tr><th>Công việc</th><th>Người phụ trách</th><th>Thời hạn</th><th>Ưu tiên</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
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

function openMember(member) {
  memberForm.reset();
  memberFields.memberError.textContent = '';
  memberFields.memberId.value = member?.id || '';
  memberFields.memberName.value = member?.full_name || '';
  memberFields.memberEmail.value = member?.email || '';
  document.querySelector('#memberDialogTitle').textContent = member ? 'Cập nhật thành viên' : 'Thêm thành viên';
  memberDialog.showModal();
}

form.addEventListener('submit', async e => {
  e.preventDefault(); fields.formError.textContent = '';
  const id = fields.taskId.value;
  const body = JSON.stringify({ title: fields.title.value, description: fields.description.value, deadline: fields.deadline.value || null, status: fields.taskStatus.value, priority: fields.priority.value, assignee_id: fields.assignee.value ? Number(fields.assignee.value) : null });
  try { await api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PUT' : 'POST', body }); dialog.close(); await load(); }
  catch (error) { fields.formError.textContent = error.message; }
});

memberForm.addEventListener('submit', async e => {
  e.preventDefault();
  memberFields.memberError.textContent = '';
  const id = memberFields.memberId.value;
  const body = JSON.stringify({
    full_name: memberFields.memberName.value,
    email: memberFields.memberEmail.value
  });
  try {
    await api(id ? `/api/members/${id}` : '/api/members', { method: id ? 'PUT' : 'POST', body });
    memberDialog.close();
    await load();
  } catch (error) {
    memberFields.memberError.textContent = error.message;
  }
});

board.addEventListener('click', async e => {
  const editId = Number(e.target.dataset.edit); const deleteId = Number(e.target.dataset.delete);
  if (editId) openTask(state.tasks.find(t => t.id === editId));
  if (deleteId && confirm('Xóa công việc này?')) { await api(`/api/tasks/${deleteId}`, { method: 'DELETE' }); await load(); }
});
document.querySelector('#memberList').addEventListener('click', async e => {
  const editId = Number(e.target.dataset.memberEdit);
  const deleteId = Number(e.target.dataset.memberDelete);
  if (editId) openMember(state.members.find(member => Number(member.id) === editId));
  if (deleteId && confirm('Xóa thành viên này? Các công việc của họ sẽ chuyển về chưa phân công.')) {
    await api(`/api/members/${deleteId}`, { method: 'DELETE' });
    await load();
  }
});
document.querySelector('#newTask').addEventListener('click', () => openTask());
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancelDialog').addEventListener('click', () => dialog.close());
document.querySelector('#newMember').addEventListener('click', () => openMember());
document.querySelector('#closeMemberDialog').addEventListener('click', () => memberDialog.close());
document.querySelector('#cancelMemberDialog').addEventListener('click', () => memberDialog.close());
document.querySelector('#statusFilter').addEventListener('change', load);
function updateActiveNav() {
  const views = { '#overview': '#overviewView', '#tasks': '#tasksView', '#team': '#teamView' };
  const current = views[window.location.hash] ? window.location.hash : '#tasks';
  document.querySelectorAll('.nav a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === current);
  });
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  document.querySelector(views[current]).classList.add('active');
}
window.addEventListener('hashchange', updateActiveNav);
updateActiveNav();
let timer; document.querySelector('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
load().catch(error => { board.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; });

