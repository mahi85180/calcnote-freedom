# CalcNote Freedom

Notepad + calculator in one app. Write one calculation per line (`gopi 12+7`, `Milk 2 × 28`, `rent = 15000`), and you see each answer next to the line and the total at the bottom. It works fully offline, and your notes stay on your phone.

## 📱 Install on your Android phone

1. Open **[Releases → Latest](../../releases/latest)** on your phone.
2. Download the file `CalcNote-Freedom-….apk`.
3. Open it. If Android asks, allow **Install unknown apps**.
4. Future versions install **over** the old one, and your files are kept.

Every push to `main` builds a new APK automatically (see the **Actions** tab).

## ✨ Features

| | |
|---|---|
| **Smart lines** | `name 13+27`, `Milk 2 × 28`, `Rent: ₹5,000`, `2500 + 18%`, `18% of 2500`, `rent = 15000` → `rent * 12`, `line2 + line3`, `ans / 2`, `sum`, `avg`, `// comment`, `5 km to mile`, scientific functions |
| **Copy** | Copy all (lines / lines = results / results only / report), select many lines, edit the whole note as plain text, tap an answer to copy it, drag-select across lines |
| **Editing** | Undo/redo, Enter splits a line, Backspace joins lines, paste many lines at once, line menu (move / duplicate / delete) |
| **Keypad** | 123 keypad, scientific ƒ(x) tab, **★ Keys tab with your own buttons** (long-press a key to edit it) |
| **Total** | Sum, Average, Min, Max, Count, Manual or your own formula (`total * 1.18`) |
| **Files** | Many files, search, rename, duplicate, delete, "Save file" dialog |
| **Share** | As an image, as text or as CSV. You can also back up and restore all files |
| **Custom** | Every feature can be switched on/off, and the toolbar and sidebar buttons can be chosen and reordered. You can also set the theme (light/dark/black), accent colour, operator colour, font, italic, font size, result column (width, left/right, divider), number format (1,00,000 / 100,000 / 100.000), decimal places, your own functions and constants (`gst(x) = x * 1.18`), and custom CSS |
| **Security** | PIN app lock |

## 🛠 Make your own changes

The whole app is in one file: **`src/index.html`**. Edit it (or ask Claude to), push to `main`, and GitHub builds a new APK.

```bash
npm install
npm run build        # src/index.html → docs/ (web app)
npm test             # automatic tests (needs: npx playwright install chromium)
npm run sync         # build + copy into the Android project
```

### Build by hand, with options
**Actions → Build Android APK → Run workflow**. You can choose:
- APK type: `release` or `debug`
- the version name
- whether to publish it on the Releases page
- whether to run the tests first

### Use as a website too (optional)
Go to **Settings → Pages**, choose Source **Deploy from a branch**, set Branch **main** and folder **/docs**, and save. The app then opens at `https://mahi85180.github.io/calcnote-freedom/` and works offline after the first visit.

### Your own signing key (optional, recommended)
By default the APK is signed with the key in `android/app/calcnote-freedom.keystore`, so that updates install over old versions. Because this repo is public, anyone could sign an app with that key. To use a private key instead, add these repository secrets: `KEYSTORE_BASE64` (the keystore file, base64), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. After switching keys, uninstall the old app once: back up first, then restore.

## Project layout
```
src/index.html              the app (HTML + CSS + JS)
scripts/build.js            builds docs/ (inlines math.js, PWA files)
scripts/icons.js            regenerates Android icons from assets/*.svg
docs/                       built web app (also used by the Android app)
android/                    Android (Capacitor) project
tests/test.js               end-to-end tests
.github/workflows/android.yml   test → build APK → publish release
```

Licenses: math.js (Apache-2.0), Capacitor (MIT). This app: MIT.
