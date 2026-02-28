/* ========================================
   PostgreSQL Database Layer
   Wrapper that provides similar API to better-sqlite3
   but uses pg (node-postgres) for Railway PostgreSQL
   ======================================== */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Use DATABASE_URL from Railway (auto-provided when Postgres service is linked)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper: convert ? placeholders to $1, $2, $3...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Wrapper that mimics better-sqlite3 API but async
const db = {
  // db.prepare(sql) returns object with .get(), .all(), .run()
  prepare(sql) {
    const pgSql = convertPlaceholders(sql);
    return {
      async get(...params) {
        const result = await pool.query(pgSql, params);
        return result.rows[0] || undefined;
      },
      async all(...params) {
        const result = await pool.query(pgSql, params);
        return result.rows;
      },
      async run(...params) {
        let finalSql = pgSql;
        if (/^\s*INSERT/i.test(finalSql) && !/RETURNING/i.test(finalSql)) {
          finalSql = finalSql.replace(/;?\s*$/, ' RETURNING *');
        }
        const result = await pool.query(finalSql, params);
        return {
          lastInsertRowid: result.rows[0]?.id,
          changes: result.rowCount
        };
      }
    };
  },

  // db.exec(sql) - run raw SQL (for CREATE TABLE etc.)
  async exec(sql) {
    await pool.query(sql);
  },

  // db.transaction(fn) - wrap in BEGIN/COMMIT
  transaction(fn) {
    return async (...args) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Override db methods to use this client during transaction
        const txDb = {
          prepare(sql) {
            const pgSql = convertPlaceholders(sql);
            return {
              async get(...params) {
                const result = await client.query(pgSql, params);
                return result.rows[0] || undefined;
              },
              async all(...params) {
                const result = await client.query(pgSql, params);
                return result.rows;
              },
              async run(...params) {
                let finalSql = pgSql;
                if (/^\s*INSERT/i.test(finalSql) && !/RETURNING/i.test(finalSql)) {
                  finalSql = finalSql.replace(/;?\s*$/, ' RETURNING *');
                }
                const result = await client.query(finalSql, params);
                return {
                  lastInsertRowid: result.rows[0]?.id,
                  changes: result.rowCount
                };
              }
            };
          }
        };
        const result = await fn(txDb, ...args);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
  },

  // Direct query helper
  async query(sql, params = []) {
    const result = await pool.query(sql, params);
    return result;
  },

  pool
};

// Initialize database schema
async function initDatabase() {
  await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            avatar_color TEXT DEFAULT '#6366f1',
            balance INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            totp_secret TEXT DEFAULT '',
            total_monthly_credits INTEGER NOT NULL DEFAULT 25000,
            total_storage_tb REAL NOT NULL DEFAULT 30,
            max_members INTEGER NOT NULL DEFAULT 5,
            credit_reset_day INTEGER NOT NULL DEFAULT 27,
            avatar_color TEXT DEFAULT '#6366f1',
            status TEXT NOT NULL DEFAULT 'active',
            google_password TEXT DEFAULT '',
            last_sync TIMESTAMP,
            sync_status TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            credits_remaining_actual INTEGER DEFAULT 0,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS members (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT DEFAULT '',
            avatar_color TEXT DEFAULT '#6366f1',
            credit_limit INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            joined_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS credit_logs (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            description TEXT DEFAULT '',
            log_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS storage_logs (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            drive_gb REAL DEFAULT 0,
            gmail_gb REAL DEFAULT 0,
            photos_gb REAL DEFAULT 0,
            total_gb REAL GENERATED ALWAYS AS (drive_gb + gmail_gb + photos_gb) STORED,
            log_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sa_plans (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            price INTEGER NOT NULL DEFAULT 0,
            price_label TEXT NOT NULL DEFAULT '0',
            max_farms INTEGER DEFAULT 10,
            max_members INTEGER DEFAULT 50,
            sync_interval TEXT DEFAULT '30 phút',
            features TEXT DEFAULT '[]',
            color TEXT DEFAULT '#6366f1',
            icon TEXT DEFAULT '🌱',
            badge_text TEXT DEFAULT '',
            badge_color TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            duration_days INTEGER DEFAULT 30
        );

        CREATE TABLE IF NOT EXISTS sa_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id INTEGER REFERENCES sa_plans(id),
            status TEXT DEFAULT 'pending',
            start_date DATE,
            end_date DATE,
            amount_paid INTEGER DEFAULT 0,
            duration_days INTEGER DEFAULT 30,
            payment_method TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sa_announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'info',
            is_popup INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            show_from TIMESTAMP,
            show_until TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sa_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS balance_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'deposit',
            description TEXT DEFAULT '',
            admin_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

  console.log('[DB] PostgreSQL schema initialized');

  // Migrations for existing tables
  const migrations = [
    'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS start_date DATE',
    'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS end_date DATE',
    'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0',
    'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30',
    // Copy data from old columns if they exist
    "UPDATE sa_subscriptions SET start_date = started_at::date WHERE start_date IS NULL AND started_at IS NOT NULL",
    "UPDATE sa_subscriptions SET end_date = expires_at::date WHERE end_date IS NULL AND expires_at IS NOT NULL",
  ];

  for (const sql of migrations) {
    try { await pool.query(sql); } catch { }
  }
  console.log('[DB] Migrations applied');
}

// Seed data
async function seedData() {
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (parseInt(userCount.count) === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const result = await db.prepare(
      `INSERT INTO users (username, password, display_name, role, avatar_color) VALUES (?, ?, 'Administrator', 'admin', '#6366f1')`
    ).run('admin', hashedPassword);
    console.log('[DB] Created default admin user (admin/admin123)');

    // Seed demo admin account
    const userId = result.lastInsertRowid;
    const adminResult = await db.prepare(
      `INSERT INTO admins (email, name, totp_secret, total_monthly_credits, total_storage_tb, avatar_color, user_id) VALUES (?, ?, '', 25000, 30, '#f97316', ?)`
    ).run('admin@gmail.com', 'Admin Account 1', userId);

    const adminId = adminResult.lastInsertRowid;
    const m1 = await db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Hieu Nguyen', '', '#f97316')`).run(adminId);
    const m2 = await db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Andrew Nguyen', '', '#ef4444')`).run(adminId);
    await db.prepare(`INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, ?, 2900, 'AI credit usage', CURRENT_DATE)`).run(adminId, m1.lastInsertRowid);
    await db.prepare(`INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb) VALUES (?, ?, 0, 0, 0)`).run(m1.lastInsertRowid, adminId);
    await db.prepare(`INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb) VALUES (?, ?, 0, 0, 0)`).run(m2.lastInsertRowid, adminId);
  }

  // Seed plans
  const planCount = await db.prepare('SELECT COUNT(*) as count FROM sa_plans').get();
  if (parseInt(planCount.count) === 0) {
    const plans = [
      { name: 'Basic', slug: 'basic', price: 100000, price_label: '100K', max_farms: 10, max_members: 50, sync_interval: '30 phút', color: '#22c55e', icon: '🌱', sort_order: 1, features: '["Dashboard cơ bản"]' },
      { name: 'Standard', slug: 'standard', price: 200000, price_label: '200K', max_farms: 25, max_members: 125, sync_interval: '20 phút', color: '#6366f1', icon: '⚡', sort_order: 2, features: '["Dashboard + Báo cáo","API Access"]' },
      { name: 'Professional', slug: 'pro', price: 500000, price_label: '500K', max_farms: 50, max_members: 250, sync_interval: '10 phút', color: '#a78bfa', icon: '👑', sort_order: 3, features: '["Dashboard + Analytics","API Access Full","Hỗ trợ ưu tiên"]', badge_text: '🔥 BÁN CHẠY', badge_color: 'linear-gradient(135deg,#f97316,#ef4444)' },
      { name: 'Enterprise', slug: 'enterprise', price: 1000000, price_label: '1M', max_farms: 9999, max_members: 9999, sync_interval: 'Real-time', color: '#f59e0b', icon: '🏢', sort_order: 4, features: '["Advanced Analytics","Webhook & API","Support 24/7 VIP"]' }
    ];
    for (const p of plans) {
      await db.prepare(
        `INSERT INTO sa_plans (name, slug, price, price_label, max_farms, max_members, sync_interval, color, icon, sort_order, features, badge_text, badge_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(p.name, p.slug, p.price, p.price_label, p.max_farms, p.max_members, p.sync_interval, p.color, p.icon, p.sort_order, p.features, p.badge_text || '', p.badge_color || '');
    }
    console.log('[DB] Seeded default plans');
  }

  // Seed config
  const configCount = await db.prepare('SELECT COUNT(*) as count FROM sa_config').get();
  if (parseInt(configCount.count) === 0) {
    const configs = [
      { key: 'theme', value: 'dark' },
      { key: 'primary_color', value: '#6366f1' },
      { key: 'site_name', value: 'Credit-Flow Manager' },
      { key: 'welcome_text', value: 'Chào mừng bạn đến với hệ thống quản lý Google One!' },
    ];
    for (const c of configs) {
      await db.prepare('INSERT INTO sa_config (key, value) VALUES (?, ?)').run(c.key, c.value);
    }
    console.log('[DB] Seeded default config');
  }
}

// Initialize on import
async function init() {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    console.log(`[DB] Connecting to: ${dbUrl ? dbUrl.replace(/:[^:@]+@/, ':***@') : 'NO DATABASE_URL SET!'}`);
    await initDatabase();
    await seedData();
    console.log('[DB] ✅ PostgreSQL ready');
  } catch (err) {
    console.error('[DB] ❌ Init failed:', err.message);
    console.error('[DB] Stack:', err.stack);
    process.exit(1);
  }
}

// Export pool for session store
db.init = init;
module.exports = db;
