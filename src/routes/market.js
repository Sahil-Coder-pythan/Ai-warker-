const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const EXT = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (q, f, cb) => cb(null, crypto.randomUUID() + (EXT[f.mimetype] || '.mp4')) }),
  limits: { fileSize: config.uploadMaxBytes, files: 1 },
  fileFilter: (q, f, cb) => {
    if (config.allowedVideoTypes.includes(f.mimetype)) return cb(null, true);
    const e = new Error('Only MP4, WebM or MOV videos are allowed.'); e.status = 400; cb(e);
  }
});
// In-memory store: resets on restart/redeploy. Replace with Prisma + object storage for production.
const videos = [];
const followers = new Map(); // shopSlug -> Set(uid)
const clients = new Set();
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const slug = s => s.toLowerCase().replace(/[^a-z0-9\u0900-\u0dff]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shop';
const uidOf = req => { const u = req.get('x-uid') || ''; return /^[\w-]{8,64}$/.test(u) ? u : null; };
const fcount = s => (followers.get(s) || new Set()).size;
function view(v, uid) {
  return { id: v.id, url: '/uploads/' + v.file, title: v.title, shop: v.shop, shopSlug: v.shopSlug, tags: v.tags,
    countries: v.countries, link: v.link, createdAt: v.createdAt, likes: v.likes.size, liked: !!uid && v.likes.has(uid),
    followers: fcount(v.shopSlug), following: !!uid && (followers.get(v.shopSlug) || new Set()).has(uid) };
}
function broadcast(data) {
  const msg = 'data: ' + JSON.stringify(data) + '\n\n';
  clients.forEach(r => { r.write(msg); if (r.flush) r.flush(); });
}
const online = () => broadcast({ type: 'online', count: clients.size });
router.get('/', (req, res) => res.render('market', { title: 'Stratic Market' }));
router.get('/api/videos', (req, res) => { const uid = uidOf(req); res.json({ videos: videos.slice().reverse().map(v => view(v, uid)) }); });
router.post('/api/videos', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a video first.' });
  const shop = clean(req.body.shop, 60);
  const title = clean(req.body.title, 140);
  if (!shop || !title) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Shop name and title are required.' }); }
  let link = clean(req.body.link, 300);
  if (link && !/^https?:\/\//i.test(link)) link = '';
  const v = { id: crypto.randomUUID(), file: req.file.filename, title, shop, shopSlug: slug(shop),
    tags: clean(req.body.tags, 100).split(/\s+/).filter(t => t.startsWith('#')).slice(0, 8),
    countries: [...new Set(clean(req.body.countries, 600).split(',').map(c => c.trim()).filter(Boolean))].slice(0, 60),
    link, createdAt: new Date().toISOString(), likes: new Set() };
  videos.push(v);
  while (videos.length > 200) { const old = videos.shift(); fs.unlink(path.join(uploadDir, old.file), () => {}); }
  broadcast({ type: 'video', video: view(v, null) });
  res.status(201).json({ video: view(v, uidOf(req)) });
});
router.post('/api/videos/:id/like', (req, res) => {
  const uid = uidOf(req); const v = videos.find(x => x.id === req.params.id);
  if (!uid || !v) return res.status(400).json({ error: 'Invalid request.' });
  v.likes.has(uid) ? v.likes.delete(uid) : v.likes.add(uid);
  broadcast({ type: 'like', id: v.id, likes: v.likes.size });
  res.json({ likes: v.likes.size, liked: v.likes.has(uid) });
});
router.post('/api/shops/:slug/follow', (req, res) => {
  const uid = uidOf(req); const s = req.params.slug;
  if (!uid || !videos.some(v => v.shopSlug === s)) return res.status(400).json({ error: 'Invalid request.' });
  if (!followers.has(s)) followers.set(s, new Set());
  const set = followers.get(s); set.has(uid) ? set.delete(uid) : set.add(uid);
  broadcast({ type: 'follow', slug: s, followers: set.size });
  res.json({ followers: set.size, following: set.has(uid) });
});
router.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); clients.add(res); online();
  const beat = setInterval(() => { res.write(': ping\n\n'); if (res.flush) res.flush(); }, 25000);
  req.on('close', () => { clearInterval(beat); clients.delete(res); online(); });
});
module.exports = { router, uploadDir, slug, clean };
