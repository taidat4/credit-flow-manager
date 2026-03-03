/* ========================================
   MB Bank Auto-Check Service
   Uses apicanhan.com API with params: key, username, password, accountNo
   ALWAYS-ON background polling — never stops
   ======================================== */

const db = require('../db/database');

let config = {};
let pollTimer = null;
let currentInterval = 30000; // default 30s
const SLOW_INTERVAL = 30000;  // 30s background check
const FAST_INTERVAL = 3000;   // 3s when invoice active

async function loadConfig() {
    const keys = ['mb_api_key', 'mb_account_no', 'mb_bot_token', 'mb_chat_id', 'mb_session_id', 'mb_token', 'mb_cookie', 'mb_device_id', 'mb_user', 'mb_password', 'mb_id_run'];
    config = {};
    for (const key of keys) {
        try {
            const row = await db.prepare('SELECT value FROM sa_config WHERE key = ?').get(key);
            config[key] = row ? row.value : '';
        } catch { }
    }
    console.log(`[MBBank] Config loaded: key=${config.mb_api_key ? '***' + config.mb_api_key.slice(-6) : 'EMPTY'}, account=${config.mb_account_no}, user=${config.mb_user}`);
}

async function reloadConfig() {
    await loadConfig();
    console.log('[MBBank] Config reloaded from DB');
}

const processedTxns = new Set();

async function loadProcessedTxns() {
    try {
        const logs = await db.prepare("SELECT description FROM balance_logs WHERE type = 'deposit' AND description LIKE '%[txn:%'").all();
        logs.forEach(l => {
            const m = l.description.match(/\[txn:([^\]]+)\]/);
            if (m) processedTxns.add(m[1]);
        });
        console.log(`[MBBank] Loaded ${processedTxns.size} processed transactions`);
    } catch { }
}

async function fetchTransactions() {
    if (!config.mb_api_key || !config.mb_account_no) {
        return [];
    }

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

        if (!response.ok) { console.log(`[MBBank] API error: HTTP ${response.status}`); return []; }
        const data = await response.json();
        if (data.status !== 'success') { console.log(`[MBBank] API returned error: ${data.message || 'Unknown'}`); return []; }

        const txList = data.transactions || [];
        if (!Array.isArray(txList)) { console.log('[MBBank] transactions is not an array'); return []; }
        if (txList.length > 0) console.log(`[MBBank] Got ${txList.length} transactions from API`);
        return txList;
    } catch (err) {
        if (err.name === 'AbortError') console.log('[MBBank] API request timeout (30s)');
        else console.log(`[MBBank] API request error: ${err.message}`);
        return [];
    }
}

async function processTransactions(transactions) {
    const credited = [];

    for (const tx of transactions) {
        if (!tx || typeof tx !== 'object') continue;

        const amount = tx.creditAmount || tx.amount || 0;
        const description = (tx.description || tx.addDescription || '').toUpperCase();
        const txnRef = String(tx.transactionNumber || tx.refNo || tx.transactionID || tx.id || `${Date.now()}-${amount}`);

        if (amount <= 0) continue;
        if (processedTxns.has(txnRef)) continue;

        const match = description.match(/NAPTIEN\s+(\w+)/i);
        if (!match) { processedTxns.add(txnRef); continue; }

        const username = match[1].toLowerCase();
        const user = await db.prepare('SELECT id, display_name, balance FROM users WHERE LOWER(username) = ?').get(username);
        if (!user) {
            console.log(`[MBBank] User "${username}" not found for txn desc: ${description.substring(0, 80)}`);
            processedTxns.add(txnRef);
            continue;
        }

        try {
            const txn = db.transaction(async (txDb) => {
                await txDb.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, user.id);
                await txDb.prepare('INSERT INTO balance_logs (user_id, amount, type, description, admin_id) VALUES (?, ?, ?, ?, ?)')
                    .run(user.id, amount, 'deposit', `Nạp tiền MB Bank ${amount.toLocaleString()}đ [txn:${txnRef}]`, null);
                return await txDb.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
            });

            const result = await txn();
            processedTxns.add(txnRef);
            credited.push({ user, amount, newBalance: result.balance, txnRef });
            console.log(`[MBBank] ✓ Credited ${amount.toLocaleString()}đ to ${user.display_name} (@${username}). New balance: ${result.balance.toLocaleString()}đ`);

            if (config.mb_bot_token && config.mb_chat_id) {
                sendTelegramNotify(user, amount, result.balance, txnRef);
            }
        } catch (err) {
            console.error(`[MBBank] DB error crediting ${username}:`, err.message);
        }
    }
    return credited;
}

async function checkTransactions() {
    const transactions = await fetchTransactions();
    if (transactions.length > 0) return await processTransactions(transactions);
    return [];
}

async function sendTelegramNotify(user, amount, newBalance, txnRef) {
    try {
        const msg = `💰 <b>NẠP TIỀN THÀNH CÔNG</b>\n\n👤 User: <b>${user.display_name}</b>\n💵 Số tiền: <b>${amount.toLocaleString()}đ</b>\n💳 Số dư mới: <b>${newBalance.toLocaleString()}đ</b>\n🔖 Mã GD: ${txnRef}`;
        await fetch(`https://api.telegram.org/bot${config.mb_bot_token}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: config.mb_chat_id, text: msg, parse_mode: 'HTML' })
        });
    } catch { }
}

// ========= ALWAYS-ON BACKGROUND POLLING =========
let consecutiveErrors = 0;

function startPollingLoop() {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
        try {
            if (!config.mb_api_key || !config.mb_account_no) {
                // No config yet — try reloading every few cycles
                if (consecutiveErrors++ > 5) {
                    await loadConfig();
                    consecutiveErrors = 0;
                }
                return;
            }
            await checkTransactions();
            consecutiveErrors = 0;
        } catch (err) {
            consecutiveErrors++;
            console.error(`[MBBank] Poll error (${consecutiveErrors}):`, err.message);
            // Auto-reload config after 3 consecutive errors
            if (consecutiveErrors >= 3) {
                console.log('[MBBank] Too many errors, reloading config...');
                await loadConfig();
                consecutiveErrors = 0;
            }
        }
    }, currentInterval);

    console.log(`[MBBank] Polling active (every ${currentInterval / 1000}s)`);
}

async function startAutoCheck() {
    await loadConfig();
    await loadProcessedTxns();
    currentInterval = SLOW_INTERVAL;
    startPollingLoop();
    console.log('[MBBank] ✅ Service started — ALWAYS-ON background polling (30s)');
}

function stopAutoCheck() {
    // Never actually stop — just log
    console.log('[MBBank] stopAutoCheck called but polling continues (always-on)');
}

function startFastCheck() {
    if (currentInterval === FAST_INTERVAL) return; // already fast
    currentInterval = FAST_INTERVAL;
    startPollingLoop();
    console.log('[MBBank] ⚡ Switched to FAST polling (3s) — invoice active');

    // Auto revert to slow after 10 minutes (safety net)
    setTimeout(() => {
        if (currentInterval === FAST_INTERVAL) {
            stopFastCheck();
        }
    }, 10 * 60 * 1000);
}

function stopFastCheck() {
    if (currentInterval === SLOW_INTERVAL) return; // already slow
    currentInterval = SLOW_INTERVAL;
    startPollingLoop();
    console.log('[MBBank] Reverted to background polling (30s)');
}

module.exports = { checkTransactions, startAutoCheck, stopAutoCheck, reloadConfig, startFastCheck, stopFastCheck };
