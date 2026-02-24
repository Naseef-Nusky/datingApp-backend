import jwt from 'jsonwebtoken';

/**
 * Generate JWT. Payload includes id and role for role-based UI (frontend never decides visibility).
 * @param {string} id - User id
 * @param {string} role - userType: 'regular'|'streamer'|'talent'|'admin'|'superadmin'|'moderator'|'viewer'
 */
const generateToken = (id, role = 'regular') => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
};

export default generateToken;
