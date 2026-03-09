import express from 'express';
import { translateLocale } from '../utils/translateService.js';

const router = express.Router();

/**
 * GET /api/translate/locale?target=es
 * Returns the full UI locale JSON for the given language.
 * For en/en-uk returns source; for others uses Google Cloud Translation API (cached).
 */
router.get('/locale', async (req, res) => {
  try {
    const target = (req.query.target || 'en').toLowerCase().trim();
    const supported = ['en', 'en-uk', 'es', 'de', 'fr', 'it', 'pt', 'hi', 'ar', 'zh', 'ja', 'ko'];
    const lang = supported.includes(target) ? target : 'en';
    const locale = await translateLocale(lang);
    res.json(locale);
  } catch (err) {
    console.error('Translate locale error:', err);
    res.status(500).json({ message: 'Translation failed', error: err.message });
  }
});

export default router;
