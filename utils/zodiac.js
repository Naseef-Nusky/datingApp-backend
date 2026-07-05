const ZODIAC_BOUNDARIES = [
  { sign: 'Capricorn', start: [12, 22], end: [1, 19] },
  { sign: 'Aquarius', start: [1, 20], end: [2, 18] },
  { sign: 'Pisces', start: [2, 19], end: [3, 20] },
  { sign: 'Aries', start: [3, 21], end: [4, 19] },
  { sign: 'Taurus', start: [4, 20], end: [5, 20] },
  { sign: 'Gemini', start: [5, 21], end: [6, 20] },
  { sign: 'Cancer', start: [6, 21], end: [7, 22] },
  { sign: 'Leo', start: [7, 23], end: [8, 22] },
  { sign: 'Virgo', start: [8, 23], end: [9, 22] },
  { sign: 'Libra', start: [9, 23], end: [10, 22] },
  { sign: 'Scorpio', start: [10, 23], end: [11, 21] },
  { sign: 'Sagittarius', start: [11, 22], end: [12, 21] },
];

export function parseMonthDay(input) {
  if (!input) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { month: input.getUTCMonth() + 1, day: input.getUTCDate() };
  }

  const raw = String(input).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return { month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
  }

  match = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return { month: parseInt(match[1], 10), day: parseInt(match[2], 10) };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return { month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate() };
  }

  return null;
}

function inRange(month, day, startMonth, startDay, endMonth, endDay) {
  if (startMonth === endMonth) {
    return month === startMonth && day >= startDay && day <= endDay;
  }
  if (startMonth < endMonth) {
    return (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay) ||
      (month > startMonth && month < endMonth)
    );
  }
  return (
    (month === startMonth && day >= startDay) ||
    (month === endMonth && day <= endDay) ||
    month > startMonth ||
    month < endMonth
  );
}

export function getZodiacSignFromMonthDay(month, day) {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  for (const item of ZODIAC_BOUNDARIES) {
    if (inRange(month, day, item.start[0], item.start[1], item.end[0], item.end[1])) {
      return item.sign;
    }
  }
  return null;
}

export function getZodiacFromBirthDate(lifestyle) {
  if (!lifestyle || typeof lifestyle !== 'object') return null;
  const birthDateSource =
    lifestyle.birthDate ||
    lifestyle.dateOfBirth ||
    lifestyle.dob ||
    lifestyle.birthday;
  const monthDay = parseMonthDay(birthDateSource);
  if (!monthDay) return null;
  return getZodiacSignFromMonthDay(monthDay.month, monthDay.day);
}

export function normalizeZodiacKey(value) {
  const base = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z]/g, '');
  const aliases = {
    arian: 'aries',
    capricon: 'capricorn',
  };
  return aliases[base] || base;
}

/** Prefer stored zodiac; otherwise derive from birthday fields. */
export function resolveZodiacSign(lifestyle) {
  if (!lifestyle || typeof lifestyle !== 'object') return null;
  if (lifestyle.zodiac) return String(lifestyle.zodiac);
  return getZodiacFromBirthDate(lifestyle);
}

/** Merge computed zodiac into lifestyle for API responses / saves. */
export function enrichLifestyle(lifestyle) {
  if (!lifestyle || typeof lifestyle !== 'object' || Array.isArray(lifestyle)) {
    return lifestyle || {};
  }
  const zodiac = resolveZodiacSign(lifestyle);
  if (!zodiac) return { ...lifestyle };
  return { ...lifestyle, zodiac };
}

export function applyZodiacToLifestyle(lifestyle) {
  return enrichLifestyle(lifestyle);
}
