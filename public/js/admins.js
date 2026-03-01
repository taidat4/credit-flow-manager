/* ========================================
   Quản lý Acc Farm + TOTP 2FA + Đồng bộ
   ======================================== */

const ADMIN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#10b981', '#14b8a6',
  '#3b82f6', '#06b6d4', '#f43f5e', '#d946ef'
];

const AdminsPage = {
  admins: [],
  totpIntervals: {},
  syncPolls: {},
  _refreshInterval: null,
  _syncProgressInterval: null,
  _detailCache: {},  // Store admin detail for toggle/copy operations

  async load() {
    this.clearTotpIntervals();
    this.clearSyncPolls();
    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <h3 style="font-size:16px;color:var(--text-secondary)">Quản lý tài khoản Google One Admin</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success" id="btn-sync-all" title="Đồng bộ tất cả tài khoản farm"><i class="fas fa-sync-alt"></i> Đồng bộ tất cả</button>
          <button class="btn btn-primary" id="btn-add-admin"><i class="fas fa-plus"></i> Thêm Admin</button>
        </div>
      </div>
      <div id="admin-list"><div class="empty-state"><p>Đang tải...</p></div></div>
    `;
    document.getElementById('btn-add-admin').addEventListener('click', () => this.showAddModal());
    document.getElementById('btn-sync-all').addEventListener('click', () => this.syncAll());
    await this.loadAdmins();
    this.startAutoRefresh();
  },

  clearTotpIntervals() {
    Object.values(this.totpIntervals).forEach(id => clearInterval(id));
    this.totpIntervals = {};
  },

  clearSyncPolls() {
    Object.values(this.syncPolls).forEach(id => clearInterval(id));
    this.syncPolls = {};
    if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null; }
  },

  async loadAdmins(silent) {
    try {
      this.admins = await App.api('/api/admins');
      this.render();
    } catch (err) { if (!silent) App.toast('Lỗi tải admins', 'error'); }
  },

  startAutoRefresh() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    this._refreshInterval = setInterval(() => this.loadAdmins(true), 20000);
    console.log('[Admins] Auto-refresh every 20s started');
    // Also start auto-sync progress polling
    this.startSyncProgressPoll();
  },

  // Poll sync-status for all admins every 5s to show auto-sync progress
  startSyncProgressPoll() {
    if (this._syncProgressInterval) clearInterval(this._syncProgressInterval);
    this._syncProgressInterval = setInterval(async () => {
      for (const a of this.admins) {
        if (!a.has_google_password || this.syncPolls[a.id]) continue; // skip if already polling
        try {
          const status = await App.api(`/api/admins/${a.id}/sync-status`);
          if (status.status === 'syncing') {
            this.startSyncPoll(a.id); // reuse existing poll mechanism
          }
        } catch { }
      }
    }, 5000);
  },

  // Check if any admin is currently syncing
  isAnySyncing() {
    return Object.keys(this.syncPolls).length > 0;
  },

  render() {
    const container = document.getElementById('admin-list');
    if (!this.admins.length) {
      container.innerHTML = `<div class="empty-state" style="padding:60px"><i class="fas fa-user-shield"></i><h3>Chưa có Admin Account</h3><p>Thêm tài khoản Google One đầu tiên</p>
        <button class="btn btn-primary" onclick="AdminsPage.showAddModal()"><i class="fas fa-plus"></i> Thêm Admin</button></div>`;
      return;
    }

    container.innerHTML = `<div class="member-grid">${this.admins.map(a => `
      <div class="card" style="cursor:pointer;position:relative;overflow:hidden" onclick="AdminsPage.showDetail(${a.id})">
        <div style="position:absolute;top:12px;right:12px;display:flex;gap:4px">
          ${a.has_google_password ? '<span class="badge badge--active" style="font-size:10px"><i class="fas fa-sync-alt"></i> Đồng bộ</span>' : ''}
          <span class="badge badge--${a.status === 'active' ? 'active' : 'inactive'}" style="font-size:10px">${a.status === 'active' ? '● Hoạt động' : '● Tắt'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-right:100px">
          <div style="width:44px;height:44px;min-width:44px;border-radius:12px;background:${a.avatar_color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white">${a.name.charAt(0)}</div>
          <div style="overflow:hidden">
            <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.name}</div>
            <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.email}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Credit còn</div>
            <div style="font-size:22px;font-weight:800;color:${a.credits_remaining > 5000 ? 'var(--success)' : 'var(--warning)'}">${App.formatNumber(a.credits_remaining)}</div>
          </div>
          <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Bộ nhớ</div>
            <div style="font-size:22px;font-weight:800;color:var(--info)">${a.storage_used || '0 GB'}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Đã dùng</div>
            <div style="font-size:18px;font-weight:700;color:var(--warning)">${App.formatNumber(a.credits_used)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Thành viên</div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${a.member_count}<span style="color:var(--text-muted);font-size:12px">/${a.max_members || 5}</span></div>
          </div>
        </div>
        <div class="progress-bar" style="margin-top:4px">
          <div class="progress-fill ${a.credits_used / a.total_monthly_credits > 0.8 ? 'progress-fill--red' : 'progress-fill--accent'}" style="width:${Math.round(a.credits_used / a.total_monthly_credits * 100)}%"></div>
        </div>
        ${a.last_sync ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;text-align:right"><i class="fas fa-clock"></i> ${new Date(a.last_sync).toLocaleString('vi-VN')}</div>` : ''}
        <div id="sync-status-${a.id}" style="margin-top:4px"></div>
      </div>
    `).join('')}</div>`;
  },

  // ========= SYNC ==========
  async syncAdmin(id, event) {
    if (event) event.stopPropagation();
    try {
      await App.api(`/api/admins/${id}/sync`, 'POST');
      App.toast('Bắt đầu sync...', 'info');
      this.startSyncPoll(id);
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async syncAll() {
    try {
      await App.api('/api/admins/sync-all', 'POST');
      App.toast('Đang đồng bộ tất cả tài khoản...', 'info');
      this.admins.forEach(a => {
        if (a.has_google_password) this.startSyncPoll(a.id);
      });
    } catch (err) { App.toast(err.message, 'error'); }
  },

  startSyncPoll(adminId) {
    if (this.syncPolls[adminId]) clearInterval(this.syncPolls[adminId]);

    const statusEl = document.getElementById(`sync-status-${adminId}`);
    if (statusEl) {
      statusEl.innerHTML = `<div style="font-size:12px;color:var(--info);display:flex;align-items:center;gap:6px"><i class="fas fa-spinner fa-spin"></i> Đang sync...</div>`;
    }

    this.syncPolls[adminId] = setInterval(async () => {
      try {
        const status = await App.api(`/api/admins/${adminId}/sync-status`);
        const el = document.getElementById(`sync-status-${adminId}`);
        if (!el) return;

        if (status.status === 'syncing') {
          el.innerHTML = `<div style="font-size:12px;color:var(--info);display:flex;align-items:center;gap:6px"><i class="fas fa-spinner fa-spin"></i> ${status.message}</div>`;
        } else if (status.status === 'done') {
          el.innerHTML = `<div style="font-size:12px;color:var(--success);display:flex;align-items:center;gap:6px"><i class="fas fa-check-circle"></i> ${status.message}</div>`;
          clearInterval(this.syncPolls[adminId]);
          delete this.syncPolls[adminId];
          // Refresh admin card list
          setTimeout(() => this.loadAdmins(), 1000);
          // If detail modal is open for this admin, refresh it in-place
          const detailStatusEl = document.getElementById(`sync-detail-status-${adminId}`);
          if (detailStatusEl) {
            setTimeout(() => this.showDetail(adminId), 1500);
          }
        } else if (status.status === 'error') {
          el.innerHTML = `<div style="font-size:12px;color:var(--danger);display:flex;align-items:center;gap:6px"><i class="fas fa-exclamation-circle"></i> ${status.message}</div>`;
          clearInterval(this.syncPolls[adminId]);
          delete this.syncPolls[adminId];
        }
      } catch { }
    }, 2000);
  },

  // ========= ADD MODAL ==========
  showAddModal() {
    const colorsHtml = ADMIN_COLORS.map((c, i) =>
      `<div class="color-option ${i === 0 ? 'active' : ''}" style="background:${c}" data-color="${c}" onclick="AdminsPage.selectColor(this)"></div>`
    ).join('');

    App.openModal('Thêm Acc Farm', `
      <div class="form-group">
        <label><i class="fas fa-envelope"></i> Email Google</label>
        <input type="email" id="admin-email" placeholder="example@gmail.com" required>
      </div>
      <div class="form-group">
        <label><i class="fas fa-user"></i> Tên hiển thị</label>
        <input type="text" id="admin-name" placeholder="VD: Account 1" required>
      </div>
      <div class="form-group">
        <label><i class="fas fa-key"></i> Mật khẩu Google</label>
        <input type="password" id="admin-google-pw" placeholder="Mật khẩu đăng nhập Google">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Dùng để auto-sync credit/storage (mã hóa AES-256)</div>
      </div>
      <div class="form-group">
        <label><i class="fas fa-shield-alt"></i> TOTP Secret (2FA)</label>
        <input type="text" id="admin-totp" placeholder="VD: w7ek jhba nrx5 yqfz oonb dnbb d2bq xbrs">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Mã secret 2FA từ Google (tuỳ chọn)</div>
      </div>
      <div class="form-group">
        <label><i class="fas fa-coins"></i> Credit hàng tháng</label>
        <input type="number" id="admin-credits" value="25000">
      </div>
      <div class="form-group">
        <label><i class="fas fa-database"></i> Storage (TB)</label>
        <input type="number" id="admin-storage" value="30" step="0.1">
      </div>
      <div class="form-group">
        <label><i class="fas fa-sticky-note"></i> Ghi chú</label>
        <input type="text" id="admin-notes" placeholder="Ghi chú tuỳ chọn...">
      </div>
      <div class="form-group">
        <label><i class="fas fa-palette"></i> Màu</label>
        <div class="color-options">${colorsHtml}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="AdminsPage.addAdmin()"><i class="fas fa-plus"></i> Thêm</button>
      </div>
    `);
  },

  selectColor(el) {
    document.querySelectorAll('.color-option').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  },

  async addAdmin() {
    const email = document.getElementById('admin-email').value.trim();
    const name = document.getElementById('admin-name').value.trim();
    const google_password = document.getElementById('admin-google-pw').value;
    const totp_secret = document.getElementById('admin-totp').value.trim();
    const total_monthly_credits = parseInt(document.getElementById('admin-credits').value) || 25000;
    const total_storage_tb = parseFloat(document.getElementById('admin-storage').value) || 30;
    const notes = document.getElementById('admin-notes').value.trim();
    const activeColor = document.querySelector('.color-option.active');
    const avatar_color = activeColor ? activeColor.dataset.color : ADMIN_COLORS[0];

    if (!email || !name) { App.toast('Email và tên là bắt buộc', 'warning'); return; }

    try {
      await App.api('/api/admins', 'POST', { email, name, google_password, totp_secret, total_monthly_credits, total_storage_tb, avatar_color, notes });
      App.closeModal();
      App.toast(`Đã thêm admin ${name}`, 'success');
      await this.loadAdmins();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  // ========= DETAIL MODAL ==========
  async showDetail(id) {
    this.currentDetailAdminId = id;
    try {
      const data = await App.api(`/api/admins/${id}`);
      const a = data.admin;
      const members = data.members;
      const activeMembers = members.filter(m => m.status === 'active');
      const pendingMembers = members.filter(m => m.status === 'pending');
      const slotsLeft = a.max_members - activeMembers.length - pendingMembers.length;

      // Cache admin data for toggle/copy operations
      this._detailCache[id] = a;
      this._pwVisible = this._pwVisible || {};

      let totpHtml = '';
      if (a.has_totp) {
        totpHtml = `
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;font-weight:600;color:var(--success)"><i class="fas fa-shield-alt"></i> TOTP</span>
              <span style="font-size:10px;color:var(--text-muted)" id="totp-countdown-${a.id}">--s</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div id="totp-code-${a.id}" style="font-size:24px;font-weight:800;letter-spacing:4px;font-family:monospace;color:var(--text-primary)">------</div>
              <button class="btn btn-success btn-sm" style="padding:3px 8px" onclick="AdminsPage.copyTotp(${a.id})" title="Copy"><i class="fas fa-copy"></i></button>
            </div>
            <div class="progress-bar" style="height:2px;margin-top:6px">
              <div class="progress-fill progress-fill--green" id="totp-progress-${a.id}" style="width:100%"></div>
            </div>
          </div>
        `;
      }

      // Sync section - compact inline with countdown
      const syncHtml = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:10px">
            <button class="btn btn-info btn-sm" onclick="AdminsPage.syncAdmin(${a.id})" ${!a.has_google_password ? 'disabled' : ''} style="padding:4px 10px;font-size:11px;white-space:nowrap">
              <i class="fas fa-sync-alt"></i> Đồng bộ ngay
            </button>
            <div style="flex:1;font-size:11px;color:var(--text-muted)">
              ${a.last_sync ? `<i class="fas fa-clock"></i> ${new Date(a.last_sync).toLocaleString('vi-VN')}` : 'Chưa đồng bộ'}
            </div>
            <span id="sync-countdown-${a.id}" style="font-size:10px;color:var(--accent-light);font-weight:600;white-space:nowrap"></span>
            ${a.has_google_password ? '<span class="badge badge--active" style="font-size:9px">Đồng bộ</span>' : ''}
            <div id="sync-detail-status-${a.id}"></div>
          </div>
        `;

      // Credit & Storage summary (matching card outside)
      const creditPercent = a.total_monthly_credits > 0 ? Math.round(((a.credits_used || 0) / a.total_monthly_credits) * 100) : 0;
      const storageGB = a.storage_used_gb || 0;
      const storageTotalGB = (a.total_storage_tb || 0) * 1024;
      const storageLabel = storageGB >= 1 ? storageGB.toFixed(1) + ' GB' : Math.round(storageGB * 1024) + ' MB';
      const creditSummaryHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:10px 12px;text-align:center">
            <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Credit còn</div>
            <div style="font-size:20px;font-weight:800;color:var(--success)">${App.formatNumber(a.credits_remaining || 0)}</div>
            <div style="font-size:9px;color:var(--text-muted)">/ ${App.formatNumber(a.total_monthly_credits)}</div>
          </div>
          <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:10px 12px;text-align:center">
            <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Đã dùng</div>
            <div style="font-size:20px;font-weight:800;color:var(--warning)">${App.formatNumber(a.credits_used || 0)}</div>
            <div style="font-size:9px;color:var(--text-muted)">${creditPercent}%</div>
          </div>
        </div>
      `;

      const membersHtml = members.length ? members.map(m => {
        const used = m.total_credits_used || 0;
        const limit = m.credit_limit || 0;
        const isOverLimit = limit > 0 && used >= limit;
        const isNearLimit = limit > 0 && used >= limit * 0.8;
        const creditColor = isOverLimit ? 'var(--danger)' : isNearLimit ? '#f97316' : 'var(--warning)';
        const limitLabel = limit > 0 ? App.formatNumber(limit) : '∞';
        const bgColor = isOverLimit ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)';
        const borderColor = isOverLimit ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)';


        if (m.status === 'pending') {
          return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:5px;opacity:0.85">
            <div class="activity-avatar" style="background:#f59e0b;min-width:30px;width:30px;height:30px;font-size:14px">&#9203;</div>
            <div style="flex:1;min-width:0;overflow:hidden">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name} <span style="background:rgba(245,158,11,0.2);color:#f59e0b;font-size:9px;padding:1px 6px;border-radius:4px;margin-left:4px">&#9203; Ch\u1edd ch\u1ea5p nh\u1eadn</span></div>
              <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.email || ''}</div>
            </div>
            <button class="btn btn-sm" style="padding:4px 10px;font-size:10px;background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3);cursor:pointer;border-radius:6px;white-space:nowrap" onclick="event.stopPropagation();AdminsPage.cancelInvitation(${a.id}, '${(m.email || '').replace(/'/g, "\\\\\\'")}')">
              <i class="fas fa-times-circle"></i> H\u1ee7y l\u1eddi m\u1eddi
            </button>
          </div>`;
        }
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid ${isOverLimit ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:8px;margin-bottom:5px">
          <div class="activity-avatar" style="background:${m.avatar_color};min-width:30px;width:30px;height:30px;font-size:12px">${m.name.charAt(0)}</div>
          <div style="flex:1;min-width:0;overflow:hidden">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}${isOverLimit ? ' <span style="color:var(--danger);font-size:10px">⚠ Vượt hạn mức</span>' : ''}</div>
            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.email || ''}</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;align-items:center">
            <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:6px;padding:3px 8px;text-align:center;min-width:70px">
              <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase">Credit</div>
              <div style="font-size:12px;font-weight:700;color:${creditColor}">
                ${App.formatNumber(used)}<span style="color:var(--text-muted);font-weight:400;font-size:10px"> / ${limitLabel}</span>
              </div>
            </div>
            <div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);border-radius:6px;padding:3px 8px;text-align:center;min-width:55px">
              <div style="font-size:8px;color:var(--text-muted);text-transform:uppercase">B\u1ed9 nh\u1edb</div>
              <div style="font-size:13px;font-weight:700;color:var(--info)">${(m.current_storage_gb || 0) < 1 ? Math.round((m.current_storage_gb || 0) * 1024) + ' MB' : (m.current_storage_gb || 0).toFixed(1) + ' GB'}</div>
            </div>
            <button class="btn btn-sm" style="padding:3px 6px;font-size:9px;background:rgba(245,158,11,0.15);color:var(--warning);border:1px solid rgba(245,158,11,0.3);cursor:pointer;border-radius:6px;white-space:nowrap" onclick="event.stopPropagation();AdminsPage.setMemberCredit(${m.id}, '${m.name.replace(/'/g, "\\\\'")}', ${m.credit_limit || 0})" title="Set credit t\u1ed1i \u0111a cho th\u00e0nh vi\u00ean">
              <i class="fas fa-bolt"></i> Set
            </button>
            <button class="btn btn-sm" style="padding:3px 6px;font-size:9px;background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3);cursor:pointer;border-radius:6px" onclick="event.stopPropagation();AdminsPage.removeMember(${m.id}, '${m.name.replace(/'/g, "\\\\'")}', ${a.id})" title="Xóa thành viên">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
      }).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted)">Ch\u01b0a c\u00f3 th\u00e0nh vi\u00ean</div>';

      // Credentials section - show email|password|2fa
      const credentialsHtml = `
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:12px;font-weight:600;color:#818cf8"><i class="fas fa-id-card"></i> Tài khoản</span>
              <button class="btn btn-sm" style="font-size:9px;padding:3px 6px;background:rgba(99,102,241,0.15);color:#818cf8;border:none;cursor:pointer" onclick="AdminsPage.copyCredentials(${a.id})"><i class="fas fa-copy"></i> Copy</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;font-family:monospace;font-size:12px">
              <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--text-muted);min-width:50px"><i class="fas fa-envelope" style="width:12px"></i> Email:</span><span style="color:var(--text-primary);flex:1;word-break:break-all;font-size:11px">${a.email}</span></div>
              <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--text-muted);min-width:50px"><i class="fas fa-key" style="width:12px"></i> Pass:</span><span id="cred-pw-${a.id}" style="color:var(--text-primary);flex:1;cursor:pointer" onclick="AdminsPage.togglePw(${a.id})">${a.google_password_plain ? '••••••••' : '<span style=color:var(--text-muted)>N/A</span>'}</span>${a.google_password_plain ? `<button class="btn btn-sm" style="font-size:9px;padding:1px 4px;background:transparent;color:var(--text-muted);border:none;cursor:pointer" onclick="AdminsPage.togglePw(${a.id})"><i class="fas fa-eye"></i></button>` : ''}</div>
              <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--text-muted);min-width:50px"><i class="fas fa-shield-alt" style="width:12px"></i> 2FA:</span><span style="color:var(--text-primary);flex:1;word-break:break-all;font-size:10px">${a.totp_secret || '<span style=color:var(--text-muted)>N/A</span>'}</span></div>
            </div>
          </div>
        `;

      App.openModal(a.name, `
        <div style="text-align:center;margin-bottom:12px">
          <div style="width:48px;height:48px;border-radius:12px;background:${a.avatar_color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;margin:0 auto 6px">${a.name.charAt(0)}</div>
          <div style="font-size:16px;font-weight:700">${a.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${a.email}</div>
        </div>

        ${credentialsHtml}
        ${totpHtml}
        ${syncHtml}
        ${creditSummaryHtml}

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <h4 style="font-size:12px;color:var(--text-secondary);margin:0"><i class="fas fa-users" style="margin-right:4px"></i> Thành viên (${activeMembers.length}/${a.max_members})${pendingMembers.length > 0 ? ' · <span style="color:#f59e0b">' + pendingMembers.length + ' chờ</span>' : ''} · <span style="color:${slotsLeft > 0 ? 'var(--success)' : 'var(--danger)'}">${slotsLeft} slot trống</span></h4>
          <div style="display:flex;gap:4px">
            <button class="btn btn-success btn-sm" style="font-size:10px;padding:3px 8px" onclick="AdminsPage.showAddMemberModal(${a.id}, ${a.max_members}, ${members.length})"><i class="fas fa-user-plus"></i> Thêm TV</button>
          </div>
        </div>
        <div class="activity-list" style="max-height:350px;overflow-y:auto;margin-bottom:12px">${membersHtml}</div>

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="AdminsPage.deleteAdmin(${a.id}, '${a.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i> Xóa</button>
          <button class="btn btn-secondary" onclick="AdminsPage.showEditModal(${a.id})"><i class="fas fa-edit"></i> Sửa</button>
          <button class="btn btn-secondary" onclick="App.closeModal()">Đóng</button>
        </div>
      `);

      if (a.has_totp) this.startTotpRefresh(a.id);
      // Start sync countdown timer
      this.startSyncCountdown(a.id, a.last_sync);
    } catch (err) { console.error('[Admins] showDetail error:', err); App.toast('Lỗi tải admin: ' + err.message, 'error'); }
  },

  syncCountdownIntervals: {},
  startSyncCountdown(adminId, lastSync) {
    if (this.syncCountdownIntervals[adminId]) clearInterval(this.syncCountdownIntervals[adminId]);
    const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    const update = () => {
      const el = document.getElementById(`sync-countdown-${adminId}`);
      if (!el) { clearInterval(this.syncCountdownIntervals[adminId]); return; }
      if (!lastSync) { el.textContent = ''; return; }
      const lastSyncTime = new Date(lastSync).getTime();
      const nextSync = lastSyncTime + SYNC_INTERVAL_MS;
      const remaining = nextSync - Date.now();
      if (remaining <= 0) {
        el.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Đang sync...';
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.innerHTML = `<i class="fas fa-hourglass-half"></i> ${mins}p ${secs < 10 ? '0' : ''}${secs}s`;
      }
    };
    update();
    this.syncCountdownIntervals[adminId] = setInterval(update, 1000);
  },

  async startTotpRefresh(adminId) {
    const refresh = async () => {
      try {
        const data = await App.api(`/api/admins/${adminId}/totp`);
        const codeEl = document.getElementById(`totp-code-${adminId}`);
        const countdownEl = document.getElementById(`totp-countdown-${adminId}`);
        const progressEl = document.getElementById(`totp-progress-${adminId}`);
        if (codeEl) {
          codeEl.textContent = data.code.replace(/(\d{3})/, '$1 ');
          countdownEl.textContent = `${data.remaining_seconds}s`;
          progressEl.style.width = `${(data.remaining_seconds / 30) * 100}%`;
          progressEl.style.transition = 'width 1s linear';
        }
      } catch { }
    };
    await refresh();
    this.totpIntervals[adminId] = setInterval(refresh, 1000);
  },

  async copyTotp(adminId) {
    try {
      const data = await App.api(`/api/admins/${adminId}/totp`);
      await navigator.clipboard.writeText(data.code);
      App.toast('Đã copy mã 2FA!', 'success');
    } catch { App.toast('Không thể copy', 'error'); }
  },

  // ========= PASSWORD TOGGLE & COPY ==========
  togglePw(adminId) {
    const el = document.getElementById(`cred-pw-${adminId}`);
    if (!el) return;
    const a = this._detailCache[adminId];
    if (!a || !a.google_password_plain) return;

    this._pwVisible = this._pwVisible || {};
    this._pwVisible[adminId] = !this._pwVisible[adminId];

    if (this._pwVisible[adminId]) {
      el.textContent = a.google_password_plain;
    } else {
      el.textContent = '••••••••';
    }
  },

  async copyCredentials(adminId) {
    const a = this._detailCache[adminId];
    if (!a) return;
    const parts = [a.email];
    if (a.google_password_plain) parts.push(a.google_password_plain);
    if (a.totp_secret) parts.push(a.totp_secret);
    const text = parts.join('|');
    try {
      await navigator.clipboard.writeText(text);
      App.toast('Đã copy: ' + text.substring(0, 30) + '...', 'success');
    } catch { App.toast('Không thể copy', 'error'); }
  },

  // ========= EDIT MODAL ==========
  async showEditModal(id) {
    const admin = this._detailCache[id] || this.admins.find(a => a.id === id);
    if (!admin) {
      try {
        const data = await App.api(`/api/admins/${id}`);
        this._detailCache[id] = data.admin;
        this.showEditModalWithData(data.admin, id);
      } catch { return; }
    } else {
      this.showEditModalWithData(admin, id);
    }
  },

  showEditModalWithData(a, id) {
    const colorsHtml = ADMIN_COLORS.map(c =>
      `<div class="color-option ${c === a.avatar_color ? 'active' : ''}" style="background:${c}" data-color="${c}" onclick="AdminsPage.selectColor(this)"></div>`
    ).join('');

    App.openModal('Sửa Admin', `
      <div class="form-group">
        <label><i class="fas fa-envelope"></i> Email</label>
        <input type="email" id="edit-admin-email" value="${a.email}">
      </div>
      <div class="form-group">
        <label><i class="fas fa-user"></i> Tên</label>
        <input type="text" id="edit-admin-name" value="${a.name}">
      </div>
      <div class="form-group">
        <label><i class="fas fa-key"></i> Mật khẩu Google</label>
        <input type="text" id="edit-admin-google-pw" value="${a.google_password_plain || ''}" placeholder="${a.has_google_password ? 'Nhập mới để đổi' : 'Nhập mật khẩu Google'}">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${a.has_google_password ? '✅ Đã cấu hình - để trống nếu không đổi' : '⚠️ Cần có để auto-sync credit/storage'}</div>
      </div>
      <div class="form-group">
        <label><i class="fas fa-shield-alt"></i> TOTP Secret</label>
        <input type="text" id="edit-admin-totp" value="${a.totp_secret || ''}" placeholder="Nhập secret 2FA">
      </div>
      <div class="form-group">
        <label><i class="fas fa-coins"></i> Credit/tháng</label>
        <input type="number" id="edit-admin-credits" value="${a.total_monthly_credits}">
      </div>
      <div class="form-group">
        <label><i class="fas fa-database"></i> Storage (TB)</label>
        <input type="number" id="edit-admin-storage" value="${a.total_storage_tb}" step="0.1">
      </div>
      <div class="form-group">
        <label><i class="fas fa-sticky-note"></i> Ghi chú</label>
        <input type="text" id="edit-admin-notes" value="${a.notes || ''}">
      </div>
      <div class="form-group">
        <label><i class="fas fa-palette"></i> Màu</label>
        <div class="color-options">${colorsHtml}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="AdminsPage.updateAdmin(${id})"><i class="fas fa-save"></i> Lưu</button>
      </div>
    `);
  },

  async updateAdmin(id) {
    const email = document.getElementById('edit-admin-email').value.trim();
    const name = document.getElementById('edit-admin-name').value.trim();
    const google_password = document.getElementById('edit-admin-google-pw').value;
    const totp_secret = document.getElementById('edit-admin-totp').value.trim();
    const total_monthly_credits = parseInt(document.getElementById('edit-admin-credits').value);
    const total_storage_tb = parseFloat(document.getElementById('edit-admin-storage').value);
    const notes = document.getElementById('edit-admin-notes').value.trim();
    const activeColor = document.querySelector('.color-option.active');
    const avatar_color = activeColor ? activeColor.dataset.color : undefined;

    const body = { email, name, totp_secret, total_monthly_credits, total_storage_tb, avatar_color, notes };
    if (google_password) body.google_password = google_password;

    try {
      await App.api(`/api/admins/${id}`, 'PUT', body);
      App.closeModal();
      App.toast('Đã cập nhật', 'success');
      await this.loadAdmins();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteAdmin(id, name) {
    // Use a 2-step confirmation: first click shows warning, second click deletes
    const btn = event ? event.target.closest('button') : null;
    if (btn && !btn.dataset.confirmed) {
      btn.dataset.confirmed = 'true';
      btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Xác nhận xóa?';
      btn.style.background = '#dc2626';
      btn.style.color = 'white';
      setTimeout(() => {
        if (btn) { btn.dataset.confirmed = ''; btn.innerHTML = '<i class="fas fa-trash"></i> Xóa'; btn.style.background = ''; btn.style.color = ''; }
      }, 3000);
      return;
    }
    try {
      await App.api(`/api/admins/${id}`, 'DELETE');
      App.closeModal();
      App.toast(`Đã xóa ${name}`, 'success');
      await this.loadAdmins();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async setMemberCredit(memberId, memberName, currentLimit) {
    // Create custom modal instead of browser prompt
    const overlay = document.createElement('div');
    overlay.id = 'credit-limit-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease';
    overlay.innerHTML = `
      <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:16px;padding:24px;width:380px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.3s ease">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="margin:0;font-size:15px;color:var(--text-primary)"><i class="fas fa-bolt" style="color:var(--warning);margin-right:6px"></i>Set Credit tối đa</h3>
          <button onclick="document.getElementById('credit-limit-overlay').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:0"><i class="fas fa-times"></i></button>
        </div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:12px;margin-bottom:16px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${memberName}</div>
          <div style="font-size:11px;color:var(--text-muted)">Giá trị hiện tại: <strong style="color:var(--warning)">${currentLimit || 0}</strong></div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:6px"><i class="fas fa-coins" style="margin-right:4px"></i>Credit tối đa</label>
          <input type="number" id="credit-limit-input" value="${currentLimit || 0}" min="0" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:15px;font-weight:600;outline:none;box-sizing:border-box" autofocus>
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px">
            <i class="fas fa-info-circle"></i> Nhập <strong>0</strong> = không giới hạn · Nhập số dương = giới hạn credit tối đa
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('credit-limit-overlay').remove()" class="btn btn-secondary" style="padding:8px 16px;font-size:13px">Hủy</button>
          <button id="credit-limit-save" class="btn btn-primary" style="padding:8px 16px;font-size:13px;background:var(--warning);border-color:var(--warning)"><i class="fas fa-check"></i> Xác nhận</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Focus the input
    setTimeout(() => document.getElementById('credit-limit-input').select(), 100);

    // Handle Enter key
    document.getElementById('credit-limit-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('credit-limit-save').click();
      if (e.key === 'Escape') overlay.remove();
    });

    // Handle save
    document.getElementById('credit-limit-save').addEventListener('click', async () => {
      const limit = parseInt(document.getElementById('credit-limit-input').value);
      if (isNaN(limit) || limit < 0) { App.toast('Số không hợp lệ', 'error'); return; }
      try {
        await App.api(`/api/members/${memberId}/credit-limit`, 'PUT', { credit_limit: limit });
        overlay.remove();
        App.toast(`Đã set credit tối đa ${limit === 0 ? 'không giới hạn' : App.formatNumber(limit)} cho ${memberName}`, 'success');
        // Refresh detail modal
        const adminId = this.currentDetailAdminId;
        if (adminId) this.showDetail(adminId);
      } catch (err) { App.toast(err.message, 'error'); }
    });
  },

  // ========= ADD MEMBER ==========
  showAddMemberModal(adminId, maxMembers, currentCount) {
    if (this.isAnySyncing()) {
      App.toast('⏳ Đang đồng bộ, vui lòng đợi sync hoàn tất rồi thao tác', 'warning');
      return;
    }
    if (currentCount >= maxMembers) {
      App.toast(`Đã đạt tối đa ${maxMembers} thành viên!`, 'error');
      return;
    }
    App.openModal('Thêm thành viên vào Google Family', `
      <div style="margin-bottom:12px">
        <label class="form-label">Email thành viên <span style="color:var(--danger)">*</span></label>
        <input type="email" id="add-member-email" class="form-control" placeholder="email@gmail.com" />
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">
        <i class="fas fa-info-circle"></i> Slot còn lại: <strong style="color:var(--success)">${maxMembers - currentCount}</strong> / ${maxMembers}<br/>
        <i class="fas fa-robot"></i> Hệ thống sẽ tự động mở browser và gửi lời mời Google Family
      </div>
      <div id="add-member-status" style="display:none;margin-bottom:12px;padding:10px;border-radius:8px;font-size:12px"></div>
      <div class="modal-actions" id="add-member-actions">
        <button class="btn btn-success" onclick="AdminsPage.addMember(${adminId})"><i class="fas fa-user-plus"></i> Gửi lời mời</button>
        <button class="btn btn-secondary" onclick="App.closeModal()">Hủy</button>
      </div>
    `);
    setTimeout(() => document.getElementById('add-member-email')?.focus(), 100);
  },

  async addMember(adminId) {
    const email = document.getElementById('add-member-email')?.value?.trim();
    if (!email) { App.toast('Vui lòng nhập email', 'error'); return; }

    // Show progress
    const statusEl = document.getElementById('add-member-status');
    const actionsEl = document.getElementById('add-member-actions');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(99,102,241,0.1)';
    statusEl.style.border = '1px solid rgba(99,102,241,0.3)';
    statusEl.style.color = 'var(--info)';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi lời mời...';
    actionsEl.style.display = 'none';

    // Start polling sync status
    const poll = setInterval(async () => {
      try {
        const s = await App.api(`/api/admins/${adminId}/sync-status`);
        if (s && s.message) statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${s.message}`;
      } catch { }
    }, 2000);

    try {
      const result = await App.api(`/api/admins/${adminId}/add-member`, 'POST', { email });
      clearInterval(poll);
      if (result.error || result.success === false) {
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
        statusEl.style.color = 'var(--danger)';
        statusEl.innerHTML = `<i class="fas fa-times"></i> ${result.error || result.message || 'Thêm thành viên thất bại'}`;
        actionsEl.style.display = 'flex';
      } else {
        statusEl.style.background = 'rgba(16,185,129,0.1)';
        statusEl.style.border = '1px solid rgba(16,185,129,0.3)';
        statusEl.style.color = 'var(--success)';
        statusEl.innerHTML = `<i class="fas fa-check"></i> ${result.message || 'Đã gửi lời mời thành công!'}`;
        App.toast(`✅ Đã mời ${email} vào Family`, 'success');
        setTimeout(async () => {
          App.closeModal();
          await this.loadAdmins(true);
          this.showDetail(adminId);
        }, 2000);
      }
    } catch (err) {
      clearInterval(poll);
      statusEl.style.background = 'rgba(239,68,68,0.1)';
      statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
      statusEl.style.color = 'var(--danger)';
      statusEl.innerHTML = `<i class="fas fa-times"></i> Lỗi: ${err.message}`;
      actionsEl.style.display = 'flex';
    }
  },

  // ========= REMOVE MEMBER ==========
  async removeMember(memberId, memberName, adminId) {
    if (this.isAnySyncing()) {
      App.toast('⏳ Đang đồng bộ, vui lòng đợi sync hoàn tất rồi thao tác', 'warning');
      return;
    }
    if (!await App.confirm(`Xóa thành viên "${memberName}" khỏi nhóm gia đình Google?`)) return;
    try {
      App.toast('Đang xóa thành viên...', 'info');
      const result = await App.api(`/api/admins/${adminId}/remove-member`, 'POST', { memberId });
      if (result.error || result.success === false) {
        App.toast(result.error || result.message || `Xóa "${memberName}" thất bại`, 'error');
      } else if (result.needsManual) {
        App.toast(result.message, 'warning');
      } else {
        App.toast(result.message || `Đã xóa "${memberName}"`, 'success');
        await this.loadAdmins(true);
        this.showDetail(adminId);
      }
    } catch (err) { App.toast(err.message, 'error'); }
  },

  // ========= CANCEL INVITATION ==========
  async cancelInvitation(adminId, memberEmail) {
    if (this.isAnySyncing()) {
      App.toast('⏳ Đang đồng bộ, vui lòng đợi sync hoàn tất rồi thao tác', 'warning');
      return;
    }
    if (!await App.confirm(`Hủy lời mời cho "${memberEmail}"?`)) return;
    try {
      App.toast('Đang hủy lời mời...', 'info');
      const result = await App.api(`/api/admins/${adminId}/cancel-invitation`, 'POST', { email: memberEmail });
      if (result.error || result.success === false) {
        App.toast(result.error || result.message || 'Hủy lời mời thất bại', 'error');
      } else {
        App.toast(result.message || 'Đã hủy lời mời', 'success');
        await this.loadAdmins(true);
        this.showDetail(adminId);
      }
    } catch (err) { App.toast(err.message, 'error'); }
  }
};
