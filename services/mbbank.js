/* ========================================
   MB Bank Auto-Check Service
   Copied from working bot logic (MY_BOT/main.py)
   Uses apicanhan.com API with params: key, username, password, accountNo
   Response format: { status: "success", transactions: [...] }
   Only checks when there are active invoices (no background spam)
   ======================================== */

const db = require('../db/database');

// Current loaded config
let config = {};

/**
 * Load config from sa_config table
 */
function loadConfig() {
    const keys = [
        'mb_api_key', 'mb_account_no', 'mb_bot_token', 'mb_chat_id',
        'mb_session_id', 'mb_token', 'mb_cookie', 'mb_device_id',
        'mb_user', 'mb_password', 'mb_id_run'
    ];
    config = {};
    for (const key of keys) {
        try {
            const row = db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
            config[key] = row ? row.value : '';
        } catch { }
    }
    console.log(`[MBBank] Config loaded: key=${config.mb_api_key ? '***' + config.mb_api_key.slice(-6) : 'EMPTY'}, account=${config.mb_account_no}, user=${config.mb_user}`);
}

function reloadConfig() {
    loadConfig();
    console.log('[MBBank] Config reloaded from DB');
}

// Track processed transactions to avoid duplicates
const processedTxns = new Set();

function loadProcessedTxns() {
    try {
        const logs = db.prepare("SELECT description FROM balance_logs WHERE type = 'deposit' AND description LIKE '%[txn:%'").all();
        logs.forEach(l => {
            const m = l.description.match(/\[txn:([^\]]+)\]/);
            if (m) processedTxns.add(m[1]);
        });
        console.log(`[MBBank] Loaded ${processedTxns.size} processed transactions`);
    } catch { }
}

/**
 * Fetch transactions from apicanhan.com
 * Uses exact same params as working bot: key, username, password, accountNo
 */
async function fetchTransactions() {
    if (!config.mb_api_key || !config.mb_account_no) {
        console.log('[MBBank] Missing API key or account number, skip fetch');
        return [];
    }

    // Build params exactly like the working bot (test_api.py + main.py)
    const params = new URLSearchParams({
        key: config.mb_api_key,
        username: config.mb_user || config.mb_account_no,
        password: config.mb_password || '',
        accountNo: config.mb_account_no
    });

    const url = `https://apicanhan.com/api/mbbankv3?${params.toString()}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
            console.log(`[MBBank] API error: HTTP ${response.status}`);
            return [];
        }

        const data = await response.json();

        // Check status like the bot does
        if (data.status !== 'success') {
            console.log(`[MBBank] API returned error: ${data.message || 'Unknown'}`);
            return [];
        }

        const txList = data.transactions || [];
        if (!Array.isArray(txList)) {
            console.log('[MBBank] transactions is not an array');
            return [];
        }

        if (txList.length > 0) {
            console.log(`[MBBank] ✅ Got ${txList.length} transactions from API`);
        }
        return txList;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('[MBBank] API request timeout (30s)');
        } else {
            console.log(`[MBBank] API request error: ${err.message}`);
        }
        return [];
    }
}

/**
 * Process transactions and credit user balances
 * Pattern: NAPTIEN {username} {random_code}
 */
function processTransactions(transactions) {
    const credited = [];

    for (const tx of transactions) {
        if (!tx || typeof tx !== 'object') continue;

        const amount = tx.creditAmount || tx.amount || 0;
        const description = (tx.description || tx.addDescription || '').toUpperCase();
        const txnRef = String(tx.transactionNumber || tx.refNo || tx.transactionID || tx.id || `${Date.now()}-${amount}`);

        // Skip outgoing or zero
        if (amount <= 0) continue;
        // Skip already processed
        if (processedTxns.has(txnRef)) continue;

        // Match NAPTIEN {username} pattern
        const match = description.match(/NAPTIEN\s+(\w+)/i);
        if (!match) {
            processedTxns.add(txnRef);
            continue;
        }

        const username = match[1].toLowerCase();
        const user = db.prepare('SELECT id, display_name, balance FROM users WHERE LOWER(username) = ?').get(username);
        if (!user) {
            console.log(`[MBBank] User "${username}" not found for txn desc: ${description.substring(0, 80)}`);
            processedTxns.add(txnRef);
            continue;
        }

        try {
            const txnDb = db.transaction(() => {
                db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, user.id);
                db.prepare('INSERT INTO balance_logs (user_id, amount, type, description, admin_id) VALUES (?, ?, ?, ?, ?)')
                    .run(user.id, amount, 'deposit', `Nạp tiền MB Bank ${amount.toLocaleString()}đ [txn:${txnRef}]`, null);
                return db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
            });

            const result = txnDb();
            processedTxns.add(txnRef);
            credited.push({ user, amount, newBalance: result.balance, txnRef });
            console.log(`[MBBank] ✓ Credited ${amount.toLocaleString()}đ to ${user.display_name} (@${username}). New balance: ${result.balance.toLocaleString()}đ`);

            // Send Telegram notification
            if (config.mb_bot_token && config.mb_chat_id) {
                sendTelegramNotify(user, amount, result.balance, txnRef);
            }
        } catch (err) {
            console.error(`[MBBank] DB error crediting ${username}:`, err.message);
        }
    }

    return credited;
}

/**
 * Full check cycle: fetch + process
 * Called by the endpoint when user has active invoice
 */
async function checkTransactions() {
    const transactions = await fetchTransactions();
    if (transactions.length > 0) {
        return processTransactions(transactions);
    }
    return [];
}

async function sendTelegramNotify(user, amount, newBalance, txnRef) {
    try {
        const msg = `💰 <b>NẠP TIỀN THÀNH CÔNG</b>\n\n👤 User: <b>${user.display_name}</b>\n💵 Số tiền: <b>${amount.toLocaleString()}đ</b>\n💳 Số dư mới: <b>${newBalance.toLocaleString()}đ</b>\n🔖 Mã GD: ${txnRef}`;
        await fetch(`https://api.telegram.org/bot${config.mb_bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: config.mb_chat_id, text: msg, parse_mode: 'HTML' })
        });
    } catch { }
}

// NO background interval anymore — only called when there's an active invoice
function startAutoCheck() {
    loadConfig();
    loadProcessedTxns();
    console.log('[MBBank] Service ready (on-demand check only, no background polling)');
}

function stopAutoCheck() {
    // Nothing to stop — no background polling
}

// These are no-ops now — all checking happens on-demand via the endpoint
function startFastCheck() { }
function stopFastCheck() { }

module.exports = { checkTransactions, startAutoCheck, stopAutoCheck, reloadConfig, startFastCheck, stopFastCheck };
