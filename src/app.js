const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const { generalLimiter } = require('./middleware/rate-limit');
const { errorHandler, notFound } = require('./middleware/errors');
const { attachLanguage } = require('./middleware/language');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');
const { router: marketRoutes, uploadDir } = require('./routes/market');
const shopRoutes = require('./routes/shop');
const ejsMate = require('ejs-mate');
const app = express();
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'"],
  connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
}}}));
app.use(compression());
app.use(cors({ origin: process.env.APP_URL || false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(generalLimiter);
app.use(attachLanguage);
// PWA endpoints let supported browsers install the site as a home-screen app.
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').sendFile(path.join(__dirname, 'public', 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'sw.js'));
});
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));
app.use('/uploads', express.static(uploadDir, { maxAge: '1h' }));
app.use('/market', marketRoutes);
app.use('/shop', shopRoutes);
app.get('/dashboard', (req, res) => res.redirect('/shop/admin'));
app.get('/admin', (req, res) => res.redirect('/shop/admin'));
app.get('/', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  // Google sometimes redirects to site root with ?code=
  if (req.query && req.query.code) {
    return res.redirect('/shop/api/google/callback' + q);
  }
  res.redirect('/shop' + q);
});
// Extra OAuth callback aliases (in case Google Console URI differs)
app.get('/api/google/callback', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/shop/api/google/callback' + q);
});
app.get('/auth/google/callback', (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/shop/api/google/callback' + q);
});
app.get('/auth/google/start', (req, res) => res.redirect('/shop/api/google/start'));

app.use('/', webRoutes);
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);
module.exports = { app };
