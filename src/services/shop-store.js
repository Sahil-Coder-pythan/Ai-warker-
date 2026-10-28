/**
 * File-based shop store — survives process restarts.
 * Put DATA_DIR on Render Persistent Disk so redeploys keep products/images.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Use DATA_DIR when explicitly configured. Render Free has no Persistent Disk,
// so never assume /var/data is writable; use the writable temporary directory
// to let the service start. IMPORTANT: /tmp is ephemeral and is NOT durable storage.
const ROOT = process.env.DATA_DIR || (process.env.RENDER === 'true' ? path.join('/tmp', 'stratic-market') : path.join(process.cwd(), 'data'));
const IMG = path.join(ROOT, 'images');
const F = {
  products: path.join(ROOT, 'products.json'),
  orders: path.join(ROOT, 'orders.json'),
  accounts: path.join(ROOT, 'accounts.json'),
  stats: path.join(ROOT, 'stats.json'),
  pronto_urls: path.join(ROOT, 'pronto_urls.json'),
};

function ensure() {
  fs.mkdirSync(IMG, { recursive: true });
  for (const f of Object.values(F)) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, (f.includes('stats') || f.includes('pronto_urls')) ? '{}' : '[]', 'utf8');
  }
}
ensure();

// In-memory read cache (speed only): same data, but no disk read + JSON parse on every request.
// Every caller still gets its own private copy, and any write() clears the cache.
const CACHE = {};
function read(key) {
  ensure();
  if (CACHE[key] !== undefined) return structuredClone(CACHE[key]);
  let val;
  try {
    val = JSON.parse(fs.readFileSync(F[key], 'utf8'));
  } catch {
    return key === 'stats' ? {} : [];
  }
  CACHE[key] = val;
  return structuredClone(val);
}

// ---- Durable backup in Postgres (Neon): accounts, products, orders, stats + product photos ----
// Render Free wipes local files on every restart/redeploy, so everything important is mirrored to DATABASE_URL.
const DB_URL = String(process.env.DATABASE_URL || '').trim();
const DB_KEYS = ['accounts', 'products', 'orders', 'stats', 'pronto_urls'];
let pool = null;
let dbChain = Promise.resolve();
const pendingDbFailures = [];
const timers = {};
function getPool() {
  if (!DB_URL) return null;
  if (pool) return pool;
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 10000 });
    pool.on('error', () => {});
  } catch (e) {
    console.warn('pg package missing - data will not be backed up to the database:', e.message);
    pool = null;
  }
  return pool;
}
function queueDb(fn) {
  const p = getPool();
  if (!p) return Promise.resolve();
  // Serialize writes, retry transient Neon wake-ups, and retain failures so callers
  // can wait for durable persistence before confirming important operations.
  const task = dbChain.then(async () => {
    for (let i = 0; i < 3; i++) {
      try { await fn(p); return; } catch (e) {
        console.error('db backup failed (try ' + (i + 1) + ')', e.message);
        if (i < 2) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        else { pendingDbFailures.push(e); throw e; }
      }
    }
  });
  dbChain = task.catch(() => {});
  return task;
}

async function flushPendingWrites() {
  await Promise.all([dbChain, imgChain]);
  if (pendingDbFailures.length || pendingImgFailures.length) {
    const failures = pendingDbFailures.splice(0, pendingDbFailures.length).concat(pendingImgFailures.splice(0, pendingImgFailures.length));
    throw new Error('Database persistence failed for ' + failures.length + ' write(s): ' + failures[0].message);
  }
}
function dbSave(key, json) {
  queueDb((p) => p.query(
    'INSERT INTO sgm_kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
    [key, json]
  ));
}
function dbSaveLater(key, json, ms) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => dbSave(key, json), ms);
}
// ---- Separate photo/QR database (optional): set IMG_DATABASE_URL (e.g. CockroachDB free 10 GiB). ----
// Text data (accounts/products/orders) stays in DATABASE_URL (Neon); photos + payment QRs go here.
// If IMG_DATABASE_URL is not set, everything works exactly as before (photos in DATABASE_URL).
const IMG_DB_URL = String(process.env.IMG_DATABASE_URL || '').trim();
let imgPool = null, imgChain = Promise.resolve(), imgTableOk = false;
const pendingImgFailures = [];
function getImgPool() {
  if (!IMG_DB_URL) return null;
  if (imgPool) return imgPool;
  try {
    const { Pool } = require('pg');
    // our own ssl setting is used, so drop sslmode from the URL (it would override it)
    const url = IMG_DB_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
    imgPool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000 });
    imgPool.on('error', () => {});
  } catch (e) {
    console.warn('pg package missing - photos will not use IMG_DATABASE_URL:', e.message);
    imgPool = null;
  }
  return imgPool;
}
async function ensureImgTable(p) {
  if (imgTableOk) return;
  await p.query('CREATE TABLE IF NOT EXISTS sgm_img (name text PRIMARY KEY, data bytea NOT NULL)');
  imgTableOk = true;
}
function queueImg(fn) {
  const p = getImgPool();
  if (!p) return false;
  const task = imgChain.then(async () => {
    for (let i = 0; i < 3; i++) {
      try { await ensureImgTable(p); await fn(p); return; } catch (e) {
        console.error('photo database backup failed (try ' + (i + 1) + ')', e.message);
        if (i < 2) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        else {
          // If the optional photo database is unavailable, try the primary Neon DB
          // before declaring the photo write failed.
          const fallback = getPool();
          if (fallback) {
            try { await fn(fallback); console.warn('Photo database unavailable; used primary database fallback.'); return; }
            catch (fallbackError) { console.error('Primary database photo fallback failed:', fallbackError.message); }
          }
          pendingImgFailures.push(e); throw e;
        }
      }
    }
  });
  imgChain = task.catch(() => {});
  return true;
}
// Optional Get Pronto cloud storage. Set GETPRONTO_API_KEY in Render Environment.
// Uploads use the provider's documented presign -> PUT -> confirm flow.
const PRONTO_KEY = String(process.env.GETPRONTO_API_KEY || '').trim();
let prontoChain = Promise.resolve();
function remoteUrls() { return read('pronto_urls') || {}; }
function remoteImageUrl(name) { return remoteUrls()[String(name)] || null; }
async function uploadPronto(name, buf) {
  if (!PRONTO_KEY || !buf || !buf.length) return;
  const filename = `stratic-${String(name).replace(/[^a-zA-Z0-9_-]/g, '')}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  try {
    const base = 'https://api.getpronto.io/v1';
    const presignRes = await fetch(base + '/upload/presign', {
      method: 'POST', headers: { Authorization: 'ApiKey ' + PRONTO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, customFilename: filename, mimetype: 'image/jpeg', size: buf.length, folderName: 'stratic-market' }),
      signal: AbortSignal.timeout(30000),
    });
    const presign = await presignRes.json().catch(() => ({}));
    if (!presignRes.ok || !presign.uploadUrl || !presign.pendingUploadId) throw new Error('Get Pronto presign failed (' + presignRes.status + '): ' + JSON.stringify(presign).slice(0, 300));
    const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: buf, signal: AbortSignal.timeout(60000) });
    if (!putRes.ok) throw new Error('Get Pronto binary upload failed (' + putRes.status + ')');
    const confirmRes = await fetch(base + '/upload/confirm', {
      method: 'POST', headers: { Authorization: 'ApiKey ' + PRONTO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingUploadId: presign.pendingUploadId }), signal: AbortSignal.timeout(30000),
    });
    const confirmed = await confirmRes.json().catch(() => ({}));
    if (!confirmRes.ok || !(confirmed.file && (confirmed.file.rawUrl || confirmed.file.secureUrl))) throw new Error('Get Pronto confirmation failed (' + confirmRes.status + '): ' + JSON.stringify(confirmed).slice(0, 300));
    const urls = remoteUrls();
    urls[String(name)] = confirmed.file.rawUrl || confirmed.file.secureUrl;
    write('pronto_urls', urls);
    // Keep the database copy until both the cloud URL mapping and the photo backup
    // are durable. Only then can the redundant database blob be cleaned up.
    await Promise.all([dbChain, imgChain]);
    if (!/_q$/.test(String(name))) dbDeleteImage(name);
    console.log('Get Pronto photo uploaded:', name);
  } catch (e) {
    console.error('Get Pronto upload failed for ' + name + '; local/database fallback remains active:', e.message);
  }
}
function queueProntoUpload(name, buf) {
  if (!PRONTO_KEY) return;
  // Serialize provider uploads to avoid bursts from multi-photo product listings.
  const copy = Buffer.from(buf);
  prontoChain = prontoChain.then(() => uploadPronto(name, copy)).catch((e) => console.error('Get Pronto upload queue error:', e.message));
}
function dbSaveImage(name, buf) {
  // GetPronto is the preferred image host, but retain a database copy until the
  // remote upload and URL mapping are confirmed. A crash during upload must not
  // leave a product pointing at a photo that only existed on Render's local disk.
  // Seller payment QRs (…_q) stay in our own database permanently (never moved to an outside host, never auto-deleted).
  if (PRONTO_KEY && !/_q$/.test(String(name))) queueProntoUpload(name, buf);
  if (queueImg((p) => p.query(
    'INSERT INTO sgm_img (name, data) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
    [name, buf]
  ))) return;
  queueDb((p) => p.query(
    'INSERT INTO sgm_img (name, data) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data',
    [name, buf]
  ));
}
function dbDeleteImage(name) {
  queueDb((p) => p.query('DELETE FROM sgm_img WHERE name = $1', [name]));
  queueImg((p) => p.query('DELETE FROM sgm_img WHERE name = $1', [name]));
}
// Call once before the server starts: restores data files from the database.
async function ready() {
  try { const ip = getImgPool(); if (ip) await ensureImgTable(ip); } catch (e) { console.error('photo database not ready:', e.message); }
  const p = getPool();
  if (!p) {
    const message = 'DATABASE_URL not set: data is kept only in local files and will be lost on Render restart.';
    console.warn(message);
    // Never silently accept real customer data on an ephemeral Render filesystem.
    if (process.env.RENDER === 'true') throw new Error(message);
    return;
  }
  try {
    await p.query('CREATE TABLE IF NOT EXISTS sgm_kv (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    await p.query('CREATE TABLE IF NOT EXISTS sgm_img (name text PRIMARY KEY, data bytea NOT NULL)');
    ensure();
    for (const key of DB_KEYS) {
      const r = await p.query('SELECT value FROM sgm_kv WHERE key = $1', [key]);
      if (r.rows.length) {
        const val = JSON.parse(r.rows[0].value);
        fs.writeFileSync(F[key], JSON.stringify(val), 'utf8');
        delete CACHE[key];
        console.log('Restored ' + key + ' from database');
      } else {
        const local = read(key);
        const has = Array.isArray(local) ? local.length : Object.keys(local).length;
        if (has) dbSave(key, JSON.stringify(local));
      }
    }
  } catch (e) {
    console.error('database restore failed', e.message);
    // If persistence is configured but unavailable, do not start accepting writes
    // against an ephemeral/stale local copy that could later overwrite cloud data.
    throw new Error('Database restore failed; refusing to start in an unsafe persistence state: ' + e.message);
  }
}
// Product photo: local file first, else fetch from the database (after a restart).
async function ensureImage(name) {
  const fp = path.join(IMG, name + '.jpg');
  if (fs.existsSync(fp)) return fp;
  // Look in the photo database first (if configured), then in the main database (older photos).
  const pools = [getImgPool(), getPool()].filter(Boolean);
  for (const p of pools) {
    try {
      const r = await p.query('SELECT data FROM sgm_img WHERE name = $1', [name]);
      if (!r.rows.length) continue;
      fs.mkdirSync(IMG, { recursive: true });
      fs.writeFileSync(fp, r.rows[0].data);
      return fp;
    } catch (e) { /* try the next database */ }
  }
  return null;
}

// Old payment QRs may only exist as an outside-host URL: pull the bytes through the server
// (no browser redirect), and save them back into our own database so they are never lost again.
async function restoreImageFromRemote(name) {
  const url = remoteImageUrl(name);
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return null;
    fs.mkdirSync(IMG, { recursive: true });
    const fp = path.join(IMG, name + '.jpg');
    fs.writeFileSync(fp, buf);
    if (/_q$/.test(String(name))) {
      try {
        queueImg((p) => p.query('INSERT INTO sgm_img (name, data) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data', [name, buf]));
      } catch (e) {}
    }
    return fp;
  } catch (e) { return null; }
}

function write(key, data) {
  ensure();
  const json = JSON.stringify(data, null, 0);
  const tmp = F[key] + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, F[key]);
  delete CACHE[key];
  if (key === 'stats') dbSaveLater(key, json, 5000);
  else if (DB_KEYS.includes(key)) dbSave(key, json);
}

function id() {
  return crypto.randomBytes(8).toString('hex');
}

function normPhone(p) {
  // Canonical key so "+91 98765 43210", "09876543210" and "9876543210" are the SAME mobile.
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(-12);
}

function listProducts(country) {
  const now = Date.now();
  return read('products')
    .filter((p) => {
      if (country && p.country && p.country !== country) return false;
      if (!p.expiresAt) return true;
      const exp = new Date(p.expiresAt);
      if (isNaN(exp.getTime())) return true;
      exp.setHours(23, 59, 59, 999);
      return exp.getTime() >= now;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listAllProducts() { return read('products').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }

function getProduct(pid) {
  return read('products').find((p) => p.id === pid) || null;
}

function addProduct(data, imageBuffer, extras, qrBuffer) {
  const products = read('products');
  // Every product gets its own unique ID (also unique in the printed short code PID-XXXXXXXXXX).
  const existing = read('products');
  let pid = id();
  while (existing.some((x) => x.id === pid || String(x.id).slice(0, 10) === pid.slice(0, 10))) pid = id();
  extras = (extras || []).slice(0, 11);
  fs.writeFileSync(path.join(IMG, pid + '.jpg'), imageBuffer);
  dbSaveImage(pid, imageBuffer);
  extras.forEach((buf, k) => {
    fs.writeFileSync(path.join(IMG, pid + '_' + (k + 1) + '.jpg'), buf);
    dbSaveImage(pid + '_' + (k + 1), buf);
  });
  if (qrBuffer && qrBuffer.length > 100) {
    fs.writeFileSync(path.join(IMG, pid + '_q.jpg'), qrBuffer);
    dbSaveImage(pid + '_q', qrBuffer);
  }
  const p = {
    id: pid,
    hasQr: !!(qrBuffer && qrBuffer.length > 100),
    sellerId: data.sellerId,
    shopName: data.shopName,
    city: data.city || '',
    country: data.country || 'IN',
    title: data.title,
    description: data.description || '',
    price: data.price,
    mrp: data.mrp || 0,
    currency: data.currency || 'INR',
    category: data.category || 'Other',
    days: data.days || 5,
    sellerPhone: data.sellerPhone || '',
    sellerPhoneKey: normPhone(data.sellerPhone),
    sellerAddress: data.sellerAddress || '',
    expiresAt: data.expiresAt || null,
    lang: data.lang || 'en',
    imgCount: 1 + extras.length,
    createdAt: new Date().toISOString(),
  };
  products.unshift(p);
  write('products', products);
  return p;
}

function deleteProduct(pid, sellerId) {
  const products = read('products');
  const i = products.findIndex((p) => p.id === pid && p.sellerId === sellerId);
  if (i < 0) return false;
  products.splice(i, 1);
  write('products', products);
  for (let k = 0; k < 13; k++) {
    const nm = k ? pid + '_' + k : pid;
    try { fs.unlinkSync(path.join(IMG, nm + '.jpg')); } catch {}
    dbDeleteImage(nm);
  }
  try { fs.unlinkSync(path.join(IMG, pid + '_q.jpg')); } catch {}
  dbDeleteImage(pid + '_q');
  return true;
}

// Edit a listing (seller only). Photos: keepIdx = which existing photos stay (in order), newBufs = new photos added after them.
async function updateProduct(pid, sellerId, data, keepIdx, newBufs, qrBuf) {
  const products = read('products');
  const p = products.find((x) => x.id === pid && x.sellerId === sellerId);
  if (!p) return null;
  ['title', 'description', 'category', 'city', 'district', 'sellerAddress'].forEach((k) => { if (data[k] !== undefined) p[k] = data[k]; });
  if (data.price !== undefined) p.price = data.price;
  if (data.mrp !== undefined) p.mrp = data.mrp;
  if (data.expiresAt !== undefined) p.expiresAt = data.expiresAt;
  newBufs = (newBufs || []).filter((b) => b && b.length > 100);
  if (keepIdx !== null || newBufs.length) {
    const count = Math.max(1, Number(p.imgCount) || 1);
    const keep = (keepIdx === null ? Array.from({ length: count }, (_, k) => k) : keepIdx).filter((k) => Number.isInteger(k) && k >= 0 && k < count);
    const bufs = [];
    for (const k of keep) {
      let fp = imagePath(pid, k);
      try { if (!fs.existsSync(fp)) fp = await ensureImage(path.basename(fp, '.jpg')); } catch (e) { fp = null; }
      if (fp) { try { bufs.push(fs.readFileSync(fp)); } catch (e) {} }
    }
    const all = bufs.concat(newBufs).slice(0, 12);
    if (!all.length) return { error: 'Keep or add at least one product photo.' };
    all.forEach((buf, k) => {
      const nm = k ? pid + '_' + k : pid;
      fs.writeFileSync(path.join(IMG, nm + '.jpg'), buf);
      dbSaveImage(nm, buf);
    });
    for (let k = all.length; k < 13; k++) {
      const nm = k ? pid + '_' + k : pid;
      try { fs.unlinkSync(path.join(IMG, nm + '.jpg')); } catch {}
      if (k < Math.max(count, all.length) + 1) dbDeleteImage(nm);
    }
    p.imgCount = all.length;
    p.imgV = Date.now();
  }
  if (qrBuf && qrBuf.length > 100) {
    fs.writeFileSync(path.join(IMG, pid + '_q.jpg'), qrBuf);
    dbSaveImage(pid + '_q', qrBuf);
    p.hasQr = true;
  }
  p.editedAt = new Date().toISOString();
  write('products', products);
  return p;
}

function imageName(pid, i) {
  const base = String(pid || '').replace(/[^a-f0-9]/gi, '');
  if (i === 'q') return base + '_q';
  const n = Number(i) || 0;
  return n > 0 && n < 12 ? base + '_' + n : base;
}
function imagePath(pid, i) {
  return path.join(IMG, imageName(pid, i) + '.jpg');
}

function createAccount(data) {
  const accounts = read('accounts');
  const emailNorm = String(data.email || '').toLowerCase().trim();
  const pk = normPhone(data.phoneKey || data.phone);
  // Identity = Gmail + mobile PAIR. Same Gmail with another mobile (or same mobile with another Gmail) is a NEW fresh account.
  if (emailNorm && pk && accounts.find((a) => a.email === emailNorm && normPhone(a.phoneKey || a.phone) === pk)) return null;
  if (emailNorm && !pk && accounts.find((a) => a.email === emailNorm)) return null;
  const u = {
    id: id(),
    name: data.name || '',
    email: emailNorm,
    passwordHash: data.passwordHash || '',
    phone: data.phone || '',
    phoneKey: pk,
    country: data.country || 'IN',
    lang: data.lang || 'en',
    googleId: data.googleId || null,
    createdAt: new Date().toISOString(),
  };
  accounts.push(u);
  write('accounts', accounts);
  return u;
}

function updateAccount(uid, patch) {
  const accounts = read('accounts');
  const i = accounts.findIndex((a) => a.id === uid);
  if (i < 0) return null;
  accounts[i] = Object.assign({}, accounts[i], patch);
  write('accounts', accounts);
  return accounts[i];
}

const seenAt = {};
function touchAccount(uid) {
  const now = Date.now();
  if (seenAt[uid] && now - seenAt[uid] < 10 * 60 * 1000) return;
  seenAt[uid] = now;
  const accounts = read('accounts');
  const a = accounts.find((x) => x.id === uid);
  if (!a) return;
  a.lastSeen = new Date(now).toISOString();
  write('accounts', accounts);
}

function findAccountById(uid) {
  return read('accounts').find((a) => a.id === uid) || null;
}

function findAccountByEmail(email) {
  email = String(email || '').toLowerCase();
  return read('accounts').find((a) => a.email === email) || null;
}

// Country is decided by the mobile number itself (+91 -> India, +1 -> USA, +44 -> UK, +971 -> UAE ...).
function countryFromPhone(phone, fallback) {
  const raw = String(phone || '').trim();
  const d = raw.replace(/\D/g, '');
  const fb = String(fallback || 'IN').toUpperCase();
  if (!d) return fb;
  if (raw.startsWith('+') || d.length > 10) {
    if (d.startsWith('91') && d.length === 12) return 'IN';
    if (d.startsWith('971')) return 'AE';
    if (d.startsWith('44')) return 'GB';
    if (d.startsWith('1') && d.length === 11) return 'US';
    if (raw.startsWith('+')) return 'OTHER';
    return fb;
  }
  return fb; // plain national number (older accounts): keep the saved country
}

function findAccountByPhone(phone) {
  const k = normPhone(phone);
  if (!k) return null;
  return read('accounts').find((a) => a.phoneKey && normPhone(a.phoneKey) === k) || null;
}

// Exact Gmail + mobile pair (used by Google login to restore the right account).
function findAccountByPair(email, phone) {
  email = String(email || '').toLowerCase().trim();
  const k = normPhone(phone);
  if (!email || !k) return null;
  return read('accounts').find((a) => a.email === email && normPhone(a.phoneKey || a.phone) === k) || null;
}

// Old Google accounts created before the phone step (no mobile saved yet).
function findPhonelessByEmail(email) {
  email = String(email || '').toLowerCase().trim();
  return read('accounts').find((a) => a.email === email && !normPhone(a.phoneKey || a.phone)) || null;
}

function findAccountByGoogle(gid) {
  return read('accounts').find((a) => a.googleId === gid) || null;
}

function listSellerPaymentOrders(sellerId) {
  return read('orders').filter((x) => x.sellerId === sellerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function listOrders(recfilter) {
  let o = read('orders');
  if (recfilter && recfilter.buyerId) o = o.filter((x) => x.buyerId === recfilter.buyerId);
  if (recfilter && recfilter.sellerId) o = o.filter((x) => x.sellerId === recfilter.sellerId && String(x.status).toUpperCase() !== 'PAYMENT_PENDING' && x.paymentStatus !== 'REJECTED');
  return o.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addOrder(data) {
  const orders = read('orders');
  let ref; do { ref = 'ST-' + crypto.randomBytes(8).toString('hex').toUpperCase(); } while (orders.some((x) => x.ref === ref));
  const o = {
    ref,
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    items: data.items,
    total: data.total,
    currency: data.currency || 'INR',
    status: data.paymentMethod === 'ONLINE' ? 'PAYMENT_PENDING' : 'CONFIRMED',
    confirmedAt: data.paymentMethod === 'ONLINE' ? null : new Date().toISOString(),
    paymentMethod: data.paymentMethod === 'ONLINE' ? 'ONLINE' : 'COD',
    txnId: data.paymentMethod === 'ONLINE' ? String(data.txnId || '') : '',
    paymentStatus: data.paymentMethod === 'ONLINE' ? 'AWAITING' : 'PAY_ON_DELIVERY',
    itemsTotal: data.itemsTotal != null ? data.itemsTotal : data.total,
    deliveryCharge: data.deliveryCharge || 0,
    buyerEmail: data.buyerEmail || '',
    name: data.name,
    phone: data.phone,
    phoneKey: normPhone(data.phone),
    address: data.address,
    city: data.city,
    state: data.state || '',
    district: data.district || '',
    country: data.country || 'IN',
    pincode: data.pincode,
    sellerShop: data.sellerShop,
    sellerPhone: data.sellerPhone,
    createdAt: new Date().toISOString(),
  };
  orders.unshift(o);
  write('orders', orders);
  return o;
}

const ORDER_STATUSES = ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const CANCEL_WINDOW_MS = 24 * 3600 * 1000;
function txnUsed(txn) {
  const t = String(txn || '').toLowerCase();
  return !!t && read('orders').some((o) => o.txnId && String(o.txnId).toLowerCase() === t);
}
// Owner confirmed the money (exact amount + transaction ID) arrived -> the order becomes CONFIRMED.
function verifyPayment(ref) {
  const orders = read('orders');
  // Only a still-pending online order may be verified; never convert a cancelled
  // or previously rejected payment into a paid/confirmed order by mistake.
  const list = orders.filter((o) => o.ref === ref && o.paymentMethod === 'ONLINE' && String(o.status).toUpperCase() === 'PAYMENT_PENDING' && String(o.paymentStatus || 'AWAITING').toUpperCase() === 'AWAITING');
  if (!list.length) return null;
  list.forEach((o) => {
    o.status = 'CONFIRMED';
    o.confirmedAt = new Date().toISOString();
    o.paymentStatus = 'VERIFIED';
    o.verifiedAt = new Date().toISOString();
  });
  write('orders', orders);
  return list[0];
}
// Money not received / wrong amount -> the order never gets confirmed.
function rejectPayment(ref) {
  const orders = read('orders');
  const list = orders.filter((o) => o.ref === ref && o.paymentMethod === 'ONLINE' && String(o.status).toUpperCase() === 'PAYMENT_PENDING');
  if (!list.length) return null;
  list.forEach((o) => { o.status = 'CANCELLED'; o.paymentStatus = 'REJECTED'; o.cancelReason = 'Payment not received / amount did not match'; o.cancelledAt = new Date().toISOString(); o.cancelledBy = 'admin'; });
  write('orders', orders);
  return list[0];
}
function updateOrderStatus(ref, userId, status, reason) {
  status = String(status || '').toUpperCase();
  if (!ORDER_STATUSES.includes(status)) return { error: 'Invalid status.' };
  const orders = read('orders');
  const o = orders.find((x) => x.ref === ref && (x.sellerId === userId || x.buyerId === userId));
  if (!o) return { error: 'Order not found.' };
  if (String(o.status).toUpperCase() === 'PAYMENT_PENDING') return { error: 'This order is waiting for payment confirmation.' };
  const isBuyer = o.sellerId !== userId;
  if (isBuyer) {
    // buyer may only cancel a still-confirmed order, within 24 hours, with a reason
    if (!(status === 'CANCELLED' && String(o.status).toUpperCase() === 'CONFIRMED')) return { error: 'Change not allowed.' };
    if (Date.now() - new Date(o.createdAt).getTime() > CANCEL_WINDOW_MS) return { error: 'Cancellation time (24 hours) is over. This order can no longer be cancelled.' };
    if (!String(reason || '').trim()) return { error: 'Please tell us why you are cancelling.' };
  }
  o.status = status;
  if (status === 'SHIPPED' && !o.shippedAt) o.shippedAt = new Date().toISOString();
  if (status === 'DELIVERED') { if (!o.shippedAt) o.shippedAt = new Date().toISOString(); o.deliveredAt = new Date().toISOString(); }
  if (status === 'CANCELLED') { o.cancelReason = String(reason || '').slice(0, 200); o.cancelledAt = new Date().toISOString(); o.cancelledBy = isBuyer ? 'buyer' : 'seller'; }
  write('orders', orders);
  return { order: o };
}

function deleteOrder(ref, buyerId) {
  const orders = read('orders');
  const i = orders.findIndex((x) => x.ref === ref && x.buyerId === buyerId);
  if (i < 0) return false;
  orders.splice(i, 1);
  write('orders', orders);
  return true;
}


// Likes: one like per logged-in account (Gmail) per product, like YouTube. Tap again = like removed.
function productLikeInfo(pid, userId) {
  const stats = read('stats');
  stats.productLikes = stats.productLikes || {};
  const ids = Array.isArray(stats.productLikes[pid]) ? stats.productLikes[pid] : [];
  const set = new Set(ids.map(String));
  return { count: set.size, liked: !!(userId && set.has(String(userId))) };
}
function toggleProductLike(pid, userId) {
  if (!getProduct(pid) || !userId) return null;
  const stats = read('stats');
  stats.productLikes = stats.productLikes || {};
  const ids = Array.isArray(stats.productLikes[pid]) ? stats.productLikes[pid] : [];
  const set = new Set(ids.map(String));
  let liked;
  if (set.has(String(userId))) { set.delete(String(userId)); liked = false; } else { set.add(String(userId)); liked = true; }
  stats.productLikes[pid] = Array.from(set);
  write('stats', stats);
  return { count: set.size, liked };
}

// Views: one count per DEVICE (browser cookie), never repeated for the same device.
function recordProductView(pid, dev) {
  if (!dev || !getProduct(pid)) return 0;
  const stats = read('stats');
  stats.productViews = stats.productViews || {};
  const m = stats.productViews[pid] || {};
  if (!m[dev]) { m[dev] = 1; stats.productViews[pid] = m; write('stats', stats); }
  return Object.keys(m).length;
}
function productViewCount(pid) {
  const stats = read('stats');
  return Object.keys((stats.productViews || {})[pid] || {}).length;
}

function recordVisit(dev) {
  if (!dev) return;
  const stats = read('stats');
  const day = new Date().toISOString().slice(0, 10);
  stats.devices = stats.devices || {};
  let changed = false;
  // total shop views = unique devices; a device is counted only once
  if (!stats.devices[dev]) {
    stats.devices[dev] = 1;
    stats.totalVisits = Number(stats.totalVisits || 0) + 1;
    changed = true;
  }
  stats.dailyVisits = stats.dailyVisits || {};
  if (!stats.seenDay || stats.seenDay.d !== day) stats.seenDay = { d: day, ids: {} };
  if (!stats.seenDay.ids[dev]) {
    stats.seenDay.ids[dev] = 1;
    stats.dailyVisits[day] = Number(stats.dailyVisits[day] || 0) + 1;
    for (const d of Object.keys(stats.dailyVisits).sort().slice(0, -90)) delete stats.dailyVisits[d];
    changed = true;
  }
  if (changed) write('stats', stats);
}

function dashboardStats() {
  const products = read('products');
  const orders = read('orders');
  const accounts = read('accounts');
  const st = read('stats');
  const byCountry = {};
  const bc = (c) => (byCountry[c] = byCountry[c] || { users: 0, products: 0, orders: 0, sales: 0 });
  accounts.forEach((a) => { bc(a.country || 'IN').users++; });
  products.forEach((p) => { bc(p.country || 'IN').products++; });
  const ordersByStatus = {};
  const salesByCurrency = {};
  const dailyOrders = {};
  orders.forEach((o) => {
    const c = bc(o.country || 'IN');
    c.orders++;
    const stt = String(o.status || 'CONFIRMED').toUpperCase();
    ordersByStatus[stt] = (ordersByStatus[stt] || 0) + 1;
    if (stt !== 'CANCELLED' && stt !== 'PAYMENT_PENDING') {
      c.sales += Number(o.total) || 0;
      salesByCurrency[o.currency || 'INR'] = (salesByCurrency[o.currency || 'INR'] || 0) + (Number(o.total) || 0);
    }
    const d = String(o.createdAt || '').slice(0, 10);
    if (d) dailyOrders[d] = (dailyOrders[d] || 0) + 1;
  });
  const now = Date.now();
  const active = (ms) => accounts.filter((a) => a.lastSeen && now - new Date(a.lastSeen).getTime() < ms).length;
  const sellers = new Set(products.map((p) => p.sellerId));
  const buyers = new Set(orders.map((o) => o.buyerId));
  const byCategory = {};
  products.forEach((p) => { byCategory[p.category || 'Other'] = (byCategory[p.category || 'Other'] || 0) + 1; });
  const accName = {};
  accounts.forEach((a) => { accName[a.id] = a; });
  return {
    users: accounts.length,
    sellers: sellers.size,
    buyers: buyers.size,
    activeNow: active(15 * 60 * 1000),
    active24h: active(24 * 3600 * 1000),
    newUsers7d: accounts.filter((a) => a.createdAt && now - new Date(a.createdAt).getTime() < 7 * 864e5).length,
    visits: Number(st.totalVisits || 0),
    dailyVisits: st.dailyVisits || {},
    dailyOrders,
    products: products.length,
    orders: orders.length,
    ordersByStatus,
    salesByCurrency,
    byCountry,
    byCategory,
    recentUsers: accounts.slice(-25).reverse().map((a) => ({
      name: a.name, email: a.email, phone: a.phone || '', country: a.country || 'IN',
      createdAt: a.createdAt, lastSeen: a.lastSeen || null, google: !!a.googleId,
    })),
    recentProducts: products.slice(0, 30).map((p) => ({
      id: p.id, title: p.title, country: p.country, price: p.price, category: p.category,
      currency: p.currency, seller: p.shopName, phone: p.sellerPhone || '', createdAt: p.createdAt,
    })),
    paySummary: {
      confirmed: orders.filter((o) => String(o.status).toUpperCase() !== 'PAYMENT_PENDING' && String(o.status).toUpperCase() !== 'CANCELLED').length,
      cod: orders.filter((o) => o.paymentMethod !== 'ONLINE' && String(o.status).toUpperCase() !== 'CANCELLED').length,
      onlinePaid: orders.filter((o) => o.paymentMethod === 'ONLINE' && o.paymentStatus === 'VERIFIED' && String(o.status).toUpperCase() !== 'CANCELLED').length,
      onlinePending: orders.filter((o) => String(o.status).toUpperCase() === 'PAYMENT_PENDING').length,
      onlineRejected: orders.filter((o) => o.paymentStatus === 'REJECTED').length,
    },
    onlinePayments: orders.filter((o) => o.paymentMethod === 'ONLINE').slice(0, 100).map((o) => ({
      ref: o.ref, createdAt: o.createdAt, total: o.total, currency: o.currency || 'INR', txnId: o.txnId || '',
      paymentStatus: o.paymentStatus || 'AWAITING', status: String(o.status || 'CONFIRMED').toUpperCase(),
      buyer: o.name, buyerPhone: o.phone, seller: o.sellerShop, sellerPhone: o.sellerPhone || '',
      items: (o.items || []).map((i) => i.qty + 'x ' + i.title).join(', '),
    })),
    onlineTotal: orders.filter((o) => o.paymentMethod === 'ONLINE' && o.paymentStatus === 'VERIFIED' && String(o.status).toUpperCase() !== 'CANCELLED').reduce((a, o) => a + (Number(o.total) || 0), 0),
    recentOrders: orders.slice(0, 40).map((o) => ({
      ref: o.ref, total: o.total, currency: o.currency, country: o.country, city: o.city,
      status: String(o.status || 'CONFIRMED').toUpperCase(), createdAt: o.createdAt,
      buyer: o.name, buyerPhone: o.phone, seller: o.sellerShop,
      items: (o.items || []).map((i) => i.qty + 'x ' + i.title).join(', '),
    })),
  };
}

module.exports = {
  ready, ensureImage, remoteImageUrl, touchAccount, ORDER_STATUSES,
  listProducts, listAllProducts, getProduct, addProduct, updateProduct, deleteProduct, imagePath, flushPendingWrites,
  createAccount, updateAccount, findAccountById, findAccountByEmail,
  findAccountByPhone, findAccountByPair, findPhonelessByEmail, findAccountByGoogle, recordProductView, productViewCount, listOrders, addOrder,
  updateOrderStatus, listSellerPaymentOrders, restoreImageFromRemote, txnUsed, verifyPayment, rejectPayment, countryFromPhone, CANCEL_WINDOW_MS, deleteOrder, dashboardStats, recordVisit, normPhone, ROOT, IMG, productLikeInfo, toggleProductLike,
};
