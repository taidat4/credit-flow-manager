/* ========================================
   Credit-Flow Manager - Core App (Multi-Admin)
   ======================================== */

const App = {
    currentUser: null,
    currentPage: 'dashboard',

    async init() {
        this.bindEvents();
        await this.checkAuth();
        this.startClock();
    },

    bindEvents() {
        document.getElementById('login-form').addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
        document.getElementById('register-form').addEventListener('submit', (e) => { e.preventDefault(); this.register(); });
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-form').classList.remove('active');
            document.getElementById('register-form').classList.add('active');
        });
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-form').classList.remove('active');
            document.getElementById('login-form').classList.add('active');
        });
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => { e.preventDefault(); this.navigate(item.dataset.page); });
        });
        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        // Prevent close when dragging from inside modal to outside
        let mouseDownOnOverlay = false;
        document.getElementById('modal-overlay').addEventListener('mousedown', (e) => {
            mouseDownOnOverlay = (e.target === e.currentTarget);
        });
        document.getElementById('modal-overlay').addEventListener('mouseup', (e) => {
            if (mouseDownOnOverlay && e.target === e.currentTarget) this.closeModal();
            mouseDownOnOverlay = false;
        });
        window.addEventListener('hashchange', () => {
            const page = location.hash.replace('#', '') || 'dashboard';
            this.navigate(page, false);
        });
    },

    async checkAuth() {
        try {
            const res = await this.api('/api/auth/check');
            if (res.authenticated) { this.currentUser = res.user; this.showApp(); }
            else this.showLogin();
        } catch { this.showLogin(); }
    },

    async login() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        try {
            const res = await this.api('/api/auth/login', 'POST', { username, password });
            if (res.success) { this.currentUser = res.user; errorEl.textContent = ''; this.showApp(); this.toast('Đăng nhập thành công!', 'success'); }
        } catch (err) { errorEl.textContent = err.message || 'Sai tên đăng nhập hoặc mật khẩu'; }
    },

    async register() {
        const display_name = document.getElementById('reg-display-name').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;
        const errorEl = document.getElementById('register-error');
        if (password !== confirm) { errorEl.textContent = 'Mật khẩu xác nhận không khớp'; return; }
        try {
            const res = await this.api('/api/auth/register', 'POST', { username, password, display_name });
            if (res.success) {
                this.toast('🎉 Đăng ký thành công! Vui lòng đăng nhập.', 'success');
                // Switch back to login form
                document.getElementById('register-form').reset();
                document.getElementById('register-form').classList.remove('active');
                document.getElementById('login-form').classList.add('active');
                // Pre-fill username in login form
                document.getElementById('username').value = username;
                document.getElementById('password').focus();
            }
        } catch (err) { errorEl.textContent = err.message || 'Đăng ký thất bại'; }
    },

    async logout() {
        try { await this.api('/api/auth/logout', 'POST'); } catch { }
        this.currentUser = null; this.showLogin(); this.toast('Đã đăng xuất', 'info');
    },

    showLogin() {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        document.getElementById('login-form').classList.add('active');
        document.getElementById('register-form').classList.remove('active');
    },

    showApp() {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        if (this.currentUser) {
            document.getElementById('sidebar-username').textContent = this.currentUser.display_name;
            document.getElementById('sidebar-role').textContent = this.currentUser.role === 'admin' ? 'Administrator' : 'Viewer';
            document.getElementById('sidebar-avatar').textContent = this.currentUser.display_name.charAt(0).toUpperCase();
            // Load balance
            this.api('/api/subscription/my').then(data => {
                const bal = data.balance || 0;
                document.getElementById('sidebar-balance').textContent = bal.toLocaleString('vi-VN') + 'đ';
            }).catch(() => { });
        }
        const page = location.hash.replace('#', '') || 'dashboard';
        this.navigate(page, false);
    },

    navigate(page, updateHash = true) {
        this.currentPage = page;
        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
        if (updateHash) location.hash = page;
        const titles = { dashboard: 'Tổng quan', admins: 'Quản lý Acc Farm', plans: 'Gói dịch vụ', deposit: 'Nạp tiền', settings: 'Cài đặt' };
        document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
        document.getElementById('sidebar').classList.remove('open');
        this.loadPage(page);
    },

    loadPage(page) {
        switch (page) {
            case 'dashboard': DashboardPage.load(); break;
            case 'admins': AdminsPage.load(); break;
            case 'plans': PlansPage.load(); break;
            case 'deposit': DepositPage.load(); break;
            case 'settings': SettingsPage.load(); break;
            default: DashboardPage.load();
        }
    },

    async api(url, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        return data;
    },

    openModal(title, bodyHtml) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `<i class="fas ${icons[type]}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; setTimeout(() => toast.remove(), 300); }, 3000);
    },

    confirm(message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--card-bg,#1e1e2e);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;min-width:320px;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.5)';
            box.innerHTML = `
                <div style="font-size:15px;font-weight:600;color:var(--text-primary,#fff);margin-bottom:16px;line-height:1.5">${message}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button id="_confirm-no" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:var(--text-secondary,#aaa);cursor:pointer;font-size:13px;font-weight:500">Không</button>
                    <button id="_confirm-yes" style="padding:8px 20px;border-radius:8px;border:none;background:var(--danger,#ef4444);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Có, xác nhận</button>
                </div>`;
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            box.querySelector('#_confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
            box.querySelector('#_confirm-no').onclick = () => { overlay.remove(); resolve(false); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        });
    },

    formatNumber(num) { return new Intl.NumberFormat('vi-VN').format(num); },
    formatDate(dateStr) { if (!dateStr) return ''; return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); },

    startClock() {
        const update = () => {
            const el = document.getElementById('current-time');
            if (el) el.textContent = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        update(); setInterval(update, 30000);
    }
};

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

document.addEventListener('DOMContentLoaded', () => App.init());
