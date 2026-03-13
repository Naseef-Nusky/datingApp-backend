import express from 'express';
import { translateLocale, translateTexts } from '../utils/translateService.js';

const router = express.Router();

/**
 * GET /api/translate/locale?target=es
 * Returns the full UI locale JSON for the given language.
 * For en/en-uk returns source; for others uses Google Cloud Translation API (cached).
 */
router.get('/locale', async (req, res) => {
  try {
    const target = (req.query.target || 'en').toLowerCase().trim();
    const supported = ['en', 'en-uk', 'es', 'de', 'fr', 'it', 'pt', 'hi', 'ar', 'zh', 'ja', 'ko', 'ta', 'si'];
    const lang = supported.includes(target) ? target : 'en';
    const locale = await translateLocale(lang);
    res.json(locale);
  } catch (err) {
    console.error('Translate locale error:', err);
    res.status(500).json({ message: 'Translation failed', error: err.message });
  }
});

/**
 * POST /api/translate
 * Body: { texts: string[], target: string }
 * Returns: { translations: string[] }
 * Used for whole-page translation: send all visible texts, get back translations in same order.
 */
router.post('/', async (req, res) => {
  try {
    const { texts, target } = req.body || {};
    const lang = (target || 'en').toLowerCase().trim();
    const supported = ['en', 'en-uk', 'es', 'de', 'fr', 'it', 'pt', 'hi', 'ar', 'zh', 'ja', 'ko', 'ta', 'si'];
    const targetLang = supported.includes(lang) ? lang : 'en';

    if (!Array.isArray(texts)) {
      return res.status(400).json({ message: 'texts must be an array' });
    }
    if (targetLang === 'en') {
      return res.json({ translations: texts });
    }

    const translations = await translateTexts(texts, targetLang);
    res.json({ translations });
  } catch (err) {
    console.error('Translate texts error:', err);
    res.status(500).json({ message: 'Translation failed', error: err.message });
  }
});

export default router;
