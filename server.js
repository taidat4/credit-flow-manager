require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for Railway/Render (needed for secure cookies behind reverse proxy)
if (isProd) app.set('trust proxy', 1);

const sessionDb = new Database(path.join(__dirname, 'db', 'sessions.db'));
app.use(session({
    store: new SqliteStore({ client: sessionDb, expired: { clear: true, intervalMs: 900000 } }),
    secret: process.env.SESSION_SECRET || 'credit-flow-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProd,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

require('./db/database');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/members', require('./routes/members'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/super-admin', require('./routes/superadmin'));

// Super Admin dashboard - separate entry point
app.get('/super-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'super-admin.html'));
});

app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Credit-Flow Manager running on http://localhost:${PORT}`);

    // Start auto sync (requires Playwright - skip on Railway/cloud)
    try {
        const { startAutoSync } = require('./services/scraper');
        startAutoSync();
    } catch (err) {
        console.log('[Scraper] ⚠️ Không khả dụng (thiếu browser) - bỏ qua auto sync');
    }

    // Start MB Bank service
    const { startAutoCheck } = require('./services/mbbank');
    startAutoCheck();
});

