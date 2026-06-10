import { sequelize, User } from '../models/index.js';
import { findRegularMemberByEmail, normalizeEmail } from '../utils/userEmailScope.js';
import Profile from '../models/Profile.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import ChatRequest from '../models/ChatRequest.js';
import CallRequest from '../models/CallRequest.js';
import Gift from '../models/Gift.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Notification from '../models/Notification.js';
import Report from '../models/Report.js';
import Block from '../models/Block.js';
import Match from '../models/Match.js';
import Story from '../models/Story.js';
import EngagementSession from '../models/EngagementSession.js';
import CrmEvent from '../models/CrmEvent.js';
import NewUserStreamerEmail from '../models/NewUserStreamerEmail.js';
import { Op } from 'sequelize';

const email = normalizeEmail(process.argv[2] || '');
if (!email) {
  console.error('Usage: node scripts/purge-member-by-email.js <email>');
  process.exit(1);
}

await sequelize.authenticate();
const user = await findRegularMemberByEmail(User, email);
if (!user) {
  console.log('No member account for:', email);
  process.exit(0);
}

const userId = user.id;
await sequelize.transaction(async (t) => {
  const opts = { transaction: t };
  const userChats = await Chat.findAll({
    where: { [Op.or]: [{ user1Id: userId }, { user2Id: userId }] },
    attributes: ['id'],
    ...opts,
  });
  const chatIds = userChats.map((c) => c.id);
  if (chatIds.length) {
    await Message.destroy({ where: { chatId: { [Op.in]: chatIds } }, ...opts });
  }
  await Message.destroy({
    where: { [Op.or]: [{ sender: userId }, { receiver: userId }] },
    ...opts,
  });
  await EngagementSession.destroy({
    where: { [Op.or]: [{ streamerId: userId }, { memberId: userId }] },
    ...opts,
  });
  await ChatRequest.destroy({
    where: { [Op.or]: [{ senderId: userId }, { receiverId: userId }] },
    ...opts,
  });
  await CallRequest.destroy({
    where: { [Op.or]: [{ callerId: userId }, { receiverId: userId }] },
    ...opts,
  });
  await Gift.destroy({
    where: { [Op.or]: [{ sender: userId }, { receiver: userId }] },
    ...opts,
  });
  await CreditTransaction.destroy({ where: { userId }, ...opts });
  await Notification.destroy({ where: { userId }, ...opts });
  await Report.update(
    { reviewedBy: null, reviewedAt: null },
    { where: { reviewedBy: userId }, ...opts }
  );
  await Report.destroy({
    where: { [Op.or]: [{ reporter: userId }, { reportedUser: userId }] },
    ...opts,
  });
  await Block.destroy({
    where: { [Op.or]: [{ blocker: userId }, { blocked: userId }] },
    ...opts,
  });
  await Match.destroy({
    where: { [Op.or]: [{ user1: userId }, { user2: userId }] },
    ...opts,
  });
  await Story.destroy({ where: { userId }, ...opts });
  await Chat.destroy({
    where: { [Op.or]: [{ user1Id: userId }, { user2Id: userId }] },
    ...opts,
  });
  await CrmEvent.destroy({ where: { userId }, ...opts });
  await NewUserStreamerEmail.destroy({
    where: { [Op.or]: [{ newUserId: userId }, { streamerUserId: userId }] },
    ...opts,
  });
  await Profile.destroy({ where: { userId }, ...opts });
  await user.destroy({ transaction: t });
});

console.log('Removed incomplete member account for:', email);
