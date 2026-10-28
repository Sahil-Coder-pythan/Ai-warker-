const multer = require('multer');
const { uploadMaxBytes, allowedVideoTypes, allowedImageTypes } = require('../config');
const storage = multer.memoryStorage();
function fileFilter(req, file, callback) {
  const allowed = [...allowedVideoTypes, ...allowedImageTypes];
  if (!allowed.includes(file.mimetype)) return callback(new Error('Only MP4/WebM/MOV videos and JPG/PNG/WebP images are accepted.'));
  callback(null, true);
}
const uploadParcelMedia = multer({ storage, limits: { fileSize: uploadMaxBytes, files: 3 }, fileFilter });
module.exports = { uploadParcelMedia };
