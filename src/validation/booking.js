const { z } = require('zod');
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, 'Enter a valid phone number.');
const country = z.string().trim().regex(/^[A-Z]{2}$/, 'Use a two-letter country code.');
const postal = z.string().trim().min(2).max(20);
const createBookingSchema = z.object({
  senderName: z.string().trim().min(2).max(100),
  senderPhone: phone,
  senderCountry: country,
  senderState: z.string().trim().max(100).optional().default(''),
  senderPostalCode: postal,
  receiverName: z.string().trim().min(2).max(100),
  receiverPhone: phone,
  receiverCountry: country,
  receiverState: z.string().trim().max(100).optional().default(''),
  receiverPostalCode: postal,
  parcelDescription: z.string().trim().min(3).max(500),
  weightGrams: z.coerce.number().int().min(1).max(100000),
  lengthCm: z.coerce.number().positive().max(300).optional(),
  widthCm: z.coerce.number().positive().max(300).optional(),
  heightCm: z.coerce.number().positive().max(300).optional(),
  declaredValue: z.coerce.number().min(0).max(100000000).optional(),
  currency: z.string().trim().length(3).default('INR'),
  preferredLanguage: z.string().trim().min(2).max(5).default('en')
});
const trackingSchema = z.object({
  publicRef: z.string().trim().regex(/^ST-[A-Z0-9-]{6,30}$/),
  phone
});
module.exports = { createBookingSchema, trackingSchema };
