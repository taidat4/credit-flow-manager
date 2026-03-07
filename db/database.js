/* ========================================
   Database Layer - Auto-detect SQLite / PostgreSQL
   - No DATABASE_URL → SQLite local (dev)
   - DATABASE_URL set → PostgreSQL (production)
   ======================================== */

const bcrypt = require('bcryptjs');
const path = require('path');

const USE_PG = !!process.env.DATABASE_URL;

let pool; // PostgreSQL pool (only if USE_PG)
let sqlite; // SQLite instance (only if !USE_PG)

if (USE_PG) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'data', 'creditflow.db');
  const fs = require('fs');
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
}

// Helper: convert ? placeholders to $1, $2, $3... (for PG only)
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Helper: convert PG-specific SQL to SQLite-compatible
function toSqliteSql(sql) {
  return sql
    .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/CURRENT_DATE/gi, "date('now')")
    .replace(/TIMESTAMP/gi, 'TEXT')
    .replace(/REAL GENERATED ALWAYS AS \(([^)]+)\) STORED/gi, 'REAL DEFAULT 0')
    .replace(/IF NOT EXISTS\s+/gi, 'IF NOT EXISTS ')
    .replace(/ADD COLUMN IF NOT EXISTS/gi, 'ADD COLUMN')
    .replace(/\$\d+/g, '?')
    .replace(/RETURNING \*/gi, '');
}

// ======== Unified db API ========
const db = {
  prepare(sql) {
    if (USE_PG) {
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
    } else {
      // SQLite - convert PG-specific SQL and wrap in async-compatible interface
      const sqliteSql = sql
        .replace(/NOW\(\)/gi, "datetime('now')")
        .replace(/CURRENT_DATE/gi, "date('now')")
        .replace(/::date/gi, '')
        .replace(/::text/gi, '')
        .replace(/RETURNING \*/gi, '');
      return {
        async get(...params) {
          try { return sqlite.prepare(sqliteSql).get(...params); } catch (e) { console.error('[DB] SQLite get error:', e.message, sqliteSql); return undefined; }
        },
        async all(...params) {
          try { return sqlite.prepare(sqliteSql).all(...params); } catch (e) { console.error('[DB] SQLite all error:', e.message, sqliteSql); return []; }
        },
        async run(...params) {
          try {
            const info = sqlite.prepare(sqliteSql).run(...params);
            return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
          } catch (e) { console.error('[DB] SQLite run error:', e.message, sqliteSql); return { lastInsertRowid: undefined, changes: 0 }; }
        }
      };
    }
  },

  async exec(sql) {
    if (USE_PG) {
      await pool.query(sql);
    } else {
      // SQLite: split by semicolons, run each statement
      const statements = sql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        try { sqlite.exec(toSqliteSql(stmt)); } catch { }
      }
    }
  },

  transaction(fn) {
    if (USE_PG) {
      return async (...args) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const txDb = {
            prepare(sql) {
              const pgSql = convertPlaceholders(sql);
              return {
                async get(...params) { const r = await client.query(pgSql, params); return r.rows[0] || undefined; },
                async all(...params) { const r = await client.query(pgSql, params); return r.rows; },
                async run(...params) {
                  let finalSql = pgSql;
                  if (/^\s*INSERT/i.test(finalSql) && !/RETURNING/i.test(finalSql)) finalSql = finalSql.replace(/;?\s*$/, ' RETURNING *');
                  const r = await client.query(finalSql, params);
                  return { lastInsertRowid: r.rows[0]?.id, changes: r.rowCount };
                }
              };
            }
          };
          const result = await fn(txDb, ...args);
          await client.query('COMMIT');
          return result;
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
      };
    } else {
      return (...args) => {
        const tx = sqlite.transaction(() => fn(db, ...args));
        return tx();
      };
    }
  },

  async query(sql, params = []) {
    if (USE_PG) {
      return await pool.query(sql, params);
    } else {
      // Convert PG-style $1 to ? for SQLite
      const sqliteSql = sql.replace(/\$\d+/g, '?');
      try {
        if (/^\s*SELECT/i.test(sqliteSql)) {
          const rows = sqlite.prepare(sqliteSql).all(...params);
          return { rows, rowCount: rows.length };
        } else {
          const info = sqlite.prepare(sqliteSql).run(...params);
          return { rows: [], rowCount: info.changes };
        }
      } catch { return { rows: [], rowCount: 0 }; }
    }
  },

  pool: USE_PG ? pool : null
};

// ======== Initialize Schema ========
async function initDatabase() {
  if (USE_PG) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
        avatar_color TEXT DEFAULT '#6366f1', balance INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP, is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
        totp_secret TEXT DEFAULT '', total_monthly_credits INTEGER NOT NULL DEFAULT 25000,
        total_storage_tb REAL NOT NULL DEFAULT 30, max_members INTEGER NOT NULL DEFAULT 5,
        credit_reset_day INTEGER NOT NULL DEFAULT 27, avatar_color TEXT DEFAULT '#6366f1',
        status TEXT NOT NULL DEFAULT 'active', google_password TEXT DEFAULT '',
        last_sync TIMESTAMP, sync_status TEXT DEFAULT '', notes TEXT DEFAULT '',
        credits_remaining_actual INTEGER DEFAULT 0, user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        name TEXT NOT NULL, email TEXT DEFAULT '', avatar_color TEXT DEFAULT '#6366f1',
        credit_limit INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
        joined_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS credit_logs (
        id SERIAL PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE, amount INTEGER NOT NULL,
        description TEXT DEFAULT '', log_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS storage_logs (
        id SERIAL PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        drive_gb REAL DEFAULT 0, gmail_gb REAL DEFAULT 0, photos_gb REAL DEFAULT 0,
        total_gb REAL GENERATED ALWAYS AS (drive_gb + gmail_gb + photos_gb) STORED,
        log_date DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sa_plans (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        price INTEGER NOT NULL DEFAULT 0, price_label TEXT NOT NULL DEFAULT '0',
        max_farms INTEGER DEFAULT 10, max_members INTEGER DEFAULT 50,
        sync_interval TEXT DEFAULT '30 phút', features TEXT DEFAULT '[]',
        color TEXT DEFAULT '#6366f1', icon TEXT DEFAULT '🌱',
        badge_text TEXT DEFAULT '', badge_color TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, duration_days INTEGER DEFAULT 30
      );
      CREATE TABLE IF NOT EXISTS sa_subscriptions (
        id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES sa_plans(id), status TEXT DEFAULT 'pending',
        start_date DATE, end_date DATE, amount_paid INTEGER DEFAULT 0,
        duration_days INTEGER DEFAULT 30, payment_method TEXT DEFAULT '',
        notes TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sa_announcements (
        id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info', is_popup INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER DEFAULT 1, show_from TIMESTAMP, show_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sa_config (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS balance_logs (
        id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'deposit',
        description TEXT DEFAULT '', admin_id INTEGER, created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('[DB] PostgreSQL schema initialized');

    // Migrations
    const migrations = [
      'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS start_date DATE',
      'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS end_date DATE',
      'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS amount_paid INTEGER DEFAULT 0',
      'ALTER TABLE sa_subscriptions ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30',
      "UPDATE sa_subscriptions SET start_date = started_at::date WHERE start_date IS NULL AND started_at IS NOT NULL",
      "UPDATE sa_subscriptions SET end_date = expires_at::date WHERE end_date IS NULL AND expires_at IS NOT NULL",
      "ALTER TABLE admins ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'unknown'",
    ];
    for (const sql of migrations) { try { await pool.query(sql); } catch { } }
    console.log('[DB] Migrations applied');

  } else {
    // SQLite schema
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
        display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
        avatar_color TEXT DEFAULT '#6366f1', balance INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), last_login TEXT, is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT NOT NULL,
        totp_secret TEXT DEFAULT '', total_monthly_credits INTEGER NOT NULL DEFAULT 25000,
        total_storage_tb REAL NOT NULL DEFAULT 30, max_members INTEGER NOT NULL DEFAULT 5,
        credit_reset_day INTEGER NOT NULL DEFAULT 27, avatar_color TEXT DEFAULT '#6366f1',
        status TEXT NOT NULL DEFAULT 'active', google_password TEXT DEFAULT '',
        last_sync TEXT, sync_status TEXT DEFAULT '', notes TEXT DEFAULT '',
        credits_remaining_actual INTEGER DEFAULT 0, plan_status TEXT DEFAULT 'unknown',
        user_id INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        name TEXT NOT NULL, email TEXT DEFAULT '', avatar_color TEXT DEFAULT '#6366f1',
        credit_limit INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
        joined_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS credit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES members(id) ON DELETE CASCADE, amount INTEGER NOT NULL,
        description TEXT DEFAULT '', log_date TEXT NOT NULL DEFAULT (date('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS storage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        drive_gb REAL DEFAULT 0, gmail_gb REAL DEFAULT 0, photos_gb REAL DEFAULT 0,
        total_gb REAL DEFAULT 0,
        log_date TEXT NOT NULL DEFAULT (date('now')), created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sa_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
        price INTEGER NOT NULL DEFAULT 0, price_label TEXT NOT NULL DEFAULT '0',
        max_farms INTEGER DEFAULT 10, max_members INTEGER DEFAULT 50,
        sync_interval TEXT DEFAULT '30 phút', features TEXT DEFAULT '[]',
        color TEXT DEFAULT '#6366f1', icon TEXT DEFAULT '🌱',
        badge_text TEXT DEFAULT '', badge_color TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, duration_days INTEGER DEFAULT 30
      );
      CREATE TABLE IF NOT EXISTS sa_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES sa_plans(id), status TEXT DEFAULT 'pending',
        start_date TEXT, end_date TEXT, amount_paid INTEGER DEFAULT 0,
        duration_days INTEGER DEFAULT 30, payment_method TEXT DEFAULT '',
        notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sa_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info', is_popup INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER DEFAULT 1, show_from TEXT, show_until TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sa_config (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS balance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'deposit',
        description TEXT DEFAULT '', admin_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    console.log('[DB] SQLite schema initialized');
  }
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

    const userId = result.lastInsertRowid;
    const adminResult = await db.prepare(
      `INSERT INTO admins (email, name, totp_secret, total_monthly_credits, total_storage_tb, avatar_color, user_id) VALUES (?, ?, '', 25000, 30, '#f97316', ?)`
    ).run('admin@gmail.com', 'Admin Account 1', userId);

    const adminId = adminResult.lastInsertRowid;
    const m1 = await db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Hieu Nguyen', '', '#f97316')`).run(adminId);
    const m2 = await db.prepare(`INSERT INTO members (admin_id, name, email, avatar_color) VALUES (?, 'Andrew Nguyen', '', '#ef4444')`).run(adminId);
    await db.prepare(`INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, ?, 2900, 'AI credit usage', ${USE_PG ? 'CURRENT_DATE' : "date('now')"})`).run(adminId, m1.lastInsertRowid);
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
      { key: 'theme', value: 'dark' }, { key: 'primary_color', value: '#6366f1' },
      { key: 'site_name', value: 'Credit-Flow Manager' },
      { key: 'welcome_text', value: 'Chào mừng bạn đến với hệ thống quản lý Google One!' },
    ];
    for (const c of configs) {
      await db.prepare('INSERT INTO sa_config (key, value) VALUES (?, ?)').run(c.key, c.value);
    }
    console.log('[DB] Seeded default config');
  }
}

// Initialize
async function init() {
  try {
    if (USE_PG) {
      const dbUrl = process.env.DATABASE_URL;
      console.log(`[DB] Connecting to: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);
    } else {
      console.log('[DB] Using local SQLite database (dev mode)');
    }
    await initDatabase();
    await seedData();
    console.log(`[DB] ✅ ${USE_PG ? 'PostgreSQL' : 'SQLite'} ready`);
  } catch (err) {
    console.error('[DB] ❌ Init failed:', err.message);
    console.error('[DB] Stack:', err.stack);
    process.exit(1);
  }
}

db.init = init;
module.exports = db;
