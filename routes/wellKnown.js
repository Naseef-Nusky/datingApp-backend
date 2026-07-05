import express from 'express';
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
  getMobileAppWebBase,
  getUniversalLinkHosts,
  isUniversalLinksEnabled,
} from '../utils/universalLinks.js';

const router = express.Router();

const aasaHandler = (req, res) => {
  const body = buildAppleAppSiteAssociation();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(body);
};

/** iOS Universal Links — must be served from the app web domain (no .json extension). */
router.get('/apple-app-site-association', aasaHandler);
router.get('/apple-app-site-association.json', aasaHandler);

/** Android App Links */
router.get('/assetlinks.json', (req, res) => {
  const body = buildAndroidAssetLinks();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(body);
});

/** Quick status for deployment checks */
router.get('/mobile-app-links', (req, res) => {
  res.json({
    universalLinksEnabled: isUniversalLinksEnabled(),
    mobileAppWebUrl: getMobileAppWebBase(),
    universalLinkHosts: getUniversalLinkHosts(),
    appleAppSiteAssociationConfigured: Boolean((process.env.APPLE_TEAM_ID || '').trim()),
    androidAssetLinksConfigured: Boolean((process.env.ANDROID_APP_SHA256_CERT || '').trim()),
  });
});

export default router;
