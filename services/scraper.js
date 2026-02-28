/* ========================================
   Google One Scraper - Selenium + Chrome
   Auto-login pattern from MY_BOT GoogleLoginAutomation
   ======================================== */

const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
require('chromedriver');
const OTPAuth = require('otpauth');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { decrypt } = require('./crypto');

// Google One URLs
const CREDIT_URL = 'https://one.google.com/ai/activity?pli=1&g1_landing_page=0';
const STORAGE_URL = 'https://one.google.com/storage?hl=vi&utm_source=google-account&utm_medium=web&g1_landing_page=2';

// Persistent Chrome profiles
const BROWSER_DATA_DIR = path.join(__dirname, '..', 'browser_data');

// Track active sync status
const syncStatus = {};

function getSyncStatus(adminId) {
    return syncStatus[adminId] || { status: 'idle', message: '', last_sync: null };
}

/**
 * Create Chrome browser (same as MY_BOT BrowserManager)
 */
async function createBrowser(adminId) {
    const profileDir = path.join(BROWSER_DATA_DIR, `admin_${adminId}_chrome`);
    if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
    }

    const options = new chrome.Options();
    options.addArguments(`--user-data-dir=${profileDir}`);
    options.addArguments('--headless=new');
    options.addArguments('--no-first-run');
    options.addArguments('--no-default-browser-check');
    options.addArguments('--disable-infobars');
    options.addArguments('--disable-extensions');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--window-size=1100,800');
    options.addArguments('--disable-gpu');
    options.excludeSwitches('enable-automation');

    console.log(`[Scraper] Creating Chrome browser for admin ${adminId}...`);

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    console.log('[Scraper] ✓ Chrome browser created');
    return driver;
}

// ========= AUTO LOGIN (same pattern as MY_BOT GoogleLoginAutomation) =========

/**
 * Generate TOTP code from secret
 */
function generateTOTP(secret) {
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(cleanSecret),
        digits: 6, period: 30, algorithm: 'SHA1'
    });
    return totp.generate();
}

/**
 * Helper: wait for element with multiple possible selectors (same as MY_BOT _wait_and_find)
 */
async function waitAndFind(driver, selectors, timeoutMs = 10000) {
    const endTime = Date.now() + timeoutMs;
    while (Date.now() < endTime) {
        for (const selector of selectors) {
            try {
                const el = await driver.findElement(By.css(selector));
                if (await el.isDisplayed()) return el;
            } catch { }
        }
        await driver.sleep(500);
    }
    return null;
}

/**
 * Helper: safe click (same as MY_BOT _safe_click - uses JS click as fallback)
 */
async function safeClick(driver, element) {
    try {
        await element.click();
    } catch {
        try {
            await driver.executeScript('arguments[0].click()', element);
        } catch { }
    }
}

/**
 * Helper: safe fill input (clear + type, same as MY_BOT _safe_fill)
 */
async function safeFill(driver, element, text) {
    const str = text ? String(text) : '';
    await element.click();
    await driver.sleep(200);
    await element.clear();
    await driver.sleep(200);
    // Type character by character for human-like behavior
    for (const char of str) {
        await element.sendKeys(char);
        await driver.sleep(50 + Math.random() * 50);
    }
}

/**
 * Auto Google Login (replicates MY_BOT GoogleLoginAutomation.login exactly)
 */
async function googleLogin(driver, email, password, totpSecret, adminId) {
    // Step 1: Navigate to credit page (requires auth - will redirect to login if not logged in)
    console.log('[Login] Navigating to Google One credit page (requires auth)...');
    syncStatus[adminId].message = 'Đang mở Google One...';
    await driver.get(CREDIT_URL);
    await driver.sleep(5000);

    // Check if already logged in
    let currentUrl = await driver.getCurrentUrl();
    console.log(`[Login] URL: ${currentUrl}`);

    // If we're on the credit page and NOT on login page or /about/ page = logged in
    const needsLogin = currentUrl.includes('accounts.google.com') || currentUrl.includes('/about/') || currentUrl.includes('/about');
    if (!needsLogin && currentUrl.includes('one.google.com')) {
        console.log('[Login] ✓ Already logged in from previous session!');
        return true;
    }

    // If redirected to /about/ (public page), go to login
    if (currentUrl.includes('/about')) {
        console.log('[Login] Redirected to public page, navigating to accounts.google.com...');
        await driver.get('https://accounts.google.com/signin/v2/identifier?continue=' + encodeURIComponent(CREDIT_URL) + '&flowName=GlifWebSignIn&flowEntry=ServiceLogin');
        await driver.sleep(3000);
        currentUrl = await driver.getCurrentUrl();
        console.log(`[Login] Login page URL: ${currentUrl}`);
    }

    console.log('[Login] Login needed, proceeding with auto-login...');

    // Step 2: Find email input (same selectors as MY_BOT)
    console.log('[Login] Finding email field...');
    syncStatus[adminId].message = 'Đang nhập email...';

    let emailInput = await waitAndFind(driver, ['input[type="email"]', '#identifierId'], 15000);

    // Handle "Choose an account" page (same as MY_BOT)
    if (!emailInput) {
        try {
            const pageSource = await driver.getPageSource();
            if (pageSource.includes('chọn tài khoản') || pageSource.includes('Choose an account') || pageSource.includes('Chọn một tài khoản')) {
                console.log('[Login] "Choose account" page detected, clicking "Use another account"');
                const useAnother = await driver.findElement(By.xpath(
                    "//*[contains(text(), 'Sử dụng một tài khoản khác') or contains(text(), 'Use another account')]"
                ));
                await safeClick(driver, useAnother);
                await driver.sleep(2000);
                emailInput = await waitAndFind(driver, ['input[type="email"]', '#identifierId'], 10000);
            }
        } catch (e) {
            console.log('[Login] Choose account handling:', e.message);
        }
    }

    if (!emailInput) {
        throw new Error('Không tìm thấy ô nhập email');
    }

    // Enter email
    console.log('[Login] Typing email...');
    await safeFill(driver, emailInput, email);
    await driver.sleep(1000);

    // Click Next (same selectors as MY_BOT)
    const nextBtn = await waitAndFind(driver, ['#identifierNext', '#identifierNext button', 'button[jsname="LgbsSe"]'], 3000);
    if (nextBtn) {
        await safeClick(driver, nextBtn);
    } else {
        await emailInput.sendKeys(Key.RETURN);
    }

    await driver.sleep(4000);

    // Check for account deleted/errors
    try {
        const pageSource = await driver.getPageSource();
        if (pageSource.includes('Không tìm thấy') || pageSource.includes('Couldn\'t find')) {
            throw new Error('Tài khoản không tồn tại');
        }
    } catch (e) {
        if (e.message.includes('Tài khoản')) throw e;
    }

    // Step 3: Enter password (same as MY_BOT)
    console.log('[Login] Finding password field...');
    syncStatus[adminId].message = 'Đang nhập mật khẩu...';

    const passwordInput = await waitAndFind(driver, ['input[type="password"]'], 15000);
    if (!passwordInput) {
        throw new Error('Không tìm thấy ô nhập mật khẩu');
    }

    console.log('[Login] Typing password...');
    await safeFill(driver, passwordInput, password);
    await driver.sleep(1000);

    // Click Next
    const passBtn = await waitAndFind(driver, ['#passwordNext', '#passwordNext button', 'button[jsname="LgbsSe"]'], 3000);
    if (passBtn) {
        await safeClick(driver, passBtn);
    } else {
        await passwordInput.sendKeys(Key.RETURN);
    }

    await driver.sleep(5000);

    // Check for login errors
    try {
        const pageSource = await driver.getPageSource();
        if (pageSource.includes('Sai mật khẩu') || pageSource.includes('Wrong password')) {
            throw new Error('Sai mật khẩu');
        }
        if (pageSource.includes('đã bị xóa') || pageSource.includes('has been deleted')) {
            throw new Error('Tài khoản đã bị xóa');
        }
        if (pageSource.includes('chặn đăng nhập') || pageSource.includes('blocked sign-in')) {
            throw new Error('Google đã chặn đăng nhập từ thiết bị này');
        }
    } catch (e) {
        if (e.message.includes('Sai') || e.message.includes('xóa') || e.message.includes('chặn')) throw e;
    }

    // Step 4: Handle 2FA / TOTP
    currentUrl = await driver.getCurrentUrl();
    console.log(`[Login] Post-password URL: ${currentUrl}`);

    // Check if we need 2FA
    if (totpSecret && (currentUrl.includes('challenge') || currentUrl.includes('signin/v2'))) {
        console.log('[Login] 2FA challenge detected, entering TOTP...');
        syncStatus[adminId].message = 'Đang nhập mã 2FA...';

        // Sometimes Google shows multiple 2FA options, try to select TOTP/Authenticator
        try {
            const totpOption = await waitAndFind(driver, [
                '[data-challengetype="6"]',  // TOTP authenticator option
                'div[data-challengeid="6"]'
            ], 3000);
            if (totpOption) {
                await safeClick(driver, totpOption);
                await driver.sleep(2000);
            }
        } catch { }

        // Find TOTP input field
        const totpInput = await waitAndFind(driver, [
            'input[name="totpPin"]',
            'input[type="tel"]',
            '#totpPin',
            'input[id="totpPin"]'
        ], 10000);

        if (totpInput) {
            const code = generateTOTP(totpSecret);
            console.log(`[Login] Entering TOTP code: ${code}`);

            await safeFill(driver, totpInput, code);
            await driver.sleep(1000);

            // Click Next/Verify
            const verifyBtn = await waitAndFind(driver, [
                '#totpNext',
                '#totpNext button',
                'button[jsname="LgbsSe"]'
            ], 3000);
            if (verifyBtn) {
                await safeClick(driver, verifyBtn);
            } else {
                await totpInput.sendKeys(Key.RETURN);
            }

            await driver.sleep(5000);
        } else {
            console.log('[Login] ⚠ Could not find TOTP input, waiting for manual 2FA...');
            syncStatus[adminId].message = '⏳ Hãy nhập mã 2FA trên cửa sổ Chrome...';

            // Wait up to 60s for manual 2FA
            const start = Date.now();
            while (Date.now() - start < 60000) {
                await driver.sleep(3000);
                currentUrl = await driver.getCurrentUrl();
                if (currentUrl.includes('one.google.com') && !currentUrl.includes('accounts.google.com')) break;
                if (!currentUrl.includes('challenge') && !currentUrl.includes('signin')) break;
            }
        }
    }

    // Step 5: Verify login success
    await driver.sleep(3000);
    currentUrl = await driver.getCurrentUrl();
    console.log(`[Login] Final URL: ${currentUrl}`);

    // Navigate to Google One if not there
    if (!currentUrl.includes('one.google.com')) {
        await driver.get('https://one.google.com/');
        await driver.sleep(3000);
        currentUrl = await driver.getCurrentUrl();
    }

    if (currentUrl.includes('one.google.com') && !currentUrl.includes('accounts.google.com')) {
        console.log('[Login] ✓ Login successful!');
        return true;
    }

    throw new Error('Đăng nhập không thành công - URL: ' + currentUrl.substring(0, 100));
}

// ========= MAIN SYNC FUNCTION =========

async function syncAdmin(adminId) {
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) throw new Error('Admin not found');

    // Decrypt password
    let googlePassword = '';
    console.log(`[Sync] Admin ${adminId}: google_password field = ${admin.google_password ? `"${admin.google_password.substring(0, 20)}..." (${admin.google_password.length} chars)` : 'EMPTY/NULL'}`);
    if (admin.google_password) {
        try {
            googlePassword = decrypt(admin.google_password) || '';
            console.log(`[Sync] Admin ${adminId}: decrypted password = ${googlePassword ? 'OK (' + googlePassword.length + ' chars)' : 'EMPTY'}`);
        } catch (e) {
            console.error(`[Sync] Admin ${adminId}: decrypt FAILED:`, e.message);
            googlePassword = '';
        }
    }
    if (!googlePassword) {
        throw new Error('Admin chưa có Google password, không thể sync');
    }

    syncStatus[adminId] = { status: 'syncing', message: 'Đang khởi tạo browser...', last_sync: null };
    let driver = null;

    try {
        driver = await createBrowser(adminId);

        // Auto login!
        await googleLogin(driver, admin.email, googlePassword, admin.totp_secret, adminId);

        // Scrape credits
        syncStatus[adminId].message = 'Đang lấy dữ liệu credit...';
        let creditData;
        try {
            creditData = await scrapeCredits(driver);
        } catch (e) {
            console.error('[Scraper] Credit scrape error:', e.message);
            creditData = { monthlyCredits: 0, bonusCredits: 0, memberUsage: [] };
        }

        // Scrape family members
        syncStatus[adminId].message = 'Đang lấy danh sách thành viên gia đình...';
        let familyMembers;
        try {
            familyMembers = await scrapeFamily(driver, adminId, admin.email);
        } catch (e) {
            console.error('[Scraper] Family scrape error:', e.message);
            familyMembers = [];
        }

        // Scrape storage
        syncStatus[adminId].message = 'Đang lấy dữ liệu bộ nhớ...';
        let storageData;
        try {
            storageData = await scrapeStorage(driver);
        } catch (e) {
            console.error('[Scraper] Storage scrape error:', e.message);
            storageData = { totalStorage: '30 TB', totalUsed: '0 GB', driveGB: 0, gmailGB: 0, photosGB: 0, familyStorage: [] };
        }

        // Save to DB
        syncStatus[adminId].message = 'Đang lưu dữ liệu...';
        await saveData(adminId, creditData, storageData);

        const now = new Date().toISOString();
        db.prepare('UPDATE admins SET last_sync = ?, sync_status = ? WHERE id = ?').run(now, 'success', adminId);

        syncStatus[adminId] = {
            status: 'done',
            message: `✅ Sync thành công! Credits còn: ${creditData.monthlyCredits}`,
            last_sync: now,
            data: { credits: creditData, storage: storageData }
        };

        return { credits: creditData, storage: storageData };

    } catch (err) {
        console.error(`[Scraper] Error syncing admin ${adminId}:`, err.message);
        db.prepare('UPDATE admins SET sync_status = ? WHERE id = ?').run('error: ' + err.message, adminId);
        syncStatus[adminId] = { status: 'error', message: err.message, last_sync: null };
        throw err;

    } finally {
        if (driver) {
            try { await driver.quit(); } catch { }
        }
    }
}

// ========= SCRAPING FUNCTIONS =========

async function scrapeCredits(driver) {
    console.log('[Scraper] Navigating to credits page...');
    await driver.get(CREDIT_URL);
    await driver.sleep(8000);

    let monthlyCredits = 0, bonusCredits = 0, memberUsage = [];

    try {
        const els = await driver.findElements(By.css('.wAlWod'));
        const texts = [];
        for (const el of els) {
            const text = await el.getText();
            texts.push(text.trim());
        }
        console.log(`[Scraper] Credit elements: ${JSON.stringify(texts)}`);
        if (texts.length > 0) monthlyCredits = parseCreditsNumber(texts[0]);
        if (texts.length > 1) bonusCredits = parseCreditsNumber(texts[1]);
    } catch (err) {
        console.error('[Scraper] Error reading credits:', err.message);
    }

    // Parse family member usage - support both Vietnamese and English
    try {
        // Scroll down to ensure all family members are loaded
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
        await driver.sleep(2000);
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
        await driver.sleep(2000);

        const pageText = await driver.findElement(By.css('body')).getText();
        console.log('[Scraper] Credits page text (last 1500):', pageText.substring(Math.max(0, pageText.length - 1500)));

        // Split at the family section header - try multiple languages
        let familyText = '';
        const familySplitters = [
            'nhóm gia đình',           // Vietnamese
            'family group members',     // English
            'family group',             // English short
            'thành viên trong nhóm'     // Vietnamese alt
        ];
        for (const splitter of familySplitters) {
            const idx = pageText.toLowerCase().indexOf(splitter);
            if (idx !== -1) {
                familyText = pageText.substring(idx);
                console.log(`[Scraper] Found family section via "${splitter}"`);
                break;
            }
        }

        if (familyText) {
            // getText() returns name and amount on SEPARATE lines:
            // Line i:   "Hieu Nguyen"
            // Line i+1: "-2,900"
            const lines = familyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const SKIP_WORDS = ['credit', 'tín dụng', 'manage', 'quản lý', 'activity', 'hoạt động', 'add', 'thêm', 'group', 'nhóm'];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const nextLine = (lines[i + 1] || '').trim();

                // Next line must be a number (possibly negative, with comma/dot separators)
                const amountMatch = nextLine.match(/^-?([\d,.]+)$/);
                if (!amountMatch) continue;

                // Current line must look like a name (letters, not starting with number/symbol)
                if (line.length < 2 || line.length > 50) continue;
                if (/^\d/.test(line) || /^[+\-*]/.test(line)) continue;
                const lineLower = line.toLowerCase();
                if (SKIP_WORDS.some(w => lineLower.includes(w))) continue;
                if (line.includes('http') || line.includes('@')) continue;

                const name = line.trim();
                const amount = parseCreditsNumber(amountMatch[1]);
                if (amount > 0) {
                    memberUsage.push({ name, amount });
                    console.log(`[Scraper] ✓ Member credit: "${name}" = ${amount}`);
                }
            }
        }
    } catch (err) {
        console.error('[Scraper] Error reading member usage:', err.message);
    }

    console.log(`[Scraper] Credits: monthly=${monthlyCredits}, members=${JSON.stringify(memberUsage)}`);
    return { monthlyCredits, bonusCredits, memberUsage };
}

/**
 * Scrape family members from Google Account family page
 * Supports English and Vietnamese. Strict exact-word matching only.
 */
async function scrapeFamily(driver, adminId, adminEmail) {
    const FAMILY_URL = 'https://myaccount.google.com/family/details?utm_source=g1web&utm_medium=default';
    console.log('[Scraper] Navigating to family page...');
    await driver.get(FAMILY_URL);
    await driver.sleep(5000);

    const familyMembers = [];

    // Blacklist - page section titles that are NOT member names
    const BLACKLIST = [
        'storage', 'premium', 'benefits', 'password', 'sharing', 'delete',
        'family group', 'send invitations', 'learn more', 'tìm hiểu',
        'gửi lời mời', 'xóa', 'bộ nhớ', 'mật khẩu', 'chia sẻ',
        'giải trí', 'tổ chức', 'khám phá', 'google', 'youtube',
        'account storage', 'shared with'
    ];

    try {
        const pageText = await driver.findElement(By.css('body')).getText();
        console.log('[Scraper] Family page text (first 1500):', pageText.substring(0, 1500));
        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const memberNames = [];

        // STRICT exact match only - no substring!
        const MEMBER_EXACT = ['member', 'thành viên'];
        const MANAGER_EXACT = ['family manager', 'người quản lý gia đình'];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nextLine = (lines[i + 1] || '').toLowerCase().trim();

            // Exact match ONLY - "member" !== "membership"
            const isMember = MEMBER_EXACT.some(role => nextLine === role);
            const isManager = MANAGER_EXACT.some(role => nextLine === role);

            if (!isMember && !isManager) continue;

            // Validate name
            const lineLower = line.toLowerCase();
            const isBlacklisted = BLACKLIST.some(bl => lineLower.includes(bl));
            if (isBlacklisted || line.length < 2 || line.length > 50 || line.includes('http') || line.includes('@')) {
                console.log(`[Scraper] Skip invalid: "${line}"`);
                continue;
            }

            if (isManager) {
                console.log(`[Scraper] ✓ Manager: "${line}" (skip)`);
            } else {
                memberNames.push(line);
                console.log(`[Scraper] ✓ Member: "${line}"`);
            }
        }

        console.log(`[Scraper] Valid members: ${memberNames.length}`);

        // Click each member to get email
        for (const name of memberNames) {
            try {
                await driver.get(FAMILY_URL);
                await driver.sleep(3000);
                let clicked = false;
                try {
                    const el = await driver.findElement(By.xpath(`//*[text()='${name}']`));
                    try { const p = await el.findElement(By.xpath('./ancestor::a[1]')); await safeClick(driver, p); clicked = true; }
                    catch { await safeClick(driver, el); clicked = true; }
                } catch { }
                if (!clicked) {
                    try { const el = await driver.findElement(By.xpath(`//*[contains(text(), '${name}')]`)); await safeClick(driver, el); clicked = true; } catch { }
                }
                if (clicked) {
                    await driver.sleep(3000);
                    const detail = await driver.findElement(By.css('body')).getText();
                    const emails = detail.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
                    const email = emails.find(e => e !== adminEmail) || '';
                    console.log(`[Scraper] ${name} → ${email}`);
                    familyMembers.push({ name, email, role: 'member' });
                } else {
                    familyMembers.push({ name, email: '', role: 'member' });
                }
            } catch (err) {
                familyMembers.push({ name, email: '', role: 'member' });
            }
        }
    } catch (err) {
        console.error('[Scraper] Family error:', err.message);
    }

    // Save to DB + cleanup garbage
    if (familyMembers.length > 0) {
        const COLORS = ['#f97316', '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#eab308', '#ec4899', '#14b8a6'];
        const scrapedNames = familyMembers.map(m => m.name);

        // Remove garbage members not in scraped list
        const existing = db.prepare('SELECT id, name FROM members WHERE admin_id = ? AND status = ?').all(adminId, 'active');
        for (const em of existing) {
            if (!scrapedNames.includes(em.name)) {
                db.prepare('UPDATE members SET status = ? WHERE id = ?').run('removed', em.id);
                console.log(`[Scraper] ✗ Removed garbage: "${em.name}"`);
            }
        }

        for (const fm of familyMembers) {
            const ex = db.prepare('SELECT id FROM members WHERE admin_id = ? AND name = ?').get(adminId, fm.name);
            if (!ex) {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                db.prepare('INSERT INTO members (admin_id, name, email, avatar_color, status) VALUES (?, ?, ?, ?, ?)').run(adminId, fm.name, fm.email, color, 'active');
                console.log(`[Scraper] ✓ Created: ${fm.name} (${fm.email})`);
            } else {
                db.prepare("UPDATE members SET email = CASE WHEN ? != '' THEN ? ELSE email END, status = ? WHERE id = ?").run(fm.email, fm.email, 'active', ex.id);
            }
        }
    }

    console.log(`[Scraper] Family result: ${familyMembers.length} members`);
    return familyMembers;
}

async function scrapeStorage(driver) {
    console.log('[Scraper] Navigating to storage page...');
    await driver.get(STORAGE_URL);
    await driver.sleep(8000);

    let totalStorage = '30 TB', totalUsed = '0 GB';
    let driveGB = 0, gmailGB = 0, photosGB = 0;
    let familyStorage = [];

    try {
        // Scroll down to family storage section
        await driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
        await driver.sleep(2000);

        // Click ONLY the family storage text to expand (NOT aria-expanded which opens profile!)
        try {
            const familyEls = await driver.findElements(By.xpath(
                '//*[contains(text(), "Bộ nhớ cho gia đình") or contains(text(), "Family storage")]'
            ));
            for (const el of familyEls) {
                try {
                    await driver.executeScript('arguments[0].scrollIntoView({block: "center"})', el);
                    await driver.sleep(500);
                    await driver.executeScript('arguments[0].click()', el);
                    await driver.sleep(1000);
                    // Try direct parent only (the row containing the text + chevron)
                    await driver.executeScript('arguments[0].parentElement.click()', el);
                    await driver.sleep(1500);
                } catch { }
            }
        } catch { }

        await driver.sleep(2000);
        const pageText = await driver.findElement(By.css('body')).getText();
        console.log('[Scraper] Storage page text (last 1000):', pageText.substring(Math.max(0, pageText.length - 1000)));

        // Total storage - VN and EN
        const totalMatch = pageText.match(/(\d+)\s*TB\s*bộ nhớ/i) || pageText.match(/(\d+)\s*TB.*?storage/i) || pageText.match(/(\d+)\s*TB/);
        if (totalMatch) totalStorage = totalMatch[1] + ' TB';

        // Used storage - VN and EN
        const usedMatch = pageText.match(/Đã dùng\s*([\d,.]+)\s*(GB|MB|TB)/i) || pageText.match(/([\d,.]+)\s*(GB|MB|TB)\s*(?:of|out of)/i);
        if (usedMatch) totalUsed = usedMatch[1] + ' ' + usedMatch[2];

        const driveMatch = pageText.match(/Google Drive\s*([\d,.]+)\s*(GB|MB|TB)/i);
        if (driveMatch) driveGB = parseStorageToGB(driveMatch[1], driveMatch[2]);

        const gmailMatch = pageText.match(/Gmail\s*([\d,.]+)\s*(GB|MB|TB)/i);
        if (gmailMatch) gmailGB = parseStorageToGB(gmailMatch[1], gmailMatch[2]);

        const photosMatch = pageText.match(/Google Photos\s*([\d,.]+)\s*(GB|MB|TB)/i);
        if (photosMatch) photosGB = parseStorageToGB(photosMatch[1], photosMatch[2]);

        // Family storage section - VN and EN
        const familySection = pageText.split('Bộ nhớ cho gia đình')[1] || pageText.split('Family storage')[1] || '';
        if (familySection) {
            const memberMatches = familySection.match(/([A-Za-zÀ-ỹ\s@.!]+?)\s*([\d,.]+)\s*(GB|MB|TB)/g);
            if (memberMatches) {
                for (const line of memberMatches) {
                    const parts = line.match(/([A-Za-zÀ-ỹ\s@.!]+?)\s*([\d,.]+)\s*(GB|MB|TB)/);
                    if (parts) {
                        const name = parts[1].trim();
                        if (name.length > 1 && !name.includes('Google') && !name.includes('thành viên')) {
                            familyStorage.push({ name, gb: parseStorageToGB(parts[2], parts[3]) });
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Scraper] Storage error:', err.message);
    }

    console.log(`[Scraper] Storage: total=${totalStorage}, used=${totalUsed}, family=${JSON.stringify(familyStorage)}`);
    return { totalStorage, totalUsed, driveGB, gmailGB, photosGB, familyStorage };
}

// ========= HELPERS =========

function parseCreditsNumber(text) {
    if (!text) return 0;
    return parseInt(text.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(/,/g, '')) || 0;
}

function parseStorageToGB(value, unit) {
    const num = parseFloat(value.replace(',', '.')) || 0;
    switch (unit.toUpperCase()) {
        case 'TB': return num * 1024;
        case 'GB': return num;
        case 'MB': return num / 1024;
        default: return num;
    }
}

async function saveData(adminId, creditData, storageData) {
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) return;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // ===== CREDITS: Store absolute value from Google =====
    // creditData.monthlyCredits = credits remaining from Google One page
    // Store this directly on the admin record
    db.prepare('UPDATE admins SET credits_remaining_actual = ?, last_sync = ? WHERE id = ?')
        .run(creditData.monthlyCredits, now, adminId);

    // For member usage: only log if value changed
    if (creditData.memberUsage.length > 0) {
        for (const usage of creditData.memberUsage) {
            const member = db.prepare('SELECT id FROM members WHERE admin_id = ? AND name LIKE ?').get(adminId, `%${usage.name}%`);
            if (!member) continue;

            // Check last recorded value for this member
            const lastLog = db.prepare(
                "SELECT amount FROM credit_logs WHERE member_id = ? AND admin_id = ? AND description LIKE '%[auto-sync]%' ORDER BY id DESC LIMIT 1"
            ).get(member.id, adminId);

            const lastAmount = lastLog ? lastLog.amount : 0;

            // Only log if value changed
            if (usage.amount !== lastAmount) {
                db.prepare('INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, ?, ?, ?, ?)')
                    .run(adminId, member.id, usage.amount, `[auto-sync] ${usage.name}`, today);
                console.log(`[Scraper] Credit changed for ${usage.name}: ${lastAmount} -> ${usage.amount}`);
            }
        }
    } else {
        // Fallback: total usage from admin level
        const creditsUsed = admin.total_monthly_credits - creditData.monthlyCredits;
        if (creditsUsed > 0) {
            const lastLog = db.prepare(
                "SELECT amount FROM credit_logs WHERE admin_id = ? AND member_id IS NULL AND description LIKE '%[auto-sync] Total%' ORDER BY id DESC LIMIT 1"
            ).get(adminId);
            const lastAmount = lastLog ? lastLog.amount : 0;

            if (creditsUsed !== lastAmount) {
                db.prepare('INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, NULL, ?, ?, ?)')
                    .run(adminId, creditsUsed, '[auto-sync] Total usage', today);
            }
        }
    }

    // ===== STORAGE =====
    if (storageData.familyStorage.length > 0) {
        for (const s of storageData.familyStorage) {
            const member = db.prepare('SELECT id FROM members WHERE admin_id = ? AND name LIKE ?').get(adminId, `%${s.name}%`);
            if (member) {
                db.prepare("DELETE FROM storage_logs WHERE member_id = ? AND admin_id = ? AND log_date = ?").run(member.id, adminId, today);
                db.prepare('INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb, log_date) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(member.id, adminId, storageData.driveGB, storageData.gmailGB, storageData.photosGB, today);
            }
        }
    }
}

async function syncAllAdmins() {
    const admins = db.prepare("SELECT id FROM admins WHERE status = 'active' AND google_password IS NOT NULL AND google_password != ''").all();
    const results = [];
    for (const admin of admins) {
        try {
            const result = await syncAdmin(admin.id);
            results.push({ id: admin.id, success: true, data: result });
        } catch (err) {
            results.push({ id: admin.id, success: false, error: err.message });
        }
    }
    return results;
}

// Auto sync every 10 minutes
const AUTO_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
let autoSyncTimer = null;

function startAutoSync() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    console.log('[AutoSync] Started - will sync every 10 minutes');
    autoSyncTimer = setInterval(async () => {
        console.log(`[AutoSync] Running auto sync at ${new Date().toLocaleString('vi-VN')}...`);
        try {
            const results = await syncAllAdmins();
            console.log(`[AutoSync] Done. Results:`, results.map(r => `Admin ${r.id}: ${r.success ? 'OK' : r.error}`).join(', '));
        } catch (err) {
            console.error('[AutoSync] Error:', err.message);
        }
    }, AUTO_SYNC_INTERVAL);
}

module.exports = { syncAdmin, syncAllAdmins, getSyncStatus, startAutoSync };
