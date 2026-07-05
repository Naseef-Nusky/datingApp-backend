/**
 * Verify Stripe is configured for mobile checkout (redirect URLs + session creation).
 *
 * Usage:
 *   node scripts/testStripeMobile.mjs
 *   node scripts/testStripeMobile.mjs --create-session   # also create a real test checkout session
 */
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { getMobileAppWebBase, getStripeCheckoutReturnBase, buildStripeCheckoutRedirectUrl } from '../utils/universalLinks.js';

dotenv.config();

const createSession = process.argv.includes('--create-session');

function mockReq(mobile) {
  return mobile
    ? { clientPlatform: 'mobile', body: { platform: 'mobile' } }
    : { clientPlatform: 'web', body: {} };
}

function buildRefillSuccessUrl(req, path = '/dashboard') {
  return buildStripeCheckoutRedirectUrl(req, { returnPath: path, flow: 'refill', status: 'success' });
}

function buildUpgradeSuccessUrl(req) {
  return buildStripeCheckoutRedirectUrl(req, { returnPath: '/dashboard', flow: 'upgrade', status: 'success' });
}

async function main() {
  console.log('\n=== Stripe Mobile Payment Check ===\n');

  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) {
    console.error('❌ STRIPE_SECRET_KEY is not set in .env');
    process.exit(1);
  }
  const mode = key.startsWith('sk_live_') ? 'LIVE' : key.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN';
  console.log(`Stripe key mode: ${mode}`);

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' });
  try {
    const account = await stripe.accounts.retrieve();
    console.log(`✅ Stripe connected — account ${account.id}`);
  } catch (err) {
    // Platform keys may not have accounts.retrieve; try balance instead
    try {
      await stripe.balance.retrieve();
      console.log('✅ Stripe connected (balance API ok)');
    } catch (err2) {
      console.error('❌ Stripe key invalid:', err2.message);
      process.exit(1);
    }
  }

  const mobileBase = getMobileAppWebBase();
  const webBase = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n--- Redirect URLs ---');
  console.log(`MOBILE_APP_WEB_URL: ${mobileBase || '(not set)'}`);
  console.log(`FRONTEND_URL (web):  ${webBase}`);

  const mobileReturn = getStripeCheckoutReturnBase(mockReq(true));
  const webReturn = getStripeCheckoutReturnBase(mockReq(false));

  console.log('\nMobile checkout returns to (native app scheme):');
  console.log(`  Base:           ${mobileReturn}`);
  console.log(`  Refill:         ${buildRefillSuccessUrl(mockReq(true), '/dashboard')}`);
  console.log(`  Subscription:   ${buildUpgradeSuccessUrl(mockReq(true))}`);
  console.log('\nWeb checkout returns to:');
  console.log(`  Refill:         ${buildRefillSuccessUrl(mockReq(false), '/dashboard')}`);
  console.log(`  Subscription:   ${buildUpgradeSuccessUrl(mockReq(false))}`);

  if (mobileReturn.startsWith('http')) {
    console.log('\n✅ Mobile uses HTTPS bridge → redirects into app WebView (no separate Safari browser).');
  } else {
    console.warn('\n⚠️  Mobile return base is not HTTPS — Stripe redirect may fail.');
  }

  if (webReturn === mobileReturn) {
    console.warn('⚠️  Mobile and web return URLs are the same.');
  }

  if (!createSession) {
    console.log('\nTip: run with --create-session to create a real Stripe test checkout URL.');
    console.log('\n--- Manual test on iOS ---');
    console.log('1. Log in to the mobile app as a regular (non-streamer) user');
    console.log('2. Tap Upgrade or Refill in the header');
    console.log('3. Complete checkout with test card: 4242 4242 4242 4242, any future expiry, any CVC');
    console.log('4. After pay, you should return to the app and see a success alert');
    console.log('5. Check My Profile — credit balance should update\n');
    return;
  }

  console.log('\n--- Creating test refill checkout session ---');
  const price = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 1600,
    product_data: { name: 'Mobile Stripe Test — 20 Credits' },
  });

  const successUrl = buildRefillSuccessUrl(mockReq(true), '/dashboard');
  const cancelUrl = buildStripeCheckoutRedirectUrl(mockReq(true), {
    returnPath: '/dashboard',
    flow: 'refill',
    status: 'cancelled',
  });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { type: 'refill', credits: '20', test: 'mobile-check' },
  });

  console.log(`✅ Session created: ${session.id}`);
  console.log(`   success_url: ${session.success_url}`);
  console.log(`\nOpen in browser to test payment:\n   ${session.url}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
