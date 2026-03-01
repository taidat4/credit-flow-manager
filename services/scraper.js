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
async function createBrowser(adminId, email) {
    // Use email for profile dir to avoid ID collisions between databases
    const safeEmail = (email || `admin_${adminId}`).replace(/[^a-zA-Z0-9]/g, '_');
    const profileDir = path.join(BROWSER_DATA_DIR, `profile_${safeEmail}`);
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
        // Verify we're logged into the CORRECT account
        console.log('[Login] Session exists, verifying account...');
        syncStatus[adminId].message = 'Đang kiểm tra tài khoản...';
        try {
            await driver.get('https://myaccount.google.com/personal-info');
            await driver.sleep(3000);
            const pageText = await driver.findElement(By.css('body')).getText();
            if (pageText.toLowerCase().includes(email.toLowerCase())) {
                console.log(`[Login] ✓ Correct account: ${email}`);
                return true;
            } else {
                console.log(`[Login] ✗ Wrong account! Expected ${email}, signing out...`);
                syncStatus[adminId].message = 'Sai tài khoản, đang đăng xuất...';
                await driver.get('https://accounts.google.com/Logout');
                await driver.sleep(3000);
                // Navigate back to login
                await driver.get('https://accounts.google.com/signin/v2/identifier?continue=' + encodeURIComponent(CREDIT_URL) + '&flowName=GlifWebSignIn&flowEntry=ServiceLogin');
                await driver.sleep(3000);
                currentUrl = await driver.getCurrentUrl();
            }
        } catch (e) {
            console.log('[Login] Account verify failed:', e.message, '— proceeding to login');
        }
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
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
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
        console.log(`[Sync] Admin ${adminId}: Bỏ qua - chưa có Google password`);
        syncStatus[adminId] = { status: 'done', message: 'Bỏ qua - chưa có password', last_sync: null };
        return null;
    }

    syncStatus[adminId] = { status: 'syncing', message: 'Đang khởi tạo browser...', last_sync: null };
    let driver = null;

    try {
        driver = await createBrowser(adminId, admin.email);

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
        await db.prepare('UPDATE admins SET last_sync = ?, sync_status = ? WHERE id = ?').run(now, 'success', adminId);

        syncStatus[adminId] = {
            status: 'done',
            message: `✅ Sync thành công! Credits còn: ${creditData.monthlyCredits}`,
            last_sync: now,
            data: { credits: creditData, storage: storageData }
        };

        return { credits: creditData, storage: storageData };

    } catch (err) {
        console.error(`[Scraper] Error syncing admin ${adminId}:`, err.message);
        await db.prepare('UPDATE admins SET sync_status = ? WHERE id = ?').run('error: ' + err.message, adminId);
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

        // Also detect pending invitations
        const PENDING_KEYWORDS = ['lời mời sẽ hết hạn', 'invitation expires', 'lời mời đã được gửi', 'invitation sent', 'hết hạn vào'];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nextLine = (lines[i + 1] || '').toLowerCase().trim();
            const prevLine = (lines[i - 1] || '').toLowerCase().trim();

            // Check for pending invitation: look for email on this line + invitation text on same/next line
            // OR invitation text on this line + email on previous line
            const emailInLine = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            const lineLower = line.toLowerCase();
            const hasPendingText = PENDING_KEYWORDS.some(kw => lineLower.includes(kw));
            const nextHasPendingText = PENDING_KEYWORDS.some(kw => nextLine.includes(kw));

            if (emailInLine && (hasPendingText || nextHasPendingText)) {
                const pendingEmail = emailInLine[1];
                if (pendingEmail !== adminEmail) {
                    familyMembers.push({ name: pendingEmail, email: pendingEmail, role: 'pending' });
                    console.log(`[Scraper] ⏳ Pending invitation: ${pendingEmail}`);
                    if (nextHasPendingText) i++; // skip the expiry line
                    continue;
                }
            }
            // Also check: invitation text on current line, email on previous line
            if (hasPendingText && !emailInLine) {
                const prevEmailMatch = (lines[i - 1] || '').match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                if (prevEmailMatch && prevEmailMatch[1] !== adminEmail) {
                    // Already handled by the check above when we were on the previous line
                    continue;
                }
            }

            // Exact match ONLY - "member" !== "membership"
            const isMember = MEMBER_EXACT.some(role => nextLine === role);
            const isManager = MANAGER_EXACT.some(role => nextLine === role);

            if (!isMember && !isManager) continue;

            // lineLower already defined above
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

        console.log(`[Scraper] Valid members: ${memberNames.length}, pending: ${familyMembers.filter(m => m.role === 'pending').length}`);

        // Click each ACTIVE member to get email (skip pending - we already have their email)
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

    // Save to DB — ALWAYS sync real state (even if 0 members)
    const COLORS = ['#f97316', '#06b6d4', '#8b5cf6', '#ef4444', '#22c55e', '#eab308', '#ec4899', '#14b8a6'];
    const scrapedIdentifiers = familyMembers.map(m => m.name);

    // Step 1: Remove members/pending no longer in Google Family
    const existing = await db.prepare('SELECT id, name, status FROM members WHERE admin_id = ? AND status IN (?, ?)').all(adminId, 'active', 'pending');
    for (const em of existing) {
        if (!scrapedIdentifiers.includes(em.name)) {
            await db.prepare('UPDATE members SET status = ? WHERE id = ?').run('removed', em.id);
            console.log(`[Scraper] ✗ Removed (kicked/expired): "${em.name}"`);
        }
    }

    // Step 2: Add/update members with correct status
    for (const fm of familyMembers) {
        const newStatus = fm.role === 'pending' ? 'pending' : 'active';
        const ex = await db.prepare('SELECT id, status FROM members WHERE admin_id = ? AND name = ?').get(adminId, fm.name);
        if (!ex) {
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            await db.prepare('INSERT INTO members (admin_id, name, email, avatar_color, status) VALUES (?, ?, ?, ?, ?)').run(adminId, fm.name, fm.email, color, newStatus);
            console.log(`[Scraper] ✓ ${newStatus === 'pending' ? '⏳ Pending' : 'New member'}: ${fm.name} (${fm.email})`);
        } else {
            // Update email + status (pending→active if accepted, or keep current role)
            await db.prepare("UPDATE members SET email = CASE WHEN ? != '' THEN ? ELSE email END, status = ? WHERE id = ?").run(fm.email, fm.email, newStatus, ex.id);
            if (ex.status !== newStatus) console.log(`[Scraper] ↔ Status change: ${fm.name} ${ex.status} → ${newStatus}`);
        }
    }

    console.log(`[Scraper] Sync complete: ${familyMembers.length} members, removed: ${existing.filter(e => !scrapedIdentifiers.includes(e.name)).length}`);

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
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) return;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // ===== CREDITS: Store absolute value from Google =====
    // creditData.monthlyCredits = credits remaining from Google One page
    // Store this directly on the admin record
    await db.prepare('UPDATE admins SET credits_remaining_actual = ?, last_sync = ? WHERE id = ?')
        .run(creditData.monthlyCredits, now, adminId);

    // For member usage: only log if value changed
    if (creditData.memberUsage.length > 0) {
        for (const usage of creditData.memberUsage) {
            const member = await db.prepare('SELECT id FROM members WHERE admin_id = ? AND name LIKE ?').get(adminId, `%${usage.name}%`);
            if (!member) continue;

            // Check last recorded value for this member
            const lastLog = await db.prepare(
                "SELECT amount FROM credit_logs WHERE member_id = ? AND admin_id = ? AND description LIKE '%[auto-sync]%' ORDER BY id DESC LIMIT 1"
            ).get(member.id, adminId);

            const lastAmount = lastLog ? lastLog.amount : 0;

            // Only log if value changed
            if (usage.amount !== lastAmount) {
                await db.prepare('INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, ?, ?, ?, ?)')
                    .run(adminId, member.id, usage.amount, `[auto-sync] ${usage.name}`, today);
                console.log(`[Scraper] Credit changed for ${usage.name}: ${lastAmount} -> ${usage.amount}`);
            }
        }
    } else {
        // Fallback: total usage from admin level
        const creditsUsed = admin.total_monthly_credits - creditData.monthlyCredits;
        if (creditsUsed > 0) {
            const lastLog = await db.prepare(
                "SELECT amount FROM credit_logs WHERE admin_id = ? AND member_id IS NULL AND description LIKE '%[auto-sync] Total%' ORDER BY id DESC LIMIT 1"
            ).get(adminId);
            const lastAmount = lastLog ? lastLog.amount : 0;

            if (creditsUsed !== lastAmount) {
                await db.prepare('INSERT INTO credit_logs (admin_id, member_id, amount, description, log_date) VALUES (?, NULL, ?, ?, ?)')
                    .run(adminId, creditsUsed, '[auto-sync] Total usage', today);
            }
        }
    }

    // ===== STORAGE =====
    if (storageData.familyStorage.length > 0) {
        for (const s of storageData.familyStorage) {
            const member = await db.prepare('SELECT id FROM members WHERE admin_id = ? AND name LIKE ?').get(adminId, `%${s.name}%`);
            if (member) {
                await db.prepare("DELETE FROM storage_logs WHERE member_id = ? AND admin_id = ? AND log_date = ?").run(member.id, adminId, today);
                await db.prepare('INSERT INTO storage_logs (member_id, admin_id, drive_gb, gmail_gb, photos_gb, log_date) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(member.id, adminId, storageData.driveGB, storageData.gmailGB, storageData.photosGB, today);
            }
        }
    }
}

const MAX_CONCURRENT_SYNC = 5; // Run up to 5 browsers at once

async function syncAllAdmins() {
    const admins = await db.prepare("SELECT id FROM admins WHERE status = 'active' AND google_password IS NOT NULL AND google_password != ''").all();
    console.log(`[Sync] Starting sync for ${admins.length} admins (max ${MAX_CONCURRENT_SYNC} concurrent)`);

    const results = [];
    // Process in batches of MAX_CONCURRENT_SYNC
    for (let i = 0; i < admins.length; i += MAX_CONCURRENT_SYNC) {
        const batch = admins.slice(i, i + MAX_CONCURRENT_SYNC);
        const batchResults = await Promise.allSettled(
            batch.map(async (admin) => {
                try {
                    const result = await syncAdmin(admin.id);
                    return { id: admin.id, success: true, data: result };
                } catch (err) {
                    return { id: admin.id, success: false, error: err.message };
                }
            })
        );
        for (const r of batchResults) {
            results.push(r.status === 'fulfilled' ? r.value : { id: null, success: false, error: r.reason?.message });
        }
        console.log(`[Sync] Batch ${Math.floor(i / MAX_CONCURRENT_SYNC) + 1} done (${Math.min(i + MAX_CONCURRENT_SYNC, admins.length)}/${admins.length})`);
    }
    return results;
}

// Auto sync every 10 minutes
const AUTO_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
let autoSyncTimer = null;

function startAutoSync() {
    // Skip auto-sync khi chạy local/dev
    if (process.env.NODE_ENV !== 'production') {
        console.log('[AutoSync] ⏸ Skipped (dev mode - set NODE_ENV=production to enable)');
        return;
    }
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

// ========= ADD FAMILY MEMBER =========
const FAMILY_URL = 'https://myaccount.google.com/family/details?utm_source=g1web&utm_medium=default';
const INVITE_URL = 'https://myaccount.google.com/family/invitemembers?utm_source=g1web&utm_medium=default';

async function addFamilyMember(adminId, memberEmail) {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) throw new Error('Admin not found');

    let googlePassword = '';
    if (admin.google_password) {
        try { googlePassword = decrypt(admin.google_password) || ''; } catch { googlePassword = ''; }
    }
    if (!googlePassword) throw new Error('Admin chưa có Google password');

    syncStatus[adminId] = { status: 'syncing', message: 'Đang mở browser để thêm thành viên...' };
    let driver = null;

    try {
        driver = await createBrowser(adminId, admin.email);

        // Go directly to family page — skip credits page
        syncStatus[adminId].message = 'Đang mở trang gia đình...';
        console.log(`[AddMember] Navigating directly to family page...`);
        await driver.get(FAMILY_URL);
        await driver.sleep(5000);

        let currentUrl = await driver.getCurrentUrl();

        // If redirected to login page → need to login first
        if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/about')) {
            console.log('[AddMember] Not logged in, performing login...');
            syncStatus[adminId].message = 'Đang đăng nhập...';
            await googleLogin(driver, admin.email, googlePassword, admin.totp_secret, adminId);
            // After login, go straight to family page
            await driver.get(FAMILY_URL);
            await driver.sleep(5000);
        } else {
            console.log('[AddMember] ✓ Already logged in, on family page');
        }

        // Step 2: Click "+ Gửi lời mời"
        syncStatus[adminId].message = 'Đang tìm nút "Gửi lời mời"...';
        console.log(`[AddMember] Looking for invite button...`);

        // Try clicking invite button directly on family page
        let inviteBtn = await waitAndFind(driver, [
            'a[href*="invitemembers"]',
            'button[aria-label*="mời"]',
            'a[aria-label*="mời"]'
        ], 5000);

        if (inviteBtn) {
            await safeClick(driver, inviteBtn);
            await driver.sleep(3000);
        } else {
            // Fallback: navigate directly to invite URL
            console.log('[AddMember] Invite button not found, navigating directly...');
            await driver.get(INVITE_URL);
            await driver.sleep(3000);
        }

        // Step 3: Find email input and type member email
        syncStatus[adminId].message = `Đang nhập email ${memberEmail}...`;
        console.log(`[AddMember] Finding email input...`);

        const emailInput = await waitAndFind(driver, [
            'input[type="email"]',
            'input[aria-label*="email"]',
            'input[aria-label*="tên"]',
            'input[placeholder*="email"]',
            'input[placeholder*="tên"]'
        ], 10000);

        if (!emailInput) {
            // Take screenshot for debugging
            const pageText = await driver.findElement(By.css('body')).getText();
            console.log('[AddMember] Page text:', pageText.substring(0, 500));
            throw new Error('Không tìm thấy ô nhập email trên trang mời');
        }

        await safeFill(driver, emailInput, memberEmail);
        await driver.sleep(2000);

        // Sometimes need to select from autocomplete dropdown
        try {
            const suggestion = await waitAndFind(driver, [
                `[data-email="${memberEmail}"]`,
                '[role="option"]',
                '[role="listbox"] [role="option"]'
            ], 3000);
            if (suggestion) {
                await safeClick(driver, suggestion);
                await driver.sleep(1000);
            }
        } catch { /* no autocomplete, that's fine */ }

        // Step 4: Click "Gửi" button
        syncStatus[adminId].message = 'Đang gửi lời mời...';
        console.log(`[AddMember] Looking for Send button...`);

        const sendBtn = await waitAndFind(driver, [
            'button[data-idom-class*="send"]',
            'button:not([aria-label*="Hủy"])'
        ], 5000);

        // Try finding by text content
        let clicked = false;
        if (!sendBtn) {
            const buttons = await driver.findElements(By.css('button'));
            for (const btn of buttons) {
                const text = await btn.getText();
                if (text.trim() === 'Gửi' || text.trim() === 'Send') {
                    await safeClick(driver, btn);
                    clicked = true;
                    break;
                }
            }
        } else {
            await safeClick(driver, sendBtn);
            clicked = true;
        }

        if (!clicked) {
            // Last resort: find by text
            try {
                const gửiBtn = await driver.findElement(By.xpath("//button[contains(text(), 'Gửi') or contains(text(), 'Send')]"));
                await safeClick(driver, gửiBtn);
                clicked = true;
            } catch { }
        }

        if (!clicked) throw new Error('Không tìm thấy nút Gửi');

        await driver.sleep(5000);

        // Step 5: Check for success page + click "Tôi hiểu"
        currentUrl = await driver.getCurrentUrl();
        console.log(`[AddMember] After send URL: ${currentUrl}`);

        const pageText = await driver.findElement(By.css('body')).getText();
        if (pageText.includes('Đã gửi lời mời') || pageText.includes('Invitation sent') || currentUrl.includes('invitationcomplete')) {
            console.log('[AddMember] ✓ Invitation sent successfully!');

            // Click "Tôi hiểu" button
            try {
                const understandBtn = await driver.findElement(By.xpath(
                    "//button[contains(text(), 'Tôi hiểu') or contains(text(), 'Got it') or contains(text(), 'I understand')]"
                ));
                await safeClick(driver, understandBtn);
                await driver.sleep(2000);
            } catch {
                console.log('[AddMember] "Tôi hiểu" button not found, but invitation was sent');
            }

            syncStatus[adminId] = { status: 'done', message: `✅ Đã gửi lời mời tới ${memberEmail}` };
            return { success: true, message: `Đã gửi lời mời tới ${memberEmail}` };

        } else if (pageText.includes('không hợp lệ') || pageText.includes('invalid')) {
            throw new Error(`Email ${memberEmail} không hợp lệ`);
        } else if (pageText.includes('đã là thành viên') || pageText.includes('already a member')) {
            throw new Error(`${memberEmail} đã là thành viên rồi`);
        } else {
            console.log('[AddMember] Page text after send:', pageText.substring(0, 500));
            throw new Error('Không xác định được kết quả gửi lời mời');
        }

    } catch (err) {
        console.error(`[AddMember] Error:`, err.message);
        syncStatus[adminId] = { status: 'error', message: err.message };
        throw err;
    } finally {
        if (driver) {
            try { await driver.quit(); } catch { }
        }
    }
}

// ========= CANCEL INVITATION =========
async function cancelInvitation(adminId, memberEmail) {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) throw new Error('Admin not found');

    let googlePassword = '';
    if (admin.google_password) {
        try { googlePassword = decrypt(admin.google_password) || ''; } catch { googlePassword = ''; }
    }
    if (!googlePassword) throw new Error('Admin chưa có Google password');

    syncStatus[adminId] = { status: 'syncing', message: 'Đang mở browser để hủy lời mời...' };
    let driver = null;

    try {
        driver = await createBrowser(adminId, admin.email);

        // Go directly to family page
        syncStatus[adminId].message = 'Đang mở trang gia đình...';
        console.log(`[CancelInvite] Navigating to family page...`);
        await driver.get(FAMILY_URL);
        await driver.sleep(3000);

        let currentUrl = await driver.getCurrentUrl();

        // If not logged in → login first
        if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/about')) {
            console.log('[CancelInvite] Not logged in, performing login...');
            syncStatus[adminId].message = 'Đang đăng nhập...';
            await googleLogin(driver, admin.email, googlePassword, admin.totp_secret, adminId);
            await driver.get(FAMILY_URL);
            await driver.sleep(3000);
        } else {
            console.log('[CancelInvite] ✓ Already logged in');
        }

        // Step 1: Click on the pending member email
        syncStatus[adminId].message = `Đang tìm ${memberEmail}...`;
        console.log(`[CancelInvite] Looking for: ${memberEmail}`);

        let clicked = false;
        try {
            const el = await driver.findElement(By.xpath(`//*[contains(text(), '${memberEmail}')]`));
            try {
                const parent = await el.findElement(By.xpath('./ancestor::a[1]'));
                await safeClick(driver, parent);
                clicked = true;
            } catch {
                await safeClick(driver, el);
                clicked = true;
            }
        } catch { }

        if (!clicked) {
            throw new Error(`Không tìm thấy ${memberEmail} trên trang gia đình`);
        }

        await driver.sleep(2000);
        console.log(`[CancelInvite] ✓ On member detail page`);

        // Step 2: Click "Hủy lời mời" / "Cancel invitation"
        syncStatus[adminId].message = 'Đang hủy lời mời...';

        let cancelBtn = null;
        // Try XPath first (any element)
        const cancelXpaths = [
            '//*[contains(text(), "Hủy lời mời")]',
            '//*[contains(text(), "Huỷ lời mời")]',
            '//*[contains(text(), "Cancel invitation")]'
        ];
        for (const xp of cancelXpaths) {
            try {
                cancelBtn = await driver.findElement(By.xpath(xp));
                if (await cancelBtn.isDisplayed()) { console.log(`[CancelInvite] Found via XPath: ${xp}`); break; }
                cancelBtn = null;
            } catch { cancelBtn = null; }
        }

        // JS fallback
        if (!cancelBtn) {
            console.log('[CancelInvite] XPath failed, trying JS...');
            cancelBtn = await driver.executeScript(`
                const all = document.querySelectorAll('*');
                for (const el of all) {
                    if (el.children.length > 2) continue;
                    const t = (el.textContent || '').trim().toLowerCase();
                    if (t === 'hủy lời mời' || t === 'huỷ lời mời' || t === 'cancel invitation') return el;
                }
                return null;
            `);
        }

        if (!cancelBtn) {
            const pageText = await driver.findElement(By.css('body')).getText();
            console.log('[CancelInvite] Page text:', pageText.substring(0, 500));
            throw new Error('Không tìm thấy nút "Hủy lời mời" / "Cancel invitation"');
        }

        await safeClick(driver, cancelBtn);
        await driver.sleep(2000);
        console.log('[CancelInvite] ✓ Clicked cancel');

        // Step 3: Confirm "Có" / "Yes"
        syncStatus[adminId].message = 'Đang xác nhận...';

        let confirmBtn = null;
        const confirmXpaths = [
            '//button[text()="Có"]', '//button[text()="Yes"]',
            '//*[text()="Có"]', '//*[text()="Yes"]'
        ];
        for (const xp of confirmXpaths) {
            try {
                confirmBtn = await driver.findElement(By.xpath(xp));
                if (await confirmBtn.isDisplayed()) { console.log(`[CancelInvite] Confirm found: ${xp}`); break; }
                confirmBtn = null;
            } catch { confirmBtn = null; }
        }

        // JS fallback
        if (!confirmBtn) {
            confirmBtn = await driver.executeScript(`
                const all = document.querySelectorAll('button, a, span, [role="button"]');
                for (const el of all) {
                    const t = (el.textContent || '').trim();
                    if (t === 'Có' || t === 'Yes') return el;
                }
                return null;
            `);
        }

        if (!confirmBtn) throw new Error('Không tìm thấy nút xác nhận');

        await safeClick(driver, confirmBtn);
        await driver.sleep(3000);
        console.log('[CancelInvite] ✓ Confirmed');

        // Step 4: Check we're back on the family details page (no more pending member)
        currentUrl = await driver.getCurrentUrl();
        console.log(`[CancelInvite] After cancel URL: ${currentUrl}`);

        if (currentUrl.includes('family/details') || currentUrl.includes('family')) {
            console.log('[CancelInvite] ✓ Back on family page — invitation cancelled!');
        }

        // Update DB: mark member as removed
        await db.prepare("UPDATE members SET status = 'removed' WHERE admin_id = ? AND email = ? AND status = 'pending'").run(adminId, memberEmail);
        console.log(`[CancelInvite] ✓ DB updated: ${memberEmail} -> removed`);

        syncStatus[adminId] = { status: 'done', message: `✅ Đã hủy lời mời ${memberEmail}` };
        return { success: true, message: `Đã hủy lời mời ${memberEmail}` };

    } catch (err) {
        console.error(`[CancelInvite] Error:`, err.message);
        syncStatus[adminId] = { status: 'error', message: err.message };
        throw err;
    } finally {
        if (driver) {
            try { await driver.quit(); } catch { }
        }
    }
}

// ========= REMOVE FAMILY MEMBER =========
async function removeFamilyMember(adminId, memberId) {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
    if (!admin) throw new Error('Admin not found');

    const member = await db.prepare('SELECT * FROM members WHERE id = ? AND admin_id = ?').get(memberId, adminId);
    if (!member) throw new Error('Member not found');

    let googlePassword = '';
    if (admin.google_password) {
        try { googlePassword = decrypt(admin.google_password) || ''; } catch { googlePassword = ''; }
    }
    if (!googlePassword) throw new Error('Admin chưa có Google password');

    syncStatus[adminId] = { status: 'syncing', message: `Đang xóa ${member.name}...` };
    let driver = null;

    try {
        driver = await createBrowser(adminId, admin.email);

        // Go directly to family page
        syncStatus[adminId].message = 'Đang mở trang gia đình...';
        console.log(`[RemoveMember] Navigating to family page...`);
        await driver.get(FAMILY_URL);
        await driver.sleep(3000);

        let currentUrl = await driver.getCurrentUrl();

        // If not logged in → login first
        if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/about')) {
            console.log('[RemoveMember] Not logged in, performing login...');
            syncStatus[adminId].message = 'Đang đăng nhập...';
            await googleLogin(driver, admin.email, googlePassword, admin.totp_secret, adminId);
            await driver.get(FAMILY_URL);
            await driver.sleep(3000);
        } else {
            console.log('[RemoveMember] ✓ Already logged in');
        }

        // Step 1: Click on the member
        syncStatus[adminId].message = `Đang tìm ${member.name}...`;
        const memberName = member.name;
        const memberEmail = member.email;
        console.log(`[RemoveMember] Looking for: ${memberName} (${memberEmail})`);

        let clicked = false;
        // Try by name first, then by email
        for (const searchText of [memberName, memberEmail]) {
            if (!searchText || clicked) continue;
            try {
                const el = await driver.findElement(By.xpath(`//*[contains(text(), '${searchText}')]`));
                try {
                    const parent = await el.findElement(By.xpath('./ancestor::a[1]'));
                    await safeClick(driver, parent);
                    clicked = true;
                } catch {
                    await safeClick(driver, el);
                    clicked = true;
                }
            } catch { }
        }

        if (!clicked) {
            throw new Error(`Không tìm thấy ${memberName} trên trang gia đình`);
        }

        await driver.sleep(2000);
        console.log(`[RemoveMember] ✓ On member detail page`);

        // Step 2: Click "Xóa thành viên" / "Remove member"
        syncStatus[adminId].message = 'Đang bấm xóa thành viên...';

        let removeBtn = null;
        const removeXpaths = [
            '//*[contains(text(), "Xóa thành viên")]',
            '//*[contains(text(), "Xoá thành viên")]',
            '//*[contains(text(), "Remove member")]',
            '//*[contains(text(), "remove member")]'
        ];
        for (const xp of removeXpaths) {
            try {
                removeBtn = await driver.findElement(By.xpath(xp));
                if (await removeBtn.isDisplayed()) { console.log(`[RemoveMember] Found: ${xp}`); break; }
                removeBtn = null;
            } catch { removeBtn = null; }
        }

        // JS fallback
        if (!removeBtn) {
            removeBtn = await driver.executeScript(`
                const all = document.querySelectorAll('*');
                for (const el of all) {
                    if (el.children.length > 2) continue;
                    const t = (el.textContent || '').trim().toLowerCase();
                    if (t === 'xóa thành viên' || t === 'xoá thành viên' || t === 'remove member') return el;
                }
                return null;
            `);
        }

        if (!removeBtn) {
            throw new Error('Không tìm thấy nút "Xóa thành viên"');
        }

        await safeClick(driver, removeBtn);
        await driver.sleep(3000);
        console.log('[RemoveMember] ✓ Clicked remove button');

        // Step 3: Handle verification challenges after clicking remove
        currentUrl = await driver.getCurrentUrl();
        let pageText = await driver.findElement(By.css('body')).getText();
        console.log(`[RemoveMember] After click URL: ${currentUrl}`);
        console.log(`[RemoveMember] Page text (300): ${pageText.substring(0, 300)}`);

        // Case A: Password re-verification → enter password
        if (currentUrl.includes('challenge/pwd') || currentUrl.includes('challenge/password') ||
            pageText.includes('Enter your password') || pageText.includes('Nhập mật khẩu') ||
            pageText.includes('verify it') || pageText.includes('xác minh danh tính')) {

            console.log('[RemoveMember] Password re-verification required...');
            syncStatus[adminId].message = 'Đang nhập lại mật khẩu...';

            let passInput = null;
            try { passInput = await driver.findElement(By.css('input[type="password"]')); } catch { }
            if (!passInput) { try { passInput = await driver.findElement(By.css('input[name="Passwd"]')); } catch { } }

            if (passInput) {
                await safeFill(driver, passInput, googlePassword);
                console.log('[RemoveMember] ✓ Entered password');

                // Click Next
                let nextBtn = null;
                for (const xp of ['//button[contains(text(), "Next")]', '//button[contains(text(), "Tiếp")]', '//button[contains(text(), "Sign in")]', '//button[contains(text(), "Đăng nhập")]', '#passwordNext']) {
                    try {
                        nextBtn = xp.startsWith('//') ? await driver.findElement(By.xpath(xp)) : await driver.findElement(By.css(xp));
                        break;
                    } catch { }
                }
                if (nextBtn) await safeClick(driver, nextBtn);
                await driver.sleep(3000);
                console.log('[RemoveMember] ✓ Password submitted');

                // Re-read page for next step
                currentUrl = await driver.getCurrentUrl();
                pageText = await driver.findElement(By.css('body')).getText();
                console.log(`[RemoveMember] After password URL: ${currentUrl}`);
            } else {
                throw new Error('Không tìm thấy ô nhập mật khẩu');
            }
        }

        // Case B: Phone verification required → abort
        if (pageText.includes('số điện thoại') || pageText.includes('phone number') ||
            pageText.includes('Dùng một số điện thoại') || pageText.includes('Use your phone') ||
            currentUrl.includes('challenge/selection')) {
            console.log('[RemoveMember] ⚠ Phone verification required — aborting');
            syncStatus[adminId] = { status: 'error', message: `⚠ Account cần xác minh SĐT. Vui lòng xóa ${memberName} thủ công.` };
            return { success: false, needsManual: true, message: `Account cần xác minh số điện thoại. Vui lòng xóa "${memberName}" thủ công trên Google Family.` };
        }

        // Case C: 2FA/TOTP required → enter code
        if (currentUrl.includes('challenge/totp') ||
            pageText.includes('Authenticator') || pageText.includes('authenticator') ||
            pageText.includes('Nhập mã') || pageText.includes('Enter code') ||
            pageText.includes('mã xác minh')) {

            if (admin.totp_secret) {
                console.log('[RemoveMember] 2FA required, entering TOTP...');
                syncStatus[adminId].message = 'Đang nhập mã 2FA...';

                // Find TOTP input
                let totpInput = null;
                try { totpInput = await driver.findElement(By.css('input[type="tel"]')); } catch { }
                if (!totpInput) { try { totpInput = await driver.findElement(By.css('input[type="text"]')); } catch { } }
                if (!totpInput) { try { totpInput = await driver.findElement(By.css('#totpPin')); } catch { } }

                if (totpInput) {
                    const OTPAuth = require('otpauth');
                    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(admin.totp_secret.replace(/\s/g, '')), digits: 6, period: 30 });
                    const code = totp.generate();
                    await safeFill(driver, totpInput, code);
                    console.log(`[RemoveMember] Entered TOTP: ${code}`);

                    // Click Next/Verify — try multiple methods
                    let verifyBtn = null;
                    for (const xp of ['//button[contains(text(), "Tiếp")]', '//button[contains(text(), "Next")]', '//button[contains(text(), "Xác minh")]', '//button[contains(text(), "Verify")]']) {
                        try { verifyBtn = await driver.findElement(By.xpath(xp)); break; } catch { }
                    }
                    // JS fallback for Next button
                    if (!verifyBtn) {
                        verifyBtn = await driver.executeScript(`
                            const all = document.querySelectorAll('button, [role="button"]');
                            for (const el of all) {
                                const t = (el.textContent || '').trim();
                                if (t === 'Next' || t === 'Tiếp theo' || t === 'Verify' || t === 'Xác minh') return el;
                            }
                            return null;
                        `);
                    }
                    if (verifyBtn) {
                        await safeClick(driver, verifyBtn);
                        console.log('[RemoveMember] ✓ Clicked Next/Verify');
                    } else {
                        console.log('[RemoveMember] ⚠ Next button not found, trying Enter key...');
                        await totpInput.sendKeys(require('selenium-webdriver').Key.RETURN);
                    }

                    // Wait for 2FA page to go away (poll up to 15s)
                    console.log('[RemoveMember] Waiting for 2FA to process...');
                    for (let i = 0; i < 8; i++) {
                        await driver.sleep(2000);
                        currentUrl = await driver.getCurrentUrl();
                        console.log(`[RemoveMember] 2FA poll ${i + 1}: ${currentUrl.substring(0, 80)}`);
                        if (!currentUrl.includes('challenge/totp')) {
                            console.log('[RemoveMember] ✓ 2FA passed!');
                            break;
                        }
                    }
                } else {
                    throw new Error('Không tìm thấy ô nhập mã 2FA');
                }
            } else {
                syncStatus[adminId] = { status: 'error', message: `⚠ Account yêu cầu 2FA nhưng chưa có TOTP. Xóa ${memberName} thủ công.` };
                return { success: false, needsManual: true, message: `Account yêu cầu 2FA nhưng chưa cấu hình TOTP. Vui lòng xóa "${memberName}" thủ công.` };
            }
        }

        // Wait for confirmation page (poll up to 20s)
        console.log('[RemoveMember] Waiting for confirmation page...');
        syncStatus[adminId].message = 'Đang chờ trang xác nhận...';

        let confirmPageText = '';
        let onConfirmPage = false;
        let alreadyOnFamilyPage = false;

        for (let i = 0; i < 10; i++) {
            await driver.sleep(2000);
            currentUrl = await driver.getCurrentUrl();
            confirmPageText = await driver.findElement(By.css('body')).getText();
            const lowerText = confirmPageText.toLowerCase();
            console.log(`[RemoveMember] Confirm poll ${i + 1}: URL=${currentUrl.substring(0, 100)}`);

            // Already back on family page → member was removed without confirmation
            if (currentUrl.includes('family/details')) {
                console.log('[RemoveMember] ✓ Already back on family page');
                alreadyOnFamilyPage = true;
                break;
            }

            // On confirmation URL
            if (currentUrl.includes('family/remove') || currentUrl.includes('family%2Fremove')) {
                console.log('[RemoveMember] ✓ On removal page (URL)');
                onConfirmPage = true;
                break;
            }

            // On confirmation page (text)
            if (lowerText.includes('thành viên gia đình') || lowerText.includes('remove family member') ||
                lowerText.includes('mất quyền truy cập') || lowerText.includes('will lose access')) {
                console.log('[RemoveMember] ✓ On removal page (text)');
                onConfirmPage = true;
                break;
            }

            // Still on challenge → keep waiting
            if (currentUrl.includes('challenge/')) {
                console.log('[RemoveMember] Still on challenge, waiting...');
                continue;
            }

            // Other page → try to find Remove button
            console.log('[RemoveMember] Unknown page, checking for button...');
            onConfirmPage = true;
            break;
        }

        // Click "Xóa" / "Remove" on confirmation page
        let removalConfirmed = false;

        if (alreadyOnFamilyPage) {
            removalConfirmed = true;
            console.log('[RemoveMember] Member already removed (no confirmation needed)');
        } else if (onConfirmPage) {
            console.log('[RemoveMember] Looking for Remove button...');
            syncStatus[adminId].message = 'Đang xác nhận xóa...';

            let confirmRemoveBtn = null;

            // JS first — most reliable
            confirmRemoveBtn = await driver.executeScript(`
                const all = document.querySelectorAll('button, a, span, [role="button"]');
                for (const el of all) {
                    const t = (el.textContent || '').trim();
                    if (t === 'Xóa' || t === 'Xoá' || t === 'Remove' || t === 'Xoả') return el;
                }
                return null;
            `);

            // XPath fallback
            if (!confirmRemoveBtn) {
                for (const xp of [
                    '//button[text()="Xóa"]', '//button[text()="Xoá"]', '//button[text()="Remove"]',
                    '//*[text()="Xóa"]', '//*[text()="Xoá"]', '//*[text()="Remove"]'
                ]) {
                    try {
                        confirmRemoveBtn = await driver.findElement(By.xpath(xp));
                        if (await confirmRemoveBtn.isDisplayed()) break;
                        confirmRemoveBtn = null;
                    } catch { confirmRemoveBtn = null; }
                }
            }

            if (confirmRemoveBtn) {
                await safeClick(driver, confirmRemoveBtn);
                await driver.sleep(3000);
                console.log('[RemoveMember] ✓ Clicked Remove — confirmed!');
                removalConfirmed = true;
            } else {
                console.log('[RemoveMember] ⚠ Remove button not found, page:', confirmPageText.substring(0, 300));
            }
        } else {
            console.log('[RemoveMember] ⚠ Could not reach confirmation page');
        }

        // Only update DB if removal was actually confirmed
        if (removalConfirmed) {
            await db.prepare("UPDATE members SET status = 'removed' WHERE id = ?").run(memberId);
            console.log(`[RemoveMember] ✓ DB updated: ${memberName} -> removed`);
            syncStatus[adminId] = { status: 'done', message: `✅ Đã xóa ${memberName} khỏi nhóm gia đình` };
            return { success: true, message: `Đã xóa ${memberName} khỏi nhóm gia đình` };
        } else {
            syncStatus[adminId] = { status: 'error', message: `⚠ Không thể xóa ${memberName}. Vui lòng thử lại hoặc xóa thủ công.` };
            return { success: false, message: `Không thể xóa "${memberName}". Vui lòng thử lại hoặc xóa thủ công.` };
        }

    } catch (err) {
        console.error(`[RemoveMember] Error:`, err.message);
        syncStatus[adminId] = { status: 'error', message: err.message };
        throw err;
    } finally {
        if (driver) {
            try { await driver.quit(); } catch { }
        }
    }
}

module.exports = { syncAdmin, syncAllAdmins, getSyncStatus, startAutoSync, addFamilyMember, cancelInvitation, removeFamilyMember };
