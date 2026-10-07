/* =====================================================================
   GOOGLE DRIVE BACKUP – the user picks a place once (Google Drive → My Drive)
   through Android's own "Save to" screen; the app keeps rewriting that one
   file. The Google Drive app on the phone uploads it, so the data is safe
   even if the phone is lost. On a new phone: "Wapas laayein" → pick the file.
   ===================================================================== */
const CLOUD_KEYS = ['cloudUri', 'cloudName', 'cloudWhere', 'cloudAt', 'cloudErr', 'cloudCount'];
async function backupData(auto) {
  removeEmptyPendingDate(); await flushSave(); await khLoad(); await khSaving;
  const files = []; for (const m of state.files) { const r = await Store.get(m.id); if (r) files.push(Object.assign({}, r, { folder: m.folder, pinned: m.pinned })); }
  return { app: 'CalcNote', edition: 'Freedom', version: 35, exportedAt: new Date().toISOString(), auto: !!auto, folders: state.folders, files, trash: state.trash.length, khata: KH.data };
}
const backupCount = d => (d.files || []).filter(f => (f.rows || []).some(r => String(r.text || '').trim()) || (f.sheets || []).some(sh => (sh.rows || []).some(r => String(r.text || '').trim()))).length + ((d.khata && d.khata.parties) || []).length;
function setQuiet(k, v) { settings[k] = v; persistSettings(); }
function cloudPlace() {
  const w = String(settings.cloudWhere || '');
  return /google\.android\.apps\.docs/.test(w) ? 'Google Drive' : /onedrive|microsoft/i.test(w) ? 'OneDrive' : /dropbox/i.test(w) ? 'Dropbox' : /externalstorage|media|downloads/i.test(w) ? 'phone ka folder' : (w ? 'cloud' : '');
}
const Cloud = {
  busy: null,
  plugin() { return Native.on ? Native.p('BackupFile') : null; },
  get on() { return !!settings.cloudUri; },
  status() {
    if (!Native.on) return 'Sirf phone app mein (web mein "Backup all files" use karein)';
    if (!settings.cloudUri) return 'Band – abhi data sirf is phone mein hai';
    if (settings.cloudErr === 'lost') return '⚠ Ruk gaya – jagah dobara chunein';
    const at = settings.cloudAt ? khAgo(settings.cloudAt) : 'abhi nahi';
    return `✓ Chalu · ${cloudPlace() || 'cloud'} · ${settings.cloudName || ''} · aakhri backup: ${at}${settings.cloudErr ? ' · ⚠ pichhli baar fail' : ''}`;
  },
  async setup() {
    const p = this.plugin(); if (!p) { toast('Ye phone app mein hi chalta hai'); return false; }
    if (!(await new Promise(r => docSheetOnce(() => r(true), () => r(false))))) return false;
    let r; try { r = await p.create({ name: 'CalcNote-Freedom-Backup.json' }); } catch (e) { toast('Jagah chunne ki screen nahi khuli'); return false; }
    if (!r || r.cancelled || !r.uri) return false;
    if (settings.cloudUri && settings.cloudUri !== r.uri) { try { await p.release({ uri: settings.cloudUri }); } catch (e) {} }
    setQuiet('cloudUri', r.uri); setQuiet('cloudName', r.name || 'CalcNote-Freedom-Backup.json'); setQuiet('cloudWhere', r.where || ''); setQuiet('cloudErr', ''); setQuiet('cloudCount', 0);
    const ok = await this.run(true);
    if (ok && !/Google Drive/.test(cloudPlace())) toast('Backup chalu ✓ – behtar hai Google Drive chunein taaki phone kho jaane par bhi data bache', 5000);
    refreshOpenPage(); refreshKhataPages();
    return ok;
  },
  async run(manual) {
    const p = this.plugin(); if (!p || !settings.cloudUri) return false;
    if (this.busy) return this.busy;
    this.busy = (async () => {
      try {
        const d = await backupData(true); const n = backupCount(d);
        // never replace a good backup with an (almost) empty one – e.g. right after a reinstall
        if (!manual && settings.cloudCount >= 3 && n <= 1) { setQuiet('cloudErr', 'empty'); return false; }
        await p.write({ uri: settings.cloudUri, data: JSON.stringify(d) });
        setQuiet('cloudAt', new Date().toISOString()); setQuiet('cloudErr', ''); setQuiet('cloudCount', n);
        if (manual) toast(`✓ Backup ho gaya (${cloudPlace() || 'cloud'})`);
        return true;
      } catch (e) {
        const lost = e && (e.code === 'LOST' || e.code === 'NO_FILE' || /Permission lost/i.test(e.message || ''));
        setQuiet('cloudErr', lost ? 'lost' : String((e && e.message) || 'fail').slice(0, 80));
        if (manual || lost) toast(lost ? '⚠ Drive backup ruk gaya – Settings → Backup mein jagah dobara chunein' : 'Backup nahi hua – internet / Drive app check karein', 4500);
        return false;
      } finally { setTimeout(() => { this.busy = null; refreshOpenPage(); }, 0); }
    })();
    return this.busy;
  },
  auto(minHours) {                                                // called on start, resume, leaving the app, after publish
    if (!this.on || settings.cloudErr === 'lost') return;
    const last = settings.cloudAt ? Date.parse(settings.cloudAt) : 0;
    if (Date.now() - last >= minHours * 3600e3) this.run(false);
  },
  async restore() {
    const p = this.plugin();
    if (!p) { $('#importInput').click(); return; }
    let r; try { r = await p.open(); } catch (e) { toast('File nahi khuli'); return; }
    if (!r || r.cancelled || !r.text) return;
    const n = await importBackupText(r.text);
    if (n && !this.on) setTimeout(() => dialogConfirm({ title: '☁️ Google Drive backup chalu karein?', message: 'Taaki aage bhi data roz Drive pe surakshit rahe.', okText: 'Chalu karein' }).then(ok => ok && this.setup()), 3200);
  },
  async off() {
    const ok = await dialogConfirm({ title: 'Drive backup band karein?', message: 'Drive pe pehle se bani file wahin rahegi. Aage ke badlav uspar nahi jaayenge.', okText: 'Band karein', danger: true });
    if (!ok) return;
    const p = this.plugin(); if (p && settings.cloudUri) { try { await p.release({ uri: settings.cloudUri }); } catch (e) {} }
    CLOUD_KEYS.forEach(k => setQuiet(k, k === 'cloudCount' ? 0 : '')); refreshOpenPage(); refreshKhataPages(); toast('Drive backup band');
  }
};
/* short how-to before the system "Save to" screen opens */
function docSheetOnce(done, cancel) {
  Sheet.show(el('div', {}, el('h3', { text: '☁️ Google Drive backup' }),
    el('p', { class: 'msg', text: 'Agli screen mein:\n1. Upar ☰ menu se "Drive" (Google Drive) chunein\n2. "My Drive" ya koi folder kholein\n3. Neeche "SAVE" dabayein\n\nBas – iske baad app roz apne aap usi file mein backup karega. Naye phone mein: Settings → Backup → "Drive se wapas laayein".' }),
    el('div', { class: 'sheet-actions' }, el('button', { class: 'btn ok', id: 'cloudGo', text: 'Theek hai, chunein', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(done, 280); } }))), cancel);
}
/* first start with no data: offer to bring the old data back */
function welcomeRestore() {
  if (!Native.on || LS.get('cnf_welcome', '')) return;
  LS.set('cnf_welcome', '1');
  const empty = !state.files.some(f => f.lines > 0) && !(KH.data && KH.data.parties.length);
  if (empty) {
    Sheet.show(el('div', {}, el('h3', { text: '👋 Swagat hai!' }), el('p', { class: 'msg', text: 'Naya phone hai? Purana saara hisaab aur khate Google Drive ya backup file se wapas laa sakte hain.' }),
      el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Naya shuru karein', onclick: () => Sheet.close() }), el('button', { class: 'btn ok', text: '☁️ Wapas laayein', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => Cloud.restore(), 280); } }))));
  } else if (!Cloud.on) {
    Sheet.show(el('div', {}, el('h3', { text: '☁️ Naya: Google Drive backup' }), el('p', { class: 'msg', text: 'Abhi aapka saara hisaab sirf is phone mein hai. Phone kho gaya ya badla to data chala jaayega.\nGoogle Drive backup chalu karein – roz apne aap surakshit, naye phone mein ek tap mein wapas.' }),
      el('div', { class: 'sheet-actions' }, el('button', { class: 'btn cancel', text: 'Baad mein', onclick: () => Sheet.close() }), el('button', { class: 'btn ok', text: 'Chalu karein', onclick: () => { Sheet.onClose = null; Sheet.close(); setTimeout(() => Cloud.setup(), 280); } }))));
  }
}
