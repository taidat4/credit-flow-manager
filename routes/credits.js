const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// GET /api/credits/summary?admin_id=...
router.get('/summary', requireAuth, (req, res) => {
  const { admin_id } = req.query;

  if (admin_id) {
    // Single admin summary
    const userId = req.session.userId;
    const admin = db.prepare('SELECT * FROM admins WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(admin_id, userId);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const now = new Date();
    const resetDay = admin.credit_reset_day;
    let periodStart;
    if (now.getDate() >= resetDay) {
      periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, resetDay);
    }
    const periodStartStr = periodStart.toISOString().split('T')[0];

    const totalUsed = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM credit_logs WHERE admin_id = ? AND log_date >= ?
    `).get(admin_id, periodStartStr);

    const memberUsage = db.prepare(`
      SELECT m.id, m.name, m.avatar_color,
        COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as credits_used
      FROM members m
      WHERE m.admin_id = ? AND m.status = 'active'
      ORDER BY credits_used DESC
    `).all(admin_id);

    res.json({
      admin_id: parseInt(admin_id),
      admin_name: admin.name,
      total_monthly: admin.total_monthly_credits,
      total_used: totalUsed.total,
      remaining: admin.total_monthly_credits - totalUsed.total,
      period_start: periodStartStr,
      reset_day: resetDay,
      member_usage: memberUsage
    });
  } else {
    // All admins summary
    const userId = req.session.userId;
    const admins = db.prepare('SELECT * FROM admins WHERE status = ? AND (user_id = ? OR user_id IS NULL)').all('active', userId);
    const now = new Date();
    let totalCredits = 0, totalUsed = 0;

    const adminSummaries = admins.map(admin => {
      const resetDay = admin.credit_reset_day;
      let periodStart;
      if (now.getDate() >= resetDay) {
        periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay);
      } else {
        periodStart = new Date(now.getFullYear(), now.getMonth() - 1, resetDay);
      }
      const periodStartStr = periodStart.toISOString().split('T')[0];

      const usage = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM credit_logs WHERE admin_id = ? AND log_date >= ?
      `).get(admin.id, periodStartStr);

      totalCredits += admin.total_monthly_credits;
      totalUsed += usage.total;

      return {
        admin_id: admin.id,
        admin_name: admin.name,
        admin_email: admin.email,
        total_monthly: admin.total_monthly_credits,
        used: usage.total,
        remaining: admin.total_monthly_credits - usage.total
      };
    });

    res.json({
      total_credits: totalCredits,
      total_used: totalUsed,
      total_remaining: totalCredits - totalUsed,
      admins: adminSummaries
    });
  }
});

// GET /api/credits/history
router.get('/history', requireAuth, (req, res) => {
  const { admin_id, member_id, start_date, end_date, limit = 100 } = req.query;

  let query = `
    SELECT cl.*, m.name as member_name, m.avatar_color, a.name as admin_name, a.email as admin_email
    FROM credit_logs cl
    LEFT JOIN members m ON m.id = cl.member_id
    JOIN admins a ON a.id = cl.admin_id
    WHERE 1=1
  `;
  const params = [];

  if (admin_id) { query += ' AND cl.admin_id = ?'; params.push(admin_id); }
  if (member_id) { query += ' AND cl.member_id = ?'; params.push(member_id); }
  if (start_date) { query += ' AND cl.log_date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND cl.log_date <= ?'; params.push(end_date); }

  query += ' ORDER BY cl.log_date DESC, cl.id DESC LIMIT ?';
  params.push(parseInt(limit));

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

// POST /api/credits/log
router.post('/log', requireAuth, (req, res) => {
  const { admin_id, member_id, amount, description, log_date } = req.body;
  if (!admin_id || !amount) return res.status(400).json({ error: 'admin_id and amount are required' });

  const date = log_date || new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(admin_id, member_id || null, amount, description || '', date);

  const log = db.prepare(`
    SELECT cl.*, m.name as member_name, a.name as admin_name
    FROM credit_logs cl
    LEFT JOIN members m ON m.id = cl.member_id
    JOIN admins a ON a.id = cl.admin_id
    WHERE cl.id = ?
  `).get(result.lastInsertRowid);
  res.json(log);
});

// PUT /api/credits/log/:id
router.put('/log/:id', requireAuth, (req, res) => {
  const { amount, description, log_date } = req.body;
  db.prepare(`
    UPDATE credit_logs SET
      amount = COALESCE(?, amount),
      description = COALESCE(?, description),
      log_date = COALESCE(?, log_date)
    WHERE id = ?
  `).run(amount, description, log_date, req.params.id);

  const updated = db.prepare(`
    SELECT cl.*, m.name as member_name FROM credit_logs cl
    LEFT JOIN members m ON m.id = cl.member_id WHERE cl.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE /api/credits/log/:id
router.delete('/log/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM credit_logs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
