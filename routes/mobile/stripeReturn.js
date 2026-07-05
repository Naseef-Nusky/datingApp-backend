import express from 'express';

const router = express.Router();

function paymentStatus(req) {
  const isSuccess = req.query.refill === 'success' || req.query.upgrade === 'success';
  const isCancelled = req.query.refill === 'cancelled' || req.query.upgrade === 'cancelled';
  return { isSuccess, isCancelled };
}

/**
 * Stripe Checkout success/cancel page for the native app (shown inside in-app Safari).
 * Stays on this page — no redirect to https://localhost (avoids white screen).
 * The app polls for payment completion and closes this browser automatically.
 */
router.get('/app-return', (req, res) => {
  const { isSuccess, isCancelled } = paymentStatus(req);
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';

  console.info('[Stripe] Mobile app-return page viewed', {
    success: isSuccess,
    cancelled: isCancelled,
    sessionId: sessionId ? `${sessionId.slice(0, 12)}…` : '',
  });

  const title = isSuccess
    ? 'Payment successful'
    : isCancelled
      ? 'Payment cancelled'
      : 'Returning to app';
  const message = isSuccess
    ? 'Your payment was successful. Returning to Vantage Dating…'
    : isCancelled
      ? 'Payment was cancelled. Returning to the app…'
      : 'Returning to Vantage Dating…';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(1.5rem, env(safe-area-inset-top)) 1.25rem max(1.5rem, env(safe-area-inset-bottom));
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(160deg, #f0f9ff 0%, #ffffff 45%, #fdf2f8 100%);
      color: #374151;
      text-align: center;
    }
    .card {
      width: 100%;
      max-width: 22rem;
      background: #fff;
      border-radius: 1rem;
      padding: 2rem 1.5rem;
      box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    }
    .icon {
      width: 3.5rem;
      height: 3.5rem;
      margin: 0 auto 1rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.75rem;
      font-weight: 700;
      color: #fff;
      background: ${isSuccess ? '#10b981' : isCancelled ? '#6b7280' : '#0066cc'};
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
      margin-bottom: 0.75rem;
      line-height: 1.3;
    }
    p {
      font-size: 0.95rem;
      line-height: 1.5;
      color: #4b5563;
    }
    .spinner {
      width: 1.75rem;
      height: 1.75rem;
      margin: 1.25rem auto 0;
      border: 3px solid #e5e7eb;
      border-top-color: #0066cc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✓' : isCancelled ? '✕' : '…'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${isSuccess ? '<div class="spinner" aria-hidden="true"></div>' : ''}
  </div>
</body>
</html>`);
});

export default router;
