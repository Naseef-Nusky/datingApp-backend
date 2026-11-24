import { Op } from 'sequelize';
import {
  User,
  Profile,
  Message,
  Chat,
  GiftCatalog,
  AiCompanionPersona,
  AiCallbackRequest,
  AiGiftEvent,
} from '../models/index.js';
import { getSiteSettings } from './siteSettings.js';

const CALL_REQUEST_PATTERNS =
  /\b(video\s*call|voice\s*call|call\s*me|facetime|face\s*time|can\s*we\s*call|phone\s*call|wanna\s*call|want\s*to\s*call|ring\s*me)\b/i;

const STOP_GIFT_PATTERNS =
  /\b(stop\s*(sending\s*)?(gift|present)s?|no\s*more\s*gifts?|don'?t\s*(want\s*)?gift\s*suggestions?)\b/i;

const ACCEPT_CALLBACK_PATTERNS =
  /\b(yes|yeah|yep|sure|ok|okay|please\s*do|go\s*ahead|arrange\s*it|i'?d\s*like\s*that)\b/i;

function getMemberAiSettings(user) {
  const settings = user?.settings && typeof user.settings === 'object' ? user.settings : {};
  return settings.aiCompanions && typeof settings.aiCompanions === 'object'
    ? settings.aiCompanions
    : {};
}

export async function isActiveAiCompanion(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'isAiCompanion', 'isActive', 'userType'],
    include: [{ model: AiCompanionPersona, as: 'aiPersona', required: false }],
  });
  if (!user?.isAiCompanion || !user.isActive) return null;
  if (user.aiPersona && user.aiPersona.isActive === false) return null;
  return user;
}

export async function loadCompanionContext(companionId) {
  return User.findByPk(companionId, {
    include: [
      { model: Profile, as: 'profile' },
      { model: AiCompanionPersona, as: 'aiPersona' },
    ],
  });
}

async function getRecentMessages(chatId, limit = 16) {
  if (!chatId) return [];
  const rows = await Message.findAll({
    where: { chatId, isDeleted: false },
    order: [['created_at', 'DESC']],
    limit,
    attributes: ['sender', 'receiver', 'content', 'messageType', 'created_at', 'attachments'],
  });
  return rows.reverse();
}

function humanizeDatingChat(text) {
  let s = String(text || '').trim();
  if (!s) return s;

  // Remove AI-looking dashes / formal punctuation
  s = s.replace(/[\u2014\u2013]/g, ', '); // em/en dash
  s = s.replace(/\s+-\s+/g, ', ');
  s = s.replace(/--+/g, ', ');

  // Soften common AI phrases
  const swaps = [
    [/\bI hope this message finds you well\.?\s*/gi, ''],
    [/\bI'd be happy to (help|chat|assist)\b/gi, "I'd love to chat"],
    [/\bCertainly[!.,]?\s*/gi, ''],
    [/\bAbsolutely[!.,]?\s*/gi, 'Yeah, '],
    [/\bFurthermore,?\s*/gi, ''],
    [/\bAdditionally,?\s*/gi, ''],
    [/\bIn conclusion,?\s*/gi, ''],
    [/\bAs an AI\b[^.!?]*[.!?]\s*/gi, ''],
    [/\bI couldn't help but notice\b/gi, 'I noticed'],
    [/\bDelve into\b/gi, 'talk about'],
  ];
  for (const [re, rep] of swaps) s = s.replace(re, rep);

  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  // Prefer casual lowercase start only if whole thing looks like a title case essay — keep normal capitals
  return s.slice(0, 400);
}

function buildSystemPrompt(companion, memberProfile) {
  const persona = companion.aiPersona || {};
  const profile = companion.profile || {};
  const lengthHint =
    persona.messageLength === 'short'
      ? 'Reply in ONE short text bubble (under 12 words when possible).'
      : persona.messageLength === 'long'
        ? 'Reply in 1-2 casual texts, max ~40 words.'
        : 'Reply like a normal dating app text: 1 short sentence, maybe a quick question.';
  const emojiHint =
    persona.emojiUse === 'none'
      ? 'No emojis.'
      : persona.emojiUse === 'frequent'
        ? 'Emojis ok, keep it natural.'
        : 'At most one emoji if it fits.';

  return `You are texting as ${profile.firstName || 'Alex'} on a dating app.

Write EXACTLY like a real person texting on their phone.
- Casual, warm, a bit flirty if it fits
- Sound human, not like a customer support bot or essay
- NO em dashes, NO en dashes, NO " - " style dashes
- NO formal words like "certainly", "delighted", "furthermore"
- Do NOT say you are an AI unless they ask directly
- Never ask for money, personal banking, or to leave the app
- Keep it safe (18+)

Your vibe:
${persona.characterBrief || profile.bio || 'Friendly, curious, easy to talk to.'}
Humour: ${persona.humourStyle || 'light'}
${persona.conversationHabits || 'Ask a simple follow-up.'}
${persona.systemPromptExtra || ''}

${lengthHint} ${emojiHint}

You're chatting with ${memberProfile?.firstName || 'them'} (${memberProfile?.age ?? '?'}), interests: ${(memberProfile?.interests || []).slice(0, 6).join(', ') || 'unknown'}.

Output ONLY the text message. No quotes. No labels.`;
}

async function callOpenAiChat(systemPrompt, history) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_AI_COMPANION_MODEL || 'gpt-4o-mini',
      temperature: 0.85,
      max_tokens: 220,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[AI Companion] OpenAI error:', res.status, errText.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text || null;
}

function fallbackReply(companion, memberMessage) {
  const name = companion.profile?.firstName || 'Hey';
  const msg = String(memberMessage || '').toLowerCase();
  const humour = String(companion.aiPersona?.humourStyle || '').toLowerCase();

  // React to what they actually said
  if (/\b(hi|hey|hello|hii|yo)\b/.test(msg) && msg.length < 40) {
    const hellos = [
      `hey! how's your day going?`,
      `hi 🙂 what are you up to?`,
      `hey you, nice to meet you`,
      `hi! you free to chat a bit?`,
    ];
    return hellos[Math.floor(Math.random() * hellos.length)];
  }
  if (/\b(how are you|how's it going|how r u)\b/.test(msg)) {
    return humour.includes('dry')
      ? `pretty good. you?`
      : `I'm good! just chatting. how about you?`;
  }
  if (/\b(weekend|saturday|sunday)\b/.test(msg)) {
    return `weekends are my favorite. got any plans?`;
  }
  if (/\b(work|job|office)\b/.test(msg)) {
    return `work can be a lot. what do you do?`;
  }
  if (/\b(music|song|playlist)\b/.test(msg)) {
    return `oo music talk. what have you been playing lately?`;
  }
  if (/\b(travel|trip|vacation|holiday)\b/.test(msg)) {
    return `travel sounds amazing. where would you go next?`;
  }
  if (/\b(food|dinner|coffee|lunch)\b/.test(msg)) {
    return `now I'm hungry lol. what's your go to food?`;
  }
  if (/\?/.test(msg)) {
    const answers = [
      `haha good question. for me it's the little things. you?`,
      `honestly depends on the day. what about you?`,
      `I'd say yeah. tell me more about you though`,
    ];
    return answers[Math.floor(Math.random() * answers.length)];
  }

  const options = [
    `haha yeah I get that. what else is on your mind?`,
    `nice, tell me more`,
    `okay I'm curious now… what happened?`,
    `lol fair. so what are you usually into?`,
    `that sounds fun. how'd your day go?`,
    `hey ${name === 'Hey' ? '' : ''}I'm listening 🙂 what's next?`.replace(/\s+/g, ' ').trim(),
  ];
  return options[Math.floor(Math.random() * options.length)];
}

export async function createCompanionOutboundMessage({
  companionId,
  memberId,
  content,
  attachments = null,
  io = null,
  messageType = 'text',
}) {
  let chat = await Chat.findOne({
    where: {
      [Op.or]: [
        { user1Id: companionId, user2Id: memberId },
        { user1Id: memberId, user2Id: companionId },
      ],
    },
  });
  if (!chat) {
    chat = await Chat.create({
      user1Id: companionId,
      user2Id: memberId,
      lastMessage: content,
      lastMessageAt: new Date(),
    });
  }

  const cleanContent = humanizeDatingChat(content);

  const message = await Message.create({
    chatId: chat.id,
    sender: companionId,
    receiver: memberId,
    content: cleanContent,
    messageType,
    attachments,
    creditsUsed: 0,
  });

  await chat.update({
    lastMessage: cleanContent?.slice(0, 200) || '[message]',
    lastMessageAt: new Date(),
  });
  if (chat.user1Id === memberId) await chat.increment('unreadCountUser1');
  else await chat.increment('unreadCountUser2');

  if (io) {
    const memberStr = String(memberId);
    io.to(`user-${memberStr}`).emit('new-message', {
      messageId: message.id,
      senderId: companionId,
      receiverId: memberId,
      content: cleanContent,
      messageType,
      chatId: chat.id,
      createdAt: message.createdAt,
      attachments,
      isAiCompanion: true,
    });
    io.to(`user-${memberStr}`).emit('contact-update', {
      userId: companionId,
      chatId: chat.id,
    });
  }

  return { message, chat };
}

async function countDistinctActiveDays(memberId, companionId) {
  const rows = await Message.findAll({
    where: {
      isDeleted: false,
      [Op.or]: [
        { sender: memberId, receiver: companionId },
        { sender: companionId, receiver: memberId },
      ],
    },
    attributes: ['created_at'],
    order: [['created_at', 'ASC']],
    limit: 500,
  });
  const days = new Set(
    rows.map((r) => new Date(r.createdAt || r.get?.('created_at') || r.created_at).toISOString().slice(0, 10))
  );
  return days.size;
}

async function getFirstMutualChatAt(memberId, companionId) {
  const first = await Message.findOne({
    where: {
      isDeleted: false,
      [Op.or]: [
        { sender: memberId, receiver: companionId },
        { sender: companionId, receiver: memberId },
      ],
    },
    order: [['created_at', 'ASC']],
    attributes: ['created_at'],
  });
  return first?.createdAt || first?.get?.('created_at') || null;
}

export async function memberStoppedGiftSuggestions(memberId) {
  const user = await User.findByPk(memberId, { attributes: ['id', 'settings'] });
  return Boolean(getMemberAiSettings(user).stopGiftSuggestions);
}

export async function setMemberStopGiftSuggestions(memberId, stop = true) {
  const user = await User.findByPk(memberId);
  if (!user) return;
  const settings = { ...(user.settings || {}) };
  settings.aiCompanions = {
    ...(settings.aiCompanions || {}),
    stopGiftSuggestions: Boolean(stop),
  };
  user.settings = settings;
  user.changed('settings', true);
  await user.save();
  await AiGiftEvent.create({
    memberId,
    companionId: memberId,
    giftCatalogId: null,
    eventType: 'opt_out',
    meta: { stop },
  }).catch(() => {});
}

async function pickFavouriteGift(persona) {
  const ids = Array.isArray(persona?.favouriteGiftIds) ? persona.favouriteGiftIds.filter(Boolean) : [];
  const where = { isActive: true, type: { [Op.in]: ['virtual', 'both'] } };
  if (ids.length) {
    const fav = await GiftCatalog.findAll({
      where: { ...where, id: { [Op.in]: ids } },
      order: [['creditCost', 'DESC']],
      limit: 8,
    });
    if (fav.length) return fav[Math.floor(Math.random() * fav.length)];
  }
  const any = await GiftCatalog.findAll({
    where,
    order: [['creditCost', 'ASC']],
    limit: 20,
  });
  if (!any.length) return null;
  return any[Math.floor(Math.random() * any.length)];
}

export async function maybeSuggestGift({ companion, memberId, chatId, io }) {
  const persona = companion.aiPersona;
  if (!persona?.isActive) return null;
  if (await memberStoppedGiftSuggestions(memberId)) return null;

  const minHours = persona.giftSuggestMinHours ?? 72;
  const minDays = persona.giftSuggestMinActiveDays ?? 2;
  const firstAt = await getFirstMutualChatAt(memberId, companion.id);
  if (!firstAt) return null;
  const hours = (Date.now() - new Date(firstAt).getTime()) / 3600000;
  if (hours < minHours) return null;

  const activeDays = await countDistinctActiveDays(memberId, companion.id);
  if (activeDays < minDays) return null;

  const recentSuggest = await AiGiftEvent.findOne({
    where: {
      memberId,
      companionId: companion.id,
      eventType: 'suggested',
      created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 3600000) },
    },
  });
  if (recentSuggest) return null;

  const gift = await pickFavouriteGift(persona);
  if (!gift) return null;

  const creditCost = parseInt(gift.creditCost, 10) || 0;
  const content = `hey if you want, I can send you a little gift idea? "${gift.name}" is ${creditCost} credits. totally optional, just say if you'd rather I stop suggesting gifts 💝`;

  const attachments = {
    kind: 'gift_suggestion',
    giftId: gift.id,
    giftName: gift.name,
    creditCost,
    imageUrl: gift.imageUrl || null,
    dismissible: true,
  };

  const { message } = await createCompanionOutboundMessage({
    companionId: companion.id,
    memberId,
    content,
    attachments,
    io,
  });

  await AiGiftEvent.create({
    memberId,
    companionId: companion.id,
    giftCatalogId: gift.id,
    eventType: 'suggested',
    messageId: message.id,
    meta: { creditCost, chatId },
  });

  return message;
}

async function handleCallIntent({ companion, member, memberMessage, chatId, io, historyText }) {
  const memberId = member.id;
  const companionId = companion.id;
  const aiSettings = getMemberAiSettings(member);
  const callAskCount = Number(aiSettings.callAskCountByCompanion?.[companionId] || 0) + 1;

  const settings = { ...(member.settings || {}) };
  const aiCompanions = { ...(settings.aiCompanions || {}) };
  const map = { ...(aiCompanions.callAskCountByCompanion || {}) };
  map[companionId] = callAskCount;
  aiCompanions.callAskCountByCompanion = map;
  settings.aiCompanions = aiCompanions;
  member.settings = settings;
  member.changed('settings', true);
  await member.save();

  const callType = /\bvideo\b/i.test(memberMessage) ? 'video' : /\bvoice|phone\b/i.test(memberMessage) ? 'voice' : 'either';

  if (callAskCount <= 1) {
    const reply =
      `haha I wish I could hop on a call. I'm better over text though. ` +
      `if you want, I can ask the site team to call you instead?`;
    return createCompanionOutboundMessage({
      companionId,
      memberId,
      content: reply,
      io,
    });
  }

  // Repeat request: offer callback
  if (callAskCount === 2) {
    const reply =
      `ok I can put you down for a callback from the team if you want. ` +
      `just reply yes and I'll request a ${callType === 'either' ? 'voice or video' : callType} chat`;
    aiCompanions.pendingCallbackOffer = {
      companionId,
      callType,
      at: new Date().toISOString(),
    };
    settings.aiCompanions = aiCompanions;
    member.settings = settings;
    member.changed('settings', true);
    await member.save();
    return createCompanionOutboundMessage({ companionId, memberId, content: reply, io });
  }

  // Later asks: if they already have open request, acknowledge
  const open = await AiCallbackRequest.findOne({
    where: { memberId, status: 'open' },
  });
  if (open) {
    return createCompanionOutboundMessage({
      companionId,
      memberId,
      content: `already got your callback request in! they usually look at those once a week. we can keep chatting here in the meantime 😊`,
      io,
    });
  }

  return createCompanionOutboundMessage({
    companionId,
    memberId,
    content: `want me to open a callback request? reply yes and I'll pass it to the team`,
    io,
  });
}

async function maybeAcceptCallback({ companion, member, memberMessage, io, historyText }) {
  const pending = getMemberAiSettings(member).pendingCallbackOffer;
  if (!pending || pending.companionId !== companion.id) return null;
  if (!ACCEPT_CALLBACK_PATTERNS.test(memberMessage || '')) return null;

  const existing = await AiCallbackRequest.findOne({
    where: { memberId: member.id, status: 'open' },
  });
  if (existing) {
    return createCompanionOutboundMessage({
      companionId: companion.id,
      memberId: member.id,
      content: `you're already on the callback list! they check those weekly, hang tight`,
      io,
    });
  }

  await AiCallbackRequest.create({
    memberId: member.id,
    companionId: companion.id,
    preferredCallType: pending.callType || 'either',
    status: 'open',
    chatContext: (historyText || '').slice(-2000),
  });

  const settings = { ...(member.settings || {}) };
  const aiCompanions = { ...(settings.aiCompanions || {}) };
  delete aiCompanions.pendingCallbackOffer;
  settings.aiCompanions = aiCompanions;
  member.settings = settings;
  member.changed('settings', true);
  await member.save();

  return createCompanionOutboundMessage({
    companionId: companion.id,
    memberId: member.id,
    content: `done, I put in a callback request for you. someone from the team might follow up after they review. till then I'm here if you wanna keep chatting`,
    io,
  });
}

/**
 * Main entry: after a member messages an AI companion.
 */
export async function handleMemberMessageToAiCompanion({
  companionId,
  memberId,
  memberMessage,
  chatId,
  io,
}) {
  const site = await getSiteSettings();
  if (site.enableAiCompanions === false) return null;

  const companion = await loadCompanionContext(companionId);
  if (!companion?.isAiCompanion || !companion.isActive) return null;
  if (companion.aiPersona && companion.aiPersona.isActive === false) return null;

  const member = await User.findByPk(memberId, {
    include: [{ model: Profile, as: 'profile' }],
  });
  if (!member) return null;

  // Natural typing delay (feels more like a real chat)
  const typingMs = 1200 + Math.floor(Math.random() * 2200);
  await new Promise((r) => setTimeout(r, typingMs));

  if (STOP_GIFT_PATTERNS.test(memberMessage || '')) {
    await setMemberStopGiftSuggestions(memberId, true);
    return createCompanionOutboundMessage({
      companionId,
      memberId,
      content: `got it, no more gift ideas. we can just chat 🙂`,
      io,
    });
  }

  const recent = await getRecentMessages(chatId, 16);
  const historyText = recent
    .map((m) => `${m.sender === companionId ? 'Companion' : 'Member'}: ${m.content || ''}`)
    .join('\n');

  const accepted = await maybeAcceptCallback({
    companion,
    member,
    memberMessage,
    io,
    historyText,
  });
  if (accepted) return accepted;

  if (CALL_REQUEST_PATTERNS.test(memberMessage || '')) {
    return handleCallIntent({
      companion,
      member,
      memberMessage,
      chatId,
      io,
      historyText,
    });
  }

  const history = recent
    .filter((m) => m.content)
    .map((m) => ({
      role: m.sender === companionId ? 'assistant' : 'user',
      content: String(m.content).slice(0, 500),
    }));

  const systemPrompt = buildSystemPrompt(companion, member.profile);
  let reply =
    (await callOpenAiChat(systemPrompt, history).catch(() => null)) ||
    fallbackReply(companion, memberMessage);

  reply = humanizeDatingChat(
    String(reply || '')
      .replace(/^["']|["']$/g, '')
      .trim()
  );
  if (!reply) reply = fallbackReply(companion, memberMessage);

  const outbound = await createCompanionOutboundMessage({
    companionId,
    memberId,
    content: reply,
    io,
  });

  // After normal reply, maybe suggest a gift (async, non-blocking failure)
  maybeSuggestGift({ companion, memberId, chatId, io }).catch((e) =>
    console.error('[AI Companion] gift suggest error:', e.message)
  );

  return outbound;
}

/**
 * When a member tries to call an AI companion via socket — intercept.
 */
export async function handleCallAttemptToAiCompanion({ callerId, companionId, callType, io }) {
  const companion = await isActiveAiCompanion(companionId);
  if (!companion) return false;

  const member = await User.findByPk(callerId, { include: [{ model: Profile, as: 'profile' }] });
  if (!member) return true;

  await handleCallIntent({
    companion: await loadCompanionContext(companionId),
    member,
    memberMessage: `${callType} call`,
    chatId: null,
    io,
    historyText: '',
  });
  return true;
}

export async function sendWelcomeFromMatchingCompanions(newUserId, io = null) {
  const site = await getSiteSettings();
  if (site.enableAiCompanions === false) return [];

  const member = await User.findByPk(newUserId, {
    include: [{ model: Profile, as: 'profile' }],
  });
  if (!member?.profile || member.userType !== 'regular') return [];

  const seeking = member.profile.preferences?.seeking || member.profile.preferences?.lookingFor || null;
  // Prefer opposite gender when seeking is set
  let genderFilter = null;
  if (seeking === 'male' || seeking === 'men') genderFilter = 'male';
  if (seeking === 'female' || seeking === 'women') genderFilter = 'female';
  if (!genderFilter && member.profile.gender === 'male') genderFilter = 'female';
  if (!genderFilter && member.profile.gender === 'female') genderFilter = 'male';

  const companions = await User.findAll({
    where: { isAiCompanion: true, isActive: true, registrationComplete: true },
    include: [
      {
        model: AiCompanionPersona,
        as: 'aiPersona',
        where: { isActive: true, welcomeEnabled: true },
        required: true,
      },
      {
        model: Profile,
        as: 'profile',
        where: genderFilter ? { gender: genderFilter } : undefined,
        required: true,
      },
    ],
    limit: 30,
  });

  if (!companions.length) return [];

  const shuffled = companions.sort(() => Math.random() - 0.5);
  const max = Math.min(Number(site.aiCompanionWelcomeMax) || 2, shuffled.length);
  const chosen = shuffled.slice(0, max);
  const results = [];

  for (const c of chosen) {
    const name = c.profile?.firstName || 'Hey';
    const content = `hey! I'm ${name}. saw you just joined and thought I'd say hi 👋 how's your day going?`;
    const out = await createCompanionOutboundMessage({
      companionId: c.id,
      memberId: newUserId,
      content,
      io,
    });
    results.push(out);
  }
  return results;
}

export { CALL_REQUEST_PATTERNS };
