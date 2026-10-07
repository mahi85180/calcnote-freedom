# CalcNote Freedom

Notepad + calculator in one app. Write one calculation per line (`gopi 12+7`, `Milk 2 × 28`, `rent = 15000`), and you see each answer next to the line and the total at the bottom. It works fully offline, and your notes stay on your phone.

## 📱 Install on your Android phone

1. Open **[Releases → Latest](../../releases/latest)** on your phone.
2. Download the file `CalcNote-Freedom-….apk`.
3. Open it. If Android asks, allow **Install unknown apps**.
4. Future versions install **over** the old one, and your files are kept.

Every push to `main` builds a new APK automatically (see the **Actions** tab).

## ✨ Features

- **PDF** – any note (one tab or all tabs) and any khata report as an A4 PDF; "Sabka baaki" PDF. **Customer link** – every SMS / WhatsApp can carry a link: the customer sees their whole hisaab, a **Pay** button (PhonePe / GPay / Paytm / any UPI) and a UPI QR. The data travels inside the link (after #), nothing is stored on a server; the page is `docs/k/` (needs GitHub Pages on). UPI QR also on khata pictures and PDFs.

- **Google Drive backup** – choose "Drive" once in Android's Save screen; the app rewrites that backup file automatically (every few hours when changed, and when you leave the app). Notes, tabs and khata are all in it. New phone: install → "Wapas laayein" → pick the file. An empty phone never overwrites a good backup.

- **Khata book** – names in your notes (`gopi 12+7`) go into each person's khata. New names show ⚠ with one-tap "create khata". Nothing is posted until you press **📤 Publish**; then only the changes go in and an SMS (straight from your SIM) or WhatsApp message goes to each person. Every tab has its own reason (Udhaar, Jama, Nagad, Cash sale, Kharcha or your own) and formula (`x*120`, `x/2`, `x+10`…); `#jama` at the end of a line changes one line's reason. Khatabook-style screens: balances, entries with running balance, reports with picture / text share, reminders.
- **One-tap publish for everybody** – "Sabko: SMS / WhatsApp", all new names get a khata in one go, undo the last publish, notes with unpublished entries are listed in the khata book, remind everybody who owes money, UPI ID in messages, daily automatic backup on the phone (last 7 days).

- **Sheet tabs like Excel** – many tabs inside one file at the bottom; slide the tab bar, swipe the note left/right to change tab, long-press a tab to drag it, tap the active tab for rename / colour / duplicate / delete (with undo), ▦ shows all tabs with search and the grand total.

| | |
|---|---|
| **Smart lines** | `name 13+27`, `Milk 2 × 28`, `Rent: ₹5,000`, `2500 + 18%`, `18% of 2500`, `rent = 15000` → `rent * 12`, `line2 + line3`, `ans / 2`, `sum`, `avg`, `// comment`, `5 km to mile`, scientific functions |
| **Editing like any notes app** | Long-press select / copy / paste across lines, keyboard word suggestions, name suggestions from earlier entries, sum of selected lines, Copy all (lines / results / WhatsApp table / report) |
| **Dates & folders** | New files start with today's date, a new day adds its date automatically, tap 📅 to change a date · folders, pin, sort, recycle bin (30 days) |
| **Update inside the app** | Settings → Check for update downloads and installs the newest APK |
| **Editing** | Undo/redo, Enter splits a line, Backspace joins lines, paste many lines at once, line menu (move / duplicate / delete) |
| **Keypad** | 123 keypad, scientific ƒ(x) tab, **★ Keys tab with your own buttons** (long-press a key to edit it) |
| **Total** | Sum, Average, Min, Max, Count, Manual or your own formula (`total * 1.18`) |
| **Files** | Many files, search, rename, duplicate, delete, "Save file" dialog |
| **Share** | Bold, sharp table image (auto 1–4 columns so 100 entries fit), WhatsApp table text, CSV, backup/restore with folders |
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
