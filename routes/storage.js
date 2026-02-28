const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// GET /api/storage/summary?admin_id=...
router.get('/summary', requireAuth, (req, res) => {
  const { admin_id } = req.query;

  if (admin_id) {
    const userId = req.session.userId;
    const admin = db.prepare('SELECT * FROM admins WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(admin_id, userId);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const memberStorage = db.prepare(`
      SELECT m.id, m.name, m.avatar_color,
        COALESCE(sl.drive_gb, 0) as drive_gb,
        COALESCE(sl.gmail_gb, 0) as gmail_gb,
        COALESCE(sl.photos_gb, 0) as photos_gb,
        COALESCE(sl.total_gb, 0) as total_gb
      FROM members m
      LEFT JOIN storage_logs sl ON sl.id = (
        SELECT id FROM storage_logs WHERE member_id = m.id ORDER BY log_date DESC, id DESC LIMIT 1
      )
      WHERE m.admin_id = ? AND m.status = 'active'
      ORDER BY total_gb DESC
    `).all(admin_id);

    const totalUsed = memberStorage.reduce((sum, m) => sum + m.total_gb, 0);

    res.json({
      admin_id: parseInt(admin_id),
      admin_name: admin.name,
      total_storage_tb: admin.total_storage_tb,
      total_storage_gb: admin.total_storage_tb * 1024,
      total_used_gb: totalUsed,
      remaining_gb: (admin.total_storage_tb * 1024) - totalUsed,
      member_storage: memberStorage
    });
  } else {
    // All admins
    const userId = req.session.userId;
    const admins = db.prepare('SELECT * FROM admins WHERE status = ? AND (user_id = ? OR user_id IS NULL)').all('active', userId);
    let grandTotalTb = 0, grandTotalUsed = 0;

    const adminSummaries = admins.map(admin => {
      const memberStorage = db.prepare(`
        SELECT COALESCE(SUM(sl.total_gb), 0) as total
        FROM members m
        LEFT JOIN storage_logs sl ON sl.id = (
          SELECT id FROM storage_logs WHERE member_id = m.id ORDER BY log_date DESC, id DESC LIMIT 1
        )
        WHERE m.admin_id = ? AND m.status = 'active'
      `).get(admin.id);

      grandTotalTb += admin.total_storage_tb;
      grandTotalUsed += memberStorage.total;

      return {
        admin_id: admin.id,
        admin_name: admin.name,
        total_storage_tb: admin.total_storage_tb,
        used_gb: memberStorage.total
      };
    });

    res.json({
      total_storage_tb: grandTotalTb,
      total_used_gb: grandTotalUsed,
      remaining_gb: (grandTotalTb * 1024) - grandTotalUsed,
      admins: adminSummaries
    });
  }
});

// POST /api/storage/update
router.post('/update', requireAuth, (req, res) => {
  const { member_id, drive_gb, gmail_gb, photos_gb } = req.body;
  if (!member_id) return res.status(400).json({ error: 'member_id is required' });

  const member = db.prepare('SELECT * FROM members WHERE id = ? AND status = ?').get(member_id, 'active');
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const result = db.prepare(`
    INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb)
    VALUES (?, ?, ?, ?, ?)
  `).run(member_id, member.admin_id, drive_gb || 0, gmail_gb || 0, photos_gb || 0);

  const log = db.prepare('SELECT * FROM storage_logs WHERE id = ?').get(result.lastInsertRowid);
  res.json(log);
});

// GET /api/storage/history
router.get('/history', requireAuth, (req, res) => {
  const { admin_id, member_id, limit = 50 } = req.query;

  let query = `
    SELECT sl.*, m.name as member_name, m.avatar_color, a.name as admin_name
    FROM storage_logs sl
    JOIN members m ON m.id = sl.member_id
    JOIN admins a ON a.id = sl.admin_id
    WHERE 1=1
  `;
  const params = [];

  if (admin_id) { query += ' AND sl.admin_id = ?'; params.push(admin_id); }
  if (member_id) { query += ' AND sl.member_id = ?'; params.push(member_id); }

  query += ' ORDER BY sl.log_date DESC, sl.id DESC LIMIT ?';
  params.push(parseInt(limit));

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

module.exports = router;
