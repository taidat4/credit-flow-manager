/* ========================================
   Settings Page (Multi-Admin)
   ======================================== */

const SettingsPage = {
  async load() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="settings-grid">
        <div class="settings-section">
          <h3><i class="fas fa-lock"></i> Đổi mật khẩu</h3>
          <form id="password-form">
            <div class="form-group"><label>Mật khẩu hiện tại</label>
              <div class="password-input"><input type="password" id="settings-current-pw" placeholder="Nhập mật khẩu hiện tại" required>
              <button type="button" class="toggle-password" onclick="togglePassword('settings-current-pw', this)"><i class="fas fa-eye"></i></button></div>
            </div>
            <div class="form-group"><label>Mật khẩu mới</label>
              <div class="password-input"><input type="password" id="settings-new-pw" placeholder="Tối thiểu 6 ký tự" required minlength="6">
              <button type="button" class="toggle-password" onclick="togglePassword('settings-new-pw', this)"><i class="fas fa-eye"></i></button></div>
            </div>
            <div class="form-group"><label>Xác nhận mật khẩu mới</label>
              <div class="password-input"><input type="password" id="settings-confirm-pw" placeholder="Nhập lại mật khẩu mới" required minlength="6">
              <button type="button" class="toggle-password" onclick="togglePassword('settings-confirm-pw', this)"><i class="fas fa-eye"></i></button></div>
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-key"></i> Đổi mật khẩu</button>
          </form>
        </div>

        ${App.currentUser && App.currentUser.role === 'admin' ? `
        <div class="settings-section">
          <h3><i class="fas fa-users-cog"></i> Quản lý tài khoản web</h3>
          <div id="user-list"><p style="color:var(--text-muted)">Đang tải...</p></div>
        </div>` : ''}

        <div class="settings-section" style="grid-column:1/-1">
          <h3><i class="fas fa-store" style="color:var(--accent-light)"></i> Shop MMO Tiện Ích - Credit-Flow Manager</h3>
          <div style="padding:16px;background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border-radius:12px;border:1px solid rgba(99,102,241,0.15);margin-bottom:16px">
            <p style="color:var(--text-secondary);font-size:13px;line-height:1.8;margin-bottom:12px">
              <strong style="color:var(--accent-light)">Credit-Flow Manager</strong> là hệ thống quản lý tài khoản Google One Ultra chuyên nghiệp, 
              được phát triển độc quyền bởi đội ngũ <strong style="color:#a78bfa">Shop MMO Tiện Ích</strong>. Hệ thống cho phép quản trị viên 
              theo dõi real-time credit AI (Gemini Advanced), dung lượng Google One, số lượng thành viên Family, và tự động đồng bộ dữ liệu 
              từ Google Account mà không cần thao tác thủ công.
            </p>
            <p style="color:var(--text-secondary);font-size:13px;line-height:1.8;margin-bottom:12px">
              Với kiến trúc Multi-Admin, bạn có thể quản lý đồng thời nhiều tài khoản Google One, phân quyền người dùng, 
              theo dõi lịch sử sử dụng credit của từng thành viên, và nhận cảnh báo khi credit sắp hết. 
              Hệ thống hỗ trợ tự động login, scraping dữ liệu, và cập nhật liên tục mỗi 20 giây.
            </p>
            <p style="color:var(--text-muted);font-size:12px;line-height:1.6">
              📧 Hỗ trợ: <a href="https://t.me/dat_shopmmo_04" target="_blank" style="color:var(--info)">Telegram @dat_shopmmo_04</a> | 🌐 <a href="https://shopmmotienich.com/" target="_blank" style="color:var(--info)">shopmmotienich.com</a> | 📱 <a href="https://zalo.me/g/khxedc741" target="_blank" style="color:var(--success)">Zalo</a>
            </p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
            <div class="member-stat"><div class="member-stat-label">Phiên bản</div><div class="member-stat-value" style="font-size:14px">2.0.0</div></div>
            <div class="member-stat"><div class="member-stat-label">Nhà phát triển</div><div class="member-stat-value" style="font-size:12px">Shop MMO Tiện Ích</div></div>
            <div class="member-stat"><div class="member-stat-label">Cập nhật</div><div class="member-stat-value" style="font-size:12px">27/02/2026</div></div>
            <div class="member-stat"><div class="member-stat-label">Giấy phép</div><div class="member-stat-value" style="font-size:14px">Premium</div></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('password-form').addEventListener('submit', async (e) => { e.preventDefault(); await this.changePassword(); });
    if (App.currentUser && App.currentUser.role === 'admin') await this.loadUsers();
  },

  async changePassword() {
    const current_password = document.getElementById('settings-current-pw').value;
    const new_password = document.getElementById('settings-new-pw').value;
    const confirm_pw = document.getElementById('settings-confirm-pw').value;
    if (new_password !== confirm_pw) { App.toast('Mật khẩu không khớp', 'warning'); return; }
    try { await App.api('/api/auth/password', 'PUT', { current_password, new_password }); App.toast('Đã đổi mật khẩu', 'success'); document.getElementById('password-form').reset(); }
    catch (err) { App.toast(err.message, 'error'); }
  },

  async loadUsers() {
    try {
      const users = await App.api('/api/auth/users');
      document.getElementById('user-list').innerHTML = `
        <div class="table-container"><table class="data-table"><thead><tr>
          <th>Tên</th><th>Username</th><th>Vai trò</th><th>Trạng thái</th><th></th>
        </tr></thead><tbody>
          ${users.map(u => `<tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div style="width:28px;height:28px;border-radius:7px;background:${u.avatar_color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white">${u.display_name.charAt(0)}</div>
              ${u.display_name}</div></td>
            <td style="color:var(--text-secondary)">${u.username}</td>
            <td><span class="badge badge--${u.role === 'admin' ? 'admin' : 'active'}">${u.role}</span></td>
            <td><span class="badge badge--${u.is_active ? 'active' : 'inactive'}">${u.is_active ? '● Active' : '● Locked'}</span></td>
            <td>${u.id !== App.currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteUser(${u.id}, '${u.display_name}')"><i class="fas fa-ban"></i></button>` : ''}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } catch { }
  },

  async deleteUser(id, name) {
    if (!confirm(`Khóa ${name}?`)) return;
    try { await App.api(`/api/auth/users/${id}`, 'DELETE'); App.toast(`Đã khóa ${name}`, 'success'); await this.loadUsers(); }
    catch (err) { App.toast(err.message, 'error'); }
  }
};
