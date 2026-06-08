/** Profile photo formats accepted on signup / profile create */
export const PROFILE_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
]);

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export const getFileExtension = (filename = '') => {
  const parts = String(filename).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

export const isAllowedProfileImage = (mimetype, originalname = '') => {
  const type = String(mimetype || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  const ext = getFileExtension(originalname);
  return PROFILE_IMAGE_EXTENSIONS.has(ext);
};

export const normalizeProfileImageMimetype = (mimetype, originalname = '') => {
  const type = String(mimetype || '').toLowerCase();
  if (type.startsWith('image/')) return type;
  const ext = getFileExtension(originalname);
  return EXT_TO_MIME[ext] || 'image/jpeg';
};

export const profileImageMulterFilter = (req, file, cb) => {
  if (isAllowedProfileImage(file.mimetype, file.originalname)) {
    cb(null, true);
    return;
  }
  cb(
    new Error('Only image files are allowed (JPG, PNG, WebP, GIF, HEIC)'),
    false
  );
};

export const isHeicImage = (mimetype, originalname = '') => {
  const type = String(mimetype || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif')) return true;
  const ext = getFileExtension(originalname);
  return ext === 'heic' || ext === 'heif';
};

/** Convert HEIC/HEIF to JPEG for storage (most browsers cannot display .heic URLs). */
export const normalizeProfileImageBuffer = async (buffer, mimetype, originalname = '') => {
  if (!isHeicImage(mimetype, originalname)) {
    return {
      buffer,
      mimetype: normalizeProfileImageMimetype(mimetype, originalname),
      originalname: originalname || 'photo.jpg',
    };
  }

  const convert = (await import('heic-convert')).default;
  const jpegBuffer = await convert({
    buffer,
    format: 'JPEG',
    quality: 0.92,
  });

  const baseName = String(originalname || 'photo').replace(/\.[^.]+$/i, '') || 'photo';
  return {
    buffer: Buffer.from(jpegBuffer),
    mimetype: 'image/jpeg',
    originalname: `${baseName}.jpg`,
  };
};
