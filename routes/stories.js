import express from 'express';
import Story from '../models/Story.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/stories/');
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `${uuidv4()}.${ext}`);
  },
});

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
// @desc    Upload a story
// @access  Private
router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const mediaType = req.file.mimetype.startsWith('image/') ? 'photo' : 'video';
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours

    const story = await Story.create({
      userId: req.user._id,
      mediaType,
      mediaUrl: `/uploads/stories/${req.file.filename}`,
      expiresAt,
    });

    res.status(201).json(story);
  } catch (error) {
    console.error('Upload story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/stories
// @desc    Get all active stories
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: { $gt: new Date() },
    })
      .populate('userId', 'email')
      .sort({ createdAt: -1 });

    res.json(stories);
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/stories/:id
// @desc    Get a specific story
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id).populate('userId', 'email');

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.expiresAt < new Date()) {
      return res.status(404).json({ message: 'Story has expired' });
    }

    // Record view
    const hasViewed = story.views.some(
      (view) => view.userId.toString() === req.user._id.toString()
    );

    if (!hasViewed) {
      story.views.push({
        userId: req.user._id,
        viewedAt: new Date(),
      });
      await story.save();
    }

    res.json(story);
  } catch (error) {
    console.error('Get story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/stories/:id/react
// @desc    React to a story
// @access  Private
router.post('/:id/react', protect, async (req, res) => {
  try {
    const { reaction } = req.body;
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.expiresAt < new Date()) {
      return res.status(404).json({ message: 'Story has expired' });
    }

    // Remove existing reaction from this user
    story.reactions = story.reactions.filter(
      (r) => r.userId.toString() !== req.user._id.toString()
    );

    // Add new reaction
    story.reactions.push({
      userId: req.user._id,
      reaction,
      reactedAt: new Date(),
    });

    await story.save();

    res.json(story);
  } catch (error) {
    console.error('React to story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

