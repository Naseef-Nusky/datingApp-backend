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
const uploadDirs = ['uploads', 'uploads/stories'];
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
app.use('/api/messages', messageRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/streamer', streamerRoutes);
app.use('/api/user', userStatusRoutes);
app.use('/api/agora', agoraRoutes);

// Socket.IO for real-time features (video/voice calls, live messaging)
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-room', (userId) => {
    const roomName = `user-${userId}`;
    socket.join(roomName);
    console.log(`📢 User ${userId} joined room: ${roomName}`);
  });

  socket.on('call-request', (data) => {
    console.log('📞 Call request received:', data);
    const roomName = `user-${data.receiverId}`;
    console.log(`📤 Sending incoming-call to room: ${roomName}`);
    
    io.to(roomName).emit('incoming-call', {
      callerId: data.callerId,
      callType: data.callType, // 'video' or 'voice'
    });
    
    console.log(`✅ Incoming-call event emitted to room: ${roomName}`);
  });

  socket.on('call-accept', (data) => {
    io.to(`user-${data.callerId}`).emit('call-accepted', {
      receiverId: data.receiverId,
    });
  });

  socket.on('call-reject', (data) => {
    io.to(`user-${data.callerId}`).emit('call-rejected', {
      receiverId: data.receiverId,
    });
  });

  socket.on('call-end', (data) => {
    io.to(`user-${data.otherUserId}`).emit('call-ended', {
      userId: data.userId,
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server after database connection
const startServer = async () => {
  try {
    // Connect to database and sync models
    await connectDB();
    
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

