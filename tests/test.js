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
const fmtNumNode = n => n.toLocaleString('en-IN');
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
  ok(dims[0] >= 1400 && dims[0] * dims[1] <= 6100000, 'Sharp but light image (fast to share)', dims);
  const one = await p.evaluate(() => { const c = drawNoteImage({ cols: '1', size: 'L' }); return [c.width, c.height]; });
  ok(one[1] > one[0] * 2.5, 'Columns option respected (1 column is long)', one);
  await p.evaluate(() => shareImage()); await p.waitForTimeout(500);
  ok(await p.$eval('#sharePreview', i => i.naturalWidth > 0), 'Share preview shows');
  await p.click('#shareOpts button[data-opt="imgSize"][data-v="XL"]'); await p.waitForTimeout(400);
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnDownload')]); fs.copyFileSync(await dl.path(), path.join(OUT, 'share_100.png'));
  await p.evaluate(() => setSetting('imgSize', 'L'));
  await newFile(p, [today(), 'vfc 9', 'gns 13+27', 'sps 20', 'dlf 11', 'Milk 2 x 28', 'sum', '', 'suri 34+40+7', 'refund -50', '']);
  await p.evaluate(() => setTitle('Daily hisab'));
  await p.evaluate(() => shareImage()); await p.waitForTimeout(400);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnDownload')]); fs.copyFileSync(await dl.path(), path.join(OUT, 'share_small.png'));
  ok(await p.evaluate(() => imageRows().find(r => r.type === 'item').text) === 'vfc 9', 'Image keeps the number after the item (vfc 9)');
  ok(await p.$eval('#mirror .ml.dl .dmark', e => getComputedStyle(e).backgroundColor) === 'rgb(255, 241, 118)' && await p.$eval('#mirror .ml.dl', e => getComputedStyle(e).textAlign) === 'center', 'Date centred with yellow highlighter');
  await p.evaluate(() => setSetting('dateHl', 'pink'));
  ok(await p.$eval('#mirror .ml.dl .dmark', e => getComputedStyle(e).backgroundColor) === 'rgb(248, 187, 208)', 'Highlighter colour can be changed');
  await p.evaluate(() => setSetting('dateHl', 'yellow'));
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

  // 14. Sheet tabs (like Excel): 30 tabs, slider, tap / swipe / keyboard, per-tab undo, persistence
  const tc = await mk(); const t = await tc.newPage(); const errs3 = [];
  t.on('pageerror', e => errs3.push(e.message)); t.on('console', m => { if (m.type() === 'error' && !/fetching the script/.test(m.text())) errs3.push(m.text()); });
  await t.goto('https://app.local/'); await ready(t);
  const cdp = await tc.newCDPSession(t);
  const swipe = async (x1, x2, y = 400, steps = 8, ms = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] });
    for (let k = 1; k <= steps; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * k / steps, y: y + k }] }); await t.waitForTimeout(ms); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await t.waitForTimeout(450);
  };
  const tabState = () => t.evaluate(() => ({ n: state.sheets.length, i: state.sheetIdx, names: state.sheets.map(s => s.name), dom: document.querySelectorAll('#tabs .tab').length, active: document.querySelector('#tabs .tab.active')?.dataset.i }));
  await newFile(t, ['a 10', 'b 20', '']);
  let ts = await tabState();
  ok(ts.n === 1 && ts.dom === 1 && ts.names[0] === 'Sheet 1' && await t.isVisible('#tabbar'), 'One tab in a new file, tab bar visible', ts);
  ok(await t.textContent('#tabs .tab.active .tt') === '30', 'Tab shows its total', await t.textContent('#tabs .tab.active .tt'));
  await t.click('#tabAdd'); await t.waitForTimeout(400);
  ts = await tabState();
  ok(ts.n === 2 && ts.i === 1 && ts.active === '1', 'Plus button adds and opens a new tab', ts);
  ok((await texts(t))[0] === today() && await total(t) === '0', 'New tab starts with today\'s date', await texts(t));
  await t.click('#ed'); await t.keyboard.press('Control+End'); await typeLines(t, ['x 5', 'y 7']); await t.waitForTimeout(150);
  ok(await total(t) === '12' && await t.textContent('#tabs .tab.active .tt') === '12', 'Active tab total updates live');
  // per-tab undo memory
  await t.click('#tabs .tab[data-i="0"]'); await t.waitForTimeout(400);
  ok((await texts(t)).join('|').startsWith('a 10|b 20') && await total(t) === '30', 'Tap a tab switches content', await texts(t));
  await t.click('#tabs .tab[data-i="1"]'); await t.waitForTimeout(400);
  await t.keyboard.press('Control+z'); await t.waitForTimeout(150);
  ok(!(await texts(t)).includes('y 7') && (await texts(t)).includes('x 5') || !(await texts(t)).includes('y 7'), 'Undo works per tab after switching', await texts(t));
  await t.keyboard.press('Control+y'); await t.waitForTimeout(150);
  ok((await texts(t)).includes('y 7'), 'Redo per tab', await texts(t));
  // 30 tabs + slider
  const t0 = Date.now();
  await t.evaluate(async () => { for (let k = 0; k < 28; k++) await addSheet({ text: `item${k} ${k + 1}\n` }); });
  ts = await tabState();
  ok(ts.n === 30 && ts.dom === 30 && ts.i === 29, '30 tabs created', ts);
  const bar = await t.evaluate(() => { const T = document.getElementById('tabs'); const a = T.querySelector('.tab.active').getBoundingClientRect(), r = T.getBoundingClientRect(); return { sw: T.scrollWidth, cw: T.clientWidth, vis: a.left >= r.left - 1 && a.right <= r.right + 1, h: document.body.scrollWidth <= innerWidth }; });
  ok(bar.sw > bar.cw * 3 && bar.vis && bar.h, 'Tab bar slides; active tab kept in view; page does not scroll sideways', bar);
  const sw0 = await t.evaluate(() => document.getElementById('tabs').scrollLeft);
  await t.evaluate(() => { document.getElementById('tabs').scrollLeft = 0; }); await t.waitForTimeout(100);
  ok(await t.evaluate(() => document.getElementById('tabs').scrollLeft) === 0 && sw0 > 0, 'Tab bar scrolls like a slider', sw0);
  // speed
  const speed = await t.evaluate(async () => { const s = performance.now(); for (let k = 0; k < 30; k++) await switchSheet((k * 7) % 30, { animate: false }); return (performance.now() - s) / 30; });
  ok(speed < 40, 'Switching tabs is fast (<40ms each)', speed.toFixed(1) + 'ms');
  console.log(`   tab switch ${speed.toFixed(1)}ms avg, 28 tabs added in ${Date.now() - t0}ms`);
  await t.evaluate(() => switchSheet(5, { animate: false })); await t.waitForTimeout(100);
  // swipe on the note
  await swipe(320, 80); ts = await tabState();
  ok(ts.i === 6 && ts.active === '6', 'Swipe left → next tab', ts);
  ok((await texts(t))[0] === 'item4 5', 'Swiped tab shows its own content', await texts(t));
  await swipe(80, 330); ts = await tabState();
  ok(ts.i === 5, 'Swipe right → previous tab', ts);
  await swipe(200, 170, 400, 4, 60); ts = await tabState();
  ok(ts.i === 5, 'Small slow swipe does not change tab', ts);
  await swipe(200, 205, 400, 6); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] }); for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + k, y: 300 + k * 40 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await t.waitForTimeout(300);
  ok((await tabState()).i === 5, 'Vertical scroll does not change tab');
  await t.evaluate(() => switchSheet(29, { animate: false })); await swipe(320, 60);
  ok((await tabState()).i === 29 && await t.evaluate(() => getComputedStyle(document.getElementById('note')).transform === 'none' || getComputedStyle(document.getElementById('note')).transform === 'matrix(1, 0, 0, 1, 0, 0)'), 'Swipe past the last tab bounces back');
  await t.click('#ed'); await t.keyboard.press('Control+PageUp'); await t.waitForTimeout(400);
  ok((await tabState()).i === 28, 'Ctrl+PageUp → previous tab');
  await t.keyboard.press('Control+PageDown'); await t.waitForTimeout(400);
  ok((await tabState()).i === 29, 'Ctrl+PageDown → next tab');
  // rename via tapping the active tab → menu
  await t.evaluate(() => switchSheet(1, { animate: false })); await t.waitForTimeout(150);
  await t.click('#tabs .tab.active'); await t.waitForSelector('.sheet.open .menu-item[data-key="rename"]');
  await t.waitForTimeout(400); await t.screenshot({ path: path.join(OUT, 'tab-menu.png') });
  await t.click('.menu-item[data-key="rename"]'); await t.waitForSelector('.sheet.open input'); await t.fill('.sheet.open input', 'Ramesh'); await t.click('.sheet .btn.ok'); await t.waitForTimeout(300);
  ok((await tabState()).names[1] === 'Ramesh' && await t.textContent('#tabs .tab.active .tn') === 'Ramesh', 'Rename tab', (await tabState()).names[1]);
  // colour
  await t.evaluate(() => { tabMenu(1); }); await t.waitForSelector('.menu-item[data-key="color"]'); await t.click('.menu-item[data-key="color"]'); await t.waitForTimeout(300); await t.click('.menu-item[data-key="green"]'); await t.waitForTimeout(250);
  ok(await t.evaluate(() => state.sheets[1].color === 'green' && document.querySelector('#tabs .tab[data-i="1"]').dataset.c === 'green'), 'Tab colour');
  // move & long-press drag reorder
  await t.evaluate(() => switchSheet(0, { animate: false })); await t.evaluate(() => { document.getElementById('tabs').scrollLeft = 0; }); await t.waitForTimeout(200);
  const r0 = await t.evaluate(() => { const b = document.querySelectorAll('#tabs .tab'); return [0, 2].map(k => { const r = b[k].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); });
  await t.mouse.move(...r0[0]); await t.mouse.down(); await t.waitForTimeout(560);
  for (let k = 1; k <= 10; k++) { await t.mouse.move(r0[0][0] + (r0[1][0] + 20 - r0[0][0]) * k / 10, r0[0][1]); await t.waitForTimeout(20); }
  await t.mouse.up(); await t.waitForTimeout(250);
  ts = await tabState();
  ok(ts.names[2] === 'Sheet 1' && ts.names[0] === 'Ramesh' && ts.i === 2, 'Long-press + drag reorders tabs (current tab follows)', ts.names.slice(0, 4));
  ok((await texts(t))[0] === 'a 10', 'Content stays with its tab after reorder', await texts(t));
  // delete + undo
  const before = (await tabState()).names.join();
  await t.evaluate(() => { deleteSheet(state.sheetIdx); }); await t.waitForSelector('.sheet.open .btn.danger'); await t.click('.sheet .btn.danger'); await t.waitForTimeout(300);
  ts = await tabState();
  ok(ts.n === 29 && !ts.names.includes('Sheet 1'), 'Delete tab', ts.n);
  await t.click('#toast .tact'); await t.waitForTimeout(350);
  ts = await tabState();
  ok(ts.n === 30 && ts.names.join() === before && (await texts(t))[0] === 'a 10', 'Undo delete restores the tab in place', ts.names.slice(0, 4));
  // picker with search + grand total
  const grand = await t.evaluate(() => grandTotal());
  ok(grand === 30 + 12 + Array.from({ length: 28 }, (_, k) => k + 1).reduce((a, b) => a + b, 0), 'Grand total of all tabs', grand);
  await t.click('#tabAll'); await t.waitForSelector('.sheet.open .tab-list');
  ok(await t.$$eval('.tab-list .ti', x => x.length) === 30, 'All-tabs list shows 30 tabs');
  await t.waitForTimeout(400); await t.screenshot({ path: path.join(OUT, 'tab-picker.png') });
  await t.fill('.sheet.open input', 'item17'); await t.waitForTimeout(100);
  ok(await t.$$eval('.tab-list .ti', x => x.length) === 1, 'Search inside tabs');
  await t.click('.tab-list .ti'); await t.waitForTimeout(500);
  ok((await texts(t))[0] === 'item17 18', 'Picker opens the tab', await texts(t));
  // all-tabs total mode
  await t.evaluate(() => { state.total.mode = 'alltabs'; render(); }); await t.waitForTimeout(80);
  ok(await total(t) === fmtNumNode(grand), 'Total mode "All tabs"', await total(t));
  await t.evaluate(() => { state.total.mode = 'sum'; render(); scheduleSave(); });
  // share image with tab name
  ok(await t.evaluate(async () => { const c = await drawNoteImage(); return c && c.width > 100; }), 'Share image for a tab');
  // persistence
  await t.evaluate(() => switchSheet(3, { animate: false })); await t.evaluate(() => flushSave()); await t.waitForTimeout(200);
  const snapNames = (await tabState()).names.join();
  await t.reload(); await ready(t); await t.waitForTimeout(300);
  ts = await tabState();
  ok(ts.n === 30 && ts.names.join() === snapNames && ts.i === 3 && ts.active === '3', 'Tabs, order and open tab survive restart', ts);
  ok(await t.evaluate(() => state.sheets[0].color === 'green'), 'Tab colour saved');
  await t.click('#btnMenu'); await t.waitForTimeout(350);
  ok((await t.textContent('#fileList')).includes('30 tabs'), 'File list shows tab count');
  await t.evaluate(() => closeSidebar()); await t.waitForTimeout(300);
  // backup → restore keeps tabs
  const bk = await t.evaluate(async () => { await flushSave(); const files = []; for (const m of state.files) files.push(await Store.get(m.id)); return JSON.stringify({ app: 'CalcNote', folders: state.folders, files }); });
  const t2c = await mk(); const t2 = await t2c.newPage(); await t2.goto('https://app.local/'); await ready(t2);
  t2.evaluate(txt => importBackupText(txt), bk); await t2.waitForSelector('.sheet.open .btn.ok'); await t2.click('.sheet .btn.ok'); await t2.waitForTimeout(800);
  const rid = await t2.evaluate(() => state.files.find(f => f.tabs === 30)?.id);
  ok(!!rid, 'Backup restore keeps all tabs');
  if (rid) { await t2.evaluate(id => openFile(id), rid); await t2.waitForTimeout(300); ok((await t2.evaluate(() => state.sheets.map(s => s.name).join())) === snapNames, 'Restored tab names', ''); }
  await t2c.close();
  // duplicate file keeps tabs
  await t.evaluate(() => duplicateFlow(state.fileId)); await t.waitForTimeout(500);
  ok(await t.evaluate(() => state.sheets.length === 30 && state.title.includes('(copy)')), 'Duplicate file keeps tabs');
  // settings toggles
  await t.evaluate(() => { settings.tabsEnabled = false; applySettings(); }); await t.waitForTimeout(80);
  ok(!(await t.isVisible('#tabbar')), 'Tabs can be turned off');
  await t.evaluate(() => { settings.tabsEnabled = true; settings.tabTotals = false; applySettings(); }); await t.waitForTimeout(80);
  ok(await t.isVisible('#tabbar') && !(await t.isVisible('#tabs .tab .tt')), 'Tab totals can be hidden');
  await t.evaluate(() => { settings.tabTotals = true; applySettings(); });
  // single-tab file: swipe does nothing, old files have one tab
  await newFile(t, ['q 1', '']); await swipe(320, 60);
  ok((await tabState()).n === 1 && (await texts(t))[0] === 'q 1', 'Swipe in a one-tab file is harmless');
  await t.evaluate(() => switchSheet(0)); await t.screenshot({ path: path.join(OUT, 'tabs.png') });
  await t.evaluate(() => openFile(state.files.find(f => f.tabs === 30 && !f.title.includes('copy')).id)); await t.waitForTimeout(2600);
  await t.screenshot({ path: path.join(OUT, 'tabs30.png') });
  ok(errs3.length === 0, 'No JS errors (tabs)', errs3);
  await tc.close();

  await browser.close();
  console.log(`\nPASS ${pass}  FAIL ${fail}`); fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
