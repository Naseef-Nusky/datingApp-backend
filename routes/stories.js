import express from 'express';
import Story from '../models/Story.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';
import { Op } from 'sequelize';
import multer from 'multer';
import { uploadToSpaces, deleteFromSpaces } from '../utils/spacesUpload.js';

const router = express.Router();

// Configure multer for memory storage (we'll upload directly to Spaces)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

// @route   POST /api/stories
// @desc    Upload a story to DigitalOcean Spaces
// @access  Private
router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Step 1: Upload to DigitalOcean Spaces
    console.log('Uploading story media to DigitalOcean Spaces...');
    const mediaUrl = await uploadToSpaces(
      req.file.buffer,
      req.file.mimetype,
      'stories',
      req.file.originalname
    );
    console.log('Story media uploaded to Spaces:', mediaUrl);

    // Step 2: Save to database
    console.log('Saving story to database...');
    const mediaType = req.file.mimetype.startsWith('image/') ? 'photo' : 'video';
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const story = await Story.create({
      userId: req.user.id, // Using Sequelize, so it's req.user.id not req.user._id
      mediaType,
      mediaUrl,
      expiresAt,
    });
    console.log('Story saved to database successfully:', story.id);

    res.status(201).json({
      ...story.toJSON(),
      message: 'Story uploaded successfully to DigitalOcean Spaces and saved to database',
    });
  } catch (error) {
    console.error('Upload story error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/stories
// @desc    Get all active stories
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const stories = await Story.findAll({
      where: {
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'photos'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(stories);
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/stories/:id
// @desc    Get a specific story
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'email'],
        },
      ],
    });

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.expiresAt < new Date()) {
      return res.status(404).json({ message: 'Story has expired' });
    }

    // Record view
    const views = Array.isArray(story.views) ? story.views : [];
    const hasViewed = views.some(
      (view) => view.userId === req.user.id
    );

    if (!hasViewed) {
      views.push({
        userId: req.user.id,
        viewedAt: new Date(),
      });
      await story.update({ views });
    }

    res.json(story);
  } catch (error) {
    console.error('Get story error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/stories/:id/react
// @desc    React to a story
// @access  Private
router.post('/:id/react', protect, async (req, res) => {
  try {
    const { reaction } = req.body;
    const story = await Story.findByPk(req.params.id);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.expiresAt < new Date()) {
      return res.status(404).json({ message: 'Story has expired' });
    }

    // Remove existing reaction from this user
    const reactions = Array.isArray(story.reactions) ? story.reactions : [];
    const filteredReactions = reactions.filter(
      (r) => r.userId !== req.user.id
    );

    // Add new reaction
    filteredReactions.push({
      userId: req.user.id,
      reaction,
      reactedAt: new Date(),
    });

    await story.update({ reactions: filteredReactions });

    res.json(story);
  } catch (error) {
    console.error('React to story error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/stories/:id
// @desc    Delete a story
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const story = await Story.findByPk(req.params.id);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Check if user owns the story
    if (String(story.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to delete this story' });
    }

    // Delete media from DigitalOcean Spaces if needed
    if (story.mediaUrl) {
      try {
        await deleteFromSpaces(story.mediaUrl);
        console.log('Story media deleted from Spaces:', story.mediaUrl);
      } catch (deleteError) {
        console.error('Error deleting story media from Spaces:', deleteError);
        // Continue with story deletion even if media deletion fails
      }
    }

    // Delete story from database
    await story.destroy();
    console.log('Story deleted successfully:', req.params.id);

    res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

