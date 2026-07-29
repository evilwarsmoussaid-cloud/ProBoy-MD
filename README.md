<div align="center">

<img src="utils/bot_image.jpg" alt="Evil Imranos Bot" width="220" style="border-radius:20px" />

# Evil Imranos Bot

**A fast, lightweight WhatsApp bot built on Baileys — no QR code needed.**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-3c873a?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc.9-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#-license-mit)
[![Made with](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red?style=for-the-badge)](#)

[Deploy](#-deployment) · [Connect Your Number](#-connect-your-number-pairing) · [Local Setup](#-local-setup) · [Plugin Dev](#-plugin-development) · [Buttons](#-interactive-buttons)

</div>

---

## ✨ Features

- 🧩 **Modular Command System** — every command is its own file in `commands/<category>/`, drop in a `.js` file and it just works.
- ⚡ **Optimized for Stability** — RAM‑friendly media handling (streaming, temp cleanup), reliable session handling.
- 🔁 **Auto‑Update on Boot** — checks for updates and applies them automatically.
- 🔑 **Pairing‑Code Connect, No QR** — link your number with a one‑time code, no session string to copy‑paste.
- 🔀 **Multi‑Session Support** — connect multiple WhatsApp numbers at once and manage them with `.connect`.
- 🎛️ **Real Interactive Buttons** — quick replies, copy‑code, links, call, and select‑menus, powered by [`gifted-btns`](https://www.npmjs.com/package/gifted-btns) with automatic safe fallback.
- 🛡️ **Owner Utilities** — restart, update from ZIP, and more owner‑only tools.
- 🗑️ **Built‑in Anti‑Delete** — capture deleted messages (fully configurable).
- 💾 **Session‑Scoped Settings** — each connected number keeps its own settings in `database/sessions/<phone>/`, so numbers never overwrite each other.

---

## 🚀 Deployment

### 1. Fork the repository

<div align="center">
  <a href="https://github.com/proboy315/ProBoy-MD/fork" target="_blank">
    <img src="https://img.shields.io/badge/Fork%20Repository-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Fork on GitHub">
  </a>
</div>

### 2. Deploy on a panel (e.g. Katabump)

<div align="center">
  <a href="https://dashboard.katabump.com/auth/login#d6b7d6" target="_blank">
    <img src="https://img.shields.io/badge/Deploy%20on-Katabump-orange?style=for-the-badge" alt="Deploy on Katabump">
  </a>
</div>

Any Node.js‑capable host/VPS/panel works — Katabump, Heroku‑style panels, or your own VPS.

### 3. Connect your number

Once the bot is running, follow the [pairing flow below](#-connect-your-number-pairing) — that's it, no manual session file editing required for the standard flow.

---

## 🔑 Connect Your Number (Pairing)

ProBoy‑MD connects with a **pairing code**, not a QR scan.

<div align="center">
  <a href="https://proboy-md.gt.tc/" target="_blank">
    <img src="https://img.shields.io/badge/Open-Pairing%20Site-2ecc71?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Open Pairing Site">
  </a>
</div>

1. Open **[proboy-md.gt.tc](https://proboy-md.gt.tc/)**.
2. Type your WhatsApp number **with country code** (e.g. `923001234567`) — a local `03xxxxxxxxx` Pakistani number is auto‑converted for you.
3. Tap **Generate & Copy**. A short pairing code appears (and is auto‑copied to your clipboard).
4. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead**.
5. Enter the pairing code you just got.
6. Done — the bot **connects automatically**. You never see or need to handle a raw session string for this flow.

> ℹ️ **What changed:** earlier versions required you to copy a full `ProBoy-MD!...` session string into `config.js` / `SESSION_ID`. That still works as a fallback (see below), but the pairing site is now the recommended, zero‑copy‑paste way to connect.

### Fallback: manual Session ID

If you already have a session string (starting with `ProBoy-MD!...`) from a previous setup, you can still use it directly:

```js
// config.js
sessionID: 'ProBoy-MD!H4.....'
```

Or set it as an environment variable when hosting:

```text
SESSION_ID=ProBoy-MD!H4.....
```

### Multi‑session (2+ numbers)

Provide multiple session strings comma‑separated:

```text
SESSION_ID=ProBoy-MD!....,ProBoy-MD!....
```

Or start the bot and paste multiple session IDs when prompted.

Owner‑only command (primary owner number only):

| Command | Effect |
|---|---|
| `.connect <ProBoy-MD!...>` | Add one or more (comma‑separated) sessions |
| `.connect status` | Show connected numbers + JSON template for `proboy.vercel.app/connect/` |
| `.connect del <number>` | Disconnect an extra number (primary bot number can't be removed) |

---

## 🛠 Local Setup

**1️⃣ Clone the repository**

```bash
git clone https://github.com/proboy315/ProBoy-MD.git
cd ProBoy-MD
```

**2️⃣ Install dependencies**

```bash
npm install
```

**3️⃣ Connect a session**

- **Recommended:** visit [proboy-md.gt.tc](https://proboy-md.gt.tc/) and use the pairing flow above.
- **Alternative:** leave `sessionID` empty in `config.js` — the bot will prompt for your phone number in the terminal and print a pairing code directly.
- **Legacy:** paste an existing `ProBoy-MD!...` session string into `config.js`.

**4️⃣ Run the bot**

```bash
npm start
```

### Production / Auto‑Restart (recommended)

Use a process manager so it restarts on crash:

```bash
npm i -g pm2
pm2 start index.js --name proboy-md --time
pm2 save
pm2 startup
```

---

## 🎛 Interactive Buttons

ProBoy‑MD ships with real, tappable WhatsApp buttons — quick replies, copy‑code, links, call, and select menus — powered by [`gifted-btns`](https://www.npmjs.com/package/gifted-btns).

```js
const { sendInteractiveMessage } = require('../../utils/gifted-btns');

await sendInteractiveMessage(sock, jid, {
  text: 'Your code is ready:',
  footer: 'ProBoy-MD',
  interactiveButtons: [
    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Code', copy_code: '56ZN-7D72' }) }
  ]
});
```

Full catalog (`quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`, and more), best practices, and copy‑paste templates for plugin authors live in **[`PROMPT.MD`](./PROMPT.MD) → Section 5**. If you're building a new command that sends buttons, read that section first — it's written so any AI coding assistant can generate correct, error‑free button code from it directly.

---

## 🤖 Plugin Development

To create new commands (plugins) for ProBoy‑MD, copy **[`PROMPT.MD`](./PROMPT.MD)** and hand it to an AI (Claude, ChatGPT, etc.) along with what you want built. It documents the full command contract, the `extra` helper object, config shape, and — importantly — the complete button system, so generated plugins work correctly on the first try.

Real, working examples to pattern‑match against:

| Command | File |
|---|---|
| TikTok downloader | `commands/media/tiktok.js` |
| Facebook downloader | `commands/media/facebook.js` |
| YouTube downloader | `commands/media/YouTube.js` |
| MediaFire downloader | `commands/media/mediafire.js` |
| CapCut downloader | `commands/media/capcut.js` |
| Google Drive downloader | `commands/media/gdrive.js` |
| Pinterest downloader | `commands/media/pinterest.js` |
| Pairing code + copy button | `commands/utility/pair.js` |
| Progressive read‑more + copy button | `commands/utility/readmore.js` |

Quick checklist when writing a new plugin:
- ✅ validate `args`, show usage if missing
- ✅ `await extra.react('⏳')` while processing, `'✅'`/`'❌'` on result
- ✅ wrap logic in `try/catch`, reply errors via `extra.reply`
- ✅ send buttons only via `utils/button.js` / `utils/gifted-btns.js` (see `PROMPT.MD §5`)
- ✅ keep button IDs `cmd_`‑prefixed, short, and stable

---

## 📁 Project Structure

```text
ProBoy-MD/
├── index.js                 # Baileys connection, boot, pairing
├── handler.js                # Message router / command dispatch
├── config.js                  # Core runtime config
├── database.js                 # JSON-backed settings storage
├── settings/                    # api-keys, apis, messages, social, templates
├── commands/
│   ├── general/
│   ├── media/
│   ├── utility/
│   ├── owner/
│   └── ...
└── utils/
    ├── commandLoader.js       # Deterministic command loading
    ├── gifted-btns.js          # Real button sender (gifted-btns wrapper)
    ├── button.js                # Button click routing + compat layer
    └── ...
```

---

## 🙏 Credits

- **SHAHAN** – Main developer & maintainer
- **Baileys** – WhatsApp Web API library (`@whiskeysockets/baileys`)
- **gifted-btns** – Interactive button support layer
- Other open‑source libraries listed in `package.json`

---

## ⚠️ Important Warning

- This bot is created **for educational purposes only**.
- This is **NOT** an official WhatsApp bot.
- Using third‑party bots **may violate WhatsApp's Terms of Service** and can lead to your account being **banned**.

> You use this bot **at your own risk**. The developers are **not responsible** for any bans, issues, or damages resulting from its use.

---

## 📝 Legal

- Not affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp Inc. or any of its affiliates or subsidiaries.
- Independent and unofficial software.
- **Do not spam** people using this bot.
- **Do not** use this bot for bulk messaging, harassment, or any illegal activities.
- The developers assume no liability and are not responsible for any misuse or damage caused by this program.

---

## 📄 License (MIT)

This project is licensed under the **MIT License**. You must:

- Use this software in compliance with all applicable laws and regulations.
- Keep the original license and copyright notices.
- Credit the original authors.
- Not use this for spam, abuse, or malicious purposes.

---

## 📜 Copyright Notice

Copyright (c) **2026 Professor**. All rights reserved.

This project contains code from various open‑source projects and AI tools, including but not limited to:

- **Baileys** – MIT License
- Other libraries as listed in `package.json`

<div align="center">

Made with ❤️ by **Shahan Ali**

</div>
