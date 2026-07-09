// Playwright screenshot capture for RGMC Gateway tour slides
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'https://rgmc-gateway-935246372408.asia-southeast1.run.app';

const FAKE_SESSION = {
  username:         'earellano',
  firstName:        'Erwin',
  fullName:         'Erwin Arellano',
  displayName:      'Erwin Arellano',
  department:       'IT',
  email:            'it.arellanoerwin@gmail.com',
  company:          'RGMC',
  systems:          [], // empty → filterSystems() shows ALL systems
  isAdmin:          false,
  isManagement:     false,
  isDepartmentHead: false,
};

const OUT = path.join(__dirname, 'static', 'tour-screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function newPage(ctx, url, session) {
  const sess = session || FAKE_SESSION;
  const page = await ctx.newPage();
  await page.addInitScript((s) => {
    localStorage.setItem('rgmc_gateway_session', JSON.stringify(s));
    localStorage.setItem('rgmc_tour_done_earellano', '1');
    localStorage.setItem('rgmc_admin_tour_done', '1');
  }, sess);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  return page;
}

async function save(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  console.log('  saved:', name + '.png');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // ── 1. Systems grid (card view) ───────────────────────────────────────────
  console.log('1. Systems grid (card view)...');
  const home = await newPage(ctx, BASE + '/');
  try {
    // Main content uses visibility:hidden → visible on applySession()
    await home.waitForFunction(() => {
      const el = document.getElementById('mainContent');
      return el && el.style.visibility === 'visible';
    }, { timeout: 20000 });
    // Switch to card view, then reveal all cards by calling filterSystems with actual names
    await home.evaluate(() => {
      const names = Array.from(document.querySelectorAll('.site-card-name')).map(el => el.textContent.trim());
      if (typeof filterSystems === 'function') filterSystems(names);
      if (typeof setViewMode === 'function') setViewMode('cards');
    });
    await home.waitForTimeout(700);
    await home.evaluate(() => window.scrollTo(0, 0));
    await home.waitForTimeout(500);
    await save(home, 'systems-grid');
  } catch (e) {
    console.warn('  failed:', e.message);
    await save(home, 'systems-grid');
  }

  // ── 2. Health status section ──────────────────────────────────────────────
  console.log('2. Health panel...');
  try {
    // Scroll to find the health section
    await home.evaluate(() => {
      const el = document.querySelector('[class*="health-section"], [class*="health-panel"], .section-health, .health');
      if (el) el.scrollIntoViewIfNeeded();
      else window.scrollTo(0, document.body.scrollHeight * 0.7);
    });
    await home.waitForTimeout(800);
    await save(home, 'health-panel');
  } catch (e) {
    console.warn('  failed:', e.message);
    await save(home, 'health-panel');
  }

  // ── 3. Compact (table) view ───────────────────────────────────────────────
  console.log('3. Compact view...');
  try {
    await home.evaluate(() => {
      if (typeof setViewMode === 'function') setViewMode('compact');
      // Reveal all compact rows
      document.querySelectorAll('.st-row').forEach(r => { r.style.display = ''; r.dataset.approved = 'true'; });
    });
    await home.waitForTimeout(900);
    await home.evaluate(() => window.scrollTo(0, 0));
    await home.waitForTimeout(400);
    await save(home, 'compact-view');
  } catch (e) {
    console.warn('  failed:', e.message);
  }

  // Switch back to card view for report modal, reveal all cards
  try {
    await home.evaluate(() => {
      const names = Array.from(document.querySelectorAll('.site-card-name')).map(el => el.textContent.trim());
      if (typeof filterSystems === 'function') filterSystems(names);
      if (typeof setViewMode === 'function') setViewMode('cards');
    });
    await home.waitForTimeout(400);
  } catch (_) {}

  // ── 4. Report issue modal ─────────────────────────────────────────────────
  console.log('4. Report modal...');
  try {
    await home.evaluate(() => window.scrollTo(0, 0));
    await home.waitForTimeout(400);
    await home.evaluate(() => {
      if (typeof openReport === 'function') openReport('Microsoft Business Central');
    });
    await home.waitForSelector('#reportModal.open', { timeout: 8000 });
    await home.waitForTimeout(600);
    await save(home, 'report-modal');
    await home.evaluate(() => { if (typeof closeReport === 'function') closeReport(); });
    await home.waitForTimeout(300);
  } catch (e) {
    console.warn('  failed:', e.message);
  }

  await home.close();

  // ── 5. Workspace (my issues) page ─────────────────────────────────────────
  console.log('5. Workspace page...');
  const ws = await newPage(ctx, BASE + '/workspace');
  try {
    await ws.waitForTimeout(3000);
    await ws.evaluate(() => window.scrollTo(0, 0));
    await save(ws, 'workspace');
  } catch (e) {
    console.warn('  failed:', e.message);
    await save(ws, 'workspace');
  }
  await ws.close();

  // ── 6. Helpdesk page ─────────────────────────────────────────────────────
  console.log('6. Helpdesk page...');
  const hd = await newPage(ctx, BASE + '/helpdesk');
  try {
    await hd.waitForTimeout(3000);
    await hd.evaluate(() => window.scrollTo(0, 0));
    await save(hd, 'helpdesk');
  } catch (e) {
    console.warn('  failed:', e.message);
    await save(hd, 'helpdesk');
  }
  await hd.close();

  // ── 7. Admin panel ────────────────────────────────────────────────────────
  console.log('7. Admin panel (dashboard)...');
  const adminSess = { ...FAKE_SESSION, isAdmin: true };
  const admin = await newPage(ctx, BASE + '/admin', adminSess);
  try {
    await admin.waitForTimeout(3500);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await save(admin, 'admin-panel');

    // ── 8. Admin common fixes tab ─────────────────────────────────────────
    console.log('8. Admin common fixes tab...');
    await admin.evaluate(() => { if (typeof switchTab === 'function') switchTab('commonfix'); });
    await admin.waitForTimeout(2500);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await save(admin, 'admin-common-fixes');

    // ── 9. Admin users tab ────────────────────────────────────────────────
    console.log('9. Admin users tab...');
    await admin.evaluate(() => { if (typeof switchTab === 'function') switchTab('users'); });
    await admin.waitForTimeout(2000);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await save(admin, 'admin-users');

    // ── 10. Admin systems tab ─────────────────────────────────────────────
    console.log('10. Admin systems tab...');
    await admin.evaluate(() => { if (typeof switchTab === 'function') switchTab('systems'); });
    await admin.waitForTimeout(2000);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await save(admin, 'admin-systems');

  } catch (e) {
    console.warn('  failed:', e.message);
  }
  await admin.close();

  await browser.close();
  console.log('\nDone. Screenshots in:', OUT);
})().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
