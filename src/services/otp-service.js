async function sendOtp(phone) {
  if (!process.env.OTP_API_KEY || process.env.OTP_PROVIDER === 'none') {
    return { configured: false, message: 'Phone verification provider is not configured. Do not treat this number as verified.' };
  }
  throw new Error('Implement and test the selected OTP provider adapter before production use.');
}
module.exports = { sendOtp };
