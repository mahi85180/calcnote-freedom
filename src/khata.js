/* =====================================================================
   KHATA BOOK – party accounts that fill themselves from the notes.
   A line like "gopi 12+7" (in a tab with khata on) becomes a DRAFT entry
   for Gopi's khata. Nothing is posted or sent until "Publish" is pressed;
   then the changes since the last publish go into the khata and the
   messages (SMS / WhatsApp) are sent.
   Sign rule (like Khatabook): balance > 0 → you will GET (red),
   balance < 0 → you have to GIVE (green).
   ===================================================================== */
const KH_DEFAULT_REASONS = [
  { id: 'udhaar', name: 'Udhaar', effect: 'gave', color: 'red' },
  { id: 'jama', name: 'Jama', effect: 'got', color: 'green' },
  { id: 'nagad', name: 'Nagad', effect: 'none', color: 'blue' },
  { id: 'cashsale', name: 'Cash sale', effect: 'none', color: 'teal' },
  { id: 'kharcha', name: 'Kharcha', effect: 'none', color: 'orange' }
];
const KH_COLORS = { red: '#C62828', green: '#1B7F4B', blue: '#1565C0', teal: '#00796B', orange: '#E65100', purple: '#6A1B9A', pink: '#AD1457', grey: '#616161', brown: '#6D4C41' };
const KH_EFFECTS = { gave: 'Baaki badhe (aapne diye)', got: 'Baaki ghate (aapko mile)', none: 'Sirf record (baaki par asar nahi)' };
const KH_LANG = {
  hinglish: {
    tpl: 'Namaste {naam} ji,\n{entries}\n{baaki}\n– {dukaan}',
    get: 'Aapka baaki: {amt}', give: 'Humein aapko dene hain: {amt}', clear: 'Hisaab barabar ✓',
    changed: 'badla', removed: 'cancel', remind: 'Namaste {naam} ji,\n{baaki}\nKripya jaldi jama karein 🙏\n– {dukaan}'
  },
  hindi: {
    tpl: 'नमस्ते {naam} जी,\n{entries}\n{baaki}\n– {dukaan}',
    get: 'आपका बाकी: {amt}', give: 'हमें आपको देने हैं: {amt}', clear: 'हिसाब बराबर ✓',
    changed: 'बदला', removed: 'रद्द', remind: 'नमस्ते {naam} जी,\n{baaki}\nकृपया जल्द जमा करें 🙏\n– {dukaan}'
  },
  english: {
    tpl: 'Hello {naam},\n{entries}\n{baaki}\n– {dukaan}',
    get: 'Your balance: {amt}', give: 'We owe you: {amt}', clear: 'All settled ✓',
    changed: 'changed', removed: 'cancelled', remind: 'Hello {naam},\n{baaki}\nPlease pay at the earliest 🙏\n– {dukaan}'
  }
};

const KH = { data: null, loading: null, ver: 0, maps: null, mapsVer: -1, calcCache: new Map(), last: null, countT: null };

/* ---------------- storage ---------------- */
function khNormalize(d) {
  d = d && typeof d === 'object' ? d : {};
  const reasons = Array.isArray(d.reasons) && d.reasons.length ? d.reasons.filter(r => r && r.id && r.name) : [];
  return {
    v: 1,
    parties: Array.isArray(d.parties) ? d.parties.filter(p => p && p.id && p.name) : [],
    entries: Array.isArray(d.entries) ? d.entries.filter(e => e && e.id && e.partyId) : [],
    reasons: reasons.length ? reasons : JSON.parse(JSON.stringify(KH_DEFAULT_REASONS)),
    ignore: Array.isArray(d.ignore) ? d.ignore.filter(Boolean) : [],
    pub: d.pub && typeof d.pub === 'object' ? d.pub : {}
  };
}
function khLoad() {
  if (KH.data) return Promise.resolve(KH.data);
  if (!KH.loading) KH.loading = Store.get('khata').then(d => { KH.data = khNormalize(d); KH.ver++; return KH.data; }).catch(() => { KH.data = khNormalize(null); return KH.data; });
  return KH.loading;
}
let khSaving = Promise.resolve();
function khSave() {
  KH.ver++;
  const snap = KH.data;
  khSaving = khSaving.then(() => Store.set('khata', snap)).catch(e => { console.error(e); toast('Khata save nahi hua – dobara koshish karein'); });
  khAfterChange();
  return khSaving;
}
function khAfterChange() { if (typeof render === 'function' && state.fileId) queueRender(); khScheduleCount(); refreshKhataPages(); }
function refreshKhataPages() { $$('#pages .page.kpage').forEach(pg => renderPage(pg, pg.dataset.page, true)); }

/* ---------------- small helpers ---------------- */
const khRound = v => Math.round((+v + Number.EPSILON) * 100) / 100;
const khMoney = v => '₹' + fmtNum(khRound(Math.abs(v)));
const khNorm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const khToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const khISODay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const khDate = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : new Date(); };
const khShortDate = iso => { const d = khDate(iso); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]}`; };
const khLongDate = iso => { const d = khDate(iso); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function khDayHead(iso) {
  const t = khToday(); const y = new Date(); y.setDate(y.getDate() - 1);
  return khLongDate(iso) + (iso === t ? ' · Aaj' : iso === khISODay(y) ? ' · Kal' : '');
}
function khAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' din pehle';
  return khLongDate(String(iso).slice(0, 10));
}
const khTime = iso => { if (!iso) return ''; const d = new Date(iso); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad2(d.getMinutes())} ${ap}`; };
function khInitials(name) { const w = String(name || '?').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
function khPhone(p) {                                             // for WhatsApp: country code, digits only
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}
const khHasPhone = p => String(p || '').replace(/\D/g, '').length >= 10;
function khLev(a, b) {                                            // edit distance, small strings only
  if (Math.abs(a.length - b.length) > 2) return 9;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = tmp; }
  }
  return prev[b.length];
}

/* ---------------- parties & entries ---------------- */
function khMaps() {
  if (KH.maps && KH.mapsVer === KH.ver) return KH.maps;
  const D = KH.data || khNormalize(null);
  const names = new Map(), byId = new Map(), bal = new Map(), byFile = new Map(), last = new Map(), reasons = new Map();
  for (const r of D.reasons) reasons.set(r.id, r);
  for (const p of D.parties) {
    byId.set(p.id, p); bal.set(p.id, khRound(+p.opening || 0)); last.set(p.id, p.updatedAt || p.createdAt || '');
    for (const n of [p.name, ...(p.aliases || [])]) { const k = khNorm(n); if (k && !names.has(k)) names.set(k, p); }
  }
  for (const e of D.entries) {
    if (e.deleted) continue;
    if (e.effect === 'gave') bal.set(e.partyId, khRound((bal.get(e.partyId) || 0) + e.amount));
    else if (e.effect === 'got') bal.set(e.partyId, khRound((bal.get(e.partyId) || 0) - e.amount));
    const t = e.updatedAt || e.createdAt || ''; if (t > (last.get(e.partyId) || '')) last.set(e.partyId, t);
    if (e.src && e.src.fileId) { let a = byFile.get(e.src.fileId); if (!a) byFile.set(e.src.fileId, a = []); a.push(e); }
  }
  KH.maps = { names, byId, bal, byFile, last, reasons }; KH.mapsVer = KH.ver;
  return KH.maps;
}
const khParty = id => khMaps().byId.get(id) || null;
const khBalance = id => khMaps().bal.get(id) || 0;
const khReason = id => khMaps().reasons.get(id) || null;
function khReasonOf(e) { const r = khReason(e.reason); return { name: r ? r.name : (e.reasonName || 'Entry'), color: KH_COLORS[(r && r.color) || ''] || '#616161' }; }
function khResolve(name) {
  const k = khNorm(name); if (!k) return null;
  const m = khMaps().names; const hit = m.get(k); if (hit) return hit;
  const w = k.split(' ');                                         // "gopi paid in cash" → gopi
  for (let n = w.length - 1; n >= 1; n--) { const p = m.get(w.slice(0, n).join(' ')); if (p) return p; }
  return null;
}
function khIgnored(name) { const k = khNorm(name); if (!k) return false; const ig = KH.data ? KH.data.ignore : []; if (ig.includes(k)) return true; const w = k.split(' '); return w.length > 1 && !khResolve(name) && ig.includes(w[0]); }
function khSuggest(name, max = 4) {
  const k = khNorm(name); if (!k) return [];
  const out = [];
  for (const p of (KH.data ? KH.data.parties : [])) {
    let best = 9;
    for (const n of [p.name, ...(p.aliases || [])]) {
      const m = khNorm(n); if (!m) continue;
      let s = khLev(k, m);
      if (s > 2 && k.length >= 3 && (m.startsWith(k) || k.startsWith(m) || m.split(' ').includes(k) || k.split(' ').includes(m))) s = 2;
      best = Math.min(best, s);
    }
    if (best <= (k.length <= 3 ? 1 : 2)) out.push([best, p]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, max).map(x => x[1]);
}
function khPartyEntries(pid) { return (KH.data ? KH.data.entries : []).filter(e => e.partyId === pid && !e.deleted).sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || ''))); }
function khWithRunning(list, pid) {                               // oldest → newest, with balance after each entry
  const p = khParty(pid); let run = khRound(p ? +p.opening || 0 : 0);
  return list.map(e => { if (e.effect === 'gave') run = khRound(run + e.amount); else if (e.effect === 'got') run = khRound(run - e.amount); return { e, run }; });
}
function khNameTaken(names, exceptId) {
  for (const n of names) { const k = khNorm(n); if (!k) continue; const p = khMaps().names.get(k); if (p && p.id !== exceptId) return { name: n, party: p }; }
  return null;
}
async function khUpsertParty(data, id) {
  await khLoad();
  const now = new Date().toISOString();
  if (id) {
    const p = khParty(id); if (!p) return null;
    if (data.name && khNorm(data.name) !== khNorm(p.name)) {               // renamed: the old name keeps working in the notes
      const al = (data.aliases || p.aliases || []).slice(); if (!al.some(a => khNorm(a) === khNorm(p.name))) al.push(p.name); data.aliases = al;
    }
    Object.assign(p, data, { updatedAt: now }); await khSave(); return p;
  }
  const p = Object.assign({ id: newId('kp_'), name: '', phone: '', type: 'customer', aliases: [], opening: 0, channel: '', note: '', createdAt: now, updatedAt: now }, data);
  KH.data.parties.push(p);
  // a new khata name is no longer "ignored"
  const keys = [p.name, ...(p.aliases || [])].map(khNorm); KH.data.ignore = KH.data.ignore.filter(k => !keys.includes(k));
  await khSave(); return p;
}

/* ---------------- tab settings & formula ---------------- */
function khCfg(sh) { return Object.assign({ on: true, reason: settings.khataReason || 'udhaar', formula: 'x', round: false }, (sh && sh.khata) || {}); }
const khFormulaCache = new Map();
function khApplyFormula(formula, x) {
  const f = String(formula || '').trim();
  if (!f || f === 'x') return x;
  let c = khFormulaCache.get(f);
  if (c === undefined) {
    try { c = math.compile(f.replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/(\d),(?=\d{2,3}\b)/g, '$1')); } catch (e) { c = null; }
    if (khFormulaCache.size > 200) khFormulaCache.clear(); khFormulaCache.set(f, c);
  }
  if (!c) return NaN;
  try { const v = c.evaluate({ x, value: x, X: x }); return typeof v === 'number' ? v : (v && typeof v.toNumber === 'function' ? v.toNumber() : NaN); } catch (e) { return NaN; }
}
function khFormulaOk(formula) { const v = khApplyFormula(formula, 7); return Number.isFinite(v); }
function khTag(raw) { const m = String(raw || '').replace(/(^|\s)\/\/.*$/, '').match(/(?:^|\s)#([^\s#\d][^\s#]*)/); return m ? m[1] : ''; }
function khFindReason(tag) {
  const t = khNorm(tag); if (!t) return null;
  const rs = KH.data ? KH.data.reasons : [];
  return rs.find(r => r.id === t || khNorm(r.name) === t) || rs.find(r => khNorm(r.name).replace(/ /g, '').startsWith(t.replace(/ /g, ''))) || null;
}

/* ---------------- reading the notes ---------------- */
function khCalc(text) {
  const key = text + '\u0000' + settings.angle + settings.extensions + settings.labelVars + settings.excludeAssign + settings.sumKeyword + settings.units + settings.xMultiply + settings.currency;
  let r = KH.calcCache.get(key);
  if (r) { KH.calcCache.delete(key); KH.calcCache.set(key, r); return r; }      // most recently used goes last
  r = Engine.run(text.split('\n'), engineOpts());
  KH.calcCache.set(key, r); while (KH.calcCache.size > 400) KH.calcCache.delete(KH.calcCache.keys().next().value);
  return r;
}
function khFallbackDate() { const f = state.files.find(x => x.id === state.fileId); return f && f.createdAt ? khISODay(new Date(f.createdAt)) : khToday(); }
/* every entry line of one tab → item (or null) */
function khSheetItems(sh, texts, calc) {
  if (!sh.khata) sh.khata = { on: true, reason: settings.khataReason || 'udhaar', formula: 'x', round: false };   // fixed once, so later default changes never rewrite old tabs
  const cfg = khCfg(sh); if (!cfg.on) return [];
  const fallback = khFallbackDate(); let date = fallback;
  const out = [];
  texts.forEach((raw, i) => {
    const l = calc.lines[i]; if (!l) return;
    if (l.kind === 'date') { const d = parseDateLine(raw); date = d ? khISODay(d) : fallback; return; }
    if (l.kind !== 'num' || l.agg || l.assign || !l.label) return;
    const label = l.label.trim(); if (!label || /^(line|row)\d+$/i.test(label)) return;
    const it = { i, sheetId: sh.id, sheetName: sh.name, label, key: khNorm(label), raw: String(raw).trim(), x: l.value, date };
    if (!it.key) return;
    if (khIgnored(label)) { it.ignored = true; out.push(it); return; }
    const tag = khTag(raw); let reason = tag ? khFindReason(tag) : null;
    if (tag && !reason) it.err = `#${tag} naam ka reason nahi mila`;
    if (!reason) reason = khReason(cfg.reason) || (KH.data && KH.data.reasons[0]) || KH_DEFAULT_REASONS[0];
    let v = khApplyFormula(cfg.formula, l.value);
    if (!Number.isFinite(v)) { it.err = it.err || 'Tab ka formula galat hai'; v = 0; }
    if (cfg.round) v = Math.round(v);
    let effect = reason.effect;
    let flip = false;
    if (v < 0) { v = -v; flip = true; effect = effect === 'gave' ? 'got' : effect === 'got' ? 'gave' : 'none'; }
    Object.assign(it, { amount: khRound(v), effect, flip, reason: reason.id, reasonName: reason.name, formula: cfg.formula });
    const p = khResolve(label); if (p) it.party = p; else it.unknown = true;
    if (it.amount === 0 && !it.err) it.zero = true;
    out.push(it);
  });
  return out;
}
/* compare the tab's lines with what was published from it before */
function khDiffSheet(fileId, sheetId, items) {
  const published = (khMaps().byFile.get(fileId) || []).filter(e => e.src.sheetId === sheetId).sort((a, b) => (a.src.pos || 0) - (b.src.pos || 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const live = items.filter(it => it.party && !it.err && !it.zero && !it.ignored);
  const same = (it, e) => Math.abs(it.amount - e.amount) < 0.005 && it.reason === e.reason && !!it.flip === !!e.flip;
  const group = (arr, keyFn) => { const m = new Map(); for (const x of arr) { const k = keyFn(x); let a = m.get(k); if (!a) m.set(k, a = []); a.push(x); } return m; };
  const pairs = [], adds = [], removes = [];
  const pubG = group(published, e => e.partyId + '|' + e.date), liveG = group(live, it => it.party.id + '|' + it.date);
  const leftPub = [], leftLive = [];
  for (const [k, its] of liveG) {
    const pubs = (pubG.get(k) || []).slice(); pubG.delete(k);
    const rest = [];
    for (const it of its) { const j = pubs.findIndex(e => same(it, e)); if (j >= 0) { pairs.push([it, pubs[j]]); pubs.splice(j, 1); } else rest.push(it); }
    while (rest.length && pubs.length) pairs.push([rest.shift(), pubs.shift()]);
    leftLive.push(...rest); leftPub.push(...pubs);
  }
  for (const pubs of pubG.values()) leftPub.push(...pubs);
  // same person, different date (the date line was changed) → a change, not cancel + new
  for (const it of leftLive) {
    let j = leftPub.findIndex(e => e.partyId === it.party.id && same(it, e));
    if (j < 0) j = leftPub.findIndex(e => e.partyId === it.party.id);
    if (j >= 0) { pairs.push([it, leftPub[j]]); leftPub.splice(j, 1); } else adds.push(it);
  }
  // a line that still exists but has a typo (#tag, formula) or a name that no longer matches keeps its entry as it is
  const held = items.filter(it => !it.zero && !it.ignored && (it.err || it.unknown) && it.raw);
  for (const e of leftPub) {
    const j = held.findIndex(h => (h.party && h.party.id === e.partyId) || (e.src && (khNorm(h.raw) === khNorm(e.src.line) || (h.i === e.src.pos && Math.abs((h.amount || 0) - e.amount) < 0.005))));
    if (j >= 0) { held[j].held = e; held.splice(j, 1); } else removes.push(e);
  }
  const changes = [];
  for (const [it, e] of pairs) {
    it.entry = e;
    if (same(it, e) && it.date === e.date) it.status = 'ok';
    else { it.status = 'changed'; changes.push([it, e]); }
  }
  for (const it of adds) it.status = 'new';
  return { adds, changes, removes, items };
}
function khEnabled() { return !!(settings.khataOn && KH.data); }
/* the small mark shown before each answer: ✓ in khata, ↑ to publish, ✎ changed, ⚠ new name */
function khLineMarks(calc, texts) {
  KH.last = null;
  if (!khEnabled() || !settings.khataMarks || !state.fileId) return null;
  const sh = state.sheets[state.sheetIdx]; if (!sh || !khCfg(sh).on) return null;
  const items = khSheetItems(sh, texts, calc);
  khDiffSheet(state.fileId, sh.id, items);
  KH.last = { sheetId: sh.id, items };
  const marks = [];
  for (const it of items) {
    let c, t;
    if (it.ignored) continue;
    if (it.err) { c = 'err'; t = '!'; }
    else if (it.unknown) { c = 'unk'; t = '⚠'; }
    else if (it.zero) { c = 'zero'; t = '·'; }
    else if (it.status === 'ok') { c = 'ok'; t = '✓'; }
    else if (it.status === 'changed') { c = 'chg'; t = '✎'; }
    else { c = 'new'; t = '↑'; }
    marks[it.i] = `<span class="kb-b ${c}" data-kb="${it.i}">${t}</span>`;
  }
  return marks;
}
/* all tabs of the open file → publish plan */
function khPlan() {
  const fileId = state.fileId; const cur = state.sheets[state.sheetIdx]; if (cur) { cur.text = ED.value; cur.total = state.total; }
  const plan = { fileId, adds: [], changes: [], removes: [], unknown: [], errors: [], sheets: 0 };
  const liveSheetIds = new Set();
  state.sheets.forEach(sh => {
    liveSheetIds.add(sh.id);
    const texts = sh.text.split('\n'); const calc = sh === cur ? state.calc : khCalc(sh.text);
    if (!calc) return;
    const items = khSheetItems(sh, texts, calc);
    const cfg = khCfg(sh);
    if (!cfg.on) { (khMaps().byFile.get(fileId) || []).filter(e => e.src.sheetId === sh.id).forEach(e => plan.removes.push(e)); return; }
    plan.sheets++;
    const d = khDiffSheet(fileId, sh.id, items);
    plan.adds.push(...d.adds); plan.changes.push(...d.changes); plan.removes.push(...d.removes);
    for (const it of items) { if (it.err && !it.ignored) plan.errors.push(it); else if (it.unknown && !it.zero) plan.unknown.push(it); }
  });
  // tabs that were deleted: their published entries are cancelled too
  (khMaps().byFile.get(fileId) || []).forEach(e => { if (!liveSheetIds.has(e.src.sheetId)) plan.removes.push(e); });
  plan.count = plan.adds.length + plan.changes.length + plan.removes.length;
  return plan;
}
function khScheduleCount() { clearTimeout(KH.countT); KH.countT = setTimeout(khUpdateCount, 350); }
function khUpdateCount() {
  const b = $('#tb-publish'); if (!b) return;
  let n = 0, warn = 0;
  if (khEnabled() && state.fileId && state.calc) { try { const p = khPlan(); n = p.count; warn = p.unknown.length + p.errors.length; } catch (e) { console.error(e); } }
  let badge = b.querySelector('.tb-count');
  if (!n && !warn) { if (badge) badge.remove(); b.classList.remove('has-count'); return; }
  if (!badge) { badge = el('span', { class: 'tb-count' }); b.append(badge); }
  badge.textContent = n ? String(n > 99 ? '99+' : n) : '!'; badge.classList.toggle('warn', !n && !!warn);
  b.classList.add('has-count');
}

/* ---------------- messages ---------------- */
const khWords = () => KH_LANG[settings.khataLang] || KH_LANG.hinglish;
function khBalanceLine(bal) { const w = khWords(); return Math.abs(bal) < 0.5 ? w.clear : (bal > 0 ? w.get : w.give).replace('{amt}', khMoney(bal)); }
function khEntryLine(x) {
  const w = khWords(); const head = `${khShortDate(x.date)} · ${x.reasonName}: ${x.flip ? '−' : ''}`;
  if (x.kind === 'change') {
    const d = x.oldDate && x.oldDate !== x.date ? `${khShortDate(x.oldDate)} ➜ ${khShortDate(x.date)}` : khShortDate(x.date);
    const r = x.oldReason && x.oldReason !== x.reasonName ? `${x.oldReason} ➜ ${x.reasonName}` : x.reasonName;
    const a = Math.abs((x.old || 0) - x.amount) >= 0.005 ? `${khMoney(x.old)} ➜ ${khMoney(x.amount)}` : khMoney(x.amount);
    return `${d} · ${r}: ${a} (${w.changed})`;
  }
  if (x.kind === 'remove') return head + `${khMoney(x.amount)} (${w.removed})`;
  return head + khMoney(x.amount);
}
function khFill(tpl, vars) {
  let t = String(tpl || '').replace(/\{(naam|name|entries|baaki|dukaan|shop|phone|date)\}/g, (m, k) => {
    const v = { name: vars.naam, shop: vars.dukaan }[k] ?? vars[k]; return v == null ? '' : String(v);
  });
  if (!vars.dukaan) t = t.split('\n').filter(l => !/^\s*[–-]?\s*$/.test(l)).join('\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
function khMessage(party, lines) {
  return khFill(settings.khataMsg || khWords().tpl, { naam: party.name, entries: lines.map(khEntryLine).join('\n'), baaki: khBalanceLine(khBalance(party.id)), dukaan: settings.khataShop, phone: settings.khataShopPhone, date: khShortDate(khToday()) });
}
function khReminder(party) { return khFill(khWords().remind, { naam: party.name, baaki: khBalanceLine(khBalance(party.id)), dukaan: settings.khataShop, phone: settings.khataShopPhone }); }
const khDupKey = (name, date, amount) => `${khNorm(name)}|${date}|${khRound(amount)}`;
const khChannel = p => (p && p.channel) || settings.khataChannel || 'wa';

/* ---------------- sending (SMS straight from the SIM, WhatsApp with one tap) ---------------- */
function khPlugin() { return Native.on ? Native.p('KhataSender') : null; }
const khNotImpl = e => /not implemented|UNIMPLEMENTED|not available/i.test(String((e && (e.code || '')) + ' ' + (e && e.message || '')));
const khSmsAsk = { denied: false };
async function khSms(phone, text) {
  const ks = khPlugin(); const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (ks && !khSmsAsk.denied) {
    try {
      const info = await ks.apps();
      if (!info.smsPermission) {
        const r = await ks.requestSms();
        if (!r || !r.granted) { khSmsAsk.denied = true; setTimeout(() => { khSmsAsk.denied = false; }, 60000); toast('SMS permission nahi mili – SMS app khol rahe hain'); openLink('sms:' + digits + '?body=' + encodeURIComponent(text)); return { ok: true, opened: true }; }
      }
      const r = await ks.sendSms({ phone: digits, text });
      return r && r.ok === false ? { ok: false, why: 'SMS nahi gaya (balance / network check karein)' } : { ok: true };
    } catch (e) { if (!khNotImpl(e)) return { ok: false, why: (e && e.message) || 'SMS nahi gaya' }; }
  }
  openLink('sms:' + digits + '?body=' + encodeURIComponent(text)); return { ok: true, opened: true };
}
async function khWa(phone, text) {
  const ks = khPlugin(); const pkg = settings.khataWaApp === 'biz' ? 'com.whatsapp.w4b' : settings.khataWaApp === 'wa' ? 'com.whatsapp' : '';
  if (ks) {
    try { await ks.whatsapp({ phone: khPhone(phone), text, pkg }); return { ok: true, opened: true }; }
    catch (e) { if (!khNotImpl(e)) return { ok: false, why: (e && e.message) || 'WhatsApp nahi khula' }; }
  }
  openLink('https://wa.me/' + khPhone(phone) + '?text=' + encodeURIComponent(text)); return { ok: true, opened: true };
}
function khLogMsg(ids, ch, ok) {
  const at = new Date().toISOString(); const set = new Set(ids);
  for (const e of KH.data.entries) if (set.has(e.id)) { (e.msgs = e.msgs || []).push({ at, ch, ok }); if (e.msgs.length > 20) e.msgs.splice(0, e.msgs.length - 20); }
}
/* sends a list of jobs: SMS go by themselves (phone app), WhatsApp opens one chat per tap */
function khSendJobs(jobs, title = '📨 Messages', auto = false) {
  if (!jobs.length) return;
  const list = el('div', { class: 'kq-list' });
  const autoSms = !!khPlugin();
  const row = j => {
    const st = j.status === 'sent' ? '✓ Gaya' : j.status === 'opened' ? '✓ Khula' : j.status === 'fail' ? '✗ ' + (j.why || 'Fail') : j.status === 'busy' ? '…' : '';
    return el('div', { class: 'kq-row ' + (j.status || '') },
      el('span', { class: 'kq-ch', text: j.ch === 'sms' ? '✉️' : '💬' }),
      el('div', { class: 'kq-main' }, el('b', { text: j.party.name }), el('span', { text: (j.ch === 'sms' ? 'SMS' : 'WhatsApp') + ' · ' + (j.party.phone || '') })),
      st ? el('span', { class: 'kq-st', text: st }) : null,
      el('button', { class: 'kq-btn', text: j.status === 'sent' || j.status === 'opened' ? 'Dobara' : 'Bhejo', disabled: j.status === 'busy', onclick: () => go(j) }));
  };
  const draw = () => { list.replaceChildren(...jobs.map(row)); const n = jobs.filter(j => !j.status || j.status === 'fail').length; nextBtn.textContent = n ? `▶ Agla bhejo (${n} baaki)` : '✓ Sab ho gaya'; nextBtn.className = 'btn ' + (n ? 'ok' : 'cancel'); };
  let waiting = null;
  const go = async j => {
    if (j.status === 'busy') return;
    j.status = 'busy'; draw();
    const r = j.ch === 'sms' ? await khSms(j.party.phone, j.text) : await khWa(j.party.phone, j.text);
    j.status = !r.ok ? 'fail' : r.opened ? 'opened' : 'sent'; j.why = r.why;
    khLogMsg(j.ids, j.ch, r.ok); khSave();
    if (r.opened) waiting = j;
    draw();
  };
  const nextBtn = el('button', { class: 'btn ok', onclick: () => { const j = jobs.find(x => !x.status || x.status === 'fail'); if (j) go(j); else Sheet.close(); } });
  let stopped = false;
  const onBack = () => { if (document.visibilityState === 'visible' && waiting) { waiting = null; draw(); } };
  document.addEventListener('visibilitychange', onBack);
  Sheet.show(el('div', {}, el('h3', { text: title }),
    el('p', { class: 'msg', text: autoSms ? 'SMS apne aap aapke SIM se jaate hain. WhatsApp har naam pe ek baar khulega – wahan Send dabayein, phir yahan wapas aayein.' : 'Har naam pe tap karein – message likha hua khulega, bas Send dabayein.' }),
    list, el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Band karein', onclick: () => Sheet.close() }), nextBtn)), () => { stopped = true; document.removeEventListener('visibilitychange', onBack); });
  draw();
  // SMS: send all of them right away, one after another (stops when the list is closed)
  // SMS go by themselves one after another; stops when the list is closed or when the SMS app had to be opened instead
  (async () => {
    if (autoSms) for (const j of jobs) { if (stopped) break; if (j.ch === 'sms' && !j.status) { await go(j); if (j.status === 'opened') break; } }
    const first = jobs.find(j => !j.status);
    if (auto && first && !stopped && !(autoSms && first.ch === 'sms')) go(first);       // the user already chose "send" – open it straight away
  })();
}
function khJobsFor(party, text, ids, ch = khChannel(party)) {
  if (!khHasPhone(party.phone) || ch === 'none') return [];
  const out = [];
  if (ch === 'sms' || ch === 'both') out.push({ party, ch: 'sms', text, ids });
  if (ch === 'wa' || ch === 'both') out.push({ party, ch: 'wa', text, ids });
  return out;
}

/* ---------------- PUBLISH ---------------- */
async function khPublishFlow() {
  await khLoad();
  if (!settings.khataOn) { const ok = await dialogConfirm({ title: 'Khata book band hai', message: 'Settings → Khata book mein ise chalu karein?', okText: 'Chalu karein' }); if (!ok) return; setSetting('khataOn', true); }
  removeEmptyPendingDate(); render();
  const plan = khPlan();
  if (!plan.count && !plan.unknown.length && !plan.errors.length) { toast(plan.sheets ? 'Sab kuch khata mein publish ho chuka hai ✓' : 'Is note ke kisi tab mein khata chalu nahi hai'); return; }
  // group by party
  const groups = new Map();
  const add = (p, x) => { let g = groups.get(p.id); if (!g) groups.set(p.id, g = { party: p, lines: [], delta: 0 }); g.lines.push(x); };
  const eff = (effect, amt) => effect === 'gave' ? amt : effect === 'got' ? -amt : 0;
  const curTabs = new Set(plan.adds.map(it => it.sheetId));
  const others = new Set(KH.data.entries.filter(e => e.delParty || (!e.deleted && (!e.src || e.src.fileId !== plan.fileId || !curTabs.has(e.src.sheetId)))).map(e => khDupKey(e.delParty || (khParty(e.partyId) || {}).name, e.date, e.amount)));
  for (const it of plan.adds) { add(it.party, { kind: 'add', date: it.date, reasonName: it.reasonName, amount: it.amount, flip: it.flip, dup: others.has(khDupKey(it.party.name, it.date, it.amount)) }); groups.get(it.party.id).delta += eff(it.effect, it.amount); }
  for (const [it, e] of plan.changes) {
    if (it.party.id !== e.partyId) continue;
    add(it.party, { kind: 'change', date: it.date, reasonName: it.reasonName, amount: it.amount, flip: it.flip, old: e.amount, oldDate: e.date, oldReason: khReasonOf(e).name });
    groups.get(it.party.id).delta += eff(it.effect, it.amount) - eff(e.effect, e.amount);
  }
  for (const e of plan.removes) { const p = khParty(e.partyId); if (!p) continue; add(p, { kind: 'remove', date: e.date, reasonName: khReasonOf(e).name, amount: e.amount }); groups.get(p.id).delta -= eff(e.effect, e.amount); }
  const G = [...groups.values()].sort((a, b) => a.party.name.localeCompare(b.party.name));
  const box = el('div', {});
  if (plan.unknown.length) {
    const names = [...new Map(plan.unknown.map(it => [it.key, it])).values()];
    box.append(el('div', { class: 'kp-warn' }, el('b', { text: `⚠ ${names.length} naam ka khata nahi hai` }), el('span', { text: 'Ye entries publish nahi hongi. Naam pe tap karke khata banayein ya jodein.' }),
      el('div', { class: 'chips' }, ...names.map(it => el('button', { class: 'chip', text: '＋ ' + it.label, onclick: () => khUnknownSheet(it, () => khPublishFlow()) })))));
  }
  if (plan.errors.length) box.append(el('div', { class: 'kp-err' }, el('b', { text: '✗ In lines mein galti hai' }), ...plan.errors.slice(0, 8).map(it => el('span', { text: `Line ${it.i + 1} (${it.sheetName}): ${it.err}` }))));
  const choice = new Map(), edited = new Map();
  for (const g of G) {
    const p = g.party; const after = khBalance(p.id) + g.delta; choice.set(p.id, khHasPhone(p.phone) ? khChannel(p) : 'none');
    const chips = el('div', { class: 'kp-ch' });
    const drawChips = () => chips.replaceChildren(...(khHasPhone(p.phone) ? [['sms', '✉️ SMS'], ['wa', '💬 WhatsApp'], ['both', 'Dono'], ['none', 'Nahi']].map(([v, l]) => el('button', { class: 'chip' + (choice.get(p.id) === v ? ' active' : ''), 'data-ch': v, text: l, onclick: () => { choice.set(p.id, v); drawChips(); } }))
      : [el('button', { class: 'chip', text: '📵 Number nahi – jodein', onclick: () => khPartyForm(p, () => khPublishFlow()) })]));
    drawChips();
    const ta = el('textarea', { class: 'kp-msg', rows: 5, style: 'display:none' });
    const prev = el('button', { class: 'kp-link', text: 'Message dekhein / badlein ▾', onclick: () => {
      if (ta.style.display === 'none') { if (!edited.has(p.id)) ta.value = khPreviewMsg(p, g, after); ta.style.display = ''; prev.textContent = 'Message chhupayein ▴'; } else { ta.style.display = 'none'; prev.textContent = 'Message dekhein / badlein ▾'; }
    } });
    ta.addEventListener('input', () => edited.set(p.id, ta.value));
    box.append(el('div', { class: 'kp-card', 'data-pid': p.id },
      el('div', { class: 'kp-head' }, khAvatar(p), el('div', { class: 'kp-nm' }, el('b', { text: p.name }), el('span', { class: 'kk-' + khCls(after), text: `Ab baaki: ${khMoney(after)} ${khWord(after)}` }))),
      ...g.lines.map(x => el('div', { class: 'kp-line ' + x.kind }, el('span', { class: 'ic', text: x.kind === 'add' ? '＋' : x.kind === 'change' ? '✎' : '✕' }), el('span', { text: khEntryLine(x) }), x.dup ? el('small', { class: 'kp-dup', text: '⚠ shayad pehle se hai' }) : null)),
      chips, prev, ta));
  }
  if (!G.length && !plan.unknown.length && !plan.errors.length) return;
  const btn = el('button', { class: 'btn ok', id: 'khPublishGo', text: plan.count ? `✓ Publish (${plan.count})` : 'Theek hai', onclick: async () => {
    if (!plan.count) { Sheet.close(); return; }
    btn.disabled = true;
    const done = await khApplyPlan(plan);
    Sheet.onClose = null; Sheet.close();
    const jobs = [];
    for (const g of G) { const d = done.get(g.party.id); if (!d) continue; const text = edited.get(g.party.id) || khMessage(g.party, g.lines); jobs.push(...khJobsFor(g.party, text, d, choice.get(g.party.id))); }
    toast(`✓ ${plan.count} badlav khata mein publish hue`);
    if (jobs.length) setTimeout(() => khSendJobs(jobs, '📨 Messages bhejein'), 280);
  } });
  Sheet.show(el('div', { class: 'kp' }, el('h3', { text: '📤 Publish – khata mein bhejein' }),
    el('p', { class: 'msg', text: plan.count ? `${plan.count} badlav ${G.length} khate mein jaayenge. Check karke Publish dabayein.` : 'Abhi publish karne ko kuch nahi hai.' }),
    box, el('div', { class: 'sheet-actions kp-actions' }, el('button', { class: 'btn cancel', text: 'Cancel', onclick: () => Sheet.close() }), btn)));
}
function khPreviewMsg(p, g, after) {
  const save = khMaps().bal.get(p.id); khMaps().bal.set(p.id, after);
  try { return khMessage(p, g.lines); } finally { khMaps().bal.set(p.id, save); }
}
async function khApplyPlan(plan) {
  const now = new Date().toISOString(); const touched = new Map();
  const mark = (pid, id) => { let a = touched.get(pid); if (!a) touched.set(pid, a = []); a.push(id); };
  const title = displayTitle();
  const src = it => ({ fileId: plan.fileId, fileTitle: title, sheetId: it.sheetId, sheetName: it.sheetName, line: it.raw, pos: it.i, x: it.x, formula: it.formula });
  for (const it of plan.adds) {
    const e = { id: newId('ke_'), partyId: it.party.id, date: it.date, amount: it.amount, effect: it.effect, flip: !!it.flip, reason: it.reason, reasonName: it.reasonName, mode: '', note: '', src: src(it), createdAt: now, updatedAt: now, hist: [], msgs: [] };
    KH.data.entries.push(e); mark(e.partyId, e.id);
  }
  for (const [it, e] of plan.changes) {
    (e.hist = e.hist || []).push({ at: now, amount: e.amount, effect: e.effect, reasonName: e.reasonName, date: e.date, partyId: e.partyId });
    Object.assign(e, { partyId: it.party.id, date: it.date, amount: it.amount, effect: it.effect, flip: !!it.flip, reason: it.reason, reasonName: it.reasonName, src: src(it), updatedAt: now });
    mark(e.partyId, e.id);
  }
  for (const e of plan.removes) { (e.hist = e.hist || []).push({ at: now, kind: 'removed', amount: e.amount }); e.deleted = now; e.updatedAt = now; mark(e.partyId, e.id); }
  KH.data.pub[plan.fileId] = now;
  await khSave();
  return touched;
}

/* =====================================================================
   KHATA BOOK SCREENS (look & feel of a khata app)
   ===================================================================== */
const khCls = b => b > 0.5 ? 'get' : b < -0.5 ? 'give' : 'clear';
const khWord = b => b > 0.5 ? 'lena hai' : b < -0.5 ? 'dena hai' : 'barabar';
function khAvatar(p, big) { return el('span', { class: 'kk-av ' + (p.type === 'supplier' ? 'sup' : 'cus') + (big ? ' big' : ''), text: khInitials(p.name) }); }
const KHU = (() => { let u = {}; try { u = JSON.parse(LS.get('cnf_khata_ui', '{}')) || {}; } catch (e) {} return Object.assign({ type: 'all', sort: 'recent', filter: 'all', q: '', pid: null, rep: { pid: null, period: 'month', from: '', to: '', q: '' } }, u, { q: '', pid: null }); })();
const khSaveUi = () => LS.set('cnf_khata_ui', JSON.stringify({ type: KHU.type, sort: KHU.sort }));
function khOpenParty(pid) { KHU.pid = pid; if (pageStack.includes('kparty')) { const pg = $('#pages .page[data-page="kparty"]'); if (pg) renderPage(pg, 'kparty'); } else openPage('kparty'); }
async function openKhata() { closeSidebar(); if (document.activeElement === ED) ED.blur(); await khLoad(); if (pageStack.includes('khata')) return; openPage('khata'); }

/* ---- list of all khata ---- */
function khRenderList(body) {
  const D = KH.data || khNormalize(null); const M = khMaps();
  const wrap = el('div', { class: 'kk' });
  if (!settings.khataOn) wrap.append(el('div', { class: 'kk-off' }, el('b', { text: 'Khata book band hai' }), el('span', { text: 'Chalu karne par note ki entries apne aap khate mein jaa sakti hain.' }), el('button', { class: 'btn ok', text: 'Chalu karein', onclick: () => { setSetting('khataOn', true); refreshKhataPages(); render(true); } })));
  const hasSup = D.parties.some(p => p.type === 'supplier');
  if (!hasSup && KHU.type === 'supplier') KHU.type = 'all';
  if (hasSup) wrap.append(el('div', { class: 'kk-tabs' }, ...[['all', 'Sab'], ['customer', 'Grahak'], ['supplier', 'Supplier']].map(([v, l]) => el('button', { class: KHU.type === v ? 'on' : '', 'data-type': v, text: l, onclick: () => { KHU.type = v; khSaveUi(); refreshKhataPages(); } }))));
  const pool = D.parties.filter(p => KHU.type === 'all' || p.type === KHU.type);
  let get = 0, give = 0; for (const p of pool) { const b = M.bal.get(p.id) || 0; if (b > 0.5) get += b; else if (b < -0.5) give -= b; }
  wrap.append(el('div', { class: 'kk-sum' },
    el('div', { class: 'kk-sum-top' },
      el('button', { class: 'half', onclick: () => { KHU.filter = KHU.filter === 'give' ? 'all' : 'give'; refreshKhataPages(); } }, el('span', { text: 'Aapko dene hain' }), el('b', { class: 'v give', text: khMoney(give) })),
      el('span', { class: 'sep' }),
      el('button', { class: 'half', onclick: () => { KHU.filter = KHU.filter === 'get' ? 'all' : 'get'; refreshKhataPages(); } }, el('span', { text: 'Aapko milenge' }), el('b', { class: 'v get', text: khMoney(get) }))),
    el('button', { class: 'kk-sum-rep', text: '📄 Report dekhein ›', onclick: () => { KHU.rep.pid = null; openPage('kreport'); } })));
  // unpublished changes in the open note
  if (state.fileId && settings.khataOn) { try { const pl = khPlan(); if (pl.count || pl.unknown.length) wrap.append(el('button', { class: 'kk-pend', onclick: () => { closeAllPages(); setTimeout(khPublishFlow, 300); } }, el('span', { text: '📤' }), el('span', { class: 'm' }, el('b', { text: pl.count ? `"${displayTitle()}" mein ${pl.count} badlav publish baaki` : `"${displayTitle()}" mein naye naam hain` }), pl.unknown.length ? el('small', { text: `${new Set(pl.unknown.map(i => i.key)).size} naam ka khata nahi bana (⚠)` }) : null), el('span', { text: '›' }))); } catch (e) { console.error(e); } }
  const q = el('input', { type: 'search', class: 'kk-q', placeholder: 'Naam ya number khojein', value: KHU.q, autocomplete: 'off' });
  const listBox = el('div', { class: 'kk-list' });
  const drawList = () => {
    const s = khNorm(KHU.q); const sd = KHU.q.replace(/\D/g, '');
    let arr = pool.filter(p => (!s || khNorm([p.name, ...(p.aliases || [])].join(' ')).includes(s) || (sd.length >= 3 && String(p.phone || '').replace(/\D/g, '').includes(sd))));
    if (KHU.filter !== 'all') arr = arr.filter(p => khCls(M.bal.get(p.id) || 0) === KHU.filter);
    const bal = p => M.bal.get(p.id) || 0;
    const sorts = { recent: (a, b) => (M.last.get(b.id) || '').localeCompare(M.last.get(a.id) || ''), high: (a, b) => Math.abs(bal(b)) - Math.abs(bal(a)), low: (a, b) => Math.abs(bal(a)) - Math.abs(bal(b)), name: (a, b) => a.name.localeCompare(b.name), old: (a, b) => (M.last.get(a.id) || '').localeCompare(M.last.get(b.id) || '') };
    arr.sort(sorts[KHU.sort] || sorts.recent);
    if (!arr.length) { listBox.replaceChildren(el('div', { class: 'kk-empty' }, D.parties.length ? el('span', { text: 'Koi khata nahi mila.' }) : el('div', {}, el('b', { text: 'Abhi koi khata nahi hai' }), el('p', { text: 'Note mein naam ke saath entry likhein, jaise  gopi 12+7.  Answer ke aage ⚠ pe tap karke khata banayein, phir 📤 Publish dabayein.' })))); return; }
    listBox.replaceChildren(...arr.slice(0, 500).map(p => {
      const b = bal(p); const c = khCls(b);
      return el('button', { class: 'kk-row', 'data-pid': p.id, onclick: () => khOpenParty(p.id) }, khAvatar(p),
        el('span', { class: 'mid' }, el('b', { text: p.name }), el('span', { text: [p.type === 'supplier' ? 'Supplier' : '', khAgo(M.last.get(p.id))].filter(Boolean).join(' · ') })),
        el('span', { class: 'kk-amt ' + c }, el('b', { text: khMoney(b) }), c === 'get' && khHasPhone(p.phone) ? el('span', { class: 'kk-rem', text: 'YAAD DILAYEIN ›', onclick: e => { e.stopPropagation(); khRemind(p); } }) : el('span', { text: khWord(b) })));
    }));
  };
  q.addEventListener('input', () => { KHU.q = q.value; drawList(); });
  const showing = KHU.filter !== 'all' ? el('div', { class: 'kk-showing' }, el('span', { text: 'Dikh rahe: ' + { get: 'Aapko milenge', give: 'Aapko dene hain', clear: 'Barabar' }[KHU.filter] }), el('button', { text: '✕', onclick: () => { KHU.filter = 'all'; refreshKhataPages(); } })) : null;
  wrap.append(el('div', { class: 'kk-search' }, q, el('button', { class: 'kk-fbtn', text: '⚙ Filter', onclick: khFilterSheet })), showing || '', listBox);
  wrap.append(el('button', { class: 'kk-fab', id: 'khAdd', text: '＋ Naya khata', onclick: () => khPartyForm(null, p => p && khOpenParty(p.id), { type: KHU.type === 'supplier' ? 'supplier' : 'customer' }) }));
  body.replaceChildren(wrap); drawList();
}
function khFilterSheet() {
  const f = el('div', { class: 'chips' }), s = el('div', { class: 'menu-list' });
  const drawF = () => f.replaceChildren(...[['all', 'Sab'], ['get', 'Aapko milenge'], ['give', 'Aapko dene hain'], ['clear', 'Barabar']].map(([v, l]) => el('button', { class: 'chip' + (KHU.filter === v ? ' active' : ''), text: l, onclick: () => { KHU.filter = v; drawF(); } })));
  const drawS = () => s.replaceChildren(...[['recent', 'Sabse naya pehle'], ['high', 'Sabse zyada rakam'], ['name', 'Naam se (A–Z)'], ['old', 'Sabse purana pehle'], ['low', 'Sabse kam rakam']].map(([v, l]) => el('button', { class: 'menu-item' + (KHU.sort === v ? ' on' : ''), onclick: () => { KHU.sort = v; khSaveUi(); drawS(); } }, el('span', { class: 'ic', text: KHU.sort === v ? '◉' : '○' }), el('span', { text: l }))));
  drawF(); drawS();
  Sheet.show(el('div', {}, el('h3', { text: 'Filter aur kram' }), el('label', { class: 'lbl', text: 'Dikhayein' }), f, el('label', { class: 'lbl', text: 'Kram' }), s,
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn ok', text: 'Theek hai', onclick: () => Sheet.close() }))), () => refreshKhataPages());
}

/* ---- one party's khata ---- */
function khRenderParty(body, pg) {
  const p = khParty(KHU.pid);
  if (!p) { body.replaceChildren(el('div', { class: 'kk-empty', text: 'Ye khata nahi mila.' })); return; }
  const t = pg && pg.querySelector('.page-title'); if (t) t.textContent = p.name;
  const b = khBalance(p.id), c = khCls(b);
  const wrap = el('div', { class: 'kk' });
  wrap.append(el('div', { class: 'kk-phead' },
    el('div', { class: 'kk-pid' }, khAvatar(p, true), el('div', { class: 'mid' }, el('div', { class: 'nm' }, el('b', { text: p.name }), el('span', { class: 'kk-type', text: p.type === 'supplier' ? 'Supplier' : 'Grahak' })),
      el('button', { class: 'kk-set', text: '⚙ Settings', onclick: () => khPartyMenu(p) })),
      khHasPhone(p.phone) ? el('button', { class: 'kk-call', 'aria-label': 'Call', text: '📞', onclick: () => openLink('tel:' + String(p.phone).replace(/[^\d+]/g, '')) }) : null),
    el('div', { class: 'kk-pbal ' + c }, el('span', { text: c === 'get' ? 'Aapko milenge' : c === 'give' ? 'Aapko dene hain' : 'Hisaab barabar' }), el('b', { text: khMoney(b) }))));
  wrap.append(el('div', { class: 'kk-acts' },
    el('button', { onclick: () => { KHU.rep.pid = p.id; openPage('kreport'); } }, el('span', { text: '📄' }), 'Report'),
    el('button', { onclick: () => khRemind(p, 'wa') }, el('span', { text: '💬' }), 'WhatsApp'),
    el('button', { onclick: () => khRemind(p, 'sms') }, el('span', { text: '✉️' }), 'SMS')));
  const rows = khWithRunning(khPartyEntries(p.id), p.id);
  if (Math.abs(+p.opening || 0) >= 0.5) wrap.append(el('div', { class: 'kk-open' }, `Shuru ka baaki: `, el('b', { class: 'kk-' + khCls(+p.opening), text: khMoney(+p.opening) + ' ' + khWord(+p.opening) })));
  if (rows.length) {
    wrap.append(el('div', { class: 'kk-cols' }, el('span', { text: 'ENTRY' }), el('span', { class: 'gave', text: 'AAPNE DIYE' }), el('span', { class: 'got', text: 'AAPKO MILE' })));
    let day = '';
    for (const r of rows.slice().reverse()) {
      if (r.e.date !== day) { day = r.e.date; wrap.append(el('div', { class: 'kk-day', text: khDayHead(day) })); }
      wrap.append(khEntryRow(r.e, r.run));
    }
  } else wrap.append(el('div', { class: 'kk-empty', text: 'Abhi koi entry nahi. Neeche button se entry daalein, ya note mein naam likh kar Publish karein.' }));
  wrap.append(el('div', { class: 'kk-btns' },
    el('button', { class: 'btn kk-gave', id: 'khGave', text: 'AAPNE DIYE ₹', onclick: () => khEntryForm({ pid: p.id, effect: 'gave' }) }),
    el('button', { class: 'btn kk-got', id: 'khGot', text: 'AAPKO MILE ₹', onclick: () => khEntryForm({ pid: p.id, effect: 'got' }) })));
  body.replaceChildren(wrap);
}
function khEntryRow(e, run, withName) {
  const r = khReasonOf(e); const p = withName ? khParty(e.partyId) : null;
  const desc = [r.name, e.mode === 'upi' ? 'UPI/Bank' : e.mode === 'cash' ? 'Cash' : '', e.note].filter(Boolean).join(' · ');
  return el('button', { class: 'kk-e' + (e.effect === 'none' ? ' rec' : ''), 'data-eid': e.id, onclick: () => khEntryDetail(e) },
    el('span', { class: 'l' },
      el('span', { class: 'when', text: (withName ? khShortDate(e.date) + ' · ' : '') + khTime(e.createdAt) + (e.src ? ' · 📝' : '') + (e.msgs && e.msgs.some(m => m.ok) ? ' · ✓ msg' : '') }),
      p ? el('b', { class: 'who', text: p.name }) : null,
      el('span', { class: 'what' }, el('i', { class: 'dot', style: `background:${r.color}` }), desc),
      e.effect === 'none' ? el('span', { class: 'kk-bal rec', text: 'Record: ' + khMoney(e.amount) }) : run != null ? el('span', { class: 'kk-bal ' + khCls(run), text: 'Baaki ' + khMoney(run) }) : null),
    el('span', { class: 'c gave', text: e.effect === 'gave' ? khMoney(e.amount) : '' }),
    el('span', { class: 'c got', text: e.effect === 'got' ? khMoney(e.amount) : '' }));
}
function khPartyMenu(p) {
  dialogMenu('⚙ ' + p.name, [
    { key: 'edit', icon: '✏️', label: 'Naam, number, purana baaki badlein' },
    { key: 'remind', icon: '💬', label: 'Baaki ki yaad dilayein', sub: khBalanceLine(khBalance(p.id)) },
    { key: 'report', icon: '📄', label: 'Report / statement' },
    { key: 'del', icon: '🗑', label: 'Khata delete karein', danger: true }
  ]).then(k => {
    if (k === 'edit') khPartyForm(p);
    else if (k === 'remind') khRemind(p);
    else if (k === 'report') { KHU.rep.pid = p.id; openPage('kreport'); }
    else if (k === 'del') khDeleteParty(p);
  });
}
async function khDeleteParty(p) {
  const n = khPartyEntries(p.id).length;
  const ok = await dialogConfirm({ title: `"${p.name}" ka khata delete karein?`, message: n ? `${n} entry bhi hat jaayengi. Note mein ye naam phir se ⚠ dikhega.` : 'Ye khata hat jaayega.', okText: 'Delete', danger: true });
  if (!ok) return;
  const now = new Date().toISOString();
  const removed = KH.data.entries.filter(e => e.partyId === p.id && !e.deleted);
  for (const e of removed) { e.deleted = now; e.delParty = p.name; }
  KH.data.parties = KH.data.parties.filter(x => x.id !== p.id);
  await khSave();
  if (pageStack.includes('kparty')) Overlays.remove('page:kparty');
  toast(`"${p.name}" ka khata delete hua`, 5000, { label: 'Undo', run: async () => { KH.data.parties.push(p); for (const e of removed) { delete e.deleted; delete e.delParty; } await khSave(); toast('Wapas aa gaya ✓'); } });
}
function khRemind(p, ch) {
  if (!khHasPhone(p.phone)) { toast('Pehle mobile number jodein'); khPartyForm(p); return; }
  ch = ch || (khChannel(p) === 'sms' ? 'sms' : 'wa');
  const ta = el('textarea', { class: 'kp-msg', rows: 5 }); ta.value = khReminder(p);
  const send = c => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khSendJobs([{ party: p, ch: c, text: ta.value, ids: [] }], '📨 ' + p.name, true), 260); };
  Sheet.show(el('div', {}, el('h3', { text: `💬 ${p.name} ko yaad dilayein` }), ta,
    el('div', { class: 'kf-send' }, el('button', { class: 'btn ' + (ch === 'sms' ? 'ok' : 'cancel'), id: 'khRemSms', text: '✉️ SMS bhejein', onclick: () => send('sms') }), el('button', { class: 'btn ' + (ch === 'wa' ? 'ok' : 'cancel'), id: 'khRemWa', text: '💬 WhatsApp', onclick: () => send('wa') })),
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Cancel', onclick: () => Sheet.close() }))));
}

/* ---- party form ---- */
function khPartyForm(p, after, prefill = {}) {
  const isNew = !p; const v = Object.assign({ name: '', phone: '', type: 'customer', aliases: [], opening: 0, channel: '', note: '' }, p || {}, isNew ? prefill : {});
  const name = el('input', { type: 'text', placeholder: 'Jaise: Gopi Kumar', autocomplete: 'off', value: v.name });
  const phone = el('input', { type: 'tel', inputmode: 'tel', placeholder: '10 ank ka mobile number', autocomplete: 'off', value: v.phone });
  let type = v.type, ch = v.channel || '', side = (+v.opening || 0) < 0 ? 'give' : 'get';
  const typeChips = el('div', { class: 'chips' }); const drawType = () => typeChips.replaceChildren(...[['customer', 'Grahak'], ['supplier', 'Supplier']].map(([k, l]) => el('button', { class: 'chip' + (type === k ? ' active' : ''), text: l, onclick: () => { type = k; drawType(); } }))); drawType();
  const opening = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0', value: Math.abs(+v.opening || 0) ? String(Math.abs(+v.opening)) : '' });
  const sideChips = el('div', { class: 'chips' }); const drawSide = () => sideChips.replaceChildren(...[['get', 'Mujhe lena hai'], ['give', 'Mujhe dena hai']].map(([k, l]) => el('button', { class: 'chip' + (side === k ? ' active' : ''), text: l, onclick: () => { side = k; drawSide(); } }))); drawSide();
  const chChips = el('div', { class: 'chips' }); const drawCh = () => chChips.replaceChildren(...[['', 'Default'], ['sms', 'SMS'], ['wa', 'WhatsApp'], ['both', 'Dono'], ['none', 'Koi nahi']].map(([k, l]) => el('button', { class: 'chip' + (ch === k ? ' active' : ''), text: l, onclick: () => { ch = k; drawCh(); } }))); drawCh();
  const aliases = el('input', { type: 'text', placeholder: 'Jaise: gopi, gopi ji, GK', autocomplete: 'off', value: (v.aliases || []).join(', ') });
  const note = el('input', { type: 'text', placeholder: 'Pata / note (zaroori nahi)', autocomplete: 'off', value: v.note || '' });
  const err = el('p', { class: 'kf-err' });
  const pick = khPlugin() ? el('button', { class: 'kf-pick', type: 'button', text: '📇 Contacts se', onclick: async () => { try { const r = await khPlugin().pickContact(); if (r && !r.cancelled) { if (r.phone) phone.value = r.phone; if (r.name && !name.value.trim()) name.value = r.name; } } catch (e) { toast('Contacts nahi khule'); } } }) : null;
  const save = async () => {
    const n = name.value.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!n) { err.textContent = 'Naam likhein'; name.focus(); return; }
    const al = aliases.value.split(',').map(s => s.trim()).filter(Boolean).filter(a => khNorm(a) !== khNorm(n)).slice(0, 20);
    const clash = khNameTaken([n, ...al], p && p.id); if (clash) { err.textContent = `"${clash.name}" pehle se "${clash.party.name}" ke khate mein hai`; return; }
    const ph = phone.value.trim(); if (ph && !khHasPhone(ph)) { err.textContent = 'Mobile number poora likhein (10 ank)'; phone.focus(); return; }
    let ob = parseFloat(String(opening.value).replace(/[,₹\s]/g, '')) || 0; if (!Number.isFinite(ob)) ob = 0; ob = khRound(Math.abs(ob)) * (side === 'give' ? -1 : 1);
    const saved = await khUpsertParty({ name: n, phone: ph, type, aliases: al, opening: ob, channel: ch, note: note.value.trim() }, p && p.id);
    Sheet.onClose = null; Sheet.close();
    toast(isNew ? `✓ "${n}" ka khata bana` : '✓ Khata update hua');
    if (after) setTimeout(() => after(saved), 260);
  };
  Sheet.show(el('div', { class: 'kf' }, el('h3', { text: isNew ? '＋ Naya khata' : '✏️ Khata badlein' }),
    el('label', { class: 'lbl', text: 'Naam' }), name,
    el('div', { class: 'kf-row' }, el('label', { class: 'lbl', text: 'Mobile (SMS / WhatsApp ke liye)' }), pick), phone,
    el('label', { class: 'lbl', text: 'Kaun hai' }), typeChips,
    el('label', { class: 'lbl', text: 'Purana baaki (app se pehle ka)' }), opening, sideChips,
    el('label', { class: 'lbl', text: 'Message kaise jaaye' }), chChips,
    el('label', { class: 'lbl', text: 'Doosre naam (note mein aise bhi likhte hain) – comma se alag' }), aliases,
    el('label', { class: 'lbl', text: 'Note' }), note, err,
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Cancel', onclick: () => Sheet.close() }), el('button', { class: 'btn ok', id: 'khPartySave', text: isNew ? 'Khata banayein' : 'Save', onclick: save }))));
  if (isNew && !v.name) setTimeout(() => name.focus(), 80);
}

/* ---- add / edit a manual entry ---- */
function khEvalAmount(s) {
  s = String(s || '').replace(/[₹,\s]/g, '').replace(/[×x]/gi, '*').replace(/÷/g, '/').replace(/[−–]/g, '-');
  if (!s) return NaN; if (!/^[\d.+\-*/()%]+$/.test(s)) return NaN;
  try { const v = math.evaluate(s); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
}
function khEntryForm({ pid, effect = 'gave', entry = null }) {
  const p = khParty(pid || (entry && entry.partyId)); if (!p) return;
  const reasons = KH.data.reasons;
  let reason = entry ? entry.reason : (reasons.find(r => r.effect === effect) || reasons[0]).id;
  let mode = entry ? entry.mode || '' : 'cash';
  const amt = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Rakam  (jaise 500 ya 12+7)', autocomplete: 'off', value: entry ? String(entry.amount) : '' });
  const date = el('input', { type: 'date', value: entry ? entry.date : khToday() });
  const note = el('input', { type: 'text', placeholder: 'Note (zaroori nahi)', autocomplete: 'off', value: entry ? entry.note || '' : '' });
  const rChips = el('div', { class: 'chips' }), mChips = el('div', { class: 'chips' }), prev = el('div', { class: 'kf-prev' }), err = el('p', { class: 'kf-err' });
  const cur = () => khReason(reason) || reasons[0];
  const drawR = () => rChips.replaceChildren(...reasons.map(r => el('button', { class: 'chip kr-' + r.effect + (reason === r.id ? ' active' : ''), 'data-r': r.id, onclick: () => { reason = r.id; drawR(); upd(); } }, el('i', { class: 'dot', style: `background:${KH_COLORS[r.color] || '#616161'}` }), r.name)));
  const drawM = () => mChips.replaceChildren(...[['cash', '💵 Cash'], ['upi', '📱 UPI / Bank'], ['', '—']].map(([k, l]) => el('button', { class: 'chip' + (mode === k ? ' active' : ''), text: l, onclick: () => { mode = k; drawM(); } })));
  const upd = () => {
    const v = khEvalAmount(amt.value); const r = cur(); let b = khBalance(p.id);
    if (entry && !entry.deleted) b -= entry.effect === 'gave' ? entry.amount : entry.effect === 'got' ? -entry.amount : 0;
    const after = Number.isFinite(v) ? b + (r.effect === 'gave' ? Math.abs(v) : r.effect === 'got' ? -Math.abs(v) : 0) : b;
    prev.replaceChildren(el('span', { text: (/[+\-*/]/.test(amt.value.replace(/^-/, '')) && Number.isFinite(v) ? `= ${khMoney(v)} · ` : '') + 'Iske baad: ' }), el('b', { class: 'kk-' + khCls(after), text: `${khMoney(after)} ${khWord(after)}` }), el('small', { text: '  ' + KH_EFFECTS[r.effect] }));
  };
  amt.addEventListener('input', upd); drawR(); drawM(); upd();
  const save = async () => {
    const v = khEvalAmount(amt.value);
    if (!Number.isFinite(v) || Math.abs(v) < 0.005) { err.textContent = 'Sahi rakam likhein'; amt.focus(); return; }
    if (!date.value) { err.textContent = 'Tareekh chunein'; return; }
    const r = cur(); const now = new Date().toISOString();
    let eff = r.effect, a = khRound(v); if (a < 0) { a = -a; eff = eff === 'gave' ? 'got' : eff === 'got' ? 'gave' : 'none'; }
    let e = entry;
    if (e) { (e.hist = e.hist || []).push({ at: now, amount: e.amount, effect: e.effect, reasonName: e.reasonName, date: e.date }); Object.assign(e, { amount: a, effect: eff, flip: false, reason: r.id, reasonName: r.name, date: date.value, mode, note: note.value.trim(), updatedAt: now, src: null }); }
    else { e = { id: newId('ke_'), partyId: p.id, date: date.value, amount: a, effect: eff, reason: r.id, reasonName: r.name, mode, note: note.value.trim(), src: null, createdAt: now, updatedAt: now, hist: [], msgs: [] }; KH.data.entries.push(e); }
    await khSave();
    Sheet.onClose = null; Sheet.close();
    toast(`✓ ${r.name} ${khMoney(a)} · ab ${khMoney(khBalance(p.id))} ${khWord(khBalance(p.id))}`, 3000);
    if (khHasPhone(p.phone) && khChannel(p) !== 'none') setTimeout(() => khOfferSend(p, [e], entry ? 'change' : 'add'), 300);
  };
  Sheet.show(el('div', { class: 'kf' }, el('h3', { text: (entry ? '✏️ Entry badlein · ' : (effect === 'got' ? '⬇️ Aapko mile · ' : '⬆️ Aapne diye · ')) + p.name }),
    el('label', { class: 'lbl', text: 'Reason' }), rChips,
    el('div', { class: 'kf-2' }, el('div', {}, el('label', { class: 'lbl', text: 'Rakam (₹)' }), amt), el('div', {}, el('label', { class: 'lbl', text: 'Tareekh' }), date)),
    prev, el('label', { class: 'lbl', text: 'Kaise' }), mChips, el('label', { class: 'lbl', text: 'Note' }), note, err,
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Cancel', onclick: () => Sheet.close() }), el('button', { class: 'btn ok', id: 'khEntrySave', text: 'Save', onclick: save }))));
  if (!entry) setTimeout(() => amt.focus(), 80);
}
function khOfferSend(p, entries, kind) {
  const lines = entries.map(e => ({ kind, date: e.date, reasonName: e.reasonName, amount: e.amount, old: e.hist && e.hist.length ? e.hist[e.hist.length - 1].amount : 0 }));
  const text = khMessage(p, lines); const ids = entries.map(e => e.id);
  const ta = el('textarea', { class: 'kp-msg', rows: 5 }); ta.value = text;
  const send = ch => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khSendJobs(khJobsFor(p, ta.value, ids, ch), '📨 ' + p.name, true), 260); };
  const def = khChannel(p);
  Sheet.show(el('div', {}, el('h3', { text: `📨 ${p.name} ko message bhejein?` }), ta,
    el('div', { class: 'kf-send' }, el('button', { class: 'btn ' + (def === 'sms' ? 'ok' : 'cancel'), text: '✉️ SMS', onclick: () => send('sms') }), el('button', { class: 'btn ' + (def !== 'sms' ? 'ok' : 'cancel'), text: '💬 WhatsApp', onclick: () => send('wa') })),
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Nahi', onclick: () => Sheet.close() }), el('button', { class: 'btn cancel', text: 'Dono', onclick: () => send('both') }))));
}
function khEntryDetail(e) {
  const p = khParty(e.partyId); const r = khReasonOf(e);
  const kv = (k, v) => v ? el('div', { class: 'kd-kv' }, el('span', { text: k }), el('b', { text: v })) : null;
  const hist = (e.hist || []).slice(-6).reverse().map(h => el('div', { class: 'kd-h', text: `${khLongDate(String(h.at).slice(0, 10))} ${khTime(h.at)}: ` + (h.kind === 'removed' ? 'hataya gaya' : `pehle ${khMoney(h.amount)} (${h.reasonName || ''}, ${khShortDate(h.date)})`) }));
  const msgs = (e.msgs || []).slice(-6).reverse().map(m => el('div', { class: 'kd-h', text: `${m.ch === 'sms' ? '✉️ SMS' : '💬 WhatsApp'} · ${khLongDate(String(m.at).slice(0, 10))} ${khTime(m.at)} ${m.ok ? '✓' : '✗'}` }));
  const btns = [];
  const orphan = e.src && !state.files.some(f => f.id === e.src.fileId);
  if (e.src && !orphan) btns.push(el('button', { class: 'btn ok', text: '📝 Note kholein', onclick: () => { Sheet.close(); khOpenNote(e); } }));
  else {
    btns.push(el('button', { class: 'btn cancel', text: '✏️ Badlein', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khEntryForm({ entry: e }), 250); } }));
    btns.push(el('button', { class: 'btn danger', text: '🗑 Delete', onclick: async () => {
      Sheet.onClose = null; Sheet.close(); const src = e.src; e.deleted = new Date().toISOString(); e.src = null; await khSave();
      toast('Entry delete hui', 5000, { label: 'Undo', run: async () => { delete e.deleted; e.src = src; await khSave(); } });
    } }));
  }
  Sheet.show(el('div', { class: 'kd' }, el('h3', { text: p ? p.name : 'Entry' }),
    el('div', { class: 'kd-big ' + e.effect }, el('span', { text: e.effect === 'gave' ? 'Aapne diye' : e.effect === 'got' ? 'Aapko mile' : 'Record' }), el('b', { text: khMoney(e.amount) })),
    kv('Tareekh', khLongDate(e.date)), kv('Reason', r.name), kv('Kaise', e.mode === 'upi' ? 'UPI / Bank' : e.mode === 'cash' ? 'Cash' : ''), kv('Note', e.note),
    e.src ? kv('Note se', `${e.src.fileTitle || 'Note'} · ${e.src.sheetName || ''}`) : null, e.src ? kv('Line', e.src.line) : null,
    e.src ? el('p', { class: 'msg', text: orphan ? 'Ye entry jis note se aayi thi wo ab nahi hai – yahin se badal ya hata sakte hain.' : 'Ye entry note se aayi hai. Badalne ke liye note ki line badlein aur phir Publish dabayein.' }) : null,
    hist.length ? el('label', { class: 'lbl', text: 'Badlav' }) : null, ...hist, msgs.length ? el('label', { class: 'lbl', text: 'Messages' }) : null, ...msgs,
    p && khHasPhone(p.phone) ? el('button', { class: 'kp-link', text: '📨 Is entry ka message bhejein', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khOfferSend(p, [e], 'add'), 260); } }) : null,
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Band', onclick: () => Sheet.close() }), ...btns)));
}
async function khOpenNote(e) {
  const src = e.src; if (!src) return;
  if (!state.files.some(f => f.id === src.fileId)) { toast('Ye note ab nahi hai (delete ho gaya)'); return; }
  closeAllPages();
  setTimeout(async () => {
    if (state.fileId !== src.fileId) await openFile(src.fileId);
    const i = state.sheets.findIndex(s => s.id === src.sheetId); if (i >= 0 && i !== state.sheetIdx) await switchSheet(i, { animate: false });
    const lines = getTexts(); let li = lines.findIndex(t => t.trim() === String(src.line || '').trim());
    if (li < 0 && src.pos != null && src.pos < lines.length) li = src.pos;
    if (li >= 0) { const [s, en] = lineBounds(li); ED.focus({ preventScroll: true }); ED.setSelectionRange(en, en); updateCurLine(); requestAnimationFrame(caretVisible); }
  }, 300);
}

/* ---- report ---- */
function khPeriodRange(per, from, to) {
  const t = khToday(); const d = new Date();
  if (per === 'today') return [t, t];
  if (per === 'week') { const a = new Date(); a.setDate(a.getDate() - 6); return [khISODay(a), t]; }
  if (per === 'month') return [khISODay(new Date(d.getFullYear(), d.getMonth(), 1)), t];
  if (per === 'last') return [khISODay(new Date(d.getFullYear(), d.getMonth() - 1, 1)), khISODay(new Date(d.getFullYear(), d.getMonth(), 0))];
  if (per === 'range') return [from || '0000-00-00', to || '9999-99-99'];
  return ['0000-00-00', '9999-99-99'];
}
function khReportData() {
  const R = KHU.rep; const [a, b] = khPeriodRange(R.period, R.from, R.to); const s = khNorm(R.q);
  const all = (KH.data ? KH.data.entries : []).filter(e => !e.deleted && (!R.pid || e.partyId === R.pid));
  let rows;
  if (R.pid) rows = khWithRunning(all.sort((x, y) => (x.date + (x.createdAt || '')).localeCompare(y.date + (y.createdAt || ''))), R.pid);
  else rows = all.sort((x, y) => (x.date + (x.createdAt || '')).localeCompare(y.date + (y.createdAt || ''))).map(e => ({ e, run: null }));
  const opening = R.pid ? (() => { const before = rows.filter(r => r.e.date < a); return before.length ? before[before.length - 1].run : khRound(+(khParty(R.pid) || {}).opening || 0); })() : null;
  rows = rows.filter(r => r.e.date >= a && r.e.date <= b && (!s || khNorm([khReasonOf(r.e).name, r.e.note, (khParty(r.e.partyId) || {}).name, r.e.src && r.e.src.line].join(' ')).includes(s)));
  let gave = 0, got = 0, rec = 0; for (const r of rows) { if (r.e.effect === 'gave') gave += r.e.amount; else if (r.e.effect === 'got') got += r.e.amount; else rec += r.e.amount; }
  const label = { all: 'Poora', today: 'Aaj', week: 'Pichhle 7 din', month: 'Is mahine', last: 'Pichhle mahine', range: `${a > '0000' ? khLongDate(a) : '…'} – ${b < '9999' ? khLongDate(b) : '…'}` }[R.period] || '';
  return { rows, gave: khRound(gave), got: khRound(got), rec: khRound(rec), opening, a, b, label: label + (s ? ` · "${R.q.trim()}"` : ''), filtered: !!s };
}
function khRenderReport(body, pg) {
  const R = KHU.rep; const p = R.pid ? khParty(R.pid) : null;
  const t = pg && pg.querySelector('.page-title'); if (t) t.textContent = p ? 'Report · ' + p.name : 'Report · Sab khate';
  const D = khReportData();
  const wrap = el('div', { class: 'kk' });
  const from = el('input', { type: 'date', value: R.from }), to = el('input', { type: 'date', value: R.to });
  from.addEventListener('change', () => { R.from = from.value; refreshKhataPages(); }); to.addEventListener('change', () => { R.to = to.value; refreshKhataPages(); });
  wrap.append(el('div', { class: 'chips kk-per' }, ...[['all', 'Sab'], ['today', 'Aaj'], ['week', '7 din'], ['month', 'Is mahine'], ['last', 'Pichhla mahina'], ['range', 'Tareekh se']].map(([v, l]) => el('button', { class: 'chip' + (R.period === v ? ' active' : ''), 'data-per': v, text: l, onclick: () => { R.period = v; refreshKhataPages(); } }))));
  if (R.period === 'range') wrap.append(el('div', { class: 'kf-2 kk-range' }, from, to));
  const q = el('input', { type: 'search', class: 'kk-q', placeholder: 'Entry khojein', value: R.q }); q.addEventListener('change', () => { R.q = q.value; refreshKhataPages(); });
  wrap.append(q);
  const net = D.gave - D.got;
  wrap.append(el('div', { class: 'kk-rsum' },
    p ? el('div', { class: 'r1' }, el('span', { text: 'Shuru ka baaki' }), el('b', { class: 'kk-' + khCls(D.opening), text: khMoney(D.opening) + ' ' + khWord(D.opening) })) : null,
    el('div', { class: 'r2' }, el('div', {}, el('span', { text: `${D.rows.length} entry` }), el('small', { text: D.label })), el('div', { class: 'gave' }, el('span', { text: 'Aapne diye' }), el('b', { text: khMoney(D.gave) })), el('div', { class: 'got' }, el('span', { text: 'Aapko mile' }), el('b', { text: khMoney(D.got) }))),
    D.filtered ? el('div', { class: 'r1' }, el('span', { text: 'Khoj ke hisaab se – baaki poore khate mein dekhein' }), el('b', { text: '' })) : p ? el('div', { class: 'r1' }, el('span', { text: 'Aakhri baaki' }), el('b', { class: 'kk-' + khCls(D.opening + net), text: khMoney(D.opening + net) + ' ' + khWord(D.opening + net) })) : el('div', { class: 'r1' }, el('span', { text: 'Fark (diye − mile)' }), el('b', { class: 'kk-' + khCls(net), text: khMoney(net) })),
    D.rec ? el('div', { class: 'r1' }, el('span', { text: 'Sirf record (nagad / cash sale…)' }), el('b', { text: khMoney(D.rec) })) : null));
  if (D.rows.length) {
    wrap.append(el('div', { class: 'kk-cols' }, el('span', { text: 'ENTRY' }), el('span', { class: 'gave', text: 'AAPNE DIYE' }), el('span', { class: 'got', text: 'AAPKO MILE' })));
    D.rows.slice().reverse().slice(0, 800).forEach(r => wrap.append(khEntryRow(r.e, r.run, !p)));
  } else wrap.append(el('div', { class: 'kk-empty', text: 'Is samay mein koi entry nahi.' }));
  wrap.append(el('div', { class: 'kk-btns' }, el('button', { class: 'btn cancel', text: '📝 Text share', onclick: () => khShareReportText(p, D) }), el('button', { class: 'btn ok', id: 'khRepImg', text: '🖼️ Image share', onclick: () => khShareReportImage(p, D) })));
  body.replaceChildren(wrap);
}
function khReportText(p, D) {
  const out = [`*${settings.khataShop || APP.name}* — ${p ? p.name : 'Sab khate'}`, D.label, ''];
  if (p && !D.filtered) out.push(`Shuru ka baaki: ${khMoney(D.opening)} ${khWord(D.opening)}`);
  for (const r of D.rows.slice(-80)) { const n = p ? '' : ((khParty(r.e.partyId) || {}).name || '') + ' · '; out.push(`${khShortDate(r.e.date)} ${n}${khReasonOf(r.e).name}: ${r.e.effect === 'got' ? '−' : r.e.effect === 'gave' ? '+' : ''}${khMoney(r.e.amount)}`); }
  if (D.rows.length > 80) out.push(`…aur ${D.rows.length - 80} entry`);
  out.push('', `Aapne diye: ${khMoney(D.gave)} · Aapko mile: ${khMoney(D.got)}`);
  if (p && !D.filtered) out.push(khBalanceLine(D.opening + D.gave - D.got));
  return out.join('\n');
}
async function khShareReportText(p, D) {
  const text = khReportText(p, D);
  if (Native.on) { try { await Native.shareText('Khata report', text); return; } catch (e) { return; } }
  if (navigator.share) { try { await navigator.share({ title: 'Khata report', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  toast((await copyText(text)) ? 'Report copy hui ✓' : 'Copy nahi hua');
}
function khDrawStatement(p, D) {
  const W = 1080, PAD = 40, ROW = 66, HEAD = p ? 250 : 210, rows = D.rows.slice(-300);
  const H = HEAD + 70 + rows.length * ROW + 250;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2E7D32'; x.fillRect(0, 0, W, 120);
  x.fillStyle = '#fff'; x.font = `800 44px ${FONT}`; x.textAlign = 'left'; x.fillText(settings.khataShop || APP.name, PAD, 72);
  x.font = `600 26px ${FONT}`; x.textAlign = 'right'; x.fillText(D.label, W - PAD, 72);
  x.fillStyle = '#111'; x.textAlign = 'left'; x.font = `800 40px ${FONT}`; x.fillText(p ? p.name : 'Sab khate – report', PAD, 178);
  if (p && !D.filtered) { x.font = `600 28px ${FONT}`; x.fillStyle = '#555'; x.fillText(`Shuru ka baaki: ${khMoney(D.opening)} ${khWord(D.opening)}`, PAD, 225); }
  let y = HEAD; const cD = PAD, cX = 210, cG = W - PAD - 420, cR = W - PAD - 220, cB = W - PAD;
  x.fillStyle = '#ECEFF1'; x.fillRect(PAD - 10, y, W - PAD * 2 + 20, 56);
  x.fillStyle = '#37474F'; x.font = `800 24px ${FONT}`; x.textAlign = 'left'; x.fillText('TAREEKH', cD, y + 37); x.fillText(p ? 'DETAIL' : 'NAAM · DETAIL', cX, y + 37);
  x.textAlign = 'right'; x.fillText('DIYE', cG + 180, y + 37); x.fillText('MILE', cR + 180, y + 37); if (p) x.fillText('BAAKI', cB, y + 37);
  y += 70;
  const fit = (s, w) => { if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  rows.forEach((r, i) => {
    if (i % 2) { x.fillStyle = '#F7F9F7'; x.fillRect(PAD - 10, y - 8, W - PAD * 2 + 20, ROW); }
    x.font = `700 28px ${FONT}`; x.fillStyle = '#333'; x.textAlign = 'left'; x.fillText(khShortDate(r.e.date), cD, y + 36);
    const nm = p ? '' : ((khParty(r.e.partyId) || {}).name || '') + ' · ';
    x.font = `600 27px ${FONT}`; x.fillText(fit(nm + [khReasonOf(r.e).name, r.e.note].filter(Boolean).join(' · '), (p ? cG : cG + 40) - cX - 20), cX, y + 36);
    x.textAlign = 'right'; x.font = `800 30px ${FONT}`;
    if (r.e.effect === 'gave') { x.fillStyle = '#C62828'; x.fillText(khMoney(r.e.amount), cG + 180, y + 36); }
    else if (r.e.effect === 'got') { x.fillStyle = '#1B7F4B'; x.fillText(khMoney(r.e.amount), cR + 180, y + 36); }
    else { x.fillStyle = '#757575'; x.font = `700 24px ${FONT}`; x.fillText('(' + khMoney(r.e.amount) + ')', cG + 180, y + 36); }
    if (p && r.run != null) { x.fillStyle = r.run > 0.5 ? '#C62828' : r.run < -0.5 ? '#1B7F4B' : '#555'; x.font = `700 26px ${FONT}`; x.fillText(khMoney(r.run), cB, y + 36); }
    y += ROW;
  });
  y += 20; x.fillStyle = '#2E7D32'; x.fillRect(PAD - 10, y, W - PAD * 2 + 20, 4); y += 60;
  x.textAlign = 'left'; x.fillStyle = '#C62828'; x.font = `800 32px ${FONT}`; x.fillText(`Aapne diye: ${khMoney(D.gave)}`, PAD, y);
  x.fillStyle = '#1B7F4B'; x.textAlign = 'right'; x.fillText(`Aapko mile: ${khMoney(D.got)}`, W - PAD, y);
  y += 70; const bal = p ? D.opening + D.gave - D.got : D.gave - D.got;
  x.textAlign = 'center'; x.fillStyle = '#111'; x.font = `900 40px ${FONT}`; if (!D.filtered) x.fillText(p ? khBalanceLine(bal) : `Fark: ${khMoney(bal)}`, W / 2, y);
  x.fillStyle = '#9A9A9A'; x.font = `600 22px ${FONT}`; x.fillText('Made with ' + APP.name, W / 2, H - 30);
  return c;
}
async function khShareReportImage(p, D) {
  try {
    const c = khDrawStatement(p, D); const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png'));
    const name = safeName('Khata ' + (p ? p.name : 'report') + ' ' + khToday()) + '.png';
    if (Native.on) { await Native.shareFile(name, blob, name); return; }
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    await saveBlob(blob, name); toast('Image save hui ✓');
  } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Image nahi bani'); }
}

/* ---- reasons (Udhaar, Jama, Nagad…) ---- */
function khRenderReasons(body) {
  const D = KH.data || khNormalize(null);
  const used = new Map(); for (const e of D.entries) if (!e.deleted) used.set(e.reason, (used.get(e.reason) || 0) + 1);
  body.replaceChildren(el('div', { class: 'kk' },
    el('p', { class: 'kk-note', text: 'Har entry ka reason aap khud tay karein. Reason batata hai ki baaki badhega, ghatega ya sirf record rahega. Note mein kisi line ke aakhir mein #reason likhkar us line ka reason badal sakte hain (jaise  gopi 500 #jama).' }),
    el('div', { class: 'kk-list' }, ...D.reasons.map(r => el('button', { class: 'kk-row', 'data-rid': r.id, onclick: () => khReasonForm(r) },
      el('span', { class: 'kk-av', style: `background:${KH_COLORS[r.color] || '#616161'};color:#fff`, text: r.name[0].toUpperCase() }),
      el('span', { class: 'mid' }, el('b', { text: r.name }), el('span', { text: KH_EFFECTS[r.effect] + ' · #' + khNorm(r.name).replace(/ /g, '') })),
      el('span', { class: 'kk-amt' }, el('span', { text: (used.get(r.id) || 0) + ' entry' }))))),
    el('button', { class: 'kk-fab', text: '＋ Naya reason', onclick: () => khReasonForm(null) })));
}
function khReasonForm(r) {
  const isNew = !r; let effect = r ? r.effect : 'gave', color = r ? r.color : 'purple';
  const name = el('input', { type: 'text', placeholder: 'Jaise: Advance, Return, Commission', value: r ? r.name : '', autocomplete: 'off' });
  const eff = el('div', { class: 'menu-list' }); const drawE = () => eff.replaceChildren(...Object.entries(KH_EFFECTS).map(([k, l]) => el('button', { class: 'menu-item' + (effect === k ? ' on' : ''), onclick: () => { effect = k; drawE(); } }, el('span', { class: 'ic', text: effect === k ? '◉' : '○' }), el('span', { text: l })))); drawE();
  const sw = el('div', { class: 'kf-sw' }); const drawC = () => sw.replaceChildren(...Object.entries(KH_COLORS).map(([k, v]) => el('button', { class: 'swatch' + (color === k ? ' active' : ''), style: `background:${v}`, 'aria-label': k, onclick: () => { color = k; drawC(); } }))); drawC();
  const err = el('p', { class: 'kf-err' });
  const n = r ? KH.data.entries.filter(e => e.reason === r.id && !e.deleted).length : 0;
  Sheet.show(el('div', { class: 'kf' }, el('h3', { text: isNew ? '＋ Naya reason' : '✏️ Reason badlein' }),
    el('label', { class: 'lbl', text: 'Naam' }), name, el('label', { class: 'lbl', text: 'Khate par asar' }), eff, el('label', { class: 'lbl', text: 'Rang' }), sw,
    !isNew && n ? el('p', { class: 'hint', text: `${n} purani entry is reason ki hain – unka hisaab waisa hi rahega, naya asar aage ki entries par lagega.` }) : null, err,
    el('div', { class: 'sheet-actions' },
      !isNew && KH.data.reasons.length > 1 ? el('button', { class: 'btn danger', text: 'Delete', onclick: async () => {
        if (n) { err.textContent = `${n} entry is reason ki hain – pehle unhe badlein`; return; }
        KH.data.reasons = KH.data.reasons.filter(x => x.id !== r.id); if (settings.khataReason === r.id) setSetting('khataReason', KH.data.reasons[0].id);
        await khSave(); Sheet.close(); toast('Reason delete hua');
      } }) : null,
      el('button', { class: 'btn ok', id: 'khReasonSave', text: 'Save', onclick: async () => {
        const nm = name.value.trim().slice(0, 30); if (!nm) { err.textContent = 'Naam likhein'; return; }
        if (KH.data.reasons.some(x => x !== r && khNorm(x.name) === khNorm(nm))) { err.textContent = 'Ye reason pehle se hai'; return; }
        if (r) Object.assign(r, { name: nm, effect, color }); else KH.data.reasons.push({ id: newId('kr_'), name: nm, effect, color });
        await khSave(); Sheet.close(); toast('✓ Reason save hua');
      } }))));
}

/* ---- ⚠ new name / tap on a line mark ---- */
function khTitleCase(s) { return String(s).replace(/\s+/g, ' ').trim().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()); }
function khUnknownSheet(it, after) {
  const sug = khSuggest(it.label);
  const done = () => { Sheet.onClose = null; Sheet.close(); render(true); khScheduleCount(); if (after) setTimeout(after, 280); };
  Sheet.show(el('div', { class: 'kf' }, el('h3', { text: `⚠ "${it.label}" ka khata nahi hai` }),
    el('p', { class: 'msg', text: `Line: ${it.raw}\nRakam: ${khMoney(it.amount || 0)} · ${it.reasonName || ''}` }),
    el('button', { class: 'btn ok kf-wide', id: 'khMakeParty', text: `＋ "${khTitleCase(it.label)}" ka naya khata banayein`, onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khPartyForm(null, () => { render(true); khScheduleCount(); if (after) after(); }, { name: khTitleCase(it.label) }), 260); } }),
    sug.length ? el('label', { class: 'lbl', text: 'Ya kya ye inme se koi hai? (doosra naam jud jaayega)' }) : null,
    ...sug.map(p => el('button', { class: 'menu-item', 'data-pid': p.id, onclick: async () => { p.aliases = [...(p.aliases || []), it.label]; p.updatedAt = new Date().toISOString(); await khSave(); toast(`✓ "${it.label}" ab ${p.name} ka doosra naam hai`); done(); } }, khAvatar(p), el('span', {}, p.name, el('span', { class: 'sub', text: khBalanceLine(khBalance(p.id)) })))),
    el('button', { class: 'kp-link', id: 'khIgnore', text: 'Ye naam kisi khate ka nahi hai – chhod dein', onclick: async () => { const k = khNorm(it.label); if (!KH.data.ignore.includes(k)) KH.data.ignore.push(k); await khSave(); toast(`"${it.label}" ko khata mein nahi bheja jaayega`); done(); } }),
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Band', onclick: () => Sheet.close() }))));
}
function khLineSheet(i) {
  const it = KH.last && KH.last.items.find(x => x.i === i); if (!it) return;
  if (it.unknown && !it.err) { khUnknownSheet(it); return; }
  const p = it.party;
  const status = it.err ? ['err', '✗ ' + it.err] : it.zero ? ['zero', 'Rakam 0 hai – khate mein nahi jaayegi'] : it.status === 'ok' ? ['ok', '✓ Khate mein publish ho chuki hai'] : it.status === 'changed' ? ['chg', `✎ Badli hai: ${khMoney(it.entry.amount)} ➜ ${khMoney(it.amount)} – Publish baaki`] : ['new', '↑ Nayi entry – Publish baaki'];
  const kv = (k, v) => el('div', { class: 'kd-kv' }, el('span', { text: k }), el('b', { text: v }));
  const f = khCfg(state.sheets[state.sheetIdx]).formula;
  Sheet.show(el('div', { class: 'kd' }, el('h3', { text: '📒 ' + (p ? p.name : it.label) }),
    el('div', { class: 'kd-st ' + status[0], text: status[1] }),
    kv('Line', it.raw), kv('Line ka total', fmtNum(it.x)), f && f !== 'x' ? kv('Formula', `${f}  →  ${khMoney(it.amount)}`) : kv('Rakam', khMoney(it.amount || 0)),
    kv('Reason', it.reasonName || ''), kv('Tareekh', khLongDate(it.date)), p ? kv('Abhi ka baaki', `${khMoney(khBalance(p.id))} ${khWord(khBalance(p.id))}`) : null,
    el('button', { class: 'kp-link', text: '⚙ Is tab ki khata setting (reason / formula)', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khTabSettings(state.sheetIdx), 260); } }),
    el('div', { class: 'sheet-actions' },
      p ? el('button', { class: 'btn cancel', text: '📒 Khata', onclick: () => { Sheet.close(); setTimeout(async () => { await openKhata(); khOpenParty(p.id); }, 260); } }) : null,
      el('button', { class: 'btn ok', text: '📤 Publish', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(khPublishFlow, 260); } }))));
}

/* ---- khata setting of one tab: on/off, reason, formula ---- */
function khTabSettings(idx = state.sheetIdx) {
  const sh = state.sheets[idx]; if (!sh) return;
  const c = khCfg(sh); let reason = c.reason;
  const on = el('input', { type: 'checkbox' }); on.checked = !!c.on;
  const formula = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'x', value: c.formula || 'x' });
  const num = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Number', autocomplete: 'off' });
  const round = el('input', { type: 'checkbox' }); round.checked = !!c.round;
  const rChips = el('div', { class: 'chips' }); const drawR = () => rChips.replaceChildren(...KH.data.reasons.map(r => el('button', { class: 'chip kr-' + r.effect + (reason === r.id ? ' active' : ''), 'data-r': r.id, onclick: () => { reason = r.id; drawR(); } }, el('i', { class: 'dot', style: `background:${KH_COLORS[r.color] || '#616161'}` }), r.name)), el('button', { class: 'chip', text: '＋ Naya', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => khReasonForm(null), 260); } })); drawR();
  // example value: the first entry line of this tab
  const texts = (idx === state.sheetIdx ? ED.value : sh.text).split('\n'); const calc = idx === state.sheetIdx ? state.calc : khCalc(sh.text);
  const ex = calc ? calc.lines.findIndex(l => l.kind === 'num' && l.label && !l.agg && !l.assign) : -1;
  const exX = ex >= 0 ? calc.lines[ex].value : 100, exText = ex >= 0 ? texts[ex].trim() : 'naam 100';
  const prev = el('div', { class: 'kf-prev' });
  const upd = () => { const f = formula.value.trim() || 'x'; let v = khApplyFormula(f, exX); if (round.checked && Number.isFinite(v)) v = Math.round(v); prev.className = 'kf-prev' + (Number.isFinite(v) ? '' : ' bad'); prev.textContent = Number.isFinite(v) ? `Jaise: "${exText}" = ${fmtNum(exX)}  →  khate mein ${khMoney(v)}${v < 0 ? ' (ulta: mile/diye badal jaayega)' : ''}` : 'Formula samajh nahi aaya – x ka use karein, jaise x*120'; };
  const ops = el('div', { class: 'chips' }, ...[['=', 'Jaisa hai'], ['*', '× Guna'], ['/', '÷ Bhaag'], ['+', '+ Jodo'], ['-', '− Ghatao']].map(([o, l]) => el('button', { class: 'chip', 'data-op': o, text: l, onclick: () => { if (o === '=') formula.value = 'x'; else { const n = parseFloat(num.value); formula.value = `x ${o} ${Number.isFinite(n) ? n : (o === '*' || o === '/' ? 2 : 10)}`; } upd(); } })));
  formula.addEventListener('input', upd); round.addEventListener('change', upd); num.addEventListener('input', () => { const m = formula.value.match(/^x\s*([*/+\-])\s*[\d.]+$/); if (m && num.value) { formula.value = `x ${m[1]} ${num.value}`; upd(); } }); upd();
  const err = el('p', { class: 'kf-err' });
  Sheet.show(el('div', { class: 'kf' }, el('h3', { text: `📒 Khata setting · tab "${sh.name}"` }),
    el('label', { class: 'kf-sw-row' }, el('span', { text: 'Is tab ki entries khate mein jaayen' }), el('span', { class: 'switch' }, on, el('span', { class: 'slider' }))),
    el('label', { class: 'lbl', text: 'Entry ka reason (is tab ki har line ka)' }), rChips,
    el('label', { class: 'lbl', text: 'Line ke total ko khate mein kaise jodein' }), ops, el('div', { class: 'kf-2' }, num, formula), prev,
    el('label', { class: 'kf-sw-row' }, el('span', { text: 'Poore rupaye mein round karein' }), el('span', { class: 'switch' }, round, el('span', { class: 'slider' }))),
    el('p', { class: 'hint', text: 'x = line ka total. Jaise  x*120 (rate),  x/2,  x+10,  x-5,  (x*120)+50.  Kisi ek line ka reason alag chahiye to line ke aakhir mein #jama jaisa likhein.' }), err,
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Cancel', onclick: () => Sheet.close() }), el('button', { class: 'btn ok', id: 'khTabSave', text: 'Save', onclick: () => {
      const f = formula.value.trim() || 'x'; if (!khFormulaOk(f)) { err.textContent = 'Formula galat hai'; return; }
      sh.khata = { on: on.checked, reason, formula: f, round: round.checked };
      Sheet.close(); scheduleSave(); render(true); khScheduleCount(); toast('✓ Tab ki khata setting save hui');
    } }))));
}

/* ---- settings page helpers ---- */
function khIgnoreSheet() {
  const box = el('div', {});
  const draw = () => box.replaceChildren(...(KH.data.ignore.length ? KH.data.ignore.map(k => el('div', { class: 'menu-item' }, el('span', { class: 'ic', text: '🚫' }), el('span', { style: 'flex:1', text: k }), el('button', { class: 'chip', text: 'Hatayein', onclick: async () => { KH.data.ignore = KH.data.ignore.filter(x => x !== k); await khSave(); draw(); } }))) : [el('p', { class: 'msg', text: 'Koi naam chhoda nahi gaya hai.' })]));
  draw();
  Sheet.show(el('div', {}, el('h3', { text: 'Chhode gaye naam' }), el('p', { class: 'msg', text: 'In naamon ki lines khate mein nahi jaati (jaise rent, total, kiraya).' }), box, el('div', { class: 'sheet-actions' }, el('button', { class: 'btn ok', text: 'Theek hai', onclick: () => Sheet.close() }))));
}

/* ---------------- backup ---------------- */
async function khMergeBackup(k) {
  await khLoad(); const inc = khNormalize(k); const D = KH.data; let n = 0;
  const idMap = new Map();
  for (const r of inc.reasons) if (!D.reasons.some(x => x.id === r.id)) { if (D.reasons.some(x => khNorm(x.name) === khNorm(r.name))) continue; D.reasons.push(r); }
  for (const p of inc.parties) {
    if (D.parties.some(x => x.id === p.id)) { idMap.set(p.id, p.id); continue; }
    const same = khMaps().names.get(khNorm(p.name));
    if (same) { idMap.set(p.id, same.id); continue; }
    D.parties.push(p); idMap.set(p.id, p.id); n++; KH.ver++;
  }
  const have = new Set(D.entries.map(e => e.id));
  for (const e of inc.entries) if (!have.has(e.id)) D.entries.push(Object.assign({}, e, { partyId: idMap.get(e.partyId) || e.partyId }));
  for (const x of inc.ignore) if (!D.ignore.includes(x)) D.ignore.push(x);
  for (const [f, t] of Object.entries(inc.pub)) if (!D.pub[f] || D.pub[f] < t) D.pub[f] = t;
  await khSave(); return n;
}

/* ---------------- pages & settings ---------------- */
Object.assign(SETTINGS_PAGES, {
  khata: { title: '📒 Khata book', cls: 'kpage', actions: () => [{ icon: 'publish', label: 'Publish', run: () => { closeAllPages(); setTimeout(khPublishFlow, 300); } }, { icon: 'settings', label: 'Khata settings', run: () => openPage('khataset') }], render: body => khRenderList(body) },
  kparty: { title: () => (khParty(KHU.pid) || {}).name || 'Khata', cls: 'kpage', render: (body, pg) => khRenderParty(body, pg) },
  kreport: { title: 'Report', cls: 'kpage', render: (body, pg) => khRenderReport(body, pg) },
  kreasons: { title: 'Reasons', cls: 'kpage', render: body => khRenderReasons(body) },
  khataset: { title: 'Khata book', items: [
    { t: 'switch', key: 'khataOn', icon: '📒', label: 'Khata book chalu', sub: 'Note ki naam wali entries khate mein jaa sakti hain' },
    { t: 'switch', key: 'khataMarks', icon: '✓', label: 'Note mein ✓ / ↑ / ⚠ nishan', sub: '✓ khate mein hai · ↑ publish baaki · ⚠ naya naam' },
    { t: 'action', icon: 'book', label: 'Khata book kholein', run: () => openKhata() },
    { t: 'section', label: 'Message' },
    { t: 'chips', key: 'khataChannel', icon: '📨', label: 'Message kaise jaaye (default)', sub: 'Har khate mein alag bhi chun sakte hain', options: [opt('sms', 'SMS'), opt('wa', 'WhatsApp'), opt('both', 'Dono'), opt('none', 'Koi nahi')] },
    { t: 'chips', key: 'khataWaApp', icon: '💬', label: 'WhatsApp app', options: [opt('auto', 'Apne aap'), opt('wa', 'WhatsApp'), opt('biz', 'WA Business')] },
    { t: 'text', key: 'khataShop', icon: '🏪', label: 'Dukaan / aapka naam', sub: 'Message aur report mein dikhega', placeholder: 'Jaise: Mahi Traders' },
    { t: 'text', key: 'khataShopPhone', icon: '📞', label: 'Aapka mobile number', sub: 'Message mein {phone} ki jagah', placeholder: '98xxxxxxxx' },
    { t: 'chips', key: 'khataLang', icon: '🔤', label: 'Message ki bhasha', options: [opt('hinglish', 'Hinglish'), opt('hindi', 'हिंदी'), opt('english', 'English')] },
    { t: 'note', text: 'Apna message format (khali chhodein to bhasha wala format lagega). Jagah: {naam} {entries} {baaki} {dukaan} {phone} {date}' },
    { t: 'textarea', key: 'khataMsg', rows: 6 },
    { t: 'action', icon: '👁', label: 'Message ka namoona dekhein', run: () => { const p = { name: 'Gopi', id: '_demo' }; const t = khFill(settings.khataMsg || khWords().tpl, { naam: 'Gopi', entries: [khEntryLine({ kind: 'add', date: khToday(), reasonName: 'Udhaar', amount: 19 }), khEntryLine({ kind: 'change', date: khToday(), reasonName: 'Udhaar', amount: 15, old: 11 })].join('\n'), baaki: khBalanceLine(2340), dukaan: settings.khataShop, phone: settings.khataShopPhone, date: khShortDate(khToday()) }); void p; docSheet('Message ka namoona', t); } },
    { t: 'section', label: 'Entry' },
    { t: 'nav', page: 'kreasons', icon: '🏷', label: 'Reasons (Udhaar, Jama, Nagad, Kharcha…)', sub: 'Apne reason banayein – baaki badhe, ghate ya sirf record' },
    { t: 'chips', key: 'khataReason', icon: '＋', label: 'Naye tab ka reason', options: () => (KH.data ? KH.data.reasons : KH_DEFAULT_REASONS).map(r => opt(r.id, r.name)) },
    { t: 'action', icon: '🚫', label: 'Chhode gaye naam', sub: 'Jo naam khate mein nahi jaate', run: () => khLoad().then(khIgnoreSheet) },
    { t: 'note', text: 'Kaise kaam karta hai:\n1. Note mein naam ke saath entry likhein – jaise  gopi 12+7\n2. Answer ke aage ⚠ dikhe to tap karke khata banayein\n3. Tab ka reason aur formula tab ke menu (tab pe tap) → Khata setting mein\n4. 📤 Publish dabayein – entries khate mein jaayengi aur SMS / WhatsApp chala jaayega\nEdit karte rehne se kuch nahi jaata – sirf Publish par.' }
  ] }
});
