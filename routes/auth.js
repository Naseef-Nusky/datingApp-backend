import express from 'express';
import { body, validationResult } from 'express-validator';
import { User, Profile } from '../models/index.js';
import { Op } from 'sequelize';
import generateToken from '../utils/generateToken.js';
import { protect } from '../middleware/auth.js';
import { detectLocation, getClientIP } from '../utils/locationDetector.js';
import { sendLoginLinkEmail } from '../utils/emailService.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';

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
// @desc    Register a new user (always regular). Streamers and admins are created only via admin CRM.
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

      const { email, password, firstName, lastName, age, gender } = req.body;

      // Normalize email to lowercase for case-insensitive check
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user with this email already exists (case-insensitive)
      const userExists = await User.findOne({
        where: {
          email: {
            [Op.iLike]: normalizedEmail // Case-insensitive search (PostgreSQL)
          }
        }
      });

      if (userExists) {
        return res.status(400).json({
          message: 'Email address already registered',
          field: 'email'
        });
      }

      // Age restriction
      if (age < 18) {
        return res.status(400).json({ message: 'Must be 18 or older to register' });
      }

      // Frontend registration = real users only. Never trust role from client; streamers/admins are created only in CRM.
      const user = await User.create({
        email: normalizedEmail,
        password,
        userType: 'regular',
        isAdminCreated: false,
        registrationComplete: true,
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
          // Mark as chat ready - they'll be registered when they first open chat or when someone chats with them
          chatRegisteredAt: new Date(), // Pre-mark as registered so they can chat immediately
        },
        {
          returning: true,
        }
      );

      // Generate token (payload includes role for role-based UI)
      const token = generateToken(user.id, user.userType);

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

// @route   POST /api/auth/check-email
// @desc    Check if email already exists
// @access  Public
router.post(
  '/check-email',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          exists: false,
          message: 'Invalid email format',
          errors: errors.array() 
        });
      }

      const { email } = req.body;
      
      // Normalize email to lowercase for case-insensitive check
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user with this email already exists (case-insensitive)
      const userExists = await User.findOne({ 
        where: { 
          email: {
            [Op.iLike]: normalizedEmail // Case-insensitive search (PostgreSQL)
          }
        } 
      });

      if (userExists) {
        return res.status(200).json({ 
          exists: true,
          message: 'Email address already registered'
        });
      }

      return res.status(200).json({ 
        exists: false,
        message: 'Email is available'
      });
    } catch (error) {
      console.error('Check email error:', error);
      res.status(500).json({ 
        exists: false,
        message: 'Server error', 
        error: error.message 
      });
    }
  }
);

// @route   POST /api/auth/admin-login
// @desc    Login for CRM admin panel (username + password; username is email or login id)
// @access  Public
router.post(
  '/admin-login',
  [body('username').trim().notEmpty(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;
      const loginId = String(username).toLowerCase().trim();

      const user = await User.findOne({
        where: {
          email: { [Op.iLike]: loginId },
        },
      });
      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const allowedRoles = ['admin', 'superadmin', 'moderator', 'viewer'];
      if (!allowedRoles.includes(user.userType)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user.id, user.userType);
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
          credits: user.credits,
        },
      });
    } catch (error) {
      console.error('Admin login error:', error);
      return res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/user-login
// @desc    Login for dating app (regular users only). Streamers/admins use their own login.
// @access  Public
router.post(
  '/user-login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const normalizedEmail = req.body.email.toLowerCase().trim();
      const user = await User.findOne({
        where: { email: { [Op.iLike]: normalizedEmail } },
      });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const isMatch = await user.matchPassword(req.body.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      if (user.userType !== 'regular') {
        return res.status(403).json({
          message: 'Use the correct login: streamers use /api/auth/streamer-login, admins use /api/auth/admin-login',
        });
      }
      user.lastLogin = new Date();
      await user.save();
      const profile = await Profile.findOne({ where: { userId: user.id } });
      if (profile) {
        profile.isOnline = true;
        profile.lastSeen = new Date();
        await profile.save();
      }
      const token = generateToken(user.id, user.userType);
      res.json({
        token,
        user: { id: user.id, email: user.email, userType: user.userType, credits: user.credits },
      });
    } catch (error) {
      console.error('User login error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login (any role – backward compatible). Prefer user-login / streamer-login / admin-login for role separation.
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

      // Normalize email to lowercase for case-insensitive check
      const normalizedEmail = email.toLowerCase().trim();

      // Check for user (case-insensitive email search)
      const user = await User.findOne({ 
        where: { 
          email: {
            [Op.iLike]: normalizedEmail // Case-insensitive search (PostgreSQL)
          }
        } 
      });
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

      const token = generateToken(user.id, user.userType);

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

// @route   GET /api/auth/location
// @desc    Detect city/country from request IP (for registration etc.)
// @access  Public
router.get('/location', async (req, res) => {
  try {
    const clientIP = getClientIP(req);
    const location = await detectLocation(clientIP);
    res.json({
      city: location.city || '',
      country: location.country || '',
    });
  } catch (error) {
    console.error('Location detection error:', error);
    res.status(500).json({ city: '', country: '' });
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

// @route   PUT /api/auth/me/registration-complete
// @desc    Mark registration/onboarding as complete (after completing "about you" wizard)
// @access  Private
router.put('/me/registration-complete', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.update({ registrationComplete: true });
    res.json({ registrationComplete: true });
  } catch (error) {
    console.error('Registration complete error:', error);
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

// @route   POST /api/auth/send-login-link
// @desc    Send magic login link to email (email-based signup/login, no password)
// @access  Public
router.post(
  '/send-login-link',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const normalizedEmail = req.body.email.toLowerCase().trim();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      let user = await User.findOne({
        where: { email: { [Op.iLike]: normalizedEmail } },
        include: [{ model: Profile, as: 'profile', attributes: ['firstName'], required: false }],
      });

      if (!user) {
        const randomPassword = crypto.randomBytes(12).toString('hex');
        const hashed = await bcrypt.hash(randomPassword, 10);
        user = await User.create({
          email: normalizedEmail,
          password: hashed,
          userType: 'regular',
          registrationComplete: false,
        });
        const firstName = normalizedEmail.split('@')[0] || 'User';
        await Profile.create({
          userId: user.id,
          firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
          lastName: '',
          age: 18,
          gender: 'other',
        });
        user.profile = { firstName: user.email.split('@')[0] };
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      await User.update(
        { loginLinkToken: hashedToken, loginLinkExpires: null },
        { where: { id: user.id } }
      );

      const loginUrl = `${frontendUrl}/auth/login-callback?token=${rawToken}`;
      const firstName = user.profile?.firstName || user.email.split('@')[0] || 'User';

      const emailResult = await sendLoginLinkEmail(normalizedEmail, firstName, loginUrl, user.id);

      if (!emailResult.success) {
        // In development, allow testing without SMTP: log the link and still return success
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev && emailResult.error === 'SMTP not configured') {
          console.log('\n📧 [DEV] SMTP not configured — use this login link:');
          console.log(loginUrl);
          console.log('');
          return res.status(200).json({
            message: 'Login link sent',
            email: normalizedEmail,
            _devLoginLink: loginUrl,
          });
        }
        console.error('Login link email failed:', emailResult.error);
        return res.status(500).json({ message: 'Failed to send login email. Please try again.' });
      }

      res.status(200).json({
        message: 'Login link sent',
        email: normalizedEmail,
      });
    } catch (error) {
      console.error('Send login link error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   POST /api/auth/verify-login-link
// @desc    Exchange one-time token for JWT (called by frontend after user clicks link in email)
// @access  Public
router.post(
  '/verify-login-link',
  [body('token').trim().notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Invalid token' });
      }

      const hashedToken = crypto.createHash('sha256').update(req.body.token.trim()).digest('hex');

      const user = await User.findOne({
        where: { loginLinkToken: hashedToken },
      });

      if (!user) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Login link verify failed: no user found for token (link may be already used or invalid).');
        }
        return res.status(400).json({ message: 'Invalid login link. Request a new one.' });
      }

      // Do not clear loginLinkToken: same link can be used multiple times. It is invalidated only when a new link is requested (send-login-link or Google).
      user.lastLogin = new Date();
      await user.save();

      const profile = await Profile.findOne({ where: { userId: user.id } });
      if (profile) {
        profile.isOnline = true;
        profile.lastSeen = new Date();
        await profile.save();
      }

      const token = generateToken(user.id, user.userType);
      // Force profile completion flow when user is flagged incomplete,
      // profile record is missing, or profile data is still onboarding-level.
      const hasPhoto = Array.isArray(profile?.photos) && profile.photos.length > 0;
      const hasLookingFor = Boolean(profile?.preferences?.lookingFor);
      const hasBasicProfile =
        Boolean(profile?.firstName) &&
        Boolean(profile?.gender) &&
        Number(profile?.age || 0) >= 18;
      const profileLooksIncomplete = !profile || !hasBasicProfile || !hasLookingFor || !hasPhoto;
      const needsProfileCompletion = user.registrationComplete === false || profileLooksIncomplete;

      res.json({
        token,
        registrationComplete: !needsProfileCompletion,
        needsProfileCompletion,
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
          credits: user.credits,
        },
        profile: profile ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          age: profile.age,
          gender: profile.gender,
        } : null,
      });
    } catch (error) {
      console.error('Verify login link error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// --- Google OAuth ---
// In Google Cloud Console: "Authorized JavaScript origins" = base URL only, no path, no trailing slash (e.g. http://localhost:3000).
// "Authorized redirect URIs" = full callback URL (e.g. http://localhost:5000/api/auth/google/callback).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const getBackendUrl = () => (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');

// @route   GET /api/auth/google
// @desc    Redirect to Google OAuth consent screen
// @access  Public
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    console.warn('Google OAuth: GOOGLE_CLIENT_ID not set');
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/?error=google_not_configured`);
  }
  const backendUrl = getBackendUrl();
  const redirectUri = `${backendUrl}/api/auth/google/callback`;
  const scope = 'email profile';
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

// @route   GET /api/auth/google/callback
// @desc    Handle Google OAuth callback: exchange code for user, create/find user, redirect to frontend with token
// @access  Public
router.get('/google/callback', async (req, res) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const errorRedirect = (msg) => res.redirect(`${frontendUrl}/?error=${encodeURIComponent(msg)}`);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return errorRedirect('Google sign-in is not configured');
  }

  const { code, error: oauthError } = req.query;
  if (oauthError) {
    return errorRedirect(oauthError === 'access_denied' ? 'Sign-in was cancelled' : oauthError);
  }
  if (!code) {
    return errorRedirect('Missing authorization code');
  }

  try {
    const backendUrl = getBackendUrl();
    const redirectUri = `${backendUrl}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Google token exchange failed:', tokenRes.status, errText);
      return errorRedirect('Sign-in failed');
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    if (!accessToken) {
      return errorRedirect('Sign-in failed');
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoRes.ok) {
      console.error('Google userinfo failed:', userInfoRes.status);
      return errorRedirect('Sign-in failed');
    }
    const googleUser = await userInfoRes.json();
    const email = (googleUser.email || '').toLowerCase().trim();
    const firstName = (googleUser.given_name || googleUser.name || email.split('@')[0] || 'User').trim();
    if (!email) {
      return errorRedirect('Google account has no email');
    }

    let user = await User.findOne({
      where: { email: { [Op.iLike]: email } },
      include: [{ model: Profile, as: 'profile', attributes: ['firstName'], required: false }],
    });

    if (!user) {
      const randomPassword = crypto.randomBytes(12).toString('hex');
      const hashed = await bcrypt.hash(randomPassword, 10);
      user = await User.create({
        email,
        password: hashed,
        userType: 'regular',
        registrationComplete: false,
      });
      await Profile.create({
        userId: user.id,
        firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
        lastName: '',
        age: 18,
        gender: 'other',
      });
      user.profile = { firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() };
    }

    // Send login link email (same flow as magic link): user must click link in email to sign in
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    await User.update(
      { loginLinkToken: hashedToken, loginLinkExpires: null },
      { where: { id: user.id } }
    );

    const loginUrl = `${frontendUrl}/auth/login-callback?token=${rawToken}`;
    const displayName = user.profile?.firstName || firstName || email.split('@')[0] || 'User';
    const emailResult = await sendLoginLinkEmail(email, displayName, loginUrl, user.id);

    if (!emailResult.success && process.env.NODE_ENV !== 'production') {
      console.log('\n📧 [DEV] Google sign-in: SMTP not configured — use this login link:');
      console.log(loginUrl);
      console.log('');
    }

    // Redirect to frontend: "check your email" (no token; user logs in via email link)
    const params = new URLSearchParams({ email, login_link_sent: '1' });
    res.redirect(`${frontendUrl}/auth/google-callback?${params.toString()}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return errorRedirect('Sign-in failed');
  }
});

export default router;

