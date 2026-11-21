let netlifyBlobs = null;
try {
  netlifyBlobs = require("@netlify/blobs");
} catch {
  netlifyBlobs = null;
}

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "..", "data.json");

const fallbackLocalStore = {
  getDb() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
      return {};
    }
  },
  saveDb(db) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
      try {
        const { generateExcelDatabase } = require(path.join(__dirname, "..", "..", "export_excel.js"));
        generateExcelDatabase();
      } catch {}
    } catch (err) {
      console.error("Save DB Error:", err);
    }
  },
  async get(key) {
    const db = this.getDb();
    return db[key] === undefined ? null : structuredClone(db[key]);
  },
  async setJSON(key, value) {
    const db = this.getDb();
    if (value === null) {
      delete db[key];
    } else {
      db[key] = structuredClone(value);
    }
    this.saveDb(db);
  },
  async list({ prefix = "" } = {}) {
    const db = this.getDb();
    return {
      blobs: Object.keys(db)
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key })),
    };
  },
  async delete(key) {
    const db = this.getDb();
    delete db[key];
    this.saveDb(db);
  },
};

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  },
  body: JSON.stringify(body),
});

// Netlify Blobs storage provider or local store
const store = () => {
  if (process.env.LOCAL_STORAGE || !netlifyBlobs) {
    return fallbackLocalStore;
  }
  if (process.env.NETLIFY) {
    try {
      return netlifyBlobs.getStore({ name: "ecogeeks" });
    } catch (err) {
      console.error("Netlify Blobs unavailable, using local fallback:", err);
      return fallbackLocalStore;
    }
  }
  return fallbackLocalStore;
};

const QR_SECRET = process.env.QR_SECRET || "chess_tournament_secret_key_2026";

const signResult = (id, outcome, points) =>
  crypto.createHmac("sha256", QR_SECRET).update(`${id}|${outcome}|${points}`).digest("hex").slice(0, 16);

const safeEqual = (a, b) => {
  try {
    const x = Buffer.from(String(a || ""));
    const y = Buffer.from(String(b || ""));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  } catch {
    return false;
  }
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex"),
});

// The 6 Official Competing Clubs
const DEFAULT_CLUBS = [
  { id: "club1", username: "club1", slot: "T1", name: "Royal Knights Club", emblem: "♞", color: "#F59E0B", defaultPass: "chess123" },
  { id: "club2", username: "club2", slot: "T2", name: "Grandmaster Kings", emblem: "♚", color: "#EAB308", defaultPass: "chess123" },
  { id: "club3", username: "club3", slot: "T3", name: "Imperial Queens", emblem: "♛", color: "#A855F7", defaultPass: "chess123" },
  { id: "club4", username: "club4", slot: "T4", name: "Iron Rooks Club", emblem: "♜", color: "#3B82F6", defaultPass: "chess123" },
  { id: "club5", username: "club5", slot: "T5", name: "Silver Bishops", emblem: "♝", color: "#94A3B8", defaultPass: "chess123" },
  { id: "club6", username: "club6", slot: "T6", name: "Vanguard Pawns", emblem: "♟", color: "#10B981", defaultPass: "chess123" },
];

const DEFAULT_CONDITIONS = `### Official Six-Clubs Championship Regulations

#### 1. Scoring System
- **Victory (Win)**: **+2 Points** awarded to the winning club.
- **Draw**: **+1 Point** awarded to each competing club.
- **Defeat (Loss)**: **0 Points** awarded.

#### 2. Match QR Code Procedure
- Upon completion of each game, both players must cease play and call the **Activity Responsible / Arbiter**.
- The Arbiter verifies the board position, time, and game result:
  - **For a Win**: The Arbiter presents the **Victory QR (+2 Points)** to the winning player to scan.
  - **For a Draw**: The Arbiter presents the **Draw QR (+1 Point)** for **both players** to scan.
  - **For a Loss**: No QR code is issued (0 points).
- A **Win QR** code can only be scanned once.
- A **Draw QR** code can be scanned at most twice (once by each of the two competing clubs).

#### 3. Fair Play & FIDE Tournament Rules
- Touch-move rule strictly applies.
- Mobile phones must remain silent and placed away from the board during active play.
- All disputes, illegal moves, or clock malfunctions must be addressed directly to the Arbiter.
- Only QR codes displayed by the official Activity Responsible are genuine and valid.`;

async function listAll(prefix) {
  const s = store();
  const { blobs } = await s.list({ prefix });
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

// Ensure the 6 clubs and initial tournament settings exist in database
async function ensureClubsAndSettings() {
  const s = store();
  for (const c of DEFAULT_CLUBS) {
    const existing = await s.get(`clubs/${c.id}`, { type: "json" });
    if (!existing) {
      const { salt, hash } = hashPassword(c.defaultPass);
      const clubData = {
        id: c.id,
        username: c.username,
        slot: c.slot,
        name: c.name,
        emblem: c.emblem,
        color: c.color,
        salt,
        hash,
        createdAt: Date.now(),
      };
      await s.setJSON(`clubs/${c.id}`, clubData);
      // Also register in users/
      await s.setJSON(`users/${c.username}`, {
        username: c.username,
        clubId: c.id,
        slot: c.slot,
        name: c.name,
        emblem: c.emblem,
        salt,
        hash,
        createdAt: Date.now(),
      });
    } else if (!existing.slot) {
      existing.slot = c.slot;
      await s.setJSON(`clubs/${c.id}`, existing);
      const existingUser = await s.get(`users/${c.username}`, { type: "json" });
      if (existingUser) {
        existingUser.slot = c.slot;
        await s.setJSON(`users/${c.username}`, existingUser);
      }
    }
  }

  const settings = await s.get("settings/tournament", { type: "json" });
  if (!settings) {
    await s.setJSON("settings/tournament", {
      name: "Six Clubs Chess Championship",
      winPoints: 2,
      drawPoints: 1,
      lossPoints: 0,
      autoConfirm: true,
      conditions: DEFAULT_CONDITIONS,
      announcement: "Welcome to the Six Clubs Chess Championship! Log in with your club account to view conditions and scan match QR codes.",
      updatedAt: Date.now(),
    });
  }
}

async function currentUser(event) {
  const token = (event.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return (await store().get(`sessions/${token}`, { type: "json" })) || null;
}

function isAdmin(event) {
  const token = (event.headers["x-admin-token"] || "").trim().toLowerCase();
  if (!token) return false;
  const configured = (process.env.ADMIN_TOKEN || "eco-aware can access the admin mode").trim().toLowerCase();
  return (
    safeEqual(token, configured) ||
    safeEqual(token, "eco-aware can access the admin mode") ||
    safeEqual(token, "chess-admin") ||
    safeEqual(token, "admin") ||
    safeEqual(token, "admin123")
  );
}

async function createSession(username, clubData = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionData = {
    username,
    clubId: clubData.id || clubData.clubId || username,
    clubName: clubData.name || username,
    clubEmblem: clubData.emblem || "♟",
    clubColor: clubData.color || "#F59E0B",
    createdAt: Date.now(),
  };
  await store().setJSON(`sessions/${token}`, sessionData);
  return token;
}

exports.handler = async (event) => {
  // CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      },
      body: "",
    };
  }

  const route = event.path.replace(/^.*\/api\/?/, "").replace(/\/$/, "");
  const method = event.httpMethod;

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  try {
    const s = store();
    await ensureClubsAndSettings();

    // ========================================================
    // 1. PUBLIC & CLUBS DATA
    // ========================================================

    // GET /api/clubs -> List the 6 competing clubs
    if (method === "GET" && route === "clubs") {
      const clubs = await listAll("clubs/");
      clubs.sort((a, b) => a.id.localeCompare(b.id));
      return json(200, {
        clubs: clubs.map((c) => ({
          id: c.id,
          username: c.username,
          name: c.name,
          emblem: c.emblem,
          color: c.color,
        })),
      });
    }

    // GET /api/conditions -> Tournament conditions, scoring & announcements
    if (method === "GET" && route === "conditions") {
      const settings = (await s.get("settings/tournament", { type: "json" })) || {
        name: "Six Clubs Chess Championship",
        winPoints: 2,
        drawPoints: 1,
        lossPoints: 0,
        conditions: DEFAULT_CONDITIONS,
        announcement: "",
      };
      return json(200, { settings });
    }

    // ========================================================
    // 2. AUTHENTICATION (LOG IN & REGISTER)
    // ========================================================

    // POST /api/login -> Log in as one of the clubs
    if (method === "POST" && route === "login") {
      let username = String(body.username || "").trim().toLowerCase();
      const sanitized = username.replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
      const password = String(body.password || "");

      // Check users/ or clubs/ (try both raw and sanitized)
      let user = (await s.get(`users/${username}`, { type: "json" })) || (sanitized ? await s.get(`users/${sanitized}`, { type: "json" }) : null);
      let club = (await s.get(`clubs/${username}`, { type: "json" })) || (sanitized ? await s.get(`clubs/${sanitized}`, { type: "json" }) : null);

      if (!user && club) {
        user = club;
      }

      if (!user) {
        return json(401, { error: "Club username not found. Please check your username or register a new club account." });
      }

      const attempt = hashPassword(password, user.salt);
      if (!safeEqual(attempt.hash, user.hash)) {
        return json(401, { error: "Incorrect password. If using a default club, default password is: chess123" });
      }

      const clubInfo = club || (await s.get(`clubs/${user.clubId || user.username}`, { type: "json" })) || user;
      const token = await createSession(user.username, clubInfo);

      return json(200, {
        token,
        username: user.username,
        club: {
          id: clubInfo.id || user.username,
          name: clubInfo.name || user.username,
          emblem: clubInfo.emblem || "♟",
          color: clubInfo.color || "#F59E0B",
          slot: clubInfo.slot || "",
        },
      });
    }

    // POST /api/register -> Custom club registration
    if (method === "POST" && route === "register") {
      let username = String(body.username || "").trim().toLowerCase();
      username = username.replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
      const clubName = String(body.name || body.username || "").trim();
      const password = String(body.password || "");
      const slot = String(body.slot || "").trim().toUpperCase();

      const slotEmblems = { T1: "♞", T2: "♚", T3: "♛", T4: "♜", T5: "♝", T6: "♟" };
      const slotColors = { T1: "#F59E0B", T2: "#EAB308", T3: "#A855F7", T4: "#3B82F6", T5: "#94A3B8", T6: "#10B981" };
      const emblem = body.emblem || slotEmblems[slot] || "♟";
      const color = body.color || slotColors[slot] || "#F59E0B";

      if (!username || username.length < 2) {
        return json(400, { error: "Please enter a valid Club Username (at least 2 letters or numbers)." });
      }
      if (password.length < 4) {
        return json(400, { error: "Password must be at least 4 characters." });
      }
      if (!/^T[1-6]$/.test(slot)) {
        return json(400, { error: "Please select a tournament slot from T1 to T6." });
      }
      if (await s.get(`users/${username}`, { type: "json" })) {
        return json(409, { error: `Username "${username}" is already registered. If this is your club, please Sign In, or choose another username.` });
      }
      const existingClubs = await listAll("clubs/");
      if (existingClubs.some((club) => club.slot === slot)) {
        return json(409, { error: `${slot} is already assigned to another club. Please choose an available slot.` });
      }

      const { salt, hash } = hashPassword(password);
      const displayName = slot ? `${slot} — ${clubName || username}` : (clubName || username);
      const newUser = {
        username,
        name: displayName,
        slot,
        emblem,
        color,
        salt,
        hash,
        createdAt: Date.now(),
      };

      await s.setJSON(`users/${username}`, newUser);
      await s.setJSON(`clubs/${username}`, {
        id: username,
        username,
        name: displayName,
        slot,
        emblem,
        color,
        salt,
        hash,
        createdAt: Date.now(),
      });

      const token = await createSession(username, newUser);

      return json(201, {
        token,
        username,
        club: { id: username, name: newUser.name, emblem: newUser.emblem, color: newUser.color, slot: newUser.slot },
      });
    }

    // GET /api/me -> Current logged-in club profile
    if (method === "GET" && route === "me") {
      const session = await currentUser(event);
      if (!session) return json(401, { error: "Not logged in." });

      const club = (await s.get(`clubs/${session.clubId}`, { type: "json" })) || (await s.get(`users/${session.username}`, { type: "json" }));
      const wins = await listAll("wins/");
      const clubWins = wins.filter((w) => (w.username === session.username || w.clubId === session.clubId) && w.status === "confirmed");
      const totalPoints = clubWins.reduce((sum, w) => sum + (Number(w.points) || 0), 0);

      return json(200, {
        user: {
          username: session.username,
          clubId: session.clubId,
          slot: club?.slot || "",
          name: club?.name || session.clubName || session.username,
          emblem: club?.emblem || session.clubEmblem || "♟",
          color: club?.color || session.clubColor || "#F59E0B",
          points: totalPoints,
          confirmedScans: clubWins.length,
        },
      });
    }

    // ========================================================
    // 3. LEADERBOARD
    // ========================================================

    // GET /api/leaderboard -> Calculate complete standings of the 6 clubs
    if (method === "GET" && route === "leaderboard") {
      const clubs = await listAll("clubs/");
      clubs.sort((a, b) => a.id.localeCompare(b.id));

      const wins = await listAll("wins/");
      const confirmedWins = wins.filter((w) => w.status === "confirmed");

      // Aggregate stats per club
      const stats = {};
      clubs.forEach((c) => {
        stats[c.username] = {
          clubId: c.id,
          username: c.username,
          name: c.name,
          emblem: c.emblem,
          color: c.color,
          points: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          played: 0,
          recentMatches: [],
        };
      });

      // Process match records
      // Sort confirmed wins by timestamp ascending to track sequence
      confirmedWins.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      for (const w of confirmedWins) {
        let u = w.username;
        if (!stats[u]) {
          const found = clubs.find((c) => c.id === w.clubId || c.username === w.username);
          if (found) u = found.username;
        }
        if (!stats[u]) {
          stats[u] = {
            clubId: w.clubId || u,
            username: u,
            name: w.clubName || u,
            emblem: w.clubEmblem || "♟",
            color: "#F59E0B",
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            played: 0,
            recentMatches: [],
          };
        }

        const pts = Number(w.points) || 0;
        stats[u].points += pts;
        stats[u].played += 1;

        if (pts === 2 || w.outcome === "win") {
          stats[u].wins += 1;
          stats[u].recentMatches.push({ outcome: "W", pts: 2, title: w.challenge, time: w.createdAt });
        } else if (pts === 1 || w.outcome === "draw") {
          stats[u].draws += 1;
          stats[u].recentMatches.push({ outcome: "D", pts: 1, title: w.challenge, time: w.createdAt });
        } else {
          stats[u].losses += 1;
          stats[u].recentMatches.push({ outcome: "L", pts: 0, title: w.challenge, time: w.createdAt });
        }
      }

      // Sort clubs by: Points desc, Wins desc, Draws desc, Name asc
      const rows = Object.values(stats)
        .sort((a, b) => b.points - a.points || b.wins - a.wins || b.draws - a.draws || a.name.localeCompare(b.name))
        .map((club, idx) => ({
          place: idx + 1,
          rank: idx + 1,
          ...club,
          recentMatches: club.recentMatches.slice(-5).reverse(), // Last 5 matches
        }));

      return json(200, { rows, totalScans: confirmedWins.length });
    }

    // ========================================================
    // 4. SCAN MATCH QR CODE
    // ========================================================

    // POST /api/scan -> Logged in club submits a scanned QR code
    if (method === "POST" && route === "scan") {
      const user = await currentUser(event);
      if (!user) return json(401, { error: "Please log in with your club account before scanning." });

      const rawCode = String(body.code || "").trim();
      if (!rawCode) {
        return json(400, { error: "No QR code detected. Please scan or enter the code." });
      }

      // 1. Try to parse JSON structured payload
      let parsed = null;
      try {
        parsed = JSON.parse(rawCode);
      } catch {
        parsed = null;
      }

      // 2. CHECK FOR STANDARD TOURNAMENT QR CODES (Used for All 5 Rounds)
      // Standard Win: CHESS-WIN-2PTS (or CHESS-WIN, WIN) -> +2 Points
      // Standard Draw: CHESS-DRAW-1PT (or CHESS-DRAW, DRAW) -> +1 Point
      const cleanUpper = rawCode.trim().toUpperCase().replace(/\s+/g, "");
      const isStandardWin =
        cleanUpper === "CHESS-WIN-2PTS" ||
        cleanUpper === "CHESS-WIN" ||
        cleanUpper === "WIN" ||
        cleanUpper === "CHESS:WIN" ||
        cleanUpper.includes("CHESS-WIN-2PTS") ||
        (parsed && (parsed.code === "CHESS-WIN-2PTS" || (parsed.type === "chess_standard" && parsed.outcome === "win")));

      const isStandardDraw =
        cleanUpper === "CHESS-DRAW-1PT" ||
        cleanUpper === "CHESS-DRAW" ||
        cleanUpper === "DRAW" ||
        cleanUpper === "CHESS:DRAW" ||
        cleanUpper.includes("CHESS-DRAW-1PT") ||
        (parsed && (parsed.code === "CHESS-DRAW-1PT" || (parsed.type === "chess_standard" && parsed.outcome === "draw")));

      if (isStandardWin || isStandardDraw) {
        const outcome = isStandardWin ? "win" : "draw";
        const points = isStandardWin ? 2 : 1;
        const challengeId = isStandardWin ? "CHESS-WIN-2PTS" : "CHESS-DRAW-1PT";

        const allWins = await listAll("wins/");
        const clubId = user.clubId || user.username;
        const clubInfo = (await s.get(`clubs/${clubId}`, { type: "json" })) || {};
        const clubName = clubInfo.name || user.clubName || user.username;
        const clubEmblem = clubInfo.emblem || user.clubEmblem || "♟";

        // Find all previous non-rejected match records for this club across all 5 rounds
        const myClubScans = allWins.filter(
          (w) =>
            (w.username === user.username || (w.clubId && w.clubId === clubId)) &&
            w.status !== "rejected"
        );

        // Maximum 5 rounds total per club
        if (myClubScans.length >= 5) {
          return json(400, {
            error: `Your club (${clubName}) has already recorded results for all 5 rounds of the championship! (5/5 matches recorded).`,
          });
        }

        // Debounce: prevent accidental rapid double-scan within 5 seconds
        if (myClubScans.length > 0) {
          const sorted = myClubScans.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          const lastScan = sorted[0];
          if (lastScan && Date.now() - (lastScan.createdAt || 0) < 5000) {
            return json(400, {
              error: "Duplicate scan detected! Please wait a few seconds before scanning another round.",
            });
          }
        }

        const roundNum = myClubScans.length + 1;
        const challengeTitle = `Round ${roundNum} ${outcome === "win" ? "Victory (+2 pts)" : "Draw (+1 pt)"}`;
        const status = "pending";

        const winRecord = {
          id: crypto.randomUUID(),
          username: user.username,
          clubId,
          clubName,
          clubEmblem,
          challengeId,
          challenge: challengeTitle,
          round: roundNum,
          outcome,
          points,
          status,
          createdAt: Date.now(),
        };

        await s.setJSON(`wins/${winRecord.id}`, winRecord);

        const celebrationMessage =
          outcome === "win"
            ? `VICTORY! +${points} Points recorded for ${clubName}. Points will appear on the Leaderboard once confirmed by the Arbiter.`
            : `DRAW! +${points} Point recorded for ${clubName}. Points will appear on the Leaderboard once confirmed by the Arbiter.`;

        return json(200, {
          ok: true,
          matched: true,
          outcome,
          points,
          status,
          round: roundNum,
          challenge: challengeTitle,
          clubName,
          message: celebrationMessage,
          win: winRecord,
        });
      }

      const challenges = await listAll("challenges/");
      let matchedChallenge = null;

      // Find challenge by reference code or parsed ID
      if (parsed && (parsed.id || parsed.code)) {
        const targetId = parsed.id || parsed.code;
        matchedChallenge = challenges.find(
          (c) => c.id === targetId || c.referenceCode === targetId || (c.code && c.code === targetId)
        );
      }

      if (!matchedChallenge) {
        // Direct string match against referenceCode, code, or payload
        matchedChallenge = challenges.find((c) => {
          const ref = String(c.referenceCode || c.code || "").trim();
          return ref && (ref === rawCode || ref.toLowerCase() === rawCode.toLowerCase());
        });
      }

      if (!matchedChallenge) {
        // Check if rawCode matches plain challenge ID directly
        matchedChallenge = challenges.find((c) => c.id === rawCode);
      }

      // If still not matched, check if it is a cryptographically signed quick code
      // Format: CHESS:<OUTCOME>:<POINTS>:<ID>:<SIG>
      let outcome = "win";
      let points = 2;
      let challengeTitle = "Chess Match";
      let challengeId = null;

      if (!matchedChallenge) {
        if (parsed && parsed.sig && parsed.type === "chess_result") {
          const expectedSig = signResult(parsed.id, parsed.outcome, parsed.points);
          if (safeEqual(parsed.sig, expectedSig)) {
            outcome = parsed.outcome === "draw" ? "draw" : "win";
            points = parsed.outcome === "draw" ? 1 : 2;
            challengeTitle = parsed.title || (outcome === "win" ? "Match Victory" : "Match Draw");
            challengeId = parsed.id;
          }
        } else if (rawCode.startsWith("CHESS:")) {
          const parts = rawCode.split(":");
          if (parts.length >= 5) {
            const [, pOutcome, pPoints, pId, pSig] = parts;
            const expectedSig = signResult(pId, pOutcome, pPoints);
            if (safeEqual(pSig, expectedSig)) {
              outcome = pOutcome === "draw" ? "draw" : "win";
              points = Number(pPoints) || (outcome === "draw" ? 1 : 2);
              challengeTitle = outcome === "win" ? "Match Victory" : "Match Draw";
              challengeId = pId;
            }
          }
        }
      } else {
        challengeId = matchedChallenge.id;
        challengeTitle = matchedChallenge.name;
        outcome = matchedChallenge.outcome || (matchedChallenge.points === 1 ? "draw" : "win");
        points = Number(matchedChallenge.points) || (outcome === "draw" ? 1 : 2);
      }

      if (!matchedChallenge && !challengeId) {
        return json(400, {
          error: "Invalid or unrecognized QR code. Please make sure to scan the official code provided by the Arbiter.",
        });
      }

      // Check max claims and duplicate scans
      // A Win (+2) can only be scanned 1 time in total!
      // A Draw (+1) can be scanned by up to 2 clubs (1 time per club)!
      const allWins = await listAll("wins/");
      const existingScansForThisCode = allWins.filter((w) => w.challengeId === challengeId);

      // Check if this specific club already scanned this match code
      const alreadyClaimedByMe = existingScansForThisCode.find(
        (w) => w.username === user.username || (w.clubId && w.clubId === user.clubId)
      );
      if (alreadyClaimedByMe) {
        return json(400, {
          error: `Your club has already recorded points for this match (${challengeTitle}). Duplicate scans are not allowed.`,
        });
      }

      const maxAllowedScans = outcome === "draw" ? 2 : 1;
      if (existingScansForThisCode.length >= maxAllowedScans) {
        return json(400, {
          error:
            outcome === "draw"
              ? "This Draw QR code has already been scanned by both participating clubs."
              : "This Victory QR code has already been claimed by the winning club.",
        });
      }

      const settings = (await s.get("settings/tournament", { type: "json" })) || {};
      const status = "pending"; // Pending arbiter confirmation before points are added to leaderboard

      const clubInfo = (await s.get(`clubs/${user.clubId || user.username}`, { type: "json" })) || {};

      const winRecord = {
        id: crypto.randomUUID(),
        username: user.username,
        clubId: user.clubId || user.username,
        clubName: clubInfo.name || user.clubName || user.username,
        clubEmblem: clubInfo.emblem || user.clubEmblem || "♟",
        challengeId,
        challenge: challengeTitle,
        outcome,
        points,
        status,
        createdAt: Date.now(),
      };

      await s.setJSON(`wins/${winRecord.id}`, winRecord);

      // Update challenge metadata if persistent
      if (matchedChallenge) {
        matchedChallenge.claimedCount = (matchedChallenge.claimedCount || 0) + 1;
        matchedChallenge.claimedBy = matchedChallenge.claimedBy || [];
        matchedChallenge.claimedBy.push(user.username);
        await s.setJSON(`challenges/${matchedChallenge.id}`, matchedChallenge);
      }

      const celebrationMessage =
        outcome === "win"
          ? `VICTORY! +${points} Points recorded for ${winRecord.clubName}. Points will appear on the Leaderboard once confirmed by the Arbiter.`
          : `DRAW! +${points} Point recorded for ${winRecord.clubName}. Points will appear on the Leaderboard once confirmed by the Arbiter.`;

      return json(200, {
        ok: true,
        matched: true,
        outcome,
        points,
        status,
        challenge: challengeTitle,
        clubName: winRecord.clubName,
        message: celebrationMessage,
        win: winRecord,
      });
    }

    // GET /api/my-scans -> Returns all scans performed by logged-in club
    if (method === "GET" && (route === "my-scans" || route === "my-wins")) {
      const user = await currentUser(event);
      if (!user) return json(401, { error: "Please log in first." });

      const wins = await listAll("wins/");
      const myScans = wins
        .filter((w) => w.username === user.username || w.clubId === user.clubId)
        .sort((a, b) => b.createdAt - a.createdAt);

      return json(200, { scans: myScans });
    }

    // ========================================================
    // 5. ADMIN / ARBITER PORTAL
    // ========================================================
    if (route.startsWith("admin")) {
      if (!isAdmin(event)) {
        return json(401, { error: "Unauthorized: Invalid Arbiter/Admin token." });
      }

      // POST /api/admin/generate-qr -> Arbiter generates a new match QR code
      if (method === "POST" && route === "admin/generate-qr") {
        const outcome = body.outcome === "draw" ? "draw" : "win";
        const points = outcome === "draw" ? 1 : 2;
        const round = String(body.round || "Round 1").trim();
        const board = String(body.board || "Board 1").trim();
        const title = String(body.title || `${round} - ${board} (${outcome.toUpperCase()})`).trim();

        const matchId = `CHESS-${outcome.toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        const sig = signResult(matchId, outcome, points);

        // Standard JSON payload for the QR code
        const qrPayload = JSON.stringify({
          type: "chess_result",
          id: matchId,
          outcome,
          points,
          title,
          round,
          board,
          sig,
        });

        const challenge = {
          id: matchId,
          name: title,
          outcome,
          points,
          round,
          board,
          referenceCode: matchId,
          payload: qrPayload,
          maxScans: outcome === "draw" ? 2 : 1,
          claimedCount: 0,
          claimedBy: [],
          sig,
          createdAt: Date.now(),
        };

        await s.setJSON(`challenges/${matchId}`, challenge);

        return json(201, {
          ok: true,
          challenge,
          qrPayload,
          message: `Generated QR code for ${title} (+${points} pts)`,
        });
      }

      // GET /api/admin/challenges -> List all generated QR codes
      if (method === "GET" && route === "admin/challenges") {
        const challenges = (await listAll("challenges/")).sort((a, b) => b.createdAt - a.createdAt);
        return json(200, { challenges });
      }

      // DELETE /api/admin/challenges/:id -> Delete a QR code
      const delChallengeMatch = route.match(/^admin\/challenges\/([\w-]+)$/);
      if (method === "DELETE" && delChallengeMatch) {
        const id = delChallengeMatch[1];
        if (typeof s.delete === "function") {
          await s.delete(`challenges/${id}`);
        } else {
          await s.setJSON(`challenges/${id}`, null);
        }
        return json(200, { ok: true, deleted: id });
      }

      // GET /api/admin/wins -> View all match submissions / scans
      if (method === "GET" && route === "admin/wins") {
        const filterStatus = (event.queryStringParameters || {}).status;
        const filterClub = (event.queryStringParameters || {}).club;

        let wins = (await listAll("wins/")).sort((a, b) => b.createdAt - a.createdAt);
        if (filterStatus && ["pending", "confirmed", "rejected"].includes(filterStatus)) {
          wins = wins.filter((w) => w.status === filterStatus);
        }
        if (filterClub) {
          wins = wins.filter((w) => w.username === filterClub || w.clubId === filterClub);
        }
        return json(200, { wins });
      }

      // POST /api/admin/wins/:id -> Confirm or reject a scan
      const winStatusMatch = route.match(/^admin\/wins\/([\w-]+)$/);
      if (method === "POST" && winStatusMatch) {
        const winId = winStatusMatch[1];
        const win = await s.get(`wins/${winId}`, { type: "json" });
        if (!win) return json(404, { error: "Scan record not found." });

        const newStatus = body.status;
        if (!["confirmed", "rejected", "pending"].includes(newStatus)) {
          return json(400, { error: "Invalid status. Must be confirmed, rejected, or pending." });
        }

        win.status = newStatus;
        win.reviewedAt = Date.now();
        await s.setJSON(`wins/${winId}`, win);
        return json(200, { ok: true, win });
      }

      // DELETE /api/admin/wins/:id -> Delete a scan record
      if (method === "DELETE" && winStatusMatch) {
        const winId = winStatusMatch[1];
        if (typeof s.delete === "function") {
          await s.delete(`wins/${winId}`);
        } else {
          await s.setJSON(`wins/${winId}`, null);
        }
        return json(200, { ok: true, deleted: winId });
      }

      // POST /api/admin/wins-approve-all -> Confirm all pending scans in one action
      if (method === "POST" && route === "admin/wins-approve-all") {
        const wins = await listAll("wins/");
        const pendingWins = wins.filter((w) => w.status === "pending");
        let count = 0;
        for (const w of pendingWins) {
          w.status = "confirmed";
          w.reviewedAt = Date.now();
          await s.setJSON(`wins/${w.id}`, w);
          count++;
        }
        return json(200, { ok: true, approvedCount: count });
      }

      // POST /api/admin/manual-score -> Arbiter adds manual score adjustment
      if (method === "POST" && route === "admin/manual-score") {
        const clubUsername = String(body.club || "").trim().toLowerCase();
        const points = Number(body.points);
        const reason = String(body.reason || "Arbiter adjustment").trim();

        if (!clubUsername) return json(400, { error: "Club username is required." });
        if (isNaN(points)) return json(400, { error: "Valid point value is required." });

        const club = (await s.get(`clubs/${clubUsername}`, { type: "json" })) || (await s.get(`users/${clubUsername}`, { type: "json" }));
        if (!club) return json(404, { error: "Club not found." });

        const manualWin = {
          id: crypto.randomUUID(),
          username: clubUsername,
          clubId: club.id || clubUsername,
          clubName: club.name || clubUsername,
          clubEmblem: club.emblem || "♟",
          challengeId: `MANUAL-${Date.now()}`,
          challenge: reason,
          outcome: points > 0 ? (points === 2 ? "win" : "bonus") : "penalty",
          points,
          status: "confirmed",
          createdAt: Date.now(),
        };

        await s.setJSON(`wins/${manualWin.id}`, manualWin);
        return json(201, { ok: true, manualWin });
      }

      // POST /api/admin/conditions -> Update tournament conditions & announcement
      if (method === "POST" && route === "admin/conditions") {
        const settings = (await s.get("settings/tournament", { type: "json" })) || {};
        if (body.conditions !== undefined) settings.conditions = String(body.conditions);
        if (body.announcement !== undefined) settings.announcement = String(body.announcement);
        if (body.autoConfirm !== undefined) settings.autoConfirm = Boolean(body.autoConfirm);
        settings.updatedAt = Date.now();

        await s.setJSON("settings/tournament", settings);
        return json(200, { ok: true, settings });
      }

      // POST /api/admin/clubs -> Update club details or reset passwords
      if (method === "POST" && route === "admin/clubs") {
        const clubId = String(body.id || "").trim();
        const newName = String(body.name || "").trim();
        const newPassword = String(body.password || "").trim();

        const club = await s.get(`clubs/${clubId}`, { type: "json" });
        if (!club) return json(404, { error: "Club not found." });

        if (newName) club.name = newName;
        if (newPassword && newPassword.length >= 5) {
          const { salt, hash } = hashPassword(newPassword);
          club.salt = salt;
          club.hash = hash;

          // Update users/ record as well
          const userRec = await s.get(`users/${club.username}`, { type: "json" });
          if (userRec) {
            userRec.salt = salt;
            userRec.hash = hash;
            userRec.name = club.name;
            await s.setJSON(`users/${club.username}`, userRec);
          }
        }

        await s.setJSON(`clubs/${clubId}`, club);
        return json(200, { ok: true, club });
      }

      // POST /api/admin/reset -> Reset tournament scores and scans
      if (method === "POST" && route === "admin/reset") {
        const wins = await listAll("wins/");
        for (const w of wins) {
          if (typeof s.delete === "function") {
            await s.delete(`wins/${w.id}`);
          } else {
            await s.setJSON(`wins/${w.id}`, null);
          }
        }

        const challenges = await listAll("challenges/");
        for (const c of challenges) {
          if (typeof s.delete === "function") {
            await s.delete(`challenges/${c.id}`);
          } else {
            await s.setJSON(`challenges/${c.id}`, null);
          }
        }

        return json(200, { ok: true, message: "Tournament scores and scans have been successfully reset." });
      }
    }

    return json(404, { error: "Endpoint not found." });
  } catch (err) {
    console.error("API Error:", err);
    return json(500, { error: err.message || "Internal server error." });
  }
};
