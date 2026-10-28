const rateLimit = require('express-rate-limit');
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 2000, standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many booking requests. Please try later.' }
});
module.exports = { generalLimiter, bookingLimiter };
