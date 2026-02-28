/* ========================================
   Storage Page (Multi-Admin)
   ======================================== */

const StoragePage = {
  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card stat-card--storage"><div class="stat-label"><i class="fas fa-hdd"></i> Tổng bộ nhớ</div><div class="stat-value" id="storage-total">--</div><div class="stat-sub">across all admins</div></div>
        <div class="stat-card stat-card--members"><div class="stat-label"><i class="fas fa-chart-bar"></i> Đã dùng</div><div class="stat-value" id="storage-used">--</div></div>
        <div class="stat-card stat-card--credits"><div class="stat-label"><i class="fas fa-battery-full"></i> Còn trống</div><div class="stat-value" id="storage-free" style="color:var(--success)">--</div></div>
      </div>
      <div class="filters-bar">
        <select class="filter-select" id="storage-filter-admin"><option value="">Tất cả Admin</option></select>
        <button class="btn btn-primary btn-sm" id="btn-update-storage"><i class="fas fa-sync-alt"></i> Cập nhật</button>
      </div>
      <div id="storage-members"><div class="empty-state"><p>Đang tải...</p></div></div>
    `;

    document.getElementById('btn-update-storage').addEventListener('click', () => this.showUpdateModal());
    document.getElementById('storage-filter-admin').addEventListener('change', () => this.loadData());

    // Populate admin filter
    try {
      const admins = await App.api('/api/admins');
      const select = document.getElementById('storage-filter-admin');
      admins.forEach(a => { const opt = document.createElement('option'); opt.value = a.id; opt.textContent = `${a.name} (${a.email})`; select.appendChild(opt); });
    } catch { }

    await this.loadData();
  },

  async loadData() {
    const admin_id = document.getElementById('storage-filter-admin').value;
    let url = '/api/storage/summary';
    if (admin_id) url += `?admin_id=${admin_id}`;

    try {
      const data = await App.api(url);
      this.renderStats(data);
      if (admin_id) {
        this.renderMemberStorage(data.member_storage);
      } else {
        this.renderAdminOverview(data);
      }
    } catch { App.toast('Lỗi tải bộ nhớ', 'error'); }
  },

  renderStats(data) {
    document.getElementById('storage-total').textContent = `${data.total_storage_tb} TB`;
    const usedDisplay = data.total_used_gb < 1 ? `${Math.round(data.total_used_gb * 1024)} MB` : `${data.total_used_gb.toFixed(2)} GB`;
    document.getElementById('storage-used').textContent = usedDisplay;
    const freeGb = data.remaining_gb;
    document.getElementById('storage-free').textContent = freeGb > 1024 ? `${(freeGb / 1024).toFixed(1)} TB` : `${freeGb.toFixed(0)} GB`;
  },

  renderAdminOverview(data) {
    const container = document.getElementById('storage-members');
    if (!data.admins || !data.admins.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-database"></i><h3>Chưa có dữ liệu</h3></div>';
      return;
    }
    container.innerHTML = `<div class="member-grid">${data.admins.map(a => `
      <div class="card" onclick="document.getElementById('storage-filter-admin').value='${a.admin_id}';StoragePage.loadData();" style="cursor:pointer">
        <div style="font-weight:700;font-size:16px;margin-bottom:8px">${a.admin_name}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${a.total_storage_tb} TB</div>
        <div style="font-size:24px;font-weight:800;color:var(--info)">${a.used_gb < 1 ? Math.round(a.used_gb * 1024) + ' MB' : a.used_gb.toFixed(2) + ' GB'}</div>
        <div style="font-size:12px;color:var(--text-muted)">đã sử dụng</div>
      </div>
    `).join('')}</div>`;
  },

  renderMemberStorage(members) {
    const container = document.getElementById('storage-members');
    if (!members || !members.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-database"></i><h3>Chưa có dữ liệu</h3></div>';
      return;
    }
    container.innerHTML = `<div class="member-grid">${members.map(m => `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="width:44px;height:44px;border-radius:12px;background:${m.avatar_color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white">${m.name.charAt(0)}</div>
          <div>
            <div style="font-weight:700;font-size:16px">${m.name}</div>
            <div style="font-size:12px;color:var(--text-muted)">Total: ${m.total_gb < 1 ? Math.round(m.total_gb * 1024) + ' MB' : m.total_gb.toFixed(2) + ' GB'}</div>
          </div>
        </div>
        <div class="storage-breakdown">
          <div class="storage-item"><div class="storage-dot storage-dot--drive"></div><span>Drive: ${m.drive_gb.toFixed(2)} GB</span></div>
          <div class="storage-item"><div class="storage-dot storage-dot--gmail"></div><span>Gmail: ${m.gmail_gb.toFixed(2)} GB</span></div>
          <div class="storage-item"><div class="storage-dot storage-dot--photos"></div><span>Photos: ${m.photos_gb.toFixed(2)} GB</span></div>
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:12px" onclick="StoragePage.showUpdateSingle(${m.id}, '${m.name}', ${m.drive_gb}, ${m.gmail_gb}, ${m.photos_gb})"><i class="fas fa-edit"></i> Cập nhật</button>
      </div>
    `).join('')}</div>`;
  },

  async showUpdateModal() {
    let admins = [], members = [];
    try { admins = await App.api('/api/admins'); } catch { }

    App.openModal('Cập nhật bộ nhớ', `
      <div class="form-group">
        <label><i class="fas fa-user-shield"></i> Admin</label>
        <select class="filter-select" id="storage-update-admin" style="width:100%" onchange="StoragePage.loadMembersForUpdate()">
          ${admins.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label><i class="fas fa-user"></i> Member</label>
        <select class="filter-select" id="storage-update-member" style="width:100%"></select>
      </div>
      <div class="form-group"><label><i class="fab fa-google-drive" style="color:var(--google-blue)"></i> Drive (GB)</label><input type="number" id="storage-drive" value="0" step="0.01" min="0"></div>
      <div class="form-group"><label><i class="fas fa-envelope" style="color:var(--google-red)"></i> Gmail (GB)</label><input type="number" id="storage-gmail" value="0" step="0.01" min="0"></div>
      <div class="form-group"><label><i class="fas fa-images" style="color:var(--google-yellow)"></i> Photos (GB)</label><input type="number" id="storage-photos" value="0" step="0.01" min="0"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="StoragePage.updateStorage()"><i class="fas fa-save"></i> Cập nhật</button>
      </div>
    `);
    if (admins.length) this.loadMembersForUpdate();
  },

  async loadMembersForUpdate() {
    const adminId = document.getElementById('storage-update-admin').value;
    const select = document.getElementById('storage-update-member');
    select.innerHTML = '';
    try {
      const members = await App.api(`/api/members?admin_id=${adminId}`);
      members.forEach(m => { const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name; select.appendChild(opt); });
    } catch { }
  },

  showUpdateSingle(id, name, drive, gmail, photos) {
    App.openModal(`Cập nhật - ${name}`, `
      <div class="form-group"><label><i class="fab fa-google-drive" style="color:var(--google-blue)"></i> Drive (GB)</label><input type="number" id="storage-drive" value="${drive}" step="0.01" min="0"></div>
      <div class="form-group"><label><i class="fas fa-envelope" style="color:var(--google-red)"></i> Gmail (GB)</label><input type="number" id="storage-gmail" value="${gmail}" step="0.01" min="0"></div>
      <div class="form-group"><label><i class="fas fa-images" style="color:var(--google-yellow)"></i> Photos (GB)</label><input type="number" id="storage-photos" value="${photos}" step="0.01" min="0"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="StoragePage.updateStorageSingle(${id})"><i class="fas fa-save"></i> Cập nhật</button>
      </div>
    `);
  },

  async updateStorage() {
    const member_id = parseInt(document.getElementById('storage-update-member').value);
    const drive_gb = parseFloat(document.getElementById('storage-drive').value) || 0;
    const gmail_gb = parseFloat(document.getElementById('storage-gmail').value) || 0;
    const photos_gb = parseFloat(document.getElementById('storage-photos').value) || 0;
    try { await App.api('/api/storage/update', 'POST', { member_id, drive_gb, gmail_gb, photos_gb }); App.closeModal(); App.toast('Đã cập nhật', 'success'); await this.loadData(); }
    catch (err) { App.toast(err.message, 'error'); }
  },

  async updateStorageSingle(id) {
    const drive_gb = parseFloat(document.getElementById('storage-drive').value) || 0;
    const gmail_gb = parseFloat(document.getElementById('storage-gmail').value) || 0;
    const photos_gb = parseFloat(document.getElementById('storage-photos').value) || 0;
    try { await App.api('/api/storage/update', 'POST', { member_id: id, drive_gb, gmail_gb, photos_gb }); App.closeModal(); App.toast('Đã cập nhật', 'success'); await this.loadData(); }
    catch (err) { App.toast(err.message, 'error'); }
  }
};
