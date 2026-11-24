import express from 'express';
import { protect } from '../middleware/auth.js';
import { AiGiftEvent } from '../models/index.js';
import { setMemberStopGiftSuggestions } from '../utils/aiCompanionService.js';

const router = express.Router();

/** Dismiss a gift suggestion */
router.post('/gift-events/:id/dismiss', protect, async (req, res) => {
  try {
    const event = await AiGiftEvent.findByPk(req.params.id);
    if (!event || event.memberId !== req.user.id) {
      return res.status(404).json({ message: 'Not found' });
    }
    if (event.eventType !== 'suggested') {
      return res.status(400).json({ message: 'Not a suggestion event' });
    }
    await AiGiftEvent.create({
      memberId: req.user.id,
      companionId: event.companionId,
      giftCatalogId: event.giftCatalogId,
      eventType: 'dismissed',
      messageId: event.messageId,
      meta: { fromEventId: event.id },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Dismiss gift suggestion error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

/** Stop all AI gift suggestions */
router.post('/gift-suggestions/opt-out', protect, async (req, res) => {
  try {
    await setMemberStopGiftSuggestions(req.user.id, true);
    res.json({ ok: true, stopGiftSuggestions: true });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
