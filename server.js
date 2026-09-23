// Coffee Shop one-page menu — zero-dependency Node server (Railway ready)
// Public page (no login) + password-protected admin to edit text, menu and QR.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_BODY = 12 * 1024 * 1024;
const SESSION_DAYS = 30;

fs.mkdirSync(UPLOADS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json'
};

/* ---------------- Default content ---------------- */
const newId = () => crypto.randomBytes(8).toString('hex');
function defaultSettings() {
  return {
    siteTitle: 'Coffee Shop',
    marquee: 'Coffee Shop, Freshly Brewed, Open Daily',
    tagline: 'Small-batch roasts, pastries and good company.',
    menuTitle: 'Our Menu',
    qrTitle: 'Scan to Pay',
    qrHint: 'Scan with any InstaPay-enabled bank or e-wallet app.',
    qrUrl: '/qr.png',
    qrBtnLabel: 'Send receipt here',
    qrBtnUrl: '',
    hours: 'Mon – Sun · 7:00 AM – 9:00 PM',
    address: '',
    contactLabel: 'Message us',
    contactUrl: '',
    footer: 'Thank you for visiting!'
  };
}
function defaultMenu() {
  const items = [['Espresso', '₱90'], ['Americano', '₱110'], ['Cappuccino', '₱140', 'Espresso, steamed milk, thick foam'], ['Café Latte', '₱150'],
    ['Spanish Latte', '₱160', 'Sweetened condensed milk'], ['Iced Latte', '₱160'], ['Cold Brew', '₱150', 'Steeped 18 hours'], ['Butter Croissant', '₱95']];
  return [{ id: newId(), title: 'Our Menu', items: items.map(([name, price, desc = '']) => ({ id: newId(), name, price, desc })) }];
}
// One menu only: merge any extra sections into the first
function oneMenu(list) {
  if (!Array.isArray(list) || !list.length) return defaultMenu();
  const first = list[0];
  for (const sec of list.slice(1)) first.items = first.items.concat(sec.items || []);
  return [first];
}

/* ---------------- Storage ---------------- */
let db;
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = {}; }
  db.users = db.users || [];
  db.sessions = db.sessions || {};
  db.settings = Object.assign(defaultSettings(), db.settings || {});
  db.menu = Array.isArray(db.menu) ? oneMenu(db.menu) : defaultMenu();
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[t];
}
function saveNow() { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE); }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 50); }

/* ---------------- Passwords & sessions ---------------- */
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; }
function checkPw(pw, u) { const h = crypto.scryptSync(pw, u.salt, 64); const s = Buffer.from(u.hash, 'hex'); return h.length === s.length && crypto.timingSafeEqual(h, s); }
function seedAdmin() {
  if (db.users.length) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  if (!process.env.ADMIN_PASSWORD) console.warn('⚠  No ADMIN_PASSWORD set — admin password is "changeme123". Change it in Admin → My account.');
  db.users.push({ id: newId(), username, ...hashPw(password), createdAt: Date.now() });
  saveNow();
}

/* ---------------- Helpers ---------------- */
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Bad JSON'), { code: 400 })); } });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const isHttps = req => req.headers['x-forwarded-proto'] === 'https';
const sessionCookie = (req, token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
function currentAdmin(req) {
  const t = cookies(req).sid; const s = t && db.sessions[t];
  if (!s || s.exp < Date.now()) return null;
  return db.users.find(u => u.id === s.userId) || null;
}
function startSession(req, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, exp: Date.now() + SESSION_DAYS * 864e5 }; save();
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function safeUrl(v) {
  const s = str(v, 2000); if (!s) return '';
  if (/^(https?:|mailto:|tg:|tel:|viber:|fb-messenger:)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;
  return '';
}
const hits = new Map();
function limited(req, key, max = 10, windowMs = 10 * 60 * 1000) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const k = key + ':' + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs); arr.push(now); hits.set(k, arr);
  return arr.length > max;
}
function saveDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('Unsupported image'), { code: 400 });
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const name = `${Date.now()}-${newId()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(m[2], 'base64'));
  return '/uploads/' + name;
}
function removeUpload(url) { if (typeof url === 'string' && url.startsWith('/uploads/')) fs.unlink(path.join(UPLOADS, path.basename(url)), () => {}); }
function cleanMenu(list) {
  if (!Array.isArray(list)) return db.menu;
  return list.slice(0, 40).map(sec => ({
    id: /^[a-f0-9]{16}$/.test(sec && sec.id) ? sec.id : newId(),
    title: str(sec && sec.title, 80) || 'Untitled',
    items: (Array.isArray(sec && sec.items) ? sec.items : []).slice(0, 150).map(it => ({
      id: /^[a-f0-9]{16}$/.test(it && it.id) ? it.id : newId(),
      name: str(it && it.name, 100) || 'Untitled', price: str(it && it.price, 30), desc: str(it && it.desc, 240)
    }))
  }));
}
const PUBLIC_KEYS = ['siteTitle', 'marquee', 'tagline', 'menuTitle', 'qrTitle', 'qrHint', 'qrUrl', 'qrBtnLabel', 'qrBtnUrl', 'hours', 'address', 'contactLabel', 'contactUrl', 'footer'];
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

/* ---------------- API ---------------- */
async function api(req, res, p) {
  const method = req.method;

  // Public — visitors need no login
  if (p === '/api/site' && method === 'GET') return send(res, 200, { settings: pick(db.settings, PUBLIC_KEYS), menu: db.menu });

  if (p === '/api/login' && method === 'POST') {
    if (limited(req, 'login', 15)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    const b = await readBody(req);
    const u = db.users.find(x => x.username.toLowerCase() === str(b.username, 64).toLowerCase());
    if (!u || typeof b.password !== 'string' || !checkPw(b.password, u)) return send(res, 401, { error: 'Wrong username or password.' });
    return send(res, 200, { ok: true }, { 'Set-Cookie': startSession(req, u) });
  }
  if (p === '/api/logout' && method === 'POST') {
    const t = cookies(req).sid; if (t) { delete db.sessions[t]; save(); }
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  const admin = currentAdmin(req);
  if (!admin) return send(res, 401, { error: 'Please log in.' });

  if (p === '/api/admin/data' && method === 'GET') return send(res, 200, { settings: db.settings, menu: db.menu, me: { username: admin.username } });

  if (p === '/api/admin/save' && method === 'PUT') {
    const b = await readBody(req); const s = db.settings;
    const src = b.settings || {};
    for (const k of ['siteTitle', 'marquee', 'tagline', 'menuTitle', 'qrTitle', 'qrHint', 'qrBtnLabel', 'hours', 'address', 'contactLabel', 'footer'])
      if (k in src) s[k] = str(src[k], 600);
    if ('contactUrl' in src) s.contactUrl = safeUrl(src.contactUrl);
    if ('qrBtnUrl' in src) s.qrBtnUrl = safeUrl(src.qrBtnUrl);
    if ('menu' in b) db.menu = oneMenu(cleanMenu(b.menu));
    save();
    return send(res, 200, { settings: s, menu: db.menu });
  }

  if (p === '/api/admin/qr' && method === 'POST') {
    const b = await readBody(req);
    if (b.reset) { removeUpload(db.settings.qrUrl); db.settings.qrUrl = '/qr.png'; }
    else { const url = saveDataUrl(b.dataUrl); removeUpload(db.settings.qrUrl); db.settings.qrUrl = url; }
    save(); return send(res, 200, { qrUrl: db.settings.qrUrl });
  }

  if (p === '/api/admin/password' && method === 'POST') {
    const b = await readBody(req);
    if (typeof b.current !== 'string' || !checkPw(b.current, admin)) return send(res, 400, { error: 'Current password is wrong.' });
    if (typeof b.password !== 'string' || b.password.length < 6) return send(res, 400, { error: 'New password must be at least 6 characters.' });
    Object.assign(admin, hashPw(b.password)); save();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

/* ---------------- Static ---------------- */
function serveFile(res, file, cache) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}
const PAGES = { '/': 'index.html', '/admin': 'admin.html' };

loadDb();
seedAdmin();

http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (pathname.startsWith('/uploads/')) return serveFile(res, path.join(UPLOADS, path.basename(pathname)), 'public, max-age=31536000, immutable');
    if (PAGES[pathname]) return serveFile(res, path.join(PUBLIC, PAGES[pathname]), 'no-cache');
    const file = path.normalize(path.join(PUBLIC, pathname));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file, 'public, max-age=3600');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code === 413 ? 'Image too large.' : (e.code === 400 ? e.message : 'Server error') });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Coffee Shop running on port ${PORT} — data in ${DATA_DIR}`));

process.on('SIGTERM', () => { try { saveNow(); } catch {} process.exit(0); });
