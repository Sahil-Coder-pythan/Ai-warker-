const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'locales');
const supportedLanguages = fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort();
const cache = new Map();
function getMessages(lang) {
  if (!cache.has(lang)) {
    try { cache.set(lang, JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'))); }
    catch { cache.set(lang, JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'))); }
  }
  return { ...JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8')), ...cache.get(lang) };
}
module.exports = { supportedLanguages, getMessages };
