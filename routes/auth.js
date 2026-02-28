const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

// Middleware to check auth
async function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        const user = await db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.session.userId);
        if (user) {
            req.user = user;
            return next();
        }
    }
    res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ error: 'Forbidden' });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const user = await db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.prepare('UPDATE users SET last_login = NOW() WHERE id = ?').run(user.id);
    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
        success: true,
        user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, avatar_color: user.avatar_color }
    });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, password, display_name, role } = req.body;
    if (!username || !password || !display_name) return res.status(400).json({ error: 'All fields are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const userRole = role || 'viewer';
    const result = await db.prepare('INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)').run(username, hashedPassword, display_name, userRole);

    res.json({ success: true, user: { id: result.lastInsertRowid, username, display_name, role: userRole } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// GET /api/auth/check
router.get('/check', async (req, res) => {
    if (req.session && req.session.userId) {
        const user = await db.prepare('SELECT id, username, display_name, role, avatar_color FROM users WHERE id = ? AND is_active = 1').get(req.session.userId);
        if (user) return res.json({ authenticated: true, user });
    }
    res.json({ authenticated: false });
});

// PUT /api/auth/password
router.put('/password', requireAuth, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!bcrypt.compareSync(current_password, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, user.id);
    res.json({ success: true });
});

// GET /api/auth/users (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
    const users = await db.prepare('SELECT id, username, display_name, role, avatar_color, created_at, last_login, is_active FROM users').all();
    res.json(users);
});

// DELETE /api/auth/users/:id (admin only)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (parseInt(id) === req.session.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    await db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
