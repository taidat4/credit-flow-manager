const express = require('express');
const router = express.Router();
const db = require('../db/database');

const API_KEY = process.env.SUPER_ADMIN_API_KEY || 'sa-creditflow-2026-x9k7m';

// API Key middleware
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
    next();
}

router.use(requireApiKey);

// ========== AUTH CHECK ==========
router.get('/verify', (req, res) => {
    res.json({ ok: true, message: 'API key valid' });
});

// ========== PLANS ==========
router.get('/plans', (req, res) => {
    const plans = db.prepare('SELECT * FROM sa_plans ORDER BY sort_order').all();
    plans.forEach(p => { try { p.features = JSON.parse(p.features); } catch { p.features = []; } });
    res.json({ plans });
});

router.post('/plans', (req, res) => {
    const { name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
    try {
        const result = db.prepare(`INSERT INTO sa_plans (name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            name, slug, price || 0, price_label || '0', max_farms || 10, max_members || 50, sync_interval || '30 phút',
            JSON.stringify(features || []), badge_text || '', badge_color || '', color || '#22c55e', icon || '🌱', sort_order || 0, is_active !== undefined ? is_active : 1
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/plans/:id', (req, res) => {
    const { name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active } = req.body;
    try {
        db.prepare(`UPDATE sa_plans SET name=?,slug=?,price=?,price_label=?,max_farms=?,max_members=?,sync_interval=?,features=?,badge_text=?,badge_color=?,color=?,icon=?,sort_order=?,is_active=? WHERE id=?`).run(
            name, slug, price, price_label, max_farms, max_members, sync_interval,
            JSON.stringify(features || []), badge_text || '', badge_color || '', color, icon, sort_order, is_active, req.params.id
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/plans/:id', (req, res) => {
    db.prepare('DELETE FROM sa_plans WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== USERS & SUBSCRIPTIONS ==========
router.get('/users', (req, res) => {
    const users = db.prepare(`
    SELECT u.*, 
      (SELECT COUNT(*) FROM sa_subscriptions s WHERE s.user_id = u.id AND s.status = 'active') as active_subs,
      (SELECT p.name FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id WHERE s.user_id = u.id AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1) as current_plan
    FROM users u ORDER BY u.created_at DESC
  `).all();
    // Remove password from response
    users.forEach(u => delete u.password);
    res.json({ users });
});

router.get('/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    delete user.password;
    const subs = db.prepare(`
    SELECT s.*, p.name as plan_name, p.price_label, p.color FROM sa_subscriptions s 
    JOIN sa_plans p ON s.plan_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(req.params.id);
    res.json({ user, subscriptions: subs });
});

router.put('/users/:id', (req, res) => {
    const { display_name, role, is_active, avatar_color } = req.body;
    db.prepare('UPDATE users SET display_name=?, role=?, is_active=?, avatar_color=? WHERE id=?')
        .run(display_name, role, is_active, avatar_color, req.params.id);
    res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// Subscriptions CRUD
router.post('/subscriptions', (req, res) => {
    const { user_id, plan_id, status, start_date, end_date, amount_paid, payment_method, notes } = req.body;
    try {
        const result = db.prepare(`INSERT INTO sa_subscriptions (user_id, plan_id, status, start_date, end_date, amount_paid, payment_method, notes) VALUES (?,?,?,?,?,?,?,?)`).run(
            user_id, plan_id, status || 'active', start_date || new Date().toISOString().split('T')[0],
            end_date || null, amount_paid || 0, payment_method || '', notes || ''
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/subscriptions/:id', (req, res) => {
    const { status, end_date, notes } = req.body;
    db.prepare('UPDATE sa_subscriptions SET status=?, end_date=?, notes=? WHERE id=?')
        .run(status, end_date, notes, req.params.id);
    res.json({ ok: true });
});

router.delete('/subscriptions/:id', (req, res) => {
    db.prepare('DELETE FROM sa_subscriptions WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== ANNOUNCEMENTS ==========
router.get('/announcements', (req, res) => {
    const items = db.prepare('SELECT * FROM sa_announcements ORDER BY created_at DESC').all();
    res.json({ announcements: items });
});

router.post('/announcements', (req, res) => {
    const { title, content, type, is_popup, is_active, show_from, show_until } = req.body;
    try {
        const result = db.prepare(`INSERT INTO sa_announcements (title, content, type, is_popup, is_active, show_from, show_until) VALUES (?,?,?,?,?,?,?)`).run(
            title, content, type || 'info', is_popup ? 1 : 0, is_active !== undefined ? is_active : 1, show_from || null, show_until || null
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/announcements/:id', (req, res) => {
    const { title, content, type, is_popup, is_active, show_from, show_until } = req.body;
    db.prepare(`UPDATE sa_announcements SET title=?,content=?,type=?,is_popup=?,is_active=?,show_from=?,show_until=? WHERE id=?`).run(
        title, content, type, is_popup ? 1 : 0, is_active, show_from, show_until, req.params.id
    );
    res.json({ ok: true });
});

router.delete('/announcements/:id', (req, res) => {
    db.prepare('DELETE FROM sa_announcements WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== CONFIG ==========
router.get('/config', (req, res) => {
    const rows = db.prepare('SELECT * FROM sa_config').all();
    const config = {};
    rows.forEach(r => config[r.key] = r.value);
    res.json({ config });
});

router.put('/config', (req, res) => {
    const entries = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO sa_config (key, value, updated_at) VALUES (?, ?, datetime('now'))");
    for (const [key, value] of Object.entries(entries)) {
        stmt.run(key, String(value));
    }
    res.json({ ok: true });
});

// ========== REVENUE / STATS ==========
router.get('/revenue', (req, res) => {
    // Total revenue
    const totalRevenue = db.prepare('SELECT COALESCE(SUM(amount_paid), 0) as total FROM sa_subscriptions').get();
    // This month
    const monthRevenue = db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM sa_subscriptions WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get();
    // By month (last 6 months)
    const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(amount_paid) as revenue, COUNT(*) as count 
    FROM sa_subscriptions 
    WHERE created_at >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', created_at) ORDER BY month
  `).all();
    // By plan
    const byPlan = db.prepare(`
    SELECT p.name, p.color, COUNT(s.id) as count, SUM(s.amount_paid) as revenue 
    FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id 
    GROUP BY p.id ORDER BY revenue DESC
  `).all();
    // Active stats
    const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get();
    const activeSubs = db.prepare(`SELECT COUNT(*) as count FROM sa_subscriptions WHERE status = 'active'`).get();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();

    res.json({
        totalRevenue: totalRevenue.total,
        monthRevenue: monthRevenue.total,
        monthly,
        byPlan,
        activeUsers: activeUsers.count,
        activeSubs: activeSubs.count,
        totalUsers: totalUsers.count
    });
});

// ========== ADMIN BALANCE ADJUSTMENT ==========
router.put('/users/:id/balance', (req, res) => {
    const { amount, description } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });

    const txn = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(parseInt(amount), req.params.id);
        db.prepare('INSERT INTO balance_logs (user_id, amount, type, description, admin_id) VALUES (?, ?, ?, ?, ?)')
            .run(req.params.id, parseInt(amount), 'admin_adjust', description || (amount > 0 ? 'Admin cộng tiền' : 'Admin trừ tiền'), null);
        const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.params.id);
        return updated.balance;
    });

    try {
        const newBalance = txn();
        res.json({ ok: true, new_balance: newBalance, message: `Đã ${amount > 0 ? 'cộng' : 'trừ'} ${Math.abs(amount).toLocaleString()}đ. Số dư mới: ${newBalance.toLocaleString()}đ` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== USER BALANCE LOGS ==========
router.get('/users/:id/balance-logs', (req, res) => {
    const logs = db.prepare(`
        SELECT bl.*, u.display_name as admin_name 
        FROM balance_logs bl LEFT JOIN users u ON u.id = bl.admin_id
        WHERE bl.user_id = ? ORDER BY bl.created_at DESC LIMIT 50
    `).all(req.params.id);
    res.json({ logs });
});

// ========= MB BANK CONFIG =========

// GET /api/sa/mbbank-config
router.get('/mbbank-config', (req, res) => {
    const keys = [
        'mb_api_key', 'mb_account_no', 'mb_bot_token', 'mb_chat_id',
        'mb_session_id', 'mb_token', 'mb_cookie', 'mb_device_id',
        'mb_user', 'mb_password', 'mb_id_run'
    ];
    const config = {};
    for (const key of keys) {
        const row = db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
        config[key] = row ? row.value : '';
    }
    res.json(config);
});

// PUT /api/sa/mbbank-config
router.put('/mbbank-config', (req, res) => {
    const configMap = {
        'mb_api_key': req.body.mb_api_key,
        'mb_account_no': req.body.mb_account_no,
        'mb_bot_token': req.body.mb_bot_token,
        'mb_chat_id': req.body.mb_chat_id,
        'mb_session_id': req.body.mb_session_id,
        'mb_token': req.body.mb_token,
        'mb_cookie': req.body.mb_cookie,
        'mb_device_id': req.body.mb_device_id,
        'mb_user': req.body.mb_user,
        'mb_password': req.body.mb_password,
        'mb_id_run': req.body.mb_id_run
    };

    const upsert = db.prepare(`
        INSERT INTO sa_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    const save = db.transaction(() => {
        for (const [key, value] of Object.entries(configMap)) {
            if (value !== undefined && value !== null) {
                upsert.run(key, String(value));
            }
        }
    });

    save();

    // Reload MB Bank service config
    try {
        const mbbank = require('../services/mbbank');
        if (mbbank.reloadConfig) mbbank.reloadConfig();
    } catch { }

    res.json({ success: true, message: 'Đã lưu cấu hình MB Bank' });
});

// POST /api/sa/test-mbbank — server-side test (avoids CORS)
router.post('/test-mbbank', async (req, res) => {
    const keys = ['mb_api_key', 'mb_account_no', 'mb_user', 'mb_password'];
    const cfg = {};
    for (const key of keys) {
        const row = db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
        cfg[key] = row ? row.value : '';
    }

    if (!cfg.mb_api_key || !cfg.mb_account_no) {
        return res.json({ ok: false, message: 'Chưa cấu hình API Key hoặc STK' });
    }

    try {
        const params = new URLSearchParams({
            key: cfg.mb_api_key,
            username: cfg.mb_user || cfg.mb_account_no,
            password: cfg.mb_password || '',
            accountNo: cfg.mb_account_no
        });

        const response = await fetch(`https://apicanhan.com/api/mbbankv3?${params.toString()}`, {
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            return res.json({ ok: false, message: `HTTP ${response.status}` });
        }

        const data = await response.json();
        if (data.status === 'success') {
            const txCount = (data.transactions || []).length;
            return res.json({ ok: true, message: `Kết nối OK! Nhận được ${txCount} giao dịch`, count: txCount });
        } else {
            return res.json({ ok: false, message: `API lỗi: ${data.message || 'Unknown'}` });
        }
    } catch (err) {
        return res.json({ ok: false, message: `Lỗi: ${err.message}` });
    }
});

module.exports = router;

