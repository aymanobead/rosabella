# Rozabella – روزابلا

> Elegant greeting card generator for flower shops — Windows desktop app

**Rozabella** is an offline Windows desktop application built with Electron.js that generates beautiful, print-ready greeting cards. Designed for flower shops, it supports both English and Arabic (RTL) text with proper shaping.

---

## Features

- 🌸 **5 built-in templates** — Wedding, Birthday, Graduation, Thank You, Love/Romantic
- 🌐 **Bilingual UI** — English / Arabic toggle with full RTL support
- ✍️ **Arabic text shaping** — Correct letter joining via Chromium SVG rendering
- 📐 **mm-based sizing** — A6, A5, 10×15 cm, or fully custom dimensions
- 🖼️ **Export PNG** — High-quality raster at configurable DPI (default 150)
- 📄 **Export PDF** — Card embedded in a correctly-sized PDF page
- 🖨️ **Print** — Direct print via Electron print dialog
- ⚡ **Live preview** — Debounced real-time preview as you type
- 📦 **Fully offline** — No internet required

---

## Quick Start (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm 9+
- Windows (for full testing), macOS/Linux for development

### Setup

```bash
git clone https://github.com/aymanobead/rosabella.git
cd rosabella
npm install
```

### Download Arabic Fonts

Place the following font files in `app/assets/fonts/`:

| File | Source |
|------|--------|
| `Cairo-Regular.ttf` | [Google Fonts – Cairo](https://fonts.google.com/specimen/Cairo) |
| `Cairo-SemiBold.ttf` | [Google Fonts – Cairo](https://fonts.google.com/specimen/Cairo) |
| `Amiri-Regular.ttf` | [Google Fonts – Amiri](https://fonts.google.com/specimen/Amiri) |

> **Note:** The app falls back to system fonts if these files are not present, but Arabic shaping quality will vary.

### Run in Development Mode

```bash
npm start
```

---

## Build Windows Installer

```bash
npm run build
```

Output will be in the `dist/` folder:
- `dist/Rozabella Setup 1.0.0.exe` — NSIS installer
- `dist/win-unpacked/` — Portable unpacked build

---

## Adding New Templates

Templates are drop-in — **no code changes required**.

### Step 1: Create background image

Create an SVG or PNG (recommended size: **1000×800 px**) and place it in:
```
app/assets/templates/<occasion>/<id>.svg
```

Supported occasions: `birthday`, `wedding`, `graduation`, `thankyou`, `love`

### Step 2: Update the manifest

Open `app/assets/templates/templates.json` and add:

```json
{
  "id": "birthday_02",
  "occasion": "birthday",
  "name": "Fun Birthday",
  "background": "birthday/birthday_02.svg",
  "textArea": { "x": 120, "y": 240, "w": 760, "h": 380 },
  "nameAreas": {
    "receiver": { "x": 120, "y": 160, "w": 760, "h": 60 },
    "sender":   { "x": 120, "y": 660, "w": 760, "h": 60 }
  },
  "styles": {
    "messageFont": "Cairo",
    "messageColor": "#1a237e",
    "maxFontSize": 60,
    "minFontSize": 18,
    "lineHeight": 1.35,
    "align": "center"
  }
}
```

### Manifest fields reference

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (alphanumeric + underscores) |
| `occasion` | One of: `birthday`, `wedding`, `graduation`, `thankyou`, `love` |
| `name` | Display name shown in the template dropdown |
| `background` | Path relative to `templates/` folder |
| `textArea` | `{x, y, w, h}` — message text area in the 1000×800 coordinate space |
| `nameAreas.receiver` | Optional area for receiver name |
| `nameAreas.sender` | Optional area for sender name |
| `styles.messageFont` | Font family (must be loaded in `fonts.css`) |
| `styles.messageColor` | CSS color for message text |
| `styles.maxFontSize` | Maximum font size (auto-reduces if text doesn't fit) |
| `styles.minFontSize` | Minimum font size (text will overflow if still too long) |
| `styles.lineHeight` | Line height multiplier (1.3–1.5 recommended) |
| `styles.align` | Text alignment: `center`, `left`, or `right` |

---

## Project Structure

```
rozabella/
├── app/
│   ├── main/
│   │   └── main.js              Electron main process
│   ├── renderer/
│   │   ├── index.html           Main app window
│   │   ├── styles.css           UI styles
│   │   ├── ui.js                Form handling + live preview
│   │   ├── i18n/
│   │   │   ├── en.json          English strings
│   │   │   └── ar.json          Arabic strings
│   │   └── canvas/
│   │       ├── cardEngine.js    Fabric.js card rendering engine
│   │       └── arabicText.js    RTL + Arabic shaping helper
│   └── assets/
│       ├── fonts/               Font files (TTF) + fonts.css
│       └── templates/
│           ├── templates.json   Template manifest
│           ├── wedding/
│           ├── birthday/
│           ├── graduation/
│           ├── thankyou/
│           └── love/
├── package.json
├── electron-builder.yml
└── README.md
```

---

## Arabic Support Details

Arabic text rendering is handled via `app/renderer/canvas/arabicText.js`:

1. **Text direction detection** — Automatically detects Arabic characters and sets `direction: rtl`.
2. **SVG rendering** — Text is rendered as SVG using Chromium's shaping engine, correctly joining Arabic letters.
3. **Image placement** — The SVG is rasterized to PNG and placed on the Fabric.js canvas.
4. **Fonts** — Cairo (modern) and Amiri (classical) are shipped locally for offline use.

---

## License

MIT
