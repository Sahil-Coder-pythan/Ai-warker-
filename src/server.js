require('dotenv').config();
const { app } = require('./app');
const store = require('./services/shop-store');
const port = Number(process.env.PORT || 3000);
const start = () => app.listen(port, '0.0.0.0', () => {
  console.log(`Stratic Global Market listening on port ${port}`);
});
// Never start serving while database restore is still running: a late restore can
// otherwise overwrite fresh local writes. Fail closed when configured persistence is unsafe.
store.ready().then(start).catch((err) => {
  console.error('Startup blocked to protect marketplace data:', err.message);
  process.exitCode = 1;
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') process.exit(1);
});
