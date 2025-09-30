let users = [];
let likes = [];
let matches = [];
let messages = [];

const now = () => Date.now();
const json = (res, code, data) => { res.status(code).json(data); };
const ok = (res, data) => json(res, 200, data);
const err = (res, code, message) => json(res, code, { message });

function seedOnce() {
  if (users.length) return;
  const seed = (u) => {
    const id = String(users.length + 1);
    users.push({ id, createdAt: now(), lastActive: now(), ...u });
    return id;
  };
  seed({
    username: 'admin',
    password: 'admin123',
    age: 24,
    gender: 'man',
    bio: '',
    statusText: 'Welcome to FRNDS',
    photoCaptions: ['', '', ''],
    photos: [
      'https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?w=800',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800'
    ]
  });
  seed({
    username: 'lina', password: 'test123', age: 21, gender: 'vrouw',
    statusText: 'hey there ✨',
    photoCaptions: ['hi!', '☕️', '🎧'],
    photos: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800',
      'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=800',
      'https://images.unsplash.com/photo-1524504388940-1f64b7e25f64?w=800'
    ]
  });
  seed({
    username: 'milan', password: 'test123', age: 23, gender: 'man',
    statusText: 'football & film',
    photoCaptions: ['⚽️', '🎬', '🍕'],
    photos: [
      'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=800',
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      'https://images.unsplash.com/photo-1527980965255-2e7a6aeae0c4?w=800'
    ]
  });
  seed({
    username: 'sofia', password: 'test123', age: 20, gender: 'vrouw',
    statusText: 'dog mom 🐶',
    photoCaptions: ['🌸', '🐶', '📚'],
    photos: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800',
      'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=800',
      'https://images.unsplash.com/photo-1517842255-6f5dc3a4516f?w=800'
    ]
  });
  console.log('Seeded admin + test users. Admin login: admin / admin123');
}
seedOnce();

const findUser = (id) => users.find(u => u.id === String(id));
const findMatch = (aId, bId) => matches.find(m =>
  (m.aId === aId && m.bId === bId) || (m.aId === bId && m.bId === aId)
);
const ensureMatch = (aId, bId) => {
  let m = findMatch(aId, bId);
  if (!m) {
    m = { id: String(matches.length + 1), aId, bId };
    matches.push(m);
  }
  return m;
};

export default async function handler(req, res) {
  const { method } = req;
  const u = new URL(req.url, 'http://x');
  const path = u.pathname.replace(/^\/api/, '');

  try {
    if (method === 'POST' && path === '/register') {
      const body = req.body ?? await getBody(req);
      const { username, password, age, gender, bio = '', statusText = '', photoCaptions = [], photos = [] } = body || {};
      if (!username || !password) return err(res, 400, 'username/password required');
      if (users.some(x => x.username === username)) return err(res, 409, 'username taken');
      const id = String(users.length + 1);
      users.push({ id, username, password, age, gender, bio, statusText, photoCaptions, photos, createdAt: now(), lastActive: now() });
      return ok(res, { message: 'ok' });
    }

    if (method === 'POST' && path === '/login') {
      const body = req.body ?? await getBody(req);
      const { username, password } = body || {};
      const user = users.find(x => x.username === username && x.password === password);
      if (!user) return err(res, 401, 'invalid credentials');
      user.lastActive = now();
      return ok(res, { user });
    }

    if (method === 'POST' && path === '/presence') {
      const body = req.body ?? await getBody(req);
      const { userId } = body || {};
      const me = findUser(userId);
      if (me) me.lastActive = now();
      return ok(res, { ok: true });
    }

    if (method === 'GET' && path === '/users') {
      const userId = u.searchParams.get('userId');
      const feed = users.filter(x => x.id !== String(userId)).map(x => ({
        id: x.id,
        username: x.username,
        age: x.age,
        gender: x.gender,
        photos: x.photos,
        photoCaptions: x.photoCaptions || [],
        statusText: x.statusText || '',
        lastActive: x.lastActive || 0,
      }));
      return ok(res, { users: feed });
    }

    if (method === 'POST' && path === '/first-message') {
      const body = req.body ?? await getBody(req);
      const { fromUserId, toUserId, message } = body || {};
      const from = findUser(fromUserId);
      const to = findUser(toUserId);
      if (!from || !to) return err(res, 404, 'user not found');
      const m = ensureMatch(from.id, to.id);
      const id = String(messages.length + 1);
      const createdAt = now();
      messages.push({ id, matchId: m.id, fromUserId: from.id, toUserId: to.id, message, createdAt });
      from.lastActive = createdAt;
      return ok(res, { matchId: m.id, messageId: id });
    }

    if (method === 'POST' && path === '/message') {
      const body = req.body ?? await getBody(req);
      const { matchId, fromUserId, toUserId, message } = body || {};
      const from = findUser(fromUserId);
      const to = findUser(toUserId);
      const m = matches.find(x => x.id === String(matchId));
      if (!from || !to || !m) return err(res, 404, 'not found');
      const id = String(messages.length + 1);
      const createdAt = now();
      messages.push({ id, matchId: m.id, fromUserId: from.id, toUserId: to.id, message, createdAt });
      from.lastActive = createdAt;
      return ok(res, { id });
    }

    if (method === 'GET' && path === '/matches') {
      const userId = u.searchParams.get('userId');
      const mine = matches
        .filter(m => m.aId === userId || m.bId === userId)
        .map(m => {
          const otherId = (m.aId === userId) ? m.bId : m.aId;
          const user = findUser(otherId);
          return { matchId: m.id, user };
        });
      return ok(res, { matches: mine });
    }

    if (method === 'GET' && path === '/messages') {
      const matchId = u.searchParams.get('matchId');
      const list = messages.filter(m => m.matchId === String(matchId));
      return ok(res, { messages: list });
    }

    return ok(res, { ok: true });
  } catch (e) {
    console.error(e);
    return err(res, 500, 'server error');
  }
}

async function getBody(req) {
  if (req.body) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
