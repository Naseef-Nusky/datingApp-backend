/**
 * Google Cloud Translation API v2 (Basic) - server-side only.
 * Set GOOGLE_TRANSLATE_API_KEY in .env (from Google Cloud Console, enable Cloud Translation API).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BATCH_SIZE = 128;
const cache = new Map();

function flattenValues(obj, out = []) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj === 'string') {
    out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v) => flattenValues(v, out));
    return out;
  }
  if (typeof obj === 'object') {
    Object.keys(obj).sort().forEach((k) => flattenValues(obj[k], out));
    return out;
  }
  return out;
}

function unflattenValues(obj, values, indexRef = { i: 0 }) {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === 'string') {
    return values[indexRef.i++] ?? obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => unflattenValues(v, values, indexRef));
  }
  if (typeof obj === 'object') {
    const result = {};
    Object.keys(obj).sort().forEach((k) => {
      result[k] = unflattenValues(obj[k], values, indexRef);
    });
    return result;
  }
  return obj;
}

async function translateBatch(texts, target, apiKey) {
  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        target: target === 'en-uk' ? 'en' : target,
        format: 'text',
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Translate API: ${res.status} ${err}`);
  }
  const data = await res.json();
  return (data.data?.translations || []).map((t) => t.translatedText || '');
}

/**
 * Translate an array of text strings to the target language (Google Cloud Translation API).
 * Used by POST /api/translate for whole-page translation.
 */
export async function translateTexts(texts, target) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return [];
  }
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_TRANSLATE_API_KEY not set.');
    return texts;
  }
  const targetLang = target === 'en-uk' ? 'en' : (target || 'en');
  if (targetLang === 'en') return texts;

  const filtered = texts.map((t) => (typeof t === 'string' && t.trim() ? t : ''));
  const results = [];
  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(batch, targetLang, apiKey);
    results.push(...translated);
  }
  return results;
}

export async function translateLocale(targetLang) {
  if (targetLang === 'en' || targetLang === 'en-uk') {
    return getSourceLocale();
  }
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_TRANSLATE_API_KEY not set; returning English.');
    return getSourceLocale();
  }
  if (cache.has(targetLang)) {
    return cache.get(targetLang);
  }
  const source = getSourceLocale();
  const flat = flattenValues(source);
  if (flat.length === 0) return source;
  const translated = [];
  for (let i = 0; i < flat.length; i += BATCH_SIZE) {
    const batch = flat.slice(i, i + BATCH_SIZE);
    const batchTranslated = await translateBatch(batch, targetLang, apiKey);
    translated.push(...batchTranslated);
  }
  const result = unflattenValues(source, translated);
  cache.set(targetLang, result);
  return result;
}

function getSourceLocale() {
  const p = path.join(__dirname, '..', 'locales', 'en.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}
