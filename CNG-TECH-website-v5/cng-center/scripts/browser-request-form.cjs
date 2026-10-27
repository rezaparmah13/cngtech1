// Run after build: PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/browser-request-form.cjs
// Synthetic browser-only tests. API responses are mocked, not a PHP/hosting test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const checks = [], errors = [];
function check(ok, name) { assert.ok(ok, name); checks.push(name); }
(async () => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {cwd: root, env: {...process.env, PORT: '0'}});
  let browser;
  try {
    const [output] = await once(server.stdout, 'data');
    const url = output.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    browser = await chromium.launch({headless:true, args:['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#request-availability').textContent.includes('غیرفعال'));
    check(await page.locator('#req-ownerType').isDisabled(), 'static preview keeps checkbox disabled');
    let sent, reference = null, fail = false;
    await page.route('**/api/requests.php', async route => {
      if (route.request().method() === 'POST') {
        sent = route.request().postDataJSON();
        if (fail) return route.fulfill({status:422, json:{message:'خطای ساختگی آزمون'}});
        reference = 'TEST-ONLY-123';
        return route.fulfill({status:201, json:{reference}});
      }
      await route.fulfill({json:{csrf:'test-csrf', ticket:'test-ticket', reference}});
    });
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width, height:1000});
      await page.goto(url);
      await page.waitForFunction(() => !document.querySelector('#request-fields').disabled);
      check(!(await page.locator('#req-ownerType').isChecked()), `adult default ${width}`);
      check(await page.locator('#guardian-fields').isHidden(), `guardian hidden ${width}`);
      check(await page.locator('#req-mobile').isEnabled(), `owner mobile enabled ${width}`);
      await page.locator('#req-ownerType').focus();
      await page.keyboard.press('Space');
      check(await page.locator('#guardian-fields').isVisible(), `keyboard toggle shows guardian ${width}`);
      check(await page.locator('#req-mobile').isDisabled(), `owner mobile disabled ${width}`);
      check(await page.locator('#req-guardianMobile').isEnabled(), `parent mobile enabled ${width}`);
      check(await page.locator('#req-ownerId').isEnabled() && await page.locator('#req-ownerBirth').isEnabled() && await page.locator('#req-plate').isEnabled(), `owner identity and plate retained ${width}`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow ${width}`);
      if (width === 390) {
        await page.evaluate(() => document.fonts.ready);
        await page.locator('.request-panel').screenshot({path:path.join(root,'qa/screenshots/form-v5-minor-390.png')});
      }
      await page.locator('#req-ownerType').uncheck();
      check(await page.locator('#req-mobile').isEnabled() && await page.locator('#req-guardianMobile').isDisabled(), `uncheck restores adult ${width}`);
      if (width === 390) await page.locator('.request-panel').screenshot({path:path.join(root,'qa/screenshots/form-v5-adult-390.png')});
    }
    reference = null;
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('#request-fields').disabled);
    for (const [name, invalid, valid] of [
      ['mobile', '123', '۰۹۰۰۰۰۰۰۰۰۰'],
      ['ownerId', '12', '١٢٣٤٥٦٧٨٩١'],
      ['ownerBirth', '1370/13/01', '۱۳۷۰/۰۱/۰۱']
    ]) {
      const field = page.locator(`#req-${name}`);
      await field.fill(invalid);
      check(await field.getAttribute('aria-invalid') === 'true', `invalid ${name} marked`);
      check(await page.locator(`#req-${name}-error`).isVisible(), `visible ${name} error`);
      await field.fill(valid);
      check(await field.evaluate(f => f.checkValidity()), `Persian/Arabic ${name} accepted`);
      check(await page.locator(`#req-${name}-error`).isHidden(), `corrected ${name} clears error`);
    }
    await page.locator('#req-plate').fill('۱۲ ب ۳۴۵ ایران ۶۷');
    await page.locator('#request-submit').click();
    check(await page.locator('#consent-error').isVisible(), 'consent error visible');
    await page.locator('[name=consent]').check();
    check(await page.locator('#consent-error').isHidden(), 'consent error clears');
    await page.locator('#req-mobile').fill('123');
    await page.locator('#req-ownerType').check();
    check(await page.locator('#req-mobile-error').isHidden(), 'disabled owner phone error clears');
    for (const minor of [false,true]) {
      reference = null; sent = null;
      await page.goto(url);
      await page.waitForFunction(() => !document.querySelector('#request-fields').disabled);
      await page.locator('#req-ownerId').fill('1234567891');
      await page.locator('#req-ownerBirth').fill(minor ? '1395/01/01' : '1370/01/01');
      await page.locator('#req-plate').fill('۱۲ ب ۳۴۵ ایران ۶۷');
      await page.locator('#req-mobile').fill('09000000000');
      await page.locator('[name=consent]').check();
      // Populate parent fields in both cases to verify inactive values never leak.
      await page.locator('#req-ownerType').check();
      await page.locator('#req-guardianRelation').selectOption('mother');
      await page.locator('#req-guardianId').fill('9876543210');
      await page.locator('#req-guardianBirth').fill('1365/02/10');
      check(!await page.locator('#registration-form').evaluate(f=>f.checkValidity()), 'parent phone required '+minor);
      await page.locator('#req-guardianMobile').fill('09000000001');
      if (!minor) await page.locator('#req-ownerType').uncheck();
      check(await page.locator('#registration-form').evaluate(f=>f.checkValidity()), 'active fields valid '+minor);
      fail = true;
      await page.locator('#request-submit').click();
      await page.waitForFunction(() => document.querySelector('#request-result').textContent.includes('خطای ساختگی'));
      check(await page.locator('#req-ownerId').inputValue() === '1234567891', 'error preserves input '+minor);
      check(await page.locator('#req-mobile').isDisabled() === minor, 'error preserves mobile state '+minor);
      fail = false;
      await page.locator('#request-submit').click();
      await page.waitForFunction(() => document.querySelector('#request-fields').disabled);
      check(sent.ownerType === (minor ? 'minor' : 'adult'), 'API age value '+minor);
      check(sent.mobile === (minor ? '09000000001' : '09000000000'), 'API receives correct phone '+minor);
      check(!('guardianMobile' in sent), 'no redundant parent phone '+minor);
      check(minor ? sent.guardianRelation === 'mother' : !('guardianId' in sent), 'only active guardian data sent '+minor);
      check(await page.locator('#req-mobile').inputValue() === '' && await page.locator('#req-guardianMobile').inputValue() === '', 'success clears phones '+minor);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#request-result').textContent.includes('TEST-ONLY-123'));
      check(await page.locator('#req-ownerType').isDisabled(), 'reload prevents duplicate request '+minor);
    }
    check(errors.length === 0, 'no browser JavaScript errors');
    fs.writeFileSync(path.join(root,'qa/form-v5-browser-report.json'), JSON.stringify({environment:'Local Chromium with mocked API; NOT PHP or production hosting', syntheticDataOnly:true, passed:checks.length, checks, errors},null,2)+'\n');
    console.log(`PASS: ${checks.length} browser form checks`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
