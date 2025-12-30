import express from 'express';
import { Op } from 'sequelize';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import ChatRequest from '../models/ChatRequest.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Match from '../models/Match.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Notification from '../models/Notification.js';
import Block from '../models/Block.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';
import { uploadToSpaces } from '../utils/spacesUpload.js';

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
      
      const senderName = senderUser?.profile?.firstName || senderUser?.email?.split('@')[0] || 'Someone';
      const messagePreview = content.length > 50 ? content.substring(0, 50) + '...' : content;
      
      await Notification.create({
        userId: receiverId,
        type: 'new_message',
        title: 'New Message',
        message: `${senderName} sent you a message: ${messagePreview}`,
        relatedId: message.id,
        relatedType: 'message',
      });
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Non-critical, continue
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
    console.error('Get conversations error:', error);
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
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json(requests);
  } catch (error) {
    console.error('Get chat requests error:', error);
    res.status(500).json({ message: 'Server error' });
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

export default router;
