/* ========================================
   Dashboard Page (Multi-Admin)
   ======================================== */

const DashboardPage = {
  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card stat-card--credits">
          <div class="stat-label"><i class="fas fa-user-shield"></i> Tài khoản Farm</div>
          <div class="stat-value" id="stat-admins">--</div>
          <div class="stat-sub">tài khoản đang quản lý</div>
        </div>
        <div class="stat-card stat-card--members">
          <div class="stat-label"><i class="fas fa-users"></i> Tổng thành viên</div>
          <div class="stat-value" id="stat-members">--</div>
          <div class="stat-sub">trong tất cả nhóm</div>
        </div>
        <div class="stat-card stat-card--storage">
          <div class="stat-label"><i class="fas fa-coins"></i> Tổng Credit còn lại</div>
          <div class="stat-value" id="stat-credits" style="color:var(--success)">--</div>
          <div class="stat-sub" id="stat-credits-sub">--</div>
        </div>
        <div class="stat-card stat-card--reset">
          <div class="stat-label"><i class="fas fa-database"></i> Tổng Bộ nhớ</div>
          <div class="stat-value" id="stat-storage">--</div>
          <div class="stat-sub" id="stat-storage-sub">--</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-user-shield" style="color:var(--accent-light);margin-right:8px"></i> Tổng quan Acc Farm</span>
          <button class="btn btn-primary btn-sm" onclick="App.navigate('admins')"><i class="fas fa-plus"></i> Thêm Admin</button>
        </div>
        <div class="table-container">
          <table class="data-table" id="admin-overview-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Email</th>
                <th>Thành viên</th>
                <th>Đã dùng</th>
                <th>Credit còn</th>
                <th>Bộ nhớ</th>
                <th>2FA</th>
              </tr>
            </thead>
            <tbody id="admin-overview-tbody">
              <tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Đang tải...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fas fa-history" style="color:var(--warning);margin-right:8px"></i> Hoạt động gần đây</span>
        </div>
        <div id="recent-activity">
          <div class="empty-state"><p>Đang tải...</p></div>
        </div>
      </div>
    `;

    await this.loadData();
  },

  async loadData() {
    try {
      const data = await App.api('/api/dashboard');
      this.renderStats(data.totals);
      this.renderAdminTable(data.admins);
      this.renderActivity(data.recent_activity);
    } catch (err) {
      App.toast('Không thể tải dashboard', 'error');
    }
  },

  renderStats(totals) {
    document.getElementById('stat-admins').textContent = totals.admins;
    document.getElementById('stat-members').textContent = totals.members;
    document.getElementById('stat-credits').textContent = App.formatNumber(totals.credits_remaining);
    document.getElementById('stat-credits-sub').textContent = `Đã dùng ${App.formatNumber(totals.credits_used)} / ${App.formatNumber(totals.credits)}`;
    document.getElementById('stat-storage').textContent = `${totals.storage_tb} TB`;
    document.getElementById('stat-storage-sub').textContent = `Đã dùng ${totals.storage_used_gb < 1 ? Math.round(totals.storage_used_gb * 1024) + ' MB' : totals.storage_used_gb.toFixed(1) + ' GB'}`;
  },

  renderAdminTable(admins) {
    const tbody = document.getElementById('admin-overview-tbody');
    if (!admins.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">
        <i class="fas fa-user-shield" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3"></i>
        Chưa có admin nào. <a href="#admins" style="color:var(--accent-light)">Thêm admin đầu tiên</a>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = admins.map(a => {
      const creditPercent = a.credits.percent;
      const progressColor = creditPercent > 80 ? 'var(--danger)' : creditPercent > 50 ? 'var(--warning)' : 'var(--success)';

      return `
      <tr style="cursor:pointer" onclick="AdminsPage.showDetail(${a.id})">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:32px;height:32px;border-radius:8px;background:${a.avatar_color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white">
              ${a.name.charAt(0)}
            </div>
            <span style="font-weight:600">${a.name}</span>
          </div>
        </td>
        <td style="color:var(--text-secondary);font-size:13px">${a.email}</td>
        <td>
          <span style="font-weight:700">${a.member_count}</span><span style="color:var(--text-muted)">/${a.max_members}</span>
          ${a.slots_available > 0 ? `<span style="color:var(--success);font-size:11px;margin-left:4px">(${a.slots_available} trống)</span>` : `<span style="color:var(--danger);font-size:11px;margin-left:4px">(đầy)</span>`}
        </td>
        <td style="color:var(--warning);font-weight:600">${App.formatNumber(a.credits.used)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;color:${progressColor}">${App.formatNumber(a.credits.remaining)}</span>
            <div class="progress-bar" style="width:60px;height:4px">
              <div class="progress-fill" style="width:${creditPercent}%;background:${progressColor}"></div>
            </div>
          </div>
        </td>
        <td style="color:var(--text-secondary)">${a.storage.used_gb < 1 ? Math.round(a.storage.used_gb * 1024) + ' MB' : a.storage.used_gb.toFixed(1) + ' GB'} / ${a.storage.total_tb}TB</td>
        <td>${a.has_totp ? '<span style="color:var(--success)"><i class="fas fa-shield-alt"></i></span>' : '<span style="color:var(--text-muted)"><i class="fas fa-times"></i></span>'}</td>
      </tr>
    `;
    }).join('');
  },

  renderActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!activities.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><h3>Không có hoạt động gần đây</h3></div>`;
      return;
    }
    container.innerHTML = `<div class="activity-list">${activities.map(a => `
      <div class="activity-item">
        <div class="activity-avatar" style="background:${a.avatar_color || '#6366f1'}">${(a.member_name || '?').charAt(0)}</div>
        <div class="activity-info">
          <div class="activity-name">${a.member_name || 'Unknown'} <span style="color:var(--text-muted);font-size:11px">· ${a.admin_name}</span></div>
          <div class="activity-desc">${a.description || 'Credit usage'}</div>
        </div>
        <div class="activity-amount" style="color:var(--warning)">-${App.formatNumber(a.amount)}</div>
        <div class="activity-date">${App.formatDate(a.log_date)}</div>
      </div>
    `).join('')}</div>`;
  }
};
