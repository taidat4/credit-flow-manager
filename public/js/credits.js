/* ========================================
   Credits Page (Multi-Admin)
   ======================================== */

const CreditsPage = {
  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="stats-grid" id="credit-stats">
        <div class="stat-card stat-card--credits"><div class="stat-label"><i class="fas fa-coins"></i> Tổng Credit</div><div class="stat-value" id="credit-total">--</div><div class="stat-sub">across all admins</div></div>
        <div class="stat-card stat-card--storage"><div class="stat-label"><i class="fas fa-check-circle"></i> Đã dùng</div><div class="stat-value" id="credit-used" style="color:var(--warning)">--</div><div class="stat-sub">trong kỳ hiện tại</div></div>
        <div class="stat-card stat-card--members"><div class="stat-label"><i class="fas fa-battery-three-quarters"></i> Còn lại</div><div class="stat-value" id="credit-remaining" style="color:var(--success)">--</div></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700">Lịch sử Credit</h3>
        <button class="btn btn-primary" id="btn-add-credit"><i class="fas fa-plus"></i> Ghi nhận</button>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="filters-bar">
          <select class="filter-select" id="credit-filter-admin"><option value="">Tất cả Admin</option></select>
          <select class="filter-select" id="credit-filter-member"><option value="">Tất cả Member</option></select>
          <input type="date" class="filter-input" id="credit-filter-start">
          <input type="date" class="filter-input" id="credit-filter-end">
          <button class="btn btn-secondary btn-sm" id="btn-filter-credits"><i class="fas fa-filter"></i> Lọc</button>
        </div>
        <div class="table-container">
          <table class="data-table"><thead><tr>
            <th>Admin</th><th>Member</th><th>Số lượng</th><th>Mô tả</th><th>Ngày</th><th>Thao tác</th>
          </tr></thead><tbody id="credit-tbody">
            <tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Đang tải...</td></tr>
          </tbody></table>
        </div>
      </div>
    `;

    document.getElementById('btn-add-credit').addEventListener('click', () => this.showAddModal());
    document.getElementById('btn-filter-credits').addEventListener('click', () => this.loadHistory());

    await this.loadFilters();
    await this.loadSummary();
    await this.loadHistory();
  },

  async loadFilters() {
    try {
      const admins = await App.api('/api/admins');
      const adminSelect = document.getElementById('credit-filter-admin');
      admins.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id; opt.textContent = a.name;
        adminSelect.appendChild(opt);
      });
    } catch { }
  },

  async loadSummary() {
    try {
      const data = await App.api('/api/credits/summary');
      document.getElementById('credit-total').textContent = App.formatNumber(data.total_credits);
      document.getElementById('credit-used').textContent = App.formatNumber(data.total_used);
      document.getElementById('credit-remaining').textContent = App.formatNumber(data.total_remaining);
    } catch { }
  },

  async loadHistory() {
    const admin_id = document.getElementById('credit-filter-admin').value;
    const member_id = document.getElementById('credit-filter-member').value;
    const start_date = document.getElementById('credit-filter-start').value;
    const end_date = document.getElementById('credit-filter-end').value;

    let url = '/api/credits/history?limit=100';
    if (admin_id) url += `&admin_id=${admin_id}`;
    if (member_id) url += `&member_id=${member_id}`;
    if (start_date) url += `&start_date=${start_date}`;
    if (end_date) url += `&end_date=${end_date}`;

    try {
      const logs = await App.api(url);
      this.renderTable(logs);
    } catch { App.toast('Lỗi tải lịch sử', 'error'); }
  },

  renderTable(logs) {
    const tbody = document.getElementById('credit-tbody');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Không có dữ liệu</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td style="font-size:13px;color:var(--text-secondary)">${l.admin_name || '-'}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:24px;height:24px;border-radius:6px;background:${l.avatar_color || '#6366f1'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white">${(l.member_name || '?').charAt(0)}</div>
            ${l.member_name || '-'}
          </div>
        </td>
        <td style="font-weight:700;color:var(--warning)">-${App.formatNumber(l.amount)}</td>
        <td style="color:var(--text-secondary)">${l.description || '-'}</td>
        <td>${App.formatDate(l.log_date)}</td>
        <td>
          <button class="btn btn-danger btn-sm btn-icon" onclick="CreditsPage.deleteLog(${l.id})" title="Xóa"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  },

  async showAddModal() {
    let admins = [];
    try { admins = await App.api('/api/admins'); } catch { }

    App.openModal('Ghi nhận Credit', `
      <div class="form-group">
        <label><i class="fas fa-user-shield"></i> Admin Account</label>
        <select class="filter-select" id="credit-log-admin" style="width:100%" onchange="CreditsPage.loadMembersForAdmin()">
          ${admins.map(a => `<option value="${a.id}">${a.name} (${a.email})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label><i class="fas fa-user"></i> Thành viên (tuỳ chọn)</label>
        <select class="filter-select" id="credit-log-member" style="width:100%"><option value="">-- Chọn member --</option></select>
      </div>
      <div class="form-group">
        <label><i class="fas fa-coins"></i> Số lượng Credit</label>
        <input type="number" id="credit-log-amount" placeholder="VD: 500" required min="1">
      </div>
      <div class="form-group">
        <label><i class="fas fa-pen"></i> Mô tả</label>
        <input type="text" id="credit-log-desc" placeholder="VD: Sử dụng Gemini">
      </div>
      <div class="form-group">
        <label><i class="fas fa-calendar"></i> Ngày</label>
        <input type="date" class="filter-input" id="credit-log-date" value="${new Date().toISOString().split('T')[0]}" style="width:100%">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="CreditsPage.addLog()"><i class="fas fa-plus"></i> Ghi nhận</button>
      </div>
    `);

    // Load members for first admin
    if (admins.length) this.loadMembersForAdmin();
  },

  async loadMembersForAdmin() {
    const adminId = document.getElementById('credit-log-admin').value;
    const select = document.getElementById('credit-log-member');
    select.innerHTML = '<option value="">-- Chọn member --</option>';
    try {
      const members = await App.api(`/api/members?admin_id=${adminId}`);
      members.forEach(m => { const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name; select.appendChild(opt); });
    } catch { }
  },

  async addLog() {
    const admin_id = parseInt(document.getElementById('credit-log-admin').value);
    const member_id = document.getElementById('credit-log-member').value ? parseInt(document.getElementById('credit-log-member').value) : null;
    const amount = parseInt(document.getElementById('credit-log-amount').value);
    const description = document.getElementById('credit-log-desc').value;
    const log_date = document.getElementById('credit-log-date').value;

    if (!amount || amount <= 0) { App.toast('Số lượng phải > 0', 'warning'); return; }

    try {
      await App.api('/api/credits/log', 'POST', { admin_id, member_id, amount, description, log_date });
      App.closeModal(); App.toast('Đã ghi nhận credit', 'success');
      await this.loadSummary(); await this.loadHistory();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteLog(id) {
    if (!confirm('Xóa?')) return;
    try { await App.api(`/api/credits/log/${id}`, 'DELETE'); App.toast('Đã xóa', 'success'); await this.loadSummary(); await this.loadHistory(); }
    catch (err) { App.toast(err.message, 'error'); }
  }
};
