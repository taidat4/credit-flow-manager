const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// GET /api/dashboard - Multi-admin overview
router.get('/', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const admins = db.prepare('SELECT * FROM admins WHERE status = ? AND (user_id = ? OR user_id IS NULL)').all('active', userId);
  const now = new Date();

  let totalCredits = 0, totalCreditsUsed = 0, totalStorageTb = 0, totalStorageUsed = 0, totalMembers = 0;

  const adminOverviews = admins.map(admin => {
    const resetDay = admin.credit_reset_day;
    let periodStart;
    if (now.getDate() >= resetDay) {
      periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, resetDay);
    }
    const periodStartStr = periodStart.toISOString().split('T')[0];

    // Credits
    const creditUsage = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM credit_logs WHERE admin_id = ? AND log_date >= ?
    `).get(admin.id, periodStartStr);

    // Use actual value from Google if available
    let creditsUsed, creditsRemaining;
    if (admin.credits_remaining_actual > 0) {
      creditsRemaining = admin.credits_remaining_actual;
      creditsUsed = admin.total_monthly_credits - admin.credits_remaining_actual;
    } else {
      creditsUsed = creditUsage.total;
      creditsRemaining = admin.total_monthly_credits - creditUsage.total;
    }

    // Members with stats
    const members = db.prepare(`
      SELECT m.*,
        COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as credits_used,
        COALESCE((SELECT sl.total_gb FROM storage_logs sl WHERE sl.member_id = m.id ORDER BY sl.log_date DESC, sl.id DESC LIMIT 1), 0) as storage_gb
      FROM members m WHERE m.admin_id = ? AND m.status = 'active'
      ORDER BY m.joined_at ASC
    `).all(admin.id);

    const storageUsed = members.reduce((sum, m) => sum + m.storage_gb, 0);

    // Accumulate totals
    totalCredits += admin.total_monthly_credits;
    totalCreditsUsed += creditsUsed;
    totalStorageTb += admin.total_storage_tb;
    totalStorageUsed += storageUsed;
    totalMembers += members.length;

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      avatar_color: admin.avatar_color,
      has_totp: !!admin.totp_secret,
      credits: {
        total: admin.total_monthly_credits,
        used: creditsUsed,
        remaining: creditsRemaining,
        percent: Math.round((creditsUsed / admin.total_monthly_credits) * 100)
      },
      storage: {
        total_tb: admin.total_storage_tb,
        used_gb: storageUsed,
        percent: Math.round((storageUsed / (admin.total_storage_tb * 1024)) * 100)
      },
      members,
      member_count: members.length,
      max_members: admin.max_members,
      slots_available: admin.max_members - members.length
    };
  });

  // Recent activity
  const recentCredits = db.prepare(`
    SELECT cl.*, m.name as member_name, m.avatar_color, a.name as admin_name, a.email as admin_email
    FROM credit_logs cl
    LEFT JOIN members m ON m.id = cl.member_id
    JOIN admins a ON a.id = cl.admin_id
    WHERE (a.user_id = ? OR a.user_id IS NULL)
    ORDER BY cl.created_at DESC LIMIT 10
  `).all(userId);

  res.json({
    totals: {
      admins: admins.length,
      members: totalMembers,
      credits: totalCredits,
      credits_used: totalCreditsUsed,
      credits_remaining: totalCredits - totalCreditsUsed,
      storage_tb: totalStorageTb,
      storage_used_gb: totalStorageUsed
    },
    admins: adminOverviews,
    recent_activity: recentCredits
  });
});

module.exports = router;
