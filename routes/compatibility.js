import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { Compatibility, Profile } from '../models/index.js';
import {
  normalizeUserPair,
  buildProfileSnapshot,
  generateAiCompatibility,
  generateAiIcebreakers,
  computeHeuristicCompatibility,
  loadProfileSnapshotForUser,
  toApiPayload,
  heuristicPayload,
} from '../utils/compatibilityService.js';

const router = express.Router();

async function getOtherProfileOr404(otherUserId, res) {
  const profile = await Profile.findOne({ where: { userId: otherUserId } });
  if (!profile) {
    res.status(404).json({ message: 'Profile not found' });
    return null;
  }
  return profile;
}

/**
 * GET /api/compatibility/with/:otherUserId
 * Score/summary cached per pair; icebreakers regenerated on every profile view.
 * Query: ?preview=1 → fast heuristic only (dashboard cards, no AI call)
 */
router.get('/with/:otherUserId', protect, async (req, res) => {
  try {
    const viewerId = req.user.id;
    const otherUserId = req.params.otherUserId;

    if (String(viewerId) === String(otherUserId)) {
      return res.status(400).json({ message: 'Cannot compare with yourself' });
    }

    const otherProfile = await getOtherProfileOr404(otherUserId, res);
    if (!otherProfile) return;

    const viewerProfile = await Profile.findOne({ where: { userId: viewerId } });
    const viewerSnapshot = buildProfileSnapshot(viewerProfile);
    const otherSnapshot = buildProfileSnapshot(otherProfile);

    if (!viewerSnapshot) {
      return res.status(400).json({ message: 'Complete your profile to see compatibility' });
    }

    const previewOnly = req.query.preview === '1' || req.query.preview === 'true';
    if (previewOnly) {
      const heuristic = computeHeuristicCompatibility(viewerSnapshot, otherSnapshot);
      return res.json(heuristicPayload(heuristic, otherUserId));
    }

    const [userLowId, userHighId] = normalizeUserPair(viewerId, otherUserId);
    let record = await Compatibility.findOne({ where: { userLowId, userHighId } });
    const previousIcebreakers = Array.isArray(record?.icebreakers) ? record.icebreakers : [];

    if (!record) {
      const result = await generateAiCompatibility(viewerSnapshot, otherSnapshot);
      record = await Compatibility.create({
        userLowId,
        userHighId,
        score: result.score,
        summary: result.summary,
        strengths: result.strengths,
        challenges: result.challenges,
        icebreakers: [],
        source: result.source,
      });
    }

    const freshIcebreakers = await generateAiIcebreakers(viewerSnapshot, otherSnapshot, {
      avoid: previousIcebreakers,
    });

    await record.update({ icebreakers: freshIcebreakers.icebreakers });

    const payload = toApiPayload(record, viewerId, otherUserId);
    return res.json({
      ...payload,
      icebreakers: freshIcebreakers.icebreakers,
      icebreakersSource: freshIcebreakers.source,
      icebreakersRefreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[compatibility] GET with/:id', err);
    res.status(500).json({ message: 'Could not compute compatibility' });
  }
});

/**
 * POST /api/compatibility/batch
 * Body: { userIds: string[] }
 * Returns cached scores + quick heuristic for uncached (dashboard browse).
 */
router.post(
  '/batch',
  protect,
  [body('userIds').isArray({ min: 1, max: 100 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const viewerId = req.user.id;
      const userIds = [...new Set(req.body.userIds.map(String))].filter(
        (id) => id && id !== String(viewerId)
      );

      const viewerProfile = await Profile.findOne({ where: { userId: viewerId } });
      let viewerSnapshot = buildProfileSnapshot(viewerProfile);
      if (!viewerSnapshot) {
        viewerSnapshot = {
          firstName: req.user.firstName || 'You',
          age: null,
          interests: [],
          personality: [],
          relationshipGoal: null,
        };
      }

      const others = await Profile.findAll({
        where: { userId: userIds },
      });
      const otherByUserId = new Map(others.map((p) => [String(p.userId), p]));

      const scores = {};

      for (const otherUserId of userIds) {
        const [userLowId, userHighId] = normalizeUserPair(viewerId, otherUserId);
        const cached = await Compatibility.findOne({ where: { userLowId, userHighId } });

        if (cached) {
          scores[otherUserId] = {
            score: cached.score,
            summary: cached.summary,
            source: cached.source,
            cached: true,
          };
          continue;
        }

        const otherProfile = otherByUserId.get(String(otherUserId));
        if (!otherProfile) {
          scores[otherUserId] = null;
          continue;
        }

        const heuristic = computeHeuristicCompatibility(
          viewerSnapshot,
          buildProfileSnapshot(otherProfile)
        );
        scores[otherUserId] = {
          score: heuristic.score,
          summary: heuristic.summary,
          source: 'heuristic',
          cached: false,
        };
      }

      res.json({ scores });
    } catch (err) {
      console.error('[compatibility] POST batch', err);
      res.status(500).json({ message: 'Could not load compatibility scores' });
    }
  }
);

/**
 * POST /api/compatibility
 * Body: { user1, user2 } — admin/debug or explicit pair refresh
 */
router.post(
  '/',
  protect,
  [body('user1').isUUID(), body('user2').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user1 = req.body.user1;
      const user2 = req.body.user2;
      const viewerId = req.user.id;

      if (![String(user1), String(user2)].includes(String(viewerId))) {
        return res.status(403).json({ message: 'You can only generate compatibility involving yourself' });
      }

      const otherUserId = String(user1) === String(viewerId) ? user2 : user1;
      const [userLowId, userHighId] = normalizeUserPair(user1, user2);

      const viewerSnapshot = await loadProfileSnapshotForUser(viewerId);
      const otherSnapshot = await loadProfileSnapshotForUser(otherUserId);

      if (!viewerSnapshot || !otherSnapshot) {
        return res.status(404).json({ message: 'Profile not found' });
      }

      const result = await generateAiCompatibility(viewerSnapshot, otherSnapshot);

      let saved = await Compatibility.findOne({ where: { userLowId, userHighId } });
      if (saved) {
        await saved.update({
          score: result.score,
          summary: result.summary,
          strengths: result.strengths,
          challenges: result.challenges,
          icebreakers: result.icebreakers,
          source: result.source,
        });
      } else {
        saved = await Compatibility.create({
          userLowId,
          userHighId,
          score: result.score,
          summary: result.summary,
          strengths: result.strengths,
          challenges: result.challenges,
          icebreakers: result.icebreakers,
          source: result.source,
        });
      }

      res.json(toApiPayload(saved, viewerId, otherUserId));
    } catch (err) {
      console.error('[compatibility] POST /', err);
      res.status(500).json({ message: 'Could not generate compatibility' });
    }
  }
);

export default router;
