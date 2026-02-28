// Test login with custom profile (same as scraper)
const fs = require('fs');
const path = require('path');
const { Builder, By, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
require('chromedriver');
const OTPAuth = require('otpauth');

const LOG_FILE = 'C:/tmp/login_test2.log';
const log = (m) => { console.log(m); fs.appendFileSync(LOG_FILE, m + '\n'); };

const PROFILE_DIR = path.join(__dirname, 'browser_data', 'test_chrome_profile');

(async () => {
    fs.writeFileSync(LOG_FILE, '=== Login Test with Custom Profile ===\n');

    let d;
    try {
        if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

        const o = new chrome.Options();
        o.addArguments(`--user-data-dir=${PROFILE_DIR}`);
        o.addArguments('--no-first-run', '--disable-infobars', '--disable-blink-features=AutomationControlled', '--window-size=1100,800');
        o.excludeSwitches('enable-automation');

        log('Creating browser with profile: ' + PROFILE_DIR);
        d = await new Builder().forBrowser('chrome').setChromeOptions(o).build();
        log('Browser created');

        log('Navigating to one.google.com...');
        await d.get('https://one.google.com/');
        await d.sleep(4000);

        const url = await d.getCurrentUrl();
        log('URL: ' + url);

        if (!url.includes('accounts.google.com')) {
            log('Already logged in! Skipping login.');
        } else {
            log('=== LOGIN NEEDED ===');

            // STEP 1: Email
            log('Step 1: Finding email field...');
            let emailInput = null;
            for (const sel of ['#identifierId', 'input[type="email"]', 'input[name="identifier"]']) {
                try {
                    emailInput = await d.findElement(By.css(sel));
                    const disp = await emailInput.isDisplayed();
                    log(`  "${sel}": found, displayed=${disp}`);
                    if (disp) break;
                    emailInput = null;
                } catch {
                    log(`  "${sel}": not found`);
                }
            }

            if (!emailInput) {
                log('FATAL: No email field found!');
                // Dump page source for debugging
                const src = await d.getPageSource();
                fs.writeFileSync('C:/tmp/page_source.html', src);
                log('Page source saved to C:/tmp/page_source.html');
            } else {
                await emailInput.click();
                await d.sleep(300);
                await emailInput.clear();
                await d.sleep(200);
                for (const char of 'bertramritter702891@gmail.com') {
                    await emailInput.sendKeys(char);
                    await d.sleep(30 + Math.random() * 30);
                }
                log('Email typed: bertramritter702891@gmail.com');
                await d.sleep(500);

                // Click Next
                log('Step 1b: Clicking Next...');
                let clicked = false;
                for (const sel of ['#identifierNext', '#identifierNext button', '#identifierNext div[role="button"]']) {
                    try {
                        const btn = await d.findElement(By.css(sel));
                        try { await btn.click(); } catch { await d.executeScript('arguments[0].click()', btn); }
                        log(`  Clicked Next with: "${sel}"`);
                        clicked = true;
                        break;
                    } catch {
                        log(`  Next "${sel}": not found`);
                    }
                }
                if (!clicked) {
                    await emailInput.sendKeys(Key.RETURN);
                    log('  Sent RETURN key');
                }

                await d.sleep(5000);
                log('URL after email: ' + await d.getCurrentUrl());

                // STEP 2: Password
                log('Step 2: Finding password field...');
                let pwInput = null;
                for (let i = 0; i < 5; i++) {
                    for (const sel of ['input[type="password"]', 'input[name="Passwd"]']) {
                        try {
                            pwInput = await d.findElement(By.css(sel));
                            const disp = await pwInput.isDisplayed();
                            if (disp) {
                                log(`  "${sel}": found and displayed (attempt ${i + 1})`);
                                break;
                            }
                            pwInput = null;
                        } catch { }
                    }
                    if (pwInput) break;
                    log(`  Attempt ${i + 1}: not found yet, waiting...`);
                    await d.sleep(2000);
                }

                if (!pwInput) {
                    log('FATAL: No password field found!');
                    const src = await d.getPageSource();
                    fs.writeFileSync('C:/tmp/page_pw.html', src);
                    log('Page source saved');
                } else {
                    await pwInput.click();
                    await d.sleep(300);
                    for (const char of 'Dat@04042003') {
                        await pwInput.sendKeys(char);
                        await d.sleep(30 + Math.random() * 30);
                    }
                    log('Password typed!');
                    await d.sleep(500);

                    // Click Next
                    for (const sel of ['#passwordNext', '#passwordNext button', '#passwordNext div[role="button"]']) {
                        try {
                            const btn = await d.findElement(By.css(sel));
                            try { await btn.click(); } catch { await d.executeScript('arguments[0].click()', btn); }
                            log(`  Password Next clicked: "${sel}"`);
                            break;
                        } catch { }
                    }

                    await d.sleep(5000);
                    const url3 = await d.getCurrentUrl();
                    log('URL after password: ' + url3);

                    // STEP 3: 2FA
                    if (url3.includes('challenge') || url3.includes('signin/v2')) {
                        log('Step 3: 2FA needed!');

                        // Try to select TOTP option
                        try {
                            const totpOpt = await d.findElement(By.css('[data-challengetype="6"]'));
                            await d.executeScript('arguments[0].click()', totpOpt);
                            log('  Selected TOTP option');
                            await d.sleep(2000);
                        } catch { log('  No TOTP selector needed'); }

                        let totpInput = null;
                        for (const sel of ['input[name="totpPin"]', '#totpPin', 'input[type="tel"]']) {
                            try {
                                totpInput = await d.findElement(By.css(sel));
                                if (await totpInput.isDisplayed()) {
                                    log(`  Found TOTP input: "${sel}"`);
                                    break;
                                }
                                totpInput = null;
                            } catch { }
                        }

                        if (totpInput) {
                            const secret = 'w7ek jhba nrx5 yqfz oonb dnbb d2bq xbrs'.replace(/\s+/g, '').toUpperCase();
                            const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' });
                            const code = totp.generate();
                            log('  TOTP code: ' + code);

                            await totpInput.click();
                            await d.sleep(200);
                            await totpInput.sendKeys(code);
                            log('  Code entered!');
                            await d.sleep(500);

                            for (const sel of ['#totpNext', '#totpNext button', 'button[jsname="LgbsSe"]']) {
                                try {
                                    const btn = await d.findElement(By.css(sel));
                                    try { await btn.click(); } catch { await d.executeScript('arguments[0].click()', btn); }
                                    log(`  2FA Next clicked: "${sel}"`);
                                    break;
                                } catch { }
                            }

                            await d.sleep(5000);
                            log('URL after 2FA: ' + await d.getCurrentUrl());
                        } else {
                            log('  FATAL: No TOTP input found!');
                            const src = await d.getPageSource();
                            fs.writeFileSync('C:/tmp/page_2fa.html', src);
                            log('  Page source saved');
                        }
                    }
                }
            }
        }

        const finalUrl = await d.getCurrentUrl();
        log('=== FINAL URL: ' + finalUrl + ' ===');

        await d.sleep(3000);
        await d.quit();
        log('=== DONE ===');

    } catch (e) {
        log('FATAL ERROR: ' + e.message);
        log('Stack: ' + e.stack);
        if (d) try { await d.quit(); } catch { }
    }
})();
