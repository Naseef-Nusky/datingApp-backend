import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/database.js';

// Import models FIRST to register them with Sequelize
import './models/index.js';
import CallRequest from './models/CallRequest.js';
import Notification from './models/Notification.js';
import User from './models/User.js';
import Profile from './models/Profile.js';
import Chat from './models/Chat.js';
import CreditTransaction from './models/CreditTransaction.js';
import { Op } from 'sequelize';
import { getCreditSettings } from './utils/creditSettings.js';
import { sendOnlineNotification } from './utils/sendgridService.js';
import { updateUserSpendAndVip } from './utils/vip.js';

// Import routes
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import matchRoutes from './routes/matches.js';
import messageRoutes from './routes/messages.js';
import storyRoutes from './routes/stories.js';
import giftRoutes from './routes/gifts.js';
import creditRoutes from './routes/credits.js';
import notificationRoutes from './routes/notifications.js';
import safetyRoutes from './routes/safety.js';
import streamerRoutes from './routes/streamer.js';
import userStatusRoutes from './routes/userStatus.js';
import agoraRoutes from './routes/agora.js';
import adminRoutes from './routes/admin.js';
import wishlistRoutes from './routes/wishlist.js';
import settingsRoutes from './routes/settings.js';
import vipRoutes from './routes/vip.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow Engine.IO v3 clients
  connectTimeout: 45000, // Connection timeout
  upgradeTimeout: 10000, // Upgrade timeout
});

const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directories
import fs from 'fs';
const uploadDirs = ['uploads', 'uploads/stories', 'uploads/wishlist'];
uploadDirs.forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Dating App API is running!' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/matches', matchRoutes);
// Pass io instance to message routes for real-time updates
app.use('/api/messages', (req, res, next) => {
  req.io = io;
  next();
}, messageRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/gifts', (req, res, next) => {
  req.io = io;
  next();
}, giftRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/streamer', streamerRoutes);
app.use('/api/user', userStatusRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/vip', vipRoutes);

// Socket.IO for real-time features (video/voice calls, live messaging)
// Store user IDs with socket connections
const socketUserMap = new Map(); // socket.id -> userId

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-room', (userId) => {
    // Ensure userId is converted to string for consistent room naming
    const userIdStr = String(userId);
    const roomName = `user-${userIdStr}`;
    socket.join(roomName);
    // Store userId with socket
    socketUserMap.set(socket.id, userIdStr);
    console.log(`📢 [SERVER] User ${userIdStr} joined room: ${roomName} (socket: ${socket.id})`);

    // Mark user online and send "X is now online!" emails to their contacts
    (async () => {
      try {
        await Profile.update({ isOnline: true }, { where: { userId: userIdStr } });
        const chats = await Chat.findAll({
          where: { [Op.or]: [{ user1Id: userIdStr }, { user2Id: userIdStr }] },
          attributes: ['user1Id', 'user2Id'],
        });
        const contactIds = [...new Set(chats.map((c) => (c.user1Id === userIdStr ? c.user2Id : c.user1Id)))];
        if (contactIds.length === 0) return;
        const onlineUser = await User.findByPk(userIdStr, {
          include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName', 'photos', 'profileImage'] }],
          attributes: ['id', 'email'],
        });
        if (!onlineUser?.email) return;
        const onlineUserData = { id: onlineUser.id, email: onlineUser.email, profile: onlineUser.profile || {} };
        for (const contactId of contactIds) {
          const contact = await User.findByPk(contactId, { attributes: ['id', 'email'] });
          if (contact?.email) {
            sendOnlineNotification(contact.email, onlineUserData).catch((err) =>
              console.error('Online notification email error:', err.message)
            );
          }
        }
      } catch (err) {
        console.error('Join-room online notification error:', err.message);
      }
    })();

    // Debug: Check room size
    io.in(roomName).fetchSockets().then(sockets => {
      console.log(`🔍 [SERVER] Room ${roomName} now has ${sockets.length} socket(s)`);
      sockets.forEach(s => {
        const socketUserId = socketUserMap.get(s.id);
        console.log(`   - Socket ${s.id} (User: ${socketUserId || 'unknown'})`);
      });
    });
  });

  // Handle typing events
  socket.on('typing', (data) => {
    const { userId, remoteUserId } = data;
    if (userId && remoteUserId) {
      const remoteUserIdStr = String(remoteUserId);
      const roomName = `user-${remoteUserIdStr}`;
      // Emit typing event to the remote user
      io.to(roomName).emit('user-typing', {
        userId: String(userId),
        remoteUserId: remoteUserIdStr,
      });
    }
  });

  // Handle stopped typing events
  socket.on('stopped-typing', (data) => {
    const { userId, remoteUserId } = data;
    if (userId && remoteUserId) {
      const remoteUserIdStr = String(remoteUserId);
      const roomName = `user-${remoteUserIdStr}`;
      // Emit stopped typing event to the remote user
      io.to(roomName).emit('user-stopped-typing', {
        userId: String(userId),
        remoteUserId: remoteUserIdStr,
      });
    }
  });

  socket.on('call-request', async (data) => {
    console.log('📞 [SERVER] Call request received:', data);
    console.log('📞 [SERVER] Caller ID:', data.callerId);
    console.log('📞 [SERVER] Receiver ID:', data.receiverId);
    console.log('📞 [SERVER] Call Type:', data.callType);
    console.log('📞 [SERVER] Channel Name:', data.channelName);
    
    // Ensure receiverId is converted to string for consistent room naming
    const receiverId = String(data.receiverId);
    const callerId = String(data.callerId);
    const roomName = `user-${receiverId}`;
    
    console.log(`🔍 [SERVER] Looking for receiver in room: ${roomName}`);
    
    // Check if receiver is in the room
    const socketsInRoom = await io.in(roomName).fetchSockets();
    console.log(`📤 [SERVER] Room ${roomName} has ${socketsInRoom.length} socket(s)`);
    
    // Create call request in database (for missed call tracking)
    let callRequestId = null;
    let missedCallTimeout = null;
    try {
      const callRequest = await CallRequest.create({
        callerId: callerId,
        receiverId: receiverId,
        callType: data.callType,
        status: 'pending',
      });
      callRequestId = callRequest.id;
      console.log(`✅ [SERVER] Call request created in database: ${callRequestId}`);
      
      // Store timeout reference in socket data so we can clear it later
      socket.data.callRequestTimeouts = socket.data.callRequestTimeouts || new Map();
      
      // Set timeout to mark as missed if not answered within 60 seconds
      missedCallTimeout = setTimeout(async () => {
        try {
          const request = await CallRequest.findByPk(callRequestId);
          if (request && request.status === 'pending') {
            await request.update({ status: 'missed' });
            console.log(`⏰ [SERVER] Call request ${callRequestId} marked as missed (timeout)`);
            
            // Emit call-request-update event to refresh call request section
            io.to(roomName).emit('call-request-update', {
              callRequestId: callRequestId,
              status: 'missed',
            });
            io.to(`user-${callerId}`).emit('call-request-update', {
              callRequestId: callRequestId,
              status: 'missed',
            });
            
            // Emit contact-update to refresh contact section
            io.to(roomName).emit('contact-update', {
              userId: callerId,
              action: 'call_missed',
            });
            io.to(`user-${callerId}`).emit('contact-update', {
              userId: receiverId,
              action: 'call_missed',
            });
          }
        } catch (error) {
          console.error('Error marking call as missed:', error);
        } finally {
          // Clean up timeout reference
          socket.data.callRequestTimeouts?.delete(callRequestId);
        }
      }, 60000); // 60 seconds timeout
      
      // Store timeout reference
      socket.data.callRequestTimeouts.set(callRequestId, missedCallTimeout);
    } catch (error) {
      console.error('❌ [SERVER] Error creating call request:', error);
      // Continue even if database call fails
    }
    
    // Prepare call data (include channelName if provided by caller)
    const callData = {
      callerId: callerId,
      callType: data.callType, // 'video' or 'voice'
      channelName: data.channelName, // Pass channel name to receiver (CRITICAL for same channel)
      callRequestId: callRequestId, // Include call request ID for status updates
    };
    
    // Emit incoming-call event to receiver's room
    console.log(`📤 [SERVER] Emitting incoming-call to room: ${roomName}`);
    io.to(roomName).emit('incoming-call', callData);
    console.log(`✅ [SERVER] Incoming-call event emitted to room: ${roomName}`);
    
    // Fallback: If no sockets in room, try to find receiver's socket directly
    if (socketsInRoom.length === 0) {
      console.warn(`⚠️ [SERVER] No sockets found in room ${roomName}. Trying to find receiver's socket directly...`);
      
      // Find all connected sockets and check if any belong to the receiver
      const allSockets = await io.fetchSockets();
      console.log(`🔍 [SERVER] Total connected sockets: ${allSockets.length}`);
      let foundReceiver = false;
      
      for (const s of allSockets) {
        const socketUserId = socketUserMap.get(s.id);
        console.log(`🔍 [SERVER] Checking socket ${s.id} (User: ${socketUserId || 'unknown'})`);
        if (socketUserId === receiverId) {
          console.log(`✅ [SERVER] Found receiver's socket directly: ${s.id}`);
          s.emit('incoming-call', callData);
          foundReceiver = true;
          break;
        }
      }
      
      if (!foundReceiver) {
        console.error(`❌ [SERVER] Receiver ${receiverId} is not connected. Call notification will not be delivered.`);
        console.error(`❌ [SERVER] Available users in socketUserMap:`, Array.from(socketUserMap.values()));
      }
    } else {
      // Log all sockets in the room
      socketsInRoom.forEach(s => {
        const socketUserId = socketUserMap.get(s.id);
        console.log(`✅ [SERVER] Socket ${s.id} in room (User: ${socketUserId || 'unknown'})`);
      });
    }
    
    // Emit contact-update events to refresh contacts and call requests sections
    // Update receiver's contacts (they received a call)
    io.to(roomName).emit('contact-update', {
      userId: callerId,
      callType: data.callType,
      action: 'call_requested',
    });
    
    // Update caller's contacts (they initiated a call)
    const callerRoomName = `user-${callerId}`;
    io.to(callerRoomName).emit('contact-update', {
      userId: receiverId,
      callType: data.callType,
      action: 'call_requested',
    });
    
    // Emit call-request-update to refresh call request section
    io.to(roomName).emit('call-request-update', {
      callRequestId: callRequestId,
      status: 'pending',
      callType: data.callType,
      callerId: callerId,
    });
    
    console.log(`✅ Contact-update and call-request-update events emitted for call request`);
  });

  socket.on('call-accept', async (data) => {
    // Ensure callerId is converted to string for consistent room naming
    const callerId = String(data.callerId);
    const receiverId = String(data.receiverId);
    const roomName = `user-${callerId}`;
    console.log(`✅ Call accepted, notifying caller in room: ${roomName}`);
    io.to(roomName).emit('call-accepted', {
      receiverId: receiverId,
    });
    
    // Update call request status to 'accepted' in database
    try {
      const callRequest = await CallRequest.findOne({
        where: {
          callerId: callerId,
          receiverId: receiverId,
          status: 'pending',
        },
        order: [['created_at', 'DESC']],
      });
      
      if (callRequest) {
        await callRequest.update({
          status: 'accepted',
          answeredAt: new Date(),
        });
        console.log(`✅ [SERVER] Call request ${callRequest.id} marked as accepted`);
        
        // Clear missed call timeout if it exists
        const callerSocket = Array.from(io.sockets.sockets.values()).find(
          s => socketUserMap.get(s.id) === callerId
        );
        if (callerSocket?.data?.callRequestTimeouts) {
          const timeout = callerSocket.data.callRequestTimeouts.get(callRequest.id);
          if (timeout) {
            clearTimeout(timeout);
            callerSocket.data.callRequestTimeouts.delete(callRequest.id);
            console.log(`✅ [SERVER] Cleared missed call timeout for call request ${callRequest.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error updating call request status:', error);
    }
    
    // Emit contact-update events to refresh contacts and call requests sections
    // Update caller's contacts
    io.to(roomName).emit('contact-update', {
      userId: receiverId,
      action: 'call_accepted',
    });
    
    // Update receiver's contacts
    const receiverRoomName = `user-${receiverId}`;
    io.to(receiverRoomName).emit('contact-update', {
      userId: callerId,
      action: 'call_accepted',
    });
    
    // Emit call-request-update to refresh call request section
    io.to(roomName).emit('call-request-update', {
      status: 'accepted',
    });
    io.to(receiverRoomName).emit('call-request-update', {
      status: 'accepted',
    });
    
    console.log(`✅ Contact-update and call-request-update events emitted for call accepted`);
  });

  socket.on('call-reject', async (data) => {
    // Ensure callerId is converted to string for consistent room naming
    const callerId = String(data.callerId);
    const receiverId = String(data.receiverId);
    const roomName = `user-${callerId}`;
    console.log(`❌ Call rejected, notifying caller in room: ${roomName}`);
    io.to(roomName).emit('call-rejected', {
      receiverId: receiverId,
    });
    
    // Update call request status to 'missed' in database (receiver didn't answer)
    try {
      const callRequest = await CallRequest.findOne({
        where: {
          callerId: callerId,
          receiverId: receiverId,
          status: 'pending',
        },
        order: [['created_at', 'DESC']],
      });
      
      if (callRequest) {
        await callRequest.update({
          status: 'missed', // Mark as missed instead of rejected for call history
        });
        console.log(`✅ [SERVER] Call request ${callRequest.id} marked as missed (rejected by receiver)`);
        
        // Clear missed call timeout if it exists
        const callerSocket = Array.from(io.sockets.sockets.values()).find(
          s => socketUserMap.get(s.id) === callerId
        );
        if (callerSocket?.data?.callRequestTimeouts) {
          const timeout = callerSocket.data.callRequestTimeouts.get(callRequest.id);
          if (timeout) {
            clearTimeout(timeout);
            callerSocket.data.callRequestTimeouts.delete(callRequest.id);
            console.log(`✅ [SERVER] Cleared missed call timeout for call request ${callRequest.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error updating call request status:', error);
    }
    
    // Emit contact-update events to refresh contacts and call requests sections
    // Update caller's contacts (call was rejected/not answered)
    io.to(roomName).emit('contact-update', {
      userId: receiverId,
      action: 'call_rejected',
    });
    
    // Update receiver's contacts (they rejected/not answered the call)
    const receiverRoomName = `user-${receiverId}`;
    io.to(receiverRoomName).emit('contact-update', {
      userId: callerId,
      action: 'call_rejected',
    });
    
    // Emit call-request-update to refresh call request section
    io.to(roomName).emit('call-request-update', {
      status: 'rejected',
    });
    io.to(receiverRoomName).emit('call-request-update', {
      status: 'rejected',
    });
    
    console.log(`✅ Contact-update and call-request-update events emitted for call rejected/not answered`);
  });

  socket.on('call-cancel', async (data) => {
    // Handle when caller cancels the call before receiver accepts
    const callerId = String(data.callerId);
    const receiverId = String(data.receiverId);
    const receiverRoomName = `user-${receiverId}`;
    
    console.log(`❌ [SERVER] Call canceled by caller ${callerId}, notifying receiver ${receiverId}`);
    
    // Notify receiver that call was canceled
    io.to(receiverRoomName).emit('call-cancelled', {
      callerId: callerId,
    });
    
    // Update call request status to 'missed' (caller canceled - receiver never answered)
    try {
      const callRequest = await CallRequest.findOne({
        where: {
          callerId: callerId,
          receiverId: receiverId,
          status: 'pending',
        },
        order: [['created_at', 'DESC']],
      });
      
      if (callRequest) {
        await callRequest.update({
          status: 'missed', // Mark as missed for call history (caller canceled before receiver answered)
        });
        console.log(`✅ [SERVER] Call request ${callRequest.id} marked as missed (caller canceled)`);
        
        // Clear missed call timeout if it exists
        const callerSocket = Array.from(io.sockets.sockets.values()).find(
          s => socketUserMap.get(s.id) === callerId
        );
        if (callerSocket?.data?.callRequestTimeouts) {
          const timeout = callerSocket.data.callRequestTimeouts.get(callRequest.id);
          if (timeout) {
            clearTimeout(timeout);
            callerSocket.data.callRequestTimeouts.delete(callRequest.id);
            console.log(`✅ [SERVER] Cleared missed call timeout for call request ${callRequest.id}`);
          }
        }
      }
    } catch (error) {
      console.error('Error updating call request status:', error);
    }
    
    // Emit contact-update events
    const callerRoomName = `user-${callerId}`;
    io.to(callerRoomName).emit('contact-update', {
      userId: receiverId,
      action: 'call_cancelled',
    });
    
    io.to(receiverRoomName).emit('contact-update', {
      userId: callerId,
      action: 'call_cancelled',
    });
    
    // Emit call-request-update to refresh call request section
    io.to(callerRoomName).emit('call-request-update', {
      status: 'cancelled',
    });
    io.to(receiverRoomName).emit('call-request-update', {
      status: 'cancelled',
    });
    
    console.log(`✅ Contact-update and call-request-update events emitted for call canceled`);
  });

  socket.on('call-end', async (data) => {
    // Ensure otherUserId is converted to string for consistent room naming
    const otherUserId = String(data.otherUserId);
    const userId = String(data.userId);
    const roomName = `user-${otherUserId}`;
    console.log(`📴 [SERVER] Call ended, notifying other user in room: ${roomName}`);
    io.to(roomName).emit('call-ended', {
      userId: userId,
    });
    
    // Update call request status to 'completed' if it was accepted
    try {
      // Try to find the most recent accepted call request between these two users
      const callRequest = await CallRequest.findOne({
        where: {
          [Op.or]: [
            { callerId: userId, receiverId: otherUserId },
            { callerId: otherUserId, receiverId: userId },
          ],
          status: 'accepted',
        },
        order: [['created_at', 'DESC']],
      });
      
      if (callRequest) {
        // Calculate duration
        const answeredAt = callRequest.answeredAt ? new Date(callRequest.answeredAt) : new Date(callRequest.createdAt);
        const duration = data.duration || Math.max(0, Math.floor((new Date() - answeredAt) / 1000));
        
        await callRequest.update({
          status: 'completed',
          endedAt: new Date(),
          duration: duration,
        });
        console.log(`✅ [SERVER] Call request ${callRequest.id} marked as completed (duration: ${duration}s)`);

        // Apply credit charge for completed call (configured via CRM)
        try {
          const settings = await getCreditSettings();
          const perMinute =
            callRequest.callType === 'video'
              ? settings.videoCallPerMinute || 0
              : settings.voiceCallPerMinute || 0;

          if (perMinute > 0) {
            // Bill from the very first second: each started minute is charged
            const billableMinutes = Math.max(1, Math.ceil(duration / 60));
            const totalCost = perMinute * billableMinutes;

            const caller = await User.findByPk(callRequest.callerId, {
              attributes: ['id', 'credits'],
            });

            if (caller) {
              const currentCredits = caller.credits || 0;
              if (currentCredits >= totalCost) {
                await caller.decrement('credits', { by: totalCost });
                await CreditTransaction.create({
                  userId: caller.id,
                  type: 'usage',
                  amount: -totalCost,
                  description: `${callRequest.callType === 'video' ? 'Video' : 'Voice'} call (${billableMinutes} min)`,
                  relatedTo: 'call',
                  relatedId: callRequest.id,
                });
                await updateUserSpendAndVip(caller.id, totalCost);
                console.log(
                  `💳 [SERVER] Deducted ${totalCost} credits from caller ${caller.id} for ${callRequest.callType} call (${billableMinutes} min)`
                );
              } else {
                console.warn(
                  `⚠️ [SERVER] Caller ${caller.id} has insufficient credits (${currentCredits}) for call cost ${totalCost} – skipping deduction`
                );
              }
            }
          }
        } catch (creditError) {
          console.error('❌ [SERVER] Error applying call credit deduction:', creditError);
        }
      } else {
        // If no accepted call found, try to find pending call and mark as missed
        const pendingCall = await CallRequest.findOne({
          where: {
            [Op.or]: [
              { callerId: userId, receiverId: otherUserId },
              { callerId: otherUserId, receiverId: userId },
            ],
            status: 'pending',
          },
          order: [['created_at', 'DESC']],
        });
        
        if (pendingCall) {
          await pendingCall.update({
            status: 'missed',
          });
          console.log(`✅ [SERVER] Pending call request ${pendingCall.id} marked as missed (call ended before acceptance)`);
        }
      }
    } catch (error) {
      console.error('❌ [SERVER] Error updating call request status on call-end:', error);
    }
    
    // Emit contact-update events to refresh contacts and call requests sections
    // Update other user's contacts
    io.to(roomName).emit('contact-update', {
      userId: userId,
      action: 'call_ended',
    });
    
    // Update current user's contacts
    const userRoomName = `user-${userId}`;
    io.to(userRoomName).emit('contact-update', {
      userId: otherUserId,
      action: 'call_ended',
    });
    
    // Emit call-request-update to refresh call request section
    io.to(roomName).emit('call-request-update', {
      status: 'completed',
    });
    io.to(userRoomName).emit('call-request-update', {
      status: 'completed',
    });
    
    console.log(`✅ Contact-update and call-request-update events emitted for call ended`);
  });

  socket.on('disconnect', () => {
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      console.log(`👋 User ${userId} disconnected (socket: ${socket.id})`);
      socketUserMap.delete(socket.id);
      // Set offline + last_seen (role-based: backend controls online status)
      Profile.update(
        { isOnline: false, lastSeen: new Date() },
        { where: { userId } }
      ).catch((err) => console.error('Disconnect: update profile offline error', err.message));
    } else {
      console.log('👋 User disconnected:', socket.id);
    }
  });
});

// Start server after database connection
const startServer = async () => {
  try {
    // Connect to database and sync models
    await connectDB();
    
    // Start daily digest scheduler
    try {
      const { startDailyDigestScheduler } = await import('./utils/dailyDigestScheduler.js');
      startDailyDigestScheduler();
    } catch (error) {
      console.warn('⚠️ Could not start daily digest scheduler:', error.message);
    }

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

