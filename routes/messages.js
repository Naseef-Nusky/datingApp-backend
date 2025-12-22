import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Credit costs
const CREDIT_COSTS = {
  chat: 1,
  email: 2,
  intro: 5,
};

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId, content, messageType = 'chat' } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver ID and content required' });
    }

    // Check if users are matched (for regular messages)
    if (messageType === 'chat') {
      const match = await Match.findOne({
        $or: [
          { user1: req.user._id, user2: receiverId, isMutual: true },
          { user1: receiverId, user2: req.user._id, isMutual: true },
        ],
      });

      if (!match) {
        return res.status(403).json({ message: 'Users must be matched to chat' });
      }
    }

    // Check credits
    const creditCost = CREDIT_COSTS[messageType] || CREDIT_COSTS.chat;
    const user = await User.findById(req.user._id);

    if (user.credits < creditCost) {
      return res.status(400).json({ message: 'Insufficient credits' });
    }

    // Deduct credits
    user.credits -= creditCost;
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: req.user._id,
      type: 'usage',
      amount: -creditCost,
      description: `${messageType} message`,
      relatedTo: 'message',
    });

    // Create message
    const message = await Message.create({
      sender: req.user._id,
      receiver: receiverId,
      content,
      messageType,
      creditsUsed: creditCost,
    });

    // Create notification
    await Notification.create({
      userId: receiverId,
      type: 'new_message',
      title: 'New Message',
      message: `You have a new message from ${req.user.email}`,
      relatedId: message._id,
      relatedType: 'message',
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/intro
// @desc    Send introductory message to multiple users
// @access  Private
router.post('/intro', protect, async (req, res) => {
  try {
    const { receiverIds, content } = req.body;

    if (!receiverIds || !Array.isArray(receiverIds) || receiverIds.length === 0) {
      return res.status(400).json({ message: 'Receiver IDs array required' });
    }

    if (!content) {
      return res.status(400).json({ message: 'Content required' });
    }

    // Anti-spam limit (max 10 intro messages at once)
    if (receiverIds.length > 10) {
      return res.status(400).json({ message: 'Maximum 10 intro messages at once' });
    }

    const creditCost = CREDIT_COSTS.intro * receiverIds.length;
    const user = await User.findById(req.user._id);

    if (user.credits < creditCost) {
      return res.status(400).json({ message: 'Insufficient credits' });
    }

    // Deduct credits
    user.credits -= creditCost;
    await user.save();

    // Send messages to all receivers
    const messages = await Promise.all(
      receiverIds.map(async (receiverId) => {
        const message = await Message.create({
          sender: req.user._id,
          receiver: receiverId,
          content,
          messageType: 'intro',
          isIntroMessage: true,
          creditsUsed: CREDIT_COSTS.intro,
        });

        // Create notification
        await Notification.create({
          userId: receiverId,
          type: 'new_message',
          title: 'New Intro Message',
          message: `You have a new intro message`,
          relatedId: message._id,
          relatedType: 'message',
        });

        return message;
      })
    );

    // Record transaction
    await CreditTransaction.create({
      userId: req.user._id,
      type: 'usage',
      amount: -creditCost,
      description: `Intro messages to ${receiverIds.length} users`,
      relatedTo: 'message',
    });

    res.status(201).json({ messages, creditsUsed: creditCost });
  } catch (error) {
    console.error('Send intro messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages
// @desc    Get messages (conversation with a user)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: userId },
        { sender: userId, receiver: req.user._id },
      ],
    })
      .populate('sender', 'email')
      .populate('receiver', 'email')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      {
        sender: userId,
        receiver: req.user._id,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get all conversations
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: req.user._id }, { receiver: req.user._id }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$receiver',
              '$sender',
            ],
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', req.user._id] },
                    { $eq: ['$isRead', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const conversationsWithUsers = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = await User.findById(conv._id).select('email');
        return {
          userId: conv._id,
          user: otherUser,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount,
        };
      })
    );

    res.json(conversationsWithUsers);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/chat-requests
// @desc    Get chat requests
// @access  Private
router.get('/chat-requests', protect, async (req, res) => {
  try {
    const requests = await Message.find({
      receiver: req.user._id,
      messageType: { $in: ['intro', 'email'] },
      isRead: false,
    })
      .populate('sender', 'email')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(requests);
  } catch (error) {
    console.error('Get chat requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

