/**
 * iOS Universal Links / Android App Links for the native mobile app.
 * Links like https://app.vantagedating.com/auth/login-callback?token=…
 * open the installed app when configured; otherwise they open in the browser.
 */

const normalizeUrl = (url) => String(url || '').replace(/\/$/, '');

const UNIVERSAL_LINK_PATHS = [
  '/auth/login-callback',
  '/auth/login-callback/*',
  '/auth/google-callback',
  '/auth/google-callback/*',
  '/register',
  '/login',
  '/signup-email',
  '/complete-profile',
  '/dashboard',
  '/dashboard/*',
  '/profile/*',
  '/profile/me',
];

export function isUniversalLinksEnabled() {
  if (process.env.MOBILE_UNIVERSAL_LINKS_ENABLED === 'false') return false;
  return Boolean(getMobileAppWebBase());
}

/** Public web origin for the Capacitor app (e.g. https://app.vantagedating.com). */
export function getMobileAppWebBase() {
  const base = normalizeUrl(
    process.env.MOBILE_APP_WEB_URL ||
      process.env.EMAIL_MOBILE_FRONTEND_URL ||
      ''
  );
  return base || null;
}

export function getIosAppBundleId() {
  return (process.env.IOS_APP_BUNDLE_ID || 'com.vantagedating.app').trim();
}

export function getIosAppLoginScheme() {
  const rawScheme = process.env.IOS_APP_LOGIN_SCHEME || 'com.vantagedating.app';
  return String(rawScheme)
    .trim()
    .replace(/:$/, '')
    .replace(/^\/+/, '');
}

/** Hostnames that must appear in iOS Associated Domains (for docs / validation). */
export function getUniversalLinkHosts() {
  const hosts = new Set();
  const base = getMobileAppWebBase();
  if (base) {
    try {
      hosts.add(new URL(base).host);
    } catch {
      /* ignore */
    }
  }
  for (const part of String(process.env.MOBILE_UNIVERSAL_LINK_HOSTS || '').split(',')) {
    const h = part.trim();
    if (h) hosts.add(h);
  }
  return [...hosts];
}

/** True when the request comes from the native mobile app API (/api/mobile/*). */
export function isMobileClient(req) {
  return req?.clientPlatform === 'mobile' || req?.body?.platform === 'mobile';
}

/** Capacitor WebView origin (must match capacitor.config.json server settings). */
export function getCapacitorAppOrigin() {
  return normalizeUrl(process.env.MOBILE_CAPACITOR_ORIGIN || 'https://localhost');
}

/** Public API base for Stripe redirect bridge pages. */
export function getMobileStripeBridgeBase() {
  return normalizeUrl(
    process.env.BACKEND_URL ||
      process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 5000}`
  );
}

/**
 * Base URL for Stripe Checkout success/cancel redirects.
 * Mobile → HTTPS bridge on the API (redirects into the app WebView).
 * Web → FRONTEND_URL (marketing site).
 */
export function getStripeCheckoutReturnBase(req) {
  if (isMobileClient(req)) {
    return getMobileStripeBridgeBase();
  }
  return normalizeUrl(process.env.FRONTEND_URL || process.env.LOCAL_FRONTEND_URL || 'http://localhost:3000');
}

/**
 * Stripe success/cancel URL.
 * Mobile: API bridge page (in-app browser) — app polls and auto-closes browser on success.
 * Stripe replaces {CHECKOUT_SESSION_ID} only when it appears literally in the URL.
 */
export function buildStripeCheckoutRedirectUrl(
  req,
  { returnPath = '/dashboard', flow = 'refill', status = 'success' } = {}
) {
  const destPath =
    typeof returnPath === 'string' && returnPath.startsWith('/') && !returnPath.startsWith('//')
      ? returnPath
      : '/dashboard';

  const base = getStripeCheckoutReturnBase(req);
  const flowKey = flow === 'upgrade' ? 'upgrade' : 'refill';
  const queryParts =
    status === 'success'
      ? [`${flowKey}=success`, 'session_id={CHECKOUT_SESSION_ID}']
      : [`${flowKey}=cancelled`];

  if (isMobileClient(req)) {
    queryParts.push(`to=${encodeURIComponent(destPath)}`);
    return `${normalizeUrl(base)}/api/mobile/stripe/app-return?${queryParts.join('&')}`;
  }

  const joiner = destPath.includes('?') ? '&' : '?';
  return `${normalizeUrl(base)}${destPath}${joiner}${queryParts.join('&')}`;
}

function safeInAppPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/dashboard';
  }
  return raw;
}

/** Capacitor in-app URL after Stripe payment (e.g. https://localhost/dashboard?refill=success&…). */
export function buildCapacitorReturnUrl(query = {}) {
  const dest = safeInAppPath(query.to);
  const params = new URLSearchParams();
  if (query.refill === 'success' || query.refill === 'cancelled') {
    params.set('refill', query.refill);
  }
  if (query.upgrade === 'success' || query.upgrade === 'cancelled') {
    params.set('upgrade', query.upgrade);
  }
  if (typeof query.session_id === 'string' && query.session_id.trim()) {
    params.set('session_id', query.session_id.trim());
  }
  const qs = params.toString();
  const origin = getCapacitorAppOrigin();
  return qs ? `${origin}${dest}?${qs}` : `${origin}${dest}`;
}

export function buildLoginCallbackUrl(token, { linkDelivery = 'web', webFallbackBase = '' } = {}) {
  const encoded = encodeURIComponent(token);

  if (isUniversalLinksEnabled()) {
    return `${getMobileAppWebBase()}/auth/login-callback?token=${encoded}`;
  }

  if (linkDelivery === 'ios-native') {
    const scheme = getIosAppLoginScheme();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(scheme)) {
      throw new Error('Invalid IOS_APP_LOGIN_SCHEME server configuration.');
    }
    return `${scheme}://auth/login-callback?token=${encoded}`;
  }

  const base = normalizeUrl(webFallbackBase);
  if (base) {
    return `${base}/auth/login-callback?token=${encoded}`;
  }

  return null;
}

export function buildAppleAppSiteAssociation() {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim();
  const bundleId = getIosAppBundleId();
  if (!teamId) {
    return {
      _configured: false,
      message:
        'Set APPLE_TEAM_ID in backend .env to generate a valid apple-app-site-association file.',
    };
  }
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          paths: UNIVERSAL_LINK_PATHS,
        },
      ],
    },
  };
}

export function buildAndroidAssetLinks() {
  const packageName = (process.env.ANDROID_APP_PACKAGE || 'com.vantagedating.app').trim();
  const sha256 = (process.env.ANDROID_APP_SHA256_CERT || '').trim();
  if (!sha256) {
    return {
      _configured: false,
      message:
        'Set ANDROID_APP_SHA256_CERT (release keystore SHA-256 fingerprint) for Android App Links.',
    };
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [sha256],
      },
    },
  ];
}
