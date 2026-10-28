module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || '',
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024),
  allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp']
};
