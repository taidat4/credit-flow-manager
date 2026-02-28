const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// GET /api/members
router.get('/', requireAuth, async (req, res) => {
  const { admin_id } = req.query;
  const userId = req.session.userId;

  let query = `
        SELECT m.*, a.name as admin_name, a.email as admin_email,
            COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as total_credits_used,
            COALESCE((SELECT sl.total_gb FROM storage_logs sl WHERE sl.member_id = m.id ORDER BY sl.log_date DESC, sl.id DESC LIMIT 1), 0) as current_storage_gb
        FROM members m JOIN admins a ON a.id = m.admin_id
        WHERE m.status != 'removed' AND (a.user_id = $1 OR a.user_id IS NULL)
    `;
  const params = [userId];

  if (admin_id) {
    query += ` AND m.admin_id = $${params.length + 1}`;
    params.push(admin_id);
  }
  query += ' ORDER BY m.admin_id ASC, m.joined_at ASC';

  const result = await db.pool.query(query, params);
  res.json(result.rows);
});

// GET /api/members/:id
router.get('/:id', requireAuth, async (req, res) => {
  const member = await db.prepare(`
        SELECT m.*, a.name as admin_name, a.email as admin_email,
            COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as total_credits_used
        FROM members m JOIN admins a ON a.id = m.admin_id WHERE m.id = ?
    `).get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const creditHistory = await db.prepare('SELECT * FROM credit_logs WHERE member_id = ? ORDER BY log_date DESC, id DESC LIMIT 50').all(req.params.id);
  const storageHistory = await db.prepare('SELECT * FROM storage_logs WHERE member_id = ? ORDER BY log_date DESC, id DESC LIMIT 50').all(req.params.id);

  res.json({ member, creditHistory, storageHistory });
});

// POST /api/members
router.post('/', requireAuth, async (req, res) => {
  const { admin_id, name, email, avatar_color } = req.body;
  if (!admin_id || !name) return res.status(400).json({ error: 'admin_id and name are required' });

  const userId = req.session.userId;
  const admin = await db.prepare('SELECT * FROM admins WHERE id = ? AND status = ? AND (user_id = ? OR user_id IS NULL)').get(admin_id, 'active', userId);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const memberCount = await db.prepare("SELECT COUNT(*) as count FROM members WHERE admin_id = ? AND status = 'active'").get(admin_id);
  if (parseInt(memberCount.count) >= admin.max_members) return res.status(400).json({ error: `Admin đã đạt tối đa ${admin.max_members} thành viên` });

  const result = await db.prepare('INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, ?, ?, ?)').run(admin_id, name, email || '', avatar_color || '#6366f1');
  await db.prepare('INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb) VALUES (?, ?, 0, 0, 0)').run(result.lastInsertRowid, admin_id);

  const member = await db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
  res.json(member);
});

// PUT /api/members/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { name, email, avatar_color, status } = req.body;
  const member = await db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  await db.prepare('UPDATE members SET name = COALESCE(?, name), email = COALESCE(?, email), avatar_color = COALESCE(?, avatar_color), status = COALESCE(?, status), updated_at = NOW() WHERE id = ?').run(name, email, avatar_color, status, req.params.id);
  const updated = await db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/members/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await db.prepare("UPDATE members SET status = 'removed', updated_at = NOW() WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// PUT /api/members/:id/credit-limit
router.put('/:id/credit-limit', requireAuth, async (req, res) => {
  const { credit_limit } = req.body;
  if (credit_limit === undefined || credit_limit === null) return res.status(400).json({ error: 'credit_limit is required' });
  const member = await db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  await db.prepare('UPDATE members SET credit_limit = ?, updated_at = NOW() WHERE id = ?').run(credit_limit, req.params.id);
  res.json({ success: true, credit_limit });
});

module.exports = router;
