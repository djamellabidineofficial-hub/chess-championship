# Six Clubs Chess Championship Platform

An official digital competition platform designed for the Inter-Club Chess Championship between six clubs.

🌐 **Live GitHub Pages URL**: [https://djamellabidineofficial-hub.github.io/chess-championship/](https://djamellabidineofficial-hub.github.io/chess-championship/)  
📦 **GitHub Repository**: [https://github.com/djamellabidineofficial-hub/chess-championship](https://github.com/djamellabidineofficial-hub/chess-championship)

---

## Tournament Features

1. **6 Competing Clubs Authentication & Sync**:
   - Competing Clubs (T1 - T6):
     - **T1: Royal Knights Club** (`club1`)
     - **T2: Grandmaster Kings** (`club2`)
     - **T3: Imperial Queens** (`club3`)
     - **T4: Iron Rooks Club** (`club4`)
     - **T5: Silver Bishops** (`club5`)
     - **T6: Vanguard Pawns** (`club6`)
   - Pre-configured accounts for all 6 clubs (default password: `chess123`).
   - Dedicated Club Dashboard showing live standing rank, points, win/draw records, and match scan history.

2. **Official Conditions & Regulations**:
   - **Tournament Scoring System**:
     - **Victory (Win)**: **+2 Points**
     - **Draw**: **+1 Point**
     - **Defeat (Loss)**: **0 Points**
   - 5-Round Rotating League with different chess variants per round:
     - Round 1: Classic (10 min)
     - Round 2: Duck Chess
     - Round 3: Giveaway Chess (Antichess)
     - Round 4: 3-Check Chess
     - Round 5: Physical Relay Chess
   - Dual-language support (English and Arabic).
   - Step-by-step Activity Responsible & Arbiter QR protocol instructions.

3. **Match QR Code Scanning**:
   - High-performance camera scanner with animated targeting reticle and instant feedback.
   - Fallback manual code entry.
   - Cryptographic verification, round validation, and duplicate claim prevention.
   - **Arbiter Confirmation Workflow**: Scanned match points are held as pending until confirmed by the Arbiter before being added to the live leaderboard.

4. **Live Leaderboard & 3-Pillar Podium**:
   - Dynamic 3-pillar Olympic/FIDE chess podium for Top 3 clubs.
   - Complete 6-club standings table with points and match records.
   - Automatic live refresh every 10 seconds.

5. **Arbiter / Admin Portal**:
   - Permanent Standard QR Codes:
     - `CHESS-WIN-2PTS` (+2 Points)
     - `CHESS-DRAW-1PT` (+1 Point each)
   - Custom Round & Board QR Generator.
   - Submissions log with instant Approve, Reject, and batch "Approve All Pending" actions.
   - Manual score adjustments (bonuses and penalties).
   - 6 Clubs credentials manager.
   - One-click multi-sheet **Excel (.xls)** and **CSV** database export.

---

## Quick Start (Local Run)

Requires Node.js (version 18 or newer):

```bash
# 1. Start the server
node local-server.js

# Or using npm
npm start
```

Then open your browser at:
**`http://localhost:3000`**

---

## Default Credentials

- **The 6 Competing Clubs**:
  - `club1` / `chess123` (T1 — Royal Knights)
  - `club2` / `chess123` (T2 — Grandmaster Kings)
  - `club3` / `chess123` (T3 — Imperial Queens)
  - `club4` / `chess123` (T4 — Iron Rooks)
  - `club5` / `chess123` (T5 — Silver Bishops)
  - `club6` / `chess123` (T6 — Vanguard Pawns)

- **Activity Responsible / Arbiter Token**:
  - `eco-aware can access the admin mode` (configured in `.env`)

---

## Project Structure

```
Chess/
|-- .env                       # Tournament secrets
|-- data.json                  # Persistent JSON database (clubs, scores, match codes)
|-- export_excel.js            # Generator for Excel (.xls) and CSV tournament reports
|-- local-server.js            # Node.js server with Netlify Blobs emulation & Excel sync
|-- netlify.toml               # Netlify deployment configuration
|-- package.json               # Node.js project manifest
|-- netlify/
|   `-- functions/
|       `-- api.js             # Full serverless REST API
`-- public/
    |-- index.html             # Single-page tournament application
    |-- style.css              # Glassmorphic dark theme styling
    |-- app.js                 # Complete client-side tournament engine
    |-- chess_logo.svg         # Official collaboration chess logo
    |-- chess_logo.png         # High-resolution transparent chess logo
    |-- logo.png               # Main organizer club logo
    `-- vendor/
        |-- jsQR.js            # Client-side QR scanner library
        `-- qrcode.js          # QR code SVG/Canvas generator library
```

---

## Hosting on GitHub Pages

The frontend single-page application is hosted directly on GitHub Pages with full offline & static capabilities (including client-side storage, QR generation, QR camera scanner, and standings calculations):

- **Live URL**: [https://djamellabidineofficial-hub.github.io/chess-championship/](https://djamellabidineofficial-hub.github.io/chess-championship/)
- Served from the `gh-pages` branch.

To update GitHub Pages manually at any time:
```bash
# Push public/ directory to gh-pages branch
git subtree push --prefix public origin gh-pages
```

---

## Deployment to Netlify

This project is pre-configured for one-click deployment on Netlify:

1. Push this repository to GitHub.
2. Sign in to [Netlify](https://app.netlify.com/) and click **"Add new site" -> "Import an existing project"**.
3. Select your GitHub repository.
4. Netlify will automatically detect settings from `netlify.toml` (`publish = "public"`, `functions = "netlify/functions"`).
5. Add your environment variables in Netlify Site Settings:
   - `QR_SECRET`: A secret string for QR code signing
   - `ADMIN_TOKEN`: Your arbiter admin passphrase
6. Click **Deploy**!
