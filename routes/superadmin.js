const express = require('express');
const router = express.Router();
const db = require('../db/database');

const API_KEY = process.env.SUPER_ADMIN_API_KEY || 'sa-creditflow-2026-x9k7m';

function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
    next();
}

router.use(requireApiKey);

// ========== AUTH CHECK ==========
router.get('/verify', (req, res) => { res.json({ ok: true, message: 'API key valid' }); });

// ========== PLANS ==========
router.get('/plans', async (req, res) => {
    const plans = await db.prepare('SELECT * FROM sa_plans ORDER BY sort_order').all();
    plans.forEach(p => { try { p.features = JSON.parse(p.features); } catch { p.features = []; } });
    res.json({ plans });
});

router.post('/plans', async (req, res) => {
    const { name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
    try {
        const result = await db.prepare('INSERT INTO sa_plans (name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
            name, slug, price || 0, price_label || '0', max_farms || 10, max_members || 50, sync_interval || '30 phút',
            JSON.stringify(features || []), badge_text || '', badge_color || '', color || '#22c55e', icon || '🌱', sort_order || 0, is_active !== undefined ? is_active : 1
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/plans/:id', async (req, res) => {
    const { name, slug, price, price_label, max_farms, max_members, sync_interval, features, badge_text, badge_color, color, icon, sort_order, is_active } = req.body;
    try {
        await db.prepare('UPDATE sa_plans SET name=?,slug=?,price=?,price_label=?,max_farms=?,max_members=?,sync_interval=?,features=?,badge_text=?,badge_color=?,color=?,icon=?,sort_order=?,is_active=? WHERE id=?').run(
            name, slug, price, price_label, max_farms, max_members, sync_interval,
            JSON.stringify(features || []), badge_text || '', badge_color || '', color, icon, sort_order, is_active, req.params.id
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/plans/:id', async (req, res) => {
    await db.prepare('DELETE FROM sa_plans WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== USERS & SUBSCRIPTIONS ==========
router.get('/users', async (req, res) => {
    const users = await db.prepare(`
        SELECT u.*,
            (SELECT COUNT(*) FROM sa_subscriptions s WHERE s.user_id = u.id AND s.status = 'active') as active_subs,
            (SELECT p.name FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id WHERE s.user_id = u.id AND s.status = 'active' ORDER BY s.created_at DESC LIMIT 1) as current_plan
        FROM users u ORDER BY u.created_at DESC
    `).all();
    users.forEach(u => delete u.password);
    res.json({ users });
});

router.get('/users/:id', async (req, res) => {
    const user = await db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    delete user.password;
    const subs = await db.prepare(`
        SELECT s.*, p.name as plan_name, p.price_label, p.color FROM sa_subscriptions s
        JOIN sa_plans p ON s.plan_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC
    `).all(req.params.id);
    res.json({ user, subscriptions: subs });
});

router.put('/users/:id', async (req, res) => {
    const { display_name, role, is_active, avatar_color } = req.body;
    await db.prepare('UPDATE users SET display_name=?, role=?, is_active=?, avatar_color=? WHERE id=?').run(display_name, role, is_active, avatar_color, req.params.id);
    res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
    await db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// Subscriptions CRUD
router.post('/subscriptions', async (req, res) => {
    const { user_id, plan_id, status, start_date, end_date, amount_paid, payment_method, notes } = req.body;
    try {
        const result = await db.prepare('INSERT INTO sa_subscriptions (user_id, plan_id, status, start_date, end_date, amount_paid, payment_method, notes) VALUES (?,?,?,?,?,?,?,?)').run(
            user_id, plan_id, status || 'active', start_date || new Date().toISOString().split('T')[0],
            end_date || null, amount_paid || 0, payment_method || '', notes || ''
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/subscriptions/:id', async (req, res) => {
    const { status, end_date, notes } = req.body;
    await db.prepare('UPDATE sa_subscriptions SET status=?, end_date=?, notes=? WHERE id=?').run(status, end_date, notes, req.params.id);
    res.json({ ok: true });
});

router.delete('/subscriptions/:id', async (req, res) => {
    await db.prepare('DELETE FROM sa_subscriptions WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== ANNOUNCEMENTS ==========
router.get('/announcements', async (req, res) => {
    const items = await db.prepare('SELECT * FROM sa_announcements ORDER BY created_at DESC').all();
    res.json({ announcements: items });
});

router.post('/announcements', async (req, res) => {
    const { title, content, type, is_popup, is_active, show_from, show_until } = req.body;
    try {
        const result = await db.prepare('INSERT INTO sa_announcements (title, content, type, is_popup, is_active, show_from, show_until) VALUES (?,?,?,?,?,?,?)').run(
            title, content, type || 'info', is_popup ? 1 : 0, is_active !== undefined ? is_active : 1, show_from || null, show_until || null
        );
        res.json({ id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/announcements/:id', async (req, res) => {
    const { title, content, type, is_popup, is_active, show_from, show_until } = req.body;
    await db.prepare('UPDATE sa_announcements SET title=?,content=?,type=?,is_popup=?,is_active=?,show_from=?,show_until=? WHERE id=?').run(
        title, content, type, is_popup ? 1 : 0, is_active, show_from, show_until, req.params.id
    );
    res.json({ ok: true });
});

router.delete('/announcements/:id', async (req, res) => {
    await db.prepare('DELETE FROM sa_announcements WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

// ========== CONFIG ==========
router.get('/config', async (req, res) => {
    const rows = await db.prepare('SELECT * FROM sa_config').all();
    const config = {};
    rows.forEach(r => config[r.key] = r.value);
    res.json({ config });
});

router.put('/config', async (req, res) => {
    const entries = req.body;
    for (const [key, value] of Object.entries(entries)) {
        await db.prepare("INSERT INTO sa_config (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()").run(key, String(value));
    }
    res.json({ ok: true });
});

// ========== REVENUE / STATS ==========
router.get('/revenue', async (req, res) => {
    const totalRevenue = await db.prepare('SELECT COALESCE(SUM(amount_paid), 0) as total FROM sa_subscriptions').get();
    const monthRevenue = await db.prepare("SELECT COALESCE(SUM(amount_paid), 0) as total FROM sa_subscriptions WHERE TO_CHAR(created_at, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')").get();
    const monthly = await db.prepare(`
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, SUM(amount_paid) as revenue, COUNT(*) as count
        FROM sa_subscriptions WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month
    `).all();
    const byPlan = await db.prepare(`
        SELECT p.name, p.color, COUNT(s.id) as count, SUM(s.amount_paid) as revenue
        FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id GROUP BY p.id, p.name, p.color ORDER BY revenue DESC
    `).all();
    const activeUsers = await db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get();
    const activeSubs = await db.prepare("SELECT COUNT(*) as count FROM sa_subscriptions WHERE status = 'active'").get();
    const totalUsers = await db.prepare('SELECT COUNT(*) as count FROM users').get();

    res.json({
        totalRevenue: parseInt(totalRevenue.total), monthRevenue: parseInt(monthRevenue.total),
        monthly, byPlan,
        activeUsers: parseInt(activeUsers.count), activeSubs: parseInt(activeSubs.count), totalUsers: parseInt(totalUsers.count)
    });
});

// ========== ADMIN BALANCE ADJUSTMENT ==========
router.put('/users/:id/balance', async (req, res) => {
    const { amount, description } = req.body;
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });

    try {
        const txn = db.transaction(async (txDb) => {
            await txDb.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(parseInt(amount), req.params.id);
            await txDb.prepare('INSERT INTO balance_logs (user_id, amount, type, description, admin_id) VALUES (?, ?, ?, ?, ?)')
                .run(req.params.id, parseInt(amount), 'admin_adjust', description || (amount > 0 ? 'Admin cộng tiền' : 'Admin trừ tiền'), null);
            const updated = await txDb.prepare('SELECT balance FROM users WHERE id = ?').get(req.params.id);
            return updated.balance;
        });
        const newBalance = await txn();
        res.json({ ok: true, new_balance: newBalance, message: `Đã ${amount > 0 ? 'cộng' : 'trừ'} ${Math.abs(amount).toLocaleString()}đ. Số dư mới: ${newBalance.toLocaleString()}đ` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== USER BALANCE LOGS ==========
router.get('/users/:id/balance-logs', async (req, res) => {
    const logs = await db.prepare(`
        SELECT bl.*, u.display_name as admin_name FROM balance_logs bl
        LEFT JOIN users u ON u.id = bl.admin_id WHERE bl.user_id = ? ORDER BY bl.created_at DESC LIMIT 50
    `).all(req.params.id);
    res.json({ logs });
});

// ========= MB BANK CONFIG =========
router.get('/mbbank-config', async (req, res) => {
    const keys = ['mb_api_key', 'mb_account_no', 'mb_bot_token', 'mb_chat_id', 'mb_session_id', 'mb_token', 'mb_cookie', 'mb_device_id', 'mb_user', 'mb_password', 'mb_id_run'];
    const config = {};
    for (const key of keys) {
        const row = await db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
        config[key] = row ? row.value : '';
    }
    res.json(config);
});

router.put('/mbbank-config', async (req, res) => {
    const configMap = {
        'mb_api_key': req.body.mb_api_key, 'mb_account_no': req.body.mb_account_no,
        'mb_bot_token': req.body.mb_bot_token, 'mb_chat_id': req.body.mb_chat_id,
        'mb_session_id': req.body.mb_session_id, 'mb_token': req.body.mb_token,
        'mb_cookie': req.body.mb_cookie, 'mb_device_id': req.body.mb_device_id,
        'mb_user': req.body.mb_user, 'mb_password': req.body.mb_password,
        'mb_id_run': req.body.mb_id_run
    };

    for (const [key, value] of Object.entries(configMap)) {
        if (value !== undefined && value !== null) {
            await db.prepare("INSERT INTO sa_config (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()").run(key, String(value));
        }
    }

    try { const mbbank = require('../services/mbbank'); if (mbbank.reloadConfig) mbbank.reloadConfig(); } catch { }
    res.json({ success: true, message: 'Đã lưu cấu hình MB Bank' });
});

// POST /api/sa/test-mbbank
router.post('/test-mbbank', async (req, res) => {
    const keys = ['mb_api_key', 'mb_account_no', 'mb_user', 'mb_password'];
    const cfg = {};
    for (const key of keys) {
        const row = await db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
        cfg[key] = row ? row.value : '';
    }
    if (!cfg.mb_api_key || !cfg.mb_account_no) return res.json({ ok: false, message: 'Chưa cấu hình API Key hoặc STK' });

    try {
        const params = new URLSearchParams({ key: cfg.mb_api_key, username: cfg.mb_user || cfg.mb_account_no, password: cfg.mb_password || '', accountNo: cfg.mb_account_no });
        const response = await fetch(`https://apicanhan.com/api/mbbankv3?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) return res.json({ ok: false, message: `HTTP ${response.status}` });
        const data = await response.json();
        if (data.status === 'success') {
            return res.json({ ok: true, message: `Kết nối OK! Nhận được ${(data.transactions || []).length} giao dịch`, count: (data.transactions || []).length });
        }
        return res.json({ ok: false, message: `API lỗi: ${data.message || 'Unknown'}` });
    } catch (err) { return res.json({ ok: false, message: `Lỗi: ${err.message}` }); }
});

module.exports = router;
