// api/[...route].js
// Vercel Serverless: één catch-all function die alle API-routes afhandelt.

const { parse } = require('url');

// In-memory "database" (reset bij cold starts)
const users = [];     // { id, username, password, age, gender, photos: [uri], bio, interests: [] }
const likes = [];     // { fromUserId, toUserId }
const matches = [];   // { id, a: userId, b: userId }
const messages = [];  // { id, matchId, fromUserId, toUserId, message, ts }

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

function parseBody(req, limit = 7 * 1024 * 1024) { // ~7MB; hou rekening met Vercel limieten
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const s = Buffer.concat(chunks).toString('utf8');
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getUserById(id) {
  return users.find(u => u.id === id);
}

function ensureMatch(a, b) {
  let m = matches.find(m => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  if (m) return m;
  m = { id: 'm_' + Math.random().toString(36).slice(2, 10), a, b };
  matches.push(m);
  return m;
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return send(res, 200, { ok: true });
  }

  // Pad bepalen; /api/... weghalen
  const u = new URL(req.url, 'https://dummy');
  const pathname = u.pathname.replace(/^\/api/, '');
  const { query } = parse(req.url, true);

  // Health
  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  // Register
  if (req.method === 'POST' && pathname === '/register') {
    try {
      const body = await parseBody(req);
      const { username, password, age, gender, photos = [], bio = '', interests = [] } = body || {};
      if (!username || !password) return send(res, 400, { message: 'username/password vereist' });
      if (users.some(u => u.username === username)) {
        return send(res, 409, { message: 'Gebruikersnaam bestaat al' });
      }
      const user = {
        id: 'u_' + Math.random().toString(36).slice(2, 10),
        username,
        password,
        age: Number.isFinite(Number(age)) ? Number(age) : null,
        gender: gender === 'vrouw' ? 'vrouw' : 'man',
        photos: Array.isArray(photos) ? photos.slice(0, 3) : [],
        bio: typeof bio === 'string' ? bio : '',
        interests: Array.isArray(interests) ? interests : [],
      };
      users.push(user);
      return send(res, 201, { user: { ...user, password: undefined } });
    } catch (e) {
      const msg = e.message || 'Bad Request';
      return send(res, 400, { message: msg });
    }
  }

  // Login
  if (req.method === 'POST' && pathname === '/login') {
    try {
      const body = await parseBody(req);
      const { username, password } = body || {};
      const user = users.find(u => u.username === username && u.password === password);
      if (!user) return send(res, 401, { message: 'Ongeldige inlog' });
      return send(res, 200, { user: { ...user, password: undefined } });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  // Users ophalen
  if (req.method === 'GET' && pathname === '/users') {
    const uid = query.userId;
    if (!uid) return send(res, 400, { message: 'userId vereist' });
    const list = users.filter(u => u.id !== uid).map(u => ({ ...u, password: undefined }));
    return send(res, 200, { users: list });
  }

  // Like
  if (req.method === 'POST' && pathname === '/like') {
    try {
      const body = await parseBody(req);
      const { fromUserId, toUserId } = body || {};
      if (!fromUserId || !toUserId) return send(res, 400, { message: 'fromUserId/toUserId vereist' });
      if (!getUserById(fromUserId) || !getUserById(toUserId)) return send(res, 404, { message: 'User niet gevonden' });

      if (!likes.some(l => l.fromUserId === fromUserId && l.toUserId === toUserId)) {
        likes.push({ fromUserId, toUserId });
      }
      const mutual = likes.some(l => l.fromUserId === toUserId && l.toUserId === fromUserId);
      if (mutual) {
        const m = ensureMatch(fromUserId, toUserId);
        return send(res, 200, { message: "It's a match!", matchId: m.id });
      }
      return send(res, 200, { message: 'Like geregistreerd' });
    } catch {
      return send(res, 400, { message: 'Bad Request' });
    }
  }

  // Matches
  if (req.method === 'GET' && pathname === '/matches') {
    const uid = query.userId;
    if (!uid) return send(res, 400, { message: 'userId vereist' });
    const list = matches
      .filter(m => m.a === uid || m.b === uid)
      .map(m => {
        const otherId = m.a === uid ? m.b : m.a;
        const other = getUserById(otherId);
        return { matchId: m.id, user: other ? { ...other, password: undefined } : null };
      })
      .filter(x => x.user);
    return send(res, 200, { matches: list });
  }

  // Messages ophalen
  if (req.method === 'GET' && pathname === '/messages') {
    const matchId = query.matchId;
    if (!matchId) return send(res, 400, { message: 'matchId vereist' });
    const list = messages
      .filter(m => m.matchId === matchId)
      .sort((a, b) => a.ts - b.ts);
    return send(res, 200, { messages: list });
  }

  // Message sturen
  if (req.method === 'POST' && pathname === '/message') {
    try {
      const body = await parseBody(req);
      const { matchId, fromUserId, toUserId, message } = body || {};
      if (!matchId || !fromUserId || !toUserId || !message) {
        return send(res, 400, { message: 'matchId/fromUserId/toUserId/message vereist' });
      }
      const exists = matches.find(m => m.id === matchId);
      if (!exists) return send(res, 404, { message: 'Match niet gevonden' });

      const msg = {
        id: 'msg_' + Math.random().toString(36).slice(2, 10),
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

  // 404
  return send(res, 404, { message: 'Not found' });
};
