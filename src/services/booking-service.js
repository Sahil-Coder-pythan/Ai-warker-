const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { getCarrierService } = require('./carrier-service');
async function createBooking(input) {
  const publicRef = `ST-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const carrier = getCarrierService();
  const booking = await prisma.bookingRequest.create({
    data: {
      ...input, publicRef, status: 'REQUESTED',
      events: { create: { status: 'REQUESTED', note: 'Booking request received by Stratic Global Market.' } }
    },
    select: { publicRef: true, status: true, senderCountry: true, receiverCountry: true, createdAt: true }
  });
  // Carrier adapter is intentionally not allowed to claim success without provider confirmation.
  if (carrier.isConfigured()) {
    try { return await carrier.submitBooking(booking, input); }
    catch (err) { console.error('Carrier submission failed:', err.message); }
  }
  return booking;
}
async function findBooking(publicRef, phone) {
  return prisma.bookingRequest.findFirst({
    where: { publicRef, OR: [{ senderPhone: phone }, { receiverPhone: phone }] },
    select: {
      publicRef: true, status: true, senderCountry: true, receiverCountry: true,
      createdAt: true, updatedAt: true, carrierName: true, carrierTracking: true,
      events: { select: { status: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' } }
    }
  });
}
module.exports = { createBooking, findBooking };
