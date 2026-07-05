import express from 'express';
import { protect } from '../../middleware/auth.js';
import { regularUser } from '../../middleware/auth.js';
import {
  triggerMobileCompatibilityEmail,
  findTopCompatibleMatches,
} from '../../utils/mobileCompatibilityEmail.js';

const router = express.Router();

/** Mobile-only: preview top compatible matches (no email). */
router.get('/compatibility-matches/preview', protect, regularUser, async (req, res) => {
  try {
    const matches = await findTopCompatibleMatches(req.user.id);
    res.json({ matches });
  } catch (err) {
    console.error('[mobile/emails] preview', err);
    res.status(500).json({ message: 'Could not load matches' });
  }
});

/** Mobile-only: send compatibility matches email to the logged-in user (test / manual). */
router.post('/compatibility-matches/send', protect, regularUser, async (req, res) => {
  try {
    const force = req.body?.force === true;
    const outcome = await triggerMobileCompatibilityEmail(req.user.id, { force });
    res.json(outcome);
  } catch (err) {
    console.error('[mobile/emails] send', err);
    res.status(500).json({ message: err.message || 'Could not send email' });
  }
});

export default router;
