const { supportedLanguages, getMessages } = require('../i18n');
function attachLanguage(req, res, next) {
  const queryLang = typeof req.query.lang === 'string' ? req.query.lang : '';
  const headerLang = (req.get('accept-language') || '').split(',')[0].split('-')[0];
  const candidate = queryLang || headerLang || 'en';
  const lang = supportedLanguages.includes(candidate) ? candidate : 'en';
  res.locals.lang = lang;
  res.locals.t = getMessages(lang);
  res.locals.supportedLanguages = supportedLanguages;
  next();
}
module.exports = { attachLanguage };
