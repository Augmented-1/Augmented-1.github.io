# Moving Boxes — Web App

A single-page web app that lets you label moving boxes with QR codes. Creating and scanning both happen in the same app; the QR codes encode the full box contents (items, photo, notes) directly into the URL so anyone can scan and view without installing anything.

## What's in this folder

```
boxes-app/
├── index.html       Main entry
├── styles.css       All styles (light + dark mode)
├── app.js           App logic (store, views, QR, scanner)
├── sw.js            Service worker (offline support)
├── manifest.json    PWA install metadata
├── icon.svg         Vector app icon
├── icon-192.png     Home-screen icon for iOS
├── icon-512.png     Home-screen icon (larger)
└── README.md        This file
```

Everything is static. No build step, no framework, no server.

## Deploying to Augmented-1.github.io

You said your GitHub Pages site is `Augmented-1.github.io`, so there are two paths depending on where you want the app to live. I'd suggest option A for a clean install.

### Option A — put it at a subpath like `augmented-1.github.io/boxes` (recommended)

This keeps your main `augmented-1.github.io` site intact and serves the app from a subfolder. It's the tidy choice if you have (or will have) other content at the root.

1. Go to your repo: `https://github.com/Augmented-1/Augmented-1.github.io`
2. Click the **Add file** dropdown → **Create new file**.
3. In the filename box, type `boxes/index.html` — GitHub will auto-create the `boxes/` folder.
4. Cancel out (don't save that empty file), then click **Add file → Upload files**.
5. Drag all 8 files from the `boxes-app/` folder onto the upload area.
6. **Important:** before committing, change the upload path. GitHub's UI shows a breadcrumb at the top — you can drag files into a subfolder. Easiest reliable way: use Git on your computer (steps below). If using the web UI, you may need to upload files first and then move them into a `/boxes` folder using the web editor.

If you want a one-command flow from your computer:

```bash
# In your terminal:
git clone https://github.com/Augmented-1/Augmented-1.github.io.git
cd Augmented-1.github.io
mkdir -p boxes
# Copy all files from boxes-app into the boxes folder
cp /path/to/boxes-app/* boxes/
git add boxes
git commit -m "Add moving boxes app"
git push
```

Your app will be live at **`https://augmented-1.github.io/boxes/`** within about a minute.

### Option B — put it at the root `augmented-1.github.io`

Only do this if you don't mind it replacing whatever's currently at the root. The app becomes the main thing that loads on your site.

1. Clone your repo locally (or use the web UI).
2. Copy all files from `boxes-app/` directly into the repo root.
3. Commit and push.

Your app will be live at **`https://augmented-1.github.io/`** within a minute.

### Checking it worked

- Open the URL on your iPhone in **Safari** (not Chrome — Safari handles PWA install better on iOS).
- The app should load, showing an empty box list.
- Tap the Share button (square with an arrow) → **Add to Home Screen**. It now lives on your home screen like a native app.

## Using it

1. Open the app (from home screen or URL).
2. Tap **+ New box** — add a label, an icon, room, priority, items, an optional photo, and optional notes.
3. Tap **Save & show QR** — you land on the QR label screen.
4. Tap **Print label** — prints a clean label with the QR code, item preview, and box metadata. Pairs well with a portable label printer or a regular printer (cut out and tape on).
5. Anyone with a phone camera can now scan the QR code and see the contents — no app install needed on their side.

### Camera scanning from inside the app

Tap the scanner icon in the top-right of the home screen. Point the camera at any box QR code. It navigates straight to the viewer showing contents.

## How it works

- **Data stays on your device.** Boxes live in your browser's IndexedDB, which is scoped to your device and not shared with anyone.
- **QR codes are self-contained.** The box's label, emoji, room, priority, items, photo, and notes are gzipped, base64-url-encoded, and appended to the app's URL as a `?box=…` parameter. When the app sees that parameter, it decodes and displays the box in read-only viewer mode.
- **No server involvement.** The data in a QR code never reaches any server. The viewer page is your own URL, loaded from GitHub's static CDN. Photos and item lists are encoded into the URL itself.
- **Offline-capable.** After the first visit, the service worker caches the app so it works without internet. Creating boxes, generating QRs, and viewing cached scan URLs all work offline.

## Tips for scanning reliability

- Photos are automatically resized to 400px and JPEG-compressed at 55% before encoding. Even so, a photo roughly doubles the QR's density.
- If you see a "dense QR warning" on the QR screen, the code may be hard for some scanners to read at small print sizes. Options: shrink or remove the photo, shorten some item names, or print the label larger.
- Boxes without photos usually produce very clean, easy-to-scan codes.

## Backup

Settings → Export all boxes. Downloads a JSON file you can put in Google Drive, email to yourself, etc. Import restores everything.

## Browser support

Works on:
- iOS Safari 16+
- Chrome / Edge / Firefox on desktop and Android
- Any Chromium browser with camera access for the scanner

Camera scanner requires HTTPS (GitHub Pages provides this automatically).

## Updating later

If you want to change anything — add a feature, tweak styles — just edit the files in your repo. GitHub Pages rebuilds and serves the new version in about a minute. The service worker will pick it up on the next visit.
