/* ========================================
   Members Page (Multi-Admin)
   ======================================== */

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#10b981', '#14b8a6',
  '#3b82f6', '#06b6d4', '#f43f5e', '#d946ef'
];

const MembersPage = {
  members: [],
  admins: [],

  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="filters-bar" style="margin-bottom:0">
          <select class="filter-select" id="member-filter-admin"><option value="">Tất cả Admin</option></select>
        </div>
        <button class="btn btn-primary" id="btn-add-member"><i class="fas fa-plus"></i> Thêm thành viên</button>
      </div>
      <div class="member-grid" id="member-grid"><div class="empty-state"><p>Đang tải...</p></div></div>
    `;

    document.getElementById('btn-add-member').addEventListener('click', () => this.showAddModal());
    document.getElementById('member-filter-admin').addEventListener('change', () => this.loadMembers());

    // Load admins for filter
    try { this.admins = await App.api('/api/admins'); } catch { }
    const select = document.getElementById('member-filter-admin');
    this.admins.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = `${a.name} (${a.email})`;
      select.appendChild(opt);
    });

    await this.loadMembers();
  },

  async loadMembers() {
    const admin_id = document.getElementById('member-filter-admin').value;
    let url = '/api/members';
    if (admin_id) url += `?admin_id=${admin_id}`;

    try {
      this.members = await App.api(url);
      this.render();
    } catch (err) { App.toast('Lỗi tải thành viên', 'error'); }
  },

  render() {
    const grid = document.getElementById('member-grid');
    if (!this.members.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-users"></i><h3>Chưa có thành viên</h3></div>`;
      return;
    }
    grid.innerHTML = this.members.map(m => `
      <div class="member-card" onclick="MembersPage.showDetail(${m.id})">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="member-avatar" style="background:${m.avatar_color}">
            ${m.name.charAt(0)}
            <div class="status-dot status-dot--${m.status === 'active' ? 'active' : 'inactive'}"></div>
          </div>
          <span style="font-size:11px;color:var(--text-muted);background:rgba(255,255,255,0.04);padding:3px 8px;border-radius:4px">${m.admin_name}</span>
        </div>
        <div class="member-name">${m.name}</div>
        <div class="member-email">${m.email || 'Chưa có email'}</div>
        <div class="member-stats">
          <div class="member-stat">
            <div class="member-stat-label">Credits</div>
            <div class="member-stat-value" style="color:var(--warning)">${App.formatNumber(m.total_credits_used || 0)}</div>
          </div>
          <div class="member-stat">
            <div class="member-stat-label">Storage</div>
            <div class="member-stat-value" style="color:var(--info)">${(m.current_storage_gb || 0) < 1 ? Math.round((m.current_storage_gb || 0) * 1024) + ' MB' : (m.current_storage_gb || 0).toFixed(1) + ' GB'}</div>
          </div>
        </div>
      </div>
    `).join('');
  },

  async showAddModal() {
    let admins = [];
    try { admins = await App.api('/api/admins'); } catch { }

    const adminOptions = admins.map(a =>
      `<option value="${a.id}">${a.name} (${a.email}) - ${a.member_count}/${a.max_members || 5} members</option>`
    ).join('');

    const colorsHtml = AVATAR_COLORS.map((c, i) =>
      `<div class="color-option ${i === 0 ? 'active' : ''}" style="background:${c}" data-color="${c}" onclick="MembersPage.selectColor(this)"></div>`
    ).join('');

    App.openModal('Thêm thành viên', `
      <div class="form-group">
        <label><i class="fas fa-user-shield"></i> Thuộc Admin</label>
        <select class="filter-select" id="member-admin-id" style="width:100%">${adminOptions}</select>
      </div>
      <div class="form-group">
        <label><i class="fas fa-user"></i> Họ tên</label>
        <input type="text" id="member-name" placeholder="Nhập tên thành viên" required>
      </div>
      <div class="form-group">
        <label><i class="fas fa-envelope"></i> Email (tuỳ chọn)</label>
        <input type="email" id="member-email" placeholder="example@gmail.com">
      </div>
      <div class="form-group">
        <label><i class="fas fa-palette"></i> Màu đại diện</label>
        <div class="color-options">${colorsHtml}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="MembersPage.addMember()"><i class="fas fa-plus"></i> Thêm</button>
      </div>
    `);
  },

  selectColor(el) {
    document.querySelectorAll('.color-option').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  },

  async addMember() {
    const admin_id = parseInt(document.getElementById('member-admin-id').value);
    const name = document.getElementById('member-name').value.trim();
    const email = document.getElementById('member-email').value.trim();
    const activeColor = document.querySelector('.color-option.active');
    const avatar_color = activeColor ? activeColor.dataset.color : AVATAR_COLORS[0];

    if (!name) { App.toast('Vui lòng nhập tên', 'warning'); return; }

    try {
      await App.api('/api/members', 'POST', { admin_id, name, email, avatar_color });
      App.closeModal();
      App.toast(`Đã thêm ${name}`, 'success');
      await this.loadMembers();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async showDetail(id) {
    try {
      const data = await App.api(`/api/members/${id}`);
      const m = data.member;
      App.openModal(m.name, `
        <div style="text-align:center;margin-bottom:20px">
          <div style="width:64px;height:64px;border-radius:16px;background:${m.avatar_color};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:white;margin:0 auto 8px">${m.name.charAt(0)}</div>
          <div style="font-size:18px;font-weight:700">${m.name}</div>
          <div style="font-size:12px;color:var(--text-muted)">${m.email || 'Chưa có email'} · ${m.admin_name}</div>
        </div>
        <div class="member-stats" style="margin-bottom:20px">
          <div class="member-stat"><div class="member-stat-label">Credits</div><div class="member-stat-value" style="color:var(--warning)">${App.formatNumber(m.total_credits_used || 0)}</div></div>
          <div class="member-stat"><div class="member-stat-label">Tham gia</div><div class="member-stat-value" style="font-size:14px">${App.formatDate(m.joined_at)}</div></div>
        </div>
        ${data.creditHistory.length ? `
          <h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px"><i class="fas fa-history"></i> Credit gần đây</h4>
          <div class="activity-list" style="max-height:150px;overflow-y:auto;margin-bottom:16px">
            ${data.creditHistory.slice(0, 10).map(c => `
              <div class="activity-item">
                <div class="activity-info"><div class="activity-name">${c.description || 'Credit usage'}</div><div class="activity-desc">${App.formatDate(c.log_date)}</div></div>
                <div class="activity-amount" style="color:var(--warning)">-${App.formatNumber(c.amount)}</div>
              </div>
            `).join('')}
          </div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="MembersPage.deleteMember(${m.id}, '${m.name}')"><i class="fas fa-trash"></i> Xóa</button>
          <button class="btn btn-secondary" onclick="App.closeModal()">Đóng</button>
        </div>
      `);
    } catch (err) { App.toast('Lỗi tải thành viên', 'error'); }
  },

  async deleteMember(id, name) {
    if (!confirm(`Xóa ${name}?`)) return;
    try { await App.api(`/api/members/${id}`, 'DELETE'); App.closeModal(); App.toast(`Đã xóa ${name}`, 'success'); await this.loadMembers(); }
    catch (err) { App.toast(err.message, 'error'); }
  }
};
