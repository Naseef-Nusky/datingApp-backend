import express from 'express';
import { Op } from 'sequelize';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get all notifications
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { limit = 50, page = 1, unreadOnly } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = { userId: req.user.id };
    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    const unreadCount = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
      },
    });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/notifications
// @desc    Create a notification
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId, type, title, message, relatedId, relatedType } = req.body;

    if (!receiverId || !type || !title || !message) {
      return res.status(400).json({ 
        message: 'receiverId, type, title, and message are required' 
      });
    }

    const notification = await Notification.create({
      userId: receiverId,
      type,
      title,
      message,
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      isRead: false,
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      {
        where: {
          userId: req.user.id,
          isRead: false,
        },
      }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;


