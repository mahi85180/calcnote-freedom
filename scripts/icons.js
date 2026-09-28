// Regenerates Android launcher icons + splash screens from assets/*.svg
// Dev-only helper: needs Playwright (npm i -D playwright). Run: node scripts/icons.js
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const res = path.join(root, 'android/app/src/main/res');
const full = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const fg = fs.readFileSync(path.join(root, 'assets/icon-foreground.svg'), 'utf8');
const BG = '#5DB761';
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (html, w, h, file, transparent) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : BG}">${html}</body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: !!transparent });
  };
  const svgAt = (svg, s, extra = '') => svg.replace('<svg ', `<svg width="${s}" height="${s}" style="display:block;${extra}" `);
  for (const [d, k] of Object.entries(dens)) {
    const L = Math.round(48 * k), F = Math.round(108 * k);
    // legacy square icon (rounded) + round icon: crop the central 72/108 of the full artwork
    const inner = s => `<div style="width:${s}px;height:${s}px;overflow:hidden;border-radius:RADIUS;position:relative"><div style="position:absolute;left:${-s * 18 / 72}px;top:${-s * 18 / 72}px">${svgAt(full, s * 108 / 72)}</div></div>`;
    await shot(inner(L).replace('RADIUS', '18%'), L, L, path.join(res, `mipmap-${d}/ic_launcher.png`), true);
    await shot(inner(L).replace('RADIUS', '50%'), L, L, path.join(res, `mipmap-${d}/ic_launcher_round.png`), true);
    await shot(svgAt(fg, F), F, F, path.join(res, `mipmap-${d}/ic_launcher_foreground.png`), true);
  }
  // splash screens (legacy Android < 12)
  for (const f of fs.readdirSync(res).filter(x => x.startsWith('drawable'))) {
    const file = path.join(res, f, 'splash.png'); if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file); const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const s = Math.round(Math.min(w, h) * 0.42);
    await shot(`<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${svgAt(fg, s)}</div>`, w, h, file);
  }
  await shot(svgAt(full, 512), 512, 512, path.join(root, 'assets/icon-512.png'));
  await b.close(); console.log('icons done');
})();
