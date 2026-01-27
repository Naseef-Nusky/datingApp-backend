import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
//authentication middleware
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] },
      });
      
      if (!req.user || !req.user.isActive) {
        return res.status(401).json({ message: 'User not authorized' });
      }
      
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const admin = (req, res, next) => {
  if (req.user && req.user.userType === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

export const streamer = (req, res, next) => {
  if (req.user && (req.user.userType === 'streamer' || req.user.userType === 'talent')) {
    next();
  } else {
    res.status(403).json({ message: 'Streamer/Talent access required' });
  }
};

