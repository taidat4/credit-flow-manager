const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    avatar_color TEXT DEFAULT '#6366f1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    totp_secret TEXT,
    total_monthly_credits INTEGER NOT NULL DEFAULT 25000,
    total_storage_tb REAL NOT NULL DEFAULT 30,
    max_members INTEGER NOT NULL DEFAULT 5,
    credit_reset_day INTEGER NOT NULL DEFAULT 27,
    avatar_color TEXT DEFAULT '#6366f1',
    status TEXT NOT NULL DEFAULT 'active',
    google_password TEXT DEFAULT '',
    last_sync DATETIME,
    sync_status TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar_color TEXT DEFAULT '#6366f1',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS credit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    member_id INTEGER,
    amount INTEGER NOT NULL,
    description TEXT,
    log_date DATE NOT NULL DEFAULT (date('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS storage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    admin_id INTEGER NOT NULL,
    drive_gb REAL DEFAULT 0,
    gmail_gb REAL DEFAULT 0,
    photos_gb REAL DEFAULT 0,
    total_gb REAL GENERATED ALWAYS AS (drive_gb + gmail_gb + photos_gb) STORED,
    log_date DATE NOT NULL DEFAULT (date('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
  );

  -- Super Admin tables
  CREATE TABLE IF NOT EXISTS sa_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    price_label TEXT NOT NULL DEFAULT '0',
    max_farms INTEGER NOT NULL DEFAULT 10,
    max_members INTEGER NOT NULL DEFAULT 50,
    sync_interval TEXT NOT NULL DEFAULT '30 phút',
    features TEXT NOT NULL DEFAULT '[]',
    badge_text TEXT DEFAULT '',
    badge_color TEXT DEFAULT '',
    color TEXT NOT NULL DEFAULT '#22c55e',
    icon TEXT NOT NULL DEFAULT '🌱',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sa_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT (date('now')),
    end_date DATE,
    amount_paid INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES sa_plans(id)
  );

  CREATE TABLE IF NOT EXISTS sa_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    is_popup INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    show_from DATETIME,
    show_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sa_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add credit_limit column if not exists
try { db.exec('ALTER TABLE members ADD COLUMN credit_limit INTEGER DEFAULT 0'); } catch (e) { /* column exists */ }
// Add credits_remaining_actual column to admins
try { db.exec('ALTER TABLE admins ADD COLUMN credits_remaining_actual INTEGER DEFAULT 0'); } catch (e) { /* column exists */ }
// Add balance column to users
try { db.exec('ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0'); } catch (e) { /* column exists */ }
// Add duration_days to sa_plans
try { db.exec('ALTER TABLE sa_plans ADD COLUMN duration_days INTEGER DEFAULT 30'); } catch (e) { /* column exists */ }
// Add user_id to admins for data isolation (each user sees only their own admins)
try { db.exec('ALTER TABLE admins ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch (e) { /* column exists */ }
// Assign existing admins with NULL user_id to the first user
try {
  const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
  if (firstUser) {
    db.prepare('UPDATE admins SET user_id = ? WHERE user_id IS NULL').run(firstUser.id);
  }
} catch (e) { /* ignore */ }

// Create balance_logs table for tracking all balance changes
db.exec(`
  CREATE TABLE IF NOT EXISTS balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'deposit',
    description TEXT DEFAULT '',
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Seed data
function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, display_name, role, avatar_color)
      VALUES ('admin', ?, 'Administrator', 'admin', '#6366f1')
    `).run(hashedPassword);
  }

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminCount.count === 0) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    const adminResult = db.prepare(`
      INSERT INTO admins (email, name, totp_secret, total_monthly_credits, total_storage_tb, avatar_color, user_id)
      VALUES ('admin@gmail.com', 'Admin Account 1', '', 25000, 30, '#f97316', ?)
    `).run(firstUser ? firstUser.id : 1);
    const adminId = adminResult.lastInsertRowid;
    const m1 = db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Hieu Nguyen', '', '#f97316')`).run(adminId);
    const m2 = db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Andrew Nguyen', '', '#ef4444')`).run(adminId);
    db.prepare(`INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, ?, 2900, 'AI credit usage', date('now'))`).run(adminId, m1.lastInsertRowid);
    db.prepare(`INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb) VALUES (?, ?, 0, 0, 0)`).run(m1.lastInsertRowid, adminId);
    db.prepare(`INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb) VALUES (?, ?, 0, 0, 0)`).run(m2.lastInsertRowid, adminId);
  }

  // Seed default plans
  const planCount = db.prepare('SELECT COUNT(*) as count FROM sa_plans').get();
  if (planCount.count === 0) {
    const plans = [
      { name: 'Basic', slug: 'basic', price: 100000, price_label: '100K', max_farms: 10, max_members: 50, sync_interval: '30 phút', color: '#22c55e', icon: '🌱', sort_order: 1, features: '["Dashboard cơ bản"]' },
      { name: 'Standard', slug: 'standard', price: 200000, price_label: '200K', max_farms: 25, max_members: 125, sync_interval: '20 phút', color: '#6366f1', icon: '⚡', sort_order: 2, features: '["Dashboard + Báo cáo","API Access"]' },
      { name: 'Professional', slug: 'pro', price: 500000, price_label: '500K', max_farms: 50, max_members: 250, sync_interval: '10 phút', color: '#a78bfa', icon: '👑', sort_order: 3, badge_text: '🔥 BÁN CHẠY', badge_color: 'linear-gradient(135deg,#f97316,#ef4444)', features: '["Dashboard + Analytics","API Access Full","Hỗ trợ ưu tiên"]' },
      { name: 'Enterprise', slug: 'enterprise', price: 1000000, price_label: '1M', max_farms: 9999, max_members: 9999, sync_interval: 'Real-time', color: '#f59e0b', icon: '🏢', sort_order: 4, features: '["Advanced Analytics","Webhook & API","Support 24/7 VIP"]' }
    ];
    const stmt = db.prepare(`INSERT INTO sa_plans (name, slug, price, price_label, max_farms, max_members, sync_interval, color, icon, sort_order, features, badge_text, badge_color) VALUES (@name, @slug, @price, @price_label, @max_farms, @max_members, @sync_interval, @color, @icon, @sort_order, @features, @badge_text, @badge_color)`);
    for (const p of plans) { stmt.run({ badge_text: '', badge_color: '', ...p }); }
  }

  // Seed default config
  const configCount = db.prepare('SELECT COUNT(*) as count FROM sa_config').get();
  if (configCount.count === 0) {
    const configs = [
      { key: 'theme', value: 'dark' },
      { key: 'primary_color', value: '#6366f1' },
      { key: 'site_name', value: 'Credit-Flow Manager' },
      { key: 'welcome_text', value: 'Chào mừng bạn đến với hệ thống quản lý Google One!' },
    ];
    const stmt = db.prepare('INSERT INTO sa_config (key, value) VALUES (?, ?)');
    for (const c of configs) { stmt.run(c.key, c.value); }
  }
}

seedData();

module.exports = db;
