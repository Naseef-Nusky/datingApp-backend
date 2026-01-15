import express from 'express';
import { Op } from 'sequelize';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import ChatRequest from '../models/ChatRequest.js';
import CallRequest from '../models/CallRequest.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Match from '../models/Match.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Notification from '../models/Notification.js';
import Block from '../models/Block.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';
import { uploadToSpaces } from '../utils/spacesUpload.js';
import { sendEmail, sendEmailNotification } from '../utils/emailService.js';
import { sendMessageNotification } from '../utils/sendgridService.js';
import { notifyNewMessage } from '../utils/notificationService.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image, video, and audio files are allowed'), false);
    }
  },
});

// Credit costs - REMOVED: All messages are now free
const CREDIT_COSTS = {
  chat: 0,
  email: 0,
  intro: 0,
};

// Helper function to find or create chat between two users
const findOrCreateChat = async (user1Id, user2Id) => {
  // Ensure consistent ordering (smaller ID first)
  const [user1, user2] = [user1Id, user2Id].sort();
  
  let chat = await Chat.findOne({
    where: {
      [Op.or]: [
        { user1Id: user1, user2Id: user2 },
        { user1Id: user2, user2Id: user1 },
      ],
    },
  });

  if (!chat) {
    chat = await Chat.create({
      user1Id: user1,
      user2Id: user2,
    });
  }

  return chat;
};

// @route   POST /api/messages
// @desc    Send a message (only if chat exists and is accepted)
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId, content, messageType = 'text', chatId, mediaUrl } = req.body;

    // Allow messages with just mediaUrl (for attachments) or just content (for text)
    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver ID is required' });
    }
    
    // Allow empty content if mediaUrl is provided (for media-only messages)
    if (!content && !mediaUrl) {
      return res.status(400).json({ message: 'Content or media URL is required' });
    }

    // Check if users are blocked
    const isBlocked = await Block.findOne({
      where: {
        [Op.or]: [
          { blocker: req.user.id, blocked: receiverId },
          { blocker: receiverId, blocked: req.user.id },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ message: 'Cannot send message: User is blocked' });
    }

    // Find or create chat - allow direct messaging without request
    let chat;
    try {
      if (chatId) {
        chat = await Chat.findByPk(chatId);
        if (!chat) {
          return res.status(404).json({ message: 'Chat not found' });
        }
        // Verify user is part of this chat
        if (chat.user1Id !== req.user.id && chat.user2Id !== req.user.id) {
          return res.status(403).json({ message: 'Not authorized for this chat' });
        }
      } else {
        // Try to find existing chat
        chat = await Chat.findOne({
          where: {
            [Op.or]: [
              { user1Id: req.user.id, user2Id: receiverId },
              { user1Id: receiverId, user2Id: req.user.id },
            ],
          },
        });

        // If chat doesn't exist, create it automatically (no request needed)
        if (!chat) {
          try {
            chat = await findOrCreateChat(req.user.id, receiverId);
            console.log(`✅ Auto-created chat: ${chat.id} for users ${req.user.id} and ${receiverId}`);
          } catch (createError) {
            console.error('Error creating chat:', createError.message);
            // Continue without chat if table doesn't exist (backward compatibility)
            chat = null;
          }
        }
      }
    } catch (chatError) {
      console.error('Chat error:', chatError.message);
      // Continue without chat if table doesn't exist (backward compatibility)
      chat = null;
    }

    // Credit handling - REMOVED: All messages are now free
    let creditsUsed = 0;

    // Create message
    // For media messages, don't put placeholder text in content - keep it empty or use actual text if provided
    const messageData = {
      sender: req.user.id,
      receiver: receiverId,
      content: mediaUrl ? (content || '') : content, // Only use content if it's not a media message, or if user provided text with media
      mediaUrl: mediaUrl || null,
      messageType: messageType === 'chat' ? 'text' : messageType,
      // Store how many credits were actually used for this message (0 for normal chat/media)
      creditsUsed,
    };

    // Only add chatId if chat exists
    if (chat && chat.id) {
      messageData.chatId = chat.id;
      console.log(`💾 Creating message with chatId: ${chat.id}`);
    } else {
      console.log(`💾 Creating message without chatId (Chat table may not exist)`);
    }

    const message = await Message.create(messageData);
    console.log(`✅ Message created with ID: ${message.id}, sender: ${message.sender}, receiver: ${message.receiver}`);

    // Update chat's last message and timestamp (if chat exists)
    if (chat && chat.id) {
      try {
        await chat.update({
          lastMessage: content,
          lastMessageAt: new Date(),
        });

        // Update unread count for receiver
        if (chat.user1Id === receiverId) {
          await chat.increment('unreadCountUser1');
        } else {
          await chat.increment('unreadCountUser2');
        }
      } catch (chatUpdateError) {
        console.error('Error updating chat:', chatUpdateError.message);
        // Non-critical, continue
      }
    }

    // Create notification with sender info
    try {
      const senderUser = await User.findByPk(req.user.id, {
        attributes: ['id', 'email'],
        include: [{
          model: Profile,
          as: 'profile',
          attributes: ['firstName'],
        }],
      });
      
      // Use notification service which handles email sending
      await notifyNewMessage(receiverId, senderUser, content, message.id);
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Non-critical, continue
    }

    // Emit socket event for real-time message notification
    if (req.io) {
      try {
        const receiverIdStr = String(receiverId);
        req.io.to(`user-${receiverIdStr}`).emit('new-message', {
          messageId: message.id,
          senderId: req.user.id,
          receiverId: receiverId,
          content: content,
          messageType: messageType,
          chatId: chat?.id || null,
          createdAt: message.createdAt,
        });
        console.log(`📨 Emitted new-message event to user-${receiverIdStr}`);
        
        // Also emit contact-update event to refresh contacts list
        req.io.to(`user-${receiverIdStr}`).emit('contact-update', {
          userId: req.user.id,
          chatId: chat?.id || null,
        });
      } catch (socketError) {
        console.error('Error emitting socket event:', socketError);
        // Non-critical, continue
      }
    }

    // Include chat and user data in response
    const messageWithDetails = await Message.findByPk(message.id, {
      include: [
        {
          model: Chat,
          as: 'chat',
        },
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
        },
      ],
    });

    res.status(201).json(messageWithDetails);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages
// @desc    Get messages by chat_id or userId (backward compatible)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { chatId, userId } = req.query;

    let chat;

    // If chatId provided, use it
    if (chatId) {
      try {
        chat = await Chat.findByPk(chatId);
        if (!chat) {
          return res.status(404).json({ message: 'Chat not found' });
        }
        // Verify user is part of this chat
        if (chat.user1Id !== req.user.id && chat.user2Id !== req.user.id) {
          return res.status(403).json({ message: 'Not authorized for this chat' });
        }
      } catch (chatError) {
        // Chat table might not exist yet, fall back to userId method
        console.log('Chat table may not exist, using userId method:', chatError.message);
        chat = null;
      }
    } 
    // If userId provided (backward compatibility), find or create chat
    if (userId && !chat) {
      try {
        chat = await findOrCreateChat(req.user.id, userId);
      } catch (chatError) {
        // Chat table might not exist yet, continue without chat
        console.log('Chat table may not exist, continuing without chat:', chatError.message);
        chat = null;
      }
    }
    
    if (!chatId && !userId) {
      return res.status(400).json({ message: 'Chat ID or User ID required' });
    }

    // Get messages for this chat (excluding deleted messages)
    // If chat exists, use chatId; otherwise fall back to sender/receiver matching
    let whereClause;
    if (chat && chat.id) {
      whereClause = { chatId: chat.id, isDeleted: false };
      console.log(`🔍 Loading messages for chatId: ${chat.id}`);
    } else {
      whereClause = {
        [Op.or]: [
          { sender: req.user.id, receiver: userId },
          { sender: userId, receiver: req.user.id },
        ],
        isDeleted: { [Op.or]: [false, null] }, // Also include messages where isDeleted is null (old messages)
      };
      console.log(`🔍 Loading messages between ${req.user.id} and ${userId} (no chatId)`);
    }

    const messages = await Message.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
        },
      ],
      order: [['created_at', 'ASC']], // Use snake_case to match database column
    });

    console.log(`📨 Found ${messages.length} messages in database`);

    // Mark messages as read (messages sent to current user)
    const unreadMessages = messages.filter(
      msg => msg.receiver === req.user.id && !msg.isRead
    );

    if (unreadMessages.length > 0) {
      await Message.update(
        {
          isRead: true,
          readAt: new Date(),
        },
        {
          where: {
            id: { [Op.in]: unreadMessages.map(m => m.id) },
          },
        }
      );

      // Reset unread count for current user (only if chat exists)
      if (chat && chat.id) {
        try {
          if (chat.user1Id === req.user.id) {
            await chat.update({ unreadCountUser1: 0 });
          } else {
            await chat.update({ unreadCountUser2: 0 });
          }
        } catch (chatUpdateError) {
          console.log('Note: Could not update chat unread count:', chatUpdateError.message);
        }
      }
    }

    console.log(`✅ Returning ${messages.length} messages for user ${req.user.id}`);
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/messages/:messageId/read
// @desc    Mark message as read
// @access  Private
router.put('/:messageId/read', protect, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId, {
      include: [
        {
          model: Chat,
          as: 'chat',
        },
      ],
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify user is the receiver
    if (message.receiver !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Mark as read
    await message.update({
      isRead: true,
      readAt: new Date(),
    });

    // Update chat unread count
    const chat = message.chat;
    if (chat.user1Id === req.user.id) {
      await chat.update({ unreadCountUser1: Math.max(0, chat.unreadCountUser1 - 1) });
    } else {
      await chat.update({ unreadCountUser2: Math.max(0, chat.unreadCountUser2 - 1) });
    }

    res.json(message);
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/messages/:messageId
// @desc    Soft delete a message
// @access  Private
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify user is sender or receiver
    if (message.sender !== req.user.id && message.receiver !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Soft delete
    await message.update({
      isDeleted: true,
      deletedAt: new Date(),
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/chats
// @desc    Get all chats for current user
// @access  Private
router.get('/chats', protect, async (req, res) => {
  try {
    const chats = await Chat.findAll({
      where: {
        [Op.or]: [
          { user1Id: req.user.id },
          { user2Id: req.user.id },
        ],
      },
      include: [
        {
          model: User,
          as: 'user1Data',
          attributes: ['id', 'email'],
        },
        {
          model: User,
          as: 'user2Data',
          attributes: ['id', 'email'],
        },
      ],
      order: [['last_message_at', 'DESC']], // Use snake_case to match database column
    });

    // Get unread counts and last messages for each chat
    const chatsWithDetails = await Promise.all(
      chats.map(async (chat) => {
        const otherUser = chat.user1Id === req.user.id 
          ? chat.user2Data 
          : chat.user1Data;
        
        const unreadCount = chat.user1Id === req.user.id 
          ? chat.unreadCountUser1 
          : chat.unreadCountUser2;

        const lastMessage = await Message.findOne({
          where: {
            chatId: chat.id,
            isDeleted: false,
          },
          order: [['created_at', 'DESC']], // Use snake_case to match database column
          include: [
            {
              model: User,
              as: 'senderData',
              attributes: ['id', 'email'],
            },
          ],
        });

        return {
          chatId: chat.id,
          otherUser,
          lastMessage,
          unreadCount,
          lastMessageAt: chat.lastMessageAt,
          createdAt: chat.createdAt,
        };
      })
    );

    res.json(chatsWithDetails);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get all conversations (backward compatible)
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    let chats = [];
    
    // Try to get chats from Chat table
    try {
      chats = await Chat.findAll({
        where: {
          [Op.or]: [
            { user1Id: req.user.id },
            { user2Id: req.user.id },
          ],
        },
        include: [
          {
            model: User,
            as: 'user1Data',
            attributes: ['id', 'email'],
            include: [{
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            }],
          },
          {
            model: User,
            as: 'user2Data',
            attributes: ['id', 'email'],
            include: [{
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            }],
          },
        ],
        order: [['last_message_at', 'DESC']],
      });
    } catch (chatError) {
      // Chat table might not exist, fall back to messages-based approach
      console.log('Chat table may not exist, using messages-based approach:', chatError.message);
      chats = [];
    }

    // If we have chats, process them
    if (chats.length > 0) {
      const conversations = await Promise.all(
        chats.map(async (chat) => {
          const otherUser = chat.user1Id === req.user.id 
            ? chat.user2Data 
            : chat.user1Data;
          
          const unreadCount = chat.user1Id === req.user.id 
            ? chat.unreadCountUser1 
            : chat.unreadCountUser2;

          const lastMessage = await Message.findOne({
            where: {
              chatId: chat.id,
              isDeleted: false,
            },
            order: [['created_at', 'DESC']],
          });

          return {
            userId: otherUser.id,
            user: {
              id: otherUser.id,
              email: otherUser.email,
              profile: otherUser.profile,
            },
            lastMessage,
            unreadCount,
          };
        })
      );

      return res.json(conversations);
    }

    // Fallback: Get conversations from messages (if Chat table doesn't exist)
    const allMessages = await Message.findAll({
      where: {
        [Op.or]: [
          { sender: req.user.id },
          { receiver: req.user.id },
        ],
        isDeleted: false,
      },
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
          include: [{
            model: Profile,
            as: 'profile',
            attributes: ['firstName', 'lastName', 'photos'],
          }],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [{
            model: Profile,
            as: 'profile',
            attributes: ['firstName', 'lastName', 'photos'],
          }],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    // Group by conversation partner
    const conversationsMap = new Map();
    
    for (const message of allMessages) {
      const otherUserId = message.sender === req.user.id 
        ? message.receiver 
        : message.sender;
      
      const otherUser = message.sender === req.user.id 
        ? message.receiverData 
        : message.senderData;
      
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          user: {
            id: otherUser.id,
            email: otherUser.email,
            profile: otherUser.profile,
          },
          lastMessage: message,
          unreadCount: 0,
        });
      }
      
      const conv = conversationsMap.get(otherUserId);
      
      // Update unread count
      if (message.receiver === req.user.id && !message.isRead) {
        conv.unreadCount++;
      }
      
      // Update last message if this is more recent
      if (!conv.lastMessage || new Date(message.createdAt) > new Date(conv.lastMessage.createdAt)) {
        conv.lastMessage = message;
      }
    }

    const conversations = Array.from(conversationsMap.values());
    res.json(conversations);
  } catch (error) {
    console.error('❌ [GET CONVERSATIONS] Error:', error);
    console.error('❌ [GET CONVERSATIONS] Error message:', error.message);
    console.error('❌ [GET CONVERSATIONS] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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

    // Credit check removed - intro messages are now free

    // Send messages to all receivers
    const messages = await Promise.all(
      receiverIds.map(async (receiverId) => {
        // Find or create chat for each receiver
        const chat = await findOrCreateChat(req.user.id, receiverId);
        
        const message = await Message.create({
          chatId: chat.id,
          sender: req.user.id,
          receiver: receiverId,
          content,
          messageType: 'intro',
          isIntroMessage: true,
          creditsUsed: 0, // Intro messages are now free
        });

        // Update chat
        await chat.update({
          lastMessage: content,
          lastMessageAt: new Date(),
        });

        // Update unread count
        if (chat.user1Id === receiverId) {
          await chat.increment('unreadCountUser1');
        } else {
          await chat.increment('unreadCountUser2');
        }

        // Create notification
        await Notification.create({
          userId: receiverId,
          type: 'new_message',
          title: 'New Intro Message',
          message: `You have a new intro message`,
          relatedId: message.id,
          relatedType: 'message',
        });

        return message;
      })
    );

    // Credit transaction removed - intro messages are now free

    res.status(201).json({ messages, creditsUsed: 0 });
  } catch (error) {
    console.error('Send intro messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/chat-requests
// @desc    Create a chat request
// @access  Private
router.post('/chat-requests', protect, async (req, res) => {
  try {
    const { receiverId, firstMessage } = req.body;

    if (!receiverId || !firstMessage) {
      return res.status(400).json({ message: 'Receiver ID and first message required' });
    }

    if (receiverId === req.user.id) {
      return res.status(400).json({ message: 'Cannot send chat request to yourself' });
    }

    // Check if users are blocked
    const isBlocked = await Block.findOne({
      where: {
        [Op.or]: [
          { blocker: req.user.id, blocked: receiverId },
          { blocker: receiverId, blocked: req.user.id },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ message: 'Cannot send chat request: User is blocked' });
    }

    // Check if chat already exists
    const existingChat = await Chat.findOne({
      where: {
        [Op.or]: [
          { user1Id: req.user.id, user2Id: receiverId },
          { user1Id: receiverId, user2Id: req.user.id },
        ],
      },
    });

    if (existingChat) {
      return res.status(400).json({ message: 'Chat already exists. You can send messages directly.' });
    }

    // Check if pending request already exists
    const existingRequest = await ChatRequest.findOne({
      where: {
        senderId: req.user.id,
        receiverId: receiverId,
        status: 'pending',
      },
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Chat request already sent. Please wait for response.' });
    }

    // Create chat request
    const chatRequest = await ChatRequest.create({
      senderId: req.user.id,
      receiverId: receiverId,
      firstMessage: firstMessage,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    // Include sender data in response
    const requestWithSender = await ChatRequest.findByPk(chatRequest.id, {
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
        },
      ],
    });

    // Create notification for receiver
    try {
      await Notification.create({
        userId: receiverId,
        type: 'chat_request',
        title: 'New Chat Request',
        message: `You have a new chat request`,
        relatedId: chatRequest.id,
        relatedType: 'chat_request',
      });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Non-critical, continue
    }

    // Emit socket event for real-time chat request notification
    if (req.io) {
      try {
        const receiverIdStr = String(receiverId);
        req.io.to(`user-${receiverIdStr}`).emit('new-chat-request', {
          requestId: chatRequest.id,
          senderId: req.user.id,
          receiverId: receiverId,
          firstMessage: firstMessage,
          senderData: requestWithSender.senderData,
          createdAt: chatRequest.createdAt,
        });
        console.log(`📬 Emitted new-chat-request event to user-${receiverIdStr}`);
      } catch (socketError) {
        console.error('Error emitting socket event:', socketError);
        // Non-critical, continue
      }
    }

    res.status(201).json(requestWithSender);
  } catch (error) {
    console.error('Create chat request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/chat-requests
// @desc    Get chat requests (pending requests for current user)
// @access  Private
router.get('/chat-requests', protect, async (req, res) => {
  try {
    console.log('📧 [GET CHAT REQUESTS] Fetching for user:', req.user.id);
    
    const requests = await ChatRequest.findAll({
      where: {
        receiverId: req.user.id,
        status: 'pending',
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } },
        ],
      },
      include: [
        {
          model: User,
          as: 'senderData',
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
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    console.log('✅ [GET CHAT REQUESTS] Found', requests.length, 'requests');
    res.json(requests);
  } catch (error) {
    console.error('❌ [GET CHAT REQUESTS] Error:', error);
    console.error('❌ [GET CHAT REQUESTS] Error message:', error.message);
    console.error('❌ [GET CHAT REQUESTS] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   PUT /api/messages/chat-requests/:requestId/accept
// @desc    Accept a chat request
// @access  Private
router.put('/chat-requests/:requestId/accept', protect, async (req, res) => {
  try {
    const { requestId } = req.params;

    const chatRequest = await ChatRequest.findByPk(requestId, {
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
        },
      ],
    });

    if (!chatRequest) {
      return res.status(404).json({ message: 'Chat request not found' });
    }

    if (chatRequest.receiverId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to accept this request' });
    }

    if (chatRequest.status !== 'pending') {
      return res.status(400).json({ message: `Chat request is already ${chatRequest.status}` });
    }

    // Check if chat already exists
    let chat = await Chat.findOne({
      where: {
        [Op.or]: [
          { user1Id: chatRequest.senderId, user2Id: chatRequest.receiverId },
          { user1Id: chatRequest.receiverId, user2Id: chatRequest.senderId },
        ],
      },
    });

    // Create chat if it doesn't exist
    if (!chat) {
      chat = await Chat.create({
        user1Id: chatRequest.senderId,
        user2Id: chatRequest.receiverId,
        lastMessage: chatRequest.firstMessage,
        lastMessageAt: new Date(),
      });
    }

    // Update chat request status
    await chatRequest.update({
      status: 'accepted',
    });

    // Create initial message from the first message
    try {
      await Message.create({
        sender: chatRequest.senderId,
        receiver: chatRequest.receiverId,
        content: chatRequest.firstMessage,
        messageType: 'text',
        chatId: chat.id,
        isRead: false,
      });
    } catch (msgError) {
      console.error('Error creating initial message:', msgError);
      // Non-critical, continue
    }

    // Create notification for sender
    try {
      await Notification.create({
        userId: chatRequest.senderId,
        type: 'chat_request_accepted',
        title: 'Chat Request Accepted',
        message: `Your chat request has been accepted`,
        relatedId: chat.id,
        relatedType: 'chat',
      });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Non-critical, continue
    }

    // Emit socket events for real-time updates
    if (req.io) {
      try {
        const senderIdStr = String(chatRequest.senderId);
        const receiverIdStr = String(chatRequest.receiverId);
        
        // Notify sender that their request was accepted
        req.io.to(`user-${senderIdStr}`).emit('chat-request-accepted', {
          requestId: chatRequest.id,
          chatId: chat.id,
          receiverId: chatRequest.receiverId,
        });
        
        // Notify receiver to update their contacts
        req.io.to(`user-${receiverIdStr}`).emit('contact-update', {
          userId: chatRequest.senderId,
          chatId: chat.id,
        });
        
        // Also notify sender to update their contacts
        req.io.to(`user-${senderIdStr}`).emit('contact-update', {
          userId: chatRequest.receiverId,
          chatId: chat.id,
        });
        
        console.log(`✅ Emitted chat-request-accepted and contact-update events`);
      } catch (socketError) {
        console.error('Error emitting socket event:', socketError);
        // Non-critical, continue
      }
    }

    res.json({
      message: 'Chat request accepted',
      chatId: chat.id,
      chat: chat,
    });
  } catch (error) {
    console.error('Accept chat request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/messages/chat-requests/:requestId/reject
// @desc    Reject a chat request
// @access  Private
router.put('/chat-requests/:requestId/reject', protect, async (req, res) => {
  try {
    const { requestId } = req.params;

    const chatRequest = await ChatRequest.findByPk(requestId);

    if (!chatRequest) {
      return res.status(404).json({ message: 'Chat request not found' });
    }

    if (chatRequest.receiverId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to reject this request' });
    }

    if (chatRequest.status !== 'pending') {
      return res.status(400).json({ message: `Chat request is already ${chatRequest.status}` });
    }

    // Update status to rejected
    await chatRequest.update({
      status: 'rejected',
    });

    // Create notification for sender
    try {
      await Notification.create({
        userId: chatRequest.senderId,
        type: 'chat_request_rejected',
        title: 'Chat Request Rejected',
        message: `Your chat request was rejected`,
        relatedId: chatRequest.id,
        relatedType: 'chat_request',
      });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Non-critical, continue
    }

    res.json({ message: 'Chat request rejected' });
  } catch (error) {
    console.error('Reject chat request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/upload
// @desc    Upload a file (image, video, or audio) for a message
// @access  Private
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { receiverId, messageType } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver ID is required' });
    }

    // Determine message type from file if not provided
    let finalMessageType = messageType;
    if (!finalMessageType) {
      if (req.file.mimetype.startsWith('image/')) {
        finalMessageType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        finalMessageType = 'video';
      } else if (req.file.mimetype.startsWith('audio/')) {
        finalMessageType = 'voice';
      } else {
        finalMessageType = 'text';
      }
    }

    // Upload to DigitalOcean Spaces
    console.log('Uploading message file to DigitalOcean Spaces...');
    const fileUrl = await uploadToSpaces(
      req.file.buffer,
      req.file.mimetype,
      'messages',
      req.file.originalname
    );
    console.log('Message file uploaded to Spaces:', fileUrl);

    res.status(200).json({
      url: fileUrl,
      messageType: finalMessageType,
      fileName: req.file.originalname,
    });
  } catch (error) {
    console.error('Upload message file error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/messages/call-requests
// @desc    Get call requests (missed calls and call history for current user)
// @access  Private
router.get('/call-requests', protect, async (req, res) => {
  try {
    // Query for call requests where user is involved (as caller or receiver)
    // Only get statuses that exist in enum: 'pending', 'accepted', 'rejected', 'missed', 'completed'
    const requests = await CallRequest.findAll({
      where: {
        [Op.or]: [
          { receiverId: req.user.id },
          { callerId: req.user.id },
        ],
        // Only get statuses relevant for contact section: missed calls and completed calls
        status: { [Op.in]: ['missed', 'completed'] },
      },
      include: [
        {
          model: User,
          as: 'callerData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            },
          ],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 100, // Get enough call history
    });

    console.log(`✅ [API] Found ${requests.length} call requests for user ${req.user.id}`);
    res.json(requests);
  } catch (error) {
    console.error('❌ [API] Get call requests error:', error);
    console.error('Error details:', error.message);
    // Return empty array instead of error to prevent frontend crashes
    res.json([]);
  }
});


// ==================== EMAIL ROUTES ====================

// @route   GET /api/messages/emails
// @desc    Get all emails (messageType='email') for current user
// @access  Private
router.get('/emails', protect, async (req, res) => {
  try {
    const { filter = 'all' } = req.query; // 'all', 'unread', 'read'

    const whereClause = {
      [Op.or]: [
        { sender: req.user.id },
        { receiver: req.user.id },
      ],
      messageType: 'email',
      isDeleted: { [Op.or]: [false, null] },
    };

    if (filter === 'unread') {
      whereClause.isRead = false;
      whereClause.receiver = req.user.id; // Only unread emails received by user
    } else if (filter === 'read') {
      // "Read & Unanswered" - emails that are read but haven't been replied to
      // This means: emails received by user, marked as read, and no reply exists
      whereClause.isRead = true;
      whereClause.receiver = req.user.id; // Only emails received by user
      
      // We'll filter out emails that have replies in the frontend
      // Or we can check in the backend if there's a reply message
    }

    const emails = await Message.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            },
          ],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'photos'],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    res.json(emails);
  } catch (error) {
    console.error('❌ [GET EMAILS] Error:', error);
    console.error('❌ [GET EMAILS] Error message:', error.message);
    console.error('❌ [GET EMAILS] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   GET /api/messages/emails/:emailId
// @desc    Get single email by ID
// @access  Private
router.get('/emails/:emailId', protect, async (req, res) => {
  try {
    const { emailId } = req.params;

    const email = await Message.findOne({
      where: {
        id: emailId,
        messageType: 'email',
        isDeleted: { [Op.or]: [false, null] },
        [Op.or]: [
          { sender: req.user.id },
          { receiver: req.user.id },
        ],
      },
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'photos', 'age', 'location'],
            },
          ],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'photos', 'age', 'location'],
            },
          ],
        },
      ],
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Mark as read if current user is receiver
    if (email.receiver === req.user.id && !email.isRead) {
      await email.update({
        isRead: true,
        readAt: new Date(),
      });
      
      // Emit socket event for real-time read status update
      if (req.io) {
        try {
          req.io.to(`user-${req.user.id}`).emit('email-read', {
            emailId: email.id,
            readAt: new Date(),
          });
        } catch (socketError) {
          console.error('Error emitting email-read socket event:', socketError);
        }
      }
    }

    res.json(email);
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/send-email
// @desc    Send email (internal message + actual email notification)
// @access  Private
router.post('/send-email', protect, upload.single('media'), async (req, res) => {
  try {
    const { receiverId, subject, content, mediaUrl } = req.body;
    let uploadedMediaUrl = mediaUrl || null;
    
    // Handle file upload if present
    if (req.file) {
      try {
        console.log('📧 [SEND EMAIL] Uploading media file...');
        uploadedMediaUrl = await uploadToSpaces(
          req.file.buffer,
          req.file.mimetype,
          `emails/${Date.now()}-${req.file.originalname}`,
          req.file.originalname
        );
        console.log('✅ [SEND EMAIL] Media uploaded:', uploadedMediaUrl);
      } catch (uploadError) {
        console.error('❌ [SEND EMAIL] Error uploading media:', uploadError);
        return res.status(500).json({ message: 'Error uploading media file', error: uploadError.message });
      }
    }

    console.log('📧 [SEND EMAIL] Request received:', { receiverId, hasContent: !!content, hasSubject: !!subject });

    if (!receiverId) {
      return res.status(400).json({ message: 'Receiver ID is required' });
    }

    // Allow empty content if media is provided
    if (!content && !req.file && !mediaUrl) {
      return res.status(400).json({ message: 'Email content or media is required' });
    }

    // Get receiver user with profile
    let receiver;
    try {
      receiver = await User.findByPk(receiverId, {
        include: [
          {
            model: Profile,
            as: 'profile',
          },
        ],
      });
    } catch (dbError) {
      console.error('❌ [SEND EMAIL] Database error finding receiver:', dbError);
      return res.status(500).json({ message: 'Error finding receiver user', error: dbError.message });
    }

    if (!receiver) {
      console.warn('⚠️ [SEND EMAIL] Receiver not found:', receiverId);
      return res.status(404).json({ message: 'Receiver not found' });
    }

    console.log('✅ [SEND EMAIL] Receiver found:', receiver.email);
    console.log('✅ [SEND EMAIL] Receiver has profile:', !!receiver.profile);
    console.log('✅ [SEND EMAIL] Receiver email valid:', receiver.email && receiver.email.includes('@'));

    // Check if users are blocked
    const isBlocked = await Block.findOne({
      where: {
        [Op.or]: [
          { blocker: req.user.id, blocked: receiverId },
          { blocker: receiverId, blocked: req.user.id },
        ],
      },
    });

    if (isBlocked) {
      return res.status(403).json({ message: 'Cannot send email: User is blocked' });
    }

    // Get sender user with profile for email notification
    let sender;
    try {
      sender = await User.findByPk(req.user.id, {
        include: [
          {
            model: Profile,
            as: 'profile',
          },
        ],
      });
    } catch (dbError) {
      console.error('❌ [SEND EMAIL] Database error finding sender:', dbError);
      return res.status(500).json({ message: 'Error finding sender user', error: dbError.message });
    }

    if (!sender) {
      console.error('❌ [SEND EMAIL] Sender not found:', req.user.id);
      return res.status(500).json({ message: 'Sender user not found' });
    }

    // Find or create chat thread for email conversation (REQUIRED - chat_id is NOT NULL)
    let chat;
    try {
      chat = await findOrCreateChat(req.user.id, receiverId);
      console.log('✅ [SEND EMAIL] Chat thread found/created:', chat.id);
    } catch (chatError) {
      console.error('❌ [SEND EMAIL] Database error finding/creating chat:', chatError);
      return res.status(500).json({ message: 'Error creating chat thread', error: chatError.message });
    }

    // Create internal message record WITH chat_id (REQUIRED - fixes NOT NULL constraint)
    const messageData = {
      chatId: chat.id, // ✅ REQUIRED - every message must belong to a chat thread
      sender: req.user.id,
      receiver: receiverId,
      content: content,
      mediaUrl: uploadedMediaUrl || null,
      messageType: 'email', // Email is just a message type, still needs chat_id
      creditsUsed: 0,
    };

    let message;
    try {
      message = await Message.create(messageData);
      console.log('✅ [SEND EMAIL] Message created with chat_id:', message.id, 'chat:', chat.id);
    } catch (dbError) {
      console.error('❌ [SEND EMAIL] Database error creating message:', dbError);
      return res.status(500).json({ message: 'Error creating message', error: dbError.message });
    }

    // Send actual email notification to receiver's email address IMMEDIATELY
    // Note: Email sending is optional - if it fails, the message is still saved
    // But we send it synchronously to ensure immediate delivery
    const emailStartTime = Date.now();
    try {
      const emailSubject = subject || `New email from ${sender.profile?.firstName || sender.email?.split('@')[0] || 'Someone'}`;
      console.log('📧 [SEND EMAIL] ========== STARTING EMAIL SEND ==========');
      console.log('📧 [SEND EMAIL] Timestamp:', new Date().toISOString());
      console.log('📧 [SEND EMAIL] Receiver email:', receiver.email);
      console.log('📧 [SEND EMAIL] Sender:', sender.email);
      console.log('📧 [SEND EMAIL] Message ID:', message.id);
      
      let emailResult;
      
      // Try SendGrid first (if configured), then fallback to SMTP
      if (process.env.SENDGRID_API_KEY) {
        console.log('📧 [SEND EMAIL] Using SendGrid (IMMEDIATE SEND)...');
        console.log('📧 [SEND EMAIL] FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER);
        console.log('📧 [SEND EMAIL] Media URL:', uploadedMediaUrl || 'None');
        
        // Send email IMMEDIATELY - no delays, no queues
        emailResult = await sendMessageNotification(receiver, sender, content, message.id, uploadedMediaUrl);
        
        const emailDuration = Date.now() - emailStartTime;
        console.log('📧 [SEND EMAIL] Email send completed in', emailDuration, 'ms');
      } else {
        console.log('📧 [SEND EMAIL] Using SMTP (nodemailer) (IMMEDIATE SEND)...');
        emailResult = await sendEmailNotification(receiver, sender, content, 'email', uploadedMediaUrl);
        
        const emailDuration = Date.now() - emailStartTime;
        console.log('📧 [SEND EMAIL] Email send completed in', emailDuration, 'ms');
      }
      
      if (emailResult && emailResult.success) {
        const totalTime = Date.now() - emailStartTime;
        console.log('✅ [SEND EMAIL] ========== EMAIL SENT SUCCESSFULLY ==========');
        console.log('✅ [SEND EMAIL] Total time:', totalTime, 'ms');
        console.log('✅ [SEND EMAIL] Email notification sent successfully to:', receiver.email);
        console.log('✅ [SEND EMAIL] Message ID:', emailResult.messageId);
        console.log('✅ [SEND EMAIL] Status Code:', emailResult.statusCode);
        console.log('✅ [SEND EMAIL] Sent at:', emailResult.sentAt || new Date().toISOString());
        console.log('✅ [SEND EMAIL] Email should arrive within 1-5 seconds');
        console.log('✅ [SEND EMAIL] Check SendGrid Activity: https://app.sendgrid.com/activity');
      } else {
        console.error('❌ [SEND EMAIL] ========== EMAIL SEND FAILED ==========');
        console.error('❌ [SEND EMAIL] Error:', emailResult?.error || 'Unknown error');
        console.error('❌ [SEND EMAIL] Details:', emailResult?.details || 'No details');
        console.error('❌ [SEND EMAIL] Help URL:', emailResult?.helpUrl || 'N/A');
        console.error('❌ [SEND EMAIL] Full result:', JSON.stringify(emailResult, null, 2));
        // Still return success for the API call, but log the email failure
      }
    } catch (emailError) {
      const totalTime = Date.now() - emailStartTime;
      console.error('❌ [SEND EMAIL] ========== EXCEPTION DURING EMAIL SEND ==========');
      console.error('❌ [SEND EMAIL] Total time before error:', totalTime, 'ms');
      console.error('❌ [SEND EMAIL] Error:', emailError);
      console.error('❌ [SEND EMAIL] Error message:', emailError.message);
      console.error('❌ [SEND EMAIL] Error stack:', emailError.stack);
      // Don't fail the request if email sending fails - message is already saved
      // This allows the system to work even if email service is not configured
    }

    // Emit socket event for real-time notification
    if (req.io) {
      try {
        const receiverIdStr = String(receiverId);
        req.io.to(`user-${receiverIdStr}`).emit('new-email', {
          messageId: message.id,
          senderId: req.user.id,
          receiverId: receiverId,
          subject: subject || 'New email',
          createdAt: message.createdAt,
        });
      } catch (socketError) {
        console.error('Error emitting socket event:', socketError);
      }
    }

    // Return message with user details
    const messageWithDetails = await Message.findByPk(message.id, {
      include: [
        {
          model: User,
          as: 'senderData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'photos'], // Use 'photos' instead of 'profileImage'
            },
          ],
        },
        {
          model: User,
          as: 'receiverData',
          attributes: ['id', 'email'],
          include: [
            {
              model: Profile,
              as: 'profile',
              attributes: ['id', 'firstName', 'lastName', 'photos'], // Use 'photos' instead of 'profileImage'
            },
          ],
        },
      ],
    });

    res.status(201).json(messageWithDetails);
  } catch (error) {
    console.error('❌ [SEND EMAIL] Error:', error);
    console.error('❌ [SEND EMAIL] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   PUT /api/messages/emails/:emailId/read
// @desc    Mark email as read
// @access  Private
router.put('/emails/:emailId/read', protect, async (req, res) => {
  try {
    const { emailId } = req.params;

    const email = await Message.findOne({
      where: {
        id: emailId,
        messageType: 'email',
        receiver: req.user.id, // Only receiver can mark as read
      },
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    await email.update({
      isRead: true,
      readAt: new Date(),
    });

    // Emit socket event for real-time read status update
    if (req.io) {
      try {
        req.io.to(`user-${req.user.id}`).emit('email-read', {
          emailId: email.id,
          readAt: new Date(),
        });
      } catch (socketError) {
        console.error('Error emitting email-read socket event:', socketError);
      }
    }

    res.json(email);
  } catch (error) {
    console.error('Mark email as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/messages/emails/:emailId
// @desc    Delete email (soft delete)
// @access  Private
router.delete('/emails/:emailId', protect, async (req, res) => {
  try {
    const { emailId } = req.params;

    const email = await Message.findOne({
      where: {
        id: emailId,
        messageType: 'email',
        [Op.or]: [
          { sender: req.user.id },
          { receiver: req.user.id },
        ],
      },
    });

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    await email.update({
      isDeleted: true,
      deletedAt: new Date(),
    });

    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Delete email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// @route   POST /api/messages/test-email
// @desc    Test email sending (for debugging)
// @access  Private
router.post('/test-email', protect, async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail) {
      return res.status(400).json({ message: 'testEmail is required' });
    }

    console.log('🧪 [TEST EMAIL] Testing email delivery to:', testEmail);
    
    // Get current user
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Profile, as: 'profile' }],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create a test sender object
    const testSender = {
      id: user.id,
      email: user.email,
      profile: user.profile,
    };

    // Create a test receiver object
    const testReceiver = {
      id: 'test-receiver-id',
      email: testEmail,
      profile: {
        firstName: 'Test',
        lastName: 'User',
        photos: user.profile?.photos || [],
      },
    };

    const testContent = 'This is a test email to verify immediate delivery. Sent at: ' + new Date().toISOString();
    const testMessageId = 'test-' + Date.now();

    console.log('🧪 [TEST EMAIL] Sending test email...');
    const startTime = Date.now();

    let emailResult;
    if (process.env.SENDGRID_API_KEY) {
      emailResult = await sendMessageNotification(testReceiver, testSender, testContent, testMessageId);
    } else {
      emailResult = await sendEmailNotification(testReceiver, testSender, testContent, 'email');
    }

    const duration = Date.now() - startTime;

    if (emailResult && emailResult.success) {
      console.log('✅ [TEST EMAIL] Test email sent successfully in', duration, 'ms');
      res.json({
        success: true,
        message: 'Test email sent successfully',
        duration: duration + 'ms',
        messageId: emailResult.messageId,
        sentAt: new Date().toISOString(),
        expectedDelivery: '1-5 seconds',
      });
    } else {
      console.error('❌ [TEST EMAIL] Test email failed:', emailResult);
      res.status(500).json({
        success: false,
        message: 'Test email failed',
        error: emailResult?.error || 'Unknown error',
        details: emailResult?.details,
      });
    }
  } catch (error) {
    console.error('❌ [TEST EMAIL] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Test email error',
      error: error.message,
    });
  }
});

export default router;
