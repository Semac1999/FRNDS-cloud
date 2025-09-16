// api/[...route].js
// In-memory demo backend for FRNDS (Vercel Serverless).
// - Auto seeds an admin user + a few test users on cold start.
// - Simple auth, discover, chats, profile update, and first-message.
// NOTE: This is for demo purposes only (no DB, no auth tokens).
//       Do NOT use in production as-is.

const { parse } = require('url');

// In-memory stores (reset on cold start)
const users = [];
const likes = [];
const matches = [];
const messages = [];

/* ----------------- Utilities ----------------- */

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

function parseBody(req, limit = 7 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large')); try { req.destroy(); } catch {} }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const s = Buffer.concat(chunks).toString('utf8');
        resolve(s ? JSON.parse(s) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const uid = (p = 'u') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const getUserById = (id) => users.find((u) => u.id === id);
const getUserByUsername = (name) => users.find((u) => u.username === name);

function ensureMatch(a, b) {
  let m = matches.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  if (m) return m;
  m = { id: uid('m'), a, b };
  matches.push(m);
  return m;
}

/* ----------------- Auto seed (admin + demos) ----------------- */

function seedIfNeeded() {
  // Admin user (always present)
  if (!getUserByUsername('admin')) {
    users.push({
      id: uid(),
      username: 'admin',
      password: 'admin123',
      isAdmin: true,
      age: 24,
      gender: 'man',
      photos: [
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800',
        'https://images.unsplash.com/photo-1544006659-f0b21884ce1d?w=800',
        'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=800',
      ],
      bio: '',
      interests: [],
      socials: { instagram: 'admin.demo', snapchat: '', tiktok: '' },
      statusText: '👋 Admin account — welcome!',
      anthemUrl: '', // optional mp3 preview URL
      spotifyUrl: 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl', // example
    });
  }

  // A few friendly demo accounts (only add if missing)
  const demos = [
    {
      username: 'lina',
      password: 'test123',
      age: 21,
      gender: 'vrouw',
      photos: [
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800',
        'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=800',
        'https://images.unsplash.com/photo-1524504388940-1f64b7e25f64?w=800',
      ],
      socials: { instagram: 'lina.demo', snapchat: '', tiktok: 'lina_demo' },
      statusText: 'Be kind ✨',
      anthemUrl: '',
      spotifyUrl: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
    },
    {
      username: 'milan',
      password: 'test123',
      age: 23,
      gender: 'man',
      photos: [
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=800',
        'https://images.unsplash.com/photo-1527980965255-2e7a6aeae0c4?w=800',
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      ],
      socials: { instagram: 'milan.demo', snapchat: 'milan_demo', tiktok: '' },
      statusText: 'Gym & koffie ☕',
      anthemUrl: '',
      spotifyUrl: 'https://open.spotify.com/track/2Fxmhks0bxGSBdJ92vM42m',
    },
    {
      username: 'sofia',
      password: 'test123',
      age: 20,
      gender: 'vrouw',
      photos: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800',
        'https://images.unsplash.com/photo-1517842255-6f5dc3a4516f?w=800',
        'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=800',
      ],
      socials: { instagram: '', snapchat: '', tiktok: 'sofia_demo' },
      statusText: 'City trips 🛫',
      anthemUrl: '',
      spotifyUrl: 'https://open.spotify.com/track/3AJwUDP919kvQ9QcozQPxg',
    },
  ];

  for (const d of demos) {
    if (!getUserByUsername(d.username)) {
      users.push({
        id: uid(),
        username: d.username,
        password: d.password,
        isAdmin: false,
        age: d.age,
        gender: d.gender,
        photos: d.photos.slice(0, 3),
        bio: '',
        interests: [],
        socials: d.socials,
        statusText: d.statusText,
        anthemUrl: d.anthemUrl,
        spotifyUrl: d.spotifyUrl,
      });
    }
  }
}

// Call seed on module load (cold start) and also on each request (idempotent).
seedIfNeeded();

/* ----------------- Main handler ----------------- */

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  // Ensure seeded (idempotent).
  seedIfNeeded();

  const u = new URL(req.url, 'https://dummy');
  const pathname = u.pathname.replace(/^\/api/, '');
  const { query } = parse(req.url, true);

  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true, users: users.length, matches: matches.length });
  }

  /* -------- Auth -------- */

  if (req.method === 'POST' && pathname === '/register') {
    try {
      const body = await parseBody(req);
      const {
        username, password, age, gender,
        photos = [], bio = '', interests = [],
        socials = {}, statusText = '', anthemUrl = '', spotifyUrl = '',
        photoCaptions = [] // optional string[] for each photo
      } = body || {};

      if (!username || !password) return send(res, 400, { message: 'username/password vereist' });
      if (getUserByUsername(username)) return send(res, 409, { message: 'Gebruikersnaam bestaat al' });

      const user = {
        id: uid(),
        username,
        password,
        isAdmin: false,
        age: Number.isFinite(Number(age)) ? Number(age) : null,
        gender: gender === 'vrouw' ? 'vrouw' : 'man',
        photos: Array.isArray(photos) ? photos.slice(0, 3) : [],
        photoCaptions: Array.isArray(photoCaptions) ? photoCaptions.slice(0, 3) : [],
        bio: typeof bio === 'string' ? bio : '',
        interests: Array.isArray(interests) ? interests : [],
        socials: {
          instagram: typeof socials.instagram === 'string' ? socials.instagram : '',
          snapchat: typeof socials.snapchat === 'string' ? socials.snapchat : '',
          tiktok: typeof socials.tiktok === 'string' ? socials.tiktok : '',
        },
        statusText: typeof statusText === 'string' ? statusText : '',
        anthemUrl: typeof anthemUrl === 'string' ? anthemUrl : '',
        spotifyUrl: typeof spotifyUrl === 'string' ? spotifyUrl : '',
      };
      users.push(user);
      const { password: _, ...safe } = user;
      return send(res, 201, { user: safe });
    } catch (e) {
      return send(res, 400, { message: e.message || 'Bad Request' });
    }
  }

  if (req.method === 'POST' && pathname === '/login') {
    try {
      const body = await parseBody(req);
      const { username, password } = body || {};
      const user = users.find((u) => u.username === username && u.password === password);
      if (!user) return send(res, 401, { message: 'Ongeldige inlog' });
      const { password: _, ...safe } = user;
      return send(res, 200, { user: safe });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  /* -------- Profile update -------- */

  if (req.method === 'POST' && pathname === '/update-profile') {
    try {
      const body = await parseBody(req);
      const { userId, statusText, socials, anthemUrl, spotifyUrl, photos, photoCaptions } = body || {};
      if (!userId) return send(res, 400, { message: 'userId vereist' });
      const user = getUserById(userId);
      if (!user) return send(res, 404, { message: 'User niet gevonden' });

      if (typeof statusText === 'string') user.statusText = statusText;
      if (socials && typeof socials === 'object') {
        user.socials = {
          instagram: typeof socials.instagram === 'string' ? socials.instagram : (user.socials?.instagram || ''),
          snapchat: typeof socials.snapchat === 'string' ? socials.snapchat : (user.socials?.snapchat || ''),
          tiktok: typeof socials.tiktok === 'string' ? socials.tiktok : (user.socials?.tiktok || ''),
        };
      }
      if (typeof anthemUrl === 'string') user.anthemUrl = anthemUrl;
      if (typeof spotifyUrl === 'string') user.spotifyUrl = spotifyUrl;
      if (Array.isArray(photos) && photos.length) user.photos = photos.slice(0, 3);
      if (Array.isArray(photoCaptions)) user.photoCaptions = photoCaptions.slice(0, 3);

      const { password: _, ...safe } = user;
      return send(res, 200, { user: safe });
    } catch (e) {
      return send(res, 400, { message: e.message || 'Bad Request' });
    }
  }

  /* -------- Discover / Like / First message -------- */

  if (req.method === 'GET' && pathname === '/users') {
    const uid = query.userId;
    if (!uid) return send(res, 400, { message: 'userId vereist' });
    const list = users
      .filter((u) => u.id !== uid)
      .map(({ password, ...safe }) => safe);
    return send(res, 200, { users: list });
  }

  if (req.method === 'POST' && pathname === '/like') {
    try {
      const body = await parseBody(req);
      const { fromUserId, toUserId } = body || {};
      if (!fromUserId || !toUserId) return send(res, 400, { message: 'fromUserId/toUserId vereist' });
      if (!getUserById(fromUserId) || !getUserById(toUserId)) return send(res, 404, { message: 'User niet gevonden' });

      if (!likes.some((l) => l.fromUserId === fromUserId && l.toUserId === toUserId)) {
        likes.push({ fromUserId, toUserId });
      }
      const mutual = likes.some((l) => l.fromUserId === toUserId && l.toUserId === fromUserId);
      if (mutual) {
        const m = ensureMatch(fromUserId, toUserId);
        return send(res, 200, { message: "It's a match!", matchId: m.id });
      }
      return send(res, 200, { message: 'Like geregistreerd' });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  // Immediately create a match + first message (for “openingsbericht” flow)
  if (req.method === 'POST' && pathname === '/first-message') {
    try {
      const body = await parseBody(req);
      const { fromUserId, toUserId, message } = body || {};
      if (!fromUserId || !toUserId || !message) {
        return send(res, 400, { message: 'fromUserId/toUserId/message vereist' });
      }
      if (!getUserById(fromUserId) || !getUserById(toUserId)) {
        return send(res, 404, { message: 'User niet gevonden' });
      }
      const m = ensureMatch(fromUserId, toUserId);
      const msg = {
        id: uid('msg'),
        matchId: m.id,
        fromUserId,
        toUserId,
        message: String(message),
        ts: Date.now(),
      };
      messages.push(msg);
      return send(res, 201, { ok: true, matchId: m.id });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  /* -------- Matches / Messages -------- */

  if (req.method === 'GET' && pathname === '/matches') {
    const uidQ = query.userId;
    if (!uidQ) return send(res, 400, { message: 'userId vereist' });
    const list = matches
      .filter((m) => m.a === uidQ || m.b === uidQ)
      .map((m) => {
        const otherId = m.a === uidQ ? m.b : m.a;
        const other = getUserById(otherId);
        if (!other) return null;
        const { password, ...safe } = other;
        return { matchId: m.id, user: safe };
      })
      .filter(Boolean);
    return send(res, 200, { matches: list });
  }

  if (req.method === 'GET' && pathname === '/messages') {
    const matchId = query.matchId;
    if (!matchId) return send(res, 400, { message: 'matchId vereist' });
    const list = messages.filter((m) => m.matchId === matchId).sort((a, b) => a.ts - b.ts);
    return send(res, 200, { messages: list });
  }

  if (req.method === 'POST' && pathname === '/message') {
    try {
      const body = await parseBody(req);
      const { matchId, fromUserId, toUserId, message } = body || {};
      if (!matchId || !fromUserId || !toUserId || !message) {
        return send(res, 400, { message: 'matchId/fromUserId/toUserId/message vereist' });
      }
      const exists = matches.find((m) => m.id === matchId);
      if (!exists) return send(res, 404, { message: 'Match niet gevonden' });

      const msg = {
        id: uid('msg'),
        matchId,
        fromUserId,
        toUserId,
        message: String(message),
        ts: Date.now(),
      };
      messages.push(msg);
      return send(res, 201, { ok: true });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  /* -------- Default -------- */
  return send(res, 404, { message: 'Not found' });
};
