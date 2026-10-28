const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const store = require('./shop-store');

// Use the same persistent secret across deploys. Some existing Render setups
// already use SECRET_KEY, while newer config uses SESSION_SECRET.
const configuredSecret = String(config.sessionSecret || process.env.SECRET_KEY || '').trim();
// If no long secret is configured, derive a STABLE one from other fixed env values
// (so cookies stay valid across restarts/redeploys instead of using a random key each boot).
const stableSeed = String(process.env.DATABASE_URL || process.env.GOOGLE_CLIENT_SECRET || process.env.ADMIN_PASSWORD || 'stratic-market-fixed-seed');
const secret = configuredSecret.length >= 32
  ? configuredSecret
  : crypto.createHash('sha256').update('sgm-session:' + configuredSecret + ':' + stableSeed).digest('hex');
if (configuredSecret.length < 32) {
  console.warn('SESSION_SECRET (or SECRET_KEY) missing/short: using a derived stable secret. Better to set SESSION_SECRET (32+ chars) in Render.');
}

const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');

function makeToken(id) {
  const p = Buffer.from(JSON.stringify({ u: id, e: Date.now() + 365 * 864e5 })).toString('base64url');
  return p + '.' + sign(p);
}

function readToken(t) {
  if (!t) return null;
  const [p, s] = t.split('.');
  if (!p || !s) return null;
  const a = Buffer.from(s);
  const b = Buffer.from(sign(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(p, 'base64url').toString());
    return o.e > Date.now() ? o.u : null;
  } catch (e) {
    return null;
  }
}

function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) {
      try {
        o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
      } catch (e) {}
    }
  });
  return o;
}

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'),
  path: '/',
  maxAge: 365 * 864e5,
};

const setSession = (res, id) => res.cookie('sgm_s', makeToken(id), cookieOpts);
const clearSession = (res) => res.clearCookie('sgm_s', { path: '/' });

async function attachUser(req, res, next) {
  req.user = null;
  const id = readToken(cookies(req).sgm_s);
  if (id) {
    const u = store.findAccountById(id);
    if (u) req.user = { id: u.id, name: u.name, email: u.email };
  }
  if (typeof next === 'function') next();
}

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please log in first.' });

const csrf = (req, res, next) =>
  req.method === 'GET' || req.get('x-sgm') === '1' ? next() : res.status(403).json({ error: 'Blocked request.' });

module.exports = { bcrypt, setSession, clearSession, attachUser, requireUser, csrf };
