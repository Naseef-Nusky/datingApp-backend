import express from 'express';
import { Op } from 'sequelize';
import { User, GiftCatalog, Gift, CreditTransaction, Notification, Chat, Message, PresentCategory } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const findOrCreateChat = async (user1Id, user2Id) => {
  const [u1, u2] = [String(user1Id), String(user2Id)].sort();
  let chat = await Chat.findOne({
    where: {
      [Op.or]: [
        { user1Id: u1, user2Id: u2 },
        { user1Id: u2, user2Id: u1 },
      ],
    },
  });
  if (!chat) {
    chat = await Chat.create({ user1Id: u1, user2Id: u2 });
  }
  return chat;
};

// @route   GET /api/gifts/present-categories
// @desc    Get present category names (for displaying name not slug in Present Shop)
// @access  Private
router.get('/present-categories', protect, async (req, res) => {
  try {
    const categories = await PresentCategory.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
      attributes: ['id', 'name', 'slug'],
    });
    res.json({ categories });
  } catch (error) {
    console.error('Get present categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gifts/catalog
// @desc    Get active gift catalog (for chat/email gift picker / present shop)
// @access  Private
router.get('/catalog', protect, async (req, res) => {
  try {
    const { type } = req.query;
    const where = { isActive: true };
    if (type === 'virtual') {
      where.type = 'virtual';
    } else if (type === 'physical') {
      where.type = 'physical';
    }

    const gifts = await GiftCatalog.findAll({
      where,
      order: [['creditCost', 'ASC']],
      attributes: ['id', 'name', 'description', 'category', 'type', 'imageUrl', 'creditCost'],
    });
    res.json(gifts);
  } catch (error) {
    console.error('Get catalog error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/gifts/send
// @desc    Send a gift (deducts credits for paid gifts; free if creditCost === 0)
// @access  Private
router.post('/send', protect, async (req, res) => {
  try {
    const { receiverId, giftId, message } = req.body;

    if (!receiverId || !giftId) {
      return res.status(400).json({ message: 'Receiver ID and Gift ID required' });
    }

    const giftItem = await GiftCatalog.findByPk(giftId);
    if (!giftItem || !giftItem.isActive) {
      return res.status(404).json({ message: 'Gift not found' });
    }

    const creditCost = parseInt(giftItem.creditCost, 10) || 0;
    const senderId = req.user.id;

    if (creditCost > 0) {
      const user = await User.findByPk(senderId, { attributes: ['id', 'credits'] });
      if (!user) return res.status(401).json({ message: 'User not found' });
      if ((user.credits || 0) < creditCost) {
        return res.status(400).json({
          message: 'Insufficient credits',
          required: creditCost,
          balance: user.credits || 0,
        });
      }
      await user.decrement('credits', { by: creditCost });
    }

    const giftType = giftItem.type === 'physical' ? 'physical' : 'virtual';
    const gift = await Gift.create({
      sender: senderId,
      receiver: receiverId,
      giftType,
      giftItem: giftId,
      message: message || null,
      creditsUsed: creditCost,
    });

    if (creditCost > 0) {
      await CreditTransaction.create({
        userId: senderId,
        type: 'usage',
        amount: -creditCost,
        description: `Gift: ${giftItem.name}`,
        relatedTo: 'gift',
        relatedId: gift.id,
      });
    }

    await Notification.create({
      userId: receiverId,
      type: 'gift_received',
      title: 'Gift Received',
      message: `You received a ${giftItem.name}`,
      relatedId: gift.id,
      relatedType: 'gift',
    });

    // Create a chat message so the gift appears as a sticker/attachment in the thread
    let chat = null;
    try {
      chat = await findOrCreateChat(senderId, receiverId);
      const message = await Message.create({
        chatId: chat.id,
        sender: senderId,
        receiver: receiverId,
        content: giftItem.name || '',
        mediaUrl: giftItem.imageUrl || null,
        messageType: 'gift',
        creditsUsed: 0,
      });
      
      // Update chat's last message + unread count so contact list + notification badges update
      if (chat && chat.id) {
        try {
          await chat.update({
            lastMessage: giftItem.name || '',
            lastMessageAt: new Date(),
          });

          // Increment unread count for receiver (same logic as regular messages)
          if (chat.user1Id === receiverId) {
            await chat.increment('unreadCountUser1');
          } else {
            await chat.increment('unreadCountUser2');
          }
        } catch (chatUpdateError) {
          console.error('Error updating chat after gift:', chatUpdateError.message);
        }
      }

      // Real-time: notify receiver so "My Contacts" sidebar updates (e.g. "X sent a gift")
      if (req.io) {
        const receiverIdStr = String(receiverId);
        const senderIdStr = String(senderId);
        req.io.to(`user-${receiverIdStr}`).emit('new-message', { messageType: 'gift', senderId, receiverId });
        req.io.to(`user-${receiverIdStr}`).emit('contact-update', { userId: senderId, chatId: chat?.id || null });
        req.io.to(`user-${senderIdStr}`).emit('contact-update', { userId: receiverId, chatId: chat?.id || null });
      }
    } catch (chatErr) {
      console.warn('Gift chat message skipped:', chatErr.message);
    }

    const sent = await Gift.findByPk(gift.id, {
      include: [
        { model: GiftCatalog, as: 'giftItemData', attributes: ['id', 'name', 'imageUrl', 'creditCost'] },
      ],
    });
    res.status(201).json(sent);
  } catch (error) {
    console.error('Send gift error:', error);
    const isFk = error.name === 'SequelizeForeignKeyConstraintError';
    const isValidation = error.name === 'SequelizeValidationError';
    if (isFk || isValidation) {
      return res.status(400).json({
        message: isFk ? 'Invalid receiver or gift. Please refresh and try again.' : 'Validation failed.',
      });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gifts/received
// @desc    Get received gifts
// @access  Private
router.get('/received', protect, async (req, res) => {
  try {
    const gifts = await Gift.findAll({
      where: { receiver: req.user.id },
      include: [
        { model: User, as: 'senderData', attributes: ['id', 'email'] },
        { model: GiftCatalog, as: 'giftItemData' },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(gifts);
  } catch (error) {
    console.error('Get received gifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/gifts/sent
// @desc    Get sent gifts
// @access  Private
router.get('/sent', protect, async (req, res) => {
  try {
    const gifts = await Gift.findAll({
      where: { sender: req.user.id },
      include: [
        { model: User, as: 'receiverData', attributes: ['id', 'email'] },
        { model: GiftCatalog, as: 'giftItemData' },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(gifts);
  } catch (error) {
    console.error('Get sent gifts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
