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
const external = [];
async function setup(ctx) {
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host === 'app.local') {
      if (u.pathname === '/old') return r.fulfill({ body: OLD, contentType: 'text/html' });
      const f = path.join(DOCS, u.pathname === '/' ? 'index.html' : u.pathname);
      if (fs.existsSync(f)) return r.fulfill({ path: f });
      return r.fulfill({ status: 404, body: '' });
    }
    if (u.host === 'cdnjs.cloudflare.com') {
      if (u.pathname.endsWith('math.js')) return r.fulfill({ path: MATHJS, contentType: 'application/javascript' });
      if (u.pathname.endsWith('localforage.min.js')) return r.fulfill({ path: require.resolve('localforage/dist/localforage.min.js'), contentType: 'application/javascript' });
      return r.fulfill({ body: 'window.html2canvas=()=>{}', contentType: 'application/javascript' });
    }
    external.push(u.href); return r.abort();
  });
}
const texts = p => p.$$eval('.row', rs => rs.map(r => r.children[1].textContent));
const results = p => p.$$eval('.row', rs => rs.map(r => r.children[2].textContent));
const total = p => p.textContent('#totalValue');
const ready = p => p.waitForFunction(() => window.__cnfReady);
async function typeLines(p, lines) { for (const l of lines) { await p.keyboard.type(l); await p.keyboard.press('Enter'); } }
async function tapKeys(p, labels) { for (const l of labels) await p.click(`#keypadGrid .key[aria-label="${l}"]`); }
async function openSettingsPage(p, nav) { await p.evaluate(() => openSettings()); await p.waitForTimeout(80); if (nav) { await p.click(`.page[data-page="root"] [data-nav="${nav}"]`); await p.waitForTimeout(80); } }
async function closePages(p) { await p.evaluate(() => closeAllPages()); await p.waitForTimeout(350); }

(async () => {
  const browser = await chromium.launch();
  const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true, serviceWorkers: 'block' }); await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://app.local' }); await setup(c); return c; };
  const ctx = await mk();
  const clip = p => p.evaluate(() => navigator.clipboard.readText());

  // 0. data from the very first version still loads
  const old = await ctx.newPage(); await old.goto('https://app.local/old'); await old.waitForTimeout(800);
  await old.click('.line-editor'); await old.keyboard.type('500'); await old.keyboard.press('Enter'); await old.keyboard.type('250'); await old.waitForTimeout(1300); await old.close();

  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('https://app.local/'); await ready(p);
  ok(external.length === 0, 'Works offline (no external requests)', external);
  ok((await texts(p)).slice(0, 2).join() === '500,250' && await total(p) === '750', 'v1 notes migrate', await texts(p));
  ok(await p.textContent('#headerTitle') === 'CalcNote Freedom', 'App name in header');

  // 1. Engine
  const eng = await p.evaluate(() => {
    const O = engineOpts();
    const one = e => { const r = Engine.run([e], O).lines[0]; return r.kind === 'num' ? r.value : r.kind; };
    return [['x = 5', 5], ['Milk price 50', 50], ['rows 10', 10], ['10 + 5%', 10.5], ['log10(100)', 2], ['log(e)', 1], ['2500 + 18%', 2950], ['18% of 2500', 450],
      ['Bread: ₹45', 45], ['Rs 1,00,000', 100000], ['Eggs 12 x 6.5', 78], ['5 apples', 5], ['sin(30)', 0.5], ['√16', 4], ['5!', 120], ['10 mod 3', 1],
      ['3 × 4 ÷ 2 − 1', 5], ['7 =', 7], ['gopi 12+7', 19], ['suri 34+40+7', 81], ['aryan 11+3+4', 18], ['cm 38', 38], ['kf 20', 20]].map(([e, x]) => [e, one(e), x]);
  });
  eng.forEach(([e, g, x]) => ok(typeof g === 'number' && Math.abs(g - x) < 1e-9, `Engine: ${e} = ${x}`, g));
  const e2 = await p.evaluate(() => { const r = Engine.run(['Groceries:', 'Milk 2 × 28', 'Bread 45', 'sum', '', 'rent = 15000', 'rent * 12', 'line2 + line3', 'ans / 2', '// c 9', 'hello world', 'day', 'Buy e bike', '5 km to mile', '10/0', 'rent 700', 'rent + 1', 'x * 2', 'a = 3', 'a 4'], engineOpts()); return { l: r.lines.map(l => [l.kind, l.value, l.display, l.countable]), t: r.total }; });
  const L = e2.l;
  ok(L[0][0] === 'label' && L[3][1] === 101 && L[5][3] === false && L[6][1] === 180000 && L[7][1] === 101 && L[8][1] === 50.5, 'Headings, sum, variables, line refs, ans', L.slice(0, 9));
  ok(L[9][0] === 'comment' && L[10][0] === 'label' && L[11][0] === 'label' && L[12][0] === 'label', 'Text lines stay text', L.slice(9, 13));
  ok(L[13][0] === 'other' && /mile/.test(L[13][2]) && L[14][2] === '∞', 'Units and ∞', L.slice(13, 15));
  ok(L[15][1] === 700 && L[16][1] === 701 && L[17][0] === 'label' && L[19][1] === 4, 'Label vars, no half-evaluation', L.slice(15));
  const modes = await p.evaluate(() => ['avg', 'min', 'max', 'count', 'manual', 'formula'].map(m => Engine.run(['10', '20', '30', 'k = 2'], engineOpts({ total: { mode: m, manualValue: 7, formula: 'total * k + line1' } })).total));
  ok(JSON.stringify(modes) === '[20,10,30,3,7,130]', 'Total modes', modes);

  // 2. The user's real list (from screenshot) → total 528
  const userList = ['vfc 9', 'gns 13+27', 'sps 20', 'dlf 11', 'cm 38', 'kf 20', 'gopi 12+7', 'bsf 6', 'vsf 21', 'sfl 2', 'jkc 19', 'vdn 9', 'acs 7', 'jd 5+4', 'ts 9', 'jns 3', 'rfc 9', 'smt 4+2', 'gs 3+6', 'suri 34+40+7', 'rfs 25', 'aryan 11+3+4', 'sh 19', 'ksn 1', 'Manjeet 6', 'ysf 5+5', 'kps 5', ''];   // first 27 lines of the screenshot
  await p.evaluate(t => createFile('', t), userList); await p.waitForTimeout(100);
  ok(await total(p) === '431', 'User list (27 visible lines) total = 431', await total(p));
  const spans = await p.$eval('.row:nth-child(2) .line-editor', e => e.innerHTML);
  ok(/t-lbl">gns</.test(spans) && /t-op">\+</.test(spans), 'Syntax colours (label green, + orange)', spans);
  ok(await p.evaluate(() => document.body.classList.contains('divider') && document.body.classList.contains('align-left')), 'Divider + left results like CalcNote');
  await p.screenshot({ path: path.join(OUT, 'user_list.png') });

  // 3. Copy all
  await p.evaluate(() => copyAll('lines')); let c = await clip(p);
  ok(c.split('\n').length === 27 && c.startsWith('vfc 9\ngns 13+27'), 'Copy all – lines', c.slice(0, 40));
  await p.evaluate(() => copyAll('both')); c = await clip(p);
  ok(c.includes('gns 13+27 = 40'), 'Copy all – lines with results', c.slice(0, 60));
  await p.evaluate(() => copyAll('results')); c = await clip(p);
  ok(c.startsWith('9\n40\n20'), 'Copy all – results only', c.slice(0, 20));
  await p.evaluate(() => copyAll('report')); c = await clip(p);
  ok(c.includes('Total: 431'), 'Copy all – report', c.slice(-30));
  await p.click('#btnMenu'); await p.click('#sideActions [data-action="copy"]'); await p.click('.menu-item[data-key="lines"]');
  ok((await clip(p)).startsWith('vfc 9'), 'Sidebar → Copy all menu');
  await p.click('.row:nth-child(3) .line-editor'); await p.keyboard.press('Control+a'); await p.keyboard.press('Control+a');
  ok((await clip(p)).startsWith('vfc 9'), 'Ctrl+A twice copies whole note');
  // copy a selection spanning lines
  await p.evaluate(() => { document.activeElement.blur(); const rs = document.querySelectorAll('.line-editor'); const r = document.createRange(); r.setStart(rs[0], 0); r.setEnd(rs[2], rs[2].childNodes.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p.keyboard.press('Control+c'); const multi = await clip(p);
  ok(multi === 'vfc 9\ngns 13+27\nsps 20', 'Drag-select across lines copies with line breaks', multi);
  // Edit as text
  await p.evaluate(() => editAsText()); await p.waitForTimeout(80);
  const taVal = await p.$eval('.sheet textarea.bulk', t => t.value);
  ok(taVal.split('\n').length === 27, 'Edit as text shows all lines', taVal.length);
  await p.$eval('.sheet textarea.bulk', t => { t.value = t.value + '\nnew 100'; });
  await p.click('.sheet .btn.ok'); await p.waitForTimeout(100);
  ok(await total(p) === '531', 'Edit as text → apply', await total(p));
  await p.click('#tb-undo'); ok(await total(p) === '431', 'Undo after text edit', await total(p));

  // 4. Select mode
  const numBox = await (await p.$('.row:nth-child(1) .line-num')).boundingBox();
  await p.mouse.move(numBox.x + 5, numBox.y + 5); await p.mouse.down(); await p.waitForTimeout(600); await p.mouse.up();
  ok(await p.evaluate(() => document.body.classList.contains('selecting')), 'Long-press line number → select mode');
  await p.click('.row:nth-child(2) .line-editor'); await p.click('.row:nth-child(3) .line-num');
  ok(await p.textContent('#selCount') === '3 selected', 'Select 3 lines', await p.textContent('#selCount'));
  await p.click('#selCopy'); ok((await clip(p)) === 'vfc 9\ngns 13+27\nsps 20', 'Copy selected lines', await clip(p));
  await p.evaluate(() => startSelect()); await p.click('.row:nth-child(1) .line-num'); await p.click('#selDelete');
  ok((await texts(p))[0] === 'gns 13+27' && await total(p) === '422', 'Delete selected line', await total(p));
  await p.click('#tb-undo'); ok(await total(p) === '431', 'Undo delete');

  // 5. Typing / editing basics
  await p.evaluate(() => createFile('')); await p.click('.line-editor');
  await typeLines(p, ['Milk 2 x 28', 'Rent: 5000', 'x = 5', 'x * 3']);
  ok(JSON.stringify(await results(p)) === JSON.stringify(['56', '5,000', '5', '15', '']) && await total(p) === '5,071', 'Typing + results', await results(p));
  await p.click('.row:nth-child(2) .line-editor'); await p.keyboard.press('End'); for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('Enter'); let tx = await texts(p);
  ok(tx[1] === 'Rent: ' && tx[2] === '5000', 'Enter splits', tx);
  await p.keyboard.press('Backspace'); tx = await texts(p); ok(tx[1] === 'Rent: 5000' && tx.length === 5, 'Backspace merges', tx);
  await p.evaluate(() => { const ed = document.querySelector('.row:nth-child(5) .line-editor'); ed.focus(); const dt = new DataTransfer(); dt.setData('text/plain', '100\n200\n300'); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  ok((await texts(p)).slice(4, 7).join('|') === '100|200|300', 'Multi-line paste');
  await p.click('.row:nth-child(1) .line-result'); ok((await clip(p)) === '56', 'Tap answer copies');
  await p.waitForTimeout(500);

  // 6. Save dialog for an untitled file (like CalcNote)
  await p.click('#tb-save'); await p.waitForSelector('.sheet.open input');
  ok(await p.textContent('.sheet h3') === 'Save file', 'Save shows "Save file" dialog');
  await p.fill('.sheet input', 'Hisab'); await p.click('.sheet .btn.ok'); await p.waitForTimeout(200);
  ok(await p.textContent('#headerTitle') === 'Hisab', 'Saved with file name');
  await p.click('#tb-save'); await p.waitForTimeout(150);
  ok(!(await p.evaluate(() => Sheet.isOpen)), 'Second save does not ask again');
  await p.click('#tb-new'); await p.waitForTimeout(200);
  ok(await p.textContent('#headerTitle') === 'CalcNote Freedom' && (await texts(p)).join('') === '', '＋ creates a new file');
  await p.keyboard.type('999');
  await p.click('#btnMenu'); await p.click('.file:has-text("Hisab") .file-info'); await p.waitForTimeout(250);
  await p.click('#btnMenu'); await p.click('.file:has-text("Untitled") >> nth=0'); await p.waitForTimeout(250);
  ok((await texts(p))[0] === '999', 'Fast file switching keeps edits', await texts(p));

  // 7. Keypad + custom keys
  await p.click('#btnKp123');
  ok(await p.$eval('.line-editor', e => e.getAttribute('inputmode')) === 'none', 'Keypad hides phone keyboard');
  await p.evaluate(() => { const r = document.querySelectorAll('.line-editor'); setCaret(r[r.length - 1], 0); });
  await tapKeys(p, ['1', '1', '1', '+', '2', '2', '×', '3']);
  tx = await texts(p); ok(tx[tx.length - 1] === '111+22×3', 'Fast keypad taps', tx);
  await tapKeys(p, ['⌫', '◀', '5', '⏎']);
  tx = await texts(p); ok(tx[tx.length - 2] === '111+225' && tx[tx.length - 1] === '×', 'Keypad ⌫ ◀ 5 ⏎ (split at cursor)', tx);
  await p.click('.keypad-tab[data-tab="custom"]');
  await tapKeys(p, ['＋ Add key']); await p.waitForSelector('.sheet.open input');
  const ins = await p.$$('.sheet input'); await ins[0].fill('GST'); await ins[1].fill(' * 1.18'); await p.click('.sheet .btn.ok');
  await p.waitForTimeout(100);
  await tapKeys(p, ['0', '0']).catch(() => {});
  await p.click('.keypad-tab[data-tab="basic"]'); await tapKeys(p, ['1', '0', '0']); await p.click('.keypad-tab[data-tab="custom"]'); await tapKeys(p, ['GST']);
  tx = await texts(p); const lastLine = tx.filter(Boolean).pop();
  ok(/100 \* 1\.18$/.test(lastLine), 'Custom key inserts text', lastLine);
  await tapKeys(p, ['round']); tx = await texts(p);
  ok(await p.evaluate(() => { const ed = state.active; return ed.textContent.includes('round(, 2)') && selOffsets(ed).start === ed.textContent.indexOf('round(') + 6; }), 'Custom key {c} cursor marker');
  await p.click('#btnKpABC');

  // 8. Settings pages & customisation
  await openSettingsPage(p);
  const rootItems = await p.$$eval('.page[data-page="root"] .p-item', e => e.map(x => x.textContent));
  ok(['UI Settings', 'Calculation Settings', 'Editor Settings', 'Keypad Settings', 'Appearance Settings', 'User extensions', 'Security', 'Import/Export Settings', 'File backup/restore', 'Privacy policy', 'Build version'].every(n => rootItems.some(t => t.includes(n))), 'Settings categories like CalcNote', rootItems);
  await p.click('[data-nav="ui"]'); await p.waitForTimeout(100);
  await p.click('[data-list="toolbar"] .list-row:has-text("Copy all") .slider');
  ok(await p.$('#tb-copy') !== null, 'Toolbar: add Copy all button');
  await p.click('[data-list="toolbar"] .list-row:has-text("Copy all") .mini'); // move up
  const tbOrder = await p.$$eval('#toolbar .icon-btn', b => b.map(x => x.id));
  ok(tbOrder.indexOf('tb-copy') < tbOrder.indexOf('tb-settings'), 'Toolbar reorder', tbOrder);
  await p.click('.page[data-page="ui"] .p-chip[data-key="resultAlign"][data-v="right"]');
  ok(!(await p.evaluate(() => document.body.classList.contains('align-left'))), 'Result alignment right');
  await p.click('.page[data-page="ui"] .p-chip[data-key="resultAlign"][data-v="left"]');
  await p.click('.page[data-page="ui"] label.p-item:has-text("Show line numbers") .slider');
  ok(await p.evaluate(() => document.body.classList.contains('no-linenums')), 'Hide line numbers');
  await p.click('.page[data-page="ui"] label.p-item:has-text("Show line numbers") .slider');
  await p.goBack(); await p.waitForTimeout(450);
  ok(await p.$('.page[data-page="ui"]') === null && await p.$('.page[data-page="root"].open') !== null, 'Back button closes sub-page only');
  await p.click('[data-nav="features"]'); await p.waitForTimeout(100);
  await p.click('.page[data-page="features"] label.p-item:has-text("Calculator keypad") .slider');
  ok(await p.evaluate(() => document.body.classList.contains('no-keypad')), 'Feature off: keypad hidden');
  await p.click('.page[data-page="features"] label.p-item:has-text("Calculator keypad") .slider');
  await p.click('.page[data-page="features"] label.p-item:has-text("Unit conversion") .slider');
  ok(await p.evaluate(() => Engine.run(['5 km to mile'], engineOpts()).lines[0].kind) !== 'other', 'Feature off: units');
  await p.click('.page[data-page="features"] label.p-item:has-text("Unit conversion") .slider');
  await p.click('.page[data-page="features"] label.p-item:has-text("Tap an answer") .slider');
  await closePages(p);
  await p.evaluate(() => navigator.clipboard.writeText('x'));
  await p.click('.row:nth-child(1) .line-result'); ok((await clip(p)) === 'x', 'Feature off: tap-to-copy');
  await openSettingsPage(p, 'features'); await p.click('.page[data-page="features"] label.p-item:has-text("Tap an answer") .slider'); await closePages(p);

  await openSettingsPage(p, 'appearance');
  await p.click('.page[data-page="appearance"] .swatch[data-v="blue"]');
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()) === '#42A5F5', 'Accent colour');
  await p.click('.page[data-page="appearance"] .p-chip[data-v="dark"]');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Dark theme');
  await p.screenshot({ path: path.join(OUT, 'settings_appearance.png') });
  await p.click('.page[data-page="appearance"] .p-chip[data-v="light"]'); await p.click('.page[data-page="appearance"] .swatch[data-v="green"]');
  await closePages(p);

  await openSettingsPage(p, 'editor');
  await p.$eval('.page[data-page="editor"] input[type=range]', e => { e.value = 24; e.dispatchEvent(new Event('input', { bubbles: true })); });
  ok(await p.$eval('.line-editor', e => getComputedStyle(e).fontSize) === '24px', 'Font size');
  await p.click('.page[data-page="editor"] label.p-item:has-text("Italic") .slider');
  ok(await p.$eval('.line-editor', e => getComputedStyle(e).fontStyle) === 'italic', 'Italic text');
  await p.click('.page[data-page="editor"] .swatch[data-v="red"]');
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--op').trim()) === '#E53935', 'Operator colour');
  await closePages(p);

  await openSettingsPage(p, 'calc');
  await p.click('.page[data-page="calc"] .p-chip[data-key="numFormat"][data-v="eu"]');
  await p.evaluate(() => createFile('', ['1234567.5', ''])); await p.waitForTimeout(80);
  ok((await results(p))[0] === '1.234.567,5', 'EU number format', await results(p));
  await p.click('.page[data-page="calc"] .p-chip[data-key="numFormat"][data-v="in"]');
  ok((await results(p))[0] === '12,34,567.5', 'Indian number format', await results(p));
  await closePages(p);

  // 9. Extensions + custom CSS
  await openSettingsPage(p, 'extensions');
  await p.fill('.page[data-page="extensions"] textarea[data-key="extensions"]', 'gst(x) = x * 1.18\nusd = 83.5\nbad = = 2');
  await p.waitForTimeout(600);
  const extNotes = await p.$$eval('.page[data-page="extensions"] .p-note.ok, .page[data-page="extensions"] .p-note.err', e => e.map(x => x.textContent));
  ok(extNotes.length === 3 && extNotes[2].includes('✗'), 'Extension line check', extNotes);
  await p.fill('.page[data-page="extensions"] textarea[data-key="customCss"]', '.line-editor{letter-spacing:3px}'); await p.waitForTimeout(600);
  await closePages(p);
  await p.evaluate(() => createFile('', ['gst(100)', '10 usd', 'price 50 + gst(50)', '']));
  ok(JSON.stringify((await results(p)).slice(0, 3)) === JSON.stringify(['118', '835', '109']), 'User functions/constants work', await results(p));
  ok(await p.$eval('.line-editor', e => getComputedStyle(e).letterSpacing) === '3px', 'Custom CSS applied');

  // 10. Settings export/import
  let [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportSettings())]);
  const settingsFile = fs.readFileSync(await dl.path(), 'utf8');
  ok(JSON.parse(settingsFile).settings.extensions.includes('gst') && !settingsFile.includes('pinHash'), 'Export settings (no PIN inside)');

  // 11. Exports
  await p.evaluate(() => createFile('Export test', ['Milk 2 × 28', 'Bread, "fresh" 45', 'sum', '']));
  [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportCsv())]);
  const csv = fs.readFileSync(await dl.path(), 'utf8'); ok(csv.includes('"Bread, ""fresh"" 45",45') && csv.includes('Total,101'), 'CSV export', csv);
  await p.evaluate(() => shareText()); ok((await clip(p)).includes('Milk 2 × 28 = 56'), 'Share as text');
  await p.evaluate(() => shareImage()); await p.waitForTimeout(400);
  const img = await p.$eval('#sharePreview', i => [i.naturalWidth, i.naturalHeight]); ok(img[0] === 1080 && img[1] > 400, 'Share as image', img);
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnDownload')]); fs.copyFileSync(await dl.path(), path.join(OUT, 'share.png'));
  [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportBackup())]);
  const backup = fs.readFileSync(await dl.path(), 'utf8'); ok(JSON.parse(backup).files.length >= 6, 'Backup export', JSON.parse(backup).files.length);

  // 12. Persistence + back button
  await p.evaluate(() => flushSave()); await p.waitForTimeout(300);
  await p.reload(); await ready(p);
  ok(await p.textContent('#headerTitle') === 'Export test' && await total(p) === '101', 'Reload keeps file');
  ok(await p.$('#tb-copy') !== null && await p.$eval('.line-editor', e => getComputedStyle(e).fontStyle) === 'italic', 'Settings remembered after reload');
  const url0 = p.url(); await p.click('#btnMenu'); await p.waitForTimeout(100); await p.goBack(); await p.waitForTimeout(250);
  ok(!(await p.evaluate(() => Overlays.has('sidebar'))) && p.url() === url0, 'Back closes sidebar');
  ok(errors.length === 0, 'No JS errors (session 1)', errors);

  // 13. Fresh device: import backup + settings, app lock
  const ctx2 = await mk(); const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(e.message));
  await q.goto('https://app.local/'); await ready(q);
  await q.setInputFiles('#importInput', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await q.waitForSelector('.sheet.open .btn.ok'); await q.click('.sheet .btn.ok'); await q.waitForTimeout(500);
  ok(await q.evaluate(() => state.files.length) === JSON.parse(backup).files.length + 1, 'Restore backup on new device');
  await q.setInputFiles('#importSettingsInput', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(settingsFile) }); await q.waitForTimeout(300);
  ok(await q.$('#tb-copy') !== null && await q.evaluate(() => settings.extensions.includes('gst')), 'Import settings on new device');
  // app lock
  await openSettingsPage(q, 'security');
  await q.click('.page[data-page="security"] label.p-item .slider');
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(600);
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(700);
  ok(await q.evaluate(() => settings.lock && !!settings.pinHash), 'App lock enabled');
  await closePages(q); await q.waitForTimeout(200);
  await q.reload(); await q.waitForTimeout(500);
  ok(await q.evaluate(() => document.getElementById('lock').classList.contains('open')), 'Lock screen on start');
  for (const d of '1111') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(900);
  ok((await q.textContent('#lockMsg')).includes('Wrong'), 'Wrong PIN rejected');
  for (const d of '1234') await q.click(`#lockPad button:text-is("${d}")`); await q.waitForTimeout(900);
  ok(!(await q.evaluate(() => document.getElementById('lock').classList.contains('open'))) && await q.evaluate(() => !!window.__cnfReady), 'Correct PIN unlocks');
  ok(errs2.length === 0, 'No JS errors (session 2)', errs2);

  // 14. Screenshots for review
  await q.evaluate(t => createFile('', t), userList); await q.waitForTimeout(150);
  await q.screenshot({ path: path.join(OUT, 'main.png') });
  await q.click('#btnKp123'); await q.waitForTimeout(150); await q.screenshot({ path: path.join(OUT, 'keypad.png') });
  await q.click('.keypad-tab[data-tab="custom"]'); await q.screenshot({ path: path.join(OUT, 'mykeys.png') });
  await q.click('#btnKpClose'); await openSettingsPage(q); await q.waitForTimeout(300); await q.screenshot({ path: path.join(OUT, 'settings.png') });
  await q.click('[data-nav="ui"]'); await q.waitForTimeout(300); await q.screenshot({ path: path.join(OUT, 'settings_ui.png') });
  await closePages(q); await q.click('#btnMenu'); await q.waitForTimeout(350); await q.screenshot({ path: path.join(OUT, 'sidebar.png') });

  await browser.close();
  console.log(`\nPASS ${pass}  FAIL ${fail}`); fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
