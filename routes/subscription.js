const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// ========== PUBLIC - List active plans ==========
router.get('/', (req, res) => {
    const plans = db.prepare('SELECT * FROM sa_plans WHERE is_active = 1 ORDER BY sort_order').all();
    plans.forEach(p => { try { p.features = JSON.parse(p.features); } catch { p.features = []; } });
    res.json({ plans });
});

// ========== GET current user subscription ==========
router.get('/my', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const user = db.prepare('SELECT id, balance, display_name FROM users WHERE id = ?').get(userId);
    const activeSub = db.prepare(`
    SELECT s.*, p.name as plan_name, p.slug as plan_slug, p.price, p.price_label, p.color, p.icon,
           p.max_farms, p.max_members, p.sync_interval, p.duration_days
    FROM sa_subscriptions s
    JOIN sa_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? AND s.status = 'active' AND (s.end_date IS NULL OR s.end_date >= date('now'))
    ORDER BY s.created_at DESC LIMIT 1
  `).get(userId);
    res.json({ balance: user ? user.balance : 0, subscription: activeSub || null });
});

// ========== SUBSCRIBE to a plan ==========
router.post('/subscribe', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id là bắt buộc' });

    const plan = db.prepare('SELECT * FROM sa_plans WHERE id = ? AND is_active = 1').get(plan_id);
    if (!plan) return res.status(404).json({ error: 'Gói không tồn tại hoặc đã ngừng hoạt động' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });

    // Check for existing active subscription
    const activeSub = db.prepare(`
    SELECT s.*, p.price, p.duration_days, p.name as plan_name
    FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? AND s.status = 'active' AND (s.end_date IS NULL OR s.end_date >= date('now'))
    ORDER BY s.created_at DESC LIMIT 1
  `).get(userId);

    let cost = plan.price;
    let refund = 0;
    const durationDays = plan.duration_days || 30;

    // Pro-rata upgrade calculation
    if (activeSub) {
        const startDate = new Date(activeSub.start_date);
        const endDate = new Date(activeSub.end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const totalDays = activeSub.duration_days || 30;
        const remainingDays = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
        const dailyRate = activeSub.price / totalDays;
        refund = Math.floor(remainingDays * dailyRate);
        cost = Math.max(0, plan.price - refund);

        // Can't downgrade
        if (plan.price <= activeSub.price) {
            return res.status(400).json({
                error: `Không thể hạ cấp. Bạn đang dùng gói ${activeSub.plan_name} (${activeSub.price.toLocaleString()}đ)`
            });
        }
    }

    // Check balance
    if (user.balance < cost) {
        return res.status(400).json({
            error: `Số dư không đủ. Cần ${cost.toLocaleString()}đ${refund > 0 ? ` (đã trừ hoàn ${refund.toLocaleString()}đ từ gói cũ)` : ''}, hiện có ${user.balance.toLocaleString()}đ`,
            need: cost,
            have: user.balance,
            refund
        });
    }

    // Process subscription
    const txn = db.transaction(() => {
        // Deactivate old subscription
        if (activeSub) {
            db.prepare('UPDATE sa_subscriptions SET status = ?, end_date = date(?) WHERE id = ?')
                .run('upgraded', new Date().toISOString().split('T')[0], activeSub.id);
        }

        // Deduct balance
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(cost, userId);

        // Log balance change
        db.prepare('INSERT INTO balance_logs (user_id, amount, type, description) VALUES (?, ?, ?, ?)')
            .run(userId, -cost, activeSub ? 'upgrade' : 'subscribe',
                activeSub
                    ? `Nâng cấp ${activeSub.plan_name} → ${plan.name} (hoàn ${refund.toLocaleString()}đ)`
                    : `Đăng ký gói ${plan.name}`);

        // Create new subscription
        const startDate = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const result = db.prepare(`
      INSERT INTO sa_subscriptions (user_id, plan_id, status, start_date, end_date, amount_paid, payment_method, notes)
      VALUES (?, ?, 'active', ?, ?, ?, 'balance', ?)
    `).run(userId, plan_id, startDate, endDate, cost,
            activeSub ? `Nâng cấp từ ${activeSub.plan_name}. Hoàn ${refund.toLocaleString()}đ` : '');

        return {
            subscription_id: result.lastInsertRowid,
            cost,
            refund,
            new_balance: user.balance - cost,
            start_date: startDate,
            end_date: endDate
        };
    });

    try {
        const result = txn();
        res.json({
            ok: true,
            message: `Đã đăng ký gói ${plan.name} thành công!${refund > 0 ? ` Hoàn ${refund.toLocaleString()}đ từ gói cũ.` : ''}`,
            ...result
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== UPGRADE PREVIEW ==========
router.post('/upgrade-preview', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id là bắt buộc' });

    const plan = db.prepare('SELECT * FROM sa_plans WHERE id = ? AND is_active = 1').get(plan_id);
    if (!plan) return res.status(404).json({ error: 'Gói không tồn tại' });

    const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);

    const activeSub = db.prepare(`
    SELECT s.*, p.price, p.duration_days, p.name as plan_name
    FROM sa_subscriptions s JOIN sa_plans p ON s.plan_id = p.id
    WHERE s.user_id = ? AND s.status = 'active' AND (s.end_date IS NULL OR s.end_date >= date('now'))
    ORDER BY s.created_at DESC LIMIT 1
  `).get(userId);

    let refund = 0, cost = plan.price;
    if (activeSub) {
        const endDate = new Date(activeSub.end_date);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const totalDays = activeSub.duration_days || 30;
        const remainingDays = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
        const dailyRate = activeSub.price / totalDays;
        refund = Math.floor(remainingDays * dailyRate);
        cost = Math.max(0, plan.price - refund);
    }

    res.json({
        plan_name: plan.name,
        plan_price: plan.price,
        current_plan: activeSub ? activeSub.plan_name : null,
        refund,
        cost,
        balance: user ? user.balance : 0,
        can_afford: (user ? user.balance : 0) >= cost
    });
});

// ========== BALANCE HISTORY ==========
router.get('/balance-history', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const logs = db.prepare(`
    SELECT bl.*, u.display_name as admin_name
    FROM balance_logs bl
    LEFT JOIN users u ON u.id = bl.admin_id
    WHERE bl.user_id = ?
    ORDER BY bl.created_at DESC LIMIT 50
  `).all(userId);
    res.json({ logs });
});

// ========== CHECK DEPOSIT (called from frontend every 3s when invoice active) ==========
router.get('/check-deposit', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    try {
        // Trigger fast-check mode
        const mbbank = require('../services/mbbank');
        mbbank.startFastCheck();

        // Run immediate check
        const credited = await mbbank.checkTransactions();

        // Get current balance
        const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);

        // Check if THIS user got credited
        const userCredited = credited.find(c => c.user.id === userId);

        res.json({
            balance: user ? user.balance : 0,
            credited: userCredited ? userCredited.amount : 0,
            message: userCredited ? `Đã nhận ${userCredited.amount.toLocaleString()}đ!` : null
        });
    } catch (err) {
        const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
        res.json({ balance: user ? user.balance : 0, credited: 0 });
    }
});

// ========== STOP FAST CHECK ==========
router.post('/stop-check', requireAuth, (req, res) => {
    try {
        const mbbank = require('../services/mbbank');
        mbbank.stopFastCheck();
    } catch { }
    res.json({ ok: true });
});

module.exports = router;

