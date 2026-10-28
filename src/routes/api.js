const express = require('express');
const { bookingLimiter } = require('../middleware/rate-limit');
const { createBookingSchema, trackingSchema } = require('../validation/booking');
const { createBooking, findBooking } = require('../services/booking-service');
const { getAssistantReply } = require('../services/ai-service');
const { getCarrierStatus } = require('../services/carrier-service');
const router = express.Router();
// Temporary public demo store: intentionally no login; resets when server restarts.
const demoParcels = [];
const demoText = { en: { title: 'Parcel demo', from: 'From', to: 'To', description: 'Documents', status: 'Parcel created', created: 'Created for language test' }, pa: { title: 'ਪਾਰਸਲ ਟੈਸਟ', from: 'ਵੱਲੋਂ', to: 'ਨੂੰ', description: 'ਦਸਤਾਵੇਜ਼', status: 'ਪਾਰਸਲ ਬਣਾਇਆ ਗਿਆ', created: 'ਭਾਸ਼ਾ ਟੈਸਟ ਲਈ ਬਣਾਇਆ ਗਿਆ' }, hi: { title: 'पार्सल टेस्ट', from: 'से', to: 'को', description: 'दस्तावेज़', status: 'पार्सल बनाया गया', created: 'भाषा परीक्षण के लिए बनाया गया' } };
function demoView(parcel, lang) { const t = demoText[lang] || demoText.en; return { id: parcel.id, title: t.title, from: parcel.from, to: parcel.to, description: t.description, status: t.status, created: t.created, sourceLanguage: parcel.sourceLanguage }; }
router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/demo-parcels', (req, res) => { const lang = String(req.query.lang || 'en').slice(0, 10); res.json({ parcels: demoParcels.slice().reverse().map(p => demoView(p, lang)), notice: 'Public temporary demo only. Do not enter real personal data.' }); });
router.post('/demo-parcels', (req, res) => { const from = String(req.body.from || '').trim().slice(0, 80); const to = String(req.body.to || '').trim().slice(0, 80); const sourceLanguage = String(req.body.sourceLanguage || 'en').slice(0, 10); if (!from || !to) return res.status(400).json({ error: 'Enter origin and destination.' }); const parcel = { id: 'SGM-' + Math.random().toString(36).slice(2, 8).toUpperCase(), from, to, sourceLanguage, createdAt: new Date().toISOString() }; demoParcels.push(parcel); if (demoParcels.length > 100) demoParcels.shift(); res.status(201).json({ parcel: demoView(parcel, String(req.body.viewLanguage || 'en').slice(0, 10)), ref: parcel.id, notice: 'Saved in temporary server memory; visible to anyone with this demo page until server restart.' }); });
router.post('/bookings', bookingLimiter, async (req, res, next) => {
  try {
    const input = createBookingSchema.parse(req.body);
    const booking = await createBooking(input);
    res.status(201).json({ booking, notice: 'Request saved. This is not a carrier-confirmed booking until a shipping provider confirms it.' });
  } catch (err) { next(err); }
});
router.get('/bookings/:publicRef', async (req, res, next) => {
  try {
    const parsed = trackingSchema.parse({ publicRef: req.params.publicRef, phone: req.query.phone });
    const booking = await findBooking(parsed.publicRef, parsed.phone);
    if (!booking) return res.status(404).json({ error: 'No booking found for that reference and phone.' });
    const carrier = await getCarrierStatus(booking);
    res.json({ booking, carrier });
  } catch (err) { next(err); }
});
router.post('/assistant', async (req, res, next) => {
  try {
    const question = String(req.body.question || '').slice(0, 2000);
    if (!question.trim()) return res.status(400).json({ error: 'Enter a question.' });
    res.json(await getAssistantReply(question, req.body.language || 'en'));
  } catch (err) { next(err); }
});
module.exports = router;
