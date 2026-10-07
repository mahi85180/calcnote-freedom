/* =====================================================================
   PDF – pages are drawn on a canvas (so Hindi and every font works) and
   packed as JPEG pages into a small PDF file. No library needed.
   ===================================================================== */
const PDF_W = 1240, PDF_H = 1754;                                  // A4 at 150 dpi
const PDF_FONT = '"Roboto","Segoe UI",system-ui,"Noto Sans","Noto Sans Devanagari",Arial,sans-serif';
function b64ToBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function pdfFromCanvases(canvases, quality = 0.86) {
  const enc = new TextEncoder(); const parts = []; const offsets = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  const n = canvases.length; const pageIds = canvases.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] >>`);
  const PW = 595.28, PH = 841.89;
  canvases.forEach((c, i) => {
    const pid = pageIds[i], iid = pid + 1, cid = pid + 2;
    const jpg = b64ToBytes(c.toDataURL('image/jpeg', quality).split(',')[1]);
    const h = PW * c.height / c.width;                              // keep the canvas shape (normally A4)
    const ph = Math.max(PH, h);
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${ph.toFixed(2)}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    obj(iid, [`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
    const cs = `q ${PW} 0 0 ${h.toFixed(2)} 0 ${(ph - h).toFixed(2)} cm /Im${i} Do Q`;
    obj(cid, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  });
  const xref = len; const total = 3 + n * 3;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
/* QR code on a canvas (qrcode-generator, MIT) */
function qrCanvas(text, px = 360) {
  if (typeof qrcode !== 'function') return null;
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 3, cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
  const size = cell * (n + quiet * 2); const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return c;
}
const upiLink = (amount, note) => settings.khataUpi ? `upi://pay?pa=${encodeURIComponent(settings.khataUpi.trim())}&pn=${encodeURIComponent(settings.khataShop || APP.name)}${amount > 0 ? `&am=${(Math.round(amount * 100) / 100).toFixed(2)}` : ''}&cu=INR${note ? `&tn=${encodeURIComponent(note.slice(0, 40))}` : ''}` : '';

/* generic paginated table:  spec = { title, sub, cols:[{label,w,align}], rows:[{kind,cells:[{t,color,bold}]}], footer:[{t,color,big}], qr:{canvas,label} } */
function pdfPages(spec) {
  const M = 64, ROW = 50, HEAD = 190, COLH = 52, FOOT = 70;
  const pages = []; let c, x, y, pageNo = 0;
  const [pri, strong] = ACCENTS[settings.accent] || ACCENTS.green;
  const colX = []; { let cx = M; for (const col of spec.cols) { colX.push(cx); cx += col.w; } }
  const fit = (s, w) => { s = String(s); if (x.measureText(s).width <= w) return s; while (s.length > 1 && x.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  const newPage = () => {
    c = document.createElement('canvas'); c.width = PDF_W; c.height = PDF_H; x = c.getContext('2d'); pages.push(c); pageNo++;
    x.fillStyle = '#fff'; x.fillRect(0, 0, PDF_W, PDF_H);
    x.fillStyle = strong; x.fillRect(0, 0, PDF_W, 112);
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.font = `800 40px ${PDF_FONT}`; x.fillText(fit(spec.title, PDF_W - 2 * M - 260), M, 58);
    x.font = `600 24px ${PDF_FONT}`; x.textAlign = 'right'; x.fillText(spec.right || '', PDF_W - M, 58);
    x.textAlign = 'left'; x.fillStyle = '#333'; x.font = `600 26px ${PDF_FONT}`; if (spec.sub) x.fillText(fit(spec.sub, PDF_W - 2 * M), M, 150);
    y = HEAD;
    x.fillStyle = '#ECEFF1'; x.fillRect(M - 12, y, PDF_W - 2 * M + 24, COLH);
    x.fillStyle = '#37474F'; x.font = `800 22px ${PDF_FONT}`;
    spec.cols.forEach((col, i) => { x.textAlign = col.align === 'right' ? 'right' : 'left'; x.fillText(col.label, col.align === 'right' ? colX[i] + col.w - 8 : colX[i] + 4, y + COLH / 2); });
    y += COLH + 6;
  };
  const footerAll = () => pages.forEach((p, i) => { const g = p.getContext('2d'); g.textBaseline = 'middle'; g.fillStyle = '#9A9A9A'; g.font = `600 20px ${PDF_FONT}`; g.textAlign = 'left'; g.fillText('Made with ' + APP.name, M, PDF_H - 36); g.textAlign = 'right'; g.fillText(`Page ${i + 1} / ${pages.length}`, PDF_W - M, PDF_H - 36); });
  newPage();
  let zebra = 0;
  for (const r of spec.rows) {
    const h = r.kind === 'date' ? ROW + 10 : r.kind === 'gap' ? 16 : ROW;
    if (y + h > PDF_H - FOOT - 10) newPage();
    if (r.kind === 'gap') { y += h; continue; }
    if (r.kind === 'date') {
      x.fillStyle = r.bg || '#FFF176'; const t = String(r.cells[0].t); x.font = `800 27px ${PDF_FONT}`; const w = x.measureText(t).width + 40;
      x.fillRect((PDF_W - w) / 2, y + 6, w, h - 12); x.fillStyle = r.color || '#4A148C'; x.textAlign = 'center'; x.fillText(t, PDF_W / 2, y + h / 2); y += h; zebra = 0; continue;
    }
    if (r.kind === 'sum') { x.fillStyle = color(pri, .18); x.fillRect(M - 12, y, PDF_W - 2 * M + 24, h); }
    else if (zebra++ % 2) { x.fillStyle = '#F6F8F6'; x.fillRect(M - 12, y, PDF_W - 2 * M + 24, h); }
    spec.cols.forEach((col, i) => {
      const cell = r.cells[i]; if (!cell || cell.t == null || cell.t === '') return;
      x.fillStyle = cell.color || '#111'; x.font = `${cell.bold || r.kind === 'sum' ? 800 : 600} ${cell.size || 26}px ${PDF_FONT}`;
      if (col.align === 'right') { x.textAlign = 'right'; x.fillText(fit(cell.t, col.w - 12), colX[i] + col.w - 8, y + h / 2); }
      else { x.textAlign = 'left'; x.fillText(fit(cell.t, col.w - 12), colX[i] + 4, y + h / 2); }
    });
    y += h;
  }
  // totals + QR at the end
  const fh = (spec.footer || []).reduce((a, f) => a + (f.big ? 76 : 50), 30) + (spec.qr ? 330 : 0);
  if (y + fh > PDF_H - FOOT) newPage();
  y += 14; x.fillStyle = strong; x.fillRect(M - 12, y, PDF_W - 2 * M + 24, 4); y += 20;
  for (const f of spec.footer || []) {
    const h = f.big ? 76 : 50;
    if (f.big) { x.fillStyle = f.bg || color(pri, .22); x.fillRect(M - 12, y, PDF_W - 2 * M + 24, h - 8); }
    x.fillStyle = f.color || '#111'; x.font = `${f.big ? 900 : 700} ${f.big ? 36 : 27}px ${PDF_FONT}`;
    x.textAlign = 'left'; x.fillText(f.t, M, y + (h - 8) / 2); if (f.r) { x.textAlign = 'right'; x.fillText(f.r, PDF_W - M, y + (h - 8) / 2); }
    y += h;
  }
  if (spec.qr && spec.qr.canvas) {
    y += 16; const s = 270; x.drawImage(spec.qr.canvas, M, y, s, s);
    x.fillStyle = '#111'; x.textAlign = 'left'; x.font = `800 30px ${PDF_FONT}`; x.fillText(spec.qr.label || 'Scan karke pay karein', M + s + 30, y + 70);
    x.font = `600 24px ${PDF_FONT}`; x.fillStyle = '#555'; (spec.qr.lines || []).forEach((l, i) => x.fillText(l, M + s + 30, y + 120 + i * 38));
  }
  footerAll();
  return pages;
}
function color(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
async function shareBlobFile(blob, name, title) {
  if (Native.on) { try { await Native.shareFile(name, blob, title || name); } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Share nahi hua'); } return; }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: title || name }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  await saveBlob(blob, name); toast('PDF save hua ✓');
}

/* ---- note → PDF (this tab or all tabs) ---- */
function sheetRows(sh, isCur) {
  const texts = (isCur ? ED.value : sh.text).split('\n');
  const calc = isCur && state.calc ? state.calc : Engine.run(texts, engineOpts({ total: sh.total }));
  const amtCol = (AMOUNTS[settings.amountColor] || AMOUNTS.blue)[0];
  const rows = []; let n = 0;
  texts.forEach((t, i) => {
    const l = calc.lines[i] || {}; const text = t.trim();
    if (!text) { if (rows.length && rows[rows.length - 1].kind !== 'gap') rows.push({ kind: 'gap' }); return; }
    if (l.kind === 'date') { rows.push({ kind: 'date', cells: [{ t: text.replace(/📅/g, '').replace(/:$/, '') }], bg: HILITES[settings.dateHl] && settings.dateHl !== 'none' ? HILITES[settings.dateHl] : '#FFF176' }); n = 0; return; }
    if (l.kind === 'comment') { rows.push({ kind: 'row', cells: [{ t: '' }, { t: text.replace(/^(\/\/|#)\s*/, ''), color: '#777' }, { t: '' }] }); return; }
    const res = l.kind === 'num' ? fmtNum(l.value) : l.kind === 'other' ? l.display : '';
    rows.push({ kind: l.agg ? 'sum' : 'row', cells: [{ t: l.kind === 'num' && l.countable ? String(++n) : '', color: '#777' }, { t: text.replace(/\s#[^\s#\d][^\s#]*/g, '') }, { t: res, color: l.kind === 'num' && l.value < 0 ? '#C62828' : amtCol, bold: true }] });
  });
  while (rows.length && rows[rows.length - 1].kind === 'gap') rows.pop();
  const total = isCur ? totalString() : (sh.total.mode === 'count' ? String(sheetValue(sh)) : fmtNum(sheetValue(sh)));
  return { rows, total, label: sh.total.label || 'Total' };
}
function notePdfPages(all) {
  const cols = [{ label: 'S.NO', w: 90 }, { label: 'ITEM', w: 760 }, { label: 'AMOUNT', w: 262, align: 'right' }];
  const sheets = all ? state.sheets.map((sh, i) => [sh, i === state.sheetIdx]) : [[state.sheets[state.sheetIdx], true]];
  const rows = []; const footer = [];
  for (const [sh, cur] of sheets) {
    const r = sheetRows(sh, cur);
    if (all && state.sheets.length > 1) rows.push({ kind: 'date', cells: [{ t: '📑 ' + sh.name }], bg: '#C8E6C9', color: '#1B5E20' });
    rows.push(...r.rows);
    if (all && state.sheets.length > 1) { rows.push({ kind: 'sum', cells: [{ t: '' }, { t: `${r.label} · ${sh.name}` }, { t: r.total }] }); rows.push({ kind: 'gap' }); footer.push({ t: sh.name, r: r.total }); }
    else footer.push({ t: r.label, r: r.total, big: true, color: '#fff', bg: (ACCENTS[settings.accent] || ACCENTS.green)[1] });
  }
  if (all && state.sheets.length > 1) footer.push({ t: 'Sab tabs ka total', r: fmtNum(grandTotal()), big: true, color: '#fff', bg: (ACCENTS[settings.accent] || ACCENTS.green)[1] });
  const sub = [state.folder ? '📁 ' + folderName(state.folder) : '', !all && state.sheets.length > 1 ? '📑 ' + state.sheets[state.sheetIdx].name : '', all && state.sheets.length > 1 ? `${state.sheets.length} tabs` : ''].filter(Boolean).join('  ·  ');
  return pdfPages({ title: displayTitle(), right: fmtDate(), sub, cols, rows, footer });
}
async function sharePdf(all) {
  toast('PDF ban rahi hai…', 1200);
  await new Promise(r => setTimeout(r, 30));
  try {
    const pages = notePdfPages(all); const blob = pdfFromCanvases(pages);
    await shareBlobFile(blob, safeName(displayTitle() + (all ? ' (sab tabs)' : '')) + '.pdf', displayTitle());
  } catch (e) { console.error(e); toast('PDF nahi bani'); }
}
function pdfMenu() {
  if (state.sheets.length < 2) return sharePdf(false);
  dialogMenu('📄 PDF', [
    { key: 'one', icon: '📄', label: 'Is tab ka PDF', sub: state.sheets[state.sheetIdx].name },
    { key: 'all', icon: '📚', label: `Sab ${state.sheets.length} tabs ek PDF mein`, sub: 'Har tab alag hisse mein + sabka total' }
  ]).then(k => { if (k) sharePdf(k === 'all'); });
}
