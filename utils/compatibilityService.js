import { Profile } from '../models/index.js';

export function normalizeUserPair(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  return a < b ? [a, b] : [b, a];
}

export function buildProfileSnapshot(profile) {
  if (!profile) return null;
  const lifestyle = profile.lifestyle || {};
  const preferences = profile.preferences || {};
  const loc = profile.location || {};

  return {
    firstName: profile.firstName,
    age: profile.age,
    gender: profile.gender,
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    relationshipGoal:
      preferences.relationship ||
      preferences.lookingFor ||
      lifestyle.relationship ||
      preferences.relationshipGoal ||
      null,
    personality: lifestyle.personality || preferences.personality || [],
    communicationStyle: lifestyle.communicationStyle || preferences.communicationStyle || null,
    loveLanguage: lifestyle.loveLanguage || preferences.loveLanguage || null,
    pets: lifestyle.pets || lifestyle.pet || null,
    smoking: lifestyle.smoke || lifestyle.smoking || null,
    drinking: lifestyle.drink || lifestyle.drinking || null,
    religion: lifestyle.religion || null,
    career: lifestyle.career || lifestyle.education || lifestyle.job || null,
    bio: profile.bio || null,
    todayStatus: profile.todayStatus || null,
    zodiac: lifestyle.zodiac || null,
    location: [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || null,
  };
}

function overlapCount(a = [], b = []) {
  const setB = new Set((b || []).map((x) => String(x).toLowerCase()));
  return (a || []).filter((x) => setB.has(String(x).toLowerCase())).length;
}

/** Shared interest labels for emails (e.g. Travel, Hiking, Long-term). */
export function getSharedInterestLabels(viewer, other, max = 3) {
  const setB = new Set((other?.interests || []).map((x) => String(x).toLowerCase()));
  const labels = (viewer?.interests || [])
    .filter((x) => setB.has(String(x).toLowerCase()))
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (
    viewer?.relationshipGoal &&
    other?.relationshipGoal &&
    String(viewer.relationshipGoal).toLowerCase() === String(other.relationshipGoal).toLowerCase()
  ) {
    labels.push(String(viewer.relationshipGoal));
  }

  return [...new Set(labels)].slice(0, max);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value) return [String(value)];
  return [];
}

/** Fast score for browse cards when AI result is not cached yet. */
export function computeHeuristicCompatibility(viewer, other) {
  let score = 55;
  const reasons = [];

  const sharedInterests = overlapCount(viewer.interests, other.interests);
  if (sharedInterests > 0) {
    score += Math.min(25, sharedInterests * 8);
    reasons.push(`Shared interests (${sharedInterests})`);
  }

  if (
    viewer.relationshipGoal &&
    other.relationshipGoal &&
    String(viewer.relationshipGoal).toLowerCase() === String(other.relationshipGoal).toLowerCase()
  ) {
    score += 12;
    reasons.push('Similar relationship goals');
  }

  if (viewer.loveLanguage && other.loveLanguage && viewer.loveLanguage === other.loveLanguage) {
    score += 5;
    reasons.push('Same love language');
  }

  if (viewer.smoking && other.smoking && viewer.smoking === other.smoking) {
    score += 3;
  }
  if (viewer.drinking && other.drinking && viewer.drinking === other.drinking) {
    score += 3;
  }

  const ageDiff = Math.abs((viewer.age || 0) - (other.age || 0));
  if (ageDiff <= 3) score += 5;
  else if (ageDiff > 12) score -= 8;

  score = Math.max(40, Math.min(96, Math.round(score)));

  const summary =
    reasons.length > 0
      ? `You may connect well — ${reasons.slice(0, 2).join('; ')}.`
      : 'Profiles show potential for a meaningful connection.';

  return {
    score,
    summary,
    strengths: reasons.length ? reasons.map((r) => r) : ['Complementary profiles to explore'],
    challenges: ageDiff > 10 ? ['Different life stages may need extra communication'] : [],
    icebreakers: buildDefaultIcebreakers(other),
    source: 'heuristic',
  };
}

function buildDefaultIcebreakers(other) {
  const name = other.firstName ? other.firstName : 'there';
  const interest = (other.interests || [])[0];
  if (interest) {
    return sanitizeIcebreakers([
      `Hey ${name}! Saw you're into ${interest}. What's the best part about it for you?`,
      `Your profile caught my eye. What kind of dates do you actually enjoy?`,
      `If we got coffee this week what would you want to talk about first?`,
    ]);
  }
  return sanitizeIcebreakers([
    `Hey! Your profile stood out. What are you hoping to find on here?`,
    `I'd love to get to know you. What's your idea of a good first date?`,
    `Quick one. Are you more long chat first or meet up soon?`,
  ]);
}

const HEURISTIC_ICEBREAKER_POOL = [
  (other) => {
    const interest = (other.interests || [])[0];
    const name = other.firstName || 'there';
    return interest
      ? `Hey ${name}! Saw you're into ${interest}. What do you love most about it?`
      : null;
  },
  (other) => {
    const interest = (other.interests || [])[1];
    return interest ? `Your ${interest} thing caught my eye. How did you get into it?` : null;
  },
  (other) => {
    const goal = other.relationshipGoal;
    return goal
      ? `Curious what ${goal} means for you on here?`
      : null;
  },
  (other) =>
    other.bio
      ? `Hey! Something in your bio stood out. Tell me a bit more about you?`
      : null,
  (other) => {
    const city = other.location?.split(',')[0]?.trim();
    return city ? `You in ${city}? What's a good date spot there?` : null;
  },
  (other) => {
    const name = other.firstName || 'you';
    return `Hi ${name}! What made you swipe on someone recently?`;
  },
  () => `Coffee date or drinks. Which is more your vibe?`,
  () => `How do you usually break the ice when you match with someone?`,
  () => `If we hit it off what would a first meet up look like for you?`,
  () => `Be honest. Serious, casual or still figuring it out?`,
  () => `You seem fun. Best date you've had lately?`,
  () => `Had to say hi. What's one thing you want in a connection here?`,
  () => `Texts first or voice notes?`,
  () => `What matters most to you when you're getting to know someone?`,
  () => `Would you plan the first date or keep it spontaneous?`,
];

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Make AI/heuristic openers sound like real phone texts — no dashes or polished AI phrasing. */
function humanizeChatMessage(text) {
  if (!text) return '';
  let s = String(text).trim();

  s = s.replace(/^["'`]+|["'`]+$/g, '');
  s = s.replace(/^[-•*]\s*/, '');

  s = s.replace(/\s*—\s*/g, '. ');
  s = s.replace(/\s*–\s*/g, '. ');
  s = s.replace(/\s+-\s+/g, '. ');

  const aiTells = [
    [/\bI couldn't help but notice\b/gi, 'I saw'],
    [/\bI noticed that you\b/gi, "you're"],
    [/\bI noticed you're\b/gi, "you're"],
    [/\bI must say\b/gi, ''],
    [/\bI had to reach out\b/gi, 'had to message you'],
    [/\bdelve into\b/gi, 'get into'],
    [/\bI'm intrigued by\b/gi, 'cool that you'],
    [/\bIt's fascinating\b/gi, ''],
    [/\bI find it interesting\b/gi, ''],
    [/\bI would love to\b/gi, "I'd love to"],
    [/\bFurthermore,?\s*/gi, ''],
    [/\bAdditionally,?\s*/gi, ''],
    [/\bIn conclusion,?\s*/gi, ''],
  ];
  for (const [pattern, replacement] of aiTells) {
    s = s.replace(pattern, replacement);
  }

  s = s.replace(/;+/g, '.');
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/,{2,}/g, ',');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([,.!?])/g, '$1');
  s = s.replace(/([!?])\s*\./g, '$1');
  s = s.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`);
  s = s.trim();

  if (s && s[0] === s[0].toLowerCase() && /^[a-z]/.test(s)) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }

  return s;
}

function sanitizeIcebreakers(list) {
  return (list || []).map(humanizeChatMessage).filter(Boolean);
}

/** Varied fallback when OpenAI is unavailable — picks different templates each call. */
export function buildVariedHeuristicIcebreakers(other, avoid = []) {
  const avoidSet = new Set(avoid.map((s) => String(s).toLowerCase().trim()));
  const candidates = [];

  for (const template of HEURISTIC_ICEBREAKER_POOL) {
    const question = typeof template === 'function' ? template(other) : template;
    if (!question) continue;
    const normalized = String(question).toLowerCase().trim();
    if (!avoidSet.has(normalized)) candidates.push(question);
  }

  const picked = shuffleArray(candidates).slice(0, 3);
  if (picked.length >= 3) {
    return { icebreakers: sanitizeIcebreakers(picked), source: 'heuristic' };
  }

  const defaults = buildDefaultIcebreakers(other).filter(
    (q) => !avoidSet.has(String(q).toLowerCase().trim())
  );
  const merged = sanitizeIcebreakers([...new Set([...picked, ...defaults])]).slice(0, 3);
  return {
    icebreakers: merged.length ? merged : buildDefaultIcebreakers(other),
    source: 'heuristic',
  };
}

function formatUserBlock(label, snapshot) {
  const lines = [
    `${label}`,
    `Age: ${snapshot.age ?? '—'}`,
    `Interests: ${(snapshot.interests || []).join(', ') || '—'}`,
    `Relationship goal: ${snapshot.relationshipGoal || '—'}`,
    `Personality: ${normalizeList(snapshot.personality).join(', ') || '—'}`,
    `Communication: ${snapshot.communicationStyle || '—'}`,
    `Love language: ${snapshot.loveLanguage || '—'}`,
    `Pets: ${snapshot.pets || '—'}`,
    `Smoking: ${snapshot.smoking || '—'}`,
    `Drinking: ${snapshot.drinking || '—'}`,
    `Location: ${snapshot.location || '—'}`,
    `Bio: ${snapshot.bio ? snapshot.bio.slice(0, 200) : '—'}`,
  ];
  return lines.join('\n');
}

export async function generateAiCompatibility(viewerSnapshot, otherSnapshot) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return computeHeuristicCompatibility(viewerSnapshot, otherSnapshot);
  }

  const prompt = `You are a dating compatibility expert. Compare these two users for a dating app.

${formatUserBlock('User A (viewer)', viewerSnapshot)}

--------------------

${formatUserBlock('User B (profile)', otherSnapshot)}

Return JSON only with this shape:
{
  "score": number (0-100 integer),
  "summary": "one sentence AI summary for the viewer about User B",
  "strengths": ["string", ...],
  "challenges": ["string", ...],
  "icebreakers": ["string", "string", "string"]
}

For icebreakers: write 3 ready-to-send first chat messages for a dating app. Sound like a real person texting on their phone. Short, casual, warm. Reference User B's profile. No dashes of any kind. No polished or robotic phrasing.`;

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[compatibility] OpenAI error:', res.status, errText.slice(0, 300));
      return computeHeuristicCompatibility(viewerSnapshot, otherSnapshot);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed = JSON.parse(content);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));

    return {
      score,
      summary: String(parsed.summary || '').trim() || 'Strong potential match based on your profiles.',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 6) : [],
      challenges: Array.isArray(parsed.challenges) ? parsed.challenges.map(String).slice(0, 4) : [],
      icebreakers: sanitizeIcebreakers(
        Array.isArray(parsed.icebreakers) ? parsed.icebreakers.map(String).slice(0, 3) : []
      ),
      source: 'ai',
    };
  } catch (err) {
    console.error('[compatibility] AI generation failed:', err.message);
    return computeHeuristicCompatibility(viewerSnapshot, otherSnapshot);
  }
}

/** Fresh conversation starters — called on every profile view (not cached long-term). */
export async function generateAiIcebreakers(viewerSnapshot, otherSnapshot, options = {}) {
  const avoid = Array.isArray(options.avoid) ? options.avoid.filter(Boolean) : [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildVariedHeuristicIcebreakers(otherSnapshot, avoid);
  }

  const avoidBlock =
    avoid.length > 0
      ? `\nDo NOT repeat or closely rephrase these previous questions:\n${avoid
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')}`
      : '';

  const prompt = `Write exactly 3 first messages for a dating app chat. User A is messaging User B after matching.

${formatUserBlock('User A (viewer)', viewerSnapshot)}

--------------------

${formatUserBlock('User B (profile)', otherSnapshot)}
${avoidBlock}

Write like a real human texting on their phone. NOT like AI or marketing copy.

Strict rules:
- NO dashes at all (no em dash, en dash, or hyphen used as punctuation)
- NO semicolons or bullet points
- Short and simple. Contractions are fine (you're, what's, I'd)
- Casual dating chat tone. A little flirty is ok. Never crude
- Use Hey or Hi sometimes. Light compliment about their profile is ok
- Ask one simple thing per message. Easy to reply to
- Do NOT use phrases like "I couldn't help but notice", "intriguing", "delve", "furthermore", "I must say"
- Do NOT sound like a template or essay

Good examples (copy this natural style):
- "Hey! Saw you like hiking. What's your favourite trail?"
- "Your bio made me smile. What are you looking for on here?"
- "Coffee or drinks for a first meet?"

Bad examples (never write like this):
- "Hey! Your love for hiking stood out — what's the best trail?"
- "I couldn't help but notice your passion for travel; where's next on your list?"

Return JSON only: { "icebreakers": ["string", "string", "string"] }`;

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write casual dating app texts exactly how real people type on their phone. No dashes. No AI-sounding language. Return valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[compatibility] OpenAI icebreakers error:', res.status, errText.slice(0, 300));
      return buildVariedHeuristicIcebreakers(otherSnapshot, avoid);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI icebreaker response');

    const parsed = JSON.parse(content);
    let icebreakers = sanitizeIcebreakers(
      Array.isArray(parsed.icebreakers)
        ? parsed.icebreakers.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3)
        : []
    );

    if (icebreakers.length < 3) {
      const fallback = buildVariedHeuristicIcebreakers(otherSnapshot, [...avoid, ...icebreakers]);
      while (icebreakers.length < 3 && fallback.icebreakers.length) {
        const next = fallback.icebreakers.find((q) => !icebreakers.includes(q));
        if (!next) break;
        icebreakers.push(next);
      }
    }

    return {
      icebreakers: icebreakers.length ? icebreakers : buildDefaultIcebreakers(otherSnapshot),
      source: 'ai',
    };
  } catch (err) {
    console.error('[compatibility] AI icebreakers failed:', err.message);
    return buildVariedHeuristicIcebreakers(otherSnapshot, avoid);
  }
}

export async function loadProfileSnapshotForUser(userId) {
  const profile = await Profile.findOne({ where: { userId } });
  return buildProfileSnapshot(profile);
}

export function toApiPayload(record, viewerId, otherUserId) {
  if (!record) return null;
  return {
    otherUserId,
    score: record.score,
    summary: record.summary,
    strengths: record.strengths || [],
    challenges: record.challenges || [],
    icebreakers: record.icebreakers || [],
    source: record.source,
    cached: true,
    generatedAt: record.updatedAt || record.createdAt,
  };
}

export function heuristicPayload(heuristic, otherUserId) {
  return {
    otherUserId,
    score: heuristic.score,
    summary: heuristic.summary,
    strengths: heuristic.strengths,
    challenges: heuristic.challenges,
    icebreakers: heuristic.icebreakers,
    source: heuristic.source,
    cached: false,
  };
}
