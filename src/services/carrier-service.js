const configured = () => Boolean(process.env.CARRIER_PROVIDER && process.env.CARRIER_PROVIDER !== 'manual' && process.env.CARRIER_API_KEY && process.env.CARRIER_BASE_URL);
function getCarrierService() {
  return {
    isConfigured: configured,
    async submitBooking() {
      if (!configured()) throw new Error('Carrier provider is not configured');
      // Provider-specific API schema, auth, idempotency and webhook verification must be implemented
      // for the selected contracted carrier before enabling real booking.
      throw new Error('Carrier adapter not implemented for the selected provider');
    }
  };
}
async function getCarrierStatus(booking) {
  if (!booking.carrierTracking || !booking.carrierName) {
    return { live: false, message: 'Live carrier tracking is not configured for this request.' };
  }
  return { live: false, message: 'Provider-specific live tracking adapter must be connected.' };
}
module.exports = { getCarrierService, getCarrierStatus };
