// Test database connection
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
console.log('DATABASE_URL:', url);
console.log('URL length:', url ? url.length : 0);

// Parse URL to show components
try {
    const u = new URL(url);
    console.log('Host:', u.hostname);
    console.log('Port:', u.port);
    console.log('User:', u.username);
    console.log('Password:', u.password);
    console.log('Password length:', u.password.length);
    console.log('Database:', u.pathname.slice(1));
} catch (e) {
    console.log('URL parse error:', e.message);
}

const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

pool.query('SELECT 1 as test')
    .then(r => {
        console.log('✅ Connection SUCCESS!', r.rows);
        pool.end();
    })
    .catch(e => {
        console.log('❌ Connection FAILED:', e.message);
        console.log('Error code:', e.code);
        pool.end();
    });
