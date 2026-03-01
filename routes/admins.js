const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');
const OTPAuth = require('otpauth');
const { encrypt, decrypt } = require('../services/crypto');

// Scraper is optional (requires Playwright)
// If not available, forward sync requests to VPS via API bridge
let syncAdmin, syncAllAdmins, getSyncStatus, addFamilyMember, cancelInvitation, removeFamilyMember;
let useVpsBridge = false;
try {
  ({ syncAdmin, syncAllAdmins, getSyncStatus, addFamilyMember, cancelInvitation, removeFamilyMember } = require('../services/scraper'));
} catch {
  useVpsBridge = true;
  const SYNC_KEY = process.env.SYNC_API_KEY || 'sync-bridge-2026';
  const VPS_URL = process.env.VPS_SYNC_URL || 'http://147.124.205.237:3000';

  syncAdmin = async (adminId) => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/${adminId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY }
      });
      return await res.json();
    } catch (err) {
      console.error('[Bridge] VPS sync failed:', err.message);
      return { status: 'error', message: 'Không kết nối được VPS sync server' };
    }
  };

  syncAllAdmins = async () => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY }
      });
      return await res.json();
    } catch (err) {
      return { status: 'error', message: 'Không kết nối được VPS sync server' };
    }
  };

  getSyncStatus = async (adminId) => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/${adminId}/sync-status`, {
        headers: { 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY }
      });
      return await res.json();
    } catch (err) {
      return { status: 'idle', message: 'VPS không khả dụng' };
    }
  };

  addFamilyMember = async (adminId, email) => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/${adminId}/add-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY },
        body: JSON.stringify({ email })
      });
      return await res.json();
    } catch (err) {
      return { status: 'error', message: 'Không kết nối được VPS' };
    }
  };

  cancelInvitation = async (adminId, memberEmail) => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/${adminId}/cancel-invitation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY },
        body: JSON.stringify({ memberEmail })
      });
      return await res.json();
    } catch (err) {
      return { status: 'error', message: 'Không kết nối được VPS' };
    }
  };

  removeFamilyMember = async (adminId, memberId) => {
    try {
      const res = await fetch(`${VPS_URL}/api/admins/${adminId}/remove-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VPS-Bridge': 'true', 'X-Sync-Key': SYNC_KEY },
        body: JSON.stringify({ memberId })
      });
      return await res.json();
    } catch (err) {
      return { status: 'error', message: 'Không kết nối được VPS' };
    }
  };
}

// GET /api/admins
router.get('/', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const admins = await db.prepare(`
        SELECT a.*,
            (SELECT COUNT(*) FROM members m WHERE m.admin_id = a.id AND m.status = 'active') as member_count,
            COALESCE((SELECT SUM(cl.amount) FROM credit_logs cl WHERE cl.admin_id = a.id), 0) as credits_used
        FROM admins a
        WHERE a.status != 'removed' AND (a.user_id = ? OR a.user_id IS NULL)
        ORDER BY a.created_at DESC
    `).all(userId);

  const now = new Date();
  for (const admin of admins) {
    const resetDay = admin.credit_reset_day;
    let periodStart;
    if (now.getDate() >= resetDay) {
      periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, resetDay);
    }
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const usage = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM credit_logs WHERE admin_id = ? AND log_date >= ?').get(admin.id, periodStartStr);

    if (admin.credits_remaining_actual > 0) {
      admin.credits_remaining = admin.credits_remaining_actual;
      admin.credits_used = admin.total_monthly_credits - admin.credits_remaining_actual;
    } else {
      admin.credits_used = parseInt(usage.total);
      admin.credits_remaining = admin.total_monthly_credits - parseInt(usage.total);
    }

    const storageResult = await db.prepare('SELECT COALESCE(SUM(drive_gb + gmail_gb + photos_gb), 0) as total_gb FROM storage_logs WHERE admin_id = ? AND log_date = (SELECT MAX(log_date) FROM storage_logs WHERE admin_id = ?)').get(admin.id, admin.id);
    const totalGB = storageResult ? parseFloat(storageResult.total_gb) : 0;
    admin.storage_used = totalGB >= 1 ? totalGB.toFixed(1) + ' GB' : Math.round(totalGB * 1024) + ' MB';

    admin.has_google_password = !!admin.google_password;
    delete admin.google_password;
  }

  res.json(admins);
});

// GET /api/admins/:id
router.get('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const admin = await db.prepare('SELECT * FROM admins WHERE id = ? AND status != ? AND (user_id = ? OR user_id IS NULL)').get(req.params.id, 'removed', userId);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const members = await db.prepare(`
        SELECT m.*,
            COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as total_credits_used,
            COALESCE((SELECT sl.total_gb FROM storage_logs sl WHERE sl.member_id = m.id ORDER BY sl.log_date DESC, sl.id DESC LIMIT 1), 0) as current_storage_gb
        FROM members m WHERE m.admin_id = ? AND m.status IN ('active', 'pending') ORDER BY m.status ASC, m.joined_at ASC
    `).all(req.params.id);

  const { google_password, ...safeAdmin } = admin;
  safeAdmin.has_totp = !!admin.totp_secret;
  safeAdmin.has_google_password = !!google_password;
  if (google_password) {
    try { safeAdmin.google_password_plain = decrypt(google_password); } catch { safeAdmin.google_password_plain = ''; }
  }

  const now = new Date();
  const resetDay = admin.credit_reset_day;
  let periodStart;
  if (now.getDate() >= resetDay) { periodStart = new Date(now.getFullYear(), now.getMonth(), resetDay); }
  else { periodStart = new Date(now.getFullYear(), now.getMonth() - 1, resetDay); }
  const periodStartStr = periodStart.toISOString().split('T')[0];
  const usage = await db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM credit_logs WHERE admin_id = ? AND log_date >= ?').get(admin.id, periodStartStr);

  if (admin.credits_remaining_actual > 0) {
    safeAdmin.credits_remaining = admin.credits_remaining_actual;
    safeAdmin.credits_used = admin.total_monthly_credits - admin.credits_remaining_actual;
  } else {
    safeAdmin.credits_used = parseInt(usage.total);
    safeAdmin.credits_remaining = admin.total_monthly_credits - parseInt(usage.total);
  }

  const storageResult = await db.prepare('SELECT COALESCE(SUM(drive_gb + gmail_gb + photos_gb), 0) as total_gb FROM storage_logs WHERE admin_id = ? AND log_date = (SELECT MAX(log_date) FROM storage_logs WHERE admin_id = ?)').get(admin.id, admin.id);
  safeAdmin.storage_used_gb = storageResult ? parseFloat(storageResult.total_gb) : 0;

  res.json({ admin: safeAdmin, members });
});

// POST /api/admins
router.post('/', requireAuth, async (req, res) => {
  const { email, name, totp_secret, google_password, total_monthly_credits, total_storage_tb, avatar_color, notes } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email and name are required' });

  const encryptedPassword = google_password ? encrypt(google_password) : '';
  const userId = req.session.userId;
  const result = await db.prepare(
    'INSERT INTO admins (email, name, totp_secret, google_password, total_monthly_credits, total_storage_tb, avatar_color, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(email, name, totp_secret || '', encryptedPassword, total_monthly_credits || 25000, total_storage_tb || 30, avatar_color || '#6366f1', notes || '', userId);

  const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(result.lastInsertRowid);
  delete admin.google_password;
  admin.has_google_password = !!encryptedPassword;
  res.json(admin);
});

// PUT /api/admins/:id
router.put('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const admin = await db.prepare('SELECT * FROM admins WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(req.params.id, userId);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const { email, name, totp_secret, google_password, total_monthly_credits, total_storage_tb, max_members, credit_reset_day, avatar_color, notes, status } = req.body;

  let passwordUpdate = admin.google_password;
  if (google_password !== undefined && google_password !== '') { passwordUpdate = encrypt(google_password); }

  await db.prepare(`
        UPDATE admins SET email = COALESCE(?, email), name = COALESCE(?, name), totp_secret = COALESCE(?, totp_secret),
        google_password = ?, total_monthly_credits = COALESCE(?, total_monthly_credits), total_storage_tb = COALESCE(?, total_storage_tb),
        max_members = COALESCE(?, max_members), credit_reset_day = COALESCE(?, credit_reset_day), avatar_color = COALESCE(?, avatar_color),
        notes = COALESCE(?, notes), status = COALESCE(?, status), updated_at = NOW() WHERE id = ?
    `).run(email, name, totp_secret, passwordUpdate, total_monthly_credits, total_storage_tb, max_members, credit_reset_day, avatar_color, notes, status, req.params.id);

  const updated = await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id);
  delete updated.google_password;
  updated.has_google_password = !!passwordUpdate;
  res.json(updated);
});

// DELETE /api/admins/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  await db.prepare("UPDATE admins SET status = 'removed', updated_at = NOW() WHERE id = ? AND (user_id = ? OR user_id IS NULL)").run(req.params.id, userId);
  res.json({ success: true });
});

// GET /api/admins/:id/totp
router.get('/:id/totp', requireAuth, async (req, res) => {
  const admin = await db.prepare('SELECT totp_secret FROM admins WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(req.params.id, req.session.userId);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  if (!admin.totp_secret) return res.status(400).json({ error: 'No TOTP secret configured' });

  try {
    const cleanSecret = admin.totp_secret.replace(/\s+/g, '').toUpperCase();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(cleanSecret), digits: 6, period: 30, algorithm: 'SHA1' });
    const token = totp.generate();
    const now = Math.floor(Date.now() / 1000);
    const remaining = 30 - (now % 30);
    res.json({ code: token, remaining_seconds: remaining, period: 30 });
  } catch (err) { res.status(400).json({ error: 'Invalid TOTP secret: ' + err.message }); }
});

// Bridge auth middleware — allows VPS to accept requests from Railway without session
const SYNC_KEY = process.env.SYNC_API_KEY || 'sync-bridge-2026';
function requireAuthOrBridge(req, res, next) {
  // Accept bridge requests with API key
  if (req.headers['x-vps-bridge'] === 'true' && req.headers['x-sync-key'] === SYNC_KEY) {
    return next();
  }
  // Otherwise require normal session auth
  return requireAuth(req, res, next);
}

// POST /api/admins/:id/sync
router.post('/:id/sync', requireAuthOrBridge, async (req, res) => {
  try {
    res.json({ status: 'started', message: 'Đang sync...' });
    syncAdmin(parseInt(req.params.id)).catch(err => console.error(`[Sync] Error for admin ${req.params.id}:`, err.message));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admins/sync-all
router.post('/sync-all', requireAuthOrBridge, async (req, res) => {
  try {
    res.json({ status: 'started', message: 'Đang sync tất cả admins...' });
    syncAllAdmins().catch(err => console.error('[Sync] Error syncing all:', err.message));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admins/:id/sync-status
router.get('/:id/sync-status', requireAuthOrBridge, async (req, res) => {
  const status = await getSyncStatus(parseInt(req.params.id));
  res.json(status);
});

// POST /api/admins/:id/add-member
router.post('/:id/add-member', requireAuthOrBridge, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email là bắt buộc' });
  try {
    const result = await addFamilyMember(parseInt(req.params.id), email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admins/:id/cancel-invitation
router.post('/:id/cancel-invitation', requireAuthOrBridge, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email là bắt buộc' });
  try {
    const result = await cancelInvitation(parseInt(req.params.id), email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admins/:id/remove-member
router.post('/:id/remove-member', requireAuthOrBridge, async (req, res) => {
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'memberId là bắt buộc' });
  try {
    const result = await removeFamilyMember(parseInt(req.params.id), parseInt(memberId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
