import { sequelize } from '../config/database.js';
import User from './User.js';
import Profile from './Profile.js';
import Match from './Match.js';
import Chat from './Chat.js';
import Message from './Message.js';
import ChatRequest from './ChatRequest.js';
import Story from './Story.js';
import Gift from './Gift.js';
import GiftCatalog from './GiftCatalog.js';
import CreditTransaction from './CreditTransaction.js';
import Notification from './Notification.js';
import Report from './Report.js';
import Block from './Block.js';

// Define associations
User.hasOne(Profile, { foreignKey: 'userId', as: 'profile' });
Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Match associations
Match.belongsTo(User, { foreignKey: 'user1', as: 'user1Data' });
Match.belongsTo(User, { foreignKey: 'user2', as: 'user2Data' });

// Chat associations
Chat.belongsTo(User, { foreignKey: 'user1Id', as: 'user1Data' });
Chat.belongsTo(User, { foreignKey: 'user2Id', as: 'user2Data' });
Chat.hasMany(Message, { foreignKey: 'chatId', as: 'messages' });

// Message associations
Message.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });
Message.belongsTo(User, { foreignKey: 'sender', as: 'senderData' });
Message.belongsTo(User, { foreignKey: 'receiver', as: 'receiverData' });

// ChatRequest associations
ChatRequest.belongsTo(User, { foreignKey: 'senderId', as: 'senderData' });
ChatRequest.belongsTo(User, { foreignKey: 'receiverId', as: 'receiverData' });

// Story associations
Story.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Gift associations
Gift.belongsTo(User, { foreignKey: 'sender', as: 'senderData' });
Gift.belongsTo(User, { foreignKey: 'receiver', as: 'receiverData' });
Gift.belongsTo(GiftCatalog, { foreignKey: 'giftItem', as: 'giftItemData' });

// CreditTransaction associations
CreditTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Report associations
Report.belongsTo(User, { foreignKey: 'reporter', as: 'reporterData' });
Report.belongsTo(User, { foreignKey: 'reportedUser', as: 'reportedUserData' });

// Block associations
Block.belongsTo(User, { foreignKey: 'blocker', as: 'blockerData' });
Block.belongsTo(User, { foreignKey: 'blocked', as: 'blockedData' });

export {
  sequelize,
  User,
  Profile,
  Match,
  Chat,
  Message,
  ChatRequest,
  Story,
  Gift,
  GiftCatalog,
  CreditTransaction,
  Notification,
  Report,
  Block,
};



