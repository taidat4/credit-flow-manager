require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for Railway/Render
if (isProd) app.set('trust proxy', 1);

// Session store using PostgreSQL
app.use(session({
    store: new pgSession({
        pool: db.pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
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

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/members', require('./routes/members'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/storage', require('./routes/storage'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/super-admin', require('./routes/superadmin'));

// Global JSON error handler for API routes
app.use('/api', (err, req, res, next) => {
    console.error(`[API Error] ${req.method} ${req.url}:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Super Admin dashboard
app.get('/super-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'super-admin.html'));
});

// SPA catch-all (only for non-API routes)
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB then start server
db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Credit-Flow Manager running on http://localhost:${PORT}`);

        // Start auto sync (optional - requires Playwright)
        try {
            const { startAutoSync } = require('./services/scraper');
            startAutoSync();
        } catch (err) {
            console.log('[Scraper] ⚠️ Không khả dụng - bỏ qua auto sync');
        }

        // Start MB Bank service
        try {
            const { startAutoCheck } = require('./services/mbbank');
            startAutoCheck();
        } catch (err) {
            console.log('[MBBank] ⚠️ Start error:', err.message);
        }
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err.message);
    process.exit(1);
});
