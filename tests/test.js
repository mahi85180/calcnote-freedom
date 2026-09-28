// End-to-end tests for CalcNote Freedom (run: npm test). Needs Playwright + Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');
const OLD = fs.readFileSync(path.join(__dirname, 'original-v1.html'), 'utf8');
const MATHJS = require.resolve('mathjs/lib/browser/math.js');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const fails = [];
const ok = (c, name, extra) => { if (c) pass++; else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const external = []; let fakeRelease = { tag_name: 'v3.1.0-build5', name: 'CalcNote Freedom 3.1.0 (build 5)', body: 'Fixes', assets: [{ name: 'CalcNote-Freedom.apk', size: 3500000, browser_download_url: 'https://github.com/x.apk' }], html_url: 'https://github.com/r' };
async function setup(ctx) {
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host === 'app.local') {
      if (u.pathname === '/old') return r.fulfill({ body: OLD, contentType: 'text/html' });
      const f = path.join(DOCS, u.pathname === '/' ? 'index.html' : u.pathname);
      return fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' });
    }
    if (u.host === 'api.github.com') return r.fulfill({ body: JSON.stringify(fakeRelease), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    if (u.host === 'cdnjs.cloudflare.com') {
      if (u.pathname.endsWith('math.js')) return r.fulfill({ path: MATHJS, contentType: 'application/javascript' });
      if (u.pathname.endsWith('localforage.min.js')) return r.fulfill({ path: require.resolve('localforage/dist/localforage.min.js'), contentType: 'application/javascript' });
      return r.fulfill({ body: 'window.html2canvas=()=>{}', contentType: 'application/javascript' });
    }
    external.push(u.href); return r.abort();
  });
}
const texts = p => p.$eval('#ed', e => e.value.split('\n'));
const results = p => p.$$eval('#rescol .r', rs => rs.map(r => r.textContent));
const total = p => p.textContent('#totalValue');
const ready = p => p.waitForFunction(() => window.__cnfReady);
const today = () => { const d = new Date(); const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}, ${D[d.getDay()]}`; };
async function typeLines(p, lines) { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); } }
async function tapKeys(p, labels) { for (const l of labels) await p.click(`#keypadGrid .key[aria-label="${l}"]`); }
async function openSettingsPage(p, nav) { await p.evaluate(() => openSettings()); await p.waitForTimeout(80); if (nav) { await p.click(`.page[data-page="root"] [data-nav="${nav}"]`); await p.waitForTimeout(80); } }
async function closePages(p) { await p.evaluate(() => closeAllPages()); await p.waitForTimeout(350); }
async function newFile(p, lines) { await p.evaluate(t => createFile('', t), lines); await p.waitForTimeout(60); }
const aligned = p => p.evaluate(() => { const m = [...document.querySelectorAll('.ml')].map(e => Math.round(e.getBoundingClientRect().top)); const r = [...document.querySelectorAll('.r')].map(e => Math.round(e.getBoundingClientRect().top)); const g = [...document.querySelectorAll('.g')].map(e => Math.round(e.getBoundingClientRect().top)); return JSON.stringify(m) === JSON.stringify(r) && JSON.stringify(m) === JSON.stringify(g); });

(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true, serviceWorkers: 'block' }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://app.local' }); await setup(c); return c; };
  const ctx = await mk(); const clip = p => p.evaluate(() => navigator.clipboard.readText());

  // 0. data from the first version still loads
  const old = await ctx.newPage(); await old.goto('https://app.local/old'); await old.waitForTimeout(800);
  await old.click('.line-editor'); await old.keyboard.type('500'); await old.keyboard.press('Enter'); await old.keyboard.type('250'); await old.waitForTimeout(1300); await old.close();
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('https://app.local/'); await ready(p);
  ok(external.length === 0, 'Works offline (no unexpected requests)', external);
  ok((await texts(p)).slice(0, 2).join() === '500,250' && await total(p) === '750', 'v1 notes migrate', await texts(p));

  // 1. Engine
  const eng = await p.evaluate(() => {
    const O = engineOpts(); const one = e => { const r = Engine.run([e], O).lines[0]; return r.kind === 'num' ? r.value : r.kind; };
    return [['x = 5', 5], ['Milk price 50', 50], ['rows 10', 10], ['10 + 5%', 10.5], ['log10(100)', 2], ['2500 + 18%', 2950], ['18% of 2500', 450], ['Bread: ₹45', 45], ['Rs 1,00,000', 100000],
      ['Eggs 12 x 6.5', 78], ['5 apples', 5], ['sin(30)', 0.5], ['5!', 120], ['gopi 12+7', 19], ['suri 34+40+7', 81], ['cm 38', 38], ['aryan 11+3+4 paid in cash yesterday evening at the shop near station', 18]].map(([e, x]) => [e, one(e), x]);
  });
  eng.forEach(([e, g, x]) => ok(typeof g === 'number' && Math.abs(g - x) < 1e-9, `Engine: ${e.slice(0, 30)} = ${x}`, g));
  const dates = await p.evaluate(() => ['28 Sep 2026, Mon', '28/09/2026', '2026-09-28', '28 September 2026', 'Monday, 28 Sep 2026', '28-09-26:', '📅 1 Jan 2027'].map(t => Engine.run([t], engineOpts()).lines[0].kind));
  ok(dates.every(k => k === 'date'), 'Date lines recognised (not counted)', dates);
  const blk = await p.evaluate(() => Engine.run(['1 Oct 2026', 'a 10', 'b 20', 'sum', '2 Oct 2026', 'c 5', 'sum'], engineOpts()).lines.map(l => l.value));
  ok(blk[3] === 30 && blk[6] === 5, 'sum restarts after each date', blk);

  // 2. New file starts with today's date; typing + aligned columns
  await p.evaluate(() => newFileFlow()); await p.waitForTimeout(150);
  ok((await texts(p))[0] === today(), "New file starts with today's date", (await texts(p))[0]);
  await typeLines(p, ['vfc 9', 'gns 13+27', 'gopi 12+7', 'aryan 11+3+4 with a long text that wraps onto the next line', 'x = 5', 'x * 3']);
  ok(JSON.stringify((await results(p)).slice(0, 7)) === JSON.stringify(['', '9', '40', '19', '18', '5', '15']) && await total(p) === '101', 'Typing gives results & total', await results(p));
  ok(await aligned(p), 'Line numbers, text and results stay aligned (also wrapped lines)');
  const gut0 = await p.$$eval('#gutter .g', e => e.slice(0, 3).map(x => x.textContent)); ok(gut0.join() === '📅,1,2', 'Date on top, numbering starts at 1 below it', gut0);
  ok(await p.$eval('#mirror .ml:nth-child(3)', e => /t-lbl">gns</.test(e.innerHTML) && /t-op">\+</.test(e.innerHTML)), 'Syntax colours');

  // 3. Native editing: keyboard suggestions, select all, copy, paste
  const attrs = await p.$eval('#ed', e => [e.tagName, e.spellcheck, e.getAttribute('autocorrect'), e.getAttribute('autocomplete')]);
  ok(attrs[0] === 'TEXTAREA' && attrs[1] === true && attrs[2] === 'off' && attrs[3] === 'on', 'Plain text editor with keyboard suggestions on (auto-correct off)', attrs);
  await p.keyboard.press('Control+a'); await p.keyboard.press('Control+c');
  const c1 = await clip(p); ok(c1.startsWith(today() + '\nvfc 9\ngns 13+27'), 'Select all + copy works natively', c1.slice(0, 50));
  ok((await p.textContent('#totalLabel')).startsWith('Selected'), 'Selecting lines shows their sum', await p.textContent('#totalLabel'));
  ok(await total(p) === '101', 'Selected sum value', await total(p));
  await p.evaluate(() => { const v = ED.value; const s = v.indexOf('vfc'); const e = v.indexOf('\ngopi'); ED.setSelectionRange(s, e); document.dispatchEvent(new Event('selectionchange')); });
  await p.waitForTimeout(50);
  ok(await p.textContent('#totalLabel') === 'Selected (2):' && await total(p) === '49', 'Sum of 2 selected lines', [await p.textContent('#totalLabel'), await total(p)]);
  await p.keyboard.press('Control+End');
  await p.evaluate(() => navigator.clipboard.writeText('kf 20\nsps 20\nbsf 6'));
  await p.keyboard.press('Control+v'); await p.waitForTimeout(100);
  ok(await total(p) === '147', 'Paste many lines natively', await total(p));
  ok(await aligned(p), 'Still aligned after paste');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(80);
  ok(await total(p) === '101', 'Undo paste', await total(p));
  await p.keyboard.press('Control+y'); await p.waitForTimeout(80); ok(await total(p) === '147', 'Redo');

  // 4. Name suggestions
  await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('go');
  await p.waitForTimeout(50);
  const chips = await p.$$eval('#suggest .sg', e => e.map(x => x.dataset.w));
  ok(chips.includes('gopi'), 'Name suggestion appears while typing', chips);
  await p.click('#suggest .sg[data-w="gopi"]'); await p.keyboard.type('30');
  ok((await texts(p)).includes('gopi 30'), 'Tap suggestion fills the name', (await texts(p)).slice(-3));

  // 5. Tap result copies, line menu
  await p.click('#rescol .r:nth-child(3)'); ok((await clip(p)) === '40', 'Tap answer copies', await clip(p));
  await p.click('#gutter .g:nth-child(2)'); await p.click('.menu-item[data-key="down"]');
  ok((await texts(p))[2] === 'vfc 9', 'Line menu: move down', (await texts(p)).slice(0, 3));
  await p.click('#gutter .g:nth-child(1)'); await p.click('.menu-item[data-key="date"]');
  await p.fill('.sheet input[type=date]', '2026-01-05'); await p.click('.sheet .btn.ok'); await p.waitForTimeout(80);
  ok((await texts(p))[0] === '5 Jan 2026, Mon', 'Change date from line menu', (await texts(p))[0]);

  // 6. Auto date heading on a new day
  await newFile(p, ['1 Jan 2026, Thu', 'a 10', '']);
  await p.evaluate(() => { ED.focus(); ED.setSelectionRange(ED.value.length, ED.value.length); maybeAutoDate(); });
  let tx = await texts(p);
  ok(tx.includes(today()) && tx[tx.length - 1] === '', 'New day → today\'s date added below old entries', tx);
  await p.evaluate(() => { ED.blur(); }); await p.waitForTimeout(250);
  ok(!(await texts(p)).includes(today()), 'Empty date heading removed again if nothing typed', await texts(p));
  await p.evaluate(() => { ED.focus(); ED.setSelectionRange(ED.value.length, ED.value.length); maybeAutoDate(); });
  await p.keyboard.type('b 5'); await p.evaluate(() => ED.blur()); await p.waitForTimeout(250);
  tx = await texts(p); ok(tx.includes(today()) && tx.includes('b 5') && await total(p) === '15', 'Date heading kept when entries added', tx);

  // 7. Keypad
  await newFile(p, ['']); await p.click('#btnKp123');
  ok(await p.$eval('#ed', e => e.getAttribute('inputmode')) === 'none', 'Keypad hides phone keyboard');
  await tapKeys(p, ['1', '1', '1', '+', '2', '2', '×', '3']);
  ok((await texts(p))[0] === today() && (await texts(p))[1] === '111+22×3' && (await results(p))[1] === '177', 'Empty file gets date; fast keypad taps', await texts(p));
  await tapKeys(p, ['⌫', '◀', '5', '⏎']);
  tx = await texts(p); ok(tx[1] === '111+225' && tx[2] === '×', 'Keypad ⌫ ◀ ⏎', tx);
  await p.click('.keypad-tab[data-tab="custom"]'); await tapKeys(p, ['📅 Today']);
  tx = await texts(p); ok(tx.includes(today()), 'Keypad "Today" key inserts date line', tx);
  await p.click('#btnKpABC');
  ok(await p.$eval('#ed', e => e.getAttribute('inputmode')) === 'text', 'ABC → phone keyboard');

  // 8. Save dialog with folders, sidebar, pin, trash
  await newFile(p, ['x 1', 'y 2', '']);
  await p.click('#tb-save'); await p.waitForSelector('.sheet.open input');
  ok(await p.textContent('.sheet h3') === 'Save file', 'Save shows "Save file" dialog');
  await p.fill('.sheet input[type=text]', 'Gopi hisab');
  await p.click('.sheet .chip:has-text("New folder")'); await p.fill('.sheet .chips input', 'Customers'); await p.click('.sheet .chips .chip:has-text("Add")');
  await p.click('.sheet .btn.ok'); await p.waitForTimeout(200);
  ok(await p.textContent('#headerName') === 'Gopi hisab' && (await p.textContent('#headerFolder')).includes('Customers'), 'Saved into a new folder', [await p.textContent('#headerName'), await p.textContent('#headerFolder')]);
  await p.click('#btnMenu'); await p.waitForTimeout(100);
  ok(await p.$('.folder:has-text("Customers")') !== null && await p.$('.file.in:has-text("Gopi hisab")') !== null, 'Folder with its file in sidebar');
  await p.click('.file:has-text("Gopi hisab") .file-more'); await p.click('.menu-item[data-key="pin"]'); await p.waitForTimeout(100);
  ok((await p.textContent('.file.in .file-title')).startsWith('📌'), 'Pin file');
  await p.click('#sideNewFolder'); await p.fill('.sheet input', 'Shop'); await p.click('.sheet .btn.ok'); await p.waitForTimeout(100);
  await p.click('.file:has-text("Gopi hisab") .file-more'); await p.click('.menu-item[data-key="move"]'); await p.click('.menu-item:has-text("Shop")'); await p.waitForTimeout(120);
  ok((await p.textContent('#headerFolder')).includes('Shop'), 'Move file to another folder');
  await p.click('.folder:has-text("Shop") .file-more'); await p.click('.menu-item[data-key="new"]'); await p.waitForTimeout(200);
  ok((await p.textContent('#headerFolder')).includes('Shop'), 'New file inside a folder');
  await p.click('#btnMenu'); await p.click('.file:has-text("Gopi hisab") .file-more'); await p.click('.menu-item[data-key="del"]'); await p.click('.sheet .btn.danger'); await p.waitForTimeout(200);
  ok(await p.textContent('#trashCount') === '1', 'Deleted file goes to recycle bin');
  if (!(await p.evaluate(() => Overlays.has('sidebar')))) await p.click('#btnMenu');
  await p.click('#sideTrash'); await p.click('.sheet [data-restore]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => state.files.some(f => f.title === 'Gopi hisab')), 'Restore from recycle bin');
  await p.evaluate(() => Sheet.close()); await p.waitForTimeout(300);

  // 9. Serial numbers toggle + settings
  await p.evaluate(() => ACTIONS.serial.run());
  ok(await p.evaluate(() => document.body.classList.contains('no-linenums')), 'Serial numbers off');
  await p.evaluate(() => ACTIONS.serial.run());
  await openSettingsPage(p);
  const root = await p.$$eval('.page[data-page="root"] .p-item', e => e.map(x => x.textContent));
  ok(['UI Settings', 'Date Settings', 'Share Settings', 'Features on / off', 'Check for update', 'Build version'].every(n => root.some(t => t.includes(n))), 'Settings pages', root.length);
  await p.click('[data-nav="dates"]'); await p.waitForTimeout(80);
  await p.click('.page[data-page="dates"] .p-chip[data-v="dd_mm_yyyy"]'); await closePages(p);
  await newFile(p, null); const d2 = (await texts(p))[0]; ok(/^\d\d\/\d\d\/\d{4}$/.test(d2), 'Date format setting', d2);
  await p.evaluate(() => setSetting('dateFormat', 'dmy_short'));
  await openSettingsPage(p, 'editor');
  await p.click('.page[data-page="editor"] label.p-item:has-text("Keyboard word suggestions") .slider');
  ok(await p.$eval('#ed', e => e.spellcheck) === false, 'Keyboard suggestions can be switched off');
  await p.click('.page[data-page="editor"] label.p-item:has-text("Keyboard word suggestions") .slider');
  await closePages(p);

  // 10. Share image: compact multi-column, sharp
  const many = []; for (let i = 1; i <= 100; i++) many.push(`name${i} ${i * 3}`); many.push('');
  await newFile(p, many);
  const dims = await p.evaluate(() => { const c = drawNoteImage({ cols: 'auto', size: 'L' }); return [c.width, c.height]; });
  ok(dims[1] / dims[0] < 1.6, '100 entries → multi-column image, not a long strip', dims);
  ok(dims[0] >= 1800, 'High resolution image', dims);
  const one = await p.evaluate(() => { const c = drawNoteImage({ cols: '1', size: 'L' }); return [c.width, c.height]; });
  ok(one[1] > one[0] * 3, 'Columns option respected (1 column is long)', one);
  await p.evaluate(() => shareImage()); await p.waitForTimeout(500);
  ok(await p.$eval('#sharePreview', i => i.naturalWidth > 0), 'Share preview shows');
  await p.click('#shareOpts button[data-opt="imgSize"][data-v="XL"]'); await p.waitForTimeout(400);
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnDownload')]); fs.copyFileSync(await dl.path(), path.join(OUT, 'share_100.png'));
  await p.evaluate(() => setSetting('imgSize', 'L'));
  await newFile(p, [today(), 'vfc 9', 'gns 13+27', 'sps 20', 'dlf 11', 'Milk 2 x 28', 'sum', '', 'suri 34+40+7', 'refund -50', '']);
  await p.evaluate(() => setTitle('Daily hisab'));
  await p.evaluate(() => shareImage()); await p.waitForTimeout(400);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnDownload')]); fs.copyFileSync(await dl.path(), path.join(OUT, 'share_small.png'));
  const txt = await p.evaluate(() => buildText('table'));
  ok(txt.startsWith('*Daily hisab*\n```') && /1 vfc 9\s+9/.test(txt) && /Total\s+1?[0-9,]+\n```$/.test(txt), 'Share as text = WhatsApp table', txt);

  // 11. In-app update check (GitHub release mocked)
  await p.evaluate(() => Updater.check(false)); await p.waitForTimeout(300);
  ok(await p.evaluate(() => Sheet.isOpen && document.querySelector('.sheet h3').textContent.includes('Update available')), 'Update available sheet');
  await p.evaluate(() => Sheet.close()); await p.waitForTimeout(300);
  fakeRelease = Object.assign({}, fakeRelease, { tag_name: 'v3.1.0-build0' });
  await p.evaluate(() => Updater.check(false)); await p.waitForTimeout(300);
  ok((await p.textContent('#toast')).includes('latest version'), 'Latest version message', await p.textContent('#toast'));

  // 12. Backup with folders → new device
  [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportBackup())]);
  const backup = fs.readFileSync(await dl.path(), 'utf8'); const bj = JSON.parse(backup);
  ok(bj.folders.length === 2 && bj.files.some(f => f.folder), 'Backup includes folders', bj.folders);
  ok(errors.length === 0, 'No JS errors (session 1)', errors);
  const ctx2 = await mk(); const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(e.message));
  await q.goto('https://app.local/'); await ready(q);
  await q.setInputFiles('#importInput', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await q.waitForSelector('.sheet.open .btn.ok'); await q.click('.sheet .btn.ok'); await q.waitForTimeout(600);
  ok(await q.evaluate(() => state.folders.length === 2 && state.files.filter(f => f.folder).length >= 2), 'Restore keeps folders', await q.evaluate(() => state.folders.map(f => f.name)));
  // app lock
  await openSettingsPage(q, 'security'); await q.click('.page[data-page="security"] label.p-item .slider');
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(600);
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(700);
  await closePages(q); await q.reload(); await q.waitForTimeout(500);
  ok(await q.evaluate(() => document.getElementById('lock').classList.contains('open')), 'Lock screen on start');
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(900);
  ok(await q.evaluate(() => !!window.__cnfReady), 'Correct PIN unlocks');
  ok(errs2.length === 0, 'No JS errors (session 2)', errs2);

  // 13. Screenshots
  await newFile(q, [today(), 'vfc 9', 'gns 13+27', 'sps 20', 'dlf 11', 'cm 38', 'kf 20', 'gopi 12+7', 'bsf 6', 'vsf 21', 'sfl 2', 'jkc 19', 'suri 34+40+7', 'aryan 11+3+4', '']);
  await q.click('#ed'); await q.keyboard.press('Control+End'); await q.keyboard.type('go'); await q.waitForTimeout(100);
  await q.screenshot({ path: path.join(OUT, 'main.png') });
  await q.evaluate(() => { ED.setSelectionRange(ED.value.indexOf('vfc'), ED.value.indexOf('dlf')); document.dispatchEvent(new Event('selectionchange')); });
  await q.screenshot({ path: path.join(OUT, 'selection.png') });
  await q.click('#btnKp123'); await q.waitForTimeout(150); await q.screenshot({ path: path.join(OUT, 'keypad.png') });
  await q.click('#btnKpClose'); await q.click('#btnMenu'); await q.waitForTimeout(350); await q.screenshot({ path: path.join(OUT, 'sidebar.png') });

  await browser.close();
  console.log(`\nPASS ${pass}  FAIL ${fail}`); fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
