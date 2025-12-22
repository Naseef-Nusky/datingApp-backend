import express from 'express';
import { body, validationResult } from 'express-validator';
import { User, Profile } from '../models/index.js';
import { Op } from 'sequelize';
import generateToken from '../utils/generateToken.js';
import { protect } from '../middleware/auth.js';
import { detectLocation, getClientIP } from '../utils/locationDetector.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const router = express.Router();

// Email transporter setup (configure with your email service)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('age').isInt({ min: 18 }),
    body('firstName').trim().notEmpty(),
    body('gender').isIn(['male', 'female', 'other']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, age, gender, userType } = req.body;

      // Check if user exists
      const userExists = await User.findOne({ where: { email } });
      if (userExists) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Age restriction
      if (age < 18) {
        return res.status(400).json({ message: 'Must be 18 or older to register' });
      }

      // Create user
      const user = await User.create({
        email,
        password,
        userType: userType || 'regular',
      });

      // Detect location from IP
      const clientIP = getClientIP(req);
      const location = await detectLocation(clientIP);

      // Create profile
      const profile = await Profile.create(
        {
          userId: user.id,
          firstName,
          lastName: lastName || '',
          age,
          gender,
          location,
        },
        {
          returning: true,
        }
      );

      // Generate token
      const token = generateToken(user.id);

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        profile: {
          firstName: profile.firstName,
          age: profile.age,
          location: profile.location,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Check for user
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Update profile online status
      const profile = await Profile.findOne({ where: { userId: user.id } });
      if (profile) {
        profile.isOnline = true;
        profile.lastSeen = new Date();
        await profile.save();
      }

      const token = generateToken(user.id);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
          credits: user.credits,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/password-reset
// @desc    Request password reset
// @access  Public
router.post('/password-reset', [body('email').isEmail()], async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>This link expires in 10 minutes.</p>
        `,
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
    }

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/password-reset/:token
// @desc    Reset password with token
// @access  Public
router.post('/password-reset/:token', [body('password').isLength({ min: 6 })], async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password = req.body.password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        userType: req.user.userType,
        credits: req.user.credits,
        subscriptionPlan: req.user.subscriptionPlan,
      },
      profile,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification', [body('email').isEmail()], async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate verification token if not exists
    if (!user.verificationToken) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.verificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
      await user.save();
    }

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${user.verificationToken}`;
    
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: 'Verify Your Dating App Account',
        html: `
          <h2>Welcome to Dating App!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verificationUrl}">${verificationUrl}</a>
          <p>This link will expire in 24 hours.</p>
        `,
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
    }

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

