function notFound(req, res) {
  if (req.accepts('html')) return res.status(404).render('error', { title: 'Not found', message: 'That page could not be found.' });
  return res.status(404).json({ error: 'Not found' });
}
function errorHandler(err, req, res, next) {
  console.error(err && err.message ? err.message : 'Unknown application error');
  if (res.headersSent) return next(err);
  const status = Number(err.status) || 500;
  const message = status >= 500 ? 'Something went wrong. Please try again.' : err.message;
  if (req.path.startsWith('/api') || req.originalUrl.split('?')[0].includes('/api/')) return res.status(status).json({ error: message });
  return res.status(status).render('error', { title: 'Error', message });
}
module.exports = { notFound, errorHandler };
