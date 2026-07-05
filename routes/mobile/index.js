import express from 'express';
import authRoutes from '../auth.js';
import profileRoutes from '../profiles.js';
import matchRoutes from '../matches.js';
import messageRoutes from '../messages.js';
import storyRoutes from '../stories.js';
import giftRoutes from '../gifts.js';
import creditRoutes from '../credits.js';
import notificationRoutes from '../notifications.js';
import safetyRoutes from '../safety.js';
import streamerRoutes from '../streamer.js';
import userStatusRoutes from '../userStatus.js';
import agoraRoutes from '../agora.js';
import wishlistRoutes from '../wishlist.js';
import settingsRoutes from '../settings.js';
import vipRoutes from '../vip.js';
import translateRoutes from '../translate.js';
import compatibilityRoutes from '../compatibility.js';
import mobileEmailRoutes from './emails.js';
import stripeReturnRoutes from './stripeReturn.js';

/**
 * Mobile app API — mirrors web routes under /api/mobile/*
 * Same handlers as /api/* so web stays unchanged; mobile client uses this prefix only.
 */
export default function createMobileRouter(io) {
  const router = express.Router();

  router.use((req, res, next) => {
    req.clientPlatform = 'mobile';
    next();
  });

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      platform: 'mobile',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/config', (req, res) => {
    res.json({
      platform: 'mobile',
      apiVersion: 1,
      iosLoginScheme: process.env.IOS_APP_LOGIN_SCHEME || 'com.vantagedating.app',
      features: {
        appleSignIn: true,
        googleSignIn: Boolean(process.env.GOOGLE_CLIENT_ID),
        pushNotifications: false,
      },
    });
  });

  router.use('/auth', authRoutes);
  router.use('/profiles', profileRoutes);
  router.use('/matches', matchRoutes);
  router.use(
    '/messages',
    (req, res, next) => {
      req.io = io;
      next();
    },
    messageRoutes
  );
  router.use('/stories', storyRoutes);
  router.use(
    '/gifts',
    (req, res, next) => {
      req.io = io;
      next();
    },
    giftRoutes
  );
  router.use('/credits', creditRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/safety', safetyRoutes);
  router.use('/streamer', streamerRoutes);
  router.use('/user', userStatusRoutes);
  router.use('/agora', agoraRoutes);
  router.use('/wishlist', wishlistRoutes);
  router.use('/settings', settingsRoutes);
  router.use('/vip', vipRoutes);
  router.use('/translate', translateRoutes);
  router.use('/compatibility', compatibilityRoutes);
  router.use('/emails', mobileEmailRoutes);
  router.use('/stripe', stripeReturnRoutes);

  return router;
}
